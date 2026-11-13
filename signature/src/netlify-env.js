// Fait tourner le serveur (écrit pour Cloudflare) sur Netlify, sans le réécrire :
// - la base SQLite vit dans un fichier stocké dans Netlify Blobs (sql.js, sans dépendance native) ;
// - chaque requête qui modifie la base l'enregistre avec une écriture conditionnelle (etag),
//   pour ne jamais écraser une signature arrivée au même moment ;
// - les fichiers (PDF, signatures, logo, sceau) vont dans un second espace Blobs.
import initSqlJs from "sql.js/dist/sql-asm.js";
import {getStore} from "@netlify/blobs";
import SCHEMA from "./schema.js";

let SQL = null;
let storeFactory = name => getStore({name, consistency: "strong"});
export const setStoreFactory = f => { storeFactory = f; };   // pour les tests locaux

const WRITE = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE)/i;
function d1(db, markDirty) {
  const exec = (sql, params, mode) => {
    if (WRITE.test(sql)) markDirty();
    const st = db.prepare(sql);
    try {
      st.bind(params.map(v => v === undefined ? null : v));
      if (mode === "run") { st.step(); return {meta: {changes: db.getRowsModified()}}; }
      const rows = []; while (st.step()) rows.push(st.getAsObject());
      return mode === "first" ? (rows[0] ?? null) : {results: rows};
    } finally { st.free(); }
  };
  const prepare = sql => {
    let params = [];
    const o = {bind: (...a) => { params = a; return o; }, first: async () => exec(sql, params, "first"), all: async () => exec(sql, params, "all"), run: async () => exec(sql, params, "run")};
    return o;
  };
  return {prepare, batch: async stmts => { const out = []; for (const s of stmts) out.push(await s.run()); return out; }};
}

function files() {
  const store = storeFactory("signature-files"), ttl = storeFactory("signature-temp");
  const temp = key => key.startsWith("mrate:") || key.startsWith("mcode:");
  const asBuf = d => d instanceof ArrayBuffer ? d : ArrayBuffer.isView(d) ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d;
  return {
    async get(key, type) {
      if (temp(key)) { const v = await ttl.get(key, {type: "json"}); return v && v.exp > Date.now() ? v.value : null; }
      return store.get(key, {type: type === "arrayBuffer" ? "arrayBuffer" : "text"});
    },
    async getWithMetadata(key, type) {
      const r = await store.getWithMetadata(key, {type: type === "arrayBuffer" ? "arrayBuffer" : "text"});
      return r ? {value: r.data, metadata: r.metadata || null} : {value: null, metadata: null};
    },
    async put(key, value, opts = {}) {
      if (temp(key)) return ttl.setJSON(key, {value, exp: Date.now() + (opts.expirationTtl || 600) * 1000});
      return store.set(key, typeof value === "string" ? value : asBuf(value), opts.metadata ? {metadata: opts.metadata} : {});
    },
    async delete(key) { return temp(key) ? ttl.delete(key) : store.delete(key); }
  };
}

function envVars() {
  const keys = ["ADMIN_TOKEN", "EMAIL_PROVIDER", "EMAIL_API_KEY", "EMAIL_FROM", "OWNER_EMAIL", "EMAIL_API_URL"];
  const get = k => (globalThis.Netlify?.env?.get?.(k)) ?? process.env[k];
  return Object.fromEntries(keys.map(k => [k, get(k)]).filter(([, v]) => v));
}

// Exécute fn(env, ctx) sur la base ; en cas d'écriture concurrente, recommence (3 essais).
export async function withEnv(fn) {
  SQL ??= await initSqlJs();
  const dbStore = storeFactory("signature-db");
  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await dbStore.getWithMetadata("db.sqlite", {type: "arrayBuffer"});
    const db = cur ? new SQL.Database(new Uint8Array(cur.data)) : new SQL.Database();
    let dirty = false;
    if (!cur) { db.exec(SCHEMA); dirty = true; }
    const pending = [];
    const env = {DB: d1(db, () => { dirty = true; }), FILES: files(), ...envVars()};
    let res;
    try {
      res = await fn(env, {waitUntil: p => pending.push(p)});
      await Promise.allSettled(pending);       // emails et journaux finis avant d'enregistrer
      if (!dirty) return res;
      const bytes = db.export();
      const w = await dbStore.set("db.sqlite", bytes, cur ? {onlyIfMatch: cur.etag} : {onlyIfNew: true});
      if (w.modified) return res;
    } finally { db.close(); }
  }
  return new Response(JSON.stringify({error: "Le serveur est très sollicité. Réessaie dans un instant."}), {status: 503, headers: {"content-type": "application/json; charset=utf-8"}});
}
