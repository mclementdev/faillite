/**
 * Chargement et validation du contenu du jeu (imports statiques : embarqués au build Next.js).
 * Pour ajouter un fichier de cartes : créez-le dans content/cartes/ et ajoutez-le à FICHIERS_CARTES.
 */
import { validerContenu, type Contenu, type ContenuBrut } from "../engine/contenu";
import indicateurs from "./indicateurs.json";
import modele from "./config/modele.json";
import jauges from "./config/jauges.json";
import regles from "./config/regles.json";
import evenements from "./evenements.json";
import resonances from "./resonances.json";
import imprevus from "./imprevus.json";
import retraites from "./cartes/retraites.json";
import fiscalite from "./cartes/fiscalite.json";
import detteDepenses from "./cartes/dette-depenses.json";
import ecologie from "./cartes/ecologie.json";
import energie from "./cartes/energie.json";
import sante from "./cartes/sante.json";
import education from "./cartes/education.json";
import securiteJustice from "./cartes/securite-justice.json";
import logement from "./cartes/logement.json";
import emploi from "./cartes/emploi.json";
import demographieMigrations from "./cartes/demographie-migrations.json";
import souverainete from "./cartes/souverainete.json";

const FICHIERS_CARTES: [string, unknown][] = [
  ["content/cartes/retraites.json", retraites],
  ["content/cartes/fiscalite.json", fiscalite],
  ["content/cartes/dette-depenses.json", detteDepenses],
  ["content/cartes/ecologie.json", ecologie],
  ["content/cartes/energie.json", energie],
  ["content/cartes/sante.json", sante],
  ["content/cartes/education.json", education],
  ["content/cartes/securite-justice.json", securiteJustice],
  ["content/cartes/logement.json", logement],
  ["content/cartes/emploi.json", emploi],
  ["content/cartes/demographie-migrations.json", demographieMigrations],
  ["content/cartes/souverainete.json", souverainete],
];

/** Retire les clés de documentation (« _doc », etc.). */
function sansDoc(o: unknown): unknown {
  if (!o || typeof o !== "object" || Array.isArray(o)) return o;
  return Object.fromEntries(Object.entries(o as Record<string, unknown>).filter(([k]) => !k.startsWith("_")));
}

export function contenuBrut(): ContenuBrut {
  return {
    indicateurs: { fichier: "content/indicateurs.json", data: sansDoc(indicateurs) },
    modele: { fichier: "content/config/modele.json", data: sansDoc(modele) },
    jauges: { fichier: "content/config/jauges.json", data: sansDoc(jauges) },
    regles: { fichier: "content/config/regles.json", data: sansDoc(regles) },
    cartes: FICHIERS_CARTES.map(([fichier, data]) => ({ fichier, data })),
    evenements: { fichier: "content/evenements.json", data: evenements },
    resonances: { fichier: "content/resonances.json", data: resonances },
    imprevus: { fichier: "content/imprevus.json", data: imprevus },
  };
}

let cache: Contenu | undefined;

/** Contenu validé (mis en cache). Lève une ErreurContenu lisible en cas de problème. */
export function chargerContenu(): Contenu {
  if (!cache) cache = validerContenu(contenuBrut());
  return cache;
}
