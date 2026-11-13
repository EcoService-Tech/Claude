// Toutes les routes /api/* : même serveur que sur Cloudflare, branché sur Netlify.
import worker from "../../src/worker.js";
import {withEnv} from "../../src/netlify-env.js";

export default async (req, context) => {
  // le serveur lit l'adresse IP et la localisation comme sur Cloudflare
  const headers = new Headers(req.headers);
  if (context?.ip) headers.set("cf-connecting-ip", context.ip);
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer();
  const r = new Request(req.url, {method: req.method, headers, body});
  Object.defineProperty(r, "cf", {value: {country: context?.geo?.country?.code || "", city: context?.geo?.city || ""}});
  return withEnv((env, ctx) => worker.fetch(r, env, ctx));
};

export const config = {path: "/api/*"};
