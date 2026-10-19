/**
 * Salles de jeu : état stocké dans Redis (source de vérité), transitions décidées côté serveur.
 * Chaque écriture de l'état passe par une écriture conditionnelle sur le numéro de version.
 *
 * Déroulé : accueil → campagne (une promesse après l'autre) → investiture → mandat
 * (annonce → vote → [second tour] → résultat, mois après mois) → bilan de l'année → … → fin.
 */
import { randomBytes, randomInt } from "node:crypto";
import { chargerContenu } from "@/content";
import {
  appliquerChoix,
  bilanFinal,
  carteDeLEtape,
  creerPartie,
  entierAleatoire,
  etapeAVoter,
  flux,
  prochaineEtape,
  resoudreSecondTour,
  resoudreVote,
  terminerAnnee,
  valeursCurseur,
  type BilanFinal,
  type EtatPartie,
  type Poids,
  type ResultatTour,
  type ResultatVote,
} from "@/engine";
import { poidsActuels } from "./poids";
import { stockage } from "./stockage";

export const DUREE_SALLE_S = 12 * 3600;
const ALPHABET_CODE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const COULEURS = ["#F2B705", "#6C4FD6", "#1E88A8", "#E0662F", "#2E9E5B", "#D6457A"];
/** durée du vote sur une promesse de campagne */
const DUREE_VOTE_PROMESSE_S = 20;

export type Phase = "accueil" | "campagne" | "investiture" | "annonce" | "vote" | "secondTour" | "resultat" | "bilanAnnee" | "fin";

export interface Campagne {
  /** promesses présentées, dans l'ordre */
  promesses: string[];
  /** promesse en cours */
  index: number;
  /** vote ouvert ou résultat affiché pour la promesse en cours */
  etat: "vote" | "resultat";
  faites: string[];
  /** décompte de la dernière promesse */
  dernier?: { promettre: number; refuser: number; faite: boolean; hasard: boolean };
}

