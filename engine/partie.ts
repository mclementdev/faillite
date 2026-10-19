/**
 * Déroulé d'une partie, mois par mois.
 *
 * Chaque année a 12 mois. On avance jusqu'au prochain « arrêt » :
 *   - un événement (au plus `maxParAn` par an) : déclenché par une décision passée, par une
 *     alerte de jauge, ou tiré au hasard ; une brève s'applique, une crise appelle un vote ;
 *   - une décision (`decisionsParAn` par an, à des mois tirés au sort) : une carte d'un ministère.
 * En fin d'année : historique, résonances, alertes, évolution naturelle du modèle.
 *
 * Les fonctions modifient l'état reçu (objet JSON pur, sérialisable tel quel).
 */
import { dureeOption, horizonEffets, impactsEffets, optionsRetenues, valeursCurseur } from "./cartes";
import type { Contenu } from "./contenu";
import {
  calculerJauges,
  effetsVersModificateurs,
  evoluerBase,
  projeter,
  valeurModificateur,
  valeursEffectives,
  valeursInitiales,
  type Modificateur,
  type Valeurs,
  type ValeursJauges,
} from "./modele";
import { flux, tirerPondere, type Rng } from "./rng";
import { JAUGES, type Carte, type Condition, type Effet, type Evenement, type JaugeId, type Outil } from "./schema";
import { resoudreVote, type ResultatVote } from "./vote";

export interface Poids {
  cartes: Record<string, number>;
  evenements: Record<string, number>;
}

export type Impacts = Record<JaugeId, number>;

/** Décision passée à l'origine d'un événement (affichée quand l'événement survient). */
export interface Cause {
  carte: string;
  titre: string;
  annee: number;
  mois: number;
}

export interface EvenementTire {
  id: string;
  annee: number;
  mois: number;
  /** jauge dont l'alerte a provoqué l'événement */
  alerte?: JaugeId;
  cause?: Cause;
  /** impacts estimés du choc */
  impacts: Impacts;
  /** index de la décision prise en réponse (crise) */
  reponse?: number;
}

export interface Decision {
  annee: number;
  mois: number;
  /** numéro de l'étape dans la partie */
  etape: number;
  /** id de la carte, ou de l'événement pour une réponse de crise */
  carte: string;
  crise?: boolean;
  options: string[];
  valeur?: number;
  titre: string;
  duree: "un_an" | "plusieurs_annees";
  outil: Outil;
  impacts: Impacts;
  vote?: ResultatVote;
  /** référendum rejeté : aucun effet de la mesure */
  rejete?: boolean;
  /** promesse de campagne concernée par cette carte */
  promesse?: { id: string; tenue: boolean };
}

export interface BilanAnnee {
  annee: number;
  jauges: ValeursJauges;
  indicateurs: Valeurs;
}

/** Événement programmé pour un mois donné (mois absolu = année × 12 + mois − 1). */
export interface Planifie {
  evenement: string;
  moisAbsolu: number;
  /** au-delà, l'événement est abandonné s'il n'a pas trouvé de place */
  limite: number;
  alerte?: JaugeId;
  cause?: Cause;
}

export interface Etape {
  n: number;
  annee: number;
  mois: number;
  type: "decision" | "evenement";
  /** carte de décision */
  carte?: string;
  evenement?: EvenementTire;
  /** impacts estimés de chaque option (carte, curseur par valeur, ou réponses de crise) */
  impactsOptions: Record<string, Impacts>;
  /** résonances déclenchées à la fin de l'année précédente (montrées au premier arrêt) */
  resonances: string[];
  decision?: number;
}

