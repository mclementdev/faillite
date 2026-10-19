/**
 * Simulation de N parties : sert à la route admin, au script `npm run simulate` et aux tests.
 */
import type { Contenu } from "./contenu";
import { flux, hacher } from "./rng";
import { jouerPartie, type Impacts, type Poids } from "./partie";
import { JAUGES, type JaugeId } from "./schema";

export type ModeSimulation = "aleatoire" | "sans_intervention" | "meilleur" | "pire";

export interface StatJauge {
  moyenne: number;
  mediane: number;
  p10: number;
  p90: number;
}

export interface StatOption {
  carte: string;
  option: string;
  titre: string;
  /** nombre de fois où l'option a été proposée */
  propositions: number;
  /** nombre de fois où elle a été retenue */
  retenue: number;
  impactsMoyens: Record<JaugeId, number>;
  score: number;
  statut: "dominante" | "perdante" | "equilibree";
}

export interface ResultatSimulation {
  n: number;
  graine: number;
  mode: ModeSimulation;
  nbAnnees: number;
  /** événements par partie (moyenne), dont ceux provoqués par une décision */
  evenementsParPartie: number;
  provoquesParPartie: number;
  crisesParPartie: number;
  dureeMs: number;
  date: string;
  jaugesFin: Record<JaugeId, StatJauge>;
  alertes: { auMoinsUne: number; parJauge: Record<JaugeId, number> };
  cartes: Record<string, number>;
  evenements: Record<string, number>;
  options: StatOption[];
  synthese: string;
}

function quantile(tri: number[], q: number): number {
  if (!tri.length) return 0;
  const pos = (tri.length - 1) * q;
  const bas = Math.floor(pos);
  const haut = Math.ceil(pos);
  return tri[bas] + (tri[haut] - tri[bas]) * (pos - bas);
}

const arrondi = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

/** Nombre de votants simulés par partie (votes aléatoires). */
const VOTANTS = 12;

