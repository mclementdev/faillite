import { describe, expect, it } from "vitest";
import {
  appliquerChoix,
  bilanFinal,
  calculerJauges,
  carteDeLEtape,
  creerPartie,
  effectifs,
  effetsVersModificateurs,
  ErreurContenu,
  etapeAVoter,
  flux,
  jouerPartie,
  moisDesDecisions,
  mulberry32,
  normaliser,
  optionPourValeur,
  populariteDepart,
  prochaineEtape,
  resoudreSecondTour,
  resoudreVote,
  risqueRejetReferendum,
  simulate,
  terminerAnnee,
  tirerPondere,
  trajectoireSansIntervention,
  valeurModificateur,
  valeursEffectives,
  type Carte,
  type Etape,
  type EtatPartie,
} from "../engine";
import { chargerContenu } from "../content";
import { carteCurseur, carteTest, cartesTest, contenuTest, H } from "./fixtures";

const src = { type: "carte" as const, id: "t" };
const effet = (cible: string, valeur: number) => ({ cible, valeur, type: "immediat", hypothese: H });
const breve = (id: string, extra: Record<string, unknown> = {}) => ({ id, titre: `Événement ${id}`, description: "Événement de test.", nature: "negatif", effets: [effet("e", 1)], ...extra });
const crise = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  titre: `Crise ${id}`,
  description: "Crise de test.",
  nature: "negatif",
  gravite: "crise",
  effets: [effet("e", -5)],
  reponses: [
    { id: "r1", titre: "Réponse 1", explication: "Première réponse de test.", effets: [effet("a", 5)] },
    { id: "r2", titre: "Réponse 2", explication: "Deuxième réponse de test.", effets: [effet("b", 5)] },
  ],
  ...extra,
});

/** Joue une partie en notant chaque arrêt (décisions et événements). */
function jouerEnNotant(c: ReturnType<typeof contenuTest>, opts: Parameters<typeof jouerPartie>[1], option = "x") {
  const arrets: Etape[] = [];
  const etat = jouerPartie(c, opts, (carte) => ({ options: [carte.options.find((o) => o.id === option)?.id ?? carte.options[0].id] }), (_e, etape) => arrets.push(structuredClone(etape)));
  return { etat, arrets };
}

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
        carteTest("c1"),
        { ...carteTest("c2", "sante"), options: [{ id: "x", titre: "Annuler", explication: "Annule la carte c1.", annule: ["c1"], effets: [effet("e", 0.1)] }, carteTest("c2").options[1]] },
      ],
    });
    const etat = creerPartie(c, { graine: 1, nbAnnees: 5 });
    const etape = (carte: string, n: number): Etape => ({ n, annee: 2027, mois: n + 1, type: "decision", carte, impactsOptions: {}, resonances: [] });
    etat.etape = etape("c1", 0);
    appliquerChoix(c, etat, { options: ["x"] });
    expect(effectifs(c, etat).a).toBe(60);
    etat.etape = etape("c2", 1);
    appliquerChoix(c, etat, { options: ["x"] });
    expect(effectifs(c, etat).a).toBe(50);
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
    const j = calculerJauges(c, { a: 80, b: 40, c: 0, d: 0, e: 0, popularite: 50 });
    expect(j.economie).toBeCloseTo(70, 9); // (3×80 + 1×40) / 4
  });

  it("la sensibilité amplifie l'écart à la situation de départ sans changer le départ", () => {
    const c = contenuTest();
    c.jauges.economie.sensibilite = 3;
    const depart = calculerJauges(c, { a: 50, b: 50, c: 50, d: 50, e: 50, popularite: 50 });
    expect(depart.economie).toBeCloseTo(50, 9);
    const apres = calculerJauges(c, { a: 60, b: 50, c: 50, d: 50, e: 50, popularite: 50 });
    expect(apres.economie).toBeCloseTo(50 + 3 * 2, 9); // écart brut de 2 points ×3
    expect(apres.finances).toBeCloseTo(52, 9); // sensibilité 1 par défaut
    expect(calculerJauges(c, { a: 100, b: 100, c: 100, d: 100, e: 100, popularite: 50 }).economie).toBe(100); // bornée
  });

  it("le vrai contenu : 6 jauges du pays d'au moins 5 indicateurs, plus la popularité", () => {
    const c = chargerContenu();
    for (const [id, j] of Object.entries(c.jauges)) {
      if (id === "popularite") expect(j.indicateurs.map((x) => x.id)).toEqual(["popularite"]);
      else expect(j.indicateurs.filter((x) => x.poids > 0).length).toBeGreaterThanOrEqual(5);
    }
    expect(Object.keys(c.jauges)).not.toContain("demographie");
  });
});