export interface EtatPartie {
  graine: number;
  nbAnnees: number;
  anneeDepart: number;
  annee: number;
  termine: boolean;
  sansIntervention: boolean;
  base: Valeurs;
  mods: Modificateur[];
  poids: Poids;
  /** dernier créneau traité dans l'année : mois × 2 + (0 événement, 1 décision), −1 en janvier */
  creneau: number;
  /** mois des décisions de l'année en cours */
  moisDecisions: number[];
  evenementsAnnee: number;
  planifies: Planifie[];
  cartesJouees: string[];
  ministeres: string[];
  evenements: EvenementTire[];
  resonances: { id: string; annee: number }[];
  decisions: Decision[];
  /** promesses de campagne faites par le groupe, et toutes celles proposées */
  promesses: string[];
  promessesProposees: string[];
  historique: BilanAnnee[];
  jaugesDepart: ValeursJauges;
  indicateursDepart: Valeurs;
  jaugesDebutAnnee: ValeursJauges;
  nbEtapes: number;
  etape?: Etape;
}

export interface OptionsPartie {
  graine: number;
  /** durée en années (5 = un quinquennat) */
  nbAnnees: number;
  poids?: Partial<Poids>;
  sansIntervention?: boolean;
  /** promesses faites pendant la campagne (ids), et toutes celles proposées */
  promesses?: string[];
  promessesProposees?: string[];
}

export function poidsParDefaut(contenu: Contenu): Poids {
  return {
    cartes: Object.fromEntries(contenu.cartes.map((c) => [c.id, c.poids])),
    evenements: Object.fromEntries(contenu.evenements.map((e) => [e.id, e.poids])),
  };
}

const moisAbsolu = (annee: number, mois: number) => annee * 12 + mois - 1;

export function nbDecisionsPartie(contenu: Contenu, nbAnnees: number): number {
  return nbAnnees * contenu.regles.decisionsParAn;
}

/** Popularité de départ : l'état de grâce, plus ce que rapportent les promesses faites. */
export function populariteDepart(contenu: Contenu, promesses: string[]): number {
  const c = contenu.regles.campagne.popularite;
  const bonus = promesses.reduce((s, id) => s + (contenu.promesses.find((p) => p.id === id)?.popularite ?? 0), 0);
  return Math.min(c.max, c.depart + bonus);
}

export function creerPartie(contenu: Contenu, opts: OptionsPartie): EtatPartie {
  const defaut = poidsParDefaut(contenu);
  const poids: Poids = {
    cartes: { ...defaut.cartes, ...(opts.poids?.cartes ?? {}) },
    evenements: { ...defaut.evenements, ...(opts.poids?.evenements ?? {}) },
  };
  const promesses = (opts.promesses ?? []).filter((id) => contenu.promesses.some((p) => p.id === id));
  const base = valeursInitiales(contenu);
  if ("popularite" in base) base.popularite = populariteDepart(contenu, promesses);
  const annee = contenu.regles.anneeDepart;
  const eff = valeursEffectives(contenu, base, [], annee);
  const jauges = calculerJauges(contenu, eff);
  const etat: EtatPartie = {
    graine: opts.graine >>> 0,
    nbAnnees: opts.nbAnnees,
    anneeDepart: annee,
    annee,
    termine: false,
    sansIntervention: !!opts.sansIntervention,
    base,
    mods: [],
    poids,
    creneau: -1,
    moisDecisions: [],
    evenementsAnnee: 0,
    planifies: [],
    cartesJouees: [],
    ministeres: [],
    evenements: [],
    resonances: [],
    decisions: [],
    promesses,
    promessesProposees: opts.promessesProposees ?? promesses,
    historique: [],
    jaugesDepart: jauges,
    indicateursDepart: eff,
    jaugesDebutAnnee: jauges,
    nbEtapes: 0,
  };
  planifierAnnee(contenu, etat);
  return etat;
}

/** Mois des décisions de l'année : tirés au sort, au moins 2 mois d'écart. */
export function moisDesDecisions(n: number, rng: Rng): number[] {
  for (let essai = 0; essai < 50; essai++) {
    const mois = new Set<number>();
    while (mois.size < n) mois.add(1 + Math.floor(rng() * 12));
    const tri = [...mois].sort((a, b) => a - b);
    if (tri.every((m, i) => i === 0 || m - tri[i - 1] >= 2)) return tri;
  }
  return Array.from({ length: n }, (_, i) => Math.round(((i + 0.5) * 12) / n));
}

