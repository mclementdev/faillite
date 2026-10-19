/** Lancement et conservation de la dernière simulation du backoffice. */
import { chargerContenu } from "@/content";
import { simulate, type ModeSimulation, type ResultatSimulation } from "@/engine";
import { poidsActuels } from "./poids";
import { stockage } from "./stockage";

const CLE = "admin:simulation";

export async function lancerSimulation(n: number, graine: number, mode: ModeSimulation, nbAnnees: number, email: string) {
  const r = simulate(chargerContenu(), n, graine, await poidsActuels(), mode, nbAnnees);
  const sauvegarde = { ...r, lancePar: email };
  await stockage().set(CLE, JSON.stringify(sauvegarde));
  return sauvegarde;
}

export async function derniereSimulation(): Promise<(ResultatSimulation & { lancePar: string }) | null> {
  const brut = await stockage().get(CLE);
  return brut ? JSON.parse(brut) : null;
}
