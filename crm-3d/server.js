// Petit serveur local sans dépendance : sert l'appli et enregistre les modifications dans data/*.csv
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT) || 4300;
const KINDS = new Set(['stock', 'dossiers']);
const TYPES = { '.html': 'text/html; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

// index.html est écrit sans <html>/<head>/<body> (même format que la version publiée) : on ajoute le squelette ici.
const SKELETON = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);

  if (p === '/api/health') return send(res, 200, '{"ok":true}', TYPES['.json']);

  const save = p.match(/^\/api\/save\/([a-z]+)$/);
  if (save && req.method === 'POST') {
    if (!KINDS.has(save[1])) return send(res, 404, 'Fichier inconnu');
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 2e6) req.destroy(); });
    req.on('end', () => {
      const file = path.join(DATA, save[1] + '.csv');
      const tmp = file + '.tmp';
      try {
        fs.writeFileSync(tmp, body, 'utf8');
        fs.renameSync(tmp, file);
        send(res, 200, '{"ok":true}', TYPES['.json']);
      } catch (e) {
        send(res, 500, String(e.message));
      }
    });
    return;
  }

  if (req.method !== 'GET') return send(res, 405, 'Méthode non autorisée');

  if (p === '/' || p === '/index.html') {
    const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    return send(res, 200, SKELETON + page + '</body></html>', TYPES['.html']);
  }

  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Introuvable');
  send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
});

server.listen(PORT, () => console.log(`CRM 3D prêt : http://localhost:${PORT}`));