function planifierAnnee(contenu: Contenu, etat: EtatPartie) {
  etat.creneau = -1;
  etat.evenementsAnnee = 0;
  etat.moisDecisions = etat.sansIntervention ? [] : moisDesDecisions(contenu.regles.decisionsParAn, flux(etat.graine, "calendrier", etat.annee));
  etat.jaugesDebutAnnee = jaugesActuelles(contenu, etat);
}

/* ------------------------------------------------------------------ */

export function effectifs(contenu: Contenu, etat: EtatPartie): Valeurs {
  return valeursEffectives(contenu, etat.base, etat.mods, etat.annee);
}

export function jaugesActuelles(contenu: Contenu, etat: EtatPartie): ValeursJauges {
  return calculerJauges(contenu, effectifs(contenu, etat));
}

function conditionsRemplies(conds: Condition[], etat: EtatPartie, jauges: ValeursJauges, eff: Valeurs): boolean {
  return conds.every((c) => {
    if ("jauge" in c) {
      const v = jauges[c.jauge];
      return (c.inferieurA === undefined || v < c.inferieurA) && (c.superieurA === undefined || v > c.superieurA);
    }
    if ("indicateur" in c) {
      const v = eff[c.indicateur];
      return (c.inferieurA === undefined || v < c.inferieurA) && (c.superieurA === undefined || v > c.superieurA);
    }
    // Les conditions en « tours » comptent les décisions déjà prises.
    if ("tourMin" in c) return etat.decisions.filter((d) => !d.crise).length + 1 >= c.tourMin;
    if ("carteJouee" in c) return etat.cartesJouees.includes(c.carteJouee);
    if ("carteNonJouee" in c) return !etat.cartesJouees.includes(c.carteNonJouee);
    return true;
  });
}

/** Cartes tirables, avant le filtre « pas deux fois le même ministère ». */
export function cartesEligibles(contenu: Contenu, etat: EtatPartie, jauges: ValeursJauges, eff: Valeurs): Carte[] {
  return contenu.cartes.filter(
    (c) => (etat.poids.cartes[c.id] ?? c.poids) > 0 && !etat.cartesJouees.includes(c.id) && conditionsRemplies(c.conditions, etat, jauges, eff),
  );
}

/** Cartes des promesses de campagne pas encore abordées. */
function cartesPromises(contenu: Contenu, etat: EtatPartie): string[] {
  return etat.promesses
    .map((id) => contenu.promesses.find((p) => p.id === id)?.carte)
    .filter((c): c is string => !!c && !etat.cartesJouees.includes(c));
}

export function tirerCarte(contenu: Contenu, etat: EtatPartie, jauges: ValeursJauges, eff: Valeurs): Carte | undefined {
  let eligibles = cartesEligibles(contenu, etat, jauges, eff);
  const promises = new Set(cartesPromises(contenu, etat));
  const decisionsFaites = etat.decisions.filter((d) => !d.crise).length;
  const restantes = nbDecisionsPartie(contenu, etat.nbAnnees) - decisionsFaites;
  // Les promesses de campagne doivent être abordées pendant le mandat.
  const aTenir = eligibles.filter((c) => promises.has(c.id));
  if (aTenir.length && restantes <= aTenir.length) eligibles = aTenir;
  const dernier = etat.ministeres[etat.ministeres.length - 1];
  const autres = eligibles.filter((c) => c.ministere !== dernier);
  if (autres.length) eligibles = autres;
  const poids = (c: Carte) => (etat.poids.cartes[c.id] ?? c.poids) * (promises.has(c.id) ? 3 : 1);
  return tirerPondere(eligibles, poids, flux(etat.graine, "carte", etat.nbEtapes));
}

