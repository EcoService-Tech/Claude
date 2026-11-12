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
