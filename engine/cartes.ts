/** Outils sur les cartes : durée affichée, options de curseur interpolées, impacts estimés. */
import type { Contenu } from "./contenu";
import { effetsVersModificateurs, projeter, type Modificateur, type Valeurs, type ValeursJauges } from "./modele";
import { JAUGES, type Carte, type Effet, type JaugeId, type Option } from "./schema";

export type NiveauImpact = "n2" | "n1" | "0" | "p1" | "p2";

export function dureeOption(o: Pick<Option, "duree" | "effets">): "un_an" | "plusieurs_annees" {
  if (o.duree) return o.duree;
  return o.effets.every((e) => e.type === "immediat" && (e.duree ?? 1) <= 1) ? "un_an" : "plusieurs_annees";
}

/** Valeurs autorisées d'un curseur (min → max par pas). */
export function valeursCurseur(carte: Carte): number[] {
  if (!carte.curseur) return [];
  const { min, max, pas } = carte.curseur;
  const res: number[] = [];
  for (let v = min; v <= max + 1e-9; v += pas) res.push(Math.round(v * 1000) / 1000);
  return res;
}

function cleEffet(e: Effet): string {
  return `${e.cible}|${e.type}|${e.delai ?? ""}|${e.duree ?? ""}`;
}

/**
 * Option d'une carte curseur pour une valeur donnée. Si la valeur n'a pas d'option définie,
 * les effets sont interpolés linéairement entre les deux options voisines.
 */
export function optionPourValeur(carte: Carte, valeur: number): Option {
  const opts = [...carte.options].sort((a, b) => (a.valeur ?? 0) - (b.valeur ?? 0));
  const exacte = opts.find((o) => o.valeur === valeur);
  if (exacte) return exacte;
  let a = opts[0];
  let b = opts[opts.length - 1];
  for (let i = 0; i < opts.length - 1; i++) {
    if ((opts[i].valeur ?? 0) <= valeur && (opts[i + 1].valeur ?? 0) >= valeur) {
      a = opts[i];
      b = opts[i + 1];
      break;
    }
  }
  const va = a.valeur ?? 0;
  const vb = b.valeur ?? 0;
  const t = vb === va ? 0 : (valeur - va) / (vb - va);
  const effets = new Map<string, Effet>();
  for (const e of a.effets) effets.set(cleEffet(e), { ...e, valeur: e.valeur * (1 - t) });
  for (const e of b.effets) {
    const k = cleEffet(e);
    const ex = effets.get(k);
    if (ex) ex.valeur += e.valeur * t;
    else effets.set(k, { ...e, valeur: e.valeur * t });
  }
  const unite = carte.curseur?.unite ?? "";
  return {
    id: String(valeur),
    valeur,
    titre: `${valeur}${unite ? " " + unite : ""}`,
    explication: `Entre ${a.titre} et ${b.titre} : des effets intermédiaires, plus doux dans les deux sens.`,
    duree: a.duree ?? b.duree,
    outil: a.outil ?? b.outil,
    effets: [...effets.values()],
    annule: [],
  };
}

/** Options effectivement retenues → liste d'options (avec interpolation pour un curseur). */
export function optionsRetenues(carte: Carte, ids: string[], valeur?: number): Option[] {
  if (carte.type === "curseur" && valeur !== undefined) return [optionPourValeur(carte, valeur)];
  return ids.map((id) => carte.options.find((o) => o.id === id)).filter((o): o is Option => !!o);
}

export interface EtatProjection {
  base: Valeurs;
  mods: Modificateur[];
  annee: number;
}

/**
 * Impact estimé d'un ensemble d'effets sur chaque jauge : écart signé maximal (en points de jauge)
 * entre la projection avec et sans ces effets, sur l'horizon configuré, sans aléa.
 */
export function impactsEffets(contenu: Contenu, etat: EtatProjection, effets: Effet[], reference?: ValeursJauges[]): Record<JaugeId, number> {
  // L'horizon s'allonge pour couvrir les effets très différés (ex. : un réacteur mis en service dans 12 ans).
  const h = horizonEffets(contenu, effets);
  const ref = reference && reference.length >= h ? reference : projeter(contenu, etat.base, etat.mods, etat.annee, h);
  const nouveaux = effetsVersModificateurs(effets, etat.annee, { type: "carte", id: "_estimation" }, contenu.regles.estompeDureeParDefaut);
  const avec = projeter(contenu, etat.base, [...etat.mods, ...nouveaux], etat.annee, h);
  const res = {} as Record<JaugeId, number>;
  for (const j of JAUGES) {
    let pic = 0;
    for (let k = 0; k < h; k++) {
      const d = avec[k][j] - ref[k][j];
      if (Math.abs(d) > Math.abs(pic)) pic = d;
    }
    res[j] = Math.round(pic * 100) / 100;
  }
  return res;
}

/** Horizon de projection pour estimer un ensemble d'effets (années). */
export function horizonEffets(contenu: Contenu, effets: Effet[]): number {
  const delaiMax = Math.max(0, ...effets.map((e) => (e.type === "differe" ? (e.delai ?? 0) : 0)));
  return Math.min(16, Math.max(contenu.regles.impacts.horizon, delaiMax + 3));
}

export function niveauImpact(delta: number, contenu: Contenu): NiveauImpact {
  const { seuilNotable, seuilFort } = contenu.regles.impacts;
  const a = Math.abs(delta);
  if (a < seuilNotable) return "0";
  if (delta > 0) return a >= seuilFort ? "p2" : "p1";
  return a >= seuilFort ? "n2" : "n1";
}

export function niveauxImpacts(impacts: Record<JaugeId, number>, contenu: Contenu): Partial<Record<JaugeId, NiveauImpact>> {
  const res: Partial<Record<JaugeId, NiveauImpact>> = {};
  for (const j of JAUGES) {
    const n = niveauImpact(impacts[j], contenu);
    if (n !== "0") res[j] = n;
  }
  return res;
}
