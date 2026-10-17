import { beforeEach, describe, expect, it, vi } from "vitest";
import { creerJetonSession, DUREE_SESSION_S, verifierJetonSession } from "@/lib/admin";
import { definirStockage, StockageMemoire } from "@/lib/stockage";
import * as connexion from "@/app/api/admin/connexion/route";
import * as poids from "@/app/api/admin/poids/route";
import * as reinit from "@/app/api/admin/poids/reinitialiser/route";
import * as simulation from "@/app/api/admin/simulation/route";
import * as journal from "@/app/api/admin/journal/route";

const URL_BASE = "http://localhost/api/admin";

/** Toutes les routes admin protégées, avec la méthode et un corps valide. */
const ROUTES: { nom: string; appel: (req: Request) => Promise<Response>; methode: string; corps?: unknown }[] = [
  { nom: "GET /poids", appel: poids.GET, methode: "GET" },
  { nom: "PUT /poids", appel: poids.PUT, methode: "PUT", corps: { modifs: [{ type: "carte", id: "retraites-age", poids: 2 }] } },
  { nom: "POST /poids/reinitialiser", appel: reinit.POST, methode: "POST", corps: {} },
  { nom: "GET /simulation", appel: simulation.GET, methode: "GET" },
  { nom: "POST /simulation", appel: simulation.POST, methode: "POST", corps: { n: 2, graine: 1 } },
  { nom: "GET /journal", appel: journal.GET, methode: "GET" },
];

function requete(r: (typeof ROUTES)[number], cookie?: string, ip = "1.2.3.4"): Request {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": ip };
  if (cookie) headers.cookie = cookie;
  return new Request(`${URL_BASE}${r.nom.split(" ")[1]}`, { method: r.methode, headers, body: r.corps ? JSON.stringify(r.corps) : undefined });
}

beforeEach(() => {
  definirStockage(new StockageMemoire());
  vi.stubEnv("ADMIN_EMAILS", "admin@exemple.fr, Autre@Exemple.fr");
  vi.stubEnv("ADMIN_SESSION_SECRET", "un-secret-de-test-suffisamment-long");
  vi.stubEnv("ADMIN_ACCESS_CODE", "");
});

describe("accès au backoffice", () => {
  it.each(ROUTES)("$nom refuse une requête sans session", async (r) => {
    const res = await r.appel(requete(r));
    expect(res.status).toBe(401);
  });

  it.each(ROUTES)("$nom refuse une session expirée", async (r) => {
    const expire = creerJetonSession("admin@exemple.fr", Date.now() - (DUREE_SESSION_S + 60) * 1000);
    const res = await r.appel(requete(r, `faillite_admin=${expire}`));
    expect(res.status).toBe(401);
  });

  it.each(ROUTES)("$nom refuse une session falsifiée", async (r) => {
    const valide = creerJetonSession("admin@exemple.fr");
    const [donnees] = valide.split(".");
    const faux = `${Buffer.from(JSON.stringify({ email: "admin@exemple.fr", exp: Date.now() + 1e9 })).toString("base64url")}.${valide.split(".")[1]}`;
    expect(faux.split(".")[0]).not.toBe(donnees);
    const res = await r.appel(requete(r, `faillite_admin=${faux}`));
    expect(res.status).toBe(401);
  });

  it.each(ROUTES)("$nom refuse une session dont l'adresse n'est plus autorisée", async (r) => {
    const jeton = creerJetonSession("ancien@exemple.fr");
    const res = await r.appel(requete(r, `faillite_admin=${jeton}`));
    expect(res.status).toBe(401);
  });

  it.each(ROUTES)("$nom accepte une session valide", async (r) => {
    const jeton = creerJetonSession("admin@exemple.fr");
    const res = await r.appel(requete(r, `faillite_admin=${jeton}`));
    expect(res.status).toBe(200);
  });

  it("une adresse non autorisée est refusée à la connexion", async () => {
    const res = await connexion.POST(new Request(`${URL_BASE}/connexion`, { method: "POST", body: JSON.stringify({ email: "intrus@exemple.fr" }) }));
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("une adresse autorisée ouvre une session (casse ignorée, cookie httpOnly 12 h)", async () => {
    const res = await connexion.POST(new Request(`${URL_BASE}/connexion`, { method: "POST", body: JSON.stringify({ email: "  AUTRE@exemple.FR " }) }));
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain(`Max-Age=${12 * 3600}`);
    const jeton = cookie.split(";")[0].split("=")[1];
    expect(verifierJetonSession(jeton)).toBe("autre@exemple.fr");
  });

  it("le code d'accès est exigé quand ADMIN_ACCESS_CODE est défini", async () => {
    vi.stubEnv("ADMIN_ACCESS_CODE", "1234");
    const sans = await connexion.POST(new Request(`${URL_BASE}/connexion`, { method: "POST", body: JSON.stringify({ email: "admin@exemple.fr" }) }));
    expect(sans.status).toBe(403);
    const avec = await connexion.POST(new Request(`${URL_BASE}/connexion`, { method: "POST", body: JSON.stringify({ email: "admin@exemple.fr", code: "1234" }) }));
    expect(avec.status).toBe(200);
  });

  it("le nombre de tentatives par IP est limité", async () => {
    const tenter = () =>
      connexion.POST(new Request(`${URL_BASE}/connexion`, { method: "POST", headers: { "x-forwarded-for": "9.9.9.9" }, body: JSON.stringify({ email: "intrus@exemple.fr" }) }));
    for (let i = 0; i < 10; i++) expect((await tenter()).status).toBe(403);
    expect((await tenter()).status).toBe(429);
    // Même une bonne adresse est bloquée pendant la fenêtre.
    const bonne = await connexion.POST(new Request(`${URL_BASE}/connexion`, { method: "POST", headers: { "x-forwarded-for": "9.9.9.9" }, body: JSON.stringify({ email: "admin@exemple.fr" }) }));
    expect(bonne.status).toBe(429);
  });

  it("sans secret de session en production, aucune session n'est ouverte", async () => {
    vi.stubEnv("ADMIN_SESSION_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    const res = await connexion.POST(new Request(`${URL_BASE}/connexion`, { method: "POST", body: JSON.stringify({ email: "admin@exemple.fr" }) }));
    expect(res.status).toBe(500);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("la modification des poids est journalisée avec l'adresse de la session", async () => {
    const jeton = creerJetonSession("admin@exemple.fr");
    await poids.PUT(requete(ROUTES[1], `faillite_admin=${jeton}`));
    const res = await journal.GET(requete(ROUTES[5], `faillite_admin=${jeton}`));
    const { journal: j } = (await res.json()) as { journal: { email: string; id: string; ancien: number; nouveau: number }[] };
    expect(j[0]).toMatchObject({ email: "admin@exemple.fr", id: "retraites-age", ancien: 1, nouveau: 2 });
  });
});
