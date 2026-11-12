# Ce que les utilisateurs reprochent, et ce qu'on en fait

**Échantillon** : 4 526 avis et commentaires réels, collectés le 12/11/2026.
- App Store (États-Unis, Espagne, France, Royaume-Uni) via le flux officiel d'Apple : Acrobat Reader (1 300), Acrobat Sign (491), DocuSign (961), et six logiciels de salles de sport (1 453 : Mindbody Business, Glofox, Trainingym, Wodify, PushPress, Virtuagym Coach).
- Hacker News via son API officielle : 321 commentaires.
- Rapports détaillés par groupe : `feedback-pdf.md`, `feedback-signature.md`, `feedback-gym.md`. Avis bruts : `reviews.csv`.

**Limites** : pas de Google Play, G2, Capterra, Trustpilot ni Reddit (non accessibles ou interdits à la collecte automatique). Les avis de logiciels de salle viennent surtout des applications membres, rarement des gérants. Les liens mènent à la page d'avis de l'application ; le numéro de chaque avis figure dans le lien.

## 1. Ce qu'ils détestent

1. **Résilier l'abonnement est un parcours du combattant, et on est prélevé quand même.** Acrobat : 96 avis à 1-2 étoiles, 4 pays. Même reproche pour DocuSign.
   - « I had to go through and re-cancel the exact same subscription THREE different times » — [avis](https://apps.apple.com/us/app/id469337564?see-all=reviews#review-14724288358)
   - « Anule mil veces la suscripción y la siguen cobrando » — [avis](https://apps.apple.com/es/app/id469337564?see-all=reviews#review-14684573306)
   - « Purposefully makes it impossible to cancel subscription » (DocuSign) — [avis](https://apps.apple.com/us/app/id474990205?see-all=reviews#review-14155779571)
2. **Les fonctions de base sont payantes.** Le thème prix et abonnement est le plus fréquent sur Acrobat : 228 avis, 5 sources. Dix avis visent précisément la modification réservée à l'abonnement.
   - « Calling yourself a PDF “editor” but making me pay money to use the MAIN function of the app (editing a pdf) is crazy work. » — [avis](https://apps.apple.com/us/app/id469337564?see-all=reviews#review-14603360098)
   - « You have to have a premium to EDIT A PDF? » — [avis](https://apps.apple.com/us/app/id469337564?see-all=reviews#review-14603837093)
3. **Se connecter pour signer est pénible.** Comptes, connexion Google qui échoue, application obligatoire : 83 avis à 1-2 étoiles sur Acrobat Sign et DocuSign, 4 pays.
   - « Create new adobe account just to use this stupid app, still says password doesn't match » — [avis](https://apps.apple.com/us/app/id481082197?see-all=reviews#review-13007334965)
   - « the web page tells me that I have to download an app » — [avis](https://apps.apple.com/us/app/id481082197?see-all=reviews#review-13639820971)
4. **Les logiciels de salle enferment les gérants dans des contrats longs.** Environ 6 avis, tous sur Mindbody (États-Unis) : **thème mince**, une seule source.
   - « They will scam you into a year long contract without your knowledge then refuse to cancel you. » — [avis](https://apps.apple.com/us/app/id599125654?see-all=reviews#review-14191405354)
   - « I requested to cancel but they put you on a 11 month cont[ract] » — [avis](https://apps.apple.com/us/app/id599125654?see-all=reviews#review-13046409959)
5. **Bugs et support absent.** Logiciels de salle : 337 avis sur les plantages et 116 sur le support, 4 sources. Signature : 151 avis sur les bugs.

## 2. Ce qui manque

1. **Le membre ne peut ni résilier ni suspendre son adhésion lui-même.** Glofox : environ 6 avis, 2 pays ; thème mince.
   - « Where is the cancel membership button there is nothing » — [avis](https://apps.apple.com/gb/app/id916224471?see-all=reviews#review-10907735032)
2. **Des décharges (waivers) qui s'affichent et se signent de façon fiable.** 4 avis (Mindbody, Glofox) ; mince mais au cœur de ton créneau.
   - « It makes it almost impossible to make sure all waivers have been signed by clients. » — [avis](https://apps.apple.com/us/app/id599125654?see-all=reviews#review-4612633433)
   - « Not able to view what I’m being asked to sign. The studio waiver doesn’t appear. » — [avis](https://apps.apple.com/us/app/id916224471?see-all=reviews#review-11766656470)
3. **Payer à l'usage pour quelques signatures**, plutôt qu'un abonnement : 2 avis DocuSign ; mince.
   - « I needed an ad hoc single envelope which I was happy to pay for » — [avis](https://apps.apple.com/us/app/id474990205?see-all=reviews#review-13436241550)

## 3. Ce que personne ne résout

- **Les petites salles et les coachs indépendants.** Les outils sont pensés pour les grandes chaînes ou pour tous les métiers à la fois. Preuve directe faible : 1 avis explicite.
  - « Nothing here for small practices. » — [avis](https://apps.apple.com/us/app/id599125654?see-all=reviews#review-2901381698)

## Plan de corrections (preuves × coût)

| # | Ce qu'on construit ou change | Taille | Qui s'en charge | Preuve |
| --- | --- | --- | --- | --- |
| 1 | Sans engagement, résiliable en un clic depuis l'appli, et rappel avant chaque renouvellement | S | /replica-launch | résiliation : 96 avis, 4 pays |
| 2 | Un seul prix, tout compris : aucune fonction de base bridée | S | /replica-launch | prix : 228 avis ; modification payante : 10 avis |
| 3 | Signer sans compte et sans application (déjà fait), à mettre en avant | fait | /replica-launch | connexion : 83 avis |
| 4 | Modèles « dossier d'adhésion » : contrat, règlement, RGPD, questionnaire de santé, décharge | M | /replica-build | décharges : 4 avis (mince) + ton propre métier |
| 5 | Demande de résiliation ou de suspension par le membre, signée et horodatée | M | /replica-build | résiliation des membres : environ 6 avis (mince) |
| 6 | Pack de signatures à l'unité, en plus de l'abonnement | S | /replica-launch | 2 avis (mince) |
| 7 | Support humain en français et en espagnol, avec un délai de réponse annoncé | process | toi | support : 116 avis |

## Angles de vente

A. **Pour les salles de sport et les coachs qui en ont assez des logiciels qui les enferment dans des contrats d'un an, [ta marque] fait signer le dossier d'adhésion complet en une minute, sur le téléphone du client, sans engagement et résiliable en un clic.**
   Preuves : résiliation difficile (96 avis, 4 pays) ; contrats imposés par les logiciels de salle (environ 6 avis, mince).
B. **Pour les indépendants qui paient Acrobat juste pour signer et modifier quelques PDF, [ta marque] fait tout pour un seul petit prix, sans fonctions verrouillées.**
   Preuves : prix et abonnement (228 avis, 5 sources) ; modification payante (10 avis).
C. **Pour ceux qui perdent des clients à cause des connexions et des applications imposées, [ta marque] : le client signe depuis un simple lien, sans compte.**
   Preuves : connexion et compte (83 avis, 4 pays).

**Recommandation : A**, en reprenant les arguments de B et de C. A est le seul angle où tu as un avantage que les grands n'ont pas : tu connais le métier. Mais la partie « salles de sport » repose sur des preuves minces (peu d'avis de gérants). Avant d'investir, valide-la en parlant à 10 gérants de salles à Valence.

Ne mets pas le nom d'Acrobat, de DocuSign ou de Mindbody dans ta marque, tes publicités ou ta fiche d'application. Une page de comparaison factuelle est une question juridique : demande à un avocat espagnol.

## 4. Fonctions réclamées qu'aucune de ces applications ne propose

Méthode : 268 avis à 3 étoiles ou moins qui signalent un manque (« no way to », « unable to », « I wish », « impossible de », « no permite », « falta »…), lus un par un ; les simples bugs ont été écartés. Le nombre donné est celui des avis distincts. **Mince** = moins de 3 avis ou un seul pays.

| # | Fonction manquante | Avis | Où | Chez toi | Effort |
| --- | --- | --- | --- | --- | --- |
| 1 | Le membre résilie ou suspend son adhésion lui-même | ~10 | Glofox, US GB ES | à construire | M |
| 2 | Signer avec son certificat électronique officiel (FNMT, DNIe) | 5 | Acrobat, Espagne + HN | seulement le sceau de l'entreprise | L |
| 3 | Décharges et questionnaires obligatoires, impossibles à oublier | 5 | Mindbody, Glofox, US | modèles à faire | M |
| 4 | Signature sur place, sur la tablette de l'accueil, sans email automatique | 4 | Acrobat Sign, US | possible avec l'Atelier, pas dans l'Espace signature | S |
| 5 | Suivi des envois : statut de chaque signataire, recherche | 4 | Acrobat Sign, US GB | déjà fait (tableau de bord) | — |
| 6 | Désactiver l'IA et ses bandeaux imposés | 4 | Acrobat, US GB FR ES | déjà : aucune IA imposée | — |
| 7 | Réservations récurrentes | 3 | Mindbody, US | hors périmètre (réservation) | — |
| 8 | Liste d'attente avec alerte quand une place se libère | 3 | Trainingym, Glofox, ES US | hors périmètre (réservation) | — |
| 9 | Synchronisation avec l'agenda du téléphone | 3 | Mindbody, Glofox, US GB | hors périmètre | — |
| 10 | Signer soi-même sans envoyer à personne | 3 | Acrobat Sign, US ES | déjà (Atelier > Signer) | — |
| 11 | Refuser de signer, avec un motif | 2 (mince) | DocuSign, US GB | à construire | S |
| 12 | Remplir des champs (date, cases à cocher) au moment de signer | 2 (mince) | DocuSign, Acrobat Sign | à construire | M |
| 13 | Reprendre plus tard un long formulaire | 2 (mince) | DocuSign | à construire | S |
| 14 | Relances automatiques | 2 (mince) | Acrobat Sign | déjà fait | — |
| 15 | Enregistrer sur le téléphone plutôt que dans le cloud | 2 (mince) | Acrobat, FR | déjà : tout reste sur l'appareil | — |
| 16 | Récupérer les données de ses membres en quittant le logiciel | 1 (mince) | Mindbody | à prévoir : export complet | S |
| 17 | Alerte avant la fin d'un pack de séances | 1 (mince) | Mindbody | hors périmètre (facturation) | — |
| 18 | Noter charges, poids et records à chaque exercice | 7 | Trainingym, PushPress, ES US | autre produit (suivi d'entraînement) | — |

Citations (texte exact, lien vers l'avis) :
- (1) « The app does not allow you to cancel or put membership on hold. » — [avis](https://apps.apple.com/gb/app/id916224471?see-all=reviews#review-10622814889) · « Easy to set up membership from the app but then no way to cancel. Apparently that has to be done in writing. » — [avis](https://apps.apple.com/gb/app/id916224471?see-all=reviews#review-7760253384)
- (2) « No deja firmar documentos con la firma electrónica emitida por la fábrica nacional de moneda y timbre » — [avis](https://apps.apple.com/es/app/id469337564?see-all=reviews#review-14390148042) · « No permite firmar con certificado digital. » — [avis](https://apps.apple.com/es/app/id481082197?see-all=reviews#review-5352241447)
- (3) « we are no longer prompted (nor can we force) a liability waiver signature for new students » — [avis](https://apps.apple.com/us/app/id599125654?see-all=reviews#review-4038523096)
- (4) « when we create the contact it sends them an email immediately and there is no way to turn this off » — [avis](https://apps.apple.com/us/app/id481082197?see-all=reviews#review-1336782907)
- (6) « No option to disable the GenAI header that opens on every document I open. » — [avis](https://apps.apple.com/gb/app/id469337564?see-all=reviews#review-13790766541)
- (8) « Debería tener una opción de “lista de espera” para notificar las cancelaciones » — [avis](https://apps.apple.com/es/app/id598249672?see-all=reviews#review-9696053432)
- (11) « No option to reject a document via the app. » — [avis](https://apps.apple.com/gb/app/id474990205?see-all=reviews#review-9352259229)
- (16) « They still refuse to furnish our members’ data » — [avis](https://apps.apple.com/us/app/id599125654?see-all=reviews#review-8965240261)

### Les meilleures opportunités pour toi

1. **Résiliation et suspension en libre-service, signées et horodatées** (n°1). C'est la plainte « fonction absente » la plus répétée côté salles, et elle colle à ton angle « sans enfermement ». Le membre envoie sa demande, la salle la valide, et les deux reçoivent un document signé. Vérifie avec un avocat ce que la loi espagnole impose pour la résiliation des adhésions.
2. **Signature par certificat officiel espagnol** (n°2). C'est spécifique à l'Espagne, peu servi par les grands outils, et une vraie différence sur ton marché. Faisable via l'application gratuite AutoFirma ; c'est le plus gros chantier de la liste.
3. **Dossier d'adhésion « incontournable »** (n°3) : la première réservation reste bloquée tant que le contrat, la décharge et le questionnaire de santé ne sont pas signés.
4. **Mode « signer ici, maintenant »** (n°4) : le client signe sur la tablette de l'accueil, sans email automatique.
5. **Refuser de signer, avec un motif** (n°11), et **export complet des données** (n°16) : petits chantiers, bons arguments de confiance.
