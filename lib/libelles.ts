/** Libellés affichés (ministères, outils, mois), partagés par le serveur et les écrans. */
import type { Ministere, Outil } from "@/engine";

export const MINISTERES_LIBELLES: Record<Ministere, string> = {
  economie_finances: "Économie et Finances",
  travail: "Travail et Solidarités",
  ecologie: "Transition écologique",
  agriculture: "Agriculture",
  sante: "Santé",
  education: "Éducation",
  armees: "Armées",
  interieur: "Intérieur",
  justice: "Justice",
  culture: "Culture et Sport",
  logement: "Logement",
  europe: "Europe et Affaires étrangères",
};

export const OUTILS_LIBELLES: Record<Outil, { court: string; detail: string }> = {
  decret: { court: "Décret", detail: "Le gouvernement décide seul, l'effet est immédiat. Une autre majorité pourra l'annuler aussi vite." },
  loi: { court: "Loi", detail: "Le texte passe par l'Assemblée et le Sénat : plusieurs mois de débat, mais un effet durable." },
  budget: { court: "Budget", detail: "Une ligne de la loi de finances : de l'argent dépensé ou économisé chaque année." },
  referendum: { court: "Référendum", detail: "Le peuple tranche. Légitimité maximale, mais le non peut l'emporter, surtout si le président est impopulaire." },
  negociation: { court: "Négociation", detail: "Avec les syndicats, les entreprises ou les partenaires européens : plus long, plus consensuel, résultat partagé." },
  decision: { court: "Décision", detail: "Un choix de l'exécutif qui ne demande pas de texte nouveau : rapide, mais sans garantie de durée." },
};

export const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export function nomMois(m: number): string {
  return MOIS[Math.max(0, Math.min(11, m - 1))];
}