describe("calendrier : les mois défilent", () => {
  it("trois décisions par an, à des mois distincts espacés d'au moins deux mois", () => {
    for (let g = 0; g < 200; g++) {
      const m = moisDesDecisions(3, mulberry32(g));
      expect(m).toHaveLength(3);
      expect(m.every((x) => x >= 1 && x <= 12)).toBe(true);
      expect(m[1] - m[0]).toBeGreaterThanOrEqual(2);
      expect(m[2] - m[1]).toBeGreaterThanOrEqual(2);
    }
  });

  it("une année : 3 décisions et au plus 2 événements, dans l'ordre des mois", () => {
    const c = contenuTest({ evenements: [breve("e1"), breve("e2"), breve("e3")], regles: { evenements: { maxParAn: 2, probaParMois: 1, delaiAvantRepetition: 0, maxOccurrences: 99, delaiEntreAlertesMemeJauge: 0 } } });
    const { etat, arrets } = jouerEnNotant(c, { graine: 4, nbAnnees: 2 });
    for (const annee of [2027, 2028]) {
      const de = arrets.filter((a) => a.annee === annee);
      expect(de.filter((a) => a.type === "decision")).toHaveLength(3);
      expect(de.filter((a) => a.type === "evenement")).toHaveLength(2);
      const mois = de.map((a) => a.mois);
      expect([...mois].sort((x, y) => x - y)).toEqual(mois);
    }
    expect(etat.historique).toHaveLength(2);
    expect(etat.termine).toBe(true);
  });

  it("sans événement tiré, l'année ne compte que les décisions", () => {
    const c = contenuTest({ evenements: [breve("e1")] });
    const { arrets } = jouerEnNotant(c, { graine: 2, nbAnnees: 1 });
    expect(arrets.map((a) => a.type)).toEqual(["decision", "decision", "decision"]);
  });
});

describe("événements provoqués par une décision", () => {
  const avecSuite = (chance: number) =>
    contenuTest({
      cartes: [{ ...carteTest("k"), poids: 1000 }, ...cartesTest()],
      evenements: [breve("suite", { poids: 0, declenchePar: [{ carte: "k", options: ["x"], chance, delai: [2, 3] }] })],
    });

  it("peut survenir quelques mois plus tard, et l'on sait quelle décision l'a provoqué", () => {
    const c = avecSuite(1);
    const { etat } = jouerEnNotant(c, { graine: 1, nbAnnees: 2 }, "x");
    const d = etat.decisions.find((x) => x.carte === "k")!;
    const evt = etat.evenements.find((e) => e.id === "suite")!;
    expect(evt.cause).toMatchObject({ carte: "k", annee: d.annee, mois: d.mois });
    const ecart = evt.annee * 12 + evt.mois - (d.annee * 12 + d.mois);
    expect(ecart).toBeGreaterThanOrEqual(2);
    expect(ecart).toBeLessThanOrEqual(3 + 1); // +1 : décalé si un autre événement occupe le mois
  });

  it("ne survient pas si l'option n'est pas celle qui le provoque, ni si la chance est nulle", () => {
    expect(jouerEnNotant(avecSuite(1), { graine: 1, nbAnnees: 2 }, "y").etat.evenements.some((e) => e.id === "suite")).toBe(false);
    expect(jouerEnNotant(avecSuite(0), { graine: 1, nbAnnees: 2 }, "x").etat.evenements.some((e) => e.id === "suite")).toBe(false);
  });

  it("n'est jamais certain : la chance est respectée sur de nombreuses parties", () => {
    const c = avecSuite(0.5);
    let n = 0;
    for (let g = 0; g < 120; g++) if (jouerEnNotant(c, { graine: g, nbAnnees: 2 }, "x").etat.evenements.some((e) => e.id === "suite")) n++;
    expect(n).toBeGreaterThan(35);
    expect(n).toBeLessThan(85);
  });
});