function evenementsAleatoiresEligibles(contenu: Contenu, etat: EtatPartie, jauges: ValeursJauges, eff: Valeurs): Evenement[] {
  const r = contenu.regles.evenements;
  return contenu.evenements.filter((e) => {
    if (e.alerte) return false;
    if ((etat.poids.evenements[e.id] ?? e.poids) <= 0) return false;
    const passes = etat.evenements.filter((x) => x.id === e.id);
    if (passes.length >= r.maxOccurrences) return false;
    if (passes.some((x) => etat.annee - x.annee < r.delaiAvantRepetition)) return false;
    return conditionsRemplies(e.conditions, etat, jauges, eff);
  });
}

/* ------------------------------------------------------------------ */
/* Avancer dans l'année                                                */

/**
 * Avance jusqu'au prochain arrêt de l'année (événement ou décision) et le prépare.
 * Renvoie `undefined` quand l'année est finie : appeler alors `terminerAnnee`.
 */
export function prochaineEtape(contenu: Contenu, etat: EtatPartie): Etape | undefined {
  if (etat.termine) throw new Error("La partie est terminée.");
  if (etat.etape && !etapeTerminee(etat.etape)) return etat.etape;
  const r = contenu.regles.evenements;
  for (let c = etat.creneau + 1; c < 24; c++) {
    const mois = Math.floor(c / 2) + 1;
    etat.creneau = c;
    if (c % 2 === 0) {
      const tire = evenementDuMois(contenu, etat, mois, r.maxParAn);
      if (tire) return (etat.etape = preparerEvenement(contenu, etat, tire.evt, mois, tire));
    } else if (etat.moisDecisions.includes(mois)) {
      const eff = effectifs(contenu, etat);
      const carte = tirerCarte(contenu, etat, calculerJauges(contenu, eff), eff);
      if (!carte) continue;
      return (etat.etape = {
        n: etat.nbEtapes++,
        annee: etat.annee,
        mois,
        type: "decision",
        carte: carte.id,
        impactsOptions: impactsCarte(contenu, etat, carte),
        resonances: resonancesAMontrer(etat),
      });
    }
  }
  etat.etape = undefined;
  return undefined;
}

function etapeTerminee(e: Etape): boolean {
  if (e.type === "decision") return e.decision !== undefined;
  return !e.evenement || Object.keys(e.impactsOptions).length === 0 || e.decision !== undefined;
}

/** Une étape attend-elle un vote ? (carte de décision, ou crise) */
export function etapeAVoter(e: Etape | undefined): boolean {
  return !!e && e.decision === undefined && Object.keys(e.impactsOptions).length > 0;
}

function resonancesAMontrer(etat: EtatPartie): string[] {
  // Montrées au premier arrêt de l'année seulement.
  const dejaArrete = etat.decisions.some((d) => d.annee === etat.annee) || etat.evenements.some((e) => e.annee === etat.annee);
  return dejaArrete ? [] : etat.resonances.filter((x) => x.annee === etat.annee - 1).map((x) => x.id);
}

interface Tirage {
  evt: Evenement;
  alerte?: JaugeId;
  cause?: Cause;
}

function evenementDuMois(contenu: Contenu, etat: EtatPartie, mois: number, maxParAn: number): Tirage | undefined {
  const abs = moisAbsolu(etat.annee, mois);
  const dus = etat.planifies.filter((p) => p.moisAbsolu <= abs).sort((a, b) => Number(!!b.alerte) - Number(!!a.alerte) || a.moisAbsolu - b.moisAbsolu);
  if (etat.evenementsAnnee >= maxParAn) {
    // Plus de place cette année : les événements dus attendent le mois suivant (ou sont abandonnés).
    for (const p of dus) p.moisAbsolu = abs + 1;
    etat.planifies = etat.planifies.filter((p) => p.moisAbsolu <= p.limite);
    return undefined;
  }
  const poids = (e: Evenement) => etat.poids.evenements[e.id] ?? e.poids;
  for (const p of dus) {
    etat.planifies = etat.planifies.filter((x) => x !== p);
    const evt = contenu.evenements.find((e) => e.id === p.evenement);
    if (evt && (p.alerte || p.cause || poids(evt) > 0)) return { evt, alerte: p.alerte, cause: p.cause };
  }
  // Événement aléatoire : même tirage avec ou sans décisions (trajectoire « sans intervention »).
  const rng = flux(etat.graine, "mois", abs);
  if (rng() >= contenu.regles.evenements.probaParMois) return undefined;
  const eff = effectifs(contenu, etat);
  const evt = tirerPondere(evenementsAleatoiresEligibles(contenu, etat, calculerJauges(contenu, eff), eff), poids, rng);
  return evt ? { evt } : undefined;
}

