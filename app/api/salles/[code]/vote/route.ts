import { voter } from "@/lib/salle";
import { corps, erreur, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Un vote par participant, modifiable jusqu'à la clôture (contrôlée côté serveur). */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const b = await corps<{ jeton?: string; choix?: unknown }>(req);
    const choix = await voter(code, String(b.jeton ?? ""), b.choix);
    return json({ ok: true, choix });
  } catch (e) {
    return erreur(e);
  }
}