describe("crises", () => {
  const c = contenuTest({ evenements: [crise("k1")], regles: { evenements: { maxParAn: 1, probaParMois: 1, delaiAvantRepetition: 0, maxOccurrences: 99, delaiEntreAlertesMemeJauge: 0 } } });

  it("une crise appelle un vote parmi ses réponses ; le choc s'applique quoi qu'il arrive", () => {
    const etat = creerPartie(c, { graine: 3, nbAnnees: 1 });
    const etape = prochaineEtape(c, etat)!;
    expect(etape.type).toBe("evenement");
    expect(etapeAVoter(etape)).toBe(true);
    expect(effectifs(c, etat).e).toBe(45); // choc : −5
    const carte = carteDeLEtape(c, etape)!;
    expect(carte.options.map((o) => o.id)).toEqual(["r1", "r2"]);
    const res = appliquerChoix(c, etat, { options: ["r2"] });
    expect(res.decision.crise).toBe(true);
    expect(etat.evenements[0].reponse).toBe(0);
    expect(effectifs(c, etat).b).toBe(55);
    // Les réponses aux crises s'ajoutent aux trois décisions de l'année.
    const suite = prochaineEtape(c, etat)!;
    expect(suite.type).toBe("decision");
  });

  it("sans intervention, la crise passe sans réponse", () => {
    const etat = trajectoireSansIntervention(c, 3, 1);
    expect(etat.evenements).toHaveLength(1);
    expect(etat.decisions).toHaveLength(0);
  });
});

describe("seuils d'alerte", () => {
  it("une jauge sous le seuil provoque l'événement lié au début de l'année suivante", () => {
    const c = contenuTest({ evenements: [breve("alerte-eco", { alerte: "economie" })] });
    const etat = creerPartie(c, { graine: 3, nbAnnees: 3 });
    etat.base = { a: 20, b: 20, c: 20, d: 20, e: 20, popularite: 50 }; // jauges du pays à 20 < 35
    while (prochaineEtape(c, etat)) appliquerChoix(c, etat, { options: ["x"] });
    terminerAnnee(c, etat);
    const p = etat.planifies.find((x) => x.alerte === "economie")!;
    expect(p.moisAbsolu).toBeGreaterThanOrEqual(2028 * 12);
    expect(p.moisAbsolu).toBeLessThan(2028 * 12 + 4);
    let etape = prochaineEtape(c, etat);
    while (etape && etape.type !== "evenement") {
      appliquerChoix(c, etat, { options: ["x"] });
      etape = prochaineEtape(c, etat);
    }
    expect(etape?.evenement).toMatchObject({ id: "alerte-eco", alerte: "economie" });
  });

  it("pas d'alerte au-dessus du seuil", () => {
    const c = contenuTest({ evenements: [breve("alerte-eco", { alerte: "economie" })] });
    const etat = creerPartie(c, { graine: 3, nbAnnees: 3 });
    while (prochaineEtape(c, etat)) appliquerChoix(c, etat, { options: ["z"] });
    terminerAnnee(c, etat);
    expect(etat.planifies).toHaveLength(0);
  });
});

