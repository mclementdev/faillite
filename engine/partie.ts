/**
 * Déroulé d'une partie, année par année :
 *   commencerTour  → bilan (évolution déjà appliquée), événement, tirage de la carte
 *   appliquerVote / appliquerChoix → l'option retenue pose ses effets
 *   terminerTour   → résonances, alertes pour l'année suivante, évolution naturelle
 *
 * Les fonctions modifient l'état reçu et le renvoient (l'appelant clone s'il a besoin
 * de conserver l'ancien état). L'état est un objet JSON pur, sérialisable tel quel.
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
import { flux, tirerPondere } from "./rng";
import { JAUGES, type Carte, type Condition, type Effet, type Evenement, type Imprevu, type JaugeId } from "./schema";
import { resoudreVote, type ResultatVote } from "./vote";

export interface Poids {
  cartes: Record<string, number>;
  evenements: Record<string, number>;
}

export type Impacts = Record<JaugeId, number>;

export interface EvenementTire {
  id: string;
  annee: number;
  /** jauge dont l'alerte a déclenché l'événement */
  alerte?: JaugeId;
  impacts: Impacts;
}

export interface Decision {
  annee: number;
  tour: number;
  carte: string;
  options: string[];
  valeur?: number;
  titre: string;
  duree: "un_an" | "plusieurs_annees";
  impacts: Impacts;
  vote?: ResultatVote;
  /** imprévu révélé avec le résultat (conséquence inattendue tirée au sort) */
  imprevu?: { id: string; impacts: Impacts };
}

export interface BilanAnnee {
  annee: number;
  jauges: ValeursJauges;
  indicateurs: Valeurs;
  evenement?: string;
  carte?: string;
  decision?: number;
}

export interface TourCourant {
  tour: number;
  annee: number;
  /** jauges à la fin de l'année précédente (pour les tendances ▲▼ du bilan) */
  jaugesPrecedentes: ValeursJauges;
  /** jauges au début de l'année (après évolution naturelle et effets différés) */
  jaugesBilan: ValeursJauges;
  evenement?: EvenementTire;
  carte?: string;
  /** impacts estimés de chaque option (pour un curseur : de chaque valeur autorisée) */
  impactsOptions: Record<string, Impacts>;
  /** résonances déclenchées à la fin de l'année précédente */
  resonances: string[];
  decision?: number;
}

export interface EtatPartie {
  graine: number;
  nbTours: number;
  anneeDepart: number;
  tour: number;
  annee: number;
  termine: boolean;
  sansIntervention: boolean;
  base: Valeurs;
  mods: Modificateur[];
  poids: Poids;
  cartesJouees: string[];
  themes: string[];
  evenements: EvenementTire[];
  alertesProgrammees: { jauge: JaugeId; annee: number }[];
  resonances: { id: string; annee: number }[];
  decisions: Decision[];
  /** imprévus déjà survenus (chacun au plus une fois par partie) */
  imprevus: string[];
  historique: BilanAnnee[];
  jaugesDepart: ValeursJauges;
  indicateursDepart: Valeurs;
  courant?: TourCourant;
}

export interface OptionsPartie {
  graine: number;
  nbTours: number;
  poids?: Partial<Poids>;
  sansIntervention?: boolean;
}

export function poidsParDefaut(contenu: Contenu): Poids {
  return {
    cartes: Object.fromEntries(contenu.cartes.map((c) => [c.id, c.poids])),
    evenements: Object.fromEntries(contenu.evenements.map((e) => [e.id, e.poids])),
  };
}

export function creerPartie(contenu: Contenu, opts: OptionsPartie): EtatPartie {
  const defaut = poidsParDefaut(contenu);
  const poids: Poids = {
    cartes: { ...defaut.cartes, ...(opts.poids?.cartes ?? {}) },
    evenements: { ...defaut.evenements, ...(opts.poids?.evenements ?? {}) },
  };
  const base = valeursInitiales(contenu);
  const annee = contenu.regles.anneeDepart;
  const eff = valeursEffectives(contenu, base, [], annee);
  const jauges = calculerJauges(contenu, eff);
  return {
    graine: opts.graine >>> 0,
    nbTours: opts.nbTours,
    anneeDepart: annee,
    tour: 0,
    annee,
    termine: false,
    sansIntervention: !!opts.sansIntervention,
    base,
    mods: [],
    poids,
    cartesJouees: [],
    themes: [],
    evenements: [],
    alertesProgrammees: [],
    resonances: [],
    decisions: [],
    imprevus: [],
    historique: [],
    jaugesDepart: jauges,
    indicateursDepart: eff,
  };
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
    if ("tourMin" in c) return etat.tour + 1 >= c.tourMin;
    if ("carteJouee" in c) return etat.cartesJouees.includes(c.carteJouee);
    if ("carteNonJouee" in c) return !etat.cartesJouees.includes(c.carteNonJouee);
    return true;
  });
}

