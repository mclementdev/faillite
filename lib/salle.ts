/**
 * Salles de jeu : état stocké dans Redis (source de vérité), transitions décidées côté serveur.
 * Chaque écriture de l'état passe par une écriture conditionnelle sur le numéro de version.
 */
import { randomBytes, randomInt } from "node:crypto";
import { chargerContenu } from "@/content";
import {
  appliquerVote,
  bilanFinal,
  commencerTour,
  creerPartie,
  flux,
  resoudreElection,
  terminerTour,
  valeursCurseur,
  type BilanFinal,
  type EtatPartie,
  type Poids,
  type ResultatElection,
  type ResultatTour,
} from "@/engine";
import { poidsActuels } from "./poids";
import { stockage } from "./stockage";

export const DUREE_SALLE_S = 12 * 3600;
const ALPHABET_CODE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const COULEURS = ["#FFD23F", "#B69CFF", "#7DD3E8", "#F6F1E7", "#A6E36B", "#FF9A3C"];

/**
 * accueil → election (vote pour la présidence) → presidence (résultat) → annonce → vote → resultat
 * → annonce… → fin
 */
export type Phase = "accueil" | "election" | "presidence" | "annonce" | "vote" | "resultat" | "fin";

export interface Salle {
  code: string;
  version: number;
  creeLe: number;
  hote: string;
  phase: Phase;
  nbTours: number;
  dureeVote: number;
  graine: number;
  /** poids figés à la création de la salle */
  poids: Poids;
  partie?: EtatPartie;
  /** fin du vote (ms depuis l'epoch), décidée par le serveur */
  echeance?: number;
  resultat?: ResultatTour;
  bilan?: BilanFinal;
  /** présidence du sénat : sa voix compte double en cas d'égalité (jeton jamais exposé) */
  president?: { jeton: string; pseudo: string };
  election?: ResultatElection;
}

export interface Joueur {
  pseudo: string;
  couleur: string;
  depuis: number;
}

export class ErreurSalle extends Error {
  constructor(message: string, public statut = 400) {
    super(message);
  }
}

const cle = (code: string) => `salle:${code}`;
const cleJoueurs = (code: string) => `salle:${code}:joueurs`;
const cleVotes = (code: string, tour: number | "election") => `salle:${code}:votes:${tour}`;

/** Scrutin en cours : l'élection de la présidence, ou le tour de jeu. */
function scrutin(salle: Salle): number | "election" {
  if (salle.phase === "election" || salle.phase === "presidence") return "election";
  return salle.partie?.courant?.tour ?? salle.partie?.tour ?? 0;
}

export function normaliserCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
}

export async function lireSalle(code: string): Promise<Salle | null> {
  const brut = await stockage().get(cle(normaliserCode(code)));
  return brut ? (JSON.parse(brut) as Salle) : null;
}

export async function creerSalle(): Promise<Salle> {
  const contenu = chargerContenu();
  const poids = await poidsActuels();
  for (let essai = 0; essai < 20; essai++) {
    const code = Array.from({ length: 4 }, () => ALPHABET_CODE[randomInt(ALPHABET_CODE.length)]).join("");
    const salle: Salle = {
      code,
      version: 1,
      creeLe: Date.now(),
      hote: randomBytes(18).toString("base64url"),
      phase: "accueil",
      nbTours: contenu.regles.toursPossibles[0],
      dureeVote: contenu.regles.dureeVoteSecondes,
      graine: randomInt(2 ** 31),
      poids,
    };
    if (await stockage().setSiVersion(cle(code), JSON.stringify(salle), 0, DUREE_SALLE_S)) return salle;
  }
  throw new ErreurSalle("Impossible de créer une salle, réessayez.", 503);
}

/**
 * Lit, modifie et réécrit la salle avec contrôle de version (quelques essais en cas de conflit).
 * `modifier` renvoie false pour ne rien écrire.
 */
async function transaction(code: string, modifier: (s: Salle) => boolean | void): Promise<Salle> {
  for (let essai = 0; essai < 5; essai++) {
    const s = await lireSalle(code);
    if (!s) throw new ErreurSalle("Salle introuvable ou expirée.", 404);
    const version = s.version;
    if (modifier(s) === false) return s;
    s.version = version + 1;
    if (await stockage().setSiVersion(cle(s.code), JSON.stringify(s), version, DUREE_SALLE_S)) return s;
  }
  throw new ErreurSalle("Trop de modifications simultanées, réessayez.", 409);
}

/* ------------------------------------------------------------------ */
/* Participants et votes                                               */

export async function joueurs(code: string): Promise<Record<string, Joueur>> {
  const brut = await stockage().hgetall(cleJoueurs(code));
  return Object.fromEntries(Object.entries(brut).map(([k, v]) => [k, JSON.parse(v) as Joueur]));
}

