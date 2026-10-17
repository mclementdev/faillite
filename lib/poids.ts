/** Poids des cartes et événements modifiables depuis le backoffice (valeurs par défaut : /content). */
import { chargerContenu } from "@/content";
import { poidsParDefaut, type Poids } from "@/engine";
import { stockage } from "./stockage";

const CLE_POIDS = "config:poids";
const CLE_JOURNAL = "admin:journal";

export interface EntreeJournal {
  date: string;
  email: string;
  type: "carte" | "evenement";
  id: string;
  ancien: number;
  nouveau: number;
}

/** Surcharges enregistrées (seulement les valeurs modifiées). */
async function surcharges(): Promise<Poids> {
  const brut = await stockage().get(CLE_POIDS);
  const p = brut ? (JSON.parse(brut) as Partial<Poids>) : {};
  return { cartes: p.cartes ?? {}, evenements: p.evenements ?? {} };
}

/** Poids actuels = défauts du contenu + surcharges du backoffice. */
export async function poidsActuels(): Promise<Poids> {
  const defaut = poidsParDefaut(chargerContenu());
  const s = await surcharges();
  const garder = (src: Record<string, number>, ids: Record<string, number>) =>
    Object.fromEntries(Object.entries(src).filter(([id]) => id in ids));
  return {
    cartes: { ...defaut.cartes, ...garder(s.cartes, defaut.cartes) },
    evenements: { ...defaut.evenements, ...garder(s.evenements, defaut.evenements) },
  };
}

export async function modifierPoids(email: string, modifs: { type: "carte" | "evenement"; id: string; poids: number }[]): Promise<Poids> {
  const defaut = poidsParDefaut(chargerContenu());
  const actuels = await poidsActuels();
  const s = await surcharges();
  const journal: EntreeJournal[] = [];
  for (const m of modifs) {
    const table = m.type === "carte" ? "cartes" : "evenements";
    if (!(m.id in defaut[table])) throw new Error(`Identifiant inconnu : ${m.id}`);
    if (!Number.isFinite(m.poids) || m.poids < 0 || m.poids > 100) throw new Error(`Poids invalide pour ${m.id} (0 à 100)`);
    const ancien = actuels[table][m.id];
    if (ancien === m.poids) continue;
    if (m.poids === defaut[table][m.id]) delete s[table][m.id];
    else s[table][m.id] = m.poids;
    journal.push({ date: new Date().toISOString(), email, type: m.type, id: m.id, ancien, nouveau: m.poids });
  }
  await stockage().set(CLE_POIDS, JSON.stringify(s));
  for (const j of journal) await stockage().lpush(CLE_JOURNAL, JSON.stringify(j), 50);
  return poidsActuels();
}

export async function reinitialiserPoids(email: string, type?: "carte" | "evenement"): Promise<Poids> {
  const defaut = poidsParDefaut(chargerContenu());
  const modifs: { type: "carte" | "evenement"; id: string; poids: number }[] = [];
  if (!type || type === "carte") for (const [id, p] of Object.entries(defaut.cartes)) modifs.push({ type: "carte", id, poids: p });
  if (!type || type === "evenement") for (const [id, p] of Object.entries(defaut.evenements)) modifs.push({ type: "evenement", id, poids: p });
  return modifierPoids(email, modifs);
}

export async function journal(): Promise<EntreeJournal[]> {
  return (await stockage().lrange(CLE_JOURNAL, 0, 49)).map((x) => JSON.parse(x) as EntreeJournal);
}
