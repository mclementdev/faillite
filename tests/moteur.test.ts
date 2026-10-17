import { describe, expect, it } from "vitest";
import {
  appliquerChoix,
  bilanFinal,
  calculerJauges,
  commencerTour,
  creerPartie,
  effetsVersModificateurs,
  ErreurContenu,
  flux,
  jouerPartie,
  mulberry32,
  normaliser,
  optionPourValeur,
  resoudreElection,
  resoudreVote,
  simulate,
  terminerTour,
  tirerPondere,
  trajectoireSansIntervention,
  valeurModificateur,
  valeursEffectives,
  type Carte,
} from "../engine";
import { chargerContenu } from "../content";
import { carteCurseur, carteTest, contenuTest, H } from "./fixtures";

const src = { type: "carte" as const, id: "t" };

describe("effets", () => {
  it("immédiat : actif seulement l'année de la décision", () => {
    const [m] = effetsVersModificateurs([{ cible: "a", valeur: 5, type: "immediat", hypothese: H }], 2030, src, 4);
    expect(valeurModificateur(m, 2029)).toBe(0);
    expect(valeurModificateur(m, 2030)).toBe(5);
    expect(valeurModificateur(m, 2031)).toBe(0);
  });

  it("différé : s'applique à N + délai puis reste", () => {
    const [m] = effetsVersModificateurs([{ cible: "a", valeur: 3, type: "differe", delai: 3, hypothese: H }], 2030, src, 4);
    expect(valeurModificateur(m, 2032)).toBe(0);
    expect(valeurModificateur(m, 2033)).toBe(3);
    expect(valeurModificateur(m, 2050)).toBe(3);
  });

  it("durable : reste tant qu'il n'est pas annulé", () => {
    const [m] = effetsVersModificateurs([{ cible: "a", valeur: 2, type: "durable", hypothese: H }], 2030, src, 4);
    expect(valeurModificateur(m, 2030)).toBe(2);
    expect(valeurModificateur(m, 2060)).toBe(2);
    m.fin = 2035;
    expect(valeurModificateur(m, 2035)).toBe(0);
  });

  it("estompé : appliqué tout de suite puis résorbé progressivement", () => {
    const [m] = effetsVersModificateurs([{ cible: "a", valeur: 8, type: "estompe", duree: 4, hypothese: H }], 2030, src, 4);
    expect(valeurModificateur(m, 2030)).toBe(8);
    expect(valeurModificateur(m, 2031)).toBe(6);
    expect(valeurModificateur(m, 2033)).toBe(2);
    expect(valeurModificateur(m, 2034)).toBe(0);
  });

  it("les effets se cumulent et restent dans les bornes", () => {
    const c = contenuTest();
    const mods = effetsVersModificateurs(
      [
        { cible: "a", valeur: 30, type: "durable", hypothese: H },
        { cible: "a", valeur: 40, type: "durable", hypothese: H },
      ],
      2027,
      src,
      4,
    );
    const eff = valeursEffectives(c, { a: 50, b: 50, c: 50, d: 50, e: 50 }, mods, 2027);
    expect(eff.a).toBe(100); // 50 + 30 + 40 borné à 100
  });

  it("annuler une carte coupe ses effets durables", () => {
    const c = contenuTest({
      cartes: [
        carteTest("c1", "fiscalite"),
        { ...carteTest("c2", "sante"), options: [{ id: "x", titre: "Annuler", explication: "Annule la carte c1.", annule: ["c1"], effets: [{ cible: "e", valeur: 0.1, type: "immediat", hypothese: H }] }, carteTest("c2").options[1]] },
      ],
    });
    const etat = creerPartie(c, { graine: 1, nbTours: 5 });
    etat.courant = { tour: 0, annee: 2027, jaugesPrecedentes: etat.jaugesDepart, jaugesBilan: etat.jaugesDepart, impactsOptions: {}, resonances: [], carte: "c1" };
    appliquerChoix(c, etat, { options: ["x"] });
    terminerTour(c, etat);
    expect(valeursEffectives(c, etat.base, etat.mods, etat.annee).a).toBe(60);
    etat.courant = { tour: 1, annee: 2028, jaugesPrecedentes: etat.jaugesDepart, jaugesBilan: etat.jaugesDepart, impactsOptions: {}, resonances: [], carte: "c2" };
    appliquerChoix(c, etat, { options: ["x"] });
    expect(valeursEffectives(c, etat.base, etat.mods, etat.annee).a).toBe(50);
  });
});

