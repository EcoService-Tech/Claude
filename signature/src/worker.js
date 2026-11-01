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
  const c = client(req);
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

// ---------------- signataire ----------------
async function signerByToken(env, token) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  return env.DB.prepare("SELECT s.*, r.title, r.file_name, r.status AS request_status, r.original_hash, r.final_hash FROM signers s JOIN requests r ON r.id = s.request_id WHERE s.token = ?").bind(token).first();
}

async function handleSigner(req, env, parts) {
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
    if (s.request_status === "final") await logEvent(env, req, s.request_id, s.id, "downloaded_final");
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

async function handleAdmin(req, env, parts, url) {
  if (!isAdmin(req, env)) return err(401, "Code d'accès incorrect.");
  const [res, id, sub] = parts;

  if (res === "check") return json({ok: true});

  if (res === "settings") {
    if (req.method === "GET") {
      const p = await getSetting(env, "profile");
      const seal = await getSetting(env, "seal");
      return json({profile: p || {}, seal});
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
      return json({ok: true, hash});
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
      return json({ok: true, hash, finalizedAt: at});
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
  async fetch(req, env) {
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
      if (parts[1] === "s" && parts[2]) return await handleSigner(req, env, parts.slice(2));
      if (parts[1] === "admin") return await handleAdmin(req, env, parts.slice(2), url);
      return err(404, "Route inconnue.");
    } catch (e) {
      console.error(e);
      return err(500, "Erreur du serveur. Réessaie dans un instant.");
    }
  }
};
