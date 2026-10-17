# Faillite !

Jeu de soirée : un groupe gouverne la France de 2027 à 2056 et découvre l'impact de chaque décision.
Un grand écran pour l'hôte, chaque participant vote sur son téléphone après avoir scanné un QR code.
Aucune option n'est présentée comme la bonne, aucune étiquette politique : on montre seulement les impacts.

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
  vote.ts      majorité, égalité, cumulable, médiane
  partie.ts    déroulé d'une année, tirages pondérés, alertes, résonances
  bilan.ts     bilan de fin de partie et trajectoire « sans intervention »
  simulation.ts  simulate(n, graine, poids, mode)
content/     contenu JSON : indicateurs, config (modèle, jauges, règles), cartes, événements, résonances
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

Les cartes sont réparties par thème dans `content/cartes/*.json`. Pour une nouvelle carte, ajoutez un objet
au fichier du thème ; pour un nouveau fichier, ajoutez-le aussi à `FICHIERS_CARTES` dans `content/index.ts`.

```json
{
  "id": "retraites-age",
  "theme": "retraites",
  "type": "curseur",
  "titre": "À quel âge part-on à la retraite ?",
  "titreCourt": "Retraite",
  "contexte": "Court contexte en 2 ou 3 lignes.",
  "poids": 1,
  "conditions": [],
  "curseur": { "min": 62, "max": 66, "pas": 1, "unite": "ans" },
  "options": [
    {
      "id": "64", "valeur": 64, "titre": "64 ans",
      "explication": "1 à 2 phrases : pourquoi ça joue sur les principaux paramètres.",
      "effets": [
        { "cible": "deficit_public", "valeur": -0.2, "type": "differe", "delai": 2,
          "hypothese": "La logique et l'ordre de grandeur qui justifient l'effet." }
      ]
    }
  ],
  "notePedagogique": "Une phrase sur le mécanisme réel.",
  "positionsCandidats": {}
}
```

