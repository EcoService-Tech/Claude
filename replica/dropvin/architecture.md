# Architecture — « Listo » (nom de travail), outil type DropVin

Sources : `replica/dropvin/recon.md`, `replica/dropvin/features.csv`.
Marque, textes et visuels : 100 % propres. Rien n'est repris de l'original.

## 0. Parcours cible (v2, demandé par l'utilisateur)

```
1. L'utilisateur colle l'URL du produit
2. L'IA identifie le produit et détecte seule le prix d'achat (+ livraison)
3. Le moteur de prix propose un prix de vente (coût de revient + frais plateforme + marge cible, vérifié contre les prix du marché)
4. L'IA génère l'annonce (titre, description, hashtags, visuels)
5. Publication automatique sur les plateformes connectées par l'utilisateur
```

### Détection automatique du produit et du prix, par source
| source | méthode | automatique ? |
|---|---|---|
| AliExpress | API officielle AliExpress Open Platform (détail produit : titre, photos, prix, variantes, livraison) | **oui, 100 %** |
| Temu, Shein | **Extension navigateur Listo** : sur la page produit que l'utilisateur a ouverte, un clic envoie le contenu de la page à Listo, puis l'IA (Claude) en extrait le titre, le prix, les photos et les variantes | **oui, en 1 clic** (ordinateur) |
| Temu, Shein depuis le mobile | partage de l'URL vers Listo + capture d'écran lue par l'IA (pas d'API officielle, et un fetch serveur est bloqué par l'anti-bot et contraire aux CGU) | semi-automatique |
| Autre site | extension navigateur + extraction IA | oui, en 1 clic |

### Moteur de prix
```
coût_de_revient = prix_achat + livraison + frais_fixes_douane (paramétrable)
prix_plancher   = (coût_de_revient + frais_fixes_plateforme) / (1 − commission_plateforme − marge_cible)
prix_marché     = médiane des annonces comparables (API eBay Browse, catalogue Shopify ; scraping des autres plateformes exclu)
prix_proposé    = max(prix_plancher, min(prix_marché × 0,95, prix_plancher × 2)), arrondi en x,90 / x9
```
Paramètres modifiables par l'utilisateur : marge cible (défaut 40 %), arrondi, frais de douane fixes.
Le prix proposé est **différent pour chaque plateforme**, car les commissions diffèrent.

