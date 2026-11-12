## Parity: 57.2 / 100

features 57.2  (41 counted, must-haves 9 of 18 done)

Not shippable yet: 9 must-have features are not done.

## By area, weakest first
- outils                         0.0  (4 features)
- juridique                      0.0  (1 features)
- protéger                      25.0  (2 features)
- formulaires                   30.0  (2 features)
- partage                       50.0  (1 features)
- plateformes                   50.0  (1 features)
- convertir                     57.1  (8 features)
- signer                        59.1  (9 features)
- annoter                       60.0  (2 features)
- modifier                      73.1  (6 features)
- organiser                     80.8  (5 features)

## Missing, in build order
- [must] convertir: PDF vers Word, partial  (texte et titres seulement : ni images ni tableaux ni mise en page exacte)
- [must] convertir: Reconnaissance de texte d'un scan (OCR), partial  (texte récupéré en TXT Word ou PDF ; pas de couche de texte invisible ajoutée au PDF scanné)
- [must] convertir: Scanner un papier avec le téléphone, partial  (photo + effet scan ; pas de détection automatique des bords ni de recadrage)
- [must] convertir: Word vers PDF, partial  (titres paragraphes listes ; tableaux en texte ; ni images ni polices d'origine)
- [must] formulaires: Remplir un formulaire PDF, partial  (formulaires AcroForm oui ; formulaires XFA non)
- [must] modifier: Modifier le texte existant, partial  (texte réécrit par-dessus en Helvetica : police d'origine non conservée et pas de remise en page du paragraphe)
- [must] organiser: Compresser un PDF, partial  (les pages deviennent des images : texte non sélectionnable après compression)
- [must] signer: Faire signer à distance par lien, partial  (construit et testé en local ; pas encore en ligne (compte Cloudflare à créer))
- [must] signer: Notifications email (envoi du lien et copie signée), partial  (construit et testé ; nécessite un nom de domaine et un compte Resend ou Brevo)
- [should] annoter: Notes et commentaires, no
- [should] convertir: Rendre un scan consultable (texte sélectionnable dans le PDF), no
- [should] formulaires: Créer un formulaire à remplir (ajout de champs), no
- [should] protéger: Protéger par mot de passe, no
- [should] signer: Modèles réutilisables pour les envois à signer, no
- [should] signer: Relances automatiques des signataires, no  (renvoi manuel seulement)
- [should] signer: Vérification d'identité du signataire (code email ou SMS), no
- [should] modifier: En-têtes et pieds de page, partial  (pied de page seulement)
- [should] protéger: Masquer définitivement (caviardage), partial  (boîte noire puis Compresser pour effacer le texte dessous : deux étapes manuelles)
- [could] convertir: PDF vers Excel ou PowerPoint, no
- [could] juridique: Numérotation Bates, no
- [could] modifier: Modifier les images d'un PDF, no
- [could] organiser: Signets et table des matières, no
- [could] outils: Assistant IA (résumé et questions sur un PDF), no
- [could] outils: Comparer deux versions d'un PDF, no
- [could] outils: Export PDF/A pour l'archivage, no
- [could] outils: Vérification d'accessibilité, no
- [could] partage: Stockage et partage dans le cloud, partial  (documents à signer stockés côté serveur ; pas d'espace de fichiers général)
- [could] plateformes: Applications mobiles natives, partial  (site web adapté au téléphone ; pas d'application installable)

## Yours, not in the original (not scored)
- Cachet visuel de l'entreprise
- Lecture obligatoire de toutes les pages avant de signer
- Fichiers traités sur l'appareil sans envoi

## Écran par écran (comparaison visuelle)

Non faite. Elle demande des captures d'Acrobat prises dans le même état que les nôtres, et je n'ai accès ni à Acrobat ni à ton compte Adobe. Elle compte de toute façon peu : l'objectif est de faire le même travail, pas d'avoir le même aspect.

## Comportement

| Parcours | Acrobat | Ta version | Décision |
| --- | --- | --- | --- |
| Où sont traités les fichiers | sur l'ordinateur ou dans le cloud Adobe | sur ton appareil, jamais envoyés (outils PDF) | garder : c'est un argument |
| Modifier une phrase | le paragraphe se recompose, la police d'origine est gardée | réécriture par-dessus en Helvetica | garder pour des petites corrections ; pour un vrai texte, corriger le Word d'origine |
| Compresser | les images sont allégées, le texte reste sélectionnable | toutes les pages deviennent des images | à corriger (voir la liste ci-dessous) |
| Signature à distance | relances automatiques, vérification par code | renvoi manuel, lien personnel seulement | à ajouter |
| Preuve de signature | journal d'audit | journal + empreintes + lecture obligatoire + cachet | garder : au niveau, voire mieux sur la lecture obligatoire |
| Coût | abonnement d'environ 30 €/mois (chiffre donné par toi) | 0 €, plus le nom de domaine pour les emails | — |

Je n'ai pas mesuré le nombre de clics dans Acrobat : je n'ai pas accès au logiciel.

## Verdict

**Pas encore prêt pour remplacer Acrobat.** 9 des 18 fonctions indispensables ne sont que partielles. Sur ces 9 :
- **2 se règlent sans code** : la mise en ligne de la signature à distance et les emails (compte Cloudflare, nom de domaine, secrets GitHub).
- **4 sont réalisables** : compression qui garde le texte, scan consultable, recadrage du scan, formulaires.
- **3 resteront partielles** : conversion Word dans les deux sens, et modification du texte en gardant la police. C'est le cœur technique d'Acrobat ; pour ça, mieux vaut repartir du fichier Word d'origine.

## Les 5 prochaines choses à faire

1. **Mettre en ligne l'espace signature et les emails** (à toi, sans code) : 2 indispensables passent à « oui ».
2. **Compression qui garde le texte** : alléger seulement les images.
3. **Scan consultable** : ajouter le texte reconnu, invisible, sous l'image du scan, pour pouvoir le rechercher et le copier.
4. **Relances automatiques et code de vérification par email** pour les signataires.
5. **Recadrage du scan** : ajuster les 4 coins de la feuille sur la photo.

Source de la liste des fonctions d'Acrobat : connaissance générale du logiciel, sans analyse détaillée (`/replica-recon` n'a pas été lancé). Elle peut être incomplète.
