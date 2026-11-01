// Assemble le dossier public/ : bibliothèques locales, sceau, et la page des outils PDF.
import {build} from "esbuild";
import fs from "fs";
import path from "path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const pub = p => path.join(root, "public", p), nm = p => path.join(root, "node_modules", p);
fs.mkdirSync(pub("vendor"), {recursive: true});

await build({
  entryPoints: [path.join(root, "client/seal.js")], bundle: true, minify: true, format: "iife", globalName: "Seal",
  platform: "browser", target: "es2020", outfile: pub("vendor/seal.js"),
  inject: [path.join(root, "scripts/buffer-shim.js")], define: {global: "globalThis", "process.env.NODE_DEBUG": "false"}, logLevel: "warning"
});

const copy = (from, to) => fs.copyFileSync(nm(from), pub(to));
copy("pdf-lib/dist/pdf-lib.min.js", "vendor/pdf-lib.min.js");
copy("pdfjs-dist/build/pdf.min.js", "vendor/pdf.min.js");
copy("pdfjs-dist/build/pdf.worker.min.js", "vendor/pdf.worker.min.js");
copy("jszip/dist/jszip.min.js", "vendor/jszip.min.js");
copy("mammoth/mammoth.browser.min.js", "vendor/mammoth.browser.min.js");
copy("tesseract.js/dist/tesseract.min.js", "vendor/tesseract.min.js");

// Outils PDF : même source que l'Atelier publié sur claude.ai, avec les bibliothèques servies localement.
const atelier = path.join(root, "..", "atelier-pdf");
fs.cpSync(path.join(atelier, "ocr"), pub("ocr"), {recursive: true});
let html = fs.readFileSync(path.join(atelier, "index.html"), "utf8")
  .replace("https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js", "/vendor/pdf-lib.min.js")
  .replace("https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js", "/vendor/pdf.min.js")
  .replace("https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js", "/vendor/pdf.worker.min.js")
  .replace("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js", "/vendor/jszip.min.js")
  .replace("https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js", "/vendor/mammoth.browser.min.js")
  .replace("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js", "/vendor/tesseract.min.js")
  .replace('new URL("ocr/", location.href)', 'new URL("/ocr/", location.href)');
if (html.includes("cdn.jsdelivr.net")) throw new Error("Une bibliothèque des outils PDF pointe encore vers un CDN.");
const skeleton = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>`;
html = skeleton + html.replace("<header class=\"top\">", "<header class=\"top\">") + "</body></html>";
fs.writeFileSync(pub("outils.html"), html);
console.log("build ok");
