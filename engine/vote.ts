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
  /** une égalité a été tranchée par la voix de la présidence, comptée double */
  departagePresident: boolean;
}

/**
 * @param votes un vote par participant : id d'option (unique, cumulable) ou valeur (curseur).
 * Les votes invalides sont ignorés.
 * @param voixPresident vote de la présidence (déjà compté dans `votes`) : en cas d'égalité, il compte
 * double ; si l'égalité persiste, le sort tranche.
 */
export function resoudreVote(carte: Carte, votes: (string | number)[], rng: Rng, voixPresident?: string | number): ResultatVote {
  if (carte.type === "curseur") return resoudreCurseur(carte, votes, rng, voixPresident);
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
    return { options: choisies, decompte, nbVotes: 0, egalite: false, exAequo: [], aucunVote: true, departagePresident: false };
  }
  // Trie par voix décroissantes ; les égalités à la frontière sont tirées au sort.
  const parVoix = [...ids].sort((a, b) => decompte[b] - decompte[a]);
  const retenues: string[] = [];
  let egalite = false;
  let departagePresident = false;
  let exAequo: string[] = [];
  while (retenues.length < aRetenir) {
    const restantes = parVoix.filter((id) => !retenues.includes(id) && decompte[id] > 0);
    if (!restantes.length) break;
    const max = decompte[restantes[0]];
    const groupe = restantes.filter((id) => decompte[id] === max);
    const places = aRetenir - retenues.length;
    if (groupe.length <= places) retenues.push(...groupe);
    else if (typeof voixPresident === "string" && groupe.includes(voixPresident) && !departagePresident) {
      // La voix de la présidence compte double : son option sort seule en tête du groupe.
      departagePresident = true;
      exAequo = groupe;
      retenues.push(voixPresident);
    } else {
      egalite = true;
      exAequo = groupe;
      const pool = [...groupe];
      for (let i = 0; i < places; i++) retenues.push(pool.splice(entierAleatoire(rng, pool.length), 1)[0]);
    }
  }
  return { options: retenues, decompte, nbVotes: nb, egalite, exAequo, aucunVote: false, departagePresident };
}

/**
 * Curseur : la médiane des valeurs. Avec un nombre pair de votes et deux valeurs centrales différentes
 * (une « égalité »), la voix de la présidence compte double, ce qui donne une médiane exacte ; sans
 * présidence, on prend la moyenne des deux valeurs centrales, ramenée à la valeur autorisée la plus
 * proche (la plus basse en cas d'écart égal).
 */
function resoudreCurseur(carte: Carte, votes: (string | number)[], rng: Rng, voixPresident?: string | number): ResultatVote {
  const autorisees = valeursCurseur(carte);
  const valides = votes
    .map((v) => (typeof v === "string" ? Number(v) : v))
    .filter((v) => Number.isFinite(v) && autorisees.some((a) => Math.abs(a - v) < 1e-9))
    .sort((a, b) => a - b);
  const decompte: Record<string, number> = Object.fromEntries(autorisees.map((a) => [String(a), 0]));
  for (const v of valides) decompte[String(v)]++;
  let valeur: number;
  let aucunVote = false;
  let departagePresident = false;
  const president = voixPresident === undefined ? NaN : Number(voixPresident);
  if (!valides.length) {
    aucunVote = true;
    valeur = autorisees[entierAleatoire(rng, autorisees.length)];
  } else {
    let serie = valides;
    const n0 = serie.length;
    if (n0 % 2 === 0 && serie[n0 / 2 - 1] !== serie[n0 / 2] && serie.some((v) => Math.abs(v - president) < 1e-9)) {
      departagePresident = true;
      serie = [...serie, president].sort((a, b) => a - b);
    }
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
    departagePresident,
  };
}

export interface ResultatElection {
  /** pseudo élu (absent s'il n'y a aucun candidat) */
  elu?: string;
  decompte: Record<string, number>;
  nbVotes: number;
  egalite: boolean;
  exAequo: string[];
  /** personne n'a voté : le sort a désigné la présidence parmi les participants */
  aucunVote: boolean;
}

/** Élection de la présidence du sénat : majorité simple, égalité tranchée au sort. */
export function resoudreElection(candidats: string[], votes: string[], rng: Rng): ResultatElection {
  const decompte: Record<string, number> = Object.fromEntries(candidats.map((c) => [c, 0]));
  let nb = 0;
  for (const v of votes)
    if (v in decompte) {
      decompte[v]++;
      nb++;
    }
  if (!candidats.length) return { decompte, nbVotes: 0, egalite: false, exAequo: [], aucunVote: true };
  if (!nb) return { elu: candidats[entierAleatoire(rng, candidats.length)], decompte, nbVotes: 0, egalite: false, exAequo: [], aucunVote: true };
  const max = Math.max(...Object.values(decompte));
  const groupe = candidats.filter((c) => decompte[c] === max);
  if (groupe.length === 1) return { elu: groupe[0], decompte, nbVotes: nb, egalite: false, exAequo: [], aucunVote: false };
  return { elu: groupe[entierAleatoire(rng, groupe.length)], decompte, nbVotes: nb, egalite: true, exAequo: groupe, aucunVote: false };
}
