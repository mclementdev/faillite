/** Construction de la vue publique d'une salle (ce que voient le grand écran et les téléphones). */
import { chargerContenu } from "@/content";
import {
  calculerJauges,
  carteDeCrise,
  dureeOption,
  effetsArrivant,
  JAUGES,
  nbDecisionsPartie,
  niveauImpact,
  normaliser,
  optionsRetenues,
  populariteDepart,
  valeursCurseur,
  valeursEffectives,
  type Carte,
  type Contenu,
  type Impacts,
  type JaugeId,
  type NiveauImpact,
  type Option,
} from "@/engine";
import { nomMois } from "./libelles";
import { scrutin, type Joueur, type Salle } from "./salle";
import type { Pastille, VueBilan, VueBilanAnnee, VueCampagne, VueCarte, VueIndicateur, VueOption, VuePublique, VueResultat } from "./types";

const LETTRES = "ABCDE";
const PAYS = JAUGES.filter((j) => j !== "popularite");

/** Jauge principale d'un indicateur : celle où il pèse le plus (ou la démographie, hors jauges). */
function groupeDe(contenu: Contenu, id: string): JaugeId | "demographie" {
  let best: JaugeId | "demographie" = "demographie";
  let poids = 0;
  for (const j of JAUGES) {
    const x = contenu.jauges[j].indicateurs.find((i) => i.id === id);
    if (x && x.poids > poids) {
      poids = x.poids;
      best = j;
    }
  }
  return best;
}

function jaugeDe(contenu: Contenu, id: string): JaugeId {
  const g = groupeDe(contenu, id);
  return g === "demographie" ? "finances" : g;
}

function pastilles(contenu: Contenu, impacts: Impacts | undefined, avecDelta = false): Pastille[] {
  if (!impacts) return [];
  return JAUGES.map((j) => ({ j, n: niveauImpact(impacts[j] ?? 0, contenu) }))
    .filter((x) => x.n !== "0")
    .sort((a, b) => Math.abs(impacts[b.j]) - Math.abs(impacts[a.j]))
    .slice(0, 3)
    .map(({ j, n }) => ({ jauge: j, nom: contenu.jauges[j].nomCourt, niveau: n, delta: avecDelta ? Math.round(impacts[j] * 10) / 10 : undefined }));
}

function niveauIndicateur(contenu: Contenu, id: string, avant: number, apres: number): NiveauImpact {
  const n = contenu.modele[id].normalisation;
  const d = normaliser(apres, n) - normaliser(avant, n);
  const a = Math.abs(d);
  if (a < 0.5) return "0";
  if (d > 0) return a >= 4 ? "p2" : "p1";
  return a >= 4 ? "n2" : "n1";
}

/** Effet d'une option sur le budget de l'État, en Md€ par an (déficit en points de PIB → euros). */
function budgetOption(contenu: Contenu, o: Option): number | undefined {
  const pts = o.effets.filter((e) => e.cible === "deficit_public" && e.type !== "estompe").reduce((s, e) => s + e.valeur, 0);
  const md = (pts * contenu.regles.pibMdEuros) / 100;
  return Math.abs(md) >= 0.5 ? Math.round(md) : undefined;
}

function vueOption(contenu: Contenu, o: Option, i: number, impacts: Impacts | undefined): VueOption {
  return {
    id: o.id,
    lettre: LETTRES[i] ?? String(i + 1),
    titre: o.titre,
    explication: o.explication,
    duree: dureeOption(o),
    outil: o.outil ?? "loi",
    budget: budgetOption(contenu, o),
    valeur: o.valeur,
    pastilles: pastilles(contenu, impacts),
  };
}

