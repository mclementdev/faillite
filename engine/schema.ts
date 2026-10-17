/**
 * Schémas typés (zod) de tout le contenu du jeu.
 * Le moteur ne dépend ni de Next ni de la base : seulement de zod.
 */
import { z } from "zod";

export const JAUGES = [
  "economie",
  "finances",
  "paix_sociale",
  "ecologie",
  "services_publics",
  "cohesion",
  "demographie",
  "souverainete",
] as const;
export const JaugeId = z.enum(JAUGES);
export type JaugeId = z.infer<typeof JaugeId>;

export const THEMES = [
  "retraites",
  "fiscalite",
  "dette_depenses",
  "transition_ecologique",
  "energie",
  "sante",
  "education",
  "securite_justice",
  "logement",
  "emploi_travail",
  "demographie_migrations",
  "souverainete",
] as const;
export const Theme = z.enum(THEMES);
export type Theme = z.infer<typeof Theme>;

/* ------------------------------------------------------------------ */
/* Indicateurs (données réelles de départ)                             */
/* ------------------------------------------------------------------ */

export const Indicateur = z.object({
  nom: z.string().min(2),
  nomCourt: z.string().min(2).optional(),
  valeur: z.number(),
  unite: z.string(),
  annee: z.union([z.number().int(), z.string()]),
  source: z.string().min(2),
  url: z.string().url(),
  provisoire: z.boolean(),
  note: z.string().optional(),
  decimales: z.number().int().min(0).max(3).default(1),
});
export type Indicateur = z.infer<typeof Indicateur>;
export const Indicateurs = z.record(z.string(), Indicateur);

/* ------------------------------------------------------------------ */
/* Modèle : normalisation, bornes réalistes et évolution naturelle     */
/* ------------------------------------------------------------------ */

const Terme = z.object({
  source: z.string(),
  coef: z.number(),
  /** valeur de référence soustraite à la source (défaut 0) */
  ref: z.number().default(0),
  /** si présent, le terme vaut coef × source × source2 (ref ignorée) */
  source2: z.string().optional(),
});
export type Terme = z.infer<typeof Terme>;

export const Normalisation = z.union([
  /** linéaire : `zero` donne 0, `cent` donne 100 (zero > cent si « moins c'est mieux ») */
  z.object({ type: z.literal("lineaire"), zero: z.number(), cent: z.number() }),
  /** cible : 100 à la valeur cible, 0 à ±ecart (ex. inflation autour de 2 %) */
  z.object({ type: z.literal("cible"), cible: z.number(), ecart: z.number().positive() }),
]);
export type Normalisation = z.infer<typeof Normalisation>;

export const ModeleIndicateur = z.object({
  normalisation: Normalisation,
  min: z.number(),
  max: z.number(),
  dynamique: z
    .object({
      /** variation annuelle constante (tendance de fond) */
      derive: z.number().default(0),
      /** rappel vers une valeur cible : base += vitesse × (constante + Σ termes − base) */
      cible: z
        .object({
          constante: z.number(),
          vitesse: z.number().min(0).max(1),
          termes: z.array(Terme).default([]),
        })
        .optional(),
      /** variation proportionnelle à d'autres indicateurs : base += Σ termes */
      variation: z.array(Terme).default([]),
    })
    .default({}),
});
export type ModeleIndicateur = z.infer<typeof ModeleIndicateur>;
export const Modele = z.record(z.string(), ModeleIndicateur);

export const Jauge = z.object({
  nom: z.string(),
  nomCourt: z.string(),
  /**
   * Amplification des écarts à la situation de départ : jauge = départ + sensibilité × (moyenne − départ).
   * Le point de départ est inchangé ; une jauge peu réactive (indicateurs lents) devient lisible.
   */
  sensibilite: z.number().positive().default(1),
  indicateurs: z
    .array(z.object({ id: z.string(), poids: z.number().min(0), commentaire: z.string().optional() }))
    .min(5),
});
export const Jauges = z.record(JaugeId, Jauge);
export type Jauge = z.infer<typeof Jauge>;