function preparerEvenement(contenu: Contenu, etat: EtatPartie, evt: Evenement, mois: number, t: Tirage): Etape {
  const proj = { base: etat.base, mods: etat.mods, annee: etat.annee };
  const tire: EvenementTire = { id: evt.id, annee: etat.annee, mois, alerte: t.alerte, cause: t.cause, impacts: impactsEffets(contenu, proj, evt.effets) };
  etat.evenements.push(tire);
  etat.evenementsAnnee++;
  etat.mods.push(...effetsVersModificateurs(evt.effets, etat.annee, { type: "evenement", id: evt.id }, contenu.regles.estompeDureeParDefaut));
  const etape: Etape = { n: etat.nbEtapes++, annee: etat.annee, mois, type: "evenement", evenement: tire, impactsOptions: {}, resonances: resonancesAMontrer(etat) };
  // Une crise appelle une réponse (sauf dans la trajectoire « sans intervention »).
  if (evt.gravite === "crise" && !etat.sansIntervention) etape.impactsOptions = impactsCarte(contenu, etat, carteDeCrise(evt));
  return etape;
}

/** Une crise se vote comme une carte « choix unique » dont les options sont les réponses. */
export function carteDeCrise(evt: Evenement): Carte {
  return {
    id: evt.id,
    ministere: "interieur",
    type: "unique",
    titre: evt.titre,
    contexte: evt.description,
    poids: 0,
    conditions: [],
    options: evt.reponses.map((r) => ({ id: r.id, titre: r.titre, explication: r.explication, outil: r.outil, effets: r.effets, annule: [] })),
    notePedagogique: evt.notePedagogique ?? evt.description,
    positionsCandidats: {},
  };
}

/** Carte votée à l'étape en cours (carte de décision ou crise). */
export function carteDeLEtape(contenu: Contenu, etape: Etape): Carte | undefined {
  if (etape.type === "decision") return contenu.cartes.find((c) => c.id === etape.carte);
  const evt = etape.evenement && contenu.evenements.find((e) => e.id === etape.evenement!.id);
  return evt && evt.gravite === "crise" ? carteDeCrise(evt) : undefined;
}

/** Impacts estimés de chaque option d'une carte dans l'état actuel. */
export function impactsCarte(contenu: Contenu, etat: EtatPartie, carte: Carte): Record<string, Impacts> {
  const proj = { base: etat.base, mods: etat.mods, annee: etat.annee };
  const effetsCarte = carte.options.flatMap((o) => o.effets);
  const reference = projeter(contenu, etat.base, etat.mods, etat.annee, horizonEffets(contenu, effetsCarte));
  const res: Record<string, Impacts> = {};
  if (carte.type === "curseur") {
    for (const v of valeursCurseur(carte)) res[String(v)] = impactsEffets(contenu, proj, optionsRetenues(carte, [], v)[0].effets, reference);
  } else {
    for (const o of carte.options) res[o.id] = impactsEffets(contenu, proj, o.effets, reference);
  }
  return res;
}

/* ------------------------------------------------------------------ */
/* Appliquer une décision                                              */

export interface ChangementIndicateur {
  id: string;
  avant: number;
  apres: number;
}

export interface EffetProgramme {
  annee: number;
  cible: string;
  valeur: number;
  source: string;
}