### Publication automatique, par plateforme
| plateforme | voie officielle | automatique ? | condition |
|---|---|---|---|
| **Vinted** | API **Vinted Pro Integrations** | oui | compte **Vinted Pro** (statut pro) + intégration sur liste blanche Vinted (candidature, 4 à 6 semaines d'intégration annoncées par Vinted) |
| **Shopify** (boutique de l'utilisateur) | Admin API (OAuth) | oui | boutique Shopify |
| **Facebook / Instagram Shop, Google Shopping, TikTok Shop** | via la synchronisation du catalogue Shopify | oui | boutique Shopify + canaux activés |
| **eBay** | Sell Inventory API (OAuth) | oui | compte vendeur. La politique dropshipping eBay interdit d'acheter chez un autre détaillant pour livrer l'acheteur : à vérifier par l'utilisateur |
| **Leboncoin, Wallapop, Facebook Marketplace (particulier)** | pas d'API publique confirmée | **mode assisté** : annonce pré-remplie, photos enregistrées dans la galerie, texte copié, ouverture de l'appli en 1 tap | — |
| **Vinted (compte particulier, sans API)** | aucune | **mode assisté** uniquement. Pas de bot : automatiser un compte particulier enfreint les CGU Vinted et expose au bannissement | — |

Architecture « adaptateurs » : 1 module par plateforme (`publish`, `update`, `unpublish`, `sync_status`). Ajouter une plateforme = ajouter un adaptateur.

Synchronisation après publication : à chaque vente détectée (webhook ou polling de l'API), Listo retire l'annonce des autres plateformes pour éviter de vendre deux fois le même produit.

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
| Extension navigateur | Chrome/Edge/Firefox (Manifest V3), WXT | lecture de la page produit ouverte par l'utilisateur (Temu, Shein, autres) |
| Comparaison de prix | API eBay Browse | prix du marché, voie officielle |
| Publication | adaptateurs Vinted Pro API, Shopify Admin API, eBay Sell API | publication automatique |
| Secrets OAuth | chiffrement applicatif (AES-GCM, clé dans les variables d'env.) | jetons des plateformes jamais en clair en base |
| Email | Resend | emails transactionnels (bienvenue, reset, quota) |
| Hébergement | Vercel | déploiement git, cron intégré |
| Analytics | Plausible ou PostHog | mesure du funnel, conforme RGPD |

Une base, une app, pas de microservices.

## 2. Schéma

Voir `replica/dropvin/schema.sql`. 11 tables :

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
| `pricing_settings` | marge cible, frais de douane fixes, arrondi |
| `channel_accounts` | plateformes connectées (jetons OAuth chiffrés) |
| `publications` | 1 annonce × 1 plateforme : prix, statut, ID et URL externes |

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

### F06 Import automatique + prix
| méthode chemin | rôle | qui |
|---|---|---|
| `POST /api/import` | (v2) AliExpress : appel API, puis produit + prix remplis automatiquement | connecté |
| `POST /api/import/page` | reçoit le contenu de la page envoyé par l'extension → extraction IA | connecté (jeton extension) |
| `POST /api/pricing/:listingId` | calcule le prix proposé pour chaque plateforme connectée | propriétaire |
| `PATCH /api/me/pricing-settings` | marge cible, arrondi, frais fixes | connecté |

### F07 Plateformes et publication
| méthode chemin | rôle | qui |
|---|---|---|
| `GET /api/channels` | plateformes connectées et état | connecté |
| `GET /api/channels/:channel/connect` | démarre l'OAuth (Shopify, eBay, Vinted Pro) | connecté |
| `GET /api/channels/:channel/callback` | stocke les jetons chiffrés | connecté |
| `DELETE /api/channels/:id` | déconnecte la plateforme | propriétaire |
| `POST /api/listings/:id/publish` | publie sur les plateformes choisies (job `listing.publish`) | propriétaire |
| `DELETE /api/publications/:id` | retire l'annonce d'une plateforme | propriétaire |
| `POST /api/webhooks/shopify`, `/api/webhooks/ebay` | vente / stock modifiés → retrait des autres plateformes | plateformes (signature vérifiée) |

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
| `listing.publish` | `POST /api/listings/:id/publish` | pour chaque plateforme : adaptateur `publish` → `publications.status = live` + URL externe. Retry ×3, erreur stockée par plateforme |
| `publications.sync` | cron toutes les 15 min (plateformes sans webhook, ex. Vinted Pro) | statut, vente → retrait des autres plateformes |
| `channels.refresh_tokens` | cron horaire | renouvelle les jetons OAuth avant expiration |
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

**M2b — Import automatique + prix + publication**
- Moteur de prix + paramètres utilisateur
- Extension navigateur (Temu, Shein, autres sites)
- Adaptateurs Shopify puis eBay (APIs ouvertes, testables tout de suite)
- Candidature Vinted Pro Integrations **à envoyer dès le jour 1** (délai d'acceptation inconnu), puis adaptateur Vinted
- Mode assisté pour Leboncoin, Wallapop, Facebook Marketplace et Vinted sans API
- Synchronisation des ventes et retrait croisé

**M3 — Should-haves**
Score /100 + marge, décor « chez moi », historique paginé, régénération d'image, emails (bienvenue, quota atteint, paiement échoué).

**M4 — Could-haves**
Vidéo démo, process de garantie (formulaire + traitement manuel), analytics de funnel.