describe("référendum et popularité", () => {
  it("le risque de rejet baisse quand la popularité monte, dans des bornes", () => {
    expect(risqueRejetReferendum(10)).toBe(0.6);
    expect(risqueRejetReferendum(80)).toBe(0.05);
    expect(risqueRejetReferendum(30)).toBeGreaterThan(risqueRejetReferendum(45));
  });

  it("un référendum rejeté n'applique pas la mesure et affaiblit le président", () => {
    const c = contenuTest({ cartes: [{ ...carteTest("r"), options: [{ id: "x", titre: "Référendum", explication: "Le peuple tranche.", outil: "referendum", effets: [effet("a", 20)] }, carteTest("r").options[1]] }] });
    let rejets = 0;
    for (let g = 0; g < 60; g++) {
      const etat = creerPartie(c, { graine: g, nbAnnees: 1 });
      etat.base.popularite = 20;
      prochaineEtape(c, etat);
      const res = appliquerChoix(c, etat, { options: ["x"] });
      if (res.decision.rejete) {
        rejets++;
        expect(effectifs(c, etat).a).toBe(50);
        expect(effectifs(c, etat).popularite).toBeLessThan(20);
      } else expect(effectifs(c, etat).a).toBe(70);
    }
    expect(rejets).toBeGreaterThan(15); // risque de 60 % avec 20 % de popularité
    expect(rejets).toBeLessThan(55);
  });
});