/** Cartes tirables ce tour, avant le filtre « pas deux fois le même thème ». */
export function cartesEligibles(contenu: Contenu, etat: EtatPartie, jauges: ValeursJauges, eff: Valeurs): Carte[] {
  return contenu.cartes.filter(
    (c) => (etat.poids.cartes[c.id] ?? c.poids) > 0 && !etat.cartesJouees.includes(c.id) && conditionsRemplies(c.conditions, etat, jauges, eff),
  );
}

export function tirerCarte(contenu: Contenu, etat: EtatPartie, jauges: ValeursJauges, eff: Valeurs): Carte | undefined {
  let eligibles = cartesEligibles(contenu, etat, jauges, eff);
  const dernierTheme = etat.themes[etat.themes.length - 1];
  const autres = eligibles.filter((c) => c.theme !== dernierTheme);
  if (autres.length) eligibles = autres;
  return tirerPondere(eligibles, (c) => etat.poids.cartes[c.id] ?? c.poids, flux(etat.graine, "carte", etat.tour));
}

function evenementsAleatoiresEligibles(contenu: Contenu, etat: EtatPartie, jauges: ValeursJauges, eff: Valeurs): Evenement[] {
  const r = contenu.regles.evenements;
  return contenu.evenements.filter((e) => {
    if (e.declencheur) return false;
    if ((etat.poids.evenements[e.id] ?? e.poids) <= 0) return false;
    const passes = etat.evenements.filter((x) => x.id === e.id);
    if (passes.length >= r.maxOccurrences) return false;
    if (passes.some((x) => etat.annee - x.annee < r.delaiAvantRepetition)) return false;
    return conditionsRemplies(e.conditions, etat, jauges, eff);
  });
}

export function tirerEvenement(contenu: Contenu, etat: EtatPartie, jauges: ValeursJauges, eff: Valeurs): { evt: Evenement; alerte?: JaugeId } | undefined {
  const poids = (e: Evenement) => etat.poids.evenements[e.id] ?? e.poids;
  // 1. Alerte programmée l'an dernier : la jauge la plus basse l'emporte.
  const alertes = etat.alertesProgrammees.filter((a) => a.annee === etat.annee).sort((a, b) => jauges[a.jauge] - jauges[b.jauge]);
  for (const a of alertes) {
    const candidats = contenu.evenements.filter((e) => e.declencheur?.jauge === a.jauge && poids(e) > 0);
    const evt = tirerPondere(candidats, poids, flux(etat.graine, "alerte", etat.tour));
    if (evt) return { evt, alerte: a.jauge };
  }
  // 2. Sinon, événement tiré au sort.
  const rng = flux(etat.graine, "evenement", etat.tour);
  if (rng() >= contenu.regles.probaEvenement) return undefined;
  const evt = tirerPondere(evenementsAleatoiresEligibles(contenu, etat, jauges, eff), poids, rng);
  return evt ? { evt } : undefined;
}

/* ------------------------------------------------------------------ */

export function commencerTour(contenu: Contenu, etat: EtatPartie): TourCourant {
  if (etat.termine) throw new Error("La partie est terminée.");
  if (etat.courant) return etat.courant;
  const precedent = etat.historique[etat.historique.length - 1];
  let eff = effectifs(contenu, etat);
  const jaugesBilan = calculerJauges(contenu, eff);
  const courant: TourCourant = {
    tour: etat.tour,
    annee: etat.annee,
    jaugesPrecedentes: precedent ? precedent.jauges : jaugesBilan,
    jaugesBilan,
    impactsOptions: {},
    resonances: etat.resonances.filter((r) => r.annee === etat.annee - 1).map((r) => r.id),
  };

  // Événement de l'année
  const tire = tirerEvenement(contenu, etat, jaugesBilan, eff);
  if (tire) {
    const proj = { base: etat.base, mods: etat.mods, annee: etat.annee };
    const impacts = impactsEffets(contenu, proj, tire.evt.effets);
    const evt: EvenementTire = { id: tire.evt.id, annee: etat.annee, alerte: tire.alerte, impacts };
    etat.evenements.push(evt);
    etat.mods.push(...effetsVersModificateurs(tire.evt.effets, etat.annee, { type: "evenement", id: tire.evt.id }, contenu.regles.estompeDureeParDefaut));
    courant.evenement = evt;
    eff = effectifs(contenu, etat);
  }

  // Carte de décision
  if (!etat.sansIntervention) {
    const jauges = calculerJauges(contenu, eff);
    const carte = tirerCarte(contenu, etat, jauges, eff);
    if (carte) {
      courant.carte = carte.id;
      courant.impactsOptions = impactsCarte(contenu, etat, carte);
    }
  }
  etat.courant = courant;
  return courant;
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
  /** indicateurs modifiés dès cette année */
  changements: ChangementIndicateur[];
  jaugesAvant: ValeursJauges;
  jaugesApres: ValeursJauges;
  /** effets programmés pour les années suivantes par cette décision */
  programme: EffetProgramme[];
}

