/** Règles de vote : majorité simple, cumulable (2 retenues), curseur (médiane). */
import { valeursCurseur } from "./cartes";
import { entierAleatoire, type Rng } from "./rng";
import type { Carte } from "./schema";

export interface ResultatVote {
  /** ids d'options retenues (pour un curseur : id de l'option exacte ou valeur en texte) */
  options: string[];
  /** valeur retenue (curseur) */
  valeur?: number;
  /** nombre de voix par option (ou par valeur pour un curseur) */
  decompte: Record<string, number>;
  nbVotes: number;
  /** une égalité a été tranchée par tirage au sort */
  egalite: boolean;
  /** options à égalité avant le tirage (pour l'animation) */
  exAequo: string[];
  /** personne n'a voté : le hasard a décidé */
  aucunVote: boolean;
  /** une égalité a été départagée par un second tour */
  secondTour?: { exAequo: string[]; decompte: Record<string, number>; nbVotes: number };
}

/**
 * @param votes un vote par participant : id d'option (unique, cumulable) ou valeur (curseur).
 * Les votes invalides sont ignorés.
 */
export function resoudreVote(carte: Carte, votes: (string | number)[], rng: Rng): ResultatVote {
  if (carte.type === "curseur") return resoudreCurseur(carte, votes, rng);
  const ids = carte.options.map((o) => o.id);
  const decompte: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  let nb = 0;
  for (const v of votes) {
    if (typeof v === "string" && v in decompte) {
      decompte[v]++;
      nb++;
    }
  }
  const aRetenir = carte.type === "cumulable" ? 2 : 1;
  if (nb === 0) {
    // Personne n'a voté : tirage au sort parmi toutes les options.
    const restantes = [...ids];
    const choisies: string[] = [];
    while (choisies.length < aRetenir && restantes.length) choisies.push(restantes.splice(entierAleatoire(rng, restantes.length), 1)[0]);
    return { options: choisies, decompte, nbVotes: 0, egalite: false, exAequo: [], aucunVote: true };
  }
  // Trie par voix décroissantes ; les égalités à la frontière sont tirées au sort.
  const parVoix = [...ids].sort((a, b) => decompte[b] - decompte[a]);
  const retenues: string[] = [];
  let egalite = false;
  let exAequo: string[] = [];
  while (retenues.length < aRetenir) {
    const restantes = parVoix.filter((id) => !retenues.includes(id) && decompte[id] > 0);
    if (!restantes.length) break;
    const max = decompte[restantes[0]];
    const groupe = restantes.filter((id) => decompte[id] === max);
    const places = aRetenir - retenues.length;
    if (groupe.length <= places) retenues.push(...groupe);
    else {
      egalite = true;
      exAequo = groupe;
      const pool = [...groupe];
      for (let i = 0; i < places; i++) retenues.push(pool.splice(entierAleatoire(rng, pool.length), 1)[0]);
    }
  }
  return { options: retenues, decompte, nbVotes: nb, egalite, exAequo, aucunVote: false };
}

/**
 * Curseur : la médiane des valeurs. Avec un nombre pair de votes, on prend la moyenne des deux
 * valeurs centrales, ramenée à la valeur autorisée la plus proche (la plus basse en cas d'écart égal).
 */
function resoudreCurseur(carte: Carte, votes: (string | number)[], rng: Rng): ResultatVote {
  const autorisees = valeursCurseur(carte);
  const valides = votes
    .map((v) => (typeof v === "string" ? Number(v) : v))
    .filter((v) => Number.isFinite(v) && autorisees.some((a) => Math.abs(a - v) < 1e-9))
    .sort((a, b) => a - b);
  const decompte: Record<string, number> = Object.fromEntries(autorisees.map((a) => [String(a), 0]));
  for (const v of valides) decompte[String(v)]++;
  let valeur: number;
  let aucunVote = false;
  if (!valides.length) {
    aucunVote = true;
    valeur = autorisees[entierAleatoire(rng, autorisees.length)];
  } else {
    const serie = valides;
    const n = serie.length;
    const brute = n % 2 ? serie[(n - 1) / 2] : (serie[n / 2 - 1] + serie[n / 2]) / 2;
    valeur = autorisees.reduce((best, a) => (Math.abs(a - brute) < Math.abs(best - brute) - 1e-9 ? a : best), autorisees[0]);
  }
  const exacte = carte.options.find((o) => o.valeur === valeur);
  return {
    options: [exacte ? exacte.id : String(valeur)],
    valeur,
    decompte,
    nbVotes: valides.length,
    egalite: false,
    exAequo: [],
    aucunVote,
  };
}

/**
 * Second tour entre options à égalité : `places` options à retenir parmi `exAequo`.
 * Une nouvelle égalité est tranchée au sort.
 */
export function resoudreSecondTour(premier: ResultatVote, votes: string[], rng: Rng): ResultatVote {
  const exAequo = premier.exAequo;
  const decompte: Record<string, number> = Object.fromEntries(exAequo.map((id) => [id, 0]));
  let nb = 0;
  for (const v of votes)
    if (v in decompte) {
      decompte[v]++;
      nb++;
    }
  const dejaRetenues = premier.options.filter((o) => !exAequo.includes(o));
  const places = premier.options.length - dejaRetenues.length;
  const parVoix = [...exAequo].sort((a, b) => decompte[b] - decompte[a]);
  const retenues: string[] = [];
  let egalite = false;
  while (retenues.length < places) {
    const restantes = parVoix.filter((id) => !retenues.includes(id));
    const max = decompte[restantes[0]];
    const groupe = restantes.filter((id) => decompte[id] === max);
    const reste = places - retenues.length;
    if (groupe.length <= reste) retenues.push(...groupe);
    else {
      egalite = true;
      const pool = [...groupe];
      for (let i = 0; i < reste; i++) retenues.push(pool.splice(entierAleatoire(rng, pool.length), 1)[0]);
    }
  }
  return {
    ...premier,
    options: [...dejaRetenues, ...retenues],
    egalite,
    exAequo: egalite ? exAequo : [],
    secondTour: { exAequo, decompte, nbVotes: nb },
  };
}
