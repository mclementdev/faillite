/** Bilan de fin de partie : évolution, comparaison « sans intervention », décisions marquantes, enseignements. */
import { niveauImpact } from "./cartes";
import type { Contenu } from "./contenu";
import type { ValeursJauges } from "./modele";
import { trajectoireSansIntervention, type EtatPartie, type Impacts } from "./partie";
import { JAUGES, type JaugeId } from "./schema";

export interface BilanFinal {
  anneeDebut: number;
  anneeFin: number;
  jaugesDepart: ValeursJauges;
  jaugesFin: ValeursJauges;
  jaugesSansIntervention: ValeursJauges;
  /** jauges année par année (partie / sans intervention) */
  courbes: { annee: number; partie: ValeursJauges; sans: ValeursJauges }[];
  indicateurs: { id: string; depart: number; fin: number; sans: number }[];
  decisionsMarquantes: { annee: number; carte: string; titre: string; jauge: JaugeId; impact: number }[];
  momentsCles: { annee: number; evenement: string; reponse?: string; alerte?: JaugeId }[];
  alertesPartie: JaugeId[];
  alertesSans: JaugeId[];
  enseignements: string[];
}

/** Indicateurs mis en avant dans le bilan. */
export const INDICATEURS_CLES = [
  "dette_publique",
  "chomage",
  "taux_pauvrete",
  "emissions_ges",
  "croissance_pib",
  "ratio_cotisants_retraites",
  "desert_medical",
  "independance_energetique",
];

function sousSeuil(etat: EtatPartie, seuil: number): JaugeId[] {
  return JAUGES.filter((j) => etat.historique.some((h) => h.jauges[j] < seuil));
}

function pluriel(n: number, mot: string, motPluriel = mot + "s"): string {
  return `${n} ${n > 1 ? motPluriel : mot}`;
}

export function bilanFinal(contenu: Contenu, etat: EtatPartie, sansCalcule?: EtatPartie): BilanFinal {
  const sans = sansCalcule ?? trajectoireSansIntervention(contenu, etat.graine, etat.nbTours, etat.poids);
  const dernier = etat.historique[etat.historique.length - 1];
  const dernierSans = sans.historique[sans.historique.length - 1];
  const nomJ = (j: JaugeId) => contenu.jauges[j].nom;

  const courbes = etat.historique.map((h, i) => ({ annee: h.annee, partie: h.jauges, sans: sans.historique[i]?.jauges ?? h.jauges }));
  const indicateurs = INDICATEURS_CLES.filter((id) => contenu.indicateurs[id]).map((id) => ({
    id,
    depart: etat.indicateursDepart[id],
    fin: dernier.indicateurs[id],
    sans: dernierSans.indicateurs[id],
  }));

  // Décisions marquantes : impact total estimé le plus fort, avec la jauge la plus touchée.
  const decisionsMarquantes = [...etat.decisions]
    .map((d) => {
      const jauge = JAUGES.reduce((best, j) => (Math.abs(d.impacts[j]) > Math.abs(d.impacts[best]) ? j : best), JAUGES[0]);
      const total = JAUGES.reduce((s, j) => s + Math.abs(d.impacts[j]), 0);
      return { annee: d.annee, carte: d.carte, titre: d.titre, jauge, impact: d.impacts[jauge], total };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .sort((a, b) => a.annee - b.annee)
    .map(({ total: _t, ...x }) => x);

  // Moments clés : événements les plus forts (alertes d'abord), avec la décision du même tour.
  const force = (i: Impacts) => JAUGES.reduce((s, j) => s + Math.abs(i[j]), 0);
  const momentsCles = [...etat.evenements]
    .sort((a, b) => (b.alerte ? 1000 : 0) + force(b.impacts) - ((a.alerte ? 1000 : 0) + force(a.impacts)))
    .slice(0, 3)
    .sort((a, b) => a.annee - b.annee)
    .map((e) => {
      const evt = contenu.evenements.find((x) => x.id === e.id)!;
      const d = etat.decisions.find((x) => x.annee === e.annee);
      return { annee: e.annee, evenement: evt.titre, reponse: d?.titre, alerte: e.alerte };
    });

  const seuil = contenu.regles.seuilAlerte;
  const alertesPartie = sousSeuil(etat, seuil);
  const alertesSans = sousSeuil(sans, seuil);

  // Enseignements générés à partir des données de la partie.
  const enseignements: string[] = [];
  const ecarts = JAUGES.map((j) => ({ j, d: dernier.jauges[j] - dernierSans.jauges[j] })).sort((a, b) => b.d - a.d);
  const meilleur = ecarts[0];
  const pire = ecarts[ecarts.length - 1];
  if (meilleur.d > 1)
    enseignements.push(`Vos choix ont surtout profité à la jauge ${nomJ(meilleur.j)} : ${Math.round(dernier.jauges[meilleur.j])} en ${dernier.annee}, contre ${Math.round(dernierSans.jauges[meilleur.j])} sans intervention.`);
  if (pire.d < -1)
    enseignements.push(`Le prix à payer s'est lu sur la jauge ${nomJ(pire.j)} : ${Math.round(Math.abs(pire.d))} points de moins que sans intervention.`);

  const differees = etat.decisions.filter((d) => d.duree === "plusieurs_annees").length;
  if (etat.decisions.length)
    enseignements.push(
      `${pluriel(differees, "décision")} sur ${etat.decisions.length} ont agi sur plusieurs années : une partie de ce que vous voyez en ${dernier.annee} a été votée bien avant.`,
    );

  const arbitrages = etat.decisions.filter((d) => {
    const n = JAUGES.map((j) => niveauImpact(d.impacts[j], contenu));
    return n.some((x) => x.startsWith("p")) && n.some((x) => x.startsWith("n"));
  }).length;
  if (etat.decisions.length)
    enseignements.push(
      arbitrages === etat.decisions.length
        ? "Chaque décision a amélioré certaines jauges et en a dégradé d'autres : il n'y a pas eu de choix gagnant partout."
        : `${pluriel(arbitrages, "décision")} sur ${etat.decisions.length} ont amélioré certaines jauges en en dégradant d'autres.`,
    );

  if (alertesSans.length !== alertesPartie.length || alertesSans.length > 0)
    enseignements.push(
      `Sans aucune décision, ${pluriel(alertesSans.length, "jauge")} ${alertesSans.length > 1 ? "seraient passées" : "serait passée"} sous le seuil d'alerte ; avec vos choix : ${alertesPartie.length}.`,
    );
  if (etat.resonances.length) {
    const r = contenu.resonances.find((x) => x.id === etat.resonances[0].id);
    if (r) enseignements.push(`Des décisions se sont combinées : ${r.titre.toLowerCase()}.`);
  }

  return {
    anneeDebut: etat.anneeDepart,
    anneeFin: dernier.annee,
    jaugesDepart: etat.jaugesDepart,
    jaugesFin: dernier.jauges,
    jaugesSansIntervention: dernierSans.jauges,
    courbes,
    indicateurs,
    decisionsMarquantes,
    momentsCles,
    alertesPartie,
    alertesSans,
    enseignements: enseignements.slice(0, 4),
  };
}
