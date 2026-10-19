"use client";
/** Écran du participant (téléphone, portrait). */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { appel, ecrireLocal, lireLocal, useSalle } from "@/lib/client";
import { nomMois } from "@/lib/libelles";
import type { VueCarte, VueEvenement, VueOption, VuePublique } from "@/lib/types";
import {
  BadgeMinistere,
  EtiquetteOutil,
  formatMinuteur,
  formatNombre,
  IconeAlerte,
  IconeCadenas,
  IconeCoche,
  IconeElysee,
  IconeHorloge,
  JaugePopularite,
  libelleType,
  Logo,
  MentionBudget,
  MentionDuree,
  Pastilles,
  Puce,
  useRestant,
} from "./ui";

type Vote = string | number;

export default function EcranJoueur({ code }: { code: string }) {
  const { vue, erreur, decalage } = useSalle(code, 1000);
  const cleJeton = `faillite:joueur:${code}`;
  const [jeton, setJeton] = useState<string | null>(null);
  const [pseudo, setPseudo] = useState<string>("");
  const [pret, setPret] = useState(false);
  /** vote enregistré côté serveur pour le scrutin courant */
  const [monVote, setMonVote] = useState<{ scrutin: string; choix: Vote } | null>(null);

  // Reconnexion : jeton conservé dans le navigateur.
  useEffect(() => {
    const j = lireLocal(cleJeton);
    if (!j) {
      setPret(true);
      return;
    }
    appel<{ pseudo: string; vote: Vote | null; scrutin: string | null }>(`/api/salles/${code}/moi`, undefined, { "x-jeton": j })
      .then((r) => {
        setJeton(j);
        setPseudo(r.pseudo);
        if (r.vote !== null && r.scrutin) setMonVote({ scrutin: r.scrutin, choix: r.vote });
      })
      .catch(() => {})
      .finally(() => setPret(true));
  }, [code, cleJeton]);

  if (!pret || (!vue && !erreur)) return <Chargement />;
  if (!vue) return <Message titre="Salle introuvable" texte={erreur ?? "Vérifie le code affiché sur le grand écran."} />;
  if (!jeton) return <Rejoindre code={code} onRejoint={(j, p) => { ecrireLocal(cleJeton, j); setJeton(j); setPseudo(p); }} />;

  const vote = monVote && monVote.scrutin === vue.scrutin ? monVote.choix : null;
  const enregistrer = (choix: Vote) => vue.scrutin && setMonVote({ scrutin: vue.scrutin, choix });
  const carte = vue.etape?.carte;

  return (
    <div className="mobile">
      <EnTete vue={vue} decalage={decalage} />
      {vue.phase === "accueil" && <Attente pseudo={pseudo} vue={vue} />}
      {vue.phase === "campagne" && <CampagneMobile code={code} jeton={jeton} vue={vue} vote={vote} enregistrer={enregistrer} />}
      {vue.phase === "investiture" && <InvestitureMobile vue={vue} />}
      {vue.phase === "annonce" && vue.etape?.evenement && <EvenementMobile evt={vue.etape.evenement} mois={vue.etape.mois} annee={vue.etape.annee} />}
      {vue.phase === "annonce" && carte && <Lecture carte={carte} />}
      {vue.phase === "annonce" && !carte && !vue.etape?.evenement && <Message titre="Regardez le grand écran" texte="Les mois passent…" compact />}
      {(vue.phase === "vote" || vue.phase === "secondTour") && carte && <Voter code={code} jeton={jeton} vue={vue} carte={carte} vote={vote} enregistrer={enregistrer} />}
      {vue.phase === "resultat" && <ResultatMobile vue={vue} />}
      {vue.phase === "bilanAnnee" && <BilanAnneeMobile vue={vue} />}
      {vue.phase === "fin" && <FinMobile vue={vue} />}
    </div>
  );
}

function Chargement() {
  return (
    <div className="mobile" style={{ justifyContent: "center", alignItems: "center" }}>
      <Logo taille={36} />
    </div>
  );
}

function Message({ titre, texte, compact }: { titre: string; texte: string; compact?: boolean }) {
  const contenu = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center", padding: "40px 10px" }}>
      <span className="titre" style={{ fontWeight: 800, fontSize: 26 }}>{titre}</span>
      <span style={{ fontSize: 16, color: "var(--texte-2)", lineHeight: 1.4 }}>{texte}</span>
    </div>
  );
  if (compact) return contenu;
  return (
    <div className="mobile" style={{ justifyContent: "center" }}>
      <Logo taille={34} />
      {contenu}
    </div>
  );
}

