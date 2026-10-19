/**
 * Validation du contenu (schémas + références croisées) avec des messages clairs :
 * « fichier › carte › champ : message ».
 */
import { z } from "zod";
import { valeursCurseur } from "./cartes";
import {
  Carte,
  Evenement,
  Promesse,
  Indicateurs,
  Jauges,
  JAUGES,
  Modele,
  Regles,
  Resonance,
  type Carte as TCarte,
  type Evenement as TEvenement,
  type Promesse as TPromesse,
  type Indicateur,
  type Jauge,
  type JaugeId,
  type ModeleIndicateur,
  type Regles as TRegles,
  type Resonance as TResonance,
} from "./schema";

export interface Contenu {
  indicateurs: Record<string, Indicateur>;
  modele: Record<string, ModeleIndicateur>;
  jauges: Record<JaugeId, Jauge>;
  regles: TRegles;
  cartes: TCarte[];
  evenements: TEvenement[];
  resonances: TResonance[];
  promesses: TPromesse[];
}

/** Contenu brut, tel que lu dans les fichiers JSON, avec le nom de chaque fichier. */
export interface ContenuBrut {
  indicateurs: { fichier: string; data: unknown };
  modele: { fichier: string; data: unknown };
  jauges: { fichier: string; data: unknown };
  regles: { fichier: string; data: unknown };
  cartes: { fichier: string; data: unknown }[];
  evenements: { fichier: string; data: unknown };
  resonances: { fichier: string; data: unknown };
  promesses: { fichier: string; data: unknown };
}

export class ErreurContenu extends Error {
  constructor(public erreurs: string[]) {
    super(`Contenu invalide (${erreurs.length} erreur${erreurs.length > 1 ? "s" : ""}) :\n- ` + erreurs.join("\n- "));
    this.name = "ErreurContenu";
  }
}

function chemin(path: (string | number)[], data: unknown): string {
  // Remplace les index de tableaux de premier niveau par l'id de l'élément quand il existe.
  const morceaux: string[] = [];
  let courant: unknown = data;
  for (const p of path) {
    if (typeof p === "number" && Array.isArray(courant)) {
      const el = courant[p] as { id?: string } | undefined;
      morceaux.push(el && typeof el === "object" && el.id ? `« ${el.id} »` : `[${p}]`);
      courant = el;
    } else {
      morceaux.push(String(p));
      courant = courant && typeof courant === "object" ? (courant as Record<string, unknown>)[p as string] : undefined;
    }
  }
  return morceaux.join(" › ");
}

function analyser<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, fichier: string, data: unknown, erreurs: string[]): T | undefined {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  for (const issue of r.error.issues) {
    const ch = chemin(issue.path, data);
    erreurs.push(`${fichier}${ch ? " › " + ch : ""} : ${issue.message}`);
  }
  return undefined;
}

