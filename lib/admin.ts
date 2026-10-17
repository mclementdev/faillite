/**
 * Accès au backoffice : une adresse e-mail autorisée (ADMIN_EMAILS), éventuellement un code
 * (ADMIN_ACCESS_CODE). La session est un cookie signé HMAC, httpOnly, secure, valable 12 heures.
 * Protection faible par nature : voir le README.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { stockage } from "./stockage";

export const COOKIE_ADMIN = "faillite_admin";
export const DUREE_SESSION_S = 12 * 3600;
const MAX_TENTATIVES = 10;
const FENETRE_TENTATIVES_S = 15 * 60;
/** Valeur par défaut de ADMIN_EMAILS (seul endroit où une adresse est écrite en dur). */
const ADMIN_EMAILS_DEFAUT = "emmanuel@macron.fr";

export function emailsAutorises(): string[] {
  return (process.env.ADMIN_EMAILS ?? ADMIN_EMAILS_DEFAUT)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function codeRequis(): boolean {
  return !!process.env.ADMIN_ACCESS_CODE;
}

function secret(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") throw new Error("ADMIN_SESSION_SECRET manquant ou trop court (16 caractères minimum).");
  return "secret-de-developpement-non-securise";
}

function signer(donnees: string): string {
  return createHmac("sha256", secret()).update(donnees).digest("base64url");
}

function egal(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function creerJetonSession(email: string, maintenant = Date.now()): string {
  const donnees = Buffer.from(JSON.stringify({ email, exp: maintenant + DUREE_SESSION_S * 1000 })).toString("base64url");
  return `${donnees}.${signer(donnees)}`;
}

/** Renvoie l'adresse de la session si le jeton est valide, non expiré et l'adresse toujours autorisée. */
export function verifierJetonSession(jeton: string | undefined | null, maintenant = Date.now()): string | null {
  if (!jeton) return null;
  const [donnees, signature] = jeton.split(".");
  if (!donnees || !signature) return null;
  try {
    if (!egal(signature, signer(donnees))) return null;
    const { email, exp } = JSON.parse(Buffer.from(donnees, "base64url").toString()) as { email: string; exp: number };
    if (typeof exp !== "number" || exp < maintenant) return null;
    if (!emailsAutorises().includes(String(email).toLowerCase())) return null;
    return email;
  } catch {
    return null;
  }
}

export function lireCookie(entete: string | null, nom = COOKIE_ADMIN): string | undefined {
  if (!entete) return undefined;
  for (const morceau of entete.split(";")) {
    const [k, ...v] = morceau.trim().split("=");
    if (k === nom) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** Adresse de la session admin de la requête, ou null. */
export function sessionAdmin(req: Request): string | null {
  return verifierJetonSession(lireCookie(req.headers.get("cookie")));
}

export function cookieSession(jeton: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_ADMIN}=${jeton}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DUREE_SESSION_S}${secure}`;
}

export function cookieEffacement(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_ADMIN}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function ipDe(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "inconnue").trim();
}

export type ResultatConnexion = { ok: true; email: string; jeton: string } | { ok: false; statut: number; message: string };

export async function connexion(emailBrut: unknown, codeBrut: unknown, ip: string): Promise<ResultatConnexion> {
  const n = await stockage().incr(`admin:tentatives:${ip}`, FENETRE_TENTATIVES_S);
  if (n > MAX_TENTATIVES) return { ok: false, statut: 429, message: "Trop de tentatives. Réessayez dans 15 minutes." };
  const email = String(emailBrut ?? "").trim().toLowerCase();
  const attendu = process.env.ADMIN_ACCESS_CODE;
  const codeOk = !attendu || egal(String(codeBrut ?? ""), attendu);
  if (!email || !emailsAutorises().includes(email) || !codeOk) return { ok: false, statut: 403, message: "Accès refusé." };
  try {
    return { ok: true, email, jeton: creerJetonSession(email) };
  } catch (e) {
    return { ok: false, statut: 500, message: (e as Error).message };
  }
}
