import { appliquerEcheances, ErreurSalle, joueurs, lireSalle, nbVotes } from "@/lib/salle";
import { construireVue } from "@/lib/vue";
import { erreur, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** État public de la salle (aucune donnée personnelle, jamais qui a voté quoi). */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    let salle = await lireSalle(code);
    if (!salle) throw new ErreurSalle("Salle introuvable ou expirée.", 404);
    salle = await appliquerEcheances(salle);
    const [liste, votes] = await Promise.all([joueurs(salle.code), nbVotes(salle)]);
    return json(construireVue(salle, Object.values(liste), votes), { cache: "partage" });
  } catch (e) {
    return erreur(e);
  }
}