describe("jauges", () => {
  it("normalisation linéaire et normalisation « cible »", () => {
    expect(normaliser(5, { type: "lineaire", zero: 0, cent: 10 })).toBe(50);
    expect(normaliser(4, { type: "lineaire", zero: 13, cent: 4 })).toBe(100); // moins c'est mieux
    expect(normaliser(20, { type: "lineaire", zero: 0, cent: 10 })).toBe(100); // borné
    expect(normaliser(2, { type: "cible", cible: 2, ecart: 5 })).toBe(100);
    expect(normaliser(4.5, { type: "cible", cible: 2, ecart: 5 })).toBe(50);
    expect(normaliser(-0.5, { type: "cible", cible: 2, ecart: 5 })).toBe(50);
  });

  it("une jauge est la moyenne pondérée de ses indicateurs normalisés", () => {
    const c = contenuTest();
    c.jauges.economie.indicateurs = [
      { id: "a", poids: 3 },
      { id: "b", poids: 1 },
      { id: "c", poids: 0 },
      { id: "d", poids: 0 },
      { id: "e", poids: 0 },
    ];
    const j = calculerJauges(c, { a: 80, b: 40, c: 0, d: 0, e: 0 });
    expect(j.economie).toBeCloseTo(70, 9); // (3×80 + 1×40) / 4
  });

  it("la sensibilité amplifie l'écart à la situation de départ sans changer le départ", () => {
    const c = contenuTest();
    c.jauges.economie.sensibilite = 3;
    const depart = calculerJauges(c, { a: 50, b: 50, c: 50, d: 50, e: 50 });
    expect(depart.economie).toBeCloseTo(50, 9);
    const apres = calculerJauges(c, { a: 60, b: 50, c: 50, d: 50, e: 50 });
    expect(apres.economie).toBeCloseTo(50 + 3 * 2, 9); // écart brut de 2 points ×3
    expect(apres.finances).toBeCloseTo(52, 9); // sensibilité 1 par défaut
    expect(calculerJauges(c, { a: 100, b: 100, c: 100, d: 100, e: 100 }).economie).toBe(100); // bornée
  });

  it("chaque jauge du vrai contenu a au moins 5 indicateurs", () => {
    const c = chargerContenu();
    for (const j of Object.values(c.jauges)) expect(j.indicateurs.filter((x) => x.poids > 0).length).toBeGreaterThanOrEqual(5);
  });
});

describe("seuils d'alerte", () => {
  it("une jauge sous le seuil déclenche l'événement lié l'année suivante", () => {
    const c = contenuTest({
      evenements: [
        { id: "alerte-eco", titre: "Alerte économie", description: "Événement d'alerte de test.", nature: "negatif", declencheur: { jauge: "economie" }, effets: [{ cible: "e", valeur: 1, type: "immediat", hypothese: H }] },
        { id: "normal", titre: "Événement normal", description: "Événement aléatoire de test.", nature: "positif", effets: [{ cible: "e", valeur: 1, type: "immediat", hypothese: H }] },
      ],
    });
    const etat = creerPartie(c, { graine: 3, nbTours: 5 });
    etat.base = { a: 20, b: 20, c: 20, d: 20, e: 20 }; // toutes les jauges à 20 < 35
    const t1 = commencerTour(c, etat);
    expect(t1.evenement?.id).toBe("normal"); // pas encore d'alerte programmée
    terminerTour(c, etat);
    expect(etat.alertesProgrammees.some((a) => a.jauge === "economie" && a.annee === 2028)).toBe(true);
    const t2 = commencerTour(c, etat);
    expect(t2.evenement?.id).toBe("alerte-eco");
    expect(t2.evenement?.alerte).toBe("economie");
  });

  it("pas d'alerte au-dessus du seuil", () => {
    const c = contenuTest();
    const etat = creerPartie(c, { graine: 3, nbTours: 5 });
    commencerTour(c, etat);
    terminerTour(c, etat);
    expect(etat.alertesProgrammees).toHaveLength(0);
  });
});