export interface ResultatTour {
  decision: Decision;
  changements: ChangementIndicateur[];
  jaugesAvant: ValeursJauges;
  jaugesApres: ValeursJauges;
  programme: EffetProgramme[];
}

/** Applique le résultat d'un vote (votes bruts des participants). */
export function appliquerVote(contenu: Contenu, etat: EtatPartie, votes: (string | number)[]): ResultatTour {
  const etape = etat.etape;
  const carte = etape && carteDeLEtape(contenu, etape);
  if (!etape || !carte) throw new Error("Aucune carte en jeu.");
  const vote = resoudreVote(carte, votes, flux(etat.graine, "vote", etape.n));
  return appliquerChoix(contenu, etat, { options: vote.options, valeur: vote.valeur }, vote);
}

/** Probabilité qu'un référendum soit rejeté, selon la popularité (en %). */
export function risqueRejetReferendum(popularite: number): number {
  return Math.min(0.6, Math.max(0.05, (55 - popularite) / 50));
}

export function appliquerChoix(contenu: Contenu, etat: EtatPartie, choix: { options: string[]; valeur?: number }, vote?: ResultatVote): ResultatTour {
  const etape = etat.etape;
  const carte = etape && carteDeLEtape(contenu, etape);
  if (!etape || !carte) throw new Error("Aucune carte en jeu.");
  if (etape.decision !== undefined) throw new Error("La décision de cette étape est déjà prise.");
  const options = optionsRetenues(carte, choix.options, choix.valeur);
  if (!options.length) throw new Error("Option inconnue.");
  const crise = etape.type === "evenement";

  const effAvant = effectifs(contenu, etat);
  const jaugesAvant = calculerJauges(contenu, effAvant);
  const proj = { base: etat.base, mods: etat.mods, annee: etat.annee };
  const outil: Outil = options.find((o) => o.outil === "referendum") ? "referendum" : (options[0].outil ?? "loi");

  // Référendum : le peuple peut dire non, d'autant plus que le président est impopulaire.
  let rejete = false;
  if (outil === "referendum") rejete = flux(etat.graine, "referendum", etape.n)() < risqueRejetReferendum(effAvant.popularite ?? 50);

  let effets: Effet[] = rejete
    ? [{ cible: "popularite", valeur: -5, type: "estompe", duree: 3, hypothese: "Un référendum perdu affaiblit le président." }]
    : options.flatMap((o) => o.effets);
  if (!("popularite" in effAvant)) effets = effets.filter((e) => e.cible !== "popularite");
  const impacts = impactsEffets(contenu, proj, effets);

  if (!rejete) {
    const annulees = new Set(options.flatMap((o) => o.annule));
    for (const m of etat.mods) if (m.source.type === "carte" && annulees.has(m.source.id) && m.fin === undefined && m.estompe === undefined) m.fin = etat.annee;
  }
  const nouveaux: Modificateur[] = rejete
    ? effetsVersModificateurs(effets, etat.annee, { type: "carte", id: carte.id }, contenu.regles.estompeDureeParDefaut)
    : options.flatMap((o) => effetsVersModificateurs(o.effets, etat.annee, { type: "carte", id: carte.id, option: o.id }, contenu.regles.estompeDureeParDefaut));
  etat.mods.push(...nouveaux.filter((m) => m.cible in effAvant));

  // Promesse de campagne : tenue ou trahie.
  let promesse: Decision["promesse"];
  const p = !crise ? contenu.promesses.find((x) => x.carte === carte.id && etat.promesses.includes(x.id)) : undefined;
  if (p) {
    const ids = options.map((o) => o.id);
    const tenue = !rejete && p.options.some((o) => ids.includes(o));
    promesse = { id: p.id, tenue };
    if (!tenue && "popularite" in effAvant)
      etat.mods.push(...effetsVersModificateurs([{ cible: "popularite", valeur: -(1 + p.popularite), type: "estompe", duree: 3, hypothese: "Promesse trahie." }], etat.annee, { type: "carte", id: carte.id }, 3));
  }

  const decision: Decision = {
    annee: etat.annee,
    mois: etape.mois,
    etape: etape.n,
    carte: carte.id,
    crise: crise || undefined,
    options: options.map((o) => o.id),
    valeur: choix.valeur,
    titre: (carte.titreCourt ? `${carte.titreCourt} : ` : "") + options.map((o) => o.titre).join(" + "),
    duree: options.some((o) => dureeOption(o) === "plusieurs_annees") ? "plusieurs_annees" : "un_an",
    outil,
    impacts,
    vote,
    rejete: rejete || undefined,
    promesse,
  };
  etat.decisions.push(decision);
  etape.decision = etat.decisions.length - 1;
  if (crise) {
    etape.evenement!.reponse = etape.decision;
  } else {
    etat.cartesJouees.push(carte.id);
    etat.ministeres.push(carte.ministere);
  }
  if (!rejete) programmerSuites(contenu, etat, carte, decision);

  const effApres = effectifs(contenu, etat);
  const jaugesApres = calculerJauges(contenu, effApres);
  const changements: ChangementIndicateur[] = [];
  for (const id of Object.keys(effApres)) {
    if (Math.abs(effApres[id] - effAvant[id]) > 1e-9) changements.push({ id, avant: effAvant[id], apres: effApres[id] });
  }
  const programme: EffetProgramme[] = nouveaux.filter((m) => m.debut > etat.annee).map((m) => ({ annee: m.debut, cible: m.cible, valeur: m.valeur, source: carte.titre }));
  return { decision, changements, jaugesAvant, jaugesApres, programme };
}