export function simulate(contenu: Contenu, n: number, graine: number, poids: Partial<Poids> | undefined, mode: ModeSimulation, nbAnnees = 5): ResultatSimulation {
  const debut = Date.now();
  const finales: Record<JaugeId, number[]> = Object.fromEntries(JAUGES.map((j) => [j, []])) as unknown as Record<JaugeId, number[]>;
  const alertesParJauge = Object.fromEntries(JAUGES.map((j) => [j, 0])) as Record<JaugeId, number>;
  let auMoinsUne = 0;
  const cartes: Record<string, number> = Object.fromEntries(contenu.cartes.map((c) => [c.id, 0]));
  const evenements: Record<string, number> = Object.fromEntries(contenu.evenements.map((e) => [e.id, 0]));
  const opts = new Map<string, { carte: string; option: string; titre: string; propositions: number; retenue: number; somme: Record<JaugeId, number> }>();
  for (const c of contenu.cartes)
    for (const o of c.options)
      opts.set(`${c.id}|${o.id}`, { carte: c.id, option: o.id, titre: o.titre, propositions: 0, retenue: 0, somme: Object.fromEntries(JAUGES.map((j) => [j, 0])) as Record<JaugeId, number> });

  const seuil = contenu.regles.seuilAlerte;
  let nbEvenements = 0;
  let nbProvoques = 0;
  let nbCrises = 0;
  for (let i = 0; i < n; i++) {
    const g = hacher(`${graine}#${i}`);
    // Campagne simulée : chaque promesse proposée est faite une fois sur deux.
    const rngC = flux(g, "campagne", 0);
    const proposees = [...contenu.promesses].sort(() => rngC() - 0.5).slice(0, contenu.regles.campagne.nbPromesses).map((p) => p.id);
    const promesses = proposees.filter(() => rngC() < 0.5);
    const etat = jouerPartie(
      contenu,
      { graine: g, nbAnnees, poids, promesses, promessesProposees: proposees, sansIntervention: mode === "sans_intervention" },
      (carte, _etat, etape) => {
        const rng = flux(g, "simulation", etape.n);
        // Joueurs « parfaits » ou « catastrophiques » : l'option qui fait le plus monter (ou baisser) les jauges.
        if (mode === "meilleur" || mode === "pire") {
          const score = (imp: Impacts) => JAUGES.reduce((t, j) => t + imp[j] + 2 * Math.min(0, imp[j]), 0);
          const cles = Object.keys(etape.impactsOptions);
          const tri = cles.sort((a, b) => score(etape.impactsOptions[b]) - score(etape.impactsOptions[a]));
          const cle = mode === "meilleur" ? tri[0] : tri[tri.length - 1];
          return [carte.type === "curseur" ? Number(cle) : cle];
        }
        const votes: (string | number)[] = [];
        for (let v = 0; v < VOTANTS; v++) {
          if (carte.type === "curseur" && carte.curseur) {
            const pas = Math.round((carte.curseur.max - carte.curseur.min) / carte.curseur.pas);
            votes.push(carte.curseur.min + Math.floor(rng() * (pas + 1)) * carte.curseur.pas);
          } else votes.push(carte.options[Math.floor(rng() * carte.options.length)].id);
        }
        return votes;
      },
      (_etat, tour, res) => {
        if (tour.evenement) {
          evenements[tour.evenement.id] = (evenements[tour.evenement.id] ?? 0) + 1;
          nbEvenements++;
          if (tour.evenement.cause) nbProvoques++;
          if (contenu.evenements.find((x) => x.id === tour.evenement!.id)?.gravite === "crise") nbCrises++;
        }
        if (!tour.carte) return;
        cartes[tour.carte] = (cartes[tour.carte] ?? 0) + 1;
        const carte = contenu.cartes.find((c) => c.id === tour.carte)!;
        for (const o of carte.options) {
          const cle = carte.type === "curseur" ? String(o.valeur) : o.id;
          const imp = tour.impactsOptions[cle];
          const s = opts.get(`${carte.id}|${o.id}`)!;
          if (!imp) continue;
          s.propositions++;
          for (const j of JAUGES) s.somme[j] += imp[j];
          if (res?.decision.options.includes(o.id)) s.retenue++;
        }
      },
    );
    const fin = etat.historique[etat.historique.length - 1].jauges;
    for (const j of JAUGES) finales[j].push(fin[j]);
    let une = false;
    for (const j of JAUGES) {
      if (etat.historique.some((h) => h.jauges[j] < seuil)) {
        alertesParJauge[j]++;
        une = true;
      }
    }
    if (une) auMoinsUne++;
  }

  const jaugesFin = {} as Record<JaugeId, StatJauge>;
  for (const j of JAUGES) {
    const tri = [...finales[j]].sort((a, b) => a - b);
    jaugesFin[j] = {
      moyenne: arrondi(tri.reduce((s, x) => s + x, 0) / Math.max(1, tri.length)),
      mediane: arrondi(quantile(tri, 0.5)),
      p10: arrondi(quantile(tri, 0.1)),
      p90: arrondi(quantile(tri, 0.9)),
    };
  }

  // Effet moyen de chaque option et repérage des options dominantes ou toujours perdantes.
  const { seuilNotable } = contenu.regles.impacts;
  const marge = 1.5;
  const options: StatOption[] = [...opts.values()].map((s) => {
    const impactsMoyens = Object.fromEntries(JAUGES.map((j) => [j, s.propositions ? arrondi(s.somme[j] / s.propositions, 2) : 0])) as Record<JaugeId, number>;
    return {
      carte: s.carte,
      option: s.option,
      titre: s.titre,
      propositions: s.propositions,
      retenue: s.retenue,
      impactsMoyens,
      score: arrondi(JAUGES.reduce((t, j) => t + impactsMoyens[j], 0), 2),
      statut: "equilibree" as StatOption["statut"],
    };
  });
  for (const c of contenu.cartes) {
    const soeurs = options.filter((o) => o.carte === c.id && o.propositions > 0);
    for (const o of soeurs) {
      const autres = soeurs.filter((x) => x !== o);
      if (!autres.length) continue;
      const valeurs = JAUGES.map((j) => o.impactsMoyens[j]);
      if (autres.every((x) => o.score - x.score >= marge) && valeurs.every((v) => v > -seuilNotable)) o.statut = "dominante";
      else if (autres.every((x) => x.score - o.score >= marge) && valeurs.every((v) => v < seuilNotable)) o.statut = "perdante";
    }
  }

  const res: ResultatSimulation = {
    n,
    graine,
    mode,
    nbAnnees,
    evenementsParPartie: arrondi(n ? nbEvenements / n : 0, 2),
    provoquesParPartie: arrondi(n ? nbProvoques / n : 0, 2),
    crisesParPartie: arrondi(n ? nbCrises / n : 0, 2),
    dureeMs: Date.now() - debut,
    date: new Date().toISOString(),
    jaugesFin,
    alertes: {
      auMoinsUne: arrondi(n ? auMoinsUne / n : 0, 3),
      parJauge: Object.fromEntries(JAUGES.map((j) => [j, arrondi(n ? alertesParJauge[j] / n : 0, 3)])) as Record<JaugeId, number>,
    },
    cartes,
    evenements,
    options,
    synthese: "",
  };
  res.synthese = synthese(contenu, res);
  return res;
}

function synthese(contenu: Contenu, r: ResultatSimulation): string {
  const nom = (j: JaugeId) => contenu.jauges[j].nom;
  const parMoyenne = [...JAUGES].sort((a, b) => r.jaugesFin[a].moyenne - r.jaugesFin[b].moyenne);
  const plusFaible = parMoyenne[0];
  const plusForte = parMoyenne[parMoyenne.length - 1];
  const alerteMax = [...JAUGES].sort((a, b) => r.alertes.parJauge[b] - r.alertes.parJauge[a])[0];
  const dominantes = r.options.filter((o) => o.statut === "dominante").length;
  const perdantes = r.options.filter((o) => o.statut === "perdante").length;
  const jamais = Object.entries(r.cartes).filter(([, v]) => v === 0).length;
  const morceaux = [
    `Sur ${r.n} parties de ${r.nbAnnees} ans (${r.mode === "aleatoire" ? "choix aléatoires" : "sans intervention"}), ${nom(plusFaible)} finit en moyenne le plus bas (${r.jaugesFin[plusFaible].moyenne}) et ${nom(plusForte)} le plus haut (${r.jaugesFin[plusForte].moyenne}).`,
    `${Math.round(r.alertes.auMoinsUne * 100)} % des parties voient au moins une jauge passer sous le seuil, le plus souvent ${nom(alerteMax)} (${Math.round(r.alertes.parJauge[alerteMax] * 100)} %).`,
  ];
  if (r.mode === "aleatoire")
    morceaux.push(
      dominantes || perdantes
        ? `À équilibrer : ${dominantes} option(s) dominante(s) et ${perdantes} option(s) toujours perdante(s).`
        : "Aucune option n'écrase ses voisines : les arbitrages sont équilibrés.",
    );
  if (jamais) morceaux.push(`${jamais} carte(s) n'ont jamais été tirées.`);
  return morceaux.join(" ");
}
