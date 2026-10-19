import { chargerContenu } from "@/content";
import { poidsParDefaut } from "@/engine";
import { routeAdmin } from "@/lib/garde-admin";
import { MINISTERES_LIBELLES } from "@/lib/libelles";
import { json } from "@/lib/http";
import { modifierPoids, poidsActuels } from "@/lib/poids";
import { derniereSimulation } from "@/lib/simulation-admin";

export const dynamic = "force-dynamic";

/** Tableau des cartes et événements avec poids actuels, par défaut et tirages de la dernière simulation. */
export const GET = routeAdmin(async () => {
  const c = chargerContenu();
  const defaut = poidsParDefaut(c);
  const [actuels, sim] = await Promise.all([poidsActuels(), derniereSimulation()]);
  return json({
    cartes: c.cartes.map((x) => ({ id: x.id, theme: MINISTERES_LIBELLES[x.ministere], type: x.type, titre: x.titre, poids: actuels.cartes[x.id], defaut: defaut.cartes[x.id], tirages: sim?.cartes[x.id] ?? null, conditions: x.conditions.length > 0 })),
    evenements: c.evenements.map((x) => ({ id: x.id, nature: x.gravite === "crise" ? "crise" : x.declenchePar.length && !x.poids ? "suite de décision" : x.nature, alerte: x.alerte ? c.jauges[x.alerte].nom : null, titre: x.titre, poids: actuels.evenements[x.id], defaut: defaut.evenements[x.id], tirages: sim?.evenements[x.id] ?? null })),
    simulationDu: sim?.date ?? null,
  });
});

export const PUT = routeAdmin(async (req, email) => {
  const b = (await req.json()) as { modifs?: { type: "carte" | "evenement"; id: string; poids: number }[] };
  if (!Array.isArray(b.modifs)) return json({ erreur: "Requête invalide." }, { status: 400 });
  await modifierPoids(email, b.modifs.map((m) => ({ type: m.type === "evenement" ? "evenement" : "carte", id: String(m.id), poids: Number(m.poids) })));
  return json({ ok: true });
});
