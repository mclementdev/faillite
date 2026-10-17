/** Générateur pseudo-aléatoire avec graine (mulberry32) et tirages pondérés. */

export type Rng = () => number;

export function mulberry32(graine: number): Rng {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hachage FNV-1a 32 bits d'une chaîne. */
export function hacher(texte: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Flux aléatoire indépendant pour un usage donné (« carte », « evenement », « vote »…) et un tour.
 * Ainsi le tirage des événements d'une graine ne dépend pas des décisions prises :
 * la trajectoire « sans intervention » voit passer les mêmes événements aléatoires.
 */
export function flux(graine: number, usage: string, tour: number): Rng {
  return mulberry32(hacher(`${graine}|${usage}|${tour}`));
}

/** Tirage proportionnel aux poids ; les poids ≤ 0 ne sont jamais tirés. */
export function tirerPondere<T>(elements: T[], poids: (e: T) => number, rng: Rng): T | undefined {
  const valides = elements.filter((e) => poids(e) > 0);
  const total = valides.reduce((s, e) => s + poids(e), 0);
  if (total <= 0) return undefined;
  let r = rng() * total;
  for (const e of valides) {
    r -= poids(e);
    if (r < 0) return e;
  }
  return valides[valides.length - 1];
}

export function entierAleatoire(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}