describe("promesses de campagne", () => {
  const promesse = (id: string, carte: string, demago: number, extra: Record<string, unknown> = {}) => ({
    id,
    texte: `Promesse ${id} de test.`,
    realite: "La réalité chiffrée de test.",
    source: "Test",
    url: "https://example.org",
    demago,
    popularite: 5,
    carte,
    options: ["x"],
    ...extra,
  });
  const c = contenuTest({ cartes: [...cartesTest(), { ...carteTest("promise"), poids: 0.001 }], promesses: [promesse("p1", "promise", 3), promesse("p2", "c1", 1)] });

  it("chaque promesse faite rend plus populaire au départ, sans dépasser le plafond", () => {
    expect(populariteDepart(c, [])).toBe(44);
    expect(populariteDepart(c, ["p1"])).toBe(49);
    expect(creerPartie(c, { graine: 1, nbAnnees: 1, promesses: ["p1", "p2"] }).base.popularite).toBe(54);
  });

  it("une promesse est forcément mise sur la table pendant le mandat", () => {
    for (let g = 0; g < 10; g++) {
      const { etat } = jouerEnNotant(c, { graine: g, nbAnnees: 1, promesses: ["p1"] }, "y");
      const d = etat.decisions.find((x) => x.carte === "promise");
      expect(d?.promesse).toEqual({ id: "p1", tenue: false });
    }
  });

  it("tenir sa promesse ne coûte rien ; la trahir fait chuter la popularité", () => {
    const tenue = jouerEnNotant(c, { graine: 5, nbAnnees: 1, promesses: ["p1"] }, "x").etat;
    const trahie = jouerEnNotant(c, { graine: 5, nbAnnees: 1, promesses: ["p1"] }, "y").etat;
    expect(tenue.decisions.find((d) => d.carte === "promise")?.promesse?.tenue).toBe(true);
    expect(trahie.historique[0].indicateurs.popularite).toBeLessThan(tenue.historique[0].indicateurs.popularite);
  });

  it("le démagomètre mesure la démagogie promise parmi celle proposée", () => {
    const etat = jouerPartie(c, { graine: 2, nbAnnees: 1, promesses: ["p1"], promessesProposees: ["p1", "p2"] }, (carte) => ({ options: [carte.options[0].id] }));
    const b = bilanFinal(c, etat);
    expect(b.demagometre).toBe(75); // 3 sur 3 + 1
    expect(b.promesses).toEqual([
      { id: "p1", faite: true, tenue: true },
      { id: "p2", faite: false, tenue: undefined },
    ]);
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
      const etat = jouerPartie(c, { graine: g, nbAnnees: 10, poids: { cartes: { c0: 0, c1: 0 } } }, () => ({ options: ["x"] }));
      expect(etat.cartesJouees).not.toContain("c0");
      expect(etat.cartesJouees).not.toContain("c1");
    }
  });

  it("la graine rend la partie reproductible", () => {
    const c = contenuTest();
    const p1 = jouerPartie(c, { graine: 42, nbAnnees: 5 }, () => ({ options: ["x"] }));
    const p2 = jouerPartie(c, { graine: 42, nbAnnees: 5 }, () => ({ options: ["x"] }));
    const p3 = jouerPartie(c, { graine: 43, nbAnnees: 5 }, () => ({ options: ["x"] }));
    expect(p1.cartesJouees).toEqual(p2.cartesJouees);
    expect(p1.decisions.map((d) => d.mois)).toEqual(p2.decisions.map((d) => d.mois));
    expect(p1.cartesJouees).not.toEqual(p3.cartesJouees);
    expect(flux(1, "x", 2)()).toBe(flux(1, "x", 2)());
  });

  it("une carte n'est jamais tirée deux fois, ni le même ministère deux fois de suite", () => {
    const c = contenuTest();
    const etat = jouerPartie(c, { graine: 9, nbAnnees: 10 }, () => ({ options: ["y"] }));
    expect(new Set(etat.cartesJouees).size).toBe(etat.cartesJouees.length);
    for (let i = 1; i < etat.ministeres.length; i++) expect(etat.ministeres[i]).not.toBe(etat.ministeres[i - 1]);
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

  it("égalité au premier tour : les ex aequo sont identifiés pour le second tour", () => {
    const r = resoudreVote(unique, ["x", "y", "x", "y", "z"], mulberry32(5));
    expect(r.egalite).toBe(true);
    expect([...r.exAequo].sort()).toEqual(["x", "y"]);
  });

  it("second tour : la majorité départage les ex aequo, sinon le sort", () => {
    const premier = resoudreVote(unique, ["x", "y", "x", "y", "z"], mulberry32(5));
    const r = resoudreSecondTour(premier, ["y", "y", "x", "z"], mulberry32(1));
    expect(r.options).toEqual(["y"]);
    expect(r.egalite).toBe(false);
    expect(r.secondTour?.decompte).toEqual({ x: 1, y: 2 });
    const gagnants = new Set<string>();
    for (let s = 0; s < 40; s++) gagnants.add(resoudreSecondTour(premier, ["x", "y"], mulberry32(s)).options[0]);
    expect(gagnants).toEqual(new Set(["x", "y"]));
  });

  it("cumulable : les deux options les plus votées ; le second tour départage la deuxième place", () => {
    expect(resoudreVote(cumulable, ["x", "x", "x", "z", "z", "y"], mulberry32(1)).options.sort()).toEqual(["x", "z"]);
    const premier = resoudreVote(cumulable, ["x", "x", "y", "z"], mulberry32(2));
    expect(premier.egalite).toBe(true);
    expect(resoudreSecondTour(premier, ["z", "z", "y"], mulberry32(1)).options).toEqual(["x", "z"]);
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
});

describe("trajectoire sans intervention", () => {
  it("rejoue la même graine sans décision, de façon reproductible", () => {
    const c = chargerContenu();
    const a = trajectoireSansIntervention(c, 77, 5);
    const b = trajectoireSansIntervention(c, 77, 5);
    expect(a.decisions).toHaveLength(0);
    expect(a.cartesJouees).toHaveLength(0);
    expect(a.historique).toHaveLength(5);
    expect(a.historique.map((h) => h.jauges)).toEqual(b.historique.map((h) => h.jauges));
  });

  it("voit passer les mêmes événements aléatoires qu'une partie jouée", () => {
    const c = contenuTest({ evenements: [breve("e1"), breve("e2"), breve("e3")], regles: { evenements: { maxParAn: 2, probaParMois: 0.2, delaiAvantRepetition: 0, maxOccurrences: 99, delaiEntreAlertesMemeJauge: 0 } } });
    const liste = (e: EtatPartie) => e.evenements.map((x) => `${x.annee}-${x.mois}:${x.id}`);
    const sans = trajectoireSansIntervention(c, 5, 5);
    const jouee = jouerPartie(c, { graine: 5, nbAnnees: 5 }, () => ({ options: ["z"] }));
    expect(liste(sans).length).toBeGreaterThan(2);
    expect(liste(jouee)).toEqual(liste(sans));
  });

  it("le bilan final compare le mandat, la trajectoire sans intervention et l'héritage", () => {
    const c = chargerContenu();
    const etat = jouerPartie(c, { graine: 12, nbAnnees: 5 }, (carte) => ({ options: [carte.options[1].id], valeur: carte.options[1].valeur }));
    const b = bilanFinal(c, etat);
    expect(b.anneeFin).toBe(2031);
    expect(b.heritage.annee).toBe(2041);
    expect(Object.keys(b.jaugesSansIntervention)).toHaveLength(7);
    expect(b.decisionsMarquantes.length).toBeLessThanOrEqual(5);
    expect(b.enseignements.length).toBeGreaterThanOrEqual(2);
    expect(b.enseignements.length).toBeLessThanOrEqual(4);
  });
});

describe("simulation", () => {
  it("simulate est reproductible et compte trois décisions par an", () => {
    const c = chargerContenu();
    const r1 = simulate(c, 20, 1, undefined, "aleatoire", 5);
    const r2 = simulate(c, 20, 1, undefined, "aleatoire", 5);
    expect(r1.jaugesFin).toEqual(r2.jaugesFin);
    const tirees = Object.values(r1.cartes).reduce((s, x) => s + x, 0);
    expect(tirees).toBe(20 * 5 * 3);
    expect(r1.evenementsParPartie).toBeLessThanOrEqual(10);
    expect(r1.synthese.length).toBeGreaterThan(20);
  });

  it("une carte désactivée (poids 0) n'est jamais tirée en simulation", () => {
    const c = chargerContenu();
    const r = simulate(c, 30, 4, { cartes: { "retraites-age": 0 } }, "aleatoire", 10);
    expect(r.cartes["retraites-age"]).toBe(0);
  });
});

describe("validation du contenu", () => {
  it("le vrai contenu est valide et assez fourni", () => {
    const c = chargerContenu();
    expect(c.cartes.length).toBeGreaterThanOrEqual(36);
    expect(c.evenements.filter((e) => e.gravite === "breve" && !e.alerte && e.poids > 0).length).toBeGreaterThanOrEqual(16);
    expect(c.evenements.filter((e) => e.gravite === "crise").length).toBeGreaterThanOrEqual(3);
    expect(c.evenements.filter((e) => e.declenchePar.length).length).toBeGreaterThanOrEqual(30);
    expect(c.promesses.length).toBeGreaterThanOrEqual(c.regles.campagne.nbPromesses);
    for (const carte of c.cartes) {
      expect(carte.flash).toBeTruthy();
      for (const o of carte.options) for (const e of o.effets) expect(e.hypothese.length).toBeGreaterThan(10);
    }
    const parMinistere = new Map<string, number>();
    for (const carte of c.cartes) parMinistere.set(carte.ministere, (parMinistere.get(carte.ministere) ?? 0) + 1);
    expect(parMinistere.size).toBe(12);
    for (const n of parMinistere.values()) expect(n).toBeGreaterThanOrEqual(2);
    for (const i of Object.values(c.indicateurs)) expect(i.source).toBeTruthy();
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

  it("une suite qui pointe vers une carte inconnue est signalée", () => {
    expect(() => contenuTest({ evenements: [breve("e", { declenchePar: [{ carte: "absente", chance: 0.5 }] })] })).toThrow(/evenements\.json › « e » › declenchePar : carte inconnue « absente »/);
  });

  it("une crise sans réponses est refusée", () => {
    expect(() => contenuTest({ evenements: [crise("k", { reponses: [] })] })).toThrow(/une crise propose 2 à 4 réponses/);
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
