# Architecture — « Listo » (nom de travail), outil type DropVin

Sources : `replica/dropvin/recon.md`, `replica/dropvin/features.csv`.
Marque, textes et visuels : 100 % propres. Rien n'est repris de l'original.

## 1. Stack

| couche | choix | pourquoi |
|---|---|---|
| App web | Next.js (App Router) + TypeScript | une seule base pour la landing et l'app, SSR pour le SEO |
| Style | Tailwind + tokens de `/replica-design` | rapide, identité propre |
| Base de données | Postgres sur Supabase | managé, gratuit au départ, RLS native |
| ORM | Drizzle | SQL lisible, migrations versionnées |
| Auth | Supabase Auth (email + mot de passe, reset, magic link) | inclus, comble le « mot de passe oublié » absent chez l'original |
| Fichiers | Supabase Storage (buckets privés + URLs signées) | captures, photos source, visuels générés |
| Paiement | Stripe Checkout + Billing + Customer Portal | abonnements mensuels/annuels, résiliation en self-service |
| Jobs | Inngest | génération longue (texte + images) avec retries, hors requête HTTP |
| Texte + vision IA | API Claude (lecture des captures, titre, description, hashtags, catégorie, score) | un seul modèle pour l'OCR et la rédaction |
| Visuel IA | API de génération/édition d'image (fal.ai ou Replicate, modèle d'édition produit) | mise en scène « studio » et « chez moi ». **Coût par image à mesurer avant de fixer les prix** |
| Données AliExpress | AliExpress Open Platform (API affiliés, clé à demander) | voie officielle. Repli : captures d'écran comme Temu/Shein |
| Email | Resend | emails transactionnels (bienvenue, reset, quota) |
| Hébergement | Vercel | déploiement git, cron intégré |
| Analytics | Plausible ou PostHog | mesure du funnel, conforme RGPD |

Une base, une app, pas de microservices.

## 2. Schéma

Voir `replica/dropvin/schema.sql`. 8 tables :

| table | rôle |
|---|---|
| `profiles` | 1:1 avec `auth.users` : plan, client Stripe, fuseau |
| `subscriptions` | miroir des abonnements Stripe (source de vérité : webhooks) |
| `stripe_events` | IDs d'événements déjà traités (idempotence) |
| `source_products` | produit importé : plateforme, URL, données extraites, prix d'achat confirmé |
| `source_files` | captures d'écran et photos uploadées (Storage) |
| `listings` | annonce générée : statut du job, titre, description, hashtags, prix conseillé, score, marge |
| `listing_images` | visuels IA d'une annonce (décor, chemin Storage) |
| `usage_daily` | compteur d'annonces par utilisateur et par jour (quota atomique) |