/** Les décisions peuvent provoquer des événements plus tard : jamais certain, jamais annoncé. */
function programmerSuites(contenu: Contenu, etat: EtatPartie, carte: Carte, d: Decision) {
  const choisis = new Set([...d.options, ...(d.valeur !== undefined ? [String(d.valeur)] : [])]);
  const maintenant = moisAbsolu(d.annee, d.mois);
  for (const evt of contenu.evenements) {
    for (const dec of evt.declenchePar) {
      if (dec.carte !== carte.id) continue;
      if (dec.options && !dec.options.some((o) => choisis.has(o))) continue;
      if (etat.planifies.some((p) => p.evenement === evt.id)) continue;
      const rng = flux(etat.graine, `suite:${evt.id}`, d.etape);
      if (rng() >= dec.chance) continue;
      const dans = dec.delai[0] + Math.floor(rng() * (dec.delai[1] - dec.delai[0] + 1));
      etat.planifies.push({
        evenement: evt.id,
        moisAbsolu: maintenant + dans,
        limite: maintenant + dans + 6,
        cause: { carte: carte.id, titre: d.titre, annee: d.annee, mois: d.mois },
      });
    }
  }
}

function choixPris(etat: EtatPartie, carte: string, options: string[]): Decision | undefined {
  return etat.decisions.find((d) => !d.rejete && d.carte === carte && d.options.some((o) => options.includes(o)));
}

/** Vérifie les résonances à la fin de l'année ; renvoie celles qui viennent de se déclencher. */
export function verifierResonances(contenu: Contenu, etat: EtatPartie): string[] {
  const declenchees: string[] = [];
  for (const r of contenu.resonances) {
    if (etat.resonances.some((x) => x.id === r.id)) continue;
    const si = r.si.map((ref) => choixPris(etat, ref.carte, ref.options));
    if (si.some((d) => !d)) continue;
    if (r.sauf.some((ref) => choixPris(etat, ref.carte, ref.options))) continue;
    const derniere = Math.max(...si.map((d) => d!.annee));
    if (etat.annee < derniere + r.apres) continue;
    etat.resonances.push({ id: r.id, annee: etat.annee });
    etat.mods.push(...effetsVersModificateurs(r.effets, etat.annee + 1, { type: "resonance", id: r.id }, contenu.regles.estompeDureeParDefaut));
    declenchees.push(r.id);
  }
  return declenchees;
}

