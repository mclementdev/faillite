# Programmes des candidats (phase 2, non affichés en V1)

Un fichier JSON par candidat, au format `Programme` défini dans `engine/schema.ts`
(voir `_exemple.json`, qui n'est **pas** un vrai programme).

- `positions` : une entrée par **id de carte**. `option` vaut l'id de l'option choisie,
  une valeur de curseur (nombre) ou `"non_positionne"` si le programme est muet.
- Chaque position est **sourcée** : `source` (document), `date`, `url`, et si possible une
  courte `citation`.
- Aucune étiquette politique : seules les décisions et leurs impacts sont comparés.

Les cartes ont aussi un champ optionnel `positionsCandidats` (même structure) si l'on préfère
stocker les positions carte par carte. À la fin de la partie (phase 2), le jeu comparera les
choix du groupe à chaque programme (part des cartes jouées où le choix coïncide, distance sur
les curseurs) et affichera le programme le plus proche avec un récapitulatif.
