# Espace signature

Signature électronique à distance par lien, cachet de l'entreprise et sceau anti-modification (PAdES), plus les outils PDF.
Hébergé gratuitement sur Cloudflare (Workers + D1 + KV), mis en ligne automatiquement par GitHub Actions.

## Mise en ligne (une seule fois)

1. Crée un compte gratuit sur cloudflare.com, puis ouvre une fois « Workers & Pages » pour choisir ton sous-domaine `*.workers.dev`.
2. Crée une clé d'accès : Mon profil → Jetons d'API → Créer un jeton → modèle « Modifier Cloudflare Workers ».
   Ajoute la permission **Compte → D1 → Modifier**. Copie le jeton.
3. Note ton identifiant de compte (colonne de droite de la page « Workers & Pages »).
4. Dans GitHub : dépôt → Settings → Secrets and variables → Actions → New repository secret. Crée :
   - `CLOUDFLARE_API_TOKEN` : le jeton
   - `CLOUDFLARE_ACCOUNT_ID` : l'identifiant de compte
   - `SIGNATURE_ADMIN_CODE` : ton code d'accès à l'espace de gestion (12 caractères minimum)
5. Onglet Actions → « Mettre en ligne l'espace signature » → Run workflow.
   L'adresse du site s'affiche à la fin du journal (`https://signature.<ton-sous-domaine>.workers.dev`).

Ensuite, chaque modification poussée sur `master` remet le site à jour.

## Utilisation

- `/admin.html` : réglages de l'entreprise (cachet, logo, sceau), nouvelles demandes, suivi, finalisation.
- `/s/<lien>` : page de signature envoyée à chaque signataire.
- `/outils.html` : outils PDF.

## Développement local

```
npm ci && node scripts/build.mjs
echo 'ADMIN_TOKEN="un-code-de-test"' > .dev.vars
npx wrangler d1 execute signature --local --file schema.sql
npx wrangler dev --local
```
