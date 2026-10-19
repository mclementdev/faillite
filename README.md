# À vous l'Élysée !

Jeu de soirée : ensemble, votre groupe fait campagne, remporte l'élection et gouverne la France pendant un ou
deux quinquennats (2027-2031 ou 2027-2036). Un grand écran pour l'hôte ; chaque participant vote sur son
téléphone après avoir scanné un QR code. Aucune option n'est présentée comme la bonne, aucune étiquette
politique : on montre seulement les impacts. Imaginé par François K.

> **Simplification pédagogique.** Le jeu part de chiffres officiels réels (INSEE, Banque de France, SDES,
> DREES, Citepa…), mais les effets des décisions sont des **ordres de grandeur plausibles, pas des prévisions**.
> Chaque effet porte une `hypothese` qui documente sa logique, pour qu'on puisse la relire et la discuter.

## Sommaire

1. [Lancer en local](#lancer-en-local)
2. [Déployer sur Vercel](#déployer-sur-vercel)
3. [Variables d'environnement](#variables-denvironnement)
4. [Architecture](#architecture)
5. [Ajouter une carte ou un événement](#ajouter-une-carte-ou-un-événement)
6. [Modifier les poids](#modifier-les-poids)
7. [Lancer une simulation](#lancer-une-simulation)
8. [Le modèle : indicateurs, jauges, effets](#le-modèle--indicateurs-jauges-effets)
9. [Règles du jeu tranchées](#règles-du-jeu-tranchées)
10. [Backoffice et sécurité](#backoffice-et-sécurité)
11. [Phase 2 : programmes des candidats](#phase-2--programmes-des-candidats)

## Lancer en local

Prérequis : Node.js 20 ou plus récent.

```bash
npm install
npm run dev
```

Ouvrez http://localhost:3000 sur l'ordinateur relié à l'écran, cliquez sur **Créer une salle**,
puis rejoignez depuis un téléphone du même réseau (QR code, ou http://IP-DE-L-ORDI:3000/rejoindre/CODE).

Sans variables Redis, les données vivent **en mémoire du processus** : parfait pour jouer ou développer en
local, mais tout est perdu au redémarrage.

Autres commandes :

| Commande | Rôle |
|---|---|
| `npm test` | tests du moteur, des salles et des accès admin (Vitest) |
| `npm run validate` | valide tout le contenu et liste les données provisoires |
| `npm run simulate` | simule 1 000 parties (voir plus bas) |
| `npm run typecheck` | vérification TypeScript |
| `npm run build` | build de production |

## Déployer sur Vercel

1. **Créer le projet** : poussez le dépôt sur GitHub, puis sur vercel.com « Add New → Project » et importez-le
   (framework détecté automatiquement : Next.js, aucune configuration). Ou en ligne de commande : `npx vercel`.
2. **Ajouter Redis** : dans le projet Vercel, onglet *Storage* → *Marketplace* → **Upstash for Redis** →
   créer une base (offre gratuite) et la connecter au projet. Les variables `KV_REST_API_URL` et
   `KV_REST_API_TOKEN` sont ajoutées automatiquement.
3. **Renseigner les variables** (*Settings → Environment Variables*) :
   - `ADMIN_SESSION_SECRET` : obligatoire, 32 caractères aléatoires (`openssl rand -base64 32`) ;
   - `ADMIN_EMAILS` : adresses autorisées au backoffice ;
   - `ADMIN_ACCESS_CODE` : optionnel mais recommandé (voir [sécurité](#backoffice-et-sécurité)).
4. **Déployer** : *Deployments → Redeploy* (ou `npx vercel --prod`). Chaque push sur la branche principale
   redéploie ensuite automatiquement.

La route de simulation déclare `maxDuration = 60` s : 1 000 parties prennent 10 à 15 s.

## Variables d'environnement

Voir `.env.example` (copiez-le en `.env.local` pour le développement).

| Variable | Obligatoire | Rôle |
|---|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | en production | Redis Upstash (fournies par l'intégration Vercel). Les noms `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` marchent aussi. |
| `ADMIN_EMAILS` | non | Adresses autorisées, séparées par des virgules. Défaut : `emmanuel@macron.fr`. |
| `ADMIN_SESSION_SECRET` | en production | Secret HMAC des cookies de session (16 caractères minimum). Sans lui en production, aucune session ne s'ouvre. |
| `ADMIN_ACCESS_CODE` | non | Si défini, le formulaire de connexion demande aussi ce code. |

Aucune clé de service temps réel n'est nécessaire.

## Architecture

```
engine/      moteur en TypeScript pur (aucune dépendance à Next ni à la base) — testable seul
  schema.ts    schémas zod de tout le contenu
  contenu.ts   validation + références croisées, erreurs « fichier › carte › champ »
  modele.ts    indicateurs → modificateurs, évolution naturelle, calcul des jauges
  cartes.ts    impacts estimés et niveaux (▼▼ ▼ – ▲ ▲▲), curseurs interpolés
  vote.ts      majorité, égalité et second tour, cumulable, médiane
  partie.ts    calendrier mois par mois : décisions, événements, crises, suites, promesses, alertes
  bilan.ts     bilan du mandat : « sans intervention », héritage à 10 ans, démagomètre
  simulation.ts  simulate(n, graine, poids, mode)
content/     contenu JSON : indicateurs, config (modèle, jauges, règles), cartes, événements, promesses, résonances
lib/         serveur : stockage Redis/mémoire, salles, vue publique, poids, admin
app/         Next.js App Router : pages et routes API
components/  écrans (hôte 1920×1080 mis à l'échelle, téléphone, backoffice)
tests/       Vitest
maquettes/   maquettes Claude Design (référence visuelle)
```

**Temps réel : interrogation régulière + cache CDN.** Vercel n'offre pas de WebSocket persistant. Les écrans
lisent `GET /api/salles/CODE` toutes les 1 à 1,5 s ; la réponse (état public, sans donnée personnelle) est
mise en cache **1 s** par le CDN de Vercel (`s-maxage=1`), donc 30 téléphones coûtent environ **une lecture
Redis par seconde** et non trente. C'est la solution la plus simple et la moins chère pour ~30 joueurs :
aucun service tiers, aucune clé, et une partie de 1 h 30 reste très en dessous des quotas Upstash gratuits.
Contrepartie : jusqu'à ~1,5 s de latence d'affichage, sans importance pour un vote d'une minute.

**Transitions côté serveur.** L'état d'une salle (Redis, expiration 12 h) est la source de vérité. Ouvrir
le vote fixe une échéance absolue ; la première lecture ou le premier vote qui arrive après l'échéance clôt
le vote. Chaque écriture passe par une **écriture conditionnelle sur le numéro de version** (script Lua),
pour qu'aucune transition ne soit appliquée deux fois. Les votes sont dans un hash Redis séparé
(un champ par participant : un vote par personne, modifiable jusqu'à la clôture). L'horloge des clients ne
sert qu'à afficher le minuteur (corrigée du décalage avec le serveur).

**Reconnexion.** Le participant reçoit un jeton conservé dans le navigateur (`localStorage`) : en revenant
sur la page, il retrouve son pseudo et son vote en cours. L'écran hôte garde de même un jeton secret qui
seul permet de piloter la partie ; tout autre navigateur ouvrant `/salle/CODE` est en lecture seule.

## Ajouter une carte ou un événement

**Cartes de décision.** Elles sont rangées par fichier dans `content/cartes/*.json` et chacune relève d'un
**ministère** (`economie_finances`, `travail`, `ecologie`, `agriculture`, `sante`, `education`, `armees`,
`interieur`, `justice`, `culture`, `logement`, `europe`). Pour un nouveau fichier, ajoutez-le aussi à
`FICHIERS_CARTES` dans `content/index.ts`.

```json
{
  "id": "eco-vitesse",
  "ministere": "ecologie",
  "type": "curseur",
  "titre": "Quelle vitesse maximale sur autoroute ?",
  "titreCourt": "Vitesse sur autoroute",
  "contexte": "Court contexte (260 caractères maximum).",
  "flash": "Flash info qui tombe à mi-vote pour relancer le débat (200 caractères maximum).",
  "curseur": { "min": 110, "max": 130, "pas": 10, "unite": "km/h" },
  "options": [
    {
      "id": "110", "valeur": 110, "titre": "110 km/h", "outil": "decret",
      "explication": "220 caractères maximum.",
      "effets": [ { "cible": "emissions_ges", "valeur": -3, "type": "durable", "hypothese": "…" } ]
    }
  ],
  "notePedagogique": "Le saviez-vous ? affiché après le vote."
}
```

- `type` : `unique` (2 à 4 options), `cumulable` (3 options et plus, les 2 plus votées sont retenues) ou
  `curseur` (options placées sur l'échelle ; les valeurs intermédiaires sont **interpolées**).
- `outil` (option) : `decret`, `loi`, `budget`, `referendum`, `negociation` ou `decision`. Il est affiché sur
  la carte ; un **référendum peut être rejeté** (risque de 5 % à 60 % selon la popularité), la mesure ne
  s'applique alors pas et le président perd 5 points de popularité.
- Le **coût en euros** affiché (« Coût ≈ 9 Md€/an ») est calculé à partir des effets sur `deficit_public`
  (en points de PIB, convertis avec `regles.pibMdEuros`). Les **pastilles** sont calculées, jamais saisies.
- La **réaction de l'opinion** est un effet sur l'indicateur `popularite` (estompé sur 3 ans).
- `conditions`, `annule`, `poids`, `titreCourt` : inchangés (voir le schéma `engine/schema.ts`).

**Événements** (`content/evenements.json`) :

- **brève** (`gravite` absent ou `"breve"`) : s'applique d'elle-même, avec ses `effets` ;
- **crise** (`"gravite": "crise"`) : ses `effets` sont le choc, puis le groupe vote une des `reponses`
  (2 à 4, même format qu'une option, avec un `outil`) ;
- `poids` : tirage au hasard (0 = jamais tiré au hasard) ; `alerte: "finances"` : tiré l'année suivant le
  passage de cette jauge sous le seuil ;
- `declenchePar` : décisions qui **peuvent** provoquer l'événement quelques mois plus tard. Jamais certain,
  jamais annoncé pendant le vote ; quand il survient, l'écran indique la décision en cause.

```json
"declenchePar": [
  { "carte": "eco-taxe-carbone", "options": ["100", "125", "150"], "chance": 0.35, "delai": [2, 7] },
  { "carte": "crise-banque", "options": ["laisser"], "chance": 0.5, "delai": [2, 6] }
]
```

`carte` peut viser une carte de décision (options ou valeurs de curseur) ou une crise (ses réponses).

**Promesses de campagne** (`content/promesses.json`) : `texte` (140 caractères), `realite` chiffrée révélée
au bilan avec sa `source`, `demago` de 0 (réaliste) à 3, `popularite` gagnée en la promettant, et la `carte`
dont les `options` la tiennent. Une promesse faite est forcément mise sur la table pendant le mandat.

Les **résonances** (`content/resonances.json`) déclenchent un effet supplémentaire quand certaines décisions
ont été prises (`si`) et pas d'autres (`sauf`), `apres` N années.

Après toute modification : `npm run validate` puis `npm test`. Les erreurs indiquent le fichier, la carte
et le champ, par exemple :
`content/evenements.json › « crise-banque » › declenchePar : carte inconnue « dette-notes »`.

## Modifier les poids

Chaque carte et chaque événement a un `poids` (≥ 0, 1 par défaut). À chaque décision, la carte est tirée au
hasard **proportionnellement aux poids** parmi les cartes éligibles (pas déjà jouées, conditions remplies,
poids > 0), en évitant le ministère de la décision précédente quand c'est possible. Les cartes liées aux
promesses de campagne ont un poids triplé, et sont imposées si le mandat touche à sa fin. Un poids de 0 désactive l'élément.

- **Valeurs par défaut** : le champ `poids` des fichiers de `content/`.
- **Valeurs modifiées** : backoffice `/admin`, onglets *Poids des cartes* / *Poids des événements*
  (filtre par ministère, case « Actif », bouton *Revenir aux valeurs par défaut*). Elles sont stockées dans
  Redis (seules les différences avec les défauts) et journalisées.
- **Une salle fige les poids à sa création** : une partie en cours ne change jamais de règles.

## Lancer une simulation

La même fonction `simulate(n, graine, poids, mode)` du moteur sert partout :

- **Backoffice** : onglet *Simulation*, bouton « Lancer 1 000 parties » (nombre, graine, un ou deux quinquennats, mode
  réglables), avec les poids actuels. Le dernier résultat est conservé.
- **Ligne de commande** (poids par défaut du contenu) :

  ```bash
  npm run simulate -- --n 1000 --graine 42
  npm run simulate -- --n 1000 --mode sans_intervention --annees 10
  npm run simulate -- --n 200 --json > resultat.json
  ```

- **Tests** : `tests/moteur.test.ts`.

Résultats : nombre moyen d'événements (dont crises et événements provoqués), distribution des 7 jauges en fin de partie (moyenne, médiane, 10e et 90e centiles), part des
parties où une jauge passe sous le seuil (et laquelle), fréquence de tirage de chaque carte et événement,
effet moyen de chaque option avec repérage des options **dominantes** (bien meilleures que leurs voisines sans
coût notable) ou **toujours perdantes**, et une phrase de synthèse.

En mode `aleatoire`, chaque partie simule une campagne (chaque promesse faite une fois sur deux) puis
12 votants qui votent au hasard.

## Le modèle : indicateurs, jauges, effets

- **Indicateurs** (`content/indicateurs.json`) : 49 chiffres réels, plus la cote de `popularite`, avec `valeur`, `unite`, `annee`,
  `source`, `url`, `provisoire`. Les valeurs `provisoire: true` sont introuvables, anciennes ou
  approximatives (liste : `npm run validate`).
- **Modèle** (`content/config/modele.json`) pour chaque indicateur :
  - `normalisation` : `lineaire` (`zero` → 0, `cent` → 100 ; `zero > cent` si « moins c'est mieux ») ou
    `cible` (100 à la valeur cible, 0 à ±`ecart` ; utilisé pour l'inflation et les prélèvements) ;
  - `min` / `max` : bornes réalistes, jamais dépassées ;
  - `dynamique` (évolution naturelle annuelle) : `derive` (tendance de fond, ex. vieillissement),
    `cible` (rappel vers une valeur d'équilibre qui peut dépendre d'autres indicateurs) et `variation`
    (accumulation, ex. dette += déficit − dette × croissance nominale). Termes :
    `coef × (source − ref)` ou `coef × source × source2`.
- **Jauges** (`content/config/jauges.json`) : six jauges du pays (Économie, Finances publiques, Cohésion
  sociale, Climat et nature, Services publics, Souveraineté), chacune moyenne pondérée d'au moins 5
  indicateurs normalisés, et la **popularité** du président (cote en %, qui réagit vite : chômage, prix,
  croissance, impôts, grèves, crises, promesses trahies). La cohésion sociale réunit l'ancienne paix sociale
  et l'ancienne cohésion. La **démographie n'est plus une jauge** : ses indicateurs restent visibles dans le
  panneau « Les vrais chiffres » et agissent sur les finances et les services. La `sensibilite` amplifie
  l'écart à la situation de départ : `jauge = départ + sensibilité × (moyenne − départ)`.
- **Règles** (`content/config/regles.json`) : seuil d'alerte (35), minuteur, nombre de joueurs, répétition
  des événements, seuils d'affichage des impacts (`seuilNotable` 0,3 et `seuilFort` 2 points de jauge).
- **Impact affiché d'une option** : on projette l'état actuel sans aléa avec et sans l'option, sur 6 ans (ou
  plus si l'effet est très différé), et on garde l'écart le plus fort sur chaque jauge.

Sans aucune décision, le modèle produit une France qui vieillit, dont la dette augmente lentement, dont les
services publics se dégradent et dont les émissions remontent légèrement (hypothèse : sans nouvelles
mesures, la baisse des émissions s'arrête et l'activité les fait remonter d'environ 2,5 Mt par an).

Équilibrage (400 parties d'un quinquennat, choix aléatoires, graine 42) : environ 8 événements par partie,
dont 2,3 provoqués par une décision et 1,8 crise ; 53 % des parties ont au moins une jauge en alerte
(popularité 35 %, économie 20 %, cohésion 13 %, climat 8 %, souveraineté 8 %). Popularité moyenne en fin de
mandat : 37 %. Un vrai groupe vote moins au hasard : attendez-vous à des écarts plus marqués.

## Règles du jeu tranchées

- **Tutoriel** : 6 écrans avant la campagne (une fois par salle, on peut le passer ; « Comment jouer » le
  rouvre depuis le salon). Les téléphones affichent un résumé en 3 points en attendant.
- **Campagne** : 8 promesses tirées au sort parmi 14, présentées une à une (20 s de vote : « On le promet ! »
  ou « Trop risqué » ; égalité tranchée au sort). Chaque promesse faite ajoute de la popularité de départ
  (44 % sans promesse, 68 % au maximum). Aucun chiffre n'est montré avant le bilan.
- **Investiture** : le programme s'affiche ; le groupe joue ensemble un seul président.
- **Le mandat, mois par mois** : une frise de janvier à décembre défile jusqu'au prochain arrêt.
  - 3 décisions par an, à des mois tirés au sort (au moins deux mois d'écart) ;
  - au plus 2 événements par an : alertes d'abord, puis événements provoqués par une décision, puis tirage
    au hasard (10 % par mois, 30 % à partir de juillet si l'année a été calme) ;
  - une **crise** exige une réponse votée, en plus des 3 décisions ;
  - en décembre, **bilan de l'année**, puis évolution naturelle du pays.
- **Vote** : 60 s par défaut (45/60/90 au choix). À mi-vote, le **flash info** de la carte tombe et ajoute
  15 s. **Égalité** : second tour de 20 s entre les ex aequo ; si l'égalité persiste, le sort tranche
  (animation). Personne n'a voté : le hasard choisit. Curseur : médiane des valeurs.
- **Promesses** : tenue si l'option retenue est l'une de celles qui la tiennent ; trahie sinon (perte de
  1 + la popularité qu'elle avait rapportée). Au bilan, le **démagomètre** donne la part de la démagogie
  possible (somme des notes `demago`) que le groupe a promise, avec la réalité chiffrée de chaque promesse.
- **Bilan du mandat** : jauges au départ, en fin de mandat, sans intervention (mêmes événements tirés au
  sort, aucune décision) et **héritage** dix ans après (projection sans nouvelle décision), décisions
  marquantes, moments clés (avec leur cause), enseignements.
- **Bouton Menu** à côté du logo sur le grand écran : retour à l'accueil après confirmation. La salle reste
  ouverte 12 h et l'accueil propose « Reprendre la salle ».
- **Neutralité** : le solde migratoire n'est noté dans aucune jauge ; les prélèvements obligatoires ont une
  normalisation « cible » ; les promesses couvrent toutes les sensibilités et ne citent aucun candidat.
- Une partie courte va de 2027 à 2031 (15 décisions, environ 1 h), une longue de 2027 à 2036 (30 décisions).
- 30 participants au plus par salle (`maxJoueurs`), pseudos en double suffixés (« Léa 2 »).

## Backoffice et sécurité

`/admin` : une page avec un champ **adresse e-mail**. Si l'adresse (en minuscules) figure dans
`ADMIN_EMAILS`, le serveur ouvre une session : cookie signé HMAC-SHA256, `HttpOnly`, `Secure` en production,
`SameSite=Lax`, valable 12 heures. Aucun e-mail n'est envoyé. Chaque route `/api/admin/*` et la page admin
vérifient la session côté serveur (adresse toujours autorisée, signature, expiration). Les tentatives de
connexion sont limitées à 10 par IP et par quart d'heure.

> ⚠️ **L'e-mail seul est une protection faible** : quiconque connaît ou devine une adresse autorisée peut
> entrer. Définissez `ADMIN_ACCESS_CODE` (un code long) pour exiger un second facteur, et gardez
> `ADMIN_SESSION_SECRET` secret. Le backoffice ne donne accès qu'aux poids, aux simulations et au journal.

## Phase 2 : programmes des candidats

Prévu dans les formats, rien n'est affiché en V1 :

- champ `positionsCandidats` dans chaque carte (option choisie, source, date, lien) ;
- dossier `content/programmes/` : un fichier par candidat au format `Programme` (`engine/schema.ts`),
  voir `content/programmes/README.md` et `_exemple.json` (fictif).

À terme, le bilan comparera les choix du groupe aux programmes et indiquera le plus proche, sans étiquette
politique.
