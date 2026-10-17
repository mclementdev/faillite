import { moi } from "@/lib/salle";
import { erreur, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Informations personnelles du participant (pseudo, vote en cours) : jamais mises en cache. */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const jeton = req.headers.get("x-jeton") ?? "";
    const r = jeton ? await moi(code, jeton) : null;
    if (!r) return json({ erreur: "Participant inconnu." }, { status: 404 });
    return json({ pseudo: r.joueur.pseudo, couleur: r.joueur.couleur, vote: r.vote });
  } catch (e) {
    return erreur(e);
  }
}
