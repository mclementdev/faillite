import { creerSalle } from "@/lib/salle";
import { erreur, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Crée une salle ; renvoie le code et le jeton secret de l'écran hôte. */
export async function POST() {
  try {
    const s = await creerSalle();
    return json({ code: s.code, hote: s.hote });
  } catch (e) {
    return erreur(e);
  }
}
