/** Petits utilitaires pour les routes API. */
import { NextResponse } from "next/server";
import { ErreurContenu } from "@/engine";
import { ErreurSalle } from "./salle";

export function json(data: unknown, init?: ResponseInit & { cache?: "aucun" | "partage" }) {
  const headers = new Headers(init?.headers);
  // « partage » : l'état public d'une salle est mis en cache 1 s par le CDN de Vercel,
  // ce qui mutualise les lectures de tous les téléphones (une seule lecture Redis par seconde).
  // Pas de stale-while-revalidate : il servirait un état vieux de 2 s après chaque action.
  headers.set("Cache-Control", init?.cache === "partage" ? "public, max-age=0, s-maxage=1" : "no-store");
  return NextResponse.json(data, { ...init, headers });
}

export function erreur(e: unknown) {
  if (e instanceof ErreurSalle) return json({ erreur: e.message }, { status: e.statut });
  if (e instanceof ErreurContenu) {
    console.error(e.message);
    return json({ erreur: "Contenu du jeu invalide : voir les journaux du serveur." }, { status: 500 });
  }
  console.error(e);
  return json({ erreur: "Erreur interne." }, { status: 500 });
}

export async function corps<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ErreurSalle("Requête invalide.");
  }
}
