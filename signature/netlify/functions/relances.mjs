// Relances automatiques des signataires, chaque matin.
import worker from "../../src/worker.js";
import {withEnv} from "../../src/netlify-env.js";

export default async () => {
  await withEnv(async (env, ctx) => { await worker.scheduled({}, env, ctx); return new Response("ok"); });
  return new Response("ok");
};

export const config = {schedule: "17 8 * * *"};
