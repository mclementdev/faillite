/** Enveloppe des routes /api/admin/* : refuse toute requête sans session admin valide. */
import { sessionAdmin } from "./admin";
import { erreur, json } from "./http";

export function routeAdmin(handler: (req: Request, email: string) => Promise<Response>) {
  return async (req: Request) => {
    const email = sessionAdmin(req);
    if (!email) return json({ erreur: "Session admin absente ou expirée." }, { status: 401 });
    try {
      return await handler(req, email);
    } catch (e) {
      if (e instanceof Error && /inconnu|invalide/i.test(e.message)) return json({ erreur: e.message }, { status: 400 });
      return erreur(e);
    }
  };
}
