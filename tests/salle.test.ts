import { beforeEach, describe, expect, it, vi } from "vitest";
import { chargerContenu } from "@/content";
import { actionHote, appliquerEcheances, creerSalle, lireSalle, nbVotes, rejoindre, voter, type Salle } from "@/lib/salle";
import { definirStockage, StockageMemoire, versObjet } from "@/lib/stockage";
import { construireVue } from "@/lib/vue";

beforeEach(() => definirStockage(new StockageMemoire()));

/** Fait passer la campagne en promettant tout, jusqu'à l'investiture. */
async function faireCampagne(code: string, hote: string, jeton: string) {
  for (let i = 0; i < 20; i++) {
    const s = (await lireSalle(code))!;
    if (s.phase !== "campagne") return s;
    await voter(code, jeton, "promettre");
    await actionHote(code, hote, { action: "clore" });
    await actionHote(code, hote, { action: "suivant" });
  }
  return (await lireSalle(code))!;
}

/** Choix valide pour l'étape en cours. */
function choixPossibles(s: Salle) {
  const carte = construireVue(s, [], 0).etape!.carte!;
  return carte.type === "curseur" ? carte.curseur!.valeurs : carte.options.map((o) => o.id);
}

describe("salle de jeu", () => {
  it("déroulé : rejoindre, campagne, investiture, vote clos à l'échéance côté serveur", async () => {
    const s = await creerSalle();
    expect(s.code).toMatch(/^[A-Z0-9]{4}$/);
    const a = await rejoindre(s.code, "Léa");
    const b = await rejoindre(s.code, "léa"); // pseudo en double → suffixe
    expect(b.joueur.pseudo).toBe("léa 2");
    expect((await rejoindre(s.code, "", a.jeton)).jeton).toBe(a.jeton); // reconnexion

    await expect(actionHote(s.code, "mauvais-jeton", { action: "demarrer" })).rejects.toThrow(/écran hôte/);
    await actionHote(s.code, s.hote, { action: "demarrer", nbAnnees: 5 });
    let salle = (await lireSalle(s.code))!;
    expect(salle.phase).toBe("campagne");
    expect(salle.campagne!.promesses).toHaveLength(chargerContenu().regles.campagne.nbPromesses);

    // Campagne : une promesse votée, puis les autres.
    await expect(voter(s.code, a.jeton, "peut-être")).rejects.toThrow(/inconnu/);
    await voter(s.code, a.jeton, "promettre");
    await voter(s.code, b.jeton, "promettre");
    expect(await nbVotes((await lireSalle(s.code))!)).toBe(2);
    await actionHote(s.code, s.hote, { action: "clore" });
    salle = (await lireSalle(s.code))!;
    expect(salle.campagne!.faites).toEqual([salle.campagne!.promesses[0]]);
    expect(construireVue(salle, [], 0).campagne!.popularite).toBeGreaterThan(44);
    await actionHote(s.code, s.hote, { action: "suivant" });
    salle = await faireCampagne(s.code, s.hote, a.jeton);
    expect(salle.phase).toBe("investiture");

    // Investiture puis premier arrêt du calendrier.
    await actionHote(s.code, s.hote, { action: "suivant" });
    salle = (await lireSalle(s.code))!;
    expect(salle.partie!.promesses.length).toBe(salle.campagne!.faites.length);
    expect(["annonce"]).toContain(salle.phase);
    // On passe les brèves éventuelles jusqu'à une étape à voter.
    for (let i = 0; i < 10 && !construireVue(salle, [], 0).etape?.carte; i++) {
      await actionHote(s.code, s.hote, { action: "suivant" });
      salle = (await lireSalle(s.code))!;
    }
    await expect(voter(s.code, a.jeton, "x")).rejects.toThrow(/clos/);

    await actionHote(s.code, s.hote, { action: "ouvrirVote" });
    salle = (await lireSalle(s.code))!;
    const choix = choixPossibles(salle);
    await voter(s.code, a.jeton, choix[0]);
    await voter(s.code, a.jeton, choix[0]); // modifiable : toujours un seul vote
    await voter(s.code, b.jeton, choix[0]);
    expect(await nbVotes(salle)).toBe(2);
    await expect(voter(s.code, "inconnu", choix[0])).rejects.toThrow(/inconnu/);

    // L'horloge d'un client ne décide de rien : seule l'échéance stockée compte.
    vi.useFakeTimers({ now: salle.echeance! + 1000 });
    salle = await appliquerEcheances((await lireSalle(s.code))!);
    vi.useRealTimers();
    expect(salle.phase).toBe("resultat");
    expect(salle.resultat?.decision.vote?.nbVotes).toBe(2);
    await expect(voter(s.code, a.jeton, choix[0])).rejects.toThrow(/clos/);

    // La vue publique ne révèle jamais qui a voté quoi.
    const vue = JSON.stringify(construireVue(salle, [a.joueur, b.joueur], 2));
    expect(vue).not.toContain(a.jeton);
    expect(vue).not.toContain(b.jeton);
  });

  it("égalité : un second tour départage les ex aequo", async () => {
    const s = await creerSalle();
    const a = await rejoindre(s.code, "Ana");
    const b = await rejoindre(s.code, "Bob");
    await actionHote(s.code, s.hote, { action: "demarrer" });
    await faireCampagne(s.code, s.hote, a.jeton);
    await actionHote(s.code, s.hote, { action: "suivant" });
    // On cherche une étape à choix unique pour forcer une égalité 1 contre 1.
    let salle = (await lireSalle(s.code))!;
    for (let i = 0; i < 40; i++) {
      const carte = construireVue(salle, [], 0).etape?.carte;
      if (salle.phase === "annonce" && carte && carte.type === "unique") break;
      if (salle.phase === "annonce" && carte) {
        await actionHote(s.code, s.hote, { action: "ouvrirVote" });
        await actionHote(s.code, s.hote, { action: "clore" });
        salle = (await lireSalle(s.code))!;
        if (salle.phase === "secondTour") await actionHote(s.code, s.hote, { action: "clore" });
      }
      await actionHote(s.code, s.hote, { action: "suivant" });
      salle = (await lireSalle(s.code))!;
    }
    await actionHote(s.code, s.hote, { action: "ouvrirVote" });
    salle = (await lireSalle(s.code))!;
    const [o1, o2] = choixPossibles(salle) as string[];
    await voter(s.code, a.jeton, o1);
    await voter(s.code, b.jeton, o2);
    await actionHote(s.code, s.hote, { action: "clore" });
    salle = (await lireSalle(s.code))!;
    expect(salle.phase).toBe("secondTour");
    expect(construireVue(salle, [], 0).secondTour!.options.map((o) => o.id).sort()).toEqual([o1, o2].sort());
    await expect(voter(s.code, a.jeton, "absente")).rejects.toThrow(/second tour/);
    await voter(s.code, a.jeton, o2);
    await voter(s.code, b.jeton, o2);
    await actionHote(s.code, s.hote, { action: "clore" });
    salle = (await lireSalle(s.code))!;
    expect(salle.phase).toBe("resultat");
    expect(salle.resultat!.decision.options).toEqual([o2]);
    expect(construireVue(salle, [], 0).resultat!.secondTour?.nbVotes).toBe(2);
  });

  it("un mandat complet : bilans d'année puis bilan final", async () => {
    const s = await creerSalle();
    const a = await rejoindre(s.code, "Ana");
    await actionHote(s.code, s.hote, { action: "demarrer" });
    await faireCampagne(s.code, s.hote, a.jeton);
    await actionHote(s.code, s.hote, { action: "suivant" });
    let salle = (await lireSalle(s.code))!;
    const bilans: number[] = [];
    for (let i = 0; i < 200 && salle.phase !== "fin"; i++) {
      if (salle.phase === "annonce" && construireVue(salle, [], 0).etape?.carte) {
        await actionHote(s.code, s.hote, { action: "ouvrirVote" });
        const choix = choixPossibles((await lireSalle(s.code))!);
        await voter(s.code, a.jeton, choix[0]);
        await actionHote(s.code, s.hote, { action: "clore" });
      } else {
        if (salle.phase === "bilanAnnee") bilans.push(construireVue(salle, [], 0).bilanAnnee!.annee);
        await actionHote(s.code, s.hote, { action: "suivant" });
      }
      salle = (await lireSalle(s.code))!;
    }
    expect(salle.phase).toBe("fin");
    expect(bilans).toEqual([2027, 2028, 2029, 2030, 2031]);
    const vue = construireVue(salle, [], 0);
    expect(vue.bilan!.anneeFin).toBe(2031);
    expect(vue.bilan!.promesses.length).toBeGreaterThan(0);
    expect(salle.partie!.decisions.filter((d) => !d.crise)).toHaveLength(15);
  });

  it("le flash info tombe à mi-vote et rallonge le minuteur", async () => {
    const s = await creerSalle();
    const a = await rejoindre(s.code, "Ana");
    await actionHote(s.code, s.hote, { action: "demarrer" });
    await faireCampagne(s.code, s.hote, a.jeton);
    await actionHote(s.code, s.hote, { action: "suivant" });
    let salle = (await lireSalle(s.code))!;
    // On avance jusqu'à une décision dont la carte porte un flash info.
    const aFlash = (x: Salle) => x.phase === "annonce" && x.partie!.etape?.type === "decision" && !!chargerContenu().cartes.find((c) => c.id === x.partie!.etape!.carte)?.flash;
    for (let i = 0; i < 200 && !aFlash(salle); i++) {
      if (salle.phase === "annonce" && construireVue(salle, [], 0).etape?.carte) {
        await actionHote(s.code, s.hote, { action: "ouvrirVote" });
        await actionHote(s.code, s.hote, { action: "clore" });
        salle = (await lireSalle(s.code))!;
        if (salle.phase === "secondTour") await actionHote(s.code, s.hote, { action: "clore" });
      }
      await actionHote(s.code, s.hote, { action: "suivant" });
      salle = (await lireSalle(s.code))!;
    }
    expect(aFlash(salle)).toBe(true);
    await actionHote(s.code, s.hote, { action: "ouvrirVote" });
    salle = (await lireSalle(s.code))!;
    expect(salle.flashA).toBeDefined();
    expect(construireVue(salle, [], 0).flash).toBeUndefined();
    const avant = construireVue(salle, [], 0).echeance!;
    vi.useFakeTimers({ now: salle.flashA! + 10 });
    const apres = construireVue(salle, [], 0);
    vi.useRealTimers();
    expect(apres.flash).toBeTruthy();
    expect(apres.echeance! - avant).toBe(15000);
  });

  it("élection : battus sans promesse, on repart en campagne avec d'autres promesses", async () => {
    const s = await creerSalle();
    const a = await rejoindre(s.code, "Ana");
    await actionHote(s.code, s.hote, { action: "demarrer" });
    let salle = (await lireSalle(s.code))!;
    const premieres = [...salle.campagne!.promesses];
    while (salle.phase === "campagne") {
      await voter(s.code, a.jeton, "refuser");
      await actionHote(s.code, s.hote, { action: "clore" });
      await actionHote(s.code, s.hote, { action: "suivant" });
      salle = (await lireSalle(s.code))!;
    }
    expect(salle.phase).toBe("investiture");
    expect(salle.campagne!.election!.elu).toBe(false);
    expect(construireVue(salle, [], 0).campagne!.election!.score).toBeLessThan(50);
    await actionHote(s.code, s.hote, { action: "suivant" });
    salle = (await lireSalle(s.code))!;
    expect(salle.phase).toBe("campagne");
    expect(salle.campagne!.tentative).toBe(1);
    expect(salle.campagne!.promesses.some((id) => premieres.includes(id))).toBe(false);
    // Les votes de la première campagne ne comptent pas pour la nouvelle.
    expect(await nbVotes(salle)).toBe(0);
    salle = await faireCampagne(s.code, s.hote, a.jeton);
    expect(salle.campagne!.election!.elu).toBe(true);
    await actionHote(s.code, s.hote, { action: "suivant" });
    expect((await lireSalle(s.code))!.partie).toBeDefined();
  });

  it("une salle fige les poids au moment de sa création", async () => {
    const s = await creerSalle();
    expect(s.poids.cartes["retraites-age"]).toBe(1);
    expect(Object.keys(s.poids.cartes).length).toBeGreaterThanOrEqual(36);
  });

  it("HGETALL d'Upstash (tableau à plat) est converti en objet", () => {
    expect(versObjet(["a", '{"x":1}', "b", "2"])).toEqual({ a: '{"x":1}', b: "2" });
    expect(versObjet({ a: { x: 1 }, b: "s" })).toEqual({ a: '{"x":1}', b: "s" });
    expect(versObjet(null)).toEqual({});
    expect(versObjet([])).toEqual({});
  });
});
