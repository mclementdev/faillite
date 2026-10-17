import { beforeEach, describe, expect, it, vi } from "vitest";
import { actionHote, creerSalle, lireSalle, nbVotes, rejoindre, voter, appliquerEcheances } from "@/lib/salle";
import { definirStockage, StockageMemoire, versObjet } from "@/lib/stockage";
import { construireVue } from "@/lib/vue";

beforeEach(() => definirStockage(new StockageMemoire()));

describe("salle de jeu", () => {
  it("déroulé : rejoindre, démarrer, voter, clôture à l'échéance côté serveur", async () => {
    const s = await creerSalle();
    expect(s.code).toMatch(/^[A-Z0-9]{4}$/);
    const a = await rejoindre(s.code, "Léa");
    const b = await rejoindre(s.code, "léa"); // pseudo en double → suffixe
    expect(b.joueur.pseudo).toBe("léa 2");
    // Reconnexion avec le jeton : même participant.
    expect((await rejoindre(s.code, "", a.jeton)).jeton).toBe(a.jeton);

    await expect(actionHote(s.code, "mauvais-jeton", { action: "demarrer" })).rejects.toThrow(/écran hôte/);
    await actionHote(s.code, s.hote, { action: "demarrer", nbTours: 20 });
    let salle = (await lireSalle(s.code))!;
    // Premier vote : la présidence du sénat.
    expect(salle.phase).toBe("election");
    expect(salle.nbTours).toBe(20);
    await expect(voter(s.code, a.jeton, "Personne")).rejects.toThrow(/inconnu/);
    await voter(s.code, a.jeton, "léa 2");
    await voter(s.code, b.jeton, "léa 2");
    expect(await nbVotes((await lireSalle(s.code))!)).toBe(2);
    await actionHote(s.code, s.hote, { action: "clore" });
    salle = (await lireSalle(s.code))!;
    expect(salle.phase).toBe("presidence");
    expect(salle.president).toEqual({ jeton: b.jeton, pseudo: "léa 2" });
    const vueP = construireVue(salle, [a.joueur, b.joueur], 0);
    expect(vueP.presidence?.pseudo).toBe("léa 2");
    expect(JSON.stringify(vueP)).not.toContain(b.jeton);
    await actionHote(s.code, s.hote, { action: "suivant" });
    salle = (await lireSalle(s.code))!;
    expect(salle.phase).toBe("annonce");
    await expect(voter(s.code, a.jeton, "x")).rejects.toThrow(/clos/);

    await actionHote(s.code, s.hote, { action: "ouvrirVote" });
    salle = (await lireSalle(s.code))!;
    const carte = construireVue(salle, [], 0).carte!;
    const choix = carte.type === "curseur" ? carte.curseur!.valeurs[0] : carte.options[0].id;
    // Égalité 1 contre 1 : la voix de la présidence (b) compte double.
    const autre = carte.type === "curseur" ? carte.curseur!.valeurs[carte.curseur!.valeurs.length - 1] : carte.options[1].id;
    await voter(s.code, a.jeton, choix);
    await voter(s.code, a.jeton, autre); // modifiable : toujours un seul vote
    await voter(s.code, b.jeton, choix);
    expect(await nbVotes(salle)).toBe(2);
    await expect(voter(s.code, "inconnu", choix)).rejects.toThrow(/inconnu/);

    // L'horloge d'un client ne décide de rien : seule l'échéance stockée compte.
    vi.useFakeTimers({ now: Date.now() + (salle.dureeVote + 1) * 1000 });
    salle = await appliquerEcheances((await lireSalle(s.code))!);
    vi.useRealTimers();
    expect(salle.phase).toBe("resultat");
    expect(salle.resultat?.decision.vote?.nbVotes).toBe(2);
    expect(salle.resultat?.decision.vote?.departagePresident).toBe(true);
    expect(salle.resultat?.decision.vote?.valeur ?? salle.resultat?.decision.options[0]).toBe(choix);
    await expect(voter(s.code, a.jeton, choix)).rejects.toThrow(/clos/);

    // La vue publique ne révèle jamais qui a voté quoi.
    const vue = JSON.stringify(construireVue(salle, [a.joueur, b.joueur], 2));
    expect(vue).not.toContain(a.jeton);
    expect(vue).not.toContain(b.jeton);

    await actionHote(s.code, s.hote, { action: "suivant" });
    expect((await lireSalle(s.code))!.partie!.annee).toBe(2028);
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