const BLOC = { background: "var(--surface)", border: "2px solid var(--trait)", borderRadius: 20 } as const;

function EnTete({ vue, decalage }: { vue: VuePublique; decalage: number }) {
  const restant = useRestant(vue.echeance, decalage);
  if (vue.phase === "accueil") return <Logo taille={30} />;
  const enVote = vue.phase === "vote" || vue.phase === "secondTour" || (vue.phase === "campagne" && vue.campagne?.etat === "vote");
  const titre =
    vue.phase === "campagne" || vue.phase === "investiture" ? (
      <span className="titre" style={{ fontWeight: 800, fontSize: 20 }}>Campagne</span>
    ) : (
      <span style={{ fontSize: 16, fontWeight: 700, color: "var(--texte-2)" }}>
        <span className="titre" style={{ fontWeight: 800, fontSize: 21, color: "var(--texte-1)", textTransform: "capitalize" }}>{vue.mois ? `${nomMois(vue.mois)} ` : ""}{vue.annee}</span>
      </span>
    );
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      {titre}
      {enVote ? (
        <span className="titre tabnum" role="timer" aria-live="off" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: restant <= 10 ? "var(--n1)" : "var(--soleil)", borderRadius: 999, padding: "6px 14px 6px 10px", fontWeight: 800, fontSize: 20 }}>
          <IconeHorloge taille={20} /> {formatMinuteur(restant)}
        </span>
      ) : vue.phase !== "campagne" && vue.phase !== "investiture" && vue.phase !== "fin" ? (
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--texte-2)", ...BLOC, borderRadius: 999, padding: "5px 12px" }}>
          Popularité {vue.popularite.valeur} %
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Rejoindre({ code, onRejoint }: { code: string; onRejoint: (jeton: string, pseudo: string) => void }) {
  const [pseudo, setPseudo] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const valider = async (e: FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await appel<{ jeton: string; pseudo: string }>(`/api/salles/${code}/rejoindre`, { pseudo });
      onRejoint(r.jeton, r.pseudo);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <form className="mobile" onSubmit={valider} style={{ paddingTop: 48, gap: 26 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Logo taille={38} />
        <span style={{ fontSize: 17, color: "var(--texte-2)" }}>Faites campagne, gouvernez, et découvrez l&apos;impact réel de vos décisions.</span>
      </div>
      <div style={{ ...BLOC, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px" }}>
        <span style={{ fontSize: 16, color: "var(--texte-3)" }}>Salle</span>
        <span className="titre" style={{ fontWeight: 800, fontSize: 30, letterSpacing: 4, color: "var(--bleu)" }}>{code}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label htmlFor="pseudo" style={{ fontSize: 20, fontWeight: 700 }}>Ton pseudo</label>
        <input id="pseudo" type="text" value={pseudo} onChange={(e) => setPseudo(e.target.value)} maxLength={16} autoComplete="nickname" required autoFocus
          style={{ height: 60, background: "var(--surface)", color: "var(--texte-1)", border: "3px solid var(--soleil)", borderRadius: 16, padding: "0 18px", font: "500 22px var(--texte)", outline: "none" }} />
        <span style={{ fontSize: 15, color: "var(--texte-3)" }}>Visible par les autres sur le grand écran. Ton vote, lui, reste secret.</span>
        {erreur && <span role="alert" style={{ fontSize: 15, color: "var(--n2-texte)" }}>{erreur}</span>}
      </div>
      <div style={{ flex: 1 }} />
      <button type="submit" className="btn-principal" disabled={envoi || !pseudo.trim()} style={{ height: 64, fontSize: 24 }}>Rejoindre l&apos;équipe</button>
      <span style={{ textAlign: "center", fontSize: 15, color: "var(--texte-3)" }}>Pas de compte, pas d&apos;application.</span>
    </form>
  );
}

function Attente({ pseudo, vue }: { pseudo: string; vue: VuePublique }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
      <div role="status" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", background: "var(--ok-fond)", border: "2px solid var(--p2)", borderRadius: 22, padding: "24px 18px" }}>
        <IconeCoche taille={40} couleur="#17784a" />
        <span className="titre" style={{ fontWeight: 800, fontSize: 28 }}>Bienvenue, {pseudo}</span>
        <span style={{ fontSize: 16, color: "var(--texte-2)" }}>Tu fais partie de l&apos;équipe. La campagne commence dès que l&apos;hôte la lance.</span>
      </div>
      <div style={{ ...BLOC, display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
        <span className="titre tabnum" style={{ fontWeight: 800, fontSize: 28 }}>{vue.joueurs.length}</span>
        <span style={{ fontSize: 15, color: "var(--texte-2)" }}>membre{vue.joueurs.length > 1 ? "s" : ""} dans l&apos;équipe</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.3, color: "var(--texte-3)" }}>EN ATTENDANT : COMMENT ÇA MARCHE</span>
        {[
          ["1", "D'abord la campagne : promettre ou pas ? Les promesses rendent populaire… jusqu'au jour où il faut les tenir."],
          ["2", "Puis le mandat : les mois défilent, trois décisions par an et parfois une crise. Tu votes ici avant la fin du minuteur."],
          ["3", <>Les pastilles montrent les jauges touchées : <b className="fleche-p2">▲</b> hausse, <b className="fleche-n2">▼</b> baisse. Les chiffres exacts arrivent après le vote.</>],
        ].map(([n, t]) => (
          <div key={n as string} style={{ ...BLOC, display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", borderRadius: 14 }}>
            <span className="titre" style={{ width: 28, height: 28, flex: "none", borderRadius: "50%", background: "var(--soleil)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16 }}>{n}</span>
            <span style={{ fontSize: 15, lineHeight: 1.4, color: "var(--texte-2)" }}>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Campagne                                                            */

function CampagneMobile({ code, jeton, vue, vote, enregistrer }: { code: string; jeton: string; vue: VuePublique; vote: Vote | null; enregistrer: (v: Vote) => void }) {
  const c = vue.campagne!;
  const [erreur, setErreur] = useState<string | null>(null);
  const choisir = async (choix: "promettre" | "refuser") => {
    setErreur(null);
    try {
      const r = await appel<{ choix: Vote }>(`/api/salles/${code}/vote`, { jeton, choix });
      enregistrer(r.choix);
    } catch (e) {
      setErreur((e as Error).message);
    }
  };
  return (
    <>
      <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.3, color: "var(--accent-texte)" }}>PROMESSE {c.index + 1} SUR {c.total}</span>
      <div key={c.index} style={{ ...BLOC, padding: "22px 20px", borderRadius: 24, animation: "apparition .4s ease" }}>
        <span className="titre" style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.15 }}>« {c.promesse.texte} »</span>
      </div>
      {c.etat === "vote" ? (
        <>
          <span style={{ fontSize: 15, color: "var(--texte-2)" }}>Votre équipe en fait-elle une promesse de campagne ?</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }} role="radiogroup" aria-label="Promettre ?">
            {(["promettre", "refuser"] as const).map((ch) => (
              <button key={ch} type="button" role="radio" aria-checked={vote === ch} className="option-mobile" onClick={() => choisir(ch)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 64 }}>
                <span className="titre" style={{ fontSize: 22, fontWeight: 800 }}>{ch === "promettre" ? "On le promet !" : "Trop risqué"}</span>
                {vote === ch && <IconeCoche couleur="#8a5d00" />}
              </button>
            ))}
          </div>
          {vote !== null && <span role="status" style={{ fontSize: 14, color: "var(--p2-texte)" }}>Vote enregistré. Tu peux encore changer d&apos;avis.</span>}
          {erreur && <span role="alert" style={{ fontSize: 14, color: "var(--n2-texte)" }}>{erreur}</span>}
        </>
      ) : (
        c.dernier && (
          <div role="status" style={{ ...BLOC, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="titre" style={{ fontSize: 22, fontWeight: 800, color: c.dernier.faite ? "var(--accent-texte)" : "var(--texte-2)" }}>{c.dernier.faite ? "Promis !" : "Écartée"}</span>
            <span style={{ fontSize: 15, color: "var(--texte-2)" }}>{c.dernier.promettre} pour, {c.dernier.refuser} contre{c.dernier.hasard ? " : égalité, le sort a tranché" : ""}.</span>
          </div>
        )
      )}
      <div style={{ marginTop: "auto" }}>
        <JaugePopularite j={{ id: "popularite", nom: "Popularité", valeur: c.popularite, tendance: "0", alerte: false }} seuil={vue.seuil} taille={0.7} />
      </div>
    </>
  );
}

function InvestitureMobile({ vue }: { vue: VuePublique }) {
  const c = vue.campagne!;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, animation: "apparition .5s ease" }}>
      <IconeElysee taille={56} couleur="#1d2445" />
      <span className="titre" style={{ fontSize: 36, fontWeight: 800, lineHeight: 1 }}>Vous êtes élus !</span>
      <span style={{ fontSize: 16, color: "var(--texte-2)" }}>Votre programme : {c.faites.length} promesse{c.faites.length > 1 ? "s" : ""}.</span>
      {c.faites.map((p) => (
        <div key={p.id} style={{ display: "flex", gap: 10, fontSize: 15, lineHeight: 1.35 }}>
          <IconeCoche taille={18} couleur="#8a5d00" /> {p.texte}
        </div>
      ))}
      <JaugePopularite j={{ id: "popularite", nom: "Popularité", valeur: c.popularite, tendance: "0", alerte: false }} seuil={vue.seuil} taille={0.7} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mandat                                                              */

function EvenementMobile({ evt, mois, annee }: { evt: VueEvenement; mois: number; annee: number }) {
  const crise = evt.gravite === "crise";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, background: crise ? "var(--alerte-fond)" : "var(--surface)", border: `2px solid ${crise ? "var(--n2)" : "var(--trait)"}`, borderRadius: 20, padding: "16px 16px", animation: "apparition .4s ease" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 800, letterSpacing: 1.3, color: crise ? "var(--n2-texte)" : evt.nature === "negatif" ? "var(--n2-texte)" : "var(--p2-texte)" }}>
        {crise && <IconeAlerte taille={15} />} {crise ? "CRISE" : "ACTUALITÉ"} · {nomMois(mois).toUpperCase()} {annee}
      </span>
      <span className="titre" style={{ fontWeight: 800, fontSize: 23, lineHeight: 1.15 }}>{evt.titre}</span>
      <span style={{ fontSize: 15, lineHeight: 1.4, color: "var(--texte-2)" }}>{evt.description}</span>
      {evt.cause && (
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--violet)", background: "var(--violet-fond)", borderRadius: 10, padding: "6px 10px" }}>
          Conséquence de votre décision de {nomMois(evt.cause.mois)} {evt.cause.annee} : {evt.cause.titre}
        </span>
      )}
      {evt.alerte && <span style={{ fontSize: 14, fontWeight: 600, color: "var(--n2-texte)" }}>Provoqué par l&apos;alerte sur la jauge {evt.alerte}.</span>}
      <Pastilles liste={evt.pastilles} taille={13} />
    </div>
  );
}

function TitreCarte({ carte }: { carte: VueCarte }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {carte.ministere && <BadgeMinistere ministere={carte.ministere} taille={12} />}
      {carte.crise ? (
        <span style={{ fontSize: 14, fontWeight: 800, color: "var(--n2-texte)" }}>Votre réponse à la crise</span>
      ) : (
        <h1 className="titre" style={{ margin: 0, fontWeight: 800, fontSize: 24, lineHeight: 1.1 }}>{carte.titre}</h1>
      )}
      <Puce taille={11}>{libelleType(carte.type, false)}</Puce>
    </div>
  );
}

function CarteOption({ o, choisi, curseur, attenue, onClick }: { o: VueOption; choisi: boolean; curseur?: boolean; attenue?: boolean; onClick?: () => void }) {
  return (
    <button type="button" className="option-mobile" aria-pressed={choisi} onClick={onClick} disabled={!onClick} style={{ opacity: attenue ? 0.4 : 1 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {!curseur && (
          <span className="titre" style={{ width: 30, height: 30, flex: "none", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, background: choisi ? "var(--soleil)" : "var(--surface-2)", border: choisi ? undefined : "2px solid var(--soleil)" }}>
            {o.lettre}
          </span>
        )}
        <span className="titre" style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.1, flex: 1 }}>{o.titre}</span>
        {choisi && <IconeCoche couleur="#8a5d00" />}
      </span>
      <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <EtiquetteOutil outil={o.outil} taille={12} />
        <MentionDuree duree={o.duree} taille={12} />
        <MentionBudget budget={o.budget} taille={12} />
      </span>
      <span style={{ fontSize: 14, lineHeight: 1.35, color: "var(--texte-2)" }}>{o.explication}</span>
      <Pastilles liste={o.pastilles} taille={13} />
    </button>
  );
}

function Lecture({ carte }: { carte: VueCarte }) {
  return (
    <>
      <TitreCarte carte={carte} />
      {!carte.crise && <span style={{ fontSize: 15, color: "var(--texte-3)" }}>{carte.contexte}</span>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {carte.options.map((o) => (
          <CarteOption key={o.id} o={o} choisi={false} curseur={carte.type === "curseur"} />
        ))}
      </div>
      <div role="status" style={{ ...BLOC, display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", fontSize: 15, color: "var(--texte-2)" }}>
        <IconeHorloge /> Le vote s&apos;ouvre dans un instant : lis les options.
      </div>
    </>
  );
}

function Voter({ code, jeton, vue, carte, vote, enregistrer }: { code: string; jeton: string; vue: VuePublique; carte: VueCarte; vote: Vote | null; enregistrer: (v: Vote) => void }) {
  const secondTour = vue.phase === "secondTour" ? vue.secondTour?.options.map((o) => o.id) : undefined;
  const curseur = carte.type === "curseur" && carte.curseur && !secondTour;
  const options = secondTour ? carte.options.filter((o) => secondTour.includes(o.id)) : carte.options;
  const defaut: Vote = curseur ? carte.curseur!.valeurs[Math.floor(carte.curseur!.valeurs.length / 2)] : options[0].id;
  const [selection, setSelection] = useState<Vote | null>(vote ?? (curseur ? defaut : null));
  const [modification, setModification] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (vote !== null) setSelection(vote);
  }, [vote]);
  useEffect(() => {
    // Nouveau scrutin (second tour) : on repart d'une sélection vide.
    setSelection(curseur ? defaut : null);
    setModification(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vue.scrutin]);

  const envoyer = useCallback(async () => {
    if (selection === null) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await appel<{ choix: Vote }>(`/api/salles/${code}/vote`, { jeton, choix: selection });
      enregistrer(r.choix);
      setModification(false);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  }, [code, jeton, selection, enregistrer]);

  const flash = vue.flash && (
    <div role="status" style={{ display: "flex", flexDirection: "column", gap: 4, background: "var(--texte-1)", color: "#fff", borderRadius: 16, padding: "12px 14px", animation: "apparition .4s ease" }}>
      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.3, color: "var(--soleil)" }}>FLASH INFO · +15 S</span>
      <span style={{ fontSize: 15, lineHeight: 1.35 }}>{vue.flash}</span>
    </div>
  );
  const bandeauSecondTour = secondTour && (
    <div style={{ background: "#fff3cf", border: "2px solid var(--soleil)", borderRadius: 16, padding: "10px 14px", fontSize: 15 }}>
      <b>Égalité ! Second tour.</b> Revote entre les options à égalité.
    </div>
  );

  // Vote enregistré : écran de confirmation.
  if (vote !== null && !modification) {
    const o = curseur ? carte.parValeur?.[String(vote)] : carte.options.find((x) => x.id === vote);
    return (
      <>
        {flash}
        {bandeauSecondTour}
        <div role="status" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", background: "var(--ok-fond)", border: "2px solid var(--p2)", borderRadius: 22, padding: "22px 18px" }}>
          <IconeCoche taille={42} couleur="#17784a" />
          <span className="titre" style={{ fontWeight: 800, fontSize: 26 }}>Vote enregistré</span>
          <span style={{ fontSize: 15, color: "var(--texte-2)" }}>Tu peux encore changer d&apos;avis jusqu&apos;à la fin du minuteur.</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, color: "var(--texte-3)", marginTop: 4 }}>TON CHOIX</span>
        {o && <CarteOption o={o} choisi curseur={!!curseur} />}
        <div style={{ ...BLOC, display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
          <span className="titre tabnum" style={{ fontWeight: 800, fontSize: 28 }}>{vue.nbVotes}<span style={{ color: "var(--gris)" }}>/{vue.joueurs.length}</span></span>
          <span style={{ fontSize: 15, color: "var(--texte-2)", flex: 1 }}>ont déjà voté. On attend les autres…</span>
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn-contour" onClick={() => setModification(true)} style={{ height: 56, fontSize: 18 }}>Changer mon vote</button>
      </>
    );
  }

  return (
    <>
      {flash}
      {bandeauSecondTour}
      <TitreCarte carte={carte} />
      {curseur ? (
        <ChoixCurseur carte={carte} valeur={(selection as number) ?? (defaut as number)} changer={setSelection} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {options.map((o) => (
            <CarteOption key={o.id} o={o} choisi={selection === o.id} onClick={() => setSelection(o.id)} />
          ))}
          {carte.type === "cumulable" && !secondTour && <span style={{ fontSize: 14, color: "var(--texte-3)" }}>Une voix par personne : les 2 options les plus votées seront retenues.</span>}
        </div>
      )}
      {erreur && <span role="alert" style={{ fontSize: 15, color: "var(--n2-texte)" }}>{erreur}</span>}
      <div style={{ flex: 1 }} />
      <button type="button" className="btn-principal" disabled={selection === null || envoi} onClick={envoyer} style={{ height: 62, fontSize: 21, position: "sticky", bottom: 12 }}>
        {selection === null
          ? "Choisis une option"
          : curseur
            ? `Voter ${formatNombre(selection as number, (selection as number) % 1 ? 1 : 0)} ${carte.curseur!.unite}`
            : `Voter ${carte.options.find((o) => o.id === selection)?.lettre} · ${carte.options.find((o) => o.id === selection)?.titre}`}
      </button>
    </>
  );
}

function ChoixCurseur({ carte, valeur, changer }: { carte: VueCarte; valeur: number; changer: (v: number) => void }) {
  const c = carte.curseur!;
  const i = c.valeurs.indexOf(valeur);
  const o = carte.parValeur?.[String(valeur)];
  const bouton = { width: 60, height: 60, borderRadius: "50%", background: "var(--surface-2)", color: "var(--texte-1)", border: "2px solid var(--trait-2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 30, fontWeight: 700 } as const;
  return (
    <>
      <div style={{ ...BLOC, display: "flex", flexDirection: "column", gap: 14, borderRadius: 22, padding: "18px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button type="button" aria-label="Diminuer" style={bouton} disabled={i <= 0} onClick={() => changer(c.valeurs[Math.max(0, i - 1)])}>−</button>
          <span className="titre tabnum" style={{ fontWeight: 800, fontSize: c.unite.length > 5 ? 52 : 68, lineHeight: 1, textAlign: "center" }}>
            {formatNombre(valeur, valeur % 1 ? 1 : 0)}
            <span style={{ display: "block", fontSize: 17, fontWeight: 700, color: "var(--texte-3)" }}>{c.unite}</span>
          </span>
          <button type="button" aria-label="Augmenter" style={bouton} disabled={i >= c.valeurs.length - 1} onClick={() => changer(c.valeurs[Math.min(c.valeurs.length - 1, i + 1)])}>+</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${c.valeurs.length}, minmax(0,1fr))`, gap: 6 }} role="radiogroup" aria-label={carte.titre}>
          {c.valeurs.map((v) => (
            <button key={v} type="button" role="radio" aria-checked={v === valeur} onClick={() => changer(v)}
              className="titre" style={{ height: 48, borderRadius: 12, fontWeight: 800, fontSize: c.valeurs.length > 5 ? 14 : 18, cursor: "pointer", color: "var(--texte-1)", ...(v === valeur ? { background: "var(--soleil)", border: 0 } : { background: "var(--surface)", border: "2px solid var(--trait-2)" }) }}>
              {formatNombre(v, v % 1 ? 1 : 0)}
            </button>
          ))}
        </div>
      </div>
      {o && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--surface-2)", borderRadius: 18, padding: "14px 16px" }}>
          <span style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <EtiquetteOutil outil={o.outil} taille={12} />
            <MentionDuree duree={o.duree} taille={12} />
            <MentionBudget budget={o.budget} taille={12} />
          </span>
          <span style={{ fontSize: 15, lineHeight: 1.4, color: "var(--texte-2)" }}>{o.explication}</span>
          <Pastilles liste={o.pastilles} taille={13} />
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

function ResultatMobile({ vue }: { vue: VuePublique }) {
  const r = vue.resultat;
  if (!r) return <Message titre="Vote clos" texte="Regardez le grand écran." compact />;
  return (
    <>
      <div style={{ ...BLOC, display: "flex", flexDirection: "column", gap: 10, borderRadius: 24, padding: "22px 18px", animation: "apparition .4s ease" }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.3, color: r.rejete ? "var(--n2-texte)" : "var(--accent-texte)" }}>
          {r.rejete ? "RÉFÉRENDUM REJETÉ" : r.aucunVote ? "LE HASARD A CHOISI" : r.secondTour ? "DÉPARTAGÉ AU SECOND TOUR" : r.crise ? "VOTRE RÉPONSE À LA CRISE" : "VOUS AVEZ DÉCIDÉ"}
        </span>
        <span className="titre" style={{ fontWeight: 800, fontSize: 28, lineHeight: 1.08 }}>{r.titre}</span>
        <span style={{ fontSize: 15, lineHeight: 1.4, color: "var(--texte-2)" }}>{r.explication}</span>
        <Pastilles liste={r.pastilles} taille={13} chiffre style={{ marginTop: 4 }} />
      </div>
      {r.promesse && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", borderRadius: 16, padding: "12px 14px", fontSize: 15, background: r.promesse.tenue ? "var(--ok-fond)" : "var(--alerte-fond)", color: r.promesse.tenue ? "var(--p2-texte)" : "var(--n2-texte)" }}>
          {r.promesse.tenue ? <IconeCoche taille={20} /> : <IconeAlerte taille={18} />}
          <span><b>Promesse {r.promesse.tenue ? "tenue" : "trahie"}</b> : « {r.promesse.texte} »</span>
        </div>
      )}
      <div style={{ ...BLOC, display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 16 }}>
        <IconeCadenas />
        <span style={{ fontSize: 15 }}>{r.nbVotes} vote{r.nbVotes > 1 ? "s" : ""} sur {vue.joueurs.length}. Vote anonyme.</span>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: "var(--texte-3)", fontSize: 16, lineHeight: 1.4 }}>
        Regardez le grand écran : on découvre ce qui change, puis le temps reprend.
      </div>
    </>
  );
}

function BilanAnneeMobile({ vue }: { vue: VuePublique }) {
  const b = vue.bilanAnnee;
  if (!b) return null;
  return (
    <>
      <span className="titre" style={{ fontSize: 28, fontWeight: 800 }}>Bilan {b.annee}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {b.jauges.map((j) => {
          const d = j.fin - j.debut;
          return (
            <div key={j.id} style={{ ...BLOC, display: "flex", justifyContent: "space-between", fontSize: 15, borderRadius: 12, padding: "9px 14px" }}>
              <span style={{ fontWeight: j.id === "popularite" ? 800 : 500 }}>{j.nom}</span>
              <span className="tabnum" style={{ fontWeight: 700 }}>
                {j.debut} → {j.fin} <span className={d > 0 ? "fleche-p1" : d < 0 ? "fleche-n1" : "fleche-0"}>{d > 0 ? `+${d}` : d < 0 ? `−${-d}` : "="}</span>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function FinMobile({ vue }: { vue: VuePublique }) {
  const b = vue.bilan;
  return (
    <>
      <div style={{ ...BLOC, display: "flex", flexDirection: "column", gap: 8, borderRadius: 24, padding: "20px 18px" }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.3, color: "var(--accent-texte)" }}>FIN DU MANDAT</span>
        <span className="titre" style={{ fontWeight: 800, fontSize: 28, lineHeight: 1.05 }}>Votre France en {b?.anneeFin ?? vue.annee}</span>
        {b && <span style={{ fontSize: 16, fontWeight: 700 }}>Démagomètre : {b.demagometre} % · {b.promesses.filter((p) => p.faite && p.tenue).length} promesse(s) tenue(s) sur {b.promesses.filter((p) => p.faite).length}</span>}
      </div>
      {b && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {b.jauges.map((j) => (
            <div key={j.id} style={{ ...BLOC, display: "flex", justifyContent: "space-between", fontSize: 15, borderRadius: 12, padding: "10px 14px" }}>
              <span>{j.nom}</span>
              <span className="tabnum" style={{ fontWeight: 700 }}>{j.depart} → {j.fin} <span style={{ color: "var(--violet)", fontWeight: 500 }}>(sans : {j.sans})</span></span>
            </div>
          ))}
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, color: "var(--texte-3)", marginTop: 8 }}>CE QU&apos;ON RETIENT</span>
          {b.enseignements.map((e, i) => (
            <p key={i} style={{ margin: 0, fontSize: 15, lineHeight: 1.4, color: "var(--texte-2)" }}>
              <b style={{ color: "var(--accent-texte)" }}>{i + 1}.</b> {e}
            </p>
          ))}
        </div>
      )}
    </>
  );
}