describe("tirage pondéré", () => {
  it("un poids de 0 n'est jamais tiré", () => {
    const rng = mulberry32(7);
    const tirages = new Set<string>();
    for (let i = 0; i < 5000; i++) tirages.add(tirerPondere(["a", "b", "c"], (x) => (x === "b" ? 0 : 1), rng)!);
    expect(tirages.has("b")).toBe(false);
    expect(tirages.size).toBe(2);
  });

  it("le tirage est proportionnel aux poids", () => {
    const rng = mulberry32(11);
    let a = 0;
    for (let i = 0; i < 20000; i++) if (tirerPondere(["a", "b"], (x) => (x === "a" ? 3 : 1), rng) === "a") a++;
    expect(a / 20000).toBeGreaterThan(0.72);
    expect(a / 20000).toBeLessThan(0.78);
  });

  it("une carte de poids 0 n'est jamais tirée en partie", () => {
    const c = contenuTest();
    for (let g = 0; g < 20; g++) {
      const etat = jouerPartie(c, { graine: g, nbTours: 30, poids: { cartes: { c0: 0, c1: 0 } } }, () => ({ options: ["x"] }));
      expect(etat.cartesJouees).not.toContain("c0");
      expect(etat.cartesJouees).not.toContain("c1");
    }
  });

  it("la graine rend le tirage reproductible", () => {
    const c = contenuTest();
    const p1 = jouerPartie(c, { graine: 42, nbTours: 20 }, () => ({ options: ["x"] }));
    const p2 = jouerPartie(c, { graine: 42, nbTours: 20 }, () => ({ options: ["x"] }));
    const p3 = jouerPartie(c, { graine: 43, nbTours: 20 }, () => ({ options: ["x"] }));
    expect(p1.cartesJouees).toEqual(p2.cartesJouees);
    expect(p1.cartesJouees).not.toEqual(p3.cartesJouees);
    expect(flux(1, "x", 2)()).toBe(flux(1, "x", 2)());
  });

  it("une carte n'est jamais tirée deux fois et le même thème n'est pas tiré deux tours de suite", () => {
    const c = contenuTest();
    const etat = jouerPartie(c, { graine: 9, nbTours: 30 }, () => ({ options: ["y"] }));
    expect(new Set(etat.cartesJouees).size).toBe(etat.cartesJouees.length);
    for (let i = 1; i < etat.themes.length; i++) expect(etat.themes[i]).not.toBe(etat.themes[i - 1]);
  });
});