function vueCarte(contenu: Contenu, carte: Carte, impacts: Record<string, Impacts>, crise: boolean): VueCarte {
  const v: VueCarte = {
    id: carte.id,
    type: carte.type,
    crise,
    ministere: crise ? undefined : carte.ministere,
    titre: carte.titre,
    contexte: carte.contexte,
    notePedagogique: carte.notePedagogique,
    options: carte.options.map((o, i) => vueOption(contenu, o, i, impacts[carte.type === "curseur" ? String(o.valeur) : o.id])),
  };
  if (carte.type === "curseur" && carte.curseur) {
    const valeurs = valeursCurseur(carte);
    v.curseur = { ...carte.curseur, valeurs };
    v.parValeur = Object.fromEntries(valeurs.map((val, i) => [String(val), vueOption(contenu, optionsRetenues(carte, [], val)[0], i, impacts[String(val)])]));
  }
  return v;
}

function format(v: number, decimales: number): string {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

export function construireVue(salle: Salle, liste: Joueur[], nbVotes: number): VuePublique {
  const contenu = chargerContenu();
  const p = salle.partie;
  const etape = p?.etape;
  const annee = p?.termine ? p.annee - 1 : (p?.annee ?? contenu.regles.anneeDepart);
  const initiales = Object.fromEntries(Object.entries(contenu.indicateurs).map(([id, i]) => [id, i.valeur]));
  if (salle.campagne && "popularite" in initiales) initiales.popularite = populariteDepart(contenu, salle.campagne.faites);
  const eff = !p
    ? valeursEffectives(contenu, initiales, [], annee)
    : p.termine
      ? p.historique[p.historique.length - 1].indicateurs
      : valeursEffectives(contenu, p.base, p.mods, p.annee);
  const jauges = calculerJauges(contenu, eff);
  const precedentes = p && !p.termine ? p.jaugesDebutAnnee : jauges;
  const seuil = contenu.regles.seuilAlerte;
  const vueJauge = (j: JaugeId) => ({
    id: j,
    nom: contenu.jauges[j].nom,
    valeur: Math.round(jauges[j]),
    tendance: niveauImpact(jauges[j] - precedentes[j], contenu),
    alerte: jauges[j] < seuil,
  });
  const decisionsFaites = p ? p.decisions.filter((d) => !d.crise).length : 0;

  const vue: VuePublique = {
    code: salle.code,
    version: salle.version,
    phase: salle.phase,
    scrutin: scrutin(salle),
    serveurMaintenant: Date.now(),
    nbAnnees: salle.nbAnnees,
    dureesPossibles: contenu.regles.dureesPossibles,
    dureeVote: salle.dureeVote,
    anneeDepart: contenu.regles.anneeDepart,
    anneeFin: contenu.regles.anneeDepart + salle.nbAnnees - 1,
    annee,
    mois: salle.phase === "bilanAnnee" ? 12 : (etape?.mois ?? 0),
    moisPrecedent: salle.moisPrecedent ?? 0,
    numeroDecision: Math.min(nbDecisionsPartie(contenu, salle.nbAnnees), decisionsFaites + (etape?.type === "decision" && etape.decision === undefined ? 1 : 0)),
    nbDecisions: nbDecisionsPartie(contenu, salle.nbAnnees),
    seuil,
    joueurs: liste.sort((a, b) => a.depuis - b.depuis).map((j) => ({ pseudo: j.pseudo, couleur: j.couleur })),
    nbVotes,
    jauges: PAYS.map(vueJauge),
    popularite: vueJauge("popularite"),
    indicateurs: Object.entries(contenu.indicateurs)
      .filter(([id]) => id !== "popularite")
      .map(
        ([id, i]): VueIndicateur => ({
          id,
          nom: i.nomCourt ?? i.nom,
          valeur: eff[id],
          unite: i.unite,
          decimales: i.decimales,
          provisoire: i.provisoire,
          groupe: groupeDe(contenu, id),
          source: i.source,
          annee: i.annee,
        }),
      ),
    arrivees: [],
    resonances: [],
  };

  if (salle.campagne && (salle.phase === "campagne" || salle.phase === "investiture")) vue.campagne = vueCampagne(contenu, salle);

  if (p && etape && salle.phase !== "bilanAnnee") {
    vue.etape = { type: etape.type, annee: etape.annee, mois: etape.mois };
    if (etape.evenement) {
      const e = contenu.evenements.find((x) => x.id === etape.evenement!.id)!;
      const c = etape.evenement.cause;
      vue.etape.evenement = {
        titre: e.titre,
        description: e.description,
        nature: e.nature,
        gravite: e.gravite,
        alerte: etape.evenement.alerte ? contenu.jauges[etape.evenement.alerte].nom : undefined,
        cause: c ? { titre: c.titre, annee: c.annee, mois: c.mois } : undefined,
        pastilles: pastilles(contenu, etape.evenement.impacts),
      };
      if (Object.keys(etape.impactsOptions).length) vue.etape.carte = vueCarte(contenu, carteDeCrise(e), etape.impactsOptions, true);
    } else if (etape.carte) {
      const carte = contenu.cartes.find((c) => c.id === etape.carte)!;
      vue.etape.carte = vueCarte(contenu, carte, etape.impactsOptions, false);
    }
    vue.resonances = etape.resonances
      .map((id) => contenu.resonances.find((r) => r.id === id))
      .filter((r) => !!r)
      .map((r) => ({ titre: r!.titre, explication: r!.explication }));
    if (vue.resonances.length || etape.n === 0 || p.decisions.every((d) => d.annee < etape.annee)) vue.arrivees = arrivees(contenu, salle);
  }

  if (salle.phase === "vote" || salle.phase === "secondTour" || (salle.phase === "campagne" && salle.campagne?.etat === "vote")) {
    const bonus = salle.flashA && Date.now() < salle.flashA ? contenu.regles.bonusFlashSecondes * 1000 : 0;
    vue.echeance = salle.echeance ? salle.echeance - bonus : undefined;
  }
  if (salle.phase === "vote" && salle.flashA && Date.now() >= salle.flashA && etape?.carte) vue.flash = contenu.cartes.find((c) => c.id === etape.carte)?.flash;
  if (salle.phase === "secondTour" && salle.premierTour && vue.etape?.carte) {
    const ex = salle.premierTour.exAequo;
    vue.secondTour = { options: vue.etape.carte.options.filter((o) => ex.includes(o.id)) };
  }
  if (salle.resultat && salle.phase === "resultat" && vue.etape?.carte) vue.resultat = vueResultat(contenu, salle, vue.etape.carte, jauges);
  if (salle.phase === "bilanAnnee" && p) vue.bilanAnnee = vueBilanAnnee(contenu, salle, jauges);
  if (salle.bilan) vue.bilan = vueBilan(contenu, salle);
  return vue;
}

function arrivees(contenu: Contenu, salle: Salle): string[] {
  const p = salle.partie!;
  const vus = new Set<string>();
  const res: string[] = [];
  for (const m of effetsArrivant(p, p.annee)) {
    const d = p.decisions.find((x) => x.carte === m.source.id);
    if (!d || vus.has(m.source.id)) continue;
    vus.add(m.source.id);
    res.push(`${d.titre} (décidé en ${nomMois(d.mois)} ${d.annee}) produit ses effets`);
  }
  return res.slice(0, 3);
}

function vueCampagne(contenu: Contenu, salle: Salle): VueCampagne {
  const c = salle.campagne!;
  const promesse = (id: string) => contenu.promesses.find((x) => x.id === id)!;
  return {
    index: c.index,
    total: c.promesses.length,
    etat: c.etat,
    promesse: { id: c.promesses[c.index], texte: promesse(c.promesses[c.index]).texte },
    dernier: c.dernier,
    faites: c.faites.map((id) => ({ id, texte: promesse(id).texte })),
    popularite: Math.round(populariteDepart(contenu, c.faites)),
  };
}

function vueResultat(contenu: Contenu, salle: Salle, vc: VueCarte, jauges: Record<JaugeId, number>): VueResultat {
  const r = salle.resultat!;
  const d = r.decision;
  const carte = vc.crise ? carteDeCrise(contenu.evenements.find((e) => e.id === d.carte)!) : contenu.cartes.find((c) => c.id === d.carte)!;
  const options = optionsRetenues(carte, d.options, d.valeur);
  const vote = d.vote;
  const decompte =
    carte.type === "curseur"
      ? (vc.curseur?.valeurs ?? []).map((v) => ({ id: String(v), label: `${format(v, v % 1 ? 1 : 0)} ${carte.curseur?.unite ?? ""}`.trim(), voix: vote?.decompte[String(v)] ?? 0, retenue: v === d.valeur }))
      : vc.options.map((o) => ({ id: o.id, label: `${o.lettre} · ${o.titre}`, voix: vote?.decompte[o.id] ?? 0, retenue: d.options.includes(o.id) }));

  const changements = r.changements
    .filter((c) => c.id !== "popularite")
    .map((c) => {
      const i = contenu.indicateurs[c.id];
      const niveau = niveauIndicateur(contenu, c.id, c.avant, c.apres);
      const j = jaugeDe(contenu, c.id);
      const n = contenu.modele[c.id].normalisation;
      return {
        poids: Math.abs(normaliser(c.apres, n) - normaliser(c.avant, n)),
        v: { nom: i.nomCourt ?? i.nom, avant: c.avant, apres: c.apres, unite: i.unite, decimales: i.decimales, pastille: niveau === "0" ? undefined : { jauge: j, nom: contenu.jauges[j].nomCourt, niveau } },
      };
    })
    .sort((a, b) => b.poids - a.poids)
    .slice(0, 3)
    .map((x) => x.v);

  const programme: VueResultat["programme"] = [];
  const parAnnee = new Map<string, { annee: number; cible: string; valeur: number }>();
  for (const e of r.programme) {
    if (e.cible === "popularite") continue;
    const k = `${e.annee}|${e.cible}`;
    const ex = parAnnee.get(k);
    if (ex) ex.valeur += e.valeur;
    else parAnnee.set(k, { annee: e.annee, cible: e.cible, valeur: e.valeur });
  }
  for (const e of [...parAnnee.values()].sort((a, b) => a.annee - b.annee).slice(0, 3)) {
    const i = contenu.indicateurs[e.cible];
    const j = jaugeDe(contenu, e.cible);
    const ref = contenu.indicateurs[e.cible].valeur;
    const niveau = niveauIndicateur(contenu, e.cible, ref, ref + e.valeur);
    const signe = e.valeur > 0 ? "+" : "−";
    programme.push({
      annee: e.annee,
      texte: `${i.nomCourt ?? i.nom} ${signe}${format(Math.abs(e.valeur), Math.abs(e.valeur) >= 1 ? i.decimales : Math.abs(e.valeur) >= 0.1 ? Math.max(1, i.decimales) : 2)} ${i.unite}`,
      pastille: niveau === "0" ? undefined : { jauge: j, nom: contenu.jauges[j].nomCourt, niveau },
    });
  }
  for (const j of JAUGES) if (jauges[j] < contenu.regles.seuilAlerte) programme.push({ annee: d.annee + 1, texte: `Alerte ${contenu.jauges[j].nom} : une crise peut éclater` });

  const st = vote?.secondTour;
  const p = d.promesse ? contenu.promesses.find((x) => x.id === d.promesse!.id) : undefined;
  return {
    titre: d.rejete ? `Rejeté par référendum : ${d.titre}` : d.titre,
    explication: d.rejete ? "Les électeurs ont dit non. La mesure ne s'applique pas, et le président en sort affaibli." : options.map((o) => o.explication).join(" "),
    lettres: carte.type === "curseur" ? [] : vc.options.filter((o) => d.options.includes(o.id)).map((o) => o.lettre),
    valeur: d.valeur,
    outil: d.outil,
    crise: vc.crise,
    decompte,
    nbVotes: vote?.nbVotes ?? 0,
    egalite: !!vote?.egalite,
    exAequo: (vote?.exAequo ?? []).map((id) => vc.options.find((o) => o.id === id)?.titre ?? id),
    aucunVote: !!vote?.aucunVote,
    secondTour: st
      ? {
          nbVotes: st.nbVotes,
          decompte: st.exAequo.map((id) => {
            const o = vc.options.find((x) => x.id === id);
            return { label: o ? `${o.lettre} · ${o.titre}` : id, voix: st.decompte[id] ?? 0, retenue: d.options.includes(id) };
          }),
        }
      : undefined,
    rejete: !!d.rejete,
    promesse: p ? { texte: p.texte, tenue: d.promesse!.tenue } : undefined,
    pastilles: pastilles(contenu, d.impacts, true),
    changements,
    programme,
    notePedagogique: carte.notePedagogique,
  };
}

function vueBilanAnnee(contenu: Contenu, salle: Salle, jauges: Record<JaugeId, number>): VueBilanAnnee {
  const p = salle.partie!;
  const faits: VueBilanAnnee["faits"] = [
    ...p.evenements.filter((e) => e.annee === p.annee).map((e) => {
      const evt = contenu.evenements.find((x) => x.id === e.id)!;
      return { mois: e.mois, type: (evt.gravite === "crise" ? "crise" : "evenement") as "crise" | "evenement", titre: evt.titre };
    }),
    ...p.decisions.filter((d) => d.annee === p.annee && !d.crise).map((d) => ({ mois: d.mois, type: "decision" as const, titre: d.titre })),
  ].sort((a, b) => a.mois - b.mois);
  return {
    annee: p.annee,
    jauges: JAUGES.map((j) => ({ id: j, nom: contenu.jauges[j].nom, debut: Math.round(p.jaugesDebutAnnee[j]), fin: Math.round(jauges[j]) })),
    faits,
    arrivees: effetsArrivant(p, p.annee + 1)
      .map((m) => p.decisions.find((d) => d.carte === m.source.id)?.titre)
      .filter((t, i, a): t is string => !!t && a.indexOf(t) === i)
      .slice(0, 3),
  };
}

function vueBilan(contenu: Contenu, salle: Salle): VueBilan {
  const b = salle.bilan!;
  return {
    anneeDebut: b.anneeDebut,
    anneeFin: b.anneeFin,
    jauges: JAUGES.map((j) => ({
      id: j,
      nom: contenu.jauges[j].nom,
      depart: Math.round(b.jaugesDepart[j]),
      fin: Math.round(b.jaugesFin[j]),
      sans: Math.round(b.jaugesSansIntervention[j]),
      heritage: Math.round(b.heritage.jauges[j]),
    })),
    anneeHeritage: b.heritage.annee,
    indicateurs: b.indicateurs.map((x) => {
      const i = contenu.indicateurs[x.id];
      return { nom: i.nomCourt ?? i.nom, depart: x.depart, fin: x.fin, sans: x.sans, unite: i.unite, decimales: i.decimales };
    }),
    decisions: b.decisionsMarquantes.map((d) => ({
      annee: d.annee,
      mois: d.mois,
      titre: d.titre,
      pastille: { jauge: d.jauge, nom: contenu.jauges[d.jauge].nomCourt, niveau: niveauImpact(d.impact, contenu) === "0" ? (d.impact >= 0 ? "p1" : "n1") : niveauImpact(d.impact, contenu) },
    })),
    moments: b.momentsCles.map((m) => ({ annee: m.annee, mois: m.mois, evenement: m.evenement, reponse: m.reponse, cause: m.cause })),
    enseignements: b.enseignements,
    promesses: b.promesses.map((x) => {
      const p = contenu.promesses.find((y) => y.id === x.id)!;
      return { texte: p.texte, realite: p.realite, source: p.source, demago: p.demago, faite: x.faite, tenue: x.tenue };
    }),
    demagometre: b.demagometre,
    alertesSans: b.alertesSans.length,
    alertesPartie: b.alertesPartie.length,
  };
}