/** Applique le résultat d'un vote (votes bruts des participants ; voix de la présidence pour départager). */
export function appliquerVote(contenu: Contenu, etat: EtatPartie, votes: (string | number)[], voixPresident?: string | number): ResultatTour {
  const courant = etat.courant;
  if (!courant?.carte) throw new Error("Aucune carte en jeu.");
  const carte = contenu.cartes.find((c) => c.id === courant.carte)!;
  const vote = resoudreVote(carte, votes, flux(etat.graine, "vote", etat.tour), voixPresident);
  return appliquerChoix(contenu, etat, { options: vote.options, valeur: vote.valeur }, vote);
}

export function appliquerChoix(
  contenu: Contenu,
  etat: EtatPartie,
  choix: { options: string[]; valeur?: number },
  vote?: ResultatVote,
): ResultatTour {
  const courant = etat.courant;
  if (!courant?.carte) throw new Error("Aucune carte en jeu.");
  if (courant.decision !== undefined) throw new Error("La décision de ce tour est déjà prise.");
  const carte = contenu.cartes.find((c) => c.id === courant.carte)!;
  const options = optionsRetenues(carte, choix.options, choix.valeur);
  if (!options.length) throw new Error("Option inconnue.");

  const effAvant = effectifs(contenu, etat);
  const jaugesAvant = calculerJauges(contenu, effAvant);
  const proj = { base: etat.base, mods: etat.mods, annee: etat.annee };
  const tousEffets: Effet[] = options.flatMap((o) => o.effets);
  const impacts = impactsEffets(contenu, proj, tousEffets);

  // Annulation d'effets durables d'anciennes cartes
  const annulees = new Set(options.flatMap((o) => o.annule));
  if (annulees.size) {
    for (const m of etat.mods) {
      if (m.source.type === "carte" && annulees.has(m.source.id) && m.fin === undefined && m.estompe === undefined) m.fin = etat.annee;
    }
  }
  const nouveaux: Modificateur[] = options.flatMap((o) =>
    effetsVersModificateurs(o.effets, etat.annee, { type: "carte", id: carte.id, option: o.id }, contenu.regles.estompeDureeParDefaut),
  );
  etat.mods.push(...nouveaux);

  // Imprévu : caché pendant le vote, tiré au sort une fois la décision prise.
  const imprevu = tirerImprevu(contenu, etat, carte, options.map((o) => o.id));
  let imprevuTire: Decision["imprevu"];
  if (imprevu) {
    const projI = { base: etat.base, mods: etat.mods, annee: etat.annee };
    imprevuTire = { id: imprevu.id, impacts: impactsEffets(contenu, projI, imprevu.effets) };
    etat.imprevus.push(imprevu.id);
    etat.mods.push(...effetsVersModificateurs(imprevu.effets, etat.annee, { type: "imprevu", id: imprevu.id }, contenu.regles.estompeDureeParDefaut));
  }
  const effApres = effectifs(contenu, etat);
  const jaugesApres = calculerJauges(contenu, effApres);

  const decision: Decision = {
    annee: etat.annee,
    tour: etat.tour,
    carte: carte.id,
    options: options.map((o) => o.id),
    valeur: choix.valeur,
    titre: (carte.titreCourt ? `${carte.titreCourt} : ` : "") + options.map((o) => o.titre).join(" + "),
    duree: options.some((o) => dureeOption(o) === "plusieurs_annees") ? "plusieurs_annees" : "un_an",
    impacts,
    vote,
    imprevu: imprevuTire,
  };
  etat.decisions.push(decision);
  etat.cartesJouees.push(carte.id);
  etat.themes.push(carte.theme);
  courant.decision = etat.decisions.length - 1;

  const changements: ChangementIndicateur[] = [];
  for (const id of Object.keys(effApres)) {
    if (Math.abs(effApres[id] - effAvant[id]) > 1e-9) changements.push({ id, avant: effAvant[id], apres: effApres[id] });
  }
  const programme: EffetProgramme[] = [...nouveaux, ...etat.mods.filter((m) => m.source.type === "imprevu" && m.source.id === imprevu?.id)]
    .filter((m) => m.debut > etat.annee)
    .map((m) => ({ annee: m.debut, cible: m.cible, valeur: m.valeur, source: m.source.type === "imprevu" ? imprevu!.titre : carte.titre }));
  return { decision, changements, jaugesAvant, jaugesApres, programme };
}