describe("règles de vote", () => {
  const c = contenuTest({ cartes: [carteTest("u"), carteTest("cu", "sante", 1, "cumulable"), carteCurseur()] });
  const unique = c.cartes.find((x) => x.id === "u")!;
  const cumulable = c.cartes.find((x) => x.id === "cu")!;
  const curseur = c.cartes.find((x) => x.id === "curseur")!;

  it("majorité simple", () => {
    const r = resoudreVote(unique, ["x", "y", "y", "z", "y"], mulberry32(1));
    expect(r.options).toEqual(["y"]);
    expect(r.decompte).toEqual({ x: 1, y: 3, z: 1 });
    expect(r.egalite).toBe(false);
  });

  it("égalité : tirage au sort parmi les ex aequo, reproductible", () => {
    const r1 = resoudreVote(unique, ["x", "y", "x", "y", "z"], mulberry32(5));
    const r2 = resoudreVote(unique, ["x", "y", "x", "y", "z"], mulberry32(5));
    expect(r1.egalite).toBe(true);
    expect(r1.exAequo.sort()).toEqual(["x", "y"]);
    expect(["x", "y"]).toContain(r1.options[0]);
    expect(r1.options).toEqual(r2.options);
    const gagnants = new Set<string>();
    for (let s = 0; s < 50; s++) gagnants.add(resoudreVote(unique, ["x", "y"], mulberry32(s)).options[0]);
    expect(gagnants).toEqual(new Set(["x", "y"]));
  });

  it("cumulable : les deux options les plus votées sont retenues", () => {
    const r = resoudreVote(cumulable, ["x", "x", "x", "z", "z", "y"], mulberry32(1));
    expect(r.options.sort()).toEqual(["x", "z"]);
  });

  it("cumulable : égalité pour la deuxième place tranchée au sort", () => {
    const r = resoudreVote(cumulable, ["x", "x", "y", "z"], mulberry32(2));
    expect(r.options[0]).toBe("x");
    expect(["y", "z"]).toContain(r.options[1]);
    expect(r.egalite).toBe(true);
  });

  it("curseur : la valeur médiane est retenue", () => {
    expect(resoudreVote(curseur, [62, 66, 63, 65, 66], mulberry32(1)).valeur).toBe(65);
    expect(resoudreVote(curseur, [62, 66], mulberry32(1)).valeur).toBe(64); // moyenne des deux valeurs centrales
    expect(resoudreVote(curseur, [62, 63], mulberry32(1)).valeur).toBe(62); // 62,5 → valeur la plus basse
    expect(resoudreVote(curseur, [62, 99, "abc"], mulberry32(1)).valeur).toBe(62); // votes invalides ignorés
  });

  it("curseur : effets interpolés pour une valeur intermédiaire", () => {
    const o = optionPourValeur(curseur as Carte, 65);
    expect(o.effets.find((e) => e.cible === "a")?.valeur).toBeCloseTo(2);
  });

  it("aucun vote : le hasard décide", () => {
    const r = resoudreVote(unique, [], mulberry32(3));
    expect(r.aucunVote).toBe(true);
    expect(r.options).toHaveLength(1);
  });

  it("égalité : la voix de la présidence compte double", () => {
    for (let s = 0; s < 20; s++) {
      const r = resoudreVote(unique, ["x", "y", "x", "y", "z"], mulberry32(s), "y");
      expect(r.options).toEqual(["y"]);
      expect(r.departagePresident).toBe(true);
      expect(r.egalite).toBe(false);
    }
    // Sans égalité, la présidence n'a qu'une voix.
    const sans = resoudreVote(unique, ["x", "x", "y"], mulberry32(1), "y");
    expect(sans.options).toEqual(["x"]);
    expect(sans.departagePresident).toBe(false);
  });

  it("égalité persistante (présidence hors du groupe à égalité) : le sort tranche", () => {
    const r = resoudreVote(unique, ["x", "y", "x", "y", "z"], mulberry32(5), "z");
    expect(r.departagePresident).toBe(false);
    expect(r.egalite).toBe(true);
    expect(["x", "y"]).toContain(r.options[0]);
  });

  it("cumulable : la présidence départage la deuxième place", () => {
    const r = resoudreVote(cumulable, ["x", "x", "y", "z"], mulberry32(2), "z");
    expect(r.options).toEqual(["x", "z"]);
    expect(r.departagePresident).toBe(true);
  });

  it("curseur : avec un nombre pair de votes, la voix de la présidence donne la médiane", () => {
    const r = resoudreVote(curseur, [62, 66], mulberry32(1), 66);
    expect(r.valeur).toBe(66);
    expect(r.departagePresident).toBe(true);
    expect(resoudreVote(curseur, [62, 66, 64], mulberry32(1), 66).valeur).toBe(64); // impair : médiane normale
  });

  it("élection de la présidence : majorité, égalité au sort, personne ne vote", () => {
    expect(resoudreElection(["Léa", "Sam", "Noé"], ["Sam", "Léa", "Sam"], mulberry32(1))).toMatchObject({ elu: "Sam", egalite: false, nbVotes: 3 });
    const egal = resoudreElection(["Léa", "Sam"], ["Sam", "Léa", "Inconnu"], mulberry32(4));
    expect(egal.egalite).toBe(true);
    expect(egal.nbVotes).toBe(2);
    expect(["Léa", "Sam"]).toContain(egal.elu);
    const vide = resoudreElection(["Léa", "Sam"], [], mulberry32(4));
    expect(vide.aucunVote).toBe(true);
    expect(["Léa", "Sam"]).toContain(vide.elu);
    expect(resoudreElection([], [], mulberry32(4)).elu).toBeUndefined();
  });
});

