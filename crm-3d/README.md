# CRM 3D — atelier

CRM en 3D (Three.js) pour un atelier : postes de travail, véhicules en cours et stock de pièces sont des objets cliquables.
Les données d'exemple décrivent un garage automobile à Valencia.

## Lancer en local

Seul Node.js (version 18 ou plus) est nécessaire, aucune dépendance à installer.

```bash
cd crm-3d
npm start
```

Ouvrir ensuite http://localhost:4300. Les modifications faites dans l'appli sont réécrites directement dans `data/*.csv`.

## Données

- `data/stock.csv` : une ligne par pièce. `rayon` (lettre), `niveau` (1 à 3) et `place` (1 à 4) placent la pièce dans les rayonnages.
  « Bientôt en rupture » = quantité ≤ `seuil` ; « Rupture » = quantité 0.
- `data/dossiers.csv` : une ligne par ordre de réparation. `etape` vaut `Reçu`, `En cours`, `Terminé` ou `Livré`.
  `poste` vaut `Réception`, `Diagnostic`, `Pont 1`, `Pont 2`, `Pont 3`, `Carrosserie` ou `Parking sortie` (vide si livré).
  Dates au format `AAAA-MM-JJ`.

## Règles de calcul des 4 indicateurs

- **Dossiers en cours** : tous les dossiers non livrés.
- **Retards** : dossiers « Reçu » ou « En cours » dont la date prévue est passée (un véhicule terminé qui attend son client n'est pas compté).
- **Ruptures** : pièces à 0, avec le nombre de pièces bientôt en rupture en dessous.
- **CA du mois** : somme des montants des dossiers livrés pendant le mois en cours.

## Adapter à une autre activité

Remplacer les deux CSV et ajuster en haut du script de `index.html` : `POSTES`, `ZONES` (position des zones dans la scène) et `RAYON_NAMES`.
