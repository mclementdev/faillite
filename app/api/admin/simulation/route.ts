import { routeAdmin } from "@/lib/garde-admin";
import { json } from "@/lib/http";
import { derniereSimulation, lancerSimulation } from "@/lib/simulation-admin";

export const dynamic = "force-dynamic";
/** 1 000 parties prennent une dizaine de secondes ; marge pour des machines plus lentes. */
export const maxDuration = 60;

export const GET = routeAdmin(async () => json({ simulation: await derniereSimulation() }));

export const POST = routeAdmin(async (req, email) => {
  const b = (await req.json().catch(() => ({}))) as { n?: number; graine?: number; mode?: string; nbTours?: number };
  const n = Math.round(Number(b.n ?? 1000));
  const graine = Math.round(Number(b.graine ?? 42));
  const nbTours = Number(b.nbTours ?? 30) === 20 ? 20 : 30;
  const mode = b.mode === "sans_intervention" ? "sans_intervention" : "aleatoire";
  if (!Number.isFinite(n) || n < 1 || n > 3000) return json({ erreur: "Nombre de parties entre 1 et 3 000." }, { status: 400 });
  if (!Number.isFinite(graine)) return json({ erreur: "Graine invalide." }, { status: 400 });
  return json({ simulation: await lancerSimulation(n, graine, mode, nbTours, email) });
});
