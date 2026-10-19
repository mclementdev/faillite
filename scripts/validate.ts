/** Valide tout le contenu et affiche un résumé (npm run validate). */
import { chargerContenu } from "../content";
import { ErreurContenu } from "../engine";

try {
  const c = chargerContenu();
  const parMinistere: Record<string, number> = {};
  for (const carte of c.cartes) parMinistere[carte.ministere] = (parMinistere[carte.ministere] ?? 0) + 1;
  const crises = c.evenements.filter((e) => e.gravite === "crise").length;
  const suites = c.evenements.filter((e) => e.declenchePar.length).length;
  console.log(
    `Contenu valide : ${c.cartes.length} cartes, ${c.evenements.length} événements (${crises} crises, ${suites} pouvant suivre une décision), ` +
      `${c.promesses.length} promesses, ${c.resonances.length} résonances, ${Object.keys(c.indicateurs).length} indicateurs.`,
  );
  console.log("Cartes par ministère :", parMinistere);
  const sansFlash = c.cartes.filter((x) => !x.flash).map((x) => x.id);
  if (sansFlash.length) console.log(`Cartes sans flash info : ${sansFlash.join(", ")}`);
  const provisoires = Object.entries(c.indicateurs).filter(([, i]) => i.provisoire).map(([id]) => id);
  console.log(`Indicateurs provisoires (${provisoires.length}) : ${provisoires.join(", ")}`);
} catch (e) {
  if (e instanceof ErreurContenu) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
