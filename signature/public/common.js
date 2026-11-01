"use strict";
/* Outils partagés par l'espace de gestion et la page de signature. */
pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.js";
const {PDFDocument, rgb, degrees, StandardFonts} = PDFLib;

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
};
const $ = s => document.querySelector(s);
const fmtSize = n => n < 1024 ? n + " o" : n < 1048576 ? (n / 1024).toFixed(0) + " Ko" : (n / 1048576).toFixed(1) + " Mo";
const fmtDate = iso => iso ? new Date(iso).toLocaleString("fr-FR", {dateStyle: "medium", timeStyle: "short"}) : "—";
const fmtDateLong = iso => iso ? new Date(iso).toLocaleString("fr-FR", {dateStyle: "long", timeStyle: "medium", timeZone: "Europe/Madrid"}) + " (heure de Madrid)" : "—";
const hex256 = async buf => [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map(b => b.toString(16).padStart(2, "0")).join("");
function setStatus(el, msg, kind) { if (!el) return; el.textContent = msg || ""; el.className = "status" + (kind ? " " + kind : ""); }
const store = {get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }};

/* Texte compatible avec les polices PDF standard */
const EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const safe = s => Array.from(String(s ?? "")).map(c => { const cp = c.codePointAt(0); if (c === "\t") return " "; if ((cp >= 32 && cp < 127) || (cp >= 160 && cp < 256) || EXTRA.includes(c)) return c; if (cp === 8239 || cp === 8201 || cp === 8202) return " "; return ""; }).join("");

/* Téléchargement d'un fichier généré */
function download(name, data, type = "application/pdf") {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], {type}));
  const a = h("a", {href: url, download: name}); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/* Affichage d'une page PDF avec calque pour placer ou montrer des zones */
function makeViewer({onRender, maxWidth = 820} = {}) {
  const holder = h("div", {class: "stage"});
  const overlay = h("div", {class: "overlay"});
  const info = h("span", {}, "–");
  const prev = h("button", {class: "icon-btn", type: "button", "aria-label": "Page précédente"}, "‹");
  const next = h("button", {class: "icon-btn", type: "button", "aria-label": "Page suivante"}, "›");
  const wrap = h("div", {class: "stage-wrap"}, holder);
  const el = h("div", {class: "viewer"}, h("div", {class: "pager"}, prev, info, next), wrap);
  const v = {el, overlay, pdf: null, n: 1, count: 0, viewport: null, scale: 1};
  let job = 0;
  async function draw() {
    if (!v.pdf) return;
    const my = ++job;
    const page = await v.pdf.getPage(v.n);
    const base = page.getViewport({scale: 1});
    v.scale = Math.max(260, Math.min(wrap.clientWidth - 24, maxWidth)) / base.width;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), vp = page.getViewport({scale: v.scale * dpr});
    const c = document.createElement("canvas"); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    c.style.width = Math.round(vp.width / dpr) + "px"; c.style.height = Math.round(vp.height / dpr) + "px";
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({canvasContext: ctx, viewport: vp}).promise;
    if (my !== job) return;
    v.viewport = page.getViewport({scale: v.scale}); v.page = page;
    holder.replaceChildren(c, overlay);
    info.textContent = `Page ${v.n} / ${v.count}`; prev.disabled = v.n <= 1; next.disabled = v.n >= v.count;
    await onRender?.(v);
  }
  prev.onclick = () => { if (v.n > 1) { v.n--; draw(); } };
  next.onclick = () => { if (v.n < v.count) { v.n++; draw(); } };
  v.load = async pdf => { v.pdf = pdf; v.count = pdf.numPages; v.n = 1; await draw(); };
  v.go = async n => { v.n = Math.min(Math.max(1, n), v.count); await draw(); };
  v.redraw = draw;
  v.toPdf = (x, y) => v.viewport.convertToPdfPoint(x, y);
  v.toView = (x, y) => v.viewport.convertToViewportPoint(x, y);
  v.point = e => { const r = overlay.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  // rectangle PDF {x,y,w,h} -> style css
  v.boxStyle = b => { const [x1, y1] = v.toView(b.x, b.y + b.h), [x2, y2] = v.toView(b.x + b.w, b.y); return `left:${Math.min(x1, x2)}px;top:${Math.min(y1, y2)}px;width:${Math.abs(x2 - x1)}px;height:${Math.abs(y2 - y1)}px`; };
  return v;
}
const openPdf = buf => pdfjsLib.getDocument({data: new Uint8Array(buf.slice(0)), isEvalSupported: false}).promise;

