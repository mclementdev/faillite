import { actionHote, joueurs, nbVotes, type ActionHote } from "@/lib/salle";
import { construireVue } from "@/lib/vue";
import { corps, erreur, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Actions de l'écran hôte : configurer, démarrer, ouvrir et clore le vote, passer à l'année suivante. */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const b = await corps<ActionHote & { hote: string }>(req);
    const s = await actionHote(code, String(b.hote ?? ""), b);
    // La vue à jour est renvoyée directement : l'écran hôte l'affiche sans attendre le prochain
    // rafraîchissement (qui passe par le cache du CDN).
    const [liste, votes] = await Promise.all([joueurs(s.code), nbVotes(s)]);
    return json({ ok: true, phase: s.phase, version: s.version, vue: construireVue(s, Object.values(liste), votes) });
  } catch (e) {
    return erreur(e);
  }
}
