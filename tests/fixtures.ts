/** Petit contenu synthétique pour tester le moteur indépendamment du vrai contenu. */
import { JAUGES, validerContenu, type Contenu } from "../engine";

const src = { source: "test", url: "https://example.org", provisoire: false, annee: 2025, unite: "u" };

export function contenuTest(over: { cartes?: unknown[]; evenements?: unknown[]; resonances?: unknown[]; imprevus?: unknown[]; regles?: Record<string, unknown> } = {}): Contenu {
  // 5 indicateurs a..e, tous normalisés 0 → 0 et 100 → 100, partagés par les 8 jauges.
  const ids = ["a", "b", "c", "d", "e"];
  const indicateurs = Object.fromEntries(ids.map((id) => [id, { nom: `Indicateur ${id}`, valeur: 50, ...src }]));
  const modele = Object.fromEntries(ids.map((id) => [id, { normalisation: { type: "lineaire", zero: 0, cent: 100 }, min: 0, max: 100 }]));
  const jauges = Object.fromEntries(JAUGES.map((j) => [j, { nom: j, nomCourt: j, indicateurs: ids.map((id) => ({ id, poids: 1 })) }]));
  const regles = {
    anneeDepart: 2027,
    toursPossibles: [30, 20],
    seuilAlerte: 35,
    dureeVoteSecondes: 60,
    maxJoueurs: 30,
    probaEvenement: 1,
    evenements: { delaiAvantRepetition: 0, maxOccurrences: 99, delaiEntreAlertesMemeJauge: 0 },
    impacts: { horizon: 4, seuilNotable: 0.5, seuilFort: 3 },
    estompeDureeParDefaut: 4,
    ...(over.regles ?? {}),
  };
  return validerContenu({
    indicateurs: { fichier: "indicateurs.json", data: indicateurs },
    modele: { fichier: "modele.json", data: modele },
    jauges: { fichier: "jauges.json", data: jauges },
    regles: { fichier: "regles.json", data: regles },
    cartes: [{ fichier: "cartes.json", data: over.cartes ?? cartesTest() }],
    evenements: { fichier: "evenements.json", data: over.evenements ?? [] },
    resonances: { fichier: "resonances.json", data: over.resonances ?? [] },
    imprevus: { fichier: "imprevus.json", data: over.imprevus ?? [] },
  });
}

const H = "hypothèse de test suffisamment longue";

export function carteTest(id: string, theme = "fiscalite", poids = 1, type: "unique" | "cumulable" = "unique") {
  return {
    id,
    theme,
    type,
    titre: `Carte ${id}`,
    contexte: "Contexte de test pour la carte.",
    poids,
    options: [
      { id: "x", titre: "Option X", explication: "Explication de l'option X.", effets: [{ cible: "a", valeur: 10, type: "durable", hypothese: H }] },
      { id: "y", titre: "Option Y", explication: "Explication de l'option Y.", effets: [{ cible: "b", valeur: -10, type: "durable", hypothese: H }] },
      { id: "z", titre: "Option Z", explication: "Explication de l'option Z.", effets: [{ cible: "c", valeur: 5, type: "immediat", hypothese: H }] },
    ],
    notePedagogique: "Note pédagogique de test.",
  };
}

export function carteCurseur() {
  return {
    id: "curseur",
    theme: "retraites",
    type: "curseur",
    titre: "Carte curseur",
    contexte: "Contexte de test pour le curseur.",
    curseur: { min: 62, max: 66, pas: 1, unite: "ans" },
    options: [
      { id: "62", valeur: 62, titre: "62 ans", explication: "Explication 62 ans.", effets: [{ cible: "a", valeur: -4, type: "durable", hypothese: H }] },
      { id: "64", valeur: 64, titre: "64 ans", explication: "Explication 64 ans.", effets: [{ cible: "a", valeur: 0, type: "durable", hypothese: H }] },
      { id: "66", valeur: 66, titre: "66 ans", explication: "Explication 66 ans.", effets: [{ cible: "a", valeur: 4, type: "durable", hypothese: H }] },
    ],
    notePedagogique: "Note pédagogique de test.",
  };
}

export function cartesTest() {
  const themes = ["fiscalite", "sante", "energie", "logement", "education"];
  return Array.from({ length: 40 }, (_, i) => carteTest(`c${i}`, themes[i % themes.length]));
}

export { H };