describe("trajectoire sans intervention", () => {
  it("rejoue la même graine sans décision, de façon reproductible", () => {
    const c = chargerContenu();
    const a = trajectoireSansIntervention(c, 77, 20);
    const b = trajectoireSansIntervention(c, 77, 20);
    expect(a.decisions).toHaveLength(0);
    expect(a.cartesJouees).toHaveLength(0);
    expect(a.historique).toHaveLength(20);
    expect(a.historique.map((h) => h.jauges)).toEqual(b.historique.map((h) => h.jauges));
  });

  it("voit passer les mêmes événements aléatoires qu'une partie jouée (hors alertes)", () => {
    const c = chargerContenu();
    const sans = trajectoireSansIntervention(c, 5, 30);
    const jouee = jouerPartie(c, { graine: 5, nbTours: 30 }, (carte) => ({ options: [carte.options[0].id], valeur: carte.options[0].valeur }));
    const aleatoires = (e: typeof sans) => e.evenements.filter((x) => !x.alerte).map((x) => `${x.annee}:${x.id}`);
    // Les années sans alerte dans les deux parties tirent le même événement.
    const anneesAlerte = new Set([...sans.evenements, ...jouee.evenements].filter((x) => x.alerte).map((x) => x.annee));
    const filtre = (l: string[]) => l.filter((x) => !anneesAlerte.has(Number(x.split(":")[0])));
    expect(filtre(aleatoires(sans)).slice(0, 5)).toEqual(filtre(aleatoires(jouee)).slice(0, 5));
  });

  it("le bilan final compare la partie et la trajectoire sans intervention", () => {
    const c = chargerContenu();
    const etat = jouerPartie(c, { graine: 12, nbTours: 20 }, (carte) => ({ options: [carte.options[1].id], valeur: carte.options[1].valeur }));
    const b = bilanFinal(c, etat);
    expect(b.anneeFin).toBe(2046);
    expect(b.decisionsMarquantes.length).toBeLessThanOrEqual(5);
    expect(b.enseignements.length).toBeGreaterThanOrEqual(3);
    expect(b.enseignements.length).toBeLessThanOrEqual(4);
    expect(Object.keys(b.jaugesSansIntervention)).toHaveLength(8);
  });
});

describe("simulation", () => {
  it("simulate est reproductible et compte les tirages", () => {
    const c = chargerContenu();
    const r1 = simulate(c, 20, 1, undefined, "aleatoire", 20);
    const r2 = simulate(c, 20, 1, undefined, "aleatoire", 20);
    expect(r1.jaugesFin).toEqual(r2.jaugesFin);
    const tirees = Object.values(r1.cartes).reduce((s, x) => s + x, 0);
    expect(tirees).toBe(20 * 20);
    expect(r1.synthese.length).toBeGreaterThan(20);
  });

  it("une carte désactivée (poids 0) n'est jamais tirée en simulation", () => {
    const c = chargerContenu();
    const r = simulate(c, 30, 4, { cartes: { "retraites-age": 0 } }, "aleatoire", 30);
    expect(r.cartes["retraites-age"]).toBe(0);
  });
});

