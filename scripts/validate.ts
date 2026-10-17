/** Valide tout le contenu et affiche un résumé (npm run validate). */
import { chargerContenu } from "../content";
import { ErreurContenu } from "../engine";

try {
  const c = chargerContenu();
  const parTheme: Record<string, number> = {};
  for (const carte of c.cartes) parTheme[carte.theme] = (parTheme[carte.theme] ?? 0) + 1;
  console.log(`Contenu valide : ${c.cartes.length} cartes, ${c.evenements.length} événements, ${c.resonances.length} résonances, ${c.imprevus.length} imprévus, ${Object.keys(c.indicateurs).length} indicateurs.`);
  console.log("Cartes par thème :", parTheme);
  const provisoires = Object.entries(c.indicateurs).filter(([, i]) => i.provisoire).map(([id]) => id);
  console.log(`Indicateurs provisoires (${provisoires.length}) : ${provisoires.join(", ")}`);
} catch (e) {
  if (e instanceof ErreurContenu) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