export const Regles = z.object({
  anneeDepart: z.number().int(),
  toursPossibles: z.array(z.number().int().positive()),
  seuilAlerte: z.number(),
  dureeVoteSecondes: z.number().int().positive(),
  maxJoueurs: z.number().int().positive(),
  probaEvenement: z.number().min(0).max(1),
  evenements: z.object({
    delaiAvantRepetition: z.number().int().min(0),
    maxOccurrences: z.number().int().min(1),
    delaiEntreAlertesMemeJauge: z.number().int().min(0),
  }),
  impacts: z.object({
    /** horizon (années) sur lequel on mesure l'impact d'une option */
    horizon: z.number().int().min(1),
    /** en dessous : « pas d'effet notable » */
    seuilNotable: z.number().positive(),
    /** au-dessus : effet fort (▲▲ / ▼▼) */
    seuilFort: z.number().positive(),
  }),
  estompeDureeParDefaut: z.number().int().min(1),
});
export type Regles = z.infer<typeof Regles>;

/* ------------------------------------------------------------------ */
/* Effets, conditions, cartes, événements, résonances                  */
/* ------------------------------------------------------------------ */

export const TypeEffet = z.enum(["immediat", "differe", "durable", "estompe"]);
export type TypeEffet = z.infer<typeof TypeEffet>;

export const Effet = z
  .object({
    cible: z.string(),
    valeur: z.number(),
    type: TypeEffet,
    /** années avant application (type differe) */
    delai: z.number().int().min(1).optional(),
    /** durée de vie en années (immediat : 1 par défaut ; estompe : durée de résorption) */
    duree: z.number().int().min(1).optional(),
    hypothese: z.string().min(10, "chaque effet doit documenter son hypothèse"),
  })
  .superRefine((e, ctx) => {
    if (e.type === "differe" && e.delai === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "un effet « differe » doit avoir un « delai »", path: ["delai"] });
    }
  });
export type Effet = z.infer<typeof Effet>;

export const Condition = z.union([
  z.object({ jauge: JaugeId, inferieurA: z.number().optional(), superieurA: z.number().optional() }).strict(),
  z.object({ indicateur: z.string(), inferieurA: z.number().optional(), superieurA: z.number().optional() }).strict(),
  z.object({ tourMin: z.number().int().min(1) }).strict(),
  z.object({ carteJouee: z.string() }).strict(),
  z.object({ carteNonJouee: z.string() }).strict(),
]);
export type Condition = z.infer<typeof Condition>;

export const PositionCandidat = z.object({
  /** id de l'option choisie, valeur du curseur, ou "non_positionne" */
  option: z.union([z.string(), z.number()]),
  source: z.string(),
  date: z.string(),
  url: z.string().url(),
});

export const Option = z.object({
  id: z.string().min(1),
  titre: z.string().min(2).max(60),
  explication: z.string().min(10).max(220),
  /** "un_an" ou "plusieurs_annees" ; déduit des effets si absent */
  duree: z.enum(["un_an", "plusieurs_annees"]).optional(),
  /** valeur sur l'échelle (cartes curseur) */
  valeur: z.number().optional(),
  effets: z.array(Effet).min(1),
  /** ids de cartes dont les effets durables sont annulés par cette option */
  annule: z.array(z.string()).default([]),
});
export type Option = z.infer<typeof Option>;