- `type` : `unique` (2 à 4 options, majorité), `cumulable` (3 ou 4 options, les 2 plus votées sont retenues),
  `curseur` (options placées sur l'échelle ; les valeurs intermédiaires sont **interpolées**).
- `theme` : `retraites`, `fiscalite`, `dette_depenses`, `transition_ecologique`, `energie`, `sante`,
  `education`, `securite_justice`, `logement`, `emploi_travail`, `demographie_migrations`, `souverainete`.
- `conditions` (toutes doivent être vraies) : `{ "jauge": "finances", "inferieurA": 42 }`,
  `{ "indicateur": "chomage", "superieurA": 9 }`, `{ "tourMin": 6 }`, `{ "carteJouee": "id" }`,
  `{ "carteNonJouee": "id" }`.
- `effets[].cible` : un id de `content/indicateurs.json`, en **unités réelles** de l'indicateur.
- `effets[].type` : `immediat` (l'année seulement, ou `duree` ans), `differe` (à partir de N + `delai`,
  puis permanent ou `duree` ans), `durable` (tant que non annulé), `estompe` (appliqué tout de suite puis
  résorbé linéairement sur `duree` ans, 4 par défaut).
- `annule` (option) : liste d'ids de cartes dont les effets durables sont arrêtés.
- `duree` (option) : `un_an` / `plusieurs_annees` ; déduite des effets si absente.
- **Les pastilles de couleur ne se saisissent pas** : elles sont calculées à partir des effets réels.

Les **événements** sont dans `content/evenements.json` (`nature` : `positif`/`negatif`, `poids`,
`conditions`, `effets`). Un événement avec `"declencheur": { "jauge": "ecologie" }` est un **événement
d'alerte** : il n'est tiré que l'année suivant le passage de cette jauge sous le seuil.

Les **résonances** (`content/resonances.json`) déclenchent un effet supplémentaire quand certaines décisions
ont été prises (`si`) et pas d'autres (`sauf`), `apres` N années.

Les **imprévus** (`content/imprevus.json`) sont des conséquences inattendues, **cachées pendant le vote** :
ni texte ni pastille ne les annonce. Une fois la décision prise, chaque imprévu lié est tenté avec sa
probabilité `proba` ; au plus un est retenu par décision, et chacun survient au plus une fois par partie.
Il est révélé sur le grand écran et les téléphones avec ses effets chiffrés.

```json
{
  "id": "eco-gilets",
  "titre": "Fronde contre la taxe carbone",
  "description": "Ronds-points occupés chaque samedi : la colère s'étend aux zones rurales.",
  "nature": "negatif",
  "proba": 0.45,
  "si": { "carte": "eco-taxe-carbone", "options": ["150"] },
  "effets": [ { "cible": "jours_greve", "valeur": 150, "type": "estompe", "duree": 3, "hypothese": "…" } ]
}
```

`si` vise une carte (toutes ses options, ou seulement celles listées ; pour un curseur, n'importe quelle valeur de l'échelle, ex. `"22.5"`) ou un
thème entier (`{ "theme": "sante" }`, à garder rare : `proba` autour de 0,15). Il y a environ autant de
bonnes surprises que de mauvaises, et toutes les familles de choix en reçoivent.

Après toute modification : `npm run validate` puis `npm test`. Les erreurs indiquent le fichier, la carte
et le champ, par exemple :
`content/cartes/sante.json › « sante-hopital » › option « salaires » : effet sur un indicateur inconnu « deficit »`.

Le contenu est validé au premier chargement côté serveur ; un contenu invalide fait échouer les routes avec
un message détaillé dans les journaux.

## Modifier les poids

Chaque carte et chaque événement a un `poids` (≥ 0, 1 par défaut). À chaque tour, la carte est tirée au
hasard **proportionnellement aux poids** parmi les cartes éligibles (pas déjà jouées, conditions remplies,
poids > 0), en évitant le thème du tour précédent quand c'est possible. Un poids de 0 désactive l'élément.

- **Valeurs par défaut** : le champ `poids` des fichiers de `content/`.
- **Valeurs modifiées** : backoffice `/admin`, onglets *Poids des cartes* / *Poids des événements*
  (filtre par thème, case « Actif », bouton *Revenir aux valeurs par défaut*). Elles sont stockées dans
  Redis (seules les différences avec les défauts) et journalisées.
- **Une salle fige les poids à sa création** : une partie en cours ne change jamais de règles.

## Lancer une simulation

La même fonction `simulate(n, graine, poids, mode)` du moteur sert partout :

- **Backoffice** : onglet *Simulation*, bouton « Lancer 1 000 parties » (nombre, graine, 20/30 tours, mode
  réglables), avec les poids actuels. Le dernier résultat est conservé.
- **Ligne de commande** (poids par défaut du contenu) :

  ```bash
  npm run simulate -- --n 1000 --graine 42
  npm run simulate -- --n 1000 --mode sans_intervention --tours 20
  npm run simulate -- --n 200 --json > resultat.json
  ```

- **Tests** : `tests/moteur.test.ts`.

Résultats : distribution des 8 jauges en fin de partie (moyenne, médiane, 10e et 90e centiles), part des
parties où une jauge passe sous le seuil (et laquelle), fréquence de tirage de chaque carte et événement,
effet moyen de chaque option avec repérage des options **dominantes** (bien meilleures que leurs voisines sans
coût notable) ou **toujours perdantes**, et une phrase de synthèse.

En mode `aleatoire`, chaque partie simule 12 votants qui votent au hasard (ce qui exerce aussi les règles
d'égalité et de médiane).

## Le modèle : indicateurs, jauges, effets

- **Indicateurs** (`content/indicateurs.json`) : 49 chiffres réels avec `valeur`, `unite`, `annee`,
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
- **Jauges** (`content/config/jauges.json`) : moyenne pondérée des indicateurs normalisés, au moins
  5 indicateurs par jauge. Un indicateur peut alimenter plusieurs jauges. La `sensibilite` (1 par défaut)
  amplifie l'écart à la situation de départ : `jauge = départ + sensibilité × (moyenne − départ)`. La
  valeur de départ ne change pas ; une jauge faite d'indicateurs lents (cohésion, paix sociale) devient
  lisible. Réglage actuel : Économie 1,6 · Finances 1 · Paix sociale 2,2 · Écologie 2 · Services 2,2 ·
  Cohésion 4 · Démographie 1,1 · Souveraineté 2,2.
- **Règles** (`content/config/regles.json`) : seuil d'alerte (35), minuteur, nombre de joueurs, répétition
  des événements, seuils d'affichage des impacts (`seuilNotable` 0,3 et `seuilFort` 2 points de jauge).
- **Impact affiché d'une option** : on projette l'état actuel sans aléa avec et sans l'option, sur 6 ans (ou
  plus si l'effet est très différé), et on garde l'écart le plus fort sur chaque jauge.

Sans aucune décision, le modèle produit une France qui vieillit (démographie en baisse), dont la dette
augmente lentement malgré une consolidation spontanée quand elle dépasse 115 % du PIB, dont les services
publics se dégradent (déserts médicaux, délais de justice) et dont l'écologie se dégrade lentement : on fait
l'hypothèse que, sans nouvelles mesures, la baisse des émissions s'arrête et que l'activité les fait remonter
d'environ 2,5 Mt par an (`emissions_ges.dynamique.derive`), avec un recul de la biodiversité.

Équilibrage (1 000 parties, choix aléatoires, graine 42) : 89 % des parties ont au moins une alerte.
Finances 44 %, Démographie 39 %, Paix sociale 31 %, Économie 26 %, Services publics 22 %, Écologie 11 %,
Souveraineté 8 %, Cohésion 1 %. Un vrai groupe vote moins au hasard : attendez-vous à des écarts plus marqués.

## Règles du jeu tranchées

Points que le cahier des charges laissait ouverts, tranchés ainsi (modifiables dans le code ou la config) :

- **Tutoriel** : 6 écrans sur le grand écran avant le premier tour (une fois par salle, on peut le passer ;
  « Comment jouer » le rouvre depuis le salon). Les téléphones affichent un résumé en 3 points en attendant.
- **Bouton Menu** sur le grand écran (salon, tours, résultat, bilan) : retour à l'accueil après
  confirmation. La salle reste ouverte 12 h et l'accueil propose « Reprendre la salle ».
- **Présidence du sénat** : juste après le tutoriel, premier vote pour élire une personne de la salle (même
  minuteur ; on peut voter pour soi ; égalité ou absence de votes : le sort désigne). Ensuite, quand un vote
  est à égalité, **sa voix compte double** : son option l'emporte si elle fait partie des ex aequo. Sinon
  (elle a voté pour une autre option, ou pas du tout), le sort tranche comme avant. Pour un curseur, une
  « égalité » est un nombre pair de votes avec deux valeurs centrales différentes : la voix de la présidence
  est comptée une seconde fois, ce qui donne une médiane exacte. Sans participant, pas de présidence.
- **Un tour** : bilan (évolution naturelle + effets différés) → événement → carte affichée en lecture →
  l'hôte ouvre le vote (60 s par défaut, 45/60/90 s au choix) → résultat → l'hôte passe à l'année suivante.
- **Événement chaque année** (`probaEvenement` = 1). Un même événement ne revient pas avant 8 ans, au plus
  2 fois par partie. Si plusieurs jauges sont en alerte, l'événement d'alerte de la plus basse l'emporte ;
  une même jauge ne redéclenche pas d'alerte avant 3 ans.
- **Imprévus** : tirés après le vote, au plus un par décision ; leurs effets s'ajoutent à « Ce qui bouge ».
- **Personne n'a voté** : le hasard choisit (affiché comme tel).
- **Cumulable** : chaque participant a une voix ; les 2 options les plus votées sont retenues (égalité pour la
  2e place tirée au sort). Si une seule option a reçu des voix, elle seule est retenue.
- **Curseur** : médiane des valeurs ; avec un nombre pair de votes, moyenne des deux valeurs centrales
  ramenée à la valeur autorisée la plus proche (la plus basse en cas d'écart égal).
- **Égalité** (choix unique) : voix de la présidence comptée double, sinon tirage au sort reproductible
  (graine), animé sur le grand écran.
- **Les effets immédiats** ne durent qu'un an mais agissent sur la suite par la dynamique (un déficit d'un an
  laisse une dette plus élevée).
- **Démographie et neutralité** : le solde migratoire est un indicateur affiché mais **non noté** dans la
  jauge Démographie (poids 0) ; il n'agit que par ses effets mécaniques (cotisants par retraité, âge médian,
  part des 65 ans et plus).
- **Prélèvements obligatoires** : normalisation « cible » (ni trop bas ni trop haut) pour ne pas présenter
  une hausse ou une baisse d'impôts comme bonne en soi.
- **Annulation** : la carte « La réforme de l'âge fait toujours débat » (après la carte retraites, à partir du
  tour 6) peut annuler ses effets durables.
- Une partie de 30 tours va de 2027 à 2056, de 20 tours de 2027 à 2046. Pas de victoire ni de défaite.
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