export async function rejoindre(code: string, pseudoBrut: string, jeton?: string): Promise<{ jeton: string; joueur: Joueur }> {
  const salle = await lireSalle(code);
  if (!salle) throw new ErreurSalle("Salle introuvable ou expirée.", 404);
  const tous = await joueurs(salle.code);
  if (jeton && tous[jeton]) return { jeton, joueur: tous[jeton] }; // reconnexion
  let pseudo = pseudoBrut.replace(/\s+/g, " ").trim().slice(0, 16);
  if (pseudo.length < 1) throw new ErreurSalle("Choisis un pseudo.");
  const max = chargerContenu().regles.maxJoueurs;
  if (Object.keys(tous).length >= max) throw new ErreurSalle(`La salle est complète (${max} participants).`, 409);
  const pris = new Set(Object.values(tous).map((j) => j.pseudo.toLowerCase()));
  if (pris.has(pseudo.toLowerCase())) {
    let n = 2;
    while (pris.has(`${pseudo} ${n}`.toLowerCase())) n++;
    pseudo = `${pseudo.slice(0, 13)} ${n}`;
  }
  const nouveau = randomBytes(18).toString("base64url");
  const joueur: Joueur = { pseudo, couleur: COULEURS[Object.keys(tous).length % COULEURS.length], depuis: Date.now() };
  await stockage().hset(cleJoueurs(salle.code), nouveau, JSON.stringify(joueur));
  await stockage().expire(cleJoueurs(salle.code), DUREE_SALLE_S);
  return { jeton: nouveau, joueur };
}

export async function moi(code: string, jeton: string): Promise<{ joueur: Joueur; vote: string | number | null } | null> {
  const salle = await lireSalle(code);
  if (!salle) throw new ErreurSalle("Salle introuvable ou expirée.", 404);
  const brut = await stockage().hget(cleJoueurs(salle.code), jeton);
  if (!brut) return null;
  const v = await stockage().hget(cleVotes(salle.code, scrutin(salle)), jeton);
  return { joueur: JSON.parse(brut) as Joueur, vote: v === null ? null : (JSON.parse(v) as string | number) };
}

export async function nbVotes(salle: Salle): Promise<number> {
  if (salle.phase === "election") return stockage().hlen(cleVotes(salle.code, "election"));
  if (!salle.partie?.courant) return 0;
  return stockage().hlen(cleVotes(salle.code, salle.partie.courant.tour));
}

export async function voter(code: string, jeton: string, choix: unknown): Promise<string | number> {
  let salle = await lireSalle(code);
  if (!salle) throw new ErreurSalle("Salle introuvable ou expirée.", 404);
  salle = await appliquerEcheances(salle);
  if (salle.phase === "election") {
    const tous = await joueurs(salle.code);
    if (!tous[jeton]) throw new ErreurSalle("Participant inconnu : rejoins la salle.", 403);
    if (typeof choix !== "string" || !Object.values(tous).some((j) => j.pseudo === choix)) throw new ErreurSalle("Participant inconnu.");
    const cleE = cleVotes(salle.code, "election");
    await stockage().hset(cleE, jeton, JSON.stringify(choix));
    await stockage().expire(cleE, DUREE_SALLE_S);
    return choix;
  }
  if (salle.phase !== "vote" || !salle.partie?.courant?.carte) throw new ErreurSalle("Le vote est clos.", 409);
  if (!(await stockage().hget(cleJoueurs(salle.code), jeton))) throw new ErreurSalle("Participant inconnu : rejoins la salle.", 403);
  const carte = chargerContenu().cartes.find((c) => c.id === salle!.partie!.courant!.carte)!;
  let valeur: string | number;
  if (carte.type === "curseur") {
    const n = typeof choix === "number" ? choix : Number(choix);
    if (!valeursCurseur(carte).some((v) => Math.abs(v - n) < 1e-9)) throw new ErreurSalle("Valeur hors de l'échelle.");
    valeur = n;
  } else {
    if (typeof choix !== "string" || !carte.options.some((o) => o.id === choix)) throw new ErreurSalle("Option inconnue.");
    valeur = choix;
  }
  const cleV = cleVotes(salle.code, salle.partie.courant.tour);
  await stockage().hset(cleV, jeton, JSON.stringify(valeur));
  await stockage().expire(cleV, DUREE_SALLE_S);
  return valeur;
}

/* ------------------------------------------------------------------ */
/* Transitions de phase (toujours côté serveur)                        */

/** Votes du scrutin en cours, par jeton (lus hors transaction : ils vivent dans un hash séparé). */
async function votesDuScrutin(salle: Salle): Promise<Record<string, string | number>> {
  const brut = await stockage().hgetall(cleVotes(salle.code, scrutin(salle)));
  return Object.fromEntries(Object.entries(brut).map(([k, v]) => [k, JSON.parse(v) as string | number]));
}

interface Scrutin {
  votes: Record<string, string | number>;
  /** pseudos des participants (candidats à la présidence) */
  candidats: Record<string, string>;
}

