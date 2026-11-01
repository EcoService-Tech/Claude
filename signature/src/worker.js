// Serveur de signature à distance : enregistre les documents, les signatures et le journal de preuve.
// Tout le travail lourd sur les PDF se fait dans le navigateur ; ici on stocke, on horodate et on trace.

const MAX_PDF = 20 * 1024 * 1024;
const MAX_PNG = 600 * 1024;
const MAX_LOGO = 1024 * 1024;

const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {"content-type": "application/json; charset=utf-8", "cache-control": "no-store"}});
const err = (status, message) => json({error: message}, status);
const now = () => new Date().toISOString();
const randomId = (bytes = 16) => [...crypto.getRandomValues(new Uint8Array(bytes))].map(b => b.toString(16).padStart(2, "0")).join("");
const sha256 = async buf => [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map(b => b.toString(16).padStart(2, "0")).join("");

function client(req) {
  const cf = req.cf || {};
  return {ip: req.headers.get("cf-connecting-ip") || "", country: cf.country || "", city: cf.city || "", ua: (req.headers.get("user-agent") || "").slice(0, 400)};
}
async function logEvent(env, req, requestId, signerId, type, detail) {
  const c = req ? client(req) : {ip: "", country: "", ua: ""};
  await env.DB.prepare("INSERT INTO events (request_id, signer_id, type, at, ip, country, user_agent, detail) VALUES (?,?,?,?,?,?,?,?)")
    .bind(requestId, signerId, type, now(), c.ip, c.country, c.ua, detail ? JSON.stringify(detail) : null).run();
}
function timingSafeEqual(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
function isAdmin(req, env) {
  const h = req.headers.get("authorization") || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  return !!env.ADMIN_TOKEN && t.length > 0 && timingSafeEqual(t, env.ADMIN_TOKEN);
}
async function readBody(req, max) {
  const len = +req.headers.get("content-length") || 0;
  if (len > max) return null;
  const buf = await req.arrayBuffer();
  return buf.byteLength > max || buf.byteLength === 0 ? null : buf;
}
const parse = s => { try { return JSON.parse(s); } catch { return null; } };
const isPdf = buf => { const b = new Uint8Array(buf, 0, 5); return String.fromCharCode(...b) === "%PDF-"; };
const isPng = buf => { const b = new Uint8Array(buf, 0, 8); return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47; };
const isJpg = buf => { const b = new Uint8Array(buf, 0, 3); return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff; };
function b64ToBytes(s) { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
const pdfResponse = (body, name) => new Response(body, {headers: {"content-type": "application/pdf", "content-disposition": `inline; filename="${encodeURIComponent(name)}"`, "cache-control": "no-store"}});

async function getSetting(env, key) { const r = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first(); return r ? parse(r.value) : null; }
async function setSetting(env, key, value) { await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, JSON.stringify(value)).run(); }
const publicProfile = p => p ? {company: p.company || "", city: p.city || "", color: p.color || "#2340c9", hasLogo: !!p.hasLogo} : {company: "", city: "", color: "#2340c9", hasLogo: false};


// ---------------- emails ----------------
// Fournisseur au choix : Resend ou Brevo (formules gratuites). Secrets : EMAIL_PROVIDER, EMAIL_API_KEY, EMAIL_FROM ("Nom <adresse>").
const emailReady = env => !!(env.EMAIL_API_KEY && env.EMAIL_FROM && ["resend", "brevo"].includes((env.EMAIL_PROVIDER || "resend").toLowerCase()));
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
function parseFrom(from) { const m = String(from).match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/); return m ? {name: m[1].replace(/^"|"$/g, ""), email: m[2]} : {name: "", email: String(from).trim()}; }

async function sendEmail(env, {to, toName, subject, html, text, replyTo, attachments = []}) {
  if (!emailReady(env)) return {ok: false, error: "Envoi d'emails non configuré."};
  const provider = (env.EMAIL_PROVIDER || "resend").toLowerCase(), from = parseFrom(env.EMAIL_FROM);
  let r;
  if (provider === "brevo") {
    r = await fetch(env.EMAIL_API_URL || "https://api.brevo.com/v3/smtp/email", {method: "POST", headers: {"api-key": env.EMAIL_API_KEY, "content-type": "application/json", accept: "application/json"},
      body: JSON.stringify({sender: {name: from.name || undefined, email: from.email}, to: [{email: to, name: toName || undefined}], subject, htmlContent: html, textContent: text,
        replyTo: replyTo ? {email: replyTo} : undefined, attachment: attachments.length ? attachments.map(a => ({url: a.url, name: a.filename})) : undefined})});
  } else {
    r = await fetch(env.EMAIL_API_URL || "https://api.resend.com/emails", {method: "POST", headers: {authorization: "Bearer " + env.EMAIL_API_KEY, "content-type": "application/json"},
      body: JSON.stringify({from: env.EMAIL_FROM, to: [to], subject, html, text, reply_to: replyTo || undefined, attachments: attachments.length ? attachments.map(a => ({path: a.url, filename: a.filename})) : undefined})});
  }
  if (r.ok) { const d = await r.json().catch(() => ({})); return {ok: true, id: d.id || d.messageId || ""}; }
  return {ok: false, error: `${provider} ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`};
}

function mailLayout(profile, {title, intro, button, buttonUrl, after = "", small = ""}) {
  const color = /^#[0-9a-f]{6}$/i.test(profile.color || "") ? profile.color : "#2340c9", company = esc(profile.company || "");
  const html = `<!doctype html><html><body style="margin:0;background:#f3f5f8;font-family:Helvetica,Arial,sans-serif;color:#141a26">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:${color};color:#ffffff;padding:16px 24px;font-size:16px;font-weight:bold">${company || "Signature électronique"}</td></tr>
<tr><td style="padding:24px">
<h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 20px">${intro}</p>
${button ? `<p style="margin:0 0 20px"><a href="${esc(buttonUrl)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">${esc(button)}</a></p>
<p style="font-size:12px;color:#5a6578;margin:0 0 16px;word-break:break-all">Si le bouton ne marche pas, copie ce lien : ${esc(buttonUrl)}</p>` : ""}
${after}
${small ? `<p style="font-size:12px;color:#5a6578;line-height:1.5;margin:16px 0 0">${small}</p>` : ""}
</td></tr>
<tr><td style="padding:14px 24px;background:#e8ecf2;font-size:11px;color:#5a6578">${[company, esc(profile.address), esc(profile.city), profile.taxId ? "CIF " + esc(profile.taxId) : ""].filter(Boolean).join(" · ")}</td></tr>
</table></td></tr></table></body></html>`;
  return html;
}
const plain = html => html.replace(/<br\s*\/?>/g, "\n").replace(/<\/p>/g, "\n\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\n{3,}/g, "\n\n").trim();

async function mailAndLog(env, requestId, signerId, kind, msg) {
  const res = await sendEmail(env, msg).catch(e => ({ok: false, error: String(e).slice(0, 200)}));
  await logEvent(env, null, requestId, signerId, res.ok ? "email_sent" : "email_failed", {kind, to: msg.to, id: res.id, error: res.error});
  return res;
}

async function sendInvite(env, base, requestId, signer) {
  const p = (await getSetting(env, "profile")) || {};
  const r = await env.DB.prepare("SELECT title FROM requests WHERE id = ?").bind(requestId).first();
  if (!signer.email) return;
  const link = new URL(`/s/${signer.token}`, base).href;
  const html = mailLayout(p, {title: "Document à signer",
    intro: `Bonjour ${esc(signer.name)},<br><br>${esc(p.company || "Nous")} vous invite à signer électroniquement le document « <b>${esc(r.title)}</b> ». Lisez-le en entier puis signez depuis votre téléphone ou votre ordinateur. Cela prend une minute.`,
    button: "Lire et signer le document", buttonUrl: link,
    small: "Ce lien est personnel : ne le transférez pas. Une fois que toutes les parties auront signé, vous recevrez automatiquement le document signé par email."});
  await mailAndLog(env, requestId, signer.id, "invitation", {to: signer.email, toName: signer.name, subject: `Document à signer : ${r.title}`, html, text: plain(html), replyTo: p.email || undefined});
}

async function notifyOwnerSigned(env, base, s, declaredName) {
  const p = (await getSetting(env, "profile")) || {};
  const to = env.OWNER_EMAIL || p.email; if (!to) return;
  const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM signers WHERE request_id = ? AND status != 'signed'").bind(s.request_id).first();
  const all = left.n === 0;
  const html = mailLayout(p, {title: all ? "Tout le monde a signé" : `${declaredName} a signé`,
    intro: `<b>${esc(declaredName)}</b>${s.role ? " (" + esc(s.role) + ")" : ""} vient de signer « <b>${esc(s.title)}</b> ».<br><br>` +
      (all ? "Toutes les signatures sont réunies. Finalise le document pour y apposer ton cachet et ton sceau : chaque signataire recevra alors automatiquement sa copie." : `Encore ${left.n} signature${left.n > 1 ? "s" : ""} en attente.`),
    button: all ? "Finaliser le document" : "Voir le suivi", buttonUrl: new URL("/admin.html", base).href});
  await mailAndLog(env, s.request_id, s.id, "owner_signed", {to, subject: all ? `À finaliser : ${s.title}` : `${declaredName} a signé : ${s.title}`, html, text: plain(html)});
}

async function sendFinal(env, base, requestId) {
  const p = (await getSetting(env, "profile")) || {};
  const r = await env.DB.prepare("SELECT * FROM requests WHERE id = ?").bind(requestId).first();
  const {results: signers} = await env.DB.prepare("SELECT * FROM signers WHERE request_id = ? ORDER BY position").bind(requestId).all();
  const fileName = r.file_name.replace(/\.pdf$/i, "") + "-signe.pdf";
  const after = `<p style="font-size:13px;line-height:1.5;margin:0 0 8px">Le PDF joint contient le document signé par toutes les parties, le cachet de ${esc(p.company || "l'entreprise")} et le <b>certificat de signature</b> (identités, dates et heures, journal de preuve). Il est scellé électroniquement : toute modification ultérieure serait détectée.</p>
<p style="font-size:12px;color:#5a6578;margin:0;word-break:break-all">Dossier ${esc(r.id)} · Empreinte SHA-256 : ${esc(r.final_hash)}</p>`;
  for (const s of signers) {
    if (!s.email) continue;
    const link = new URL(`/s/${s.token}`, base).href;
    const html = mailLayout(p, {title: "Votre document signé",
      intro: `Bonjour ${esc(s.declared_name || s.name)},<br><br>Le document « <b>${esc(r.title)}</b> » a été signé par toutes les parties. Vous le trouverez en pièce jointe. Conservez cet email.`,
      button: "Télécharger le document signé", buttonUrl: link, after});
    await mailAndLog(env, requestId, s.id, "final_copy", {to: s.email, toName: s.name, subject: `Document signé : ${r.title}`, html, text: plain(html), replyTo: p.email || undefined,
      attachments: [{filename: fileName, url: new URL(`/api/s/${s.token}/pdf?src=mail`, base).href}]});
  }
  const to = env.OWNER_EMAIL || p.email;
  if (to) {
    const html = mailLayout(p, {title: "Document finalisé", intro: `« <b>${esc(r.title)}</b> » est finalisé et a été envoyé à ${signers.filter(s => s.email).length} signataire(s). Ta copie est jointe.`, after});
    const owner = signers.find(s => s.email) || signers[0];
    await mailAndLog(env, requestId, null, "final_copy_owner", {to, subject: `Archivé : ${r.title}`, html, text: plain(html), attachments: owner ? [{filename: fileName, url: new URL(`/api/s/${owner.token}/pdf?src=mail`, base).href}] : []});
  }
}

// ---------------- signataire ----------------
async function signerByToken(env, token) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  return env.DB.prepare("SELECT s.*, r.title, r.file_name, r.status AS request_status, r.original_hash, r.final_hash FROM signers s JOIN requests r ON r.id = s.request_id WHERE s.token = ?").bind(token).first();
}

async function handleSigner(req, env, parts, url, ctx) {
  const [token, action] = parts;
  const s = await signerByToken(env, token);
  if (!s || s.request_status === "cancelled" || s.request_status === "draft") return err(404, "Lien de signature introuvable ou expiré.");

  if (req.method === "GET" && !action) {
    if (!s.first_opened_at) {
      await env.DB.prepare("UPDATE signers SET first_opened_at = ? WHERE id = ? AND first_opened_at IS NULL").bind(now(), s.id).run();
      await logEvent(env, req, s.request_id, s.id, "opened");
    }
    const profile = publicProfile(await getSetting(env, "profile"));
    return json({title: s.title, fileName: s.file_name, profile, status: s.request_status, originalHash: s.original_hash, finalHash: s.final_hash,
      signer: {name: s.name, role: s.role, email: s.email, status: s.status, signedAt: s.signed_at, placements: parse(s.placements) || []}});
  }
  if (req.method === "GET" && action === "pdf") {
    const key = s.request_status === "final" ? `pdf:${s.request_id}:final` : `pdf:${s.request_id}:original`;
    const body = await env.FILES.get(key, "arrayBuffer");
    if (!body) return err(404, "Document introuvable.");
    if (s.request_status === "final" && url.searchParams.get("src") !== "mail") await logEvent(env, req, s.request_id, s.id, "downloaded_final");
    return pdfResponse(body, s.file_name);
  }
  if (req.method === "POST" && action === "viewed") {
    const d = parse(await req.text()) || {};
    await logEvent(env, req, s.request_id, s.id, "read", {pages: +d.pages || null, seconds: +d.seconds || null});
    return json({ok: true});
  }
  if (req.method === "POST" && action === "sign") {
    if (s.status === "signed") return err(409, "Ce document a déjà été signé avec ce lien.");
    if (s.request_status !== "pending") return err(409, "Ce document n'attend plus de signature.");
    const raw = await readBody(req, MAX_PNG * 1.4 + 20000);
    if (!raw) return err(413, "Signature trop volumineuse.");
    const d = parse(new TextDecoder().decode(raw));
    if (!d) return err(400, "Requête invalide.");
    const declaredName = String(d.name || "").trim().slice(0, 120);
    const declaredId = String(d.idNumber || "").trim().slice(0, 40);
    if (!declaredName) return err(400, "Indique ton nom complet.");
    if (d.consent !== true || !d.consentText) return err(400, "Le consentement est obligatoire.");
    if (d.documentHash !== s.original_hash) return err(409, "Le document a changé depuis son ouverture. Recharge la page.");
    let png;
    try { png = b64ToBytes(String(d.signature || "").replace(/^data:image\/png;base64,/, "")); } catch { return err(400, "Signature illisible."); }
    if (!png.byteLength || png.byteLength > MAX_PNG || !isPng(png.buffer)) return err(400, "Signature illisible.");
    const c = client(req), at = now();
    await env.FILES.put(`sig:${s.id}`, png);
    const res = await env.DB.prepare(`UPDATE signers SET status = 'signed', signed_at = ?, consent_at = ?, consent_text = ?, declared_name = ?, declared_id = ?, method = ?,
      ip = ?, country = ?, city = ?, user_agent = ? WHERE id = ? AND status = 'waiting'`)
      .bind(at, d.consentAt && !isNaN(Date.parse(d.consentAt)) ? d.consentAt : at, String(d.consentText).slice(0, 1000), declaredName, declaredId,
        d.method === "type" ? "type" : "draw", c.ip, c.country, c.city, c.ua, s.id).run();
    if (!res.meta.changes) return err(409, "Ce document a déjà été signé avec ce lien.");
    await logEvent(env, req, s.request_id, s.id, "signed", {name: declaredName, idNumber: declaredId, signatureSha256: await sha256(png), documentSha256: s.original_hash});
    ctx.waitUntil(notifyOwnerSigned(env, url, s, declaredName));
    return json({ok: true, signedAt: at});
  }
  return err(405, "Action non prise en charge.");
}

// ---------------- administration ----------------
async function requestDetail(env, id) {
  const r = await env.DB.prepare("SELECT * FROM requests WHERE id = ?").bind(id).first();
  if (!r) return null;
  const {results: signers} = await env.DB.prepare("SELECT * FROM signers WHERE request_id = ? ORDER BY position").bind(id).all();
  const {results: events} = await env.DB.prepare("SELECT * FROM events WHERE request_id = ? ORDER BY id").bind(id).all();
  return {...r, stamps: parse(r.stamps) || [], signers: signers.map(s => ({...s, placements: parse(s.placements) || []})), events};
}

async function handleAdmin(req, env, parts, url, ctx) {
  if (!isAdmin(req, env)) return err(401, "Code d'accès incorrect.");
  const [res, id, sub] = parts;

  if (res === "check") return json({ok: true});

  if (res === "settings") {
    if (req.method === "GET") {
      const p = await getSetting(env, "profile");
      const seal = await getSetting(env, "seal");
      return json({profile: p || {}, seal, email: {configured: emailReady(env), provider: (env.EMAIL_PROVIDER || "resend").toLowerCase(), from: env.EMAIL_FROM || "", ownerEmail: env.OWNER_EMAIL || (p && p.email) || ""}});
    }
    if (req.method === "PUT") {
      const d = parse(await req.text()); if (!d) return err(400, "Requête invalide.");
      const prev = (await getSetting(env, "profile")) || {};
      const clean = {company: "", taxId: "", address: "", city: "", country: "ES", email: "", phone: "", color: "#2340c9", stampText: ""};
      for (const k of Object.keys(clean)) if (d[k] != null) clean[k] = String(d[k]).slice(0, 200);
      clean.hasLogo = !!prev.hasLogo;
      await setSetting(env, "profile", clean);
      return json({ok: true, profile: clean});
    }
  }
  if (res === "logo") {
    if (req.method === "PUT") {
      const buf = await readBody(req, MAX_LOGO); if (!buf || !(isPng(buf) || isJpg(buf))) return err(400, "Logo PNG ou JPG de moins de 1 Mo.");
      await env.FILES.put("logo", buf, {metadata: {type: isPng(buf) ? "image/png" : "image/jpeg"}});
      const p = (await getSetting(env, "profile")) || {}; p.hasLogo = true; await setSetting(env, "profile", p);
      return json({ok: true});
    }
    if (req.method === "DELETE") {
      await env.FILES.delete("logo"); const p = (await getSetting(env, "profile")) || {}; p.hasLogo = false; await setSetting(env, "profile", p);
      return json({ok: true});
    }
  }
  if (res === "seal") {
    // Le certificat est stocké chiffré (fichier .p12 protégé par mot de passe) : le serveur ne connaît jamais le mot de passe.
    if (req.method === "GET") {
      const buf = await env.FILES.get("seal:p12", "arrayBuffer");
      return buf ? new Response(buf, {headers: {"content-type": "application/x-pkcs12", "cache-control": "no-store"}}) : err(404, "Aucun sceau configuré.");
    }
    if (req.method === "PUT") {
      const buf = await readBody(req, 64 * 1024); if (!buf) return err(400, "Fichier de sceau invalide.");
      const info = parse(decodeURIComponent(req.headers.get("x-seal-info") || "")) || {};
      await env.FILES.put("seal:p12", buf);
      await setSetting(env, "seal", {org: String(info.org || "").slice(0, 200), fingerprint: String(info.fingerprint || "").slice(0, 64), notAfter: String(info.notAfter || "").slice(0, 40), installedAt: now()});
      return json({ok: true});
    }
  }

  if (res === "test-email" && req.method === "POST") {
    const p = (await getSetting(env, "profile")) || {}, to = env.OWNER_EMAIL || p.email;
    if (!emailReady(env)) return err(400, "L'envoi d'emails n'est pas configuré sur le serveur.");
    if (!to) return err(400, "Indique ton email de contact dans « Mon entreprise » et enregistre.");
    const html = mailLayout(p, {title: "Test réussi", intro: "Les emails automatiques fonctionnent. Tu recevras un message à chaque signature."});
    const r = await sendEmail(env, {to, subject: "Test des emails automatiques", html, text: plain(html)});
    return r.ok ? json({ok: true, to}) : err(502, "Échec de l'envoi : " + r.error);
  }
  if (res === "requests" && !id) {
    if (req.method === "GET") {
      const {results} = await env.DB.prepare(`SELECT r.id, r.title, r.status, r.created_at, r.finalized_at,
        (SELECT COUNT(*) FROM signers s WHERE s.request_id = r.id) AS total,
        (SELECT COUNT(*) FROM signers s WHERE s.request_id = r.id AND s.status = 'signed') AS signed
        FROM requests r WHERE r.status != 'draft' ORDER BY r.created_at DESC LIMIT 200`).all();
      return json({requests: results});
    }
    if (req.method === "POST") {
      const d = parse(await req.text()); if (!d) return err(400, "Requête invalide.");
      const title = String(d.title || "").trim().slice(0, 160), fileName = String(d.fileName || "document.pdf").slice(0, 160);
      const signers = Array.isArray(d.signers) ? d.signers.slice(0, 10) : [];
      if (!title) return err(400, "Donne un titre au document.");
      if (!signers.length) return err(400, "Ajoute au moins un signataire.");
      for (const s of signers) if (!String(s.name || "").trim()) return err(400, "Chaque signataire a besoin d'un nom.");
      for (const s of signers) if (!Array.isArray(s.placements) || !s.placements.length) return err(400, `Place la signature de ${s.name} sur le document.`);
      const rid = randomId(8);
      const stmts = [env.DB.prepare("INSERT INTO requests (id, title, file_name, created_at, status, stamps) VALUES (?,?,?,?, 'draft', ?)")
        .bind(rid, title, fileName, now(), JSON.stringify(Array.isArray(d.stamps) ? d.stamps.slice(0, 20) : []))];
      const links = [];
      signers.forEach((s, i) => {
        const sid = randomId(8), token = randomId(24);
        links.push({id: sid, name: s.name, token});
        stmts.push(env.DB.prepare("INSERT INTO signers (id, request_id, position, name, email, phone, role, token, placements) VALUES (?,?,?,?,?,?,?,?,?)")
          .bind(sid, rid, i, String(s.name).trim().slice(0, 120), String(s.email || "").slice(0, 160), String(s.phone || "").slice(0, 40), String(s.role || "").slice(0, 60), token, JSON.stringify(s.placements.slice(0, 20))));
      });
      await env.DB.batch(stmts);
      return json({id: rid, signers: links});
    }
  }
  if (res === "requests" && id) {
    const r = await env.DB.prepare("SELECT * FROM requests WHERE id = ?").bind(id).first();
    if (!r) return err(404, "Document introuvable.");
    if (sub === "original" && req.method === "PUT") {
      if (r.status !== "draft") return err(409, "Le document original ne peut plus être changé.");
      const buf = await readBody(req, MAX_PDF); if (!buf || !isPdf(buf)) return err(400, "PDF de moins de 20 Mo attendu.");
      const hash = await sha256(buf);
      await env.FILES.put(`pdf:${id}:original`, buf);
      await env.DB.prepare("UPDATE requests SET status = 'pending', original_hash = ?, original_size = ? WHERE id = ?").bind(hash, buf.byteLength, id).run();
      await logEvent(env, req, id, null, "created", {sha256: hash, size: buf.byteLength});
      if (emailReady(env)) {
        const {results} = await env.DB.prepare("SELECT * FROM signers WHERE request_id = ? ORDER BY position").bind(id).all();
        ctx.waitUntil((async () => { for (const sg of results) await sendInvite(env, url, id, sg); })());
      }
      return json({ok: true, hash, emailed: emailReady(env)});
    }
    if (sub === "original" && req.method === "GET") {
      const buf = await env.FILES.get(`pdf:${id}:original`, "arrayBuffer"); return buf ? pdfResponse(buf, r.file_name) : err(404, "Introuvable.");
    }
    if (sub === "final" && req.method === "GET") {
      const buf = await env.FILES.get(`pdf:${id}:final`, "arrayBuffer"); return buf ? pdfResponse(buf, r.file_name) : err(404, "Pas encore finalisé.");
    }
    if (sub === "final" && req.method === "PUT") {
      if (r.status !== "pending") return err(409, "Ce document est déjà finalisé ou annulé.");
      const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM signers WHERE request_id = ? AND status != 'signed'").bind(id).first();
      if (left.n > 0) return err(409, "Tous les signataires n'ont pas encore signé.");
      const buf = await readBody(req, MAX_PDF + 2 * 1024 * 1024); if (!buf || !isPdf(buf)) return err(400, "PDF attendu.");
      const hash = await sha256(buf), at = now();
      await env.FILES.put(`pdf:${id}:final`, buf);
      await env.DB.prepare("UPDATE requests SET status = 'final', final_hash = ?, finalized_at = ? WHERE id = ?").bind(hash, at, id).run();
      await logEvent(env, req, id, null, "finalized", {sha256: hash, size: buf.byteLength, sealed: req.headers.get("x-sealed") === "1"});
      if (emailReady(env)) ctx.waitUntil(sendFinal(env, url, id));
      return json({ok: true, hash, finalizedAt: at, emailed: emailReady(env)});
    }
    if (sub === "remind" && req.method === "POST") {
      const sid = new URL(req.url).searchParams.get("signer");
      const sg = await env.DB.prepare("SELECT * FROM signers WHERE id = ? AND request_id = ?").bind(sid, id).first();
      if (!sg || !sg.email) return err(400, "Ce signataire n'a pas d'email.");
      if (r.status === "final") { await sendFinal(env, url, id); return json({ok: true}); }
      await sendInvite(env, url, id, sg);
      return json({ok: true});
    }
    if (sub === "cancel" && req.method === "POST") {
      await env.DB.prepare("UPDATE requests SET status = 'cancelled' WHERE id = ? AND status = 'pending'").bind(id).run();
      await logEvent(env, req, id, null, "cancelled");
      return json({ok: true});
    }
    if (!sub && req.method === "GET") {
      const d = await requestDetail(env, id);
      d.signers = d.signers.map(s => ({...s, link: new URL(`/s/${s.token}`, url).href}));
      return json(d);
    }
    if (!sub && req.method === "DELETE") {
      const {results} = await env.DB.prepare("SELECT id FROM signers WHERE request_id = ?").bind(id).all();
      await Promise.all([env.FILES.delete(`pdf:${id}:original`), env.FILES.delete(`pdf:${id}:final`), ...results.map(s => env.FILES.delete(`sig:${s.id}`))]);
      await env.DB.batch([env.DB.prepare("DELETE FROM events WHERE request_id = ?").bind(id), env.DB.prepare("DELETE FROM signers WHERE request_id = ?").bind(id), env.DB.prepare("DELETE FROM requests WHERE id = ?").bind(id)]);
      return json({ok: true});
    }
  }
  if (res === "signature" && id && req.method === "GET") {
    const buf = await env.FILES.get(`sig:${id}`, "arrayBuffer");
    return buf ? new Response(buf, {headers: {"content-type": "image/png", "cache-control": "no-store"}}) : err(404, "Introuvable.");
  }
  return err(404, "Route inconnue.");
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    try {
      if (parts[0] === "s" && parts.length === 2 && req.method === "GET") {
        // page de signature : même page pour tous les liens, le jeton est lu dans l'adresse
        return env.ASSETS.fetch(new Request(new URL("/signer", url), req));
      }
      if (parts[0] !== "api") return env.ASSETS.fetch(req);
      if (parts[1] === "logo" && req.method === "GET") {
        const r = await env.FILES.getWithMetadata("logo", "arrayBuffer");
        return r.value ? new Response(r.value, {headers: {"content-type": r.metadata?.type || "image/png", "cache-control": "public, max-age=300"}}) : err(404, "Pas de logo.");
      }
      if (parts[1] === "s" && parts[2]) return await handleSigner(req, env, parts.slice(2), url, ctx);
      if (parts[1] === "admin") return await handleAdmin(req, env, parts.slice(2), url, ctx);
      return err(404, "Route inconnue.");
    } catch (e) {
      console.error(e);
      return err(500, "Erreur du serveur. Réessaie dans un instant.");
    }
  }
};