export function validerContenu(brut: ContenuBrut): Contenu {
  const erreurs: string[] = [];
  const indicateurs = analyser(Indicateurs, brut.indicateurs.fichier, brut.indicateurs.data, erreurs);
  const modele = analyser(Modele, brut.modele.fichier, brut.modele.data, erreurs);
  const jauges = analyser(Jauges, brut.jauges.fichier, brut.jauges.data, erreurs) as Record<JaugeId, Jauge> | undefined;
  const regles = analyser(Regles, brut.regles.fichier, brut.regles.data, erreurs);
  const cartes: TCarte[] = [];
  const fichierCarte = new Map<string, string>();
  for (const f of brut.cartes) {
    const liste = analyser(z.array(Carte), f.fichier, f.data, erreurs);
    if (liste)
      for (const c of liste) {
        cartes.push(c);
        if (fichierCarte.has(c.id)) erreurs.push(`${f.fichier} › « ${c.id} » : id de carte déjà utilisé dans ${fichierCarte.get(c.id)}`);
        fichierCarte.set(c.id, f.fichier);
      }
  }
  const evenements = analyser(z.array(Evenement), brut.evenements.fichier, brut.evenements.data, erreurs) ?? [];
  const resonances = analyser(z.array(Resonance), brut.resonances.fichier, brut.resonances.data, erreurs) ?? [];
  const promesses = analyser(z.array(Promesse), brut.promesses.fichier, brut.promesses.data, erreurs) ?? [];

  if (erreurs.length || !indicateurs || !modele || !jauges || !regles) throw new ErreurContenu(erreurs);

  // ---- Références croisées
  const ind = new Set(Object.keys(indicateurs));
  for (const id of ind) if (!modele[id]) erreurs.push(`${brut.modele.fichier} : l'indicateur « ${id} » n'a pas de modèle (normalisation, bornes)`);
  for (const [id, m] of Object.entries(modele)) {
    if (!ind.has(id)) erreurs.push(`${brut.modele.fichier} › ${id} : indicateur inconnu dans ${brut.indicateurs.fichier}`);
    if (m.min >= m.max) erreurs.push(`${brut.modele.fichier} › ${id} : min doit être < max`);
    const termes = [...(m.dynamique.cible?.termes ?? []), ...m.dynamique.variation];
    for (const t of termes) {
      if (!ind.has(t.source)) erreurs.push(`${brut.modele.fichier} › ${id} › dynamique : source inconnue « ${t.source} »`);
      if (t.source2 && !ind.has(t.source2)) erreurs.push(`${brut.modele.fichier} › ${id} › dynamique : source2 inconnue « ${t.source2} »`);
    }
    const v = indicateurs[id]?.valeur;
    if (v !== undefined && (v < m.min || v > m.max)) erreurs.push(`${brut.modele.fichier} › ${id} : la valeur de départ ${v} sort des bornes [${m.min}, ${m.max}]`);
  }
  for (const j of JAUGES) {
    const jauge = jauges[j];
    if (!jauge) {
      erreurs.push(`${brut.jauges.fichier} : jauge « ${j} » manquante`);
      continue;
    }
    const actifs = jauge.indicateurs.filter((x) => x.poids > 0);
    // La popularité est une cote unique ; les jauges du pays résument au moins 5 vrais indicateurs.
    if (j !== "popularite" && actifs.length < 5) erreurs.push(`${brut.jauges.fichier} › ${j} : au moins 5 indicateurs pondérés sont requis (${actifs.length})`);
    for (const x of jauge.indicateurs) if (!ind.has(x.id)) erreurs.push(`${brut.jauges.fichier} › ${j} : indicateur inconnu « ${x.id} »`);
  }

  const idsCartes = new Set(cartes.map((c) => c.id));
  const verifierEffets = (fichier: string, ou: string, effets: { cible: string }[]) => {
    for (const e of effets) if (!ind.has(e.cible)) erreurs.push(`${fichier} › ${ou} : effet sur un indicateur inconnu « ${e.cible} »`);
  };
  const verifierConditions = (fichier: string, ou: string, conds: TCarte["conditions"]) => {
    for (const c of conds) {
      if ("indicateur" in c && !ind.has(c.indicateur)) erreurs.push(`${fichier} › ${ou} › conditions : indicateur inconnu « ${c.indicateur} »`);
      if ("carteJouee" in c && !idsCartes.has(c.carteJouee)) erreurs.push(`${fichier} › ${ou} › conditions : carte inconnue « ${c.carteJouee} »`);
      if ("carteNonJouee" in c && !idsCartes.has(c.carteNonJouee)) erreurs.push(`${fichier} › ${ou} › conditions : carte inconnue « ${c.carteNonJouee} »`);
    }
  };
  for (const c of cartes) {
    const f = fichierCarte.get(c.id)!;
    verifierConditions(f, `« ${c.id} »`, c.conditions);
    for (const o of c.options) {
      verifierEffets(f, `« ${c.id} » › option « ${o.id} »`, o.effets);
      for (const a of o.annule) if (!idsCartes.has(a)) erreurs.push(`${f} › « ${c.id} » › option « ${o.id} » › annule : carte inconnue « ${a} »`);
    }
  }
  /** Vérifie qu'une carte existe et que ses options (ou valeurs de curseur) aussi. */
  const verifierChoix = (fichier: string, ou: string, carteId: string, options: string[] | undefined) => {
    // Une suite peut aussi venir de la réponse à une crise.
    const crise = evenements.find((e) => e.id === carteId && e.reponses.length);
    if (crise) {
      for (const o of options ?? []) if (!crise.reponses.some((r) => r.id === o)) erreurs.push(`${fichier} › ${ou} : réponse « ${o} » absente de la crise « ${carteId} »`);
      return;
    }
    const carte = cartes.find((c) => c.id === carteId);
    if (!carte) {
      erreurs.push(`${fichier} › ${ou} : carte inconnue « ${carteId} »`);
      return;
    }
    for (const o of options ?? [])
      if (!carte.options.some((x) => x.id === o) && !(carte.type === "curseur" && valeursCurseur(carte).some((v) => String(v) === o)))
        erreurs.push(`${fichier} › ${ou} : option « ${o} » absente de la carte « ${carteId} »`);
  };
  const idsEvt = new Set<string>();
  for (const e of evenements) {
    const f = brut.evenements.fichier;
    if (idsEvt.has(e.id)) erreurs.push(`${f} › « ${e.id} » : id en double`);
    idsEvt.add(e.id);
    verifierEffets(f, `« ${e.id} »`, e.effets);
    for (const r of e.reponses) verifierEffets(f, `« ${e.id} » › réponse « ${r.id} »`, r.effets);
    verifierConditions(f, `« ${e.id} »`, e.conditions);
    for (const d of e.declenchePar) {
      verifierChoix(f, `« ${e.id} » › declenchePar`, d.carte, d.options);
      if (d.delai[0] > d.delai[1]) erreurs.push(`${f} › « ${e.id} » › declenchePar : délai [min, max] inversé`);
    }
  }
  const idsPromesses = new Set<string>();
  for (const p of promesses) {
    const f = brut.promesses.fichier;
    if (idsPromesses.has(p.id)) erreurs.push(`${f} › « ${p.id} » : id en double`);
    idsPromesses.add(p.id);
    verifierChoix(f, `« ${p.id} »`, p.carte, p.options);
  }
  for (const r of resonances) {
    verifierEffets(brut.resonances.fichier, `« ${r.id} »`, r.effets);
    for (const ref of [...r.si, ...r.sauf]) {
      const carte = cartes.find((c) => c.id === ref.carte);
      if (!carte) {
        erreurs.push(`${brut.resonances.fichier} › « ${r.id} » : carte inconnue « ${ref.carte} »`);
        continue;
      }
      for (const o of ref.options)
        if (!carte.options.some((x) => x.id === o)) erreurs.push(`${brut.resonances.fichier} › « ${r.id} » : option « ${o} » absente de la carte « ${ref.carte} »`);
    }
  }
  if (erreurs.length) throw new ErreurContenu(erreurs);
  return { indicateurs, modele, jauges, regles, cartes, evenements, resonances, promesses };
}