Choix :
- Accès : **RLS Postgres** sur toutes les tables (`user_id = auth.uid()`). Les écritures sensibles (plan, quota, abonnements, création d'annonces) passent uniquement par le service role côté serveur.
- Argent en centimes (`*_cents int`) + `currency`.
- Quota appliqué **en base** par `reserve_listing_quota()` : `insert ... on conflict do update ... where count < limit`. Deux onglets ne peuvent pas dépasser la limite.
- Le « jour » du quota se calcule dans le fuseau de l'utilisateur (par défaut `Europe/Paris`), pas en UTC.

Limites par plan (config dans le code) :

| plan | annonces | visuels/annonce | score /100 | décor « chez moi » |
|---|---|---|---|---|
| trial | 1 au total | 1 | non | non |
| pro | 3 / jour | 3 | non | non |
| booster | 10 / jour | 3 | oui | oui |

## 3. API

### F01 Essai / F03 Production d'annonces
| méthode chemin | rôle | qui | entrée | sortie |
|---|---|---|---|---|
| `POST /api/import` | crée `source_product` depuis un lien et détecte la plateforme | connecté | `{url}` | `{source_product_id, platform, needs_screenshots}` |
| `POST /api/import/:id/files` | upload des captures (3 max, 8 Mo, png/jpeg/webp) | propriétaire | multipart | `{files[]}` |
| `PATCH /api/import/:id` | confirme le prix d'achat et corrige les champs | propriétaire | `{purchase_price_cents, ...}` | produit |
| `POST /api/listings` | réserve le quota, crée l'annonce `queued`, envoie l'événement Inngest | propriétaire | `{source_product_id, decor}` | `{listing_id}` ou 402 quota |
| `GET /api/listings/:id` | état et résultat (Supabase Realtime, ou polling toutes les 2 s) | propriétaire | — | annonce + images |
| `PATCH /api/listings/:id` | édition titre, description, prix, case « vérifié » | propriétaire | champs | annonce |
| `POST /api/listings/:id/images/:imageId/regenerate` | régénère un visuel (limité à 2 par annonce) | propriétaire | — | image |
| `GET /api/listings` | historique paginé | propriétaire | `?cursor` | liste |
| `GET /api/me/usage` | quota du jour | connecté | — | `{used, limit}` |

### F02 Upgrade / F04 Résiliation
| méthode chemin | rôle | qui |
|---|---|---|
| `POST /api/billing/checkout` | session Stripe Checkout (`price_id` selon plan et période) | connecté |
| `POST /api/billing/portal` | ouvre le Customer Portal Stripe | connecté avec abonnement |
| `POST /api/webhooks/stripe` | `checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.payment_failed`, puis mise à jour de `subscriptions` et `profiles.plan` | Stripe (signature vérifiée) |

### Auth
`/signup`, `/login`, `/reset-password`, `/auth/callback` (Supabase).

### Jobs (Inngest)
| job | déclencheur | étapes |
|---|---|---|
| `listing.generate` | `POST /api/listings` | 1. extraction (API AliExpress ou vision Claude sur les captures) → 2. titre, description, hashtags, catégorie → 3. prix conseillé = f(prix d'achat, catégorie) → 4. N visuels IA selon le plan → 5. score et marge (Booster) → `ready`. Retry ×3 par étape. Échec définitif : `failed` + quota rendu (`release_listing_quota`) |
| `cleanup.orphans` | cron quotidien | supprime les fichiers Storage sans ligne liée depuis plus de 24 h |
| `retention.purge` | cron hebdo | supprime les captures sources de plus de 30 jours (minimisation RGPD) |

### Pages
`/` (S01–S03), `/signup` (S04), `/login` (S05), `/app` (S06), `/app/new` (S07), `/app/listings/[id]` (S08), `/app/account` (S09), `/legal/mentions`, `/legal/cgv`, `/legal/confidentialite`.

## 4. Les points qui mordent

- **Coût IA par annonce** : jusqu'à 3 visuels + 1 appel texte/vision. Un Pro annuel à 49 € qui consomme tout son quota (environ 1 000 annonces/an) est très probablement déficitaire. Mesurer le coût réel en M2 et ajuster prix ou quotas avant le lancement.
- **Ingestion** : l'API AliExpress demande une validation de compte (délai inconnu). Le repli par captures doit fonctionner pour les 3 plateformes dès M1.
- **Idempotence** : webhooks Stripe en double → `stripe_events` (PK = event id). Jobs Inngest avec clé d'idempotence `listing_id`.
- **Concurrence sur le quota** : réglée en SQL, quota rendu si le job échoue.
- **Fuseau horaire** : le quota repart à minuit, heure de l'utilisateur.
- **Fichiers** : 8 Mo max, png/jpeg/webp, buckets privés, URLs signées à 1 h.
- **Rate limits** : 10 req/min par utilisateur sur `/api/import` et `/api/listings`.
- **Contenu généré** : le prompt interdit marques, logos et allégations trompeuses. Case « J'ai vérifié » avant de copier.
- **RGPD** : suppression du compte → cascade SQL + purge Storage + annulation Stripe. Mentions légales, CGV et politique de confidentialité obligatoires.
- **Emails** : SPF/DKIM/DMARC configurés sur le domaine d'envoi avant le lancement.

## 5. Ordre de construction

**M1 — Tranche verticale (de bout en bout, sans finition)**
S04, S05, S07, S08 · tables `profiles`, `source_products`, `source_files`, `listings`, `listing_images` · `/api/import`, `/api/import/:id/files`, `/api/listings` + job `listing.generate` (captures uniquement, 1 visuel).
Critère : un compte uploade des captures et obtient une annonce copiable.

**M2 — Must-haves**
- Ingestion AliExpress par API + détection de plateforme
- Quotas (`usage_daily`) + S06 dashboard
- Stripe : checkout, portal, webhooks, `subscriptions`, `stripe_events`, S09
- Copier / télécharger, édition des champs
- Landing S01–S03 (identité propre), pages légales, reset password
- Mesure du coût IA réel par annonce

**M3 — Should-haves**
Score /100 + marge, décor « chez moi », historique paginé, régénération d'image, emails (bienvenue, quota atteint, paiement échoué).

**M4 — Could-haves**
Vidéo démo, process de garantie (formulaire + traitement manuel), analytics de funnel.