describe("imprévus", () => {
  const imprevu = (id: string, si: unknown, proba = 1) => ({
    id,
    titre: `Imprévu ${id}`,
    description: "Une conséquence inattendue de test.",
    nature: "negatif",
    proba,
    si,
    effets: [{ cible: "d", valeur: -20, type: "durable", hypothese: H }],
  });

  it("caché pendant le vote, révélé et appliqué une fois la décision prise", () => {
    const c = contenuTest({ cartes: [carteTest("k")], evenements: [], imprevus: [imprevu("aie", { carte: "k", options: ["x"] })] });
    const e = creerPartie(c, { graine: 3, nbTours: 5 });
    const tour = commencerTour(c, e);
    // Les impacts affichés pendant le vote ignorent l'imprévu (seul « a » bouge pour l'option x).
    expect(tour.impactsOptions.x.economie).toBeGreaterThan(0);
    const res = appliquerChoix(c, e, { options: ["x"] });
    expect(res.decision.imprevu?.id).toBe("aie");
    expect(res.decision.imprevu!.impacts.economie).toBeLessThan(0);
    expect(res.changements.map((x) => x.id)).toContain("d");
    expect(e.imprevus).toEqual(["aie"]);
  });

  it("ne concerne que l'option liée, et survient au plus une fois par partie", () => {
    const c = contenuTest({ cartes: [carteTest("k"), carteTest("l", "sante")], evenements: [], imprevus: [imprevu("aie", { carte: "k", options: ["x"] }), imprevu("theme", { theme: "sante" })] });
    const e = creerPartie(c, { graine: 3, nbTours: 5 });
    commencerTour(c, e);
    const carte = e.courant!.carte!;
    const res = appliquerChoix(c, e, { options: ["y"] });
    expect(res.decision.imprevu?.id).toBe(carte === "l" ? "theme" : undefined);
    terminerTour(c, e);
    commencerTour(c, e);
    const res2 = appliquerChoix(c, e, { options: ["x"] });
    expect(res2.decision.imprevu?.id).toBe(e.courant!.carte === "k" ? "aie" : "theme");
    expect(new Set(e.imprevus).size).toBe(e.imprevus.length);
  });

  it("le tirage dépend de la graine et de la probabilité", () => {
    const c = contenuTest({ cartes: [carteTest("k")], evenements: [], imprevus: [imprevu("rare", { carte: "k" }, 0.5)] });
    const issues = Array.from({ length: 200 }, (_, g) => {
      const e = creerPartie(c, { graine: g, nbTours: 1 });
      commencerTour(c, e);
      return appliquerChoix(c, e, { options: ["x"] }).decision.imprevu?.id;
    });
    const n = issues.filter(Boolean).length;
    expect(n).toBeGreaterThan(70);
    expect(n).toBeLessThan(130);
    const rejoue = () => {
      const e = creerPartie(c, { graine: 7, nbTours: 1 });
      commencerTour(c, e);
      return appliquerChoix(c, e, { options: ["x"] }).decision.imprevu?.id;
    };
    expect(rejoue()).toBe(rejoue());
  });

  it("une référence inconnue est signalée", () => {
    expect(() => contenuTest({ imprevus: [imprevu("faux", { carte: "absente" })] })).toThrow(/imprevus.json › « faux » › si : carte inconnue « absente »/);
  });
});

describe("validation du contenu", () => {
  it("le vrai contenu est valide et assez fourni", () => {
    const c = chargerContenu();
    expect(c.cartes.length).toBeGreaterThanOrEqual(36);
    expect(c.evenements.filter((e) => !e.declencheur).length).toBeGreaterThanOrEqual(16);
    for (const carte of c.cartes) for (const o of carte.options) for (const e of o.effets) expect(e.hypothese.length).toBeGreaterThan(10);
    for (const i of Object.values(c.indicateurs)) expect(i.source).toBeTruthy();
    expect(c.imprevus.length).toBeGreaterThanOrEqual(40);
    expect(c.imprevus.some((i) => i.nature === "positif")).toBe(true);
  });

  it("une erreur indique le fichier, la carte et le champ", () => {
    const mauvaise = { ...carteTest("cassee"), options: [{ id: "x", titre: "Option X", explication: "Explication valide.", effets: [{ cible: "inconnu", valeur: 1, type: "immediat", hypothese: H }] }, carteTest("cassee").options[1]] };
    try {
      contenuTest({ cartes: [mauvaise] });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ErreurContenu);
      expect((e as Error).message).toContain("cartes.json › « cassee » › option « x » : effet sur un indicateur inconnu « inconnu »");
    }
  });

  it("une erreur de schéma indique le chemin du champ", () => {
    const mauvaise = { ...carteTest("sans-type"), type: "multiple" };
    expect(() => contenuTest({ cartes: [mauvaise] })).toThrow(/cartes\.json › « sans-type » › type/);
  });
});

describe("phase 2 : programmes des candidats", () => {
  it("le fichier d'exemple respecte le format et pointe vers des cartes existantes", async () => {
    const { Programme } = await import("../engine/schema");
    const exemple = (await import("../content/programmes/_exemple.json")).default;
    const p = Programme.parse(exemple);
    const c = chargerContenu();
    for (const id of Object.keys(p.positions)) expect(c.cartes.some((x) => x.id === id)).toBe(true);
  });
});
