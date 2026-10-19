/** Types de la vue publique d'une salle, partagés entre le serveur et les écrans. */
import type { JaugeId, Ministere, NiveauImpact, Outil } from "@/engine";

export type Phase = "accueil" | "campagne" | "investiture" | "annonce" | "vote" | "secondTour" | "resultat" | "bilanAnnee" | "fin";

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
  /** jauge de rattachement, ou « demographie » (tendance de fond, hors jauges) */
  groupe: JaugeId | "demographie";
  source: string;
  annee: string | number;
}

export interface VueOption {
  id: string;
  lettre: string;
  titre: string;
  explication: string;
  duree: "un_an" | "plusieurs_annees";
  outil: Outil;
  /** effet sur le budget de l'État en Md€ par an (positif = coût, négatif = économie) */
  budget?: number;
  valeur?: number;
  pastilles: Pastille[];
}

export interface VueCarte {
  id: string;
  type: "unique" | "cumulable" | "curseur";
  /** carte de crise (réponse à un événement) */
  crise: boolean;
  ministere?: Ministere;
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
  gravite: "breve" | "crise";
  /** jauge en alerte à l'origine de l'événement */
  alerte?: string;
  /** décision passée qui l'a provoqué */
  cause?: { titre: string; annee: number; mois: number };
  pastilles: Pastille[];
}

export interface VueEtape {
  type: "decision" | "evenement";
  annee: number;
  mois: number;
  carte?: VueCarte;
  evenement?: VueEvenement;
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
  outil: Outil;
  crise: boolean;
  decompte: { id: string; label: string; voix: number; retenue: boolean }[];
  nbVotes: number;
  /** égalité tranchée au sort (après le second tour) */
  egalite: boolean;
  exAequo: string[];
  aucunVote: boolean;
  /** second tour entre options ex aequo */
  secondTour?: { decompte: { label: string; voix: number; retenue: boolean }[]; nbVotes: number };
  /** référendum rejeté par les électeurs */
  rejete: boolean;
  /** promesse de campagne concernée */
  promesse?: { texte: string; tenue: boolean };
  pastilles: Pastille[];
  changements: VueChangement[];
  programme: { annee: number; texte: string; pastille?: Pastille }[];
  notePedagogique: string;
}

export interface VueCampagne {
  index: number;
  total: number;
  etat: "vote" | "resultat";
  promesse: { id: string; texte: string };
  dernier?: { promettre: number; refuser: number; faite: boolean; hasard: boolean };
  faites: { id: string; texte: string }[];
  /** popularité de départ si le mandat commençait maintenant */
  popularite: number;
  /** intentions de vote au second tour (sondage) */
  intentions: number;
  /** numéro de la campagne (0 = la première) */
  tentative: number;
  /** soir du second tour */
  election?: { score: number; elu: boolean };
}

export interface VueBilanAnnee {
  annee: number;
  jauges: { id: JaugeId; nom: string; debut: number; fin: number }[];
  faits: { mois: number; type: "decision" | "evenement" | "crise"; titre: string }[];
  arrivees: string[];
}

export interface VueBilan {
  anneeDebut: number;
  anneeFin: number;
  jauges: { id: JaugeId; nom: string; depart: number; fin: number; sans: number; heritage: number }[];
  anneeHeritage: number;
  indicateurs: { nom: string; depart: number; fin: number; sans: number; unite: string; decimales: number }[];
  decisions: { annee: number; mois: number; titre: string; pastille: Pastille }[];
  moments: { annee: number; mois: number; evenement: string; reponse?: string; cause?: string }[];
  enseignements: string[];
  promesses: { texte: string; realite: string; source: string; demago: number; faite: boolean; tenue?: boolean }[];
  demagometre: number;
  alertesSans: number;
  alertesPartie: number;
}

export interface VuePublique {
  code: string;
  version: number;
  phase: Phase;
  /** scrutin en cours (promesse, étape ou second tour) : identifie le vote de chaque téléphone */
  scrutin?: string;
  serveurMaintenant: number;
  nbAnnees: number;
  dureesPossibles: number[];
  dureeVote: number;
  anneeDepart: number;
  anneeFin: number;
  annee: number;
  /** mois de l'arrêt en cours (1 à 12) et du précédent (pour animer la frise) */
  mois: number;
  moisPrecedent: number;
  /** numéro de la décision en cours (hors crises) et total du mandat */
  numeroDecision: number;
  nbDecisions: number;
  seuil: number;
  joueurs: { pseudo: string; couleur: string }[];
  nbVotes: number;
  /** jauges du pays */
  jauges: VueJauge[];
  popularite: VueJauge;
  indicateurs: VueIndicateur[];
  campagne?: VueCampagne;
  etape?: VueEtape;
  arrivees: string[];
  resonances: { titre: string; explication: string }[];
  /** flash info tombé pendant le vote */
  flash?: string;
  /** fin du vote telle qu'affichée (avant le flash, sans le bonus de temps) */
  echeance?: number;
  /** au second tour : les options encore en lice */
  secondTour?: { options: VueOption[] };
  resultat?: VueResultat;
  bilanAnnee?: VueBilanAnnee;
  bilan?: VueBilan;
}
