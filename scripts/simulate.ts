/**
 * npm run simulate -- [--n 1000] [--graine 42] [--mode aleatoire|sans_intervention] [--annees 5] [--json]
 * Utilise les poids par défaut du contenu (les poids modifiés dans le backoffice vivent dans Redis).
 */
import { chargerContenu } from "../content";
import { JAUGES, simulate, type ModeSimulation } from "../engine";

const args = process.argv.slice(2);
const arg = (nom: string, defaut: string) => {
  const i = args.indexOf(`--${nom}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : defaut;
};
const n = Number(arg("n", "1000"));
const graine = Number(arg("graine", "42"));
const mode = arg("mode", "aleatoire") as ModeSimulation;
const annees = Number(arg("annees", "5"));

const contenu = chargerContenu();
const r = simulate(contenu, n, graine, undefined, mode, annees);
if (args.includes("--json")) {
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}
console.log(`\n${r.n} parties · ${r.nbAnnees} ans · graine ${r.graine} · mode ${r.mode} · ${r.dureeMs} ms`);
console.log(`Événements par partie : ${r.evenementsParPartie} (dont ${r.provoquesParPartie} provoqués par une décision, ${r.crisesParPartie} crises)\n`);
console.log("Jauges en fin de partie (moyenne · médiane · P10 – P90) :");
for (const j of JAUGES) {
  const s = r.jaugesFin[j];
  console.log(`  ${contenu.jauges[j].nom.padEnd(20)} ${String(s.moyenne).padStart(5)} · ${String(s.mediane).padStart(5)} · ${s.p10} – ${s.p90}`);
}
console.log(`\nAu moins une jauge sous le seuil : ${Math.round(r.alertes.auMoinsUne * 100)} % des parties`);
for (const j of JAUGES) console.log(`  ${contenu.jauges[j].nom.padEnd(20)} ${Math.round(r.alertes.parJauge[j] * 100)} %`);
const tri = Object.entries(r.cartes).sort((a, b) => b[1] - a[1]);
console.log(`\nCartes les plus tirées : ${tri.slice(0, 5).map(([id, v]) => `${id} (${v})`).join(", ")}`);
console.log(`Cartes les moins tirées : ${tri.slice(-5).map(([id, v]) => `${id} (${v})`).join(", ")}`);
const evts = Object.entries(r.evenements).sort((a, b) => b[1] - a[1]);
console.log(`Événements : ${evts.map(([id, v]) => `${id} ${v}`).join(", ")}`);
const signalees = r.options.filter((o) => o.statut !== "equilibree");
if (signalees.length) {
  console.log("\nOptions à équilibrer :");
  for (const o of signalees) console.log(`  [${o.statut}] ${o.carte} › ${o.titre} (score ${o.score})`);
}
console.log(`\n${r.synthese}\n`);