/** Imprévus possibles pour les options retenues d'une carte (pas encore survenus dans la partie). */
export function imprevusPossibles(contenu: Contenu, etat: EtatPartie, carte: Carte, options: string[]): Imprevu[] {
  return contenu.imprevus.filter((im) => {
    if (etat.imprevus.includes(im.id) || im.proba <= 0) return false;
    if ("theme" in im.si) return im.si.theme === carte.theme;
    if (im.si.carte !== carte.id) return false;
    return !im.si.options || im.si.options.some((o) => options.includes(o));
  });
}

/** Chaque imprévu possible est tenté avec sa probabilité ; au plus un est retenu. */
export function tirerImprevu(contenu: Contenu, etat: EtatPartie, carte: Carte, options: string[]): Imprevu | undefined {
  const rng = flux(etat.graine, "imprevu", etat.tour);
  const reussis = imprevusPossibles(contenu, etat, carte, options).filter((im) => rng() < im.proba);
  return reussis.length ? reussis[Math.floor(rng() * reussis.length)] : undefined;
}

function choixPris(etat: EtatPartie, carte: string, options: string[]): Decision | undefined {
  return etat.decisions.find((d) => d.carte === carte && d.options.some((o) => options.includes(o)));
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

/** Clôt l'année : historique, résonances, alertes, évolution naturelle, passage à l'année suivante. */
export function terminerTour(contenu: Contenu, etat: EtatPartie): EtatPartie {
  const courant = etat.courant ?? commencerTour(contenu, etat);
  const eff = effectifs(contenu, etat);
  const jauges = calculerJauges(contenu, eff);
  etat.historique.push({
    annee: etat.annee,
    jauges,
    indicateurs: eff,
    evenement: courant.evenement?.id,
    carte: courant.carte,
    decision: courant.decision,
  });
  verifierResonances(contenu, etat);

  // Alertes : une jauge sous le seuil déclenche un événement lié l'année suivante.
  const r = contenu.regles;
  for (const j of JAUGES) {
    if (jauges[j] >= r.seuilAlerte) continue;
    const recente = etat.evenements.some((e) => e.alerte === j && etat.annee + 1 - e.annee < r.evenements.delaiEntreAlertesMemeJauge);
    if (!recente) etat.alertesProgrammees.push({ jauge: j, annee: etat.annee + 1 });
  }

  // Évolution naturelle vers l'année suivante ; nettoyage des modificateurs expirés.
  etat.base = evoluerBase(contenu, etat.base, eff);
  etat.mods = etat.mods.filter((m) => (m.fin === undefined || m.fin > etat.annee + 1) && (m.estompe === undefined || m.debut + m.estompe > etat.annee + 1));
  etat.alertesProgrammees = etat.alertesProgrammees.filter((a) => a.annee > etat.annee);
  etat.courant = undefined;
  etat.tour++;
  etat.annee++;
  if (etat.tour >= etat.nbTours) etat.termine = true;
  return etat;
}

/** Effets programmés par des décisions passées qui entrent en vigueur cette année. */
export function effetsArrivant(etat: EtatPartie, annee = etat.annee): Modificateur[] {
  return etat.mods.filter((m) => m.debut === annee && m.source.type !== "evenement" && valeurModificateur(m, annee) !== 0 && etat.decisions.some((d) => d.carte === m.source.id && d.annee < annee));
}

/* ------------------------------------------------------------------ */

export type StrategieChoix = (carte: Carte, etat: EtatPartie, tour: TourCourant) => { options: string[]; valeur?: number } | (string | number)[];

/**
 * Joue une partie complète. `choisir` renvoie soit un choix direct, soit des votes bruts.
 * Avec `sansIntervention`, aucune carte n'est tirée ni appliquée.
 */
export function jouerPartie(contenu: Contenu, opts: OptionsPartie, choisir?: StrategieChoix, apresTour?: (etat: EtatPartie, tour: TourCourant, res?: ResultatTour) => void): EtatPartie {
  const etat = creerPartie(contenu, opts);
  while (!etat.termine) {
    const tour = commencerTour(contenu, etat);
    let res: ResultatTour | undefined;
    if (tour.carte && choisir) {
      const carte = contenu.cartes.find((c) => c.id === tour.carte)!;
      const c = choisir(carte, etat, tour);
      res = Array.isArray(c) ? appliquerVote(contenu, etat, c) : appliquerChoix(contenu, etat, c);
    }
    apresTour?.(etat, tour, res);
    terminerTour(contenu, etat);
  }
  return etat;
}

/** Trajectoire « sans intervention » : même graine, mêmes tirages d'événements, aucune décision. */
export function trajectoireSansIntervention(contenu: Contenu, graine: number, nbTours: number, poids?: Partial<Poids>): EtatPartie {
  return jouerPartie(contenu, { graine, nbTours, poids, sansIntervention: true });
}
