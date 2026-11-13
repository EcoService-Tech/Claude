#!/usr/bin/env bash
# Crée la base et le stockage Cloudflare s'ils n'existent pas, puis met le site en ligne.
set -euo pipefail
W="npx wrangler"
fail() { echo "::error::$1"; exit 1; }
[ -n "${CLOUDFLARE_API_TOKEN:-}" ] || fail "Secret GitHub CLOUDFLARE_API_TOKEN manquant."
# Identifiant du compte Cloudflare « salle de sports » (n'est pas un secret)
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-2f5d6b18ac3679c7880da2b482b1c511}"
ADMIN_CODE="${ADMIN_CODE:-}"

d1_id() { $W d1 list --json | node -e 'const l=JSON.parse(require("fs").readFileSync(0,"utf8"));const d=l.find(x=>x.name==="signature");process.stdout.write(d?d.uuid:"")'; }
kv_id() { $W kv namespace list | node -e 'const l=JSON.parse(require("fs").readFileSync(0,"utf8"));const d=l.find(x=>x.title==="signature-files"||x.title.endsWith("-signature-files"));process.stdout.write(d?d.id:"")'; }

D1=$(d1_id); if [ -z "$D1" ]; then echo "Création de la base de données…"; $W d1 create signature >/dev/null; D1=$(d1_id); fi
KV=$(kv_id); if [ -z "$KV" ]; then echo "Création du stockage des fichiers…"; $W kv namespace create signature-files >/dev/null; KV=$(kv_id); fi
[ -n "$D1" ] && [ -n "$KV" ] || fail "Impossible de créer la base ou le stockage : vérifie les permissions de la clé Cloudflare (D1 et Workers KV en modification)."

sed -i "s/REMPLACER_PAR_ID_D1/$D1/; s/REMPLACER_PAR_ID_KV/$KV/" wrangler.toml
$W d1 execute signature --remote --file schema.sql
$W deploy
# Code d'accès : facultatif. Sans lui, le gérant le choisit à la première connexion.
if [ "${#ADMIN_CODE}" -ge 12 ]; then echo "$ADMIN_CODE" | $W secret put ADMIN_TOKEN; fi
for k in EMAIL_PROVIDER EMAIL_API_KEY EMAIL_FROM OWNER_EMAIL; do
  if [ -n "${!k:-}" ]; then printf '%s' "${!k}" | $W secret put "$k"; fi
done
[ -n "${EMAIL_API_KEY:-}" ] || echo "::warning::Emails automatiques non configurés (secrets EMAIL_API_KEY et EMAIL_FROM absents)."
echo "Mise en ligne terminée."
