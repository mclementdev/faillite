import { actionHote, type ActionHote } from "@/lib/salle";
import { corps, erreur, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Actions de l'écran hôte : configurer, démarrer, ouvrir et clore le vote, passer à l'année suivante. */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const b = await corps<ActionHote & { hote: string }>(req);
    const s = await actionHote(code, String(b.hote ?? ""), b);
    return json({ ok: true, phase: s.phase, version: s.version });
  } catch (e) {
    return erreur(e);
  }
}
