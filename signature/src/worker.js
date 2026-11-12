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

async function sendInvite(env, base, requestId, signer, reminder = false) {
  const p = (await getSetting(env, "profile")) || {};
  const r = await env.DB.prepare("SELECT title, documents FROM requests WHERE id = ?").bind(requestId).first();
  if (!signer.email || signer.onsite) return;
  const docs = parse(r.documents) || [];
  const docList = docs.length > 1 ? `<br><br>Documents à signer :<br>${docs.map(x => "• " + esc(x.name)).join("<br>")}` : "";
  const link = new URL(`/s/${signer.token}`, base).href;
  const html = mailLayout(p, {title: reminder ? "Rappel : document en attente de signature" : "Document à signer",
    intro: `Bonjour ${esc(signer.name)},<br><br>${esc(p.company || "Nous")} vous invite à signer électroniquement ${docs.length > 1 ? "le dossier" : "le document"} « <b>${esc(r.title)}</b> ».${docList}<br><br>Lisez tout puis signez depuis votre téléphone ou votre ordinateur. Cela prend une minute.`,
    button: "Lire et signer le document", buttonUrl: link,
    small: "Ce lien est personnel : ne le transférez pas. Une fois que toutes les parties auront signé, vous recevrez automatiquement le document signé par email."});
  await mailAndLog(env, requestId, signer.id, reminder ? "reminder" : "invitation", {to: signer.email, toName: signer.name, subject: `${reminder ? "Rappel" : "Document à signer"} : ${r.title}`, html, text: plain(html), replyTo: p.email || undefined});
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

async function notifyOwnerDeclined(env, base, s, reason) {
  const p = (await getSetting(env, "profile")) || {};
  const to = env.OWNER_EMAIL || p.email; if (!to || !emailReady(env)) return;
  const html = mailLayout(p, {title: `${s.name} refuse de signer`, intro: `<b>${esc(s.name)}</b> a refusé de signer « <b>${esc(s.title)}</b> ».<br><br>Motif : « ${esc(reason)} »<br><br>Tu peux le recontacter, corriger le document et envoyer une nouvelle demande.`,
    button: "Voir la demande", buttonUrl: new URL("/admin.html", base).href});
  await mailAndLog(env, s.request_id, s.id, "owner_declined", {to, subject: `Refus de signature : ${s.title}`, html, text: plain(html)});
}

async function sendFinal(env, base, requestId) {
  const p = (await getSetting(env, "profile")) || {};
  const r = await env.DB.prepare("SELECT * FROM requests WHERE id = ?").bind(requestId).first();
  const {results: signers} = await env.DB.prepare("SELECT * FROM signers WHERE request_id = ? ORDER BY position").bind(requestId).all();
  const fileName = r.file_name.replace(/\.pdf$/i, "") + "-signe.pdf";
  const docs = parse(r.documents) || [];
  const after = (docs.length > 1 ? `<p style="font-size:13px;line-height:1.5;margin:0 0 8px">Documents signés :<br>${docs.map(x => `• ${esc(x.name)} (pages ${x.from} à ${x.to})`).join("<br>")}</p>` : "") + `<p style="font-size:13px;line-height:1.5;margin:0 0 8px">Le PDF joint contient ${docs.length > 1 ? "tous les documents signés" : "le document signé"} par toutes les parties, le cachet de ${esc(p.company || "l'entreprise")} et le <b>certificat de signature</b> (identités, dates et heures, journal de preuve). Il est scellé électroniquement : toute modification ultérieure serait détectée.</p>
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

// ---------------- code de vérification par email ----------------
const maskEmail = e => String(e || "").replace(/^(.)(.*)(.@.*)$/, (m, a, b, c) => a + "•".repeat(Math.min(b.length, 6)) + c);
const needsCode = (env, s) => emailReady(env) && !!s.email && !s.onsite;

async function sendCode(env, req, base, s) {
  if (s.otp_sent_at && Date.now() - Date.parse(s.otp_sent_at) < 45000) return err(429, "Patiente quelques secondes avant de demander un nouveau code.");
  if (s.otp_sends >= 6) return err(429, "Trop de codes demandés. Contacte l'expéditeur du document.");
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
  const at = now(), exp = new Date(Date.now() + 10 * 60000).toISOString();
  await env.DB.prepare("UPDATE signers SET otp_hash = ?, otp_expires_at = ?, otp_sent_at = ?, otp_sends = otp_sends + 1, otp_attempts = 0 WHERE id = ?")
    .bind(await sha256(new TextEncoder().encode(s.id + ":" + code)), exp, at, s.id).run();
  const p = (await getSetting(env, "profile")) || {};
  const html = mailLayout(p, {title: "Ton code de vérification", intro: `Voici le code à saisir pour signer « <b>${esc(s.title)}</b> » :<br><br><span style="font-size:30px;font-weight:bold;letter-spacing:6px">${code}</span><br><br>Il est valable 10 minutes. Si tu n'as rien demandé, ignore ce message.`});
  const res = await mailAndLog(env, s.request_id, s.id, "code", {to: s.email, toName: s.name, subject: `Code de vérification : ${code}`, html, text: plain(html)});
  return res.ok ? json({ok: true, sentTo: maskEmail(s.email)}) : err(502, "L'email n'a pas pu partir. Réessaie dans un instant.");
}

// ---------------- relances automatiques (tâche quotidienne) ----------------
// 1re relance 2 jours après l'envoi, puis tous les 3 jours, 3 relances au maximum.
async function runReminders(env) {
  if (!emailReady(env)) return;
  const base = await getSetting(env, "base_url"); if (!base) return;
  const day = 86400000, t = Date.now();
  const {results} = await env.DB.prepare(`SELECT s.*, r.created_at AS request_created FROM signers s JOIN requests r ON r.id = s.request_id
    WHERE r.status = 'pending' AND s.status = 'waiting' AND s.onsite = 0 AND s.email IS NOT NULL AND s.email != '' AND s.reminders < 3`).all();
  for (const s of results) {
    const last = Date.parse(s.last_reminder_at || s.request_created);
    if (t - last < (s.last_reminder_at ? 3 : 2) * day - 3600000) continue;
    await sendInvite(env, base, s.request_id, s, true);
    await env.DB.prepare("UPDATE signers SET reminders = reminders + 1, last_reminder_at = ? WHERE id = ?").bind(now(), s.id).run();
  }
}

// ---------------- demandes des membres : résiliation et suspension ----------------
const MEMBER_TYPES = {resiliation: "résiliation", suspension: "suspension"};
async function memberCode(env, req, base) {
  const d = parse(await req.text()) || {};
  const email = String(d.email || "").trim().toLowerCase().slice(0, 160);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err(400, "Indique une adresse email valide.");
  if (!emailReady(env)) return err(503, "L'envoi d'emails n'est pas encore activé par l'établissement.");
  const ipKey = "mrate:" + (client(req).ip || "x");
  const count = +(await env.FILES.get(ipKey) || 0); if (count >= 8) return err(429, "Trop de demandes. Réessaie dans une heure.");
  await env.FILES.put(ipKey, String(count + 1), {expirationTtl: 3600});
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
  await env.FILES.put("mcode:" + (await sha256(new TextEncoder().encode(email))), JSON.stringify({h: await sha256(new TextEncoder().encode(email + ":" + code)), tries: 0}), {expirationTtl: 900});
  const p = (await getSetting(env, "profile")) || {};
  const html = mailLayout(p, {title: "Ton code de vérification", intro: `Voici le code pour confirmer ta demande auprès de ${esc(p.company || "l'établissement")} :<br><br><span style="font-size:30px;font-weight:bold;letter-spacing:6px">${code}</span><br><br>Il est valable 15 minutes. Si tu n'as rien demandé, ignore ce message.`});
  const r = await sendEmail(env, {to: email, subject: `Code de vérification : ${code}`, html, text: plain(html)});
  return r.ok ? json({ok: true}) : err(502, "L'email n'a pas pu partir. Réessaie dans un instant.");
}
async function memberSubmit(env, req, base, ctx) {
  const raw = await readBody(req, MAX_PNG * 1.4 + 20000); if (!raw) return err(413, "Demande trop volumineuse.");
  const d = parse(new TextDecoder().decode(raw)); if (!d) return err(400, "Requête invalide.");
  const type = MEMBER_TYPES[d.type] ? d.type : null; if (!type) return err(400, "Choisis résiliation ou suspension.");
  const name = String(d.name || "").trim().slice(0, 120), email = String(d.email || "").trim().toLowerCase().slice(0, 160);
  if (!name || !email) return err(400, "Indique ton nom et ton email.");
  const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
  if (!isDate(d.startDate)) return err(400, "Indique la date souhaitée.");
  if (type === "suspension" && (!isDate(d.endDate) || d.endDate <= d.startDate)) return err(400, "Indique la date de reprise, après la date de début.");
  if (d.consent !== true || !d.consentText) return err(400, "Le consentement est obligatoire.");
  const key = "mcode:" + (await sha256(new TextEncoder().encode(email)));
  const st = parse(await env.FILES.get(key) || "");
  if (!st) return err(400, "Demande d'abord ton code de vérification (ou il a expiré).");
  if (st.tries >= 5) return err(429, "Trop d'essais. Demande un nouveau code.");
  if ((await sha256(new TextEncoder().encode(email + ":" + String(d.code || "").replace(/\D/g, "")))) !== st.h) { st.tries++; await env.FILES.put(key, JSON.stringify(st), {expirationTtl: 900}); return err(400, "Code incorrect. Vérifie l'email reçu."); }
  await env.FILES.delete(key);
  let png; try { png = b64ToBytes(String(d.signature || "").replace(/^data:image\/png;base64,/, "")); } catch { return err(400, "Signature illisible."); }
  if (!png.byteLength || png.byteLength > MAX_PNG || !isPng(png.buffer)) return err(400, "Signature illisible.");
  const id = randomId(8), token = randomId(24), c = client(req), at = now();
  await env.FILES.put(`msig:${id}`, png);
  await env.DB.prepare(`INSERT INTO member_requests (id, token, type, created_at, name, email, phone, member_ref, start_date, end_date, reason, consent_text, method, ip, country, city, user_agent, email_verified_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, token, type, at, name, email, String(d.phone || "").slice(0, 40), String(d.memberRef || "").slice(0, 60), d.startDate, type === "suspension" ? d.endDate : null,
    String(d.reason || "").slice(0, 1000), String(d.consentText).slice(0, 1000), d.method === "type" ? "type" : "draw", c.ip, c.country, c.city, c.ua, at).run();
  ctx.waitUntil(memberReceipts(env, base, {id, token, type, created_at: at, name, email, start_date: d.startDate, end_date: d.endDate, reason: d.reason}));
  return json({ok: true, id, receivedAt: at, link: new URL(`/m/${token}`, base).href});
}
async function memberReceipts(env, base, m) {
  const p = (await getSetting(env, "profile")) || {}, label = MEMBER_TYPES[m.type];
  const dates = m.type === "suspension" ? `du ${m.start_date} au ${m.end_date}` : `à partir du ${m.start_date}`;
  const html = mailLayout(p, {title: `Demande de ${label} reçue`, intro: `Bonjour ${esc(m.name)},<br><br>Nous avons bien reçu ta demande de <b>${label}</b> ${esc(dates)}, signée électroniquement le ${esc(new Date(m.created_at).toLocaleString("fr-FR", {timeZone: "Europe/Madrid"}))} (heure de Madrid).<br><br>Cet email est ton accusé de réception : conserve-le. Tu recevras la réponse de ${esc(p.company || "l'établissement")} par email.`,
    button: "Suivre ma demande", buttonUrl: new URL(`/m/${m.token}`, base).href, small: `Référence de la demande : ${esc(m.id)}`});
  await sendEmail(env, {to: m.email, toName: m.name, subject: `Accusé de réception : demande de ${label}`, html, text: plain(html), replyTo: p.email || undefined});
  const to = env.OWNER_EMAIL || p.email;
  if (to) {
    const h2 = mailLayout(p, {title: `Nouvelle demande de ${label}`, intro: `<b>${esc(m.name)}</b> (${esc(m.email)}) demande une ${label} ${esc(dates)}.${m.reason ? `<br><br>Motif : « ${esc(m.reason)} »` : ""}`, button: "Traiter la demande", buttonUrl: new URL("/admin.html", base).href});
    await sendEmail(env, {to, subject: `Demande de ${label} : ${m.name}`, html: h2, text: plain(h2)});
  }
}
async function sendMemberDecision(env, base, m) {
  const p = (await getSetting(env, "profile")) || {}, label = MEMBER_TYPES[m.type], ok = m.status === "accepted";
  const html = mailLayout(p, {title: ok ? `Ta demande de ${label} est acceptée` : `Réponse à ta demande de ${label}`,
    intro: `Bonjour ${esc(m.name)},<br><br>${ok ? `Ta demande de ${label} est <b>acceptée</b>.` : `Ta demande de ${label} n'a pas pu être acceptée.`}${m.decision_note ? `<br><br>Message de ${esc(p.company || "l'établissement")} : « ${esc(m.decision_note)} »` : ""}<br><br>Le document récapitulatif, signé et horodaté, est joint à cet email.`,
    button: "Voir ma demande", buttonUrl: new URL(`/m/${m.token}`, base).href, small: `Référence ${esc(m.id)} · Empreinte SHA-256 du document : ${esc(m.pdf_hash)}`});
  await sendEmail(env, {to: m.email, toName: m.name, subject: `${ok ? "Acceptée" : "Réponse"} : demande de ${label}`, html, text: plain(html), replyTo: p.email || undefined,
    attachments: [{filename: `demande-${m.type}.pdf`, url: new URL(`/api/m/${m.token}/pdf`, base).href}]});
}
async function handleMember(req, env, parts, url, ctx) {
  const [a, b] = parts;
  if (a === "code" && req.method === "POST") return memberCode(env, req, url);
  if (a === "request" && req.method === "POST") return memberSubmit(env, req, url, ctx);
  if (!/^[a-f0-9]{48}$/.test(a || "")) return err(404, "Demande introuvable.");
  const m = await env.DB.prepare("SELECT * FROM member_requests WHERE token = ?").bind(a).first();
  if (!m) return err(404, "Demande introuvable.");
  if (!b && req.method === "GET") return json({type: m.type, createdAt: m.created_at, name: m.name, startDate: m.start_date, endDate: m.end_date, status: m.status, decisionNote: m.decision_note, decidedAt: m.decided_at, pdfHash: m.pdf_hash, profile: publicProfile(await getSetting(env, "profile"))});
  if (b === "pdf" && req.method === "GET") { const buf = await env.FILES.get(`mpdf:${m.id}`, "arrayBuffer"); return buf ? pdfResponse(buf, `demande-${m.type}.pdf`) : err(404, "Pas encore traitée."); }
  return err(405, "Action non prise en charge.");
}

// ---------------- signataire ----------------
async function signerByToken(env, token) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  return env.DB.prepare("SELECT s.*, r.title, r.file_name, r.status AS request_status, r.original_hash, r.original_size, r.final_hash, r.documents FROM signers s JOIN requests r ON r.id = s.request_id WHERE s.token = ?").bind(token).first();
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
    return json({title: s.title, fileName: s.file_name, profile, status: s.request_status, originalHash: s.original_hash, finalHash: s.final_hash, documents: parse(s.documents) || [],
      signer: {name: s.name, role: s.role, email: s.email, status: s.status, signedAt: s.signed_at, declinedAt: s.declined_at, onsite: !!s.onsite, placements: parse(s.placements) || [], requiresCode: needsCode(env, s), emailMasked: maskEmail(s.email)}});
  }
  if (req.method === "GET" && action === "pdf") {
    const key = s.request_status === "final" ? `pdf:${s.request_id}:final` : `pdf:${s.request_id}:original`;
    const body = await env.FILES.get(key, "arrayBuffer");
    if (!body) return err(404, "Document introuvable.");
    if (s.request_status === "final" && url.searchParams.get("src") !== "mail") await logEvent(env, req, s.request_id, s.id, "downloaded_final");
    return pdfResponse(body, s.file_name);
  }
  if (req.method === "POST" && action === "code") {
    if (s.status === "signed" || s.request_status !== "pending") return err(409, "Ce document n'attend plus ta signature.");
    if (!needsCode(env, s)) return err(400, "Aucun code n'est nécessaire pour ce document.");
    return sendCode(env, req, url, s);
  }
  if (req.method === "POST" && action === "viewed") {
    const d = parse(await req.text()) || {};
    await logEvent(env, req, s.request_id, s.id, "read", {pages: +d.pages || null, seconds: +d.seconds || null});
    return json({ok: true});
  }
  if (req.method === "POST" && action === "decline") {
    if (s.status !== "waiting" || s.request_status !== "pending") return err(409, "Ce document n'attend plus ta réponse.");
    const d = parse(await req.text()) || {};
    const reason = String(d.reason || "").trim().slice(0, 1000);
    if (!reason) return err(400, "Indique en quelques mots pourquoi tu refuses.");
    const at = now();
    const r = await env.DB.prepare("UPDATE signers SET status = 'declined', declined_at = ?, decline_reason = ? WHERE id = ? AND status = 'waiting'").bind(at, reason, s.id).run();
    if (!r.meta.changes) return err(409, "Ce document n'attend plus ta réponse.");
    await logEvent(env, req, s.request_id, s.id, "declined", {reason});
    ctx.waitUntil(notifyOwnerDeclined(env, url, s, reason));
    return json({ok: true, declinedAt: at});
  }
  if (req.method === "POST" && action === "sign-cert") {
    // PDF signé avec un certificat électronique (AutoFirma, DNIe, FNMT) : il doit commencer exactement par l'original
    if (s.status !== "waiting" || s.request_status !== "pending") return err(409, "Ce document n'attend plus ta signature.");
    const buf = await readBody(req, MAX_PDF + 4 * 1024 * 1024);
    if (!buf || !isPdf(buf)) return err(400, "Envoie le PDF signé avec ton certificat.");
    if (buf.byteLength <= s.original_size) return err(400, "Ce fichier n'est pas le document signé : il est plus petit que l'original.");
    if ((await sha256(buf.slice(0, s.original_size))) !== s.original_hash) return err(400, "Ce PDF ne correspond pas au document envoyé : il a été modifié avant la signature, ou ce n'est pas le bon fichier.");
    const meta = parse(decodeURIComponent(req.headers.get("x-meta") || "")) || {};
    const cert = meta.cert || {};
    if (!cert.valid) return err(400, "La signature du certificat n'a pas pu être vérifiée.");
    if (meta.consent !== true || !meta.consentText) return err(400, "Le consentement est obligatoire.");
    const c = client(req), at = now();
    await env.FILES.put(`certpdf:${s.id}`, buf);
    const info = {subject: String(cert.subject || "").slice(0, 300), name: String(cert.name || "").slice(0, 160), idNumber: String(cert.idNumber || "").slice(0, 40), issuer: String(cert.issuer || "").slice(0, 300),
      serial: String(cert.serial || "").slice(0, 80), signingTime: String(cert.signingTime || "").slice(0, 40), notAfter: String(cert.notAfter || "").slice(0, 40), algorithm: String(cert.algorithm || "").slice(0, 40), sha256: await sha256(buf), size: buf.byteLength};
    const res = await env.DB.prepare(`UPDATE signers SET status = 'signed', signed_at = ?, consent_at = ?, consent_text = ?, declared_name = ?, declared_id = ?, method = 'certificate',
      ip = ?, country = ?, city = ?, user_agent = ?, identity_verified_at = ?, cert_info = ?, otp_hash = NULL WHERE id = ? AND status = 'waiting'`)
      .bind(at, meta.consentAt && !isNaN(Date.parse(meta.consentAt)) ? meta.consentAt : at, String(meta.consentText).slice(0, 1000), info.name || s.name, info.idNumber,
        c.ip, c.country, c.city, c.ua, at, JSON.stringify(info), s.id).run();
    if (!res.meta.changes) return err(409, "Ce document a déjà été signé avec ce lien.");
    await logEvent(env, req, s.request_id, s.id, "signed", {name: info.name, idNumber: info.idNumber, identity: "certificat électronique", issuer: info.issuer, signedPdfSha256: info.sha256, documentSha256: s.original_hash});
    ctx.waitUntil(notifyOwnerSigned(env, url, s, info.name || s.name));
    return json({ok: true, signedAt: at});
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
    let verifiedAt = null;
    if (needsCode(env, s)) {
      if (!s.otp_hash) return err(400, "Demande d'abord ton code de vérification.");
      if (s.otp_attempts >= 5) return err(429, "Trop d'essais. Demande un nouveau code.");
      if (Date.parse(s.otp_expires_at) < Date.now()) return err(400, "Ce code a expiré. Demande un nouveau code.");
      const ok = (await sha256(new TextEncoder().encode(s.id + ":" + String(d.code || "").replace(/\D/g, "")))) === s.otp_hash;
      if (!ok) { await env.DB.prepare("UPDATE signers SET otp_attempts = otp_attempts + 1 WHERE id = ?").bind(s.id).run(); return err(400, "Code incorrect. Vérifie l'email reçu."); }
      verifiedAt = now();
    }
    let png;
    try { png = b64ToBytes(String(d.signature || "").replace(/^data:image\/png;base64,/, "")); } catch { return err(400, "Signature illisible."); }
    if (!png.byteLength || png.byteLength > MAX_PNG || !isPng(png.buffer)) return err(400, "Signature illisible.");
    const c = client(req), at = now();
    await env.FILES.put(`sig:${s.id}`, png);
    const res = await env.DB.prepare(`UPDATE signers SET status = 'signed', signed_at = ?, consent_at = ?, consent_text = ?, declared_name = ?, declared_id = ?, method = ?,
      ip = ?, country = ?, city = ?, user_agent = ?, identity_verified_at = ?, otp_hash = NULL WHERE id = ? AND status = 'waiting'`)
      .bind(at, d.consentAt && !isNaN(Date.parse(d.consentAt)) ? d.consentAt : at, String(d.consentText).slice(0, 1000), declaredName, declaredId,
        d.method === "type" ? "type" : "draw", c.ip, c.country, c.city, c.ua, verifiedAt, s.id).run();
    if (!res.meta.changes) return err(409, "Ce document a déjà été signé avec ce lien.");
    await logEvent(env, req, s.request_id, s.id, "signed", {name: declaredName, idNumber: declaredId, signatureSha256: await sha256(png), documentSha256: s.original_hash, identity: verifiedAt ? "code email" : s.onsite ? "sur place" : "lien personnel"});
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
  return {...r, stamps: parse(r.stamps) || [], documents: parse(r.documents) || [], signers: signers.map(s => ({...s, placements: parse(s.placements) || []})), events};
}

async function handleAdmin(req, env, parts, url, ctx) {
  if (!isAdmin(req, env)) return err(401, "Code d'accès incorrect.");
  const [res, id, sub] = parts;

  if ((await getSetting(env, "base_url")) !== url.origin) await setSetting(env, "base_url", url.origin);
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
      const docs = (Array.isArray(d.documents) ? d.documents.slice(0, 15) : []).map(x => ({name: String(x.name || "Document").slice(0, 120), from: Math.max(1, +x.from | 0), to: Math.max(1, +x.to | 0), sha256: String(x.sha256 || "").replace(/[^a-f0-9]/g, "").slice(0, 64), size: +x.size | 0}));
      const rid = randomId(8);
      const stmts = [env.DB.prepare("INSERT INTO requests (id, title, file_name, created_at, status, stamps, documents, template_id) VALUES (?,?,?,?, 'draft', ?, ?, ?)")
        .bind(rid, title, fileName, now(), JSON.stringify(Array.isArray(d.stamps) ? d.stamps.slice(0, 40) : []), JSON.stringify(docs), d.templateId ? String(d.templateId).slice(0, 32) : null)];
      const links = [];
      signers.forEach((s, i) => {
        const sid = randomId(8), token = randomId(24);
        links.push({id: sid, name: s.name, token});
        stmts.push(env.DB.prepare("INSERT INTO signers (id, request_id, position, name, email, phone, role, token, placements, onsite) VALUES (?,?,?,?,?,?,?,?,?,?)")
          .bind(sid, rid, i, String(s.name).trim().slice(0, 120), String(s.email || "").slice(0, 160), String(s.phone || "").slice(0, 40), String(s.role || "").slice(0, 60), token, JSON.stringify(s.placements.slice(0, 40)), s.onsite ? 1 : 0));
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
      if (left.n > 0) return err(409, "Tous les signataires n'ont pas encore signé (ou l'un d'eux a refusé).");
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
      await Promise.all([env.FILES.delete(`pdf:${id}:original`), env.FILES.delete(`pdf:${id}:final`), ...results.map(s => env.FILES.delete(`sig:${s.id}`)), ...results.map(s => env.FILES.delete(`certpdf:${s.id}`))]);
      await env.DB.batch([env.DB.prepare("DELETE FROM events WHERE request_id = ?").bind(id), env.DB.prepare("DELETE FROM signers WHERE request_id = ?").bind(id), env.DB.prepare("DELETE FROM requests WHERE id = ?").bind(id)]);
      return json({ok: true});
    }
  }
  if (res === "certpdf" && id && req.method === "GET") {
    const buf = await env.FILES.get(`certpdf:${id}`, "arrayBuffer");
    return buf ? pdfResponse(buf, "signe-certificat.pdf") : err(404, "Introuvable.");
  }
  // ---- modèles de dossier
  if (res === "templates") {
    if (!id && req.method === "GET") {
      const {results} = await env.DB.prepare("SELECT id, name, created_at, file_name, size FROM templates ORDER BY name").all();
      return json({templates: results});
    }
    if (!id && req.method === "POST") {
      const d = parse(await req.text()); if (!d) return err(400, "Requête invalide.");
      const name = String(d.name || "").trim().slice(0, 120); if (!name) return err(400, "Donne un nom au modèle.");
      const data = {title: String(d.title || name).slice(0, 160), documents: Array.isArray(d.documents) ? d.documents.slice(0, 15) : [], stamps: Array.isArray(d.stamps) ? d.stamps.slice(0, 40) : [],
        slots: (Array.isArray(d.slots) ? d.slots.slice(0, 10) : []).map(x => ({role: String(x.role || "").slice(0, 60), onsite: !!x.onsite, placements: Array.isArray(x.placements) ? x.placements.slice(0, 40) : []}))};
      if (!data.slots.length) return err(400, "Le modèle doit avoir au moins un signataire.");
      const tid = randomId(8);
      await env.DB.prepare("INSERT INTO templates (id, name, created_at, file_name, size, data) VALUES (?,?,?,?,?,?)").bind(tid, name, now(), String(d.fileName || "dossier.pdf").slice(0, 160), 0, JSON.stringify(data)).run();
      return json({id: tid});
    }
    if (id && sub === "pdf" && req.method === "PUT") {
      const buf = await readBody(req, MAX_PDF); if (!buf || !isPdf(buf)) return err(400, "PDF attendu.");
      await env.FILES.put(`tpl:${id}`, buf);
      await env.DB.prepare("UPDATE templates SET size = ? WHERE id = ?").bind(buf.byteLength, id).run();
      return json({ok: true});
    }
    if (id && sub === "pdf" && req.method === "GET") {
      const buf = await env.FILES.get(`tpl:${id}`, "arrayBuffer"); return buf ? pdfResponse(buf, "modele.pdf") : err(404, "Introuvable.");
    }
    if (id && !sub && req.method === "GET") {
      const t = await env.DB.prepare("SELECT * FROM templates WHERE id = ?").bind(id).first();
      return t ? json({...t, data: parse(t.data)}) : err(404, "Modèle introuvable.");
    }
    if (id && !sub && req.method === "DELETE") {
      await env.FILES.delete(`tpl:${id}`); await env.DB.prepare("DELETE FROM templates WHERE id = ?").bind(id).run();
      return json({ok: true});
    }
  }
  // ---- accueil : où en est le dossier d'une personne
  if (res === "people" && req.method === "GET") {
    const q = String(url.searchParams.get("q") || "").trim().toLowerCase().slice(0, 80);
    if (q.length < 2) return json({results: []});
    const like = "%" + q.replace(/[%_]/g, "") + "%";
    const {results} = await env.DB.prepare(`SELECT s.id, s.name, s.email, s.phone, s.role, s.status, s.signed_at, s.declined_at, s.token, s.onsite, r.id AS request_id, r.title, r.status AS request_status, r.created_at, r.template_id, t.name AS template_name
      FROM signers s JOIN requests r ON r.id = s.request_id LEFT JOIN templates t ON t.id = r.template_id
      WHERE r.status IN ('pending','final') AND (lower(s.name) LIKE ? OR lower(s.email) LIKE ? OR s.phone LIKE ?) ORDER BY r.created_at DESC LIMIT 60`).bind(like, like, like).all();
    return json({results: results.map(x => ({...x, link: new URL(`/s/${x.token}`, url).href, token: undefined}))});
  }
  // ---- export complet
  if (res === "export" && req.method === "GET") {
    const all = q => env.DB.prepare(q).all().then(r => r.results);
    const [requests, signers, events, templates, memberRequests] = await Promise.all([all("SELECT * FROM requests"), all("SELECT * FROM signers"), all("SELECT * FROM events ORDER BY id"), all("SELECT * FROM templates"), all("SELECT * FROM member_requests")]);
    const strip = s => ({...s, token: undefined, otp_hash: undefined});
    return json({exportedAt: now(), profile: await getSetting(env, "profile"), seal: await getSetting(env, "seal"), requests, signers: signers.map(strip), events, templates, memberRequests: memberRequests.map(m => ({...m, token: undefined}))});
  }
  // ---- demandes des membres (résiliation, suspension)
  if (res === "member-requests") {
    if (!id && req.method === "GET") {
      const {results} = await env.DB.prepare("SELECT id, type, created_at, name, email, status, start_date, end_date FROM member_requests ORDER BY created_at DESC LIMIT 300").all();
      return json({requests: results});
    }
    const m = id ? await env.DB.prepare("SELECT * FROM member_requests WHERE id = ?").bind(id).first() : null;
    if (!m) return err(404, "Demande introuvable.");
    if (!sub && req.method === "GET") return json({...m, token: undefined, link: new URL(`/m/${m.token}`, url).href});
    if (sub === "signature" && req.method === "GET") {
      const buf = await env.FILES.get(`msig:${m.id}`, "arrayBuffer");
      return buf ? new Response(buf, {headers: {"content-type": "image/png", "cache-control": "no-store"}}) : err(404, "Introuvable.");
    }
    if (sub === "pdf" && req.method === "GET") {
      const buf = await env.FILES.get(`mpdf:${m.id}`, "arrayBuffer"); return buf ? pdfResponse(buf, `demande-${m.type}.pdf`) : err(404, "Pas encore traitée.");
    }
    if (sub === "decision" && req.method === "PUT") {
      // le navigateur du gérant envoie le PDF final (demande + décision, scellé) ; la décision est inscrite à l'heure du serveur
      if (m.status !== "received") return err(409, "Cette demande a déjà été traitée.");
      const decision = req.headers.get("x-decision"), note = decodeURIComponent(req.headers.get("x-note") || "").slice(0, 1000);
      if (!["accepted", "refused"].includes(decision)) return err(400, "Décision invalide.");
      const buf = await readBody(req, MAX_PDF); if (!buf || !isPdf(buf)) return err(400, "PDF attendu.");
      const at = now(), hash = await sha256(buf);
      await env.FILES.put(`mpdf:${m.id}`, buf);
      await env.DB.prepare("UPDATE member_requests SET status = ?, decision_note = ?, decided_at = ?, pdf_hash = ? WHERE id = ? AND status = 'received'").bind(decision, note, at, hash, m.id).run();
      if (emailReady(env)) ctx.waitUntil(sendMemberDecision(env, url, {...m, status: decision, decision_note: note, decided_at: at, pdf_hash: hash}));
      return json({ok: true, decidedAt: at, hash});
    }
  }
  if (res === "signature" && id && req.method === "GET") {
    const buf = await env.FILES.get(`sig:${id}`, "arrayBuffer");
    return buf ? new Response(buf, {headers: {"content-type": "image/png", "cache-control": "no-store"}}) : err(404, "Introuvable.");
  }
  return err(404, "Route inconnue.");
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(runReminders(env)); },
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    try {
      if (parts[0] === "m" && parts.length === 2 && req.method === "GET") return env.ASSETS.fetch(new Request(new URL("/resiliation", url), req));
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
      if (parts[1] === "m" && parts[2]) return await handleMember(req, env, parts.slice(2), url, ctx);
      if (parts[1] === "profile" && req.method === "GET") return json(publicProfile(await getSetting(env, "profile")));
      if (parts[1] === "admin") return await handleAdmin(req, env, parts.slice(2), url, ctx);
      return err(404, "Route inconnue.");
    } catch (e) {
      console.error(e);
      return err(500, "Erreur du serveur. Réessaie dans un instant.");
    }
  }
};