export const Carte = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, "id en minuscules, chiffres et tirets"),
    theme: Theme,
    type: z.enum(["unique", "cumulable", "curseur"]),
    titre: z.string().min(5).max(90),
    /** nom court pour les récapitulatifs (ex. « Retraite : 64 ans ») */
    titreCourt: z.string().min(2).max(30).optional(),
    contexte: z.string().min(10).max(260),
    poids: z.number().min(0).default(1),
    conditions: z.array(Condition).default([]),
    curseur: z
      .object({ min: z.number(), max: z.number(), pas: z.number().positive(), unite: z.string() })
      .optional(),
    options: z.array(Option).min(2).max(5),
    notePedagogique: z.string().min(10),
    /** Phase 2 : positions des programmes des candidats (non affiché en V1) */
    positionsCandidats: z.record(z.string(), PositionCandidat).default({}),
  })
  .superRefine((c, ctx) => {
    const ids = new Set<string>();
    c.options.forEach((o, i) => {
      if (ids.has(o.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `option en double « ${o.id} »`, path: ["options", i, "id"] });
      ids.add(o.id);
    });
    if (c.type === "curseur") {
      if (!c.curseur) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "une carte curseur doit définir « curseur »", path: ["curseur"] });
      c.options.forEach((o, i) => {
        if (o.valeur === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "option de curseur sans « valeur »", path: ["options", i, "valeur"] });
        else if (c.curseur && (o.valeur < c.curseur.min || o.valeur > c.curseur.max))
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "valeur hors de l'échelle du curseur", path: ["options", i, "valeur"] });
      });
    } else if (c.options.length > 4) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "2 à 4 options pour une carte unique ou cumulable", path: ["options"] });
    }
    if (c.type === "cumulable" && c.options.length < 3) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "une carte cumulable a au moins 3 options (2 sont retenues)", path: ["options"] });
    }
  });
export type Carte = z.infer<typeof Carte>;

export const Evenement = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  titre: z.string().min(5).max(90),
  description: z.string().min(10).max(200),
  nature: z.enum(["positif", "negatif"]),
  poids: z.number().min(0).default(1),
  conditions: z.array(Condition).default([]),
  /** événement d'alerte : déclenché l'année suivant le passage de la jauge sous le seuil */
  declencheur: z.object({ jauge: JaugeId }).optional(),
  effets: z.array(Effet).min(1),
  notePedagogique: z.string().optional(),
});
export type Evenement = z.infer<typeof Evenement>;

/**
 * Imprévu : conséquence inattendue d'une décision, cachée pendant le vote et révélée
 * avec le résultat. Tiré au sort (probabilité `proba`) quand la carte ou l'option liée
 * est retenue ; au plus un imprévu par décision, chacun au plus une fois par partie.
 */
export const Imprevu = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  titre: z.string().min(5).max(90),
  description: z.string().min(10).max(220),
  nature: z.enum(["positif", "negatif"]),
  proba: z.number().min(0).max(1),
  si: z.union([
    z.object({ carte: z.string(), options: z.array(z.string()).min(1).optional() }).strict(),
    z.object({ theme: Theme }).strict(),
  ]),
  effets: z.array(Effet).min(1),
});
export type Imprevu = z.infer<typeof Imprevu>;

const ChoixRef = z.object({ carte: z.string(), options: z.array(z.string()).min(1) });

export const Resonance = z.object({
  id: z.string(),
  titre: z.string(),
  explication: z.string(),
  si: z.array(ChoixRef).min(1),
  sauf: z.array(ChoixRef).default([]),
  /** années à attendre après la dernière décision « si » */
  apres: z.number().int().min(0).default(0),
  effets: z.array(Effet).min(1),
});
export type Resonance = z.infer<typeof Resonance>;

/**
 * Phase 2 : programme d'un candidat (content/programmes/*.json), non utilisé en V1.
 * Pour chaque carte : l'option que choisirait le candidat (id d'option, valeur de curseur ou
 * "non_positionne"), avec la source précise de la position.
 */
export const Programme = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  candidat: z.string(),
  document: z.string(),
  date: z.string(),
  url: z.string().url(),
  positions: z.record(
    z.string(),
    z.object({
      option: z.union([z.string(), z.number()]),
      citation: z.string().max(300).optional(),
      source: z.string(),
      date: z.string(),
      url: z.string().url(),
    }),
  ),
});
export type Programme = z.infer<typeof Programme>;