export interface Salle {
  code: string;
  version: number;
  creeLe: number;
  hote: string;
  phase: Phase;
  /** durée du mandat en années */
  nbAnnees: number;
  dureeVote: number;
  graine: number;
  /** poids figés à la création de la salle */
  poids: Poids;
  campagne?: Campagne;
  partie?: EtatPartie;
  /** fin du vote (ms depuis l'epoch), décidée par le serveur */
  echeance?: number;
  /** moment où tombe le flash info (ms), pendant le vote */
  flashA?: number;
  /** premier tour d'un vote à égalité, en attente du second tour */
  premierTour?: ResultatVote;
  resultat?: ResultatTour;
  /** mois du dernier arrêt (pour animer la frise jusqu'au suivant) */
  moisPrecedent?: number;
  bilan?: BilanFinal;
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
const cleVotes = (code: string, scrutin: string) => `salle:${code}:votes:${scrutin}`;

/** Identifiant du scrutin en cours (promesse, étape, second tour). */
export function scrutin(s: Salle): string | undefined {
  if (s.phase === "campagne" && s.campagne) return `c${s.campagne.index}`;
  const n = s.partie?.etape?.n;
  if (n === undefined) return undefined;
  if (s.phase === "secondTour") return `e${n}b`;
  return `e${n}`;
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
      nbAnnees: contenu.regles.dureesPossibles[0],
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
async function transaction(code: string, modifier: (s: Salle) => boolean | void, dejaLue?: Salle): Promise<Salle> {
  for (let essai = 0; essai < 5; essai++) {
    // Premier essai : on réutilise la salle déjà lue par l'appelant (un aller-retour Redis de moins).
    const s = essai === 0 && dejaLue ? (structuredClone(dejaLue) as Salle) : await lireSalle(code);
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

export async function moi(code: string, jeton: string): Promise<{ joueur: Joueur; vote: string | number | null; scrutin?: string } | null> {
  const salle = await lireSalle(code);
  if (!salle) throw new ErreurSalle("Salle introuvable ou expirée.", 404);
  const brut = await stockage().hget(cleJoueurs(salle.code), jeton);
  if (!brut) return null;
  const sc = scrutin(salle);
  const v = sc ? await stockage().hget(cleVotes(salle.code, sc), jeton) : null;
  return { joueur: JSON.parse(brut) as Joueur, vote: v === null ? null : (JSON.parse(v) as string | number), scrutin: sc };
}

const voteOuvert = (s: Salle) => s.phase === "vote" || s.phase === "secondTour" || (s.phase === "campagne" && s.campagne?.etat === "vote");

export async function nbVotes(salle: Salle): Promise<number> {
  const sc = scrutin(salle);
  if (!sc || !voteOuvert(salle)) return 0;
  return stockage().hlen(cleVotes(salle.code, sc));
}

export async function voter(code: string, jeton: string, choix: unknown): Promise<string | number> {
  let salle = await lireSalle(code);
  if (!salle) throw new ErreurSalle("Salle introuvable ou expirée.", 404);
  salle = await appliquerEcheances(salle);
  if (!voteOuvert(salle)) throw new ErreurSalle("Le vote est clos.", 409);
  if (!(await stockage().hget(cleJoueurs(salle.code), jeton))) throw new ErreurSalle("Participant inconnu : rejoins la salle.", 403);
  let valeur: string | number;
  if (salle.phase === "campagne") {
    if (choix !== "promettre" && choix !== "refuser") throw new ErreurSalle("Choix inconnu.");
    valeur = choix;
  } else if (salle.phase === "secondTour") {
    if (typeof choix !== "string" || !salle.premierTour?.exAequo.includes(choix)) throw new ErreurSalle("Option hors du second tour.");
    valeur = choix;
  } else {
    const carte = carteDeLEtape(chargerContenu(), salle.partie!.etape!);
    if (!carte) throw new ErreurSalle("Rien à voter.", 409);
    if (carte.type === "curseur") {
      const n = typeof choix === "number" ? choix : Number(choix);
      if (!valeursCurseur(carte).some((v) => Math.abs(v - n) < 1e-9)) throw new ErreurSalle("Valeur hors de l'échelle.");
      valeur = n;
    } else {
      if (typeof choix !== "string" || !carte.options.some((o) => o.id === choix)) throw new ErreurSalle("Option inconnue.");
      valeur = choix;
    }
  }
  const cleV = cleVotes(salle.code, scrutin(salle)!);
  await stockage().hset(cleV, jeton, JSON.stringify(valeur));
  await stockage().expire(cleV, DUREE_SALLE_S);
  return valeur;
}

/* ------------------------------------------------------------------ */
/* Transitions de phase (toujours côté serveur)                        */

/** Votes du scrutin en cours (lus hors transaction : ils vivent dans un hash séparé). */
async function votesDuScrutin(salle: Salle): Promise<(string | number)[]> {
  const sc = scrutin(salle);
  if (!sc) return [];
  const brut = await stockage().hgetall(cleVotes(salle.code, sc));
  return Object.values(brut).map((v) => JSON.parse(v) as string | number);
}

/** Clôt le scrutin en cours avec les votes reçus. */
function clore(s: Salle, votes: (string | number)[]) {
  const contenu = chargerContenu();
  s.echeance = undefined;
  s.flashA = undefined;

  if (s.phase === "campagne" && s.campagne) {
    const c = s.campagne;
    const promettre = votes.filter((v) => v === "promettre").length;
    const refuser = votes.filter((v) => v === "refuser").length;
    const hasard = promettre === refuser;
    const faite = hasard ? flux(s.graine, "promesse", c.index)() < 0.5 : promettre > refuser;
    if (faite) c.faites.push(c.promesses[c.index]);
    c.dernier = { promettre, refuser, faite, hasard };
    c.etat = "resultat";
    return;
  }

  const p = s.partie!;
  const carte = carteDeLEtape(contenu, p.etape!)!;
  if (s.phase === "secondTour") {
    const vote = resoudreSecondTour(s.premierTour!, votes.map(String), flux(s.graine, "secondTour", p.etape!.n));
    s.premierTour = undefined;
    s.resultat = appliquerChoix(contenu, p, { options: vote.options, valeur: vote.valeur }, vote);
    s.phase = "resultat";
    return;
  }
  const vote = resoudreVote(carte, votes, flux(s.graine, "vote", p.etape!.n));
  // Égalité : un second tour rapide entre les options ex aequo, plutôt que le hasard.
  if (vote.egalite && vote.exAequo.length > 1) {
    s.premierTour = vote;
    s.phase = "secondTour";
    s.echeance = Date.now() + contenu.regles.dureeSecondTourSecondes * 1000;
    return;
  }
  s.resultat = appliquerChoix(contenu, p, { options: vote.options, valeur: vote.valeur }, vote);
  s.phase = "resultat";
}

/** Applique les transitions dues à une échéance dépassée (fin du minuteur). */
export async function appliquerEcheances(salle: Salle): Promise<Salle> {
  const due = (s: Salle) => voteOuvert(s) && !!s.echeance && Date.now() >= s.echeance;
  if (!due(salle)) return salle;
  const votes = await votesDuScrutin(salle);
  const sc = scrutin(salle);
  return transaction(
    salle.code,
    (s) => {
      if (!due(s) || scrutin(s) !== sc) return false;
      clore(s, votes);
    },
    salle,
  );
}

/** Avance jusqu'au prochain arrêt du calendrier, ou au bilan de l'année. */
function avancer(s: Salle) {
  const contenu = chargerContenu();
  const p = s.partie!;
  s.moisPrecedent = p.etape?.mois ?? 0;
  s.resultat = undefined;
  const etape = prochaineEtape(contenu, p);
  s.phase = etape ? "annonce" : "bilanAnnee";
}

function ouvrirVotePromesse(s: Salle) {
  s.campagne!.etat = "vote";
  s.echeance = Date.now() + DUREE_VOTE_PROMESSE_S * 1000;
}

export type ActionHote =
  | { action: "configurer"; nbAnnees?: number; dureeVote?: number }
  | { action: "demarrer"; nbAnnees?: number }
  | { action: "ouvrirVote" }
  | { action: "clore" }
  | { action: "suivant" };

export async function actionHote(code: string, hote: string, a: ActionHote): Promise<Salle> {
  const contenu = chargerContenu();
  const actuelle = await lireSalle(code);
  if (!actuelle) throw new ErreurSalle("Salle introuvable ou expirée.", 404);
  if (actuelle.hote !== hote) throw new ErreurSalle("Seul l'écran hôte peut piloter la partie.", 403);

  // Les votes sont lus avant la transaction (ils vivent dans un hash séparé).
  const votes = a.action === "clore" && voteOuvert(actuelle) ? await votesDuScrutin(actuelle) : [];
  const sc = scrutin(actuelle);

  return transaction(
    code,
    (s) => {
      switch (a.action) {
        case "configurer": {
          if (a.nbAnnees !== undefined) {
            if (s.phase !== "accueil") throw new ErreurSalle("La partie a déjà commencé.");
            if (!contenu.regles.dureesPossibles.includes(a.nbAnnees)) throw new ErreurSalle("Durée de partie non prévue.");
            s.nbAnnees = a.nbAnnees;
          }
          if (a.dureeVote !== undefined) {
            if (!Number.isInteger(a.dureeVote) || a.dureeVote < 15 || a.dureeVote > 300) throw new ErreurSalle("Minuteur entre 15 et 300 secondes.");
            s.dureeVote = a.dureeVote;
          }
          return;
        }
        case "demarrer": {
          if (s.phase !== "accueil") return false;
          if (a.nbAnnees !== undefined) {
            if (!contenu.regles.dureesPossibles.includes(a.nbAnnees)) throw new ErreurSalle("Durée de partie non prévue.");
            s.nbAnnees = a.nbAnnees;
          }
          // Campagne : promesses tirées au sort dans le catalogue.
          const rng = flux(s.graine, "campagne", 0);
          const pool = contenu.promesses.map((p) => p.id);
          const promesses: string[] = [];
          while (promesses.length < Math.min(contenu.regles.campagne.nbPromesses, contenu.promesses.length))
            promesses.push(pool.splice(entierAleatoire(rng, pool.length), 1)[0]);
          s.campagne = { promesses, index: 0, etat: "vote", faites: [] };
          s.phase = "campagne";
          ouvrirVotePromesse(s);
          return;
        }
        case "ouvrirVote": {
          if (s.phase !== "annonce" || !etapeAVoter(s.partie?.etape)) return false;
          const etape = s.partie!.etape!;
          const carte = etape.type === "decision" ? contenu.cartes.find((c) => c.id === etape.carte) : undefined;
          s.phase = "vote";
          const maintenant = Date.now();
          // Le flash info tombe à mi-vote et rallonge le minuteur.
          if (carte?.flash) {
            s.flashA = maintenant + (s.dureeVote * 1000) / 2;
            s.echeance = maintenant + (s.dureeVote + contenu.regles.bonusFlashSecondes) * 1000;
          } else s.echeance = maintenant + s.dureeVote * 1000;
          return;
        }
        case "clore": {
          if (!voteOuvert(s) || scrutin(s) !== sc) return false;
          clore(s, votes);
          return;
        }
        case "suivant": {
          if (s.phase === "campagne" && s.campagne?.etat === "resultat") {
            if (s.campagne.index + 1 < s.campagne.promesses.length) {
              s.campagne.index++;
              s.campagne.dernier = undefined;
              ouvrirVotePromesse(s);
            } else s.phase = "investiture";
            return;
          }
          if (s.phase === "investiture") {
            s.partie = creerPartie(contenu, {
              graine: s.graine,
              nbAnnees: s.nbAnnees,
              poids: s.poids,
              promesses: s.campagne?.faites ?? [],
              promessesProposees: s.campagne?.promesses ?? [],
            });
            avancer(s);
            return;
          }
          if (s.phase === "resultat" || (s.phase === "annonce" && !etapeAVoter(s.partie?.etape))) {
            avancer(s);
            return;
          }
          if (s.phase === "bilanAnnee") {
            terminerAnnee(contenu, s.partie!);
            if (s.partie!.termine) {
              s.phase = "fin";
              s.bilan = bilanFinal(contenu, s.partie!);
            } else {
              s.partie!.etape = undefined;
              avancer(s);
              s.moisPrecedent = 0;
            }
            return;
          }
          return false;
        }
      }
    },
    actuelle,
  );
}