async function lireScrutin(salle: Salle): Promise<Scrutin> {
  const [votes, tous] = await Promise.all([votesDuScrutin(salle), salle.phase === "election" ? joueurs(salle.code) : Promise.resolve({} as Record<string, Joueur>)]);
  return { votes, candidats: Object.fromEntries(Object.entries(tous).sort((a, b) => a[1].depuis - b[1].depuis).map(([jeton, j]) => [jeton, j.pseudo])) };
}

function clore(s: Salle, sc: Scrutin) {
  const contenu = chargerContenu();
  s.echeance = undefined;
  if (s.phase === "election") {
    const pseudos = Object.values(sc.candidats);
    s.election = resoudreElection(pseudos, Object.values(sc.votes).map(String), flux(s.graine, "presidence", 0));
    const jeton = Object.keys(sc.candidats).find((k) => sc.candidats[k] === s.election!.elu);
    s.president = jeton && s.election.elu ? { jeton, pseudo: s.election.elu } : undefined;
    s.phase = "presidence";
    return;
  }
  const voixPresident = s.president ? sc.votes[s.president.jeton] : undefined;
  s.resultat = appliquerVote(contenu, s.partie!, Object.values(sc.votes), voixPresident);
  s.phase = "resultat";
}

/** Applique les transitions dues à une échéance dépassée (fin du minuteur de vote ou d'élection). */
export async function appliquerEcheances(salle: Salle): Promise<Salle> {
  const ouvert = (s: Salle) => (s.phase === "vote" || s.phase === "election") && !!s.echeance && Date.now() >= s.echeance;
  if (!ouvert(salle)) return salle;
  const sc = await lireScrutin(salle);
  return transaction(salle.code, (s) => {
    if (!ouvert(s) || s.phase !== salle.phase) return false;
    clore(s, sc);
  });
}

function demarrerTourSuivant(s: Salle) {
  const contenu = chargerContenu();
  commencerTour(contenu, s.partie!);
  s.phase = "annonce";
  s.resultat = undefined;
}

export type ActionHote =
  | { action: "configurer"; nbTours?: number; dureeVote?: number }
  | { action: "demarrer"; nbTours?: number }
  | { action: "ouvrirVote" }
  | { action: "clore" }
  | { action: "suivant" };

export async function actionHote(code: string, hote: string, a: ActionHote): Promise<Salle> {
  const contenu = chargerContenu();
  const actuelle = await lireSalle(code);
  if (!actuelle) throw new ErreurSalle("Salle introuvable ou expirée.", 404);
  if (actuelle.hote !== hote) throw new ErreurSalle("Seul l'écran hôte peut piloter la partie.", 403);

  // Les votes sont lus avant la transaction (ils vivent dans un hash séparé).
  const sc: Scrutin = a.action === "clore" && (actuelle.phase === "vote" || actuelle.phase === "election") ? await lireScrutin(actuelle) : { votes: {}, candidats: {} };

  return transaction(code, (s) => {
    switch (a.action) {
      case "configurer": {
        if (a.nbTours !== undefined) {
          if (s.phase !== "accueil") throw new ErreurSalle("La partie a déjà commencé.");
          if (!contenu.regles.toursPossibles.includes(a.nbTours)) throw new ErreurSalle("Durée de partie non prévue.");
          s.nbTours = a.nbTours;
        }
        if (a.dureeVote !== undefined) {
          if (!Number.isInteger(a.dureeVote) || a.dureeVote < 15 || a.dureeVote > 300) throw new ErreurSalle("Minuteur entre 15 et 300 secondes.");
          s.dureeVote = a.dureeVote;
        }
        return;
      }
      case "demarrer": {
        if (s.phase !== "accueil") return false;
        if (a.nbTours !== undefined) {
          if (!contenu.regles.toursPossibles.includes(a.nbTours)) throw new ErreurSalle("Durée de partie non prévue.");
          s.nbTours = a.nbTours;
        }
        s.partie = creerPartie(contenu, { graine: s.graine, nbTours: s.nbTours, poids: s.poids });
        // Première étape : élire la présidence du sénat.
        s.phase = "election";
        s.echeance = Date.now() + s.dureeVote * 1000;
        return;
      }
      case "ouvrirVote": {
        if (s.phase !== "annonce") return false;
        if (!s.partie?.courant?.carte) throw new ErreurSalle("Pas de carte à voter cette année.");
        s.phase = "vote";
        s.echeance = Date.now() + s.dureeVote * 1000;
        return;
      }
      case "clore": {
        if (s.phase !== "vote" && s.phase !== "election") return false;
        if (s.phase !== actuelle.phase) return false;
        clore(s, sc);
        return;
      }
      case "suivant": {
        if (s.phase === "presidence") {
          demarrerTourSuivant(s);
          return;
        }
        if (s.phase !== "resultat" && !(s.phase === "annonce" && !s.partie?.courant?.carte)) return false;
        terminerTour(contenu, s.partie!);
        if (s.partie!.termine) {
          s.phase = "fin";
          s.resultat = undefined;
          s.bilan = bilanFinal(contenu, s.partie!);
        } else demarrerTourSuivant(s);
        return;
      }
    }
  });
}
