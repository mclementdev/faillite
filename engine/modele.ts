/**
 * Cœur du modèle : effets → modificateurs, valeurs effectives des indicateurs,
 * évolution naturelle et calcul des jauges.
 *
 * Un indicateur a une « base » (qui suit l'évolution naturelle) et des « modificateurs »
 * posés par les décisions, événements et résonances. Valeur effective = base + Σ modificateurs
 * actifs, bornée dans [min, max].
 */
import type { Contenu } from "./contenu";
import { JAUGES, type Effet, type JaugeId, type ModeleIndicateur, type Normalisation, type Terme } from "./schema";

export type Valeurs = Record<string, number>;
export type ValeursJauges = Record<JaugeId, number>;

export interface SourceModif {
  type: "carte" | "evenement" | "resonance" | "imprevu";
  id: string;
  option?: string;
}

export interface Modificateur {
  cible: string;
  valeur: number;
  /** première année d'effet */
  debut: number;
  /** année de fin (exclue) ; absent = permanent */
  fin?: number;
  /** si présent : effet résorbé linéairement sur `estompe` années */
  estompe?: number;
  source: SourceModif;
}

export function borner(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Convertit les effets d'une décision prise l'année `annee` en modificateurs. */
export function effetsVersModificateurs(effets: Effet[], annee: number, source: SourceModif, estompeDefaut: number): Modificateur[] {
  return effets.map((e) => {
    switch (e.type) {
      case "immediat":
        return { cible: e.cible, valeur: e.valeur, debut: annee, fin: annee + (e.duree ?? 1), source };
      case "differe": {
        const debut = annee + (e.delai ?? 1);
        return { cible: e.cible, valeur: e.valeur, debut, fin: e.duree ? debut + e.duree : undefined, source };
      }
      case "durable":
        return { cible: e.cible, valeur: e.valeur, debut: annee, fin: e.duree ? annee + e.duree : undefined, source };
      case "estompe":
        return { cible: e.cible, valeur: e.valeur, debut: annee, estompe: e.duree ?? estompeDefaut, source };
    }
  });
}

export function valeurModificateur(m: Modificateur, annee: number): number {
  if (annee < m.debut) return 0;
  if (m.fin !== undefined && annee >= m.fin) return 0;
  if (m.estompe !== undefined) {
    const ecoule = annee - m.debut;
    if (ecoule >= m.estompe) return 0;
    return m.valeur * (1 - ecoule / m.estompe);
  }
  return m.valeur;
}

export function valeursEffectives(contenu: Contenu, base: Valeurs, mods: Modificateur[], annee: number): Valeurs {
  const res: Valeurs = { ...base };
  for (const m of mods) {
    const v = valeurModificateur(m, annee);
    if (v !== 0) res[m.cible] = (res[m.cible] ?? 0) + v;
  }
  for (const id of Object.keys(res)) {
    const mod = contenu.modele[id];
    if (mod) res[id] = borner(res[id], mod.min, mod.max);
  }
  return res;
}

export function normaliser(v: number, n: Normalisation): number {
  if (n.type === "lineaire") return borner((100 * (v - n.zero)) / (n.cent - n.zero), 0, 100);
  return borner(100 * (1 - Math.abs(v - n.cible) / n.ecart), 0, 100);
}

/** Moyenne pondérée des indicateurs normalisés, sans sensibilité. */
function moyennesBrutes(contenu: Contenu, eff: Valeurs): ValeursJauges {
  const res = {} as ValeursJauges;
  for (const j of JAUGES) {
    let somme = 0;
    let poids = 0;
    for (const x of contenu.jauges[j].indicateurs) {
      if (x.poids <= 0) continue;
      somme += x.poids * normaliser(eff[x.id], contenu.modele[x.id].normalisation);
      poids += x.poids;
    }
    res[j] = poids > 0 ? somme / poids : 50;
  }
  return res;
}

const pivots = new WeakMap<Contenu, ValeursJauges>();

/** Valeur des jauges avec les données de départ (point fixe de la sensibilité). */
function pivotsJauges(contenu: Contenu): ValeursJauges {
  let p = pivots.get(contenu);
  if (!p) {
    p = moyennesBrutes(contenu, valeursInitiales(contenu));
    pivots.set(contenu, p);
  }
  return p;
}

export function calculerJauges(contenu: Contenu, eff: Valeurs): ValeursJauges {
  const brutes = moyennesBrutes(contenu, eff);
  const pivot = pivotsJauges(contenu);
  const res = {} as ValeursJauges;
  for (const j of JAUGES) {
    const k = contenu.jauges[j].sensibilite ?? 1;
    res[j] = borner(pivot[j] + k * (brutes[j] - pivot[j]), 0, 100);
  }
  return res;
}

function terme(t: Terme, eff: Valeurs): number {
  if (t.source2) return t.coef * eff[t.source] * eff[t.source2];
  return t.coef * (eff[t.source] - t.ref);
}

/** Évolution naturelle d'une année : nouvelle base calculée à partir des valeurs effectives de l'année écoulée. */
export function evoluerBase(contenu: Contenu, base: Valeurs, eff: Valeurs): Valeurs {
  const res: Valeurs = {};
  for (const [id, m] of Object.entries(contenu.modele) as [string, ModeleIndicateur][]) {
    const d = m.dynamique;
    let b = base[id];
    b += d.derive;
    for (const t of d.variation) b += terme(t, eff);
    if (d.cible) {
      let cible = d.cible.constante;
      for (const t of d.cible.termes) cible += terme(t, eff);
      b += d.cible.vitesse * (cible - b);
    }
    res[id] = borner(b, m.min, m.max);
  }
  return res;
}

/**
 * Projette l'état sur `horizon` années sans aléa (pas d'événement), à partir de l'année `annee`.
 * Renvoie les jauges de chaque année projetée (index 0 = année courante).
 */
export function projeter(contenu: Contenu, base: Valeurs, mods: Modificateur[], annee: number, horizon: number): ValeursJauges[] {
  const res: ValeursJauges[] = [];
  let b = base;
  for (let k = 0; k < horizon; k++) {
    const eff = valeursEffectives(contenu, b, mods, annee + k);
    res.push(calculerJauges(contenu, eff));
    b = evoluerBase(contenu, b, eff);
  }
  return res;
}

export function valeursInitiales(contenu: Contenu): Valeurs {
  const v: Valeurs = {};
  for (const [id, i] of Object.entries(contenu.indicateurs)) v[id] = i.valeur;
  return v;
}