/** Clôt l'année : historique, résonances, alertes, évolution naturelle, année suivante. */
export function terminerAnnee(contenu: Contenu, etat: EtatPartie): EtatPartie {
  const eff = effectifs(contenu, etat);
  const jauges = calculerJauges(contenu, eff);
  etat.historique.push({ annee: etat.annee, jauges, indicateurs: eff });
  verifierResonances(contenu, etat);

  // Alertes : une jauge sous le seuil provoque un événement lié au début de l'année suivante.
  const r = contenu.regles;
  const rng = flux(etat.graine, "alertes", etat.annee);
  for (const j of JAUGES) {
    if (jauges[j] >= r.seuilAlerte) continue;
    const recente = etat.evenements.some((e) => e.alerte === j && etat.annee + 1 - e.annee < r.evenements.delaiEntreAlertesMemeJauge);
    const evt = contenu.evenements.filter((e) => e.alerte === j && (etat.poids.evenements[e.id] ?? e.poids) > 0);
    const choisi = tirerPondere(evt, (e) => etat.poids.evenements[e.id] ?? e.poids, rng);
    if (recente || !choisi) continue;
    const abs = moisAbsolu(etat.annee + 1, 1 + Math.floor(rng() * 4));
    etat.planifies.push({ evenement: choisi.id, moisAbsolu: abs, limite: abs + 6, alerte: j });
  }

  etat.base = evoluerBase(contenu, etat.base, eff);
  etat.mods = etat.mods.filter((m) => (m.fin === undefined || m.fin > etat.annee + 1) && (m.estompe === undefined || m.debut + m.estompe > etat.annee + 1));
  etat.etape = undefined;
  etat.annee++;
  if (etat.annee >= etat.anneeDepart + etat.nbAnnees) etat.termine = true;
  else planifierAnnee(contenu, etat);
  return etat;
}

/** Effets programmés par des décisions passées qui entrent en vigueur cette année. */
export function effetsArrivant(etat: EtatPartie, annee = etat.annee): Modificateur[] {
  return etat.mods.filter((m) => m.debut === annee && m.source.type === "carte" && valeurModificateur(m, annee) !== 0 && etat.decisions.some((d) => d.carte === m.source.id && d.annee < annee));
}

/* ------------------------------------------------------------------ */

export type StrategieChoix = (carte: Carte, etat: EtatPartie, etape: Etape) => { options: string[]; valeur?: number } | (string | number)[];

/**
 * Joue une partie complète. `choisir` renvoie soit un choix direct, soit des votes bruts.
 * Avec `sansIntervention`, aucune carte n'est tirée et les crises passent sans réponse.
 */
export function jouerPartie(contenu: Contenu, opts: OptionsPartie, choisir?: StrategieChoix, apresEtape?: (etat: EtatPartie, etape: Etape, res?: ResultatTour) => void): EtatPartie {
  const etat = creerPartie(contenu, opts);
  while (!etat.termine) {
    const etape = prochaineEtape(contenu, etat);
    if (!etape) {
      terminerAnnee(contenu, etat);
      continue;
    }
    let res: ResultatTour | undefined;
    const carte = carteDeLEtape(contenu, etape);
    if (etapeAVoter(etape) && carte && choisir) {
      const c = choisir(carte, etat, etape);
      res = Array.isArray(c) ? appliquerVote(contenu, etat, c) : appliquerChoix(contenu, etat, c);
    } else if (etapeAVoter(etape)) {
      // Personne pour répondre : l'étape passe sans décision.
      etape.decision = -1;
    }
    apresEtape?.(etat, etape, res);
  }
  return etat;
}

/** Trajectoire « sans intervention » : même graine, mêmes événements aléatoires, aucune décision. */
export function trajectoireSansIntervention(contenu: Contenu, graine: number, nbAnnees: number, poids?: Partial<Poids>, promesses?: string[]): EtatPartie {
  return jouerPartie(contenu, { graine, nbAnnees, poids, promesses, sansIntervention: true });
}