/* Zone de signature : dessin au doigt ou nom écrit */
function signaturePad({nameHint = () => ""} = {}) {
  let how = "draw", png = null, ratio = 3, ctx, drawing = false, inked = false;
  const pad = h("canvas", {class: "sigpad", "aria-label": "Zone de signature : dessine avec le doigt"});
  const typed = h("input", {type: "text", placeholder: "Écris ton nom", id: "typedSig"});
  const padBox = h("div", {class: "field"}, pad, h("div", {class: "row"}, h("button", {class: "btn ghost small", type: "button", onclick: () => { clear(); png = null; api.onchange?.(); }}, "Effacer")));
  const typedBox = h("div", {class: "field"}, h("label", {for: "typedSig"}, "Ta signature écrite"), typed); typedBox.hidden = true;
  const segEl = seg([["draw", "Dessiner"], ["type", "Écrire"]], how, v => { how = v; png = null; padBox.hidden = v !== "draw"; typedBox.hidden = v !== "type"; if (v === "draw") requestAnimationFrame(clear); else { if (!typed.value) typed.value = nameHint(); renderTyped(); } api.onchange?.(); });
  function clear() { const r = pad.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; pad.width = Math.max(1, r.width * dpr); pad.height = Math.max(1, r.height * dpr); ctx = pad.getContext("2d"); ctx.scale(dpr, dpr); ctx.lineWidth = 2.6; ctx.lineCap = ctx.lineJoin = "round"; ctx.strokeStyle = "#0d1b6e"; inked = false; }
  pad.addEventListener("pointerdown", e => { if (!ctx) clear(); drawing = true; pad.setPointerCapture(e.pointerId); const r = pad.getBoundingClientRect(); ctx.beginPath(); ctx.moveTo(e.clientX - r.left, e.clientY - r.top); });
  pad.addEventListener("pointermove", e => { if (!drawing) return; const r = pad.getBoundingClientRect(); ctx.lineTo(e.clientX - r.left, e.clientY - r.top); ctx.stroke(); inked = true; });
  pad.addEventListener("pointerup", () => { drawing = false; if (inked) capture(pad); });
  function capture(c) {
    const g = c.getContext("2d"), {width: W, height: H} = c, d = g.getImageData(0, 0, W, H).data;
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 <= x0) return;
    const t = document.createElement("canvas"); t.width = x1 - x0 + 8; t.height = y1 - y0 + 8;
    t.getContext("2d").drawImage(c, x0 - 4, y0 - 4, t.width, t.height, 0, 0, t.width, t.height);
    png = t.toDataURL("image/png"); ratio = t.width / t.height; api.onchange?.();
  }
  async function renderTyped() {
    const txt = typed.value.trim(); if (!txt) { png = null; api.onchange?.(); return; }
    await document.fonts.load('64px "Caveat"').catch(() => {});
    const c = document.createElement("canvas"); c.width = 1000; c.height = 220;
    const g = c.getContext("2d"); g.font = '600 120px "Caveat", cursive'; g.fillStyle = "#0d1b6e"; g.textBaseline = "middle"; g.fillText(txt, 20, 115);
    capture(c);
  }
  typed.addEventListener("input", renderTyped);
  const el = h("div", {class: "field", style: "gap:10px"}, segEl, padBox, typedBox);
  requestAnimationFrame(clear);
  const api = {el, get png() { return png; }, get ratio() { return ratio; }, get method() { return how; }, onchange: null, reset() { png = null; clear(); typed.value = ""; }};
  return api;
}
function seg(options, value, onChange) {
  const el = h("div", {class: "seg", role: "group"});
  const set = v => { value = v; [...el.children].forEach(b => b.setAttribute("aria-pressed", b.dataset.v === v)); onChange(v); };
  for (const [v, l] of options) el.append(h("button", {type: "button", "data-v": v, "aria-pressed": v === value, onclick: () => set(v)}, l));
  return el;
}

