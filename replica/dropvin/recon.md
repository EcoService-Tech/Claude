# Recon — DropVin (https://www.dropvin.fr/)

Date : 2026-11-15 · Méthode : lecture des pages publiques (accueil, /login) à vitesse humaine. Pas de crawl, pas de code source, pas d'appels API.
Captures de référence : `replica/dropvin/screens/` (ne jamais les réutiliser dans le clone).

## 0. Constat préalable
- **Ce n'est pas du vin.** « DropVin » = Drop(shipping) + Vin(ted). SaaS qui transforme un lien produit AliExpress/Temu/Shein en annonce Vinted (visuel IA, titre, description, hashtags, prix conseillé).
- **Aucun lien avec le projet fitness / coaching / bien-être.**
- **Risque plateforme (à vérifier dans les CGU Vinted, non relues ici)** : Vinted est conçu pour que des particuliers revendent leurs propres articles. Les vendeurs pros relèvent de Vinted Pro. Revendre en série des produits Temu/Shein avec un compte particulier expose à la suspension, et en France au risque d'activité commerciale non déclarée. Une copie hérite de ce risque.
- **Mentions légales absentes** du site (pas de société, CGV, confidentialité). Pour un SaaS français payant, c'est un manquement.

## 1. Scope proposé
| question | proposition |
|---|---|
| App / plateforme | Web responsive, mobile-first (le lien est copié depuis l'appli AliExpress sur téléphone) |
| Slice | Boucle centrale : lien → extraction produit → annonce générée (texte + visuel IA) → copier. Plus auth, quotas et abonnement Stripe |
| Pour qui | **À décider** (cf. section 0) |

## 2. Sources
| source | URL | apport |
|---|---|---|
| Site marketing | https://www.dropvin.fr/ | positionnement, parcours, tarifs, FAQ |
| Connexion | https://www.dropvin.fr/login | méthode d'auth |
| Inscription | https://www.dropvin.fr/signup | non lue (lien vu sur /login) |
| Docs / changelog / API publique | aucune trouvée | — |
| Compte utilisateur | non utilisé | dashboard non observé, donc **inféré** |

## 3. Inventaire des écrans
| ID | écran | route | rôle | composants clés | états vus |
|---|---|---|---|---|---|
| S01 | Landing | `/` | conversion | nav pilule sticky, badge preuve sociale, hero 2 lignes (noir puis vert), champ lien + CTA, vidéo démo 26 s, stepper 3 étapes avec mockup téléphone, pricing 3 cartes avec bascule mensuel/annuel, FAQ accordéon, footer | desktop, mobile |
| S02 | Essai | `/#essayer` | saisie du lien | champ URL, aide « Temu/Shein : 3 captures » | vide |
| S03 | Démo « Nouvelle annonce » | section de S01 | montrer le résultat | carte annonce : visuel, titre, prix, hashtags, « Copier l'annonce » | rempli (illustratif) |
| S04 | Inscription | `/signup` | compte gratuit sans CB | (inféré) email, mot de passe | non vu |
| S05 | Connexion | `/login` | accès au dashboard | email, mot de passe, « Rester connecté », lien vers /signup. **Pas de mot de passe oublié** | vide |
| S06 | Dashboard / mes annonces | inféré | historique, quota du jour | liste, compteur de quota | non vu |
| S07 | Nouvelle annonce (app) | inféré | lien + upload de 3 captures | input, dropzone | non vu |
| S08 | Résultat annonce | inféré | vérifier puis copier | visuels IA (1 à 3), champs éditables, copier et télécharger, note /100 et marge (Booster) | non vu |
| S09 | Mon compte / abonnement | inféré | gérer le plan | lien vers le portail client Stripe | non vu |
| S10 | Checkout | Stripe hébergé | paiement | — | non vu |

## 4. Parcours
```
F01 Visiteur teste gratuitement
    S01 -> S02 colle un lien -> S04 inscription -> S08 annonce -> copie
    happy path ≈ 4 à 5 actions. Chiffre à battre.
    edge : lien invalide, Temu/Shein sans captures, extraction échouée, essai épuisé
F02 Upgrade
    S08 (quota atteint) -> S01#tarifs -> S10 Stripe Checkout -> S06
F03 Production quotidienne Pro/Booster
    S05 -> S06 -> S07 -> S08 (x3 ou x10 par jour)
    edge : quota atteint, génération IA lente ou en échec
F04 Résiliation
    S09 -> portail Stripe -> retour
F05 Garantie « aucune vente en 14 jours = 1er paiement remboursé »
    process non visible (probablement manuel, invérifiable côté DropVin)
```

## 5. Composants
| composant | variantes | écrans |
|---|---|---|
| Button | primaire vert pilule, ghost, avec flèche → | partout |
| UrlInput + CTA intégré | hero, téléphone | S01, S02, S07 |
| Badge preuve sociale | avatars + texte | S01 |
| Stepper 3 étapes | indicateurs à points | S01 |
| PhoneMockup | — | S01 |
| PricingCard | standard, « Recommandé » mis en avant | S01 |
| BillingToggle | mensuel / annuel | S01 |
| Accordion FAQ | fermé, ouvert (+) | S01 |
| ListingCard | visuel, titre, prix, hashtags, copier | S03, S08 |
| ScoreBadge /100 | — | S08 |
| Toast « copié » | inféré | S08 |
| Nav | desktop pilule, mobile burger | toutes |

Style observé : fond crème, texte quasi noir, accent vert, cartes très arrondies, sans-serif grasse. **Un clone doit avoir sa propre identité** (nom, logo, palette, textes).

## 6. Modèle de données inféré
```
User          id, email, password_hash, plan (trial|pro|booster), billing (monthly|yearly), stripe_customer_id
              evidence: S05, tarifs, FAQ « Mon compte > Gérer mon abonnement » · confiance: haute
Subscription  id, user_id, stripe_subscription_id, plan, status, current_period_end
              evidence: Stripe, renouvellement auto · confiance: haute
SourceProduct id, user_id, url, platform (aliexpress|temu|shein), title, photos[], specs (json),
              purchase_price, category, screenshots[]
              evidence: étape 2 « photos, caractéristiques, prix d'achat, catégorie » · confiance: haute
Listing       id, user_id, source_product_id, title, description, hashtags[], suggested_price,
              ai_images[], decor (studio|chez_moi), created_at
              evidence: S03, tarifs · confiance: haute
ProductScore  listing_id, score (0-100), est_margin, criteria (potentiel, marge, prix, catégorie, nb photos)
              evidence: FAQ 1 · confiance: moyenne (pondération inconnue)
UsageCounter  user_id, date, listings_count
              evidence: quotas 3 ou 10 par jour · confiance: moyenne (supposition)
```

## 7. Hors clone
- Marque, nom, logo, textes, vidéo, visuels d'exemple : appartiennent à DropVin.
- « +120 resellers » : chiffre qui n'est pas le nôtre (et invérifiable).
- Scraping AliExpress/Temu/Shein : contraire à leurs CGU et fragile (anti-bot). Les « 3 captures » de Temu/Shein suggèrent que DropVin lit les captures par vision IA (hypothèse). Voie propre : API AliExpress Affiliate/Open Platform, et captures fournies par l'utilisateur lues par vision IA.
- Publication automatique sur Vinted : pas d'API publique.

## 8. Dimensionnement
- Écrans : 10 (4 vus, 6 inférés) · Parcours : 5 · Entités : 6
- Parties difficiles :
  1. **Ingestion produit** fiable sur 3 plateformes
  2. **Visuel IA** crédible (mise en scène, décor « Chez moi ») avec un coût par image maîtrisé : à 49 €/an pour 3 annonces x 3 visuels par jour, la marge brute dépend entièrement de ce coût
  3. **Quotas + Stripe** (plans, annuel, portail, webhooks)
- Taille : **M** (quelques semaines) pour un MVP. Landing seule : **S** (1 à 2 jours).
