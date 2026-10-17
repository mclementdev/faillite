/** Types de la vue publique d'une salle, partagés entre le serveur et les écrans. */
import type { JaugeId, NiveauImpact } from "@/engine";

export type Phase = "accueil" | "election" | "presidence" | "annonce" | "vote" | "resultat" | "fin";

export interface Pastille {
  jauge: JaugeId;
  nom: string;
  niveau: NiveauImpact;
  /** écart chiffré (affiché seulement après la décision) */
  delta?: number;
}

export interface VueJauge {
  id: JaugeId;
  nom: string;
  valeur: number;
  tendance: NiveauImpact;
  alerte: boolean;
}

export interface VueIndicateur {
  id: string;
  nom: string;
  valeur: number;
  unite: string;
  decimales: number;
  provisoire: boolean;
  jauge: JaugeId;
  source: string;
  annee: string | number;
}

export interface VueOption {
  id: string;
  lettre: string;
  titre: string;
  explication: string;
  duree: "un_an" | "plusieurs_annees";
  valeur?: number;
  pastilles: Pastille[];
}

export interface VueCarte {
  id: string;
  type: "unique" | "cumulable" | "curseur";
  theme: string;
  titre: string;
  contexte: string;
  curseur?: { min: number; max: number; pas: number; unite: string; valeurs: number[] };
  options: VueOption[];
  /** pour un curseur : option (éventuellement interpolée) de chaque valeur autorisée */
  parValeur?: Record<string, VueOption>;
  notePedagogique: string;
}

export interface VueEvenement {
  titre: string;
  description: string;
  nature: "positif" | "negatif";
  alerte?: string;
  pastilles: Pastille[];
}

export interface VueChangement {
  nom: string;
  avant: number;
  apres: number;
  unite: string;
  decimales: number;
  pastille?: Pastille;
}

export interface VueResultat {
  titre: string;
  explication: string;
  lettres: string[];
  valeur?: number;
  decompte: { id: string; label: string; voix: number; retenue: boolean }[];
  nbVotes: number;
  egalite: boolean;
  exAequo: string[];
  aucunVote: boolean;
  /** égalité tranchée par la voix de la présidence (comptée double) */
  departagePresident: boolean;
  pastilles: Pastille[];
  changements: VueChangement[];
  programme: { annee: number; texte: string; pastille?: Pastille }[];
  notePedagogique: string;
  /** conséquence inattendue, cachée pendant le vote */
  imprevu?: VueImprevu;
}

export interface VueImprevu {
  titre: string;
  description: string;
  nature: "positif" | "negatif";
  pastilles: Pastille[];
}

export interface VueBilan {
  anneeDebut: number;
  anneeFin: number;
  jauges: { id: JaugeId; nom: string; depart: number; fin: number; sans: number }[];
  indicateurs: { nom: string; depart: number; fin: number; sans: number; unite: string; decimales: number }[];
  decisions: { annee: number; titre: string; pastille: Pastille }[];
  moments: { annee: number; evenement: string; reponse?: string }[];
  enseignements: string[];
  alertesSans: number;
  alertesPartie: number;
}

export interface VuePublique {
  code: string;
  version: number;
  phase: Phase;
  serveurMaintenant: number;
  nbTours: number;
  toursPossibles: number[];
  dureeVote: number;
  anneeDepart: number;
  annee: number;
  tour: number;
  seuil: number;
  joueurs: { pseudo: string; couleur: string }[];
  nbVotes: number;
  jauges: VueJauge[];
  indicateurs: VueIndicateur[];
  evenement?: VueEvenement;
  arrivees: string[];
  resonances: { titre: string; explication: string }[];
  carte?: VueCarte;
  echeance?: number;
  resultat?: VueResultat;
  bilan?: VueBilan;
  /** présidence du sénat (élue en début de partie) */
  presidence?: { pseudo: string; couleur: string };
  /** résultat de l'élection (phase « presidence ») */
  election?: VueElection;
}

export interface VueElection {
  decompte: { pseudo: string; couleur: string; voix: number; elu: boolean }[];
  nbVotes: number;
  egalite: boolean;
  exAequo: string[];
  aucunVote: boolean;
}