/* Cachet de l'entreprise, dessiné comme un tampon encreur rond */
async function loadImage(src) { const im = new Image(); im.crossOrigin = "anonymous"; im.src = src; await im.decode(); return im; }
function stampCanvas(profile, {logo = null, date = new Date(), size = 600} = {}) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d"), r = size / 2, col = profile.color || "#2340c9";
  g.translate(r, r); g.strokeStyle = g.fillStyle = col;
  g.lineWidth = size * .018; g.beginPath(); g.arc(0, 0, r * .96, 0, Math.PI * 2); g.stroke();
  g.lineWidth = size * .008; g.beginPath(); g.arc(0, 0, r * .9, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(0, 0, r * .62, 0, Math.PI * 2); g.stroke();
  const arcText = (text, radius, top, fontPx) => {
    text = String(text || "").toUpperCase(); if (!text) return;
    const maxArc = radius * Math.PI * .85;
    let px = fontPx, widths, total;
    const measure = () => { g.font = `700 ${px}px "IBM Plex Sans", Helvetica, Arial, sans-serif`; widths = [...text].map(ch => g.measureText(ch).width); total = widths.reduce((x, y) => x + y, 0) + (text.length - 1) * px * .12; };
    measure(); while (total > maxArc && px > 8) { px -= 1; measure(); }
    g.textAlign = "center"; g.textBaseline = "middle";
    const span = total / radius;
    let acc = 0;
    [...text].forEach((ch, i) => {
      const mid = (acc + widths[i] / 2) / radius;
      g.save();
      if (top) { const a = -Math.PI / 2 - span / 2 + mid; g.rotate(a + Math.PI / 2); g.fillText(ch, 0, -radius); }
      else { const a = Math.PI / 2 + span / 2 - mid; g.rotate(a - Math.PI / 2); g.fillText(ch, 0, radius); }
      g.restore();
      acc += widths[i] + px * .12;
    });
  };
  arcText(profile.company || "Mon entreprise", r * .76, true, size * .085);
  const bottom = [profile.taxId ? "CIF " + profile.taxId : "", profile.city].filter(Boolean).join(" · ");
  arcText(bottom, r * .76, false, size * .07);
  g.textAlign = "center"; g.textBaseline = "middle";
  if (logo) {
    const s = r * .9, k = Math.min(s / logo.width, s * .62 / logo.height);
    g.drawImage(logo, -logo.width * k / 2, -logo.height * k / 2 - r * .12, logo.width * k, logo.height * k);
  } else {
    g.font = `800 ${size * .1}px "Bricolage Grotesque", Helvetica, Arial, sans-serif`;
    g.fillText((profile.stampText || "VALIDÉ").toUpperCase().slice(0, 12), 0, -r * .1);
  }
  g.font = `600 ${size * .055}px "IBM Plex Mono", Menlo, monospace`;
  g.fillText(date.toLocaleDateString("fr-FR"), 0, r * .28);
  // effet encre : léger grain
  const id = g.getImageData(0, 0, size, size), d = id.data;
  for (let i = 3; i < d.length; i += 4) if (d[i] && Math.random() < .07) d[i] = d[i] * .55;
  g.putImageData(id, 0, 0);
  return c;
}
const canvasPng = c => new Promise(res => c.toBlob(b => b.arrayBuffer().then(res), "image/png"));
