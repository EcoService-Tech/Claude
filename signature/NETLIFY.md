# Mise en ligne sur Netlify

Le site est déjà construit dans `public/` (pages, bibliothèques, moteur de lecture de scan).
Les fonctions serveur sont dans `netlify/functions/` (`api.mjs` pour `/api/*`, `relances.mjs` chaque matin).
La base SQLite et les fichiers sont stockés dans Netlify Blobs (rien à créer à la main).

## Pour l'assistant qui publie (session avec accès réseau à Netlify)

1. Se placer dans le dossier `signature/` (il a son propre `netlify.toml` ; ne pas publier depuis la racine du dépôt,
   dont le `netlify.toml` sert au site rajola-evaluation).
2. Si les pages ou bibliothèques ont changé : `npm ci && node scripts/build.mjs`.
3. Outil Netlify `deploy-site` : nouveau site (le propriétaire a confirmé), nom proposé `espace-signature`.
   Lancer la commande renvoyée depuis `signature/`.
4. Ouvrir `https://<site>.netlify.app/admin.html` : écran « Bienvenue ! Choisis ton code d'accès ».
5. Emails (facultatif) : variables d'environnement du site `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`, `OWNER_EMAIL`.

## Tests locaux

`node scripts/build.mjs`, puis un serveur local qui importe `netlify/functions/api.mjs` avec
`setStoreFactory()` (stockage en mémoire) : voir l'historique Git du 13/11/2026.
