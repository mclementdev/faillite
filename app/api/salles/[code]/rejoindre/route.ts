import { rejoindre } from "@/lib/salle";
import { corps, erreur, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Rejoindre (ou se reconnecter avec son jeton). */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const b = await corps<{ pseudo?: string; jeton?: string }>(req);
    const r = await rejoindre(code, String(b.pseudo ?? ""), b.jeton ? String(b.jeton) : undefined);
    return json({ jeton: r.jeton, pseudo: r.joueur.pseudo, couleur: r.joueur.couleur });
  } catch (e) {
    return erreur(e);
  }
}
