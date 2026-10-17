/** Construction de la vue publique d'une salle (ce que voient le grand écran et les téléphones). */
import { chargerContenu } from "@/content";
import {
  calculerJauges,
  dureeOption,
  effetsArrivant,
  JAUGES,
  niveauImpact,
  normaliser,
  optionsRetenues,
  valeursCurseur,
  valeursEffectives,
  type Carte,
  type Contenu,
  type Impacts,
  type JaugeId,
  type NiveauImpact,
  type Option,
} from "@/engine";
import type { Joueur, Salle } from "./salle";
import type { Pastille, VueBilan, VueCarte, VueIndicateur, VueOption, VuePublique, VueResultat } from "./types";

const LETTRES = "ABCDE";

/** Jauge principale d'un indicateur : celle où il pèse le plus. */
function jaugeDe(contenu: Contenu, id: string): JaugeId {
  let best: JaugeId = "economie";
  let poids = -1;
  for (const j of JAUGES) {
    const x = contenu.jauges[j].indicateurs.find((i) => i.id === id);
    if (x && x.poids > poids) {
      poids = x.poids;
      best = j;
    }
  }
  return best;
}

function pastilles(contenu: Contenu, impacts: Impacts | undefined, avecDelta = false): Pastille[] {
  if (!impacts) return [];
  return JAUGES.map((j) => ({ j, n: niveauImpact(impacts[j], contenu) }))
    .filter((x) => x.n !== "0")
    .sort((a, b) => Math.abs(impacts[b.j]) - Math.abs(impacts[a.j]))
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

function vueOption(contenu: Contenu, o: Option, i: number, impacts: Impacts | undefined): VueOption {
  return {
    id: o.id,
    lettre: LETTRES[i] ?? String(i + 1),
    titre: o.titre,
    explication: o.explication,
    duree: dureeOption(o),
    valeur: o.valeur,
    pastilles: pastilles(contenu, impacts),
  };
}

function vueCarte(contenu: Contenu, carte: Carte, impacts: Record<string, Impacts>): VueCarte {
  const v: VueCarte = {
    id: carte.id,
    type: carte.type,
    theme: carte.theme,
    titre: carte.titre,
    contexte: carte.contexte,
    notePedagogique: carte.notePedagogique,
    options: carte.options.map((o, i) => vueOption(contenu, o, i, impacts[carte.type === "curseur" ? String(o.valeur) : o.id])),
  };
  if (carte.type === "curseur" && carte.curseur) {
    const valeurs = valeursCurseur(carte);
    v.curseur = { ...carte.curseur, valeurs };
    v.parValeur = Object.fromEntries(
      valeurs.map((val, i) => [String(val), vueOption(contenu, optionsRetenues(carte, [], val)[0], i, impacts[String(val)])]),
    );
  }
  return v;
}

function format(v: number, decimales: number): string {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

export function construireVue(salle: Salle, liste: Joueur[], nbVotes: number): VuePublique {
  const contenu = chargerContenu();
  const p = salle.partie;
  const annee = p?.courant?.annee ?? p?.annee ?? contenu.regles.anneeDepart;
  const eff = !p
    ? valeursEffectives(contenu, Object.fromEntries(Object.entries(contenu.indicateurs).map(([id, i]) => [id, i.valeur])), [], annee)
    : p.termine
      ? p.historique[p.historique.length - 1].indicateurs
      : valeursEffectives(contenu, p.base, p.mods, p.annee);
  const jauges = calculerJauges(contenu, eff);
  const precedentes = p?.courant?.jaugesPrecedentes ?? (p?.historique.length ? p.historique[p.historique.length - 1].jauges : jauges);
  const seuil = contenu.regles.seuilAlerte;

  const vue: VuePublique = {
    code: salle.code,
    version: salle.version,
    phase: salle.phase,
    serveurMaintenant: Date.now(),
    nbTours: salle.nbTours,
    toursPossibles: contenu.regles.toursPossibles,
    dureeVote: salle.dureeVote,
    anneeDepart: contenu.regles.anneeDepart,
    annee,
    tour: (p?.courant?.tour ?? p?.tour ?? 0) + 1,
    seuil,
    joueurs: liste.sort((a, b) => a.depuis - b.depuis).map((j) => ({ pseudo: j.pseudo, couleur: j.couleur })),
    nbVotes,
    jauges: JAUGES.map((j) => {
      // Tendance : variation depuis la fin de l'année précédente, sur l'échelle des impacts.
      const d = jauges[j] - precedentes[j];
      return { id: j, nom: contenu.jauges[j].nom, valeur: Math.round(jauges[j]), tendance: niveauImpact(d, contenu), alerte: jauges[j] < seuil };
    }),
    indicateurs: Object.entries(contenu.indicateurs).map(
      ([id, i]): VueIndicateur => ({
        id,
        nom: i.nomCourt ?? i.nom,
        valeur: eff[id],
        unite: i.unite,
        decimales: i.decimales,
        provisoire: i.provisoire,
        jauge: jaugeDe(contenu, id),
        source: i.source,
        annee: i.annee,
      }),
    ),
    arrivees: [],
    resonances: [],
  };

  const courant = p?.courant;
  if (courant?.evenement) {
    const e = contenu.evenements.find((x) => x.id === courant.evenement!.id)!;
    vue.evenement = {
      titre: e.titre,
      description: e.description,
      nature: e.nature,
      alerte: courant.evenement.alerte ? contenu.jauges[courant.evenement.alerte].nom : undefined,
      pastilles: pastilles(contenu, courant.evenement.impacts),
    };
  }
  if (p && courant) {
    const arrivees = effetsArrivant(p, courant.annee);
    const vus = new Set<string>();
    for (const m of arrivees) {
      const d = p.decisions.find((x) => x.carte === m.source.id);
      const carte = contenu.cartes.find((c) => c.id === m.source.id);
      const cleArrivee = `${m.source.id}`;
      if (!d || !carte || vus.has(cleArrivee)) continue;
      vus.add(cleArrivee);
      vue.arrivees.push(`${d.titre} (vote de ${d.annee}) produit ses effets`);
    }
    vue.resonances = courant.resonances
      .map((id) => contenu.resonances.find((r) => r.id === id))
      .filter((r) => !!r)
      .map((r) => ({ titre: r!.titre, explication: r!.explication }));
  }
  if (courant?.carte) {
    const carte = contenu.cartes.find((c) => c.id === courant.carte)!;
    vue.carte = vueCarte(contenu, carte, courant.impactsOptions);
  }
  if (salle.phase === "vote" || salle.phase === "election") vue.echeance = salle.echeance;
  if (salle.president) {
    const j = liste.find((x) => x.pseudo === salle.president!.pseudo);
    vue.presidence = { pseudo: salle.president.pseudo, couleur: j?.couleur ?? "var(--moutarde)" };
  }
  if (salle.phase === "presidence" && salle.election) {
    const e = salle.election;
    vue.election = {
      decompte: vue.joueurs
        .map((j) => ({ pseudo: j.pseudo, couleur: j.couleur, voix: e.decompte[j.pseudo] ?? 0, elu: j.pseudo === e.elu }))
        .sort((a, b) => b.voix - a.voix || Number(b.elu) - Number(a.elu)),
      nbVotes: e.nbVotes,
      egalite: e.egalite,
      exAequo: e.exAequo,
      aucunVote: e.aucunVote,
    };
  }
  if (salle.resultat && salle.phase === "resultat" && vue.carte) vue.resultat = vueResultat(contenu, salle, vue.carte, jauges);
  if (salle.bilan) vue.bilan = vueBilan(contenu, salle);
  return vue;
}

function vueResultat(contenu: Contenu, salle: Salle, vc: VueCarte, jauges: Record<JaugeId, number>): VueResultat {
  const r = salle.resultat!;
  const d = r.decision;
  const carte = contenu.cartes.find((c) => c.id === d.carte)!;
  const options = optionsRetenues(carte, d.options, d.valeur);
  const vote = d.vote;
  const decompte =
    carte.type === "curseur"
      ? (vc.curseur?.valeurs ?? []).map((v) => ({ id: String(v), label: `${format(v, v % 1 ? 1 : 0)} ${carte.curseur?.unite ?? ""}`.trim(), voix: vote?.decompte[String(v)] ?? 0, retenue: v === d.valeur }))
      : vc.options.map((o) => ({ id: o.id, label: `${o.lettre} · ${o.titre}`, voix: vote?.decompte[o.id] ?? 0, retenue: d.options.includes(o.id) }));

  const changements = r.changements
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
    .slice(0, 5)
    .map((x) => x.v);

  const programme: VueResultat["programme"] = [];
  const parAnnee = new Map<string, { annee: number; cible: string; valeur: number }>();
  for (const e of r.programme) {
    const k = `${e.annee}|${e.cible}`;
    const ex = parAnnee.get(k);
    if (ex) ex.valeur += e.valeur;
    else parAnnee.set(k, { annee: e.annee, cible: e.cible, valeur: e.valeur });
  }
  for (const e of [...parAnnee.values()].sort((a, b) => a.annee - b.annee).slice(0, 4)) {
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
  for (const j of JAUGES)
    if (jauges[j] < contenu.regles.seuilAlerte) programme.push({ annee: d.annee + 1, texte: `Alerte ${contenu.jauges[j].nom} : un événement sera tiré` });

  return {
    titre: d.titre,
    explication: options.map((o) => o.explication).join(" "),
    lettres: carte.type === "curseur" ? [] : vc.options.filter((o) => d.options.includes(o.id)).map((o) => o.lettre),
    valeur: d.valeur,
    decompte,
    nbVotes: vote?.nbVotes ?? 0,
    egalite: !!vote?.egalite,
    exAequo: (vote?.exAequo ?? []).map((id) => vc.options.find((o) => o.id === id)?.titre ?? id),
    aucunVote: !!vote?.aucunVote,
    departagePresident: !!vote?.departagePresident,
    pastilles: pastilles(contenu, d.impacts, true),
    changements,
    programme,
    notePedagogique: carte.notePedagogique,
    imprevu: vueImprevu(contenu, d.imprevu),
  };
}

function vueImprevu(contenu: Contenu, tire: { id: string; impacts: Impacts } | undefined): VueResultat["imprevu"] {
  const im = tire && contenu.imprevus.find((x) => x.id === tire.id);
  if (!tire || !im) return undefined;
  return { titre: im.titre, description: im.description, nature: im.nature, pastilles: pastilles(contenu, tire.impacts, true) };
}

function vueBilan(contenu: Contenu, salle: Salle): VueBilan {
  const b = salle.bilan!;
  return {
    anneeDebut: b.anneeDebut,
    anneeFin: b.anneeFin,
    jauges: JAUGES.map((j) => ({ id: j, nom: contenu.jauges[j].nom, depart: Math.round(b.jaugesDepart[j]), fin: Math.round(b.jaugesFin[j]), sans: Math.round(b.jaugesSansIntervention[j]) })),
    indicateurs: b.indicateurs.map((x) => {
      const i = contenu.indicateurs[x.id];
      return { nom: i.nomCourt ?? i.nom, depart: x.depart, fin: x.fin, sans: x.sans, unite: i.unite, decimales: i.decimales };
    }),
    decisions: b.decisionsMarquantes.map((d) => ({
      annee: d.annee,
      titre: d.titre,
      pastille: { jauge: d.jauge, nom: contenu.jauges[d.jauge].nomCourt, niveau: niveauImpact(d.impact, contenu) === "0" ? (d.impact >= 0 ? "p1" : "n1") : niveauImpact(d.impact, contenu) },
    })),
    moments: b.momentsCles.map((m) => ({ annee: m.annee, evenement: m.evenement, reponse: m.reponse })),
    enseignements: b.enseignements,
    alertesSans: b.alertesSans.length,
    alertesPartie: b.alertesPartie.length,
  };
}
