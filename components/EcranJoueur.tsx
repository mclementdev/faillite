"use client";
/** Écran du participant (téléphone, portrait). */
import { useCallback, useEffect, useState } from "react";
import { appel, ecrireLocal, lireLocal, useSalle } from "@/lib/client";
import type { VueCarte, VueOption, VuePublique } from "@/lib/types";
import { formatMinuteur, formatNombre, IconeCadenas, IconeCoche, IconeCouronne, IconeHorloge, libelleType, Logo, MentionDuree, Pastilles, Puce, useRestant } from "./ui";

type Vote = string | number;

export default function EcranJoueur({ code }: { code: string }) {
  const { vue, erreur, decalage } = useSalle(code, 1500);
  const cleJeton = `faillite:joueur:${code}`;
  const [jeton, setJeton] = useState<string | null>(null);
  const [pseudo, setPseudo] = useState<string>("");
  const [pret, setPret] = useState(false);
  /** vote enregistré côté serveur pour le scrutin courant (élection ou tour) */
  const [monVote, setMonVote] = useState<{ scrutin: string; choix: Vote } | null>(null);

  // Reconnexion : jeton conservé dans le navigateur.
  useEffect(() => {
    const j = lireLocal(cleJeton);
    if (!j) {
      setPret(true);
      return;
    }
    appel<{ pseudo: string; vote: Vote | null }>(`/api/salles/${code}/moi`, undefined, { "x-jeton": j })
      .then((r) => {
        setJeton(j);
        setPseudo(r.pseudo);
        if (r.vote !== null) setMonVote({ scrutin: "?", choix: r.vote });
      })
      .catch(() => {})
      .finally(() => setPret(true));
  }, [code, cleJeton]);

  // Le vote restauré à la reconnexion appartient au scrutin en cours.
  useEffect(() => {
    if (vue && monVote?.scrutin === "?") setMonVote({ scrutin: scrutinDe(vue), choix: monVote.choix });
  }, [vue, monVote]);

  if (!pret || (!vue && !erreur)) return <Chargement />;
  if (!vue) return <Message titre="Salle introuvable" texte={erreur ?? "Vérifie le code affiché sur le grand écran."} />;
  if (!jeton) return <Rejoindre code={code} onRejoint={(j, p) => { ecrireLocal(cleJeton, j); setJeton(j); setPseudo(p); }} />;

  const vote = monVote && monVote.scrutin === scrutinDe(vue) ? monVote.choix : null;
  const enregistrer = (choix: Vote) => setMonVote({ scrutin: scrutinDe(vue), choix });
  const preside = vue.presidence?.pseudo === pseudo;

  return (
    <div className="mobile">
      <EnTete vue={vue} decalage={decalage} />
      {vue.phase === "accueil" && <Attente pseudo={pseudo} vue={vue} />}
      {vue.phase === "election" && <VoterPresidence code={code} jeton={jeton} vue={vue} vote={vote} enregistrer={enregistrer} pseudo={pseudo} />}
      {vue.phase === "presidence" && <PresidenceMobile vue={vue} preside={preside} />}
      {preside && vue.phase !== "presidence" && vue.phase !== "fin" && vue.phase !== "election" && (
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--texte-2)", background: "var(--surface)", borderRadius: 12, padding: "8px 12px" }}>
          <IconeCouronne taille={18} couleur="#FFD23F" /> Tu présides : ta voix compte double en cas d&apos;égalité.
        </span>
      )}
      {vue.phase === "annonce" && vue.carte && <Lecture carte={vue.carte} />}
      {vue.phase === "annonce" && !vue.carte && <Message titre="Pas de vote cette année" texte="Regardez le grand écran." compact />}
      {vue.phase === "vote" && vue.carte && <Voter code={code} jeton={jeton} vue={vue} vote={vote} enregistrer={enregistrer} />}
      {vue.phase === "resultat" && <ResultatMobile vue={vue} vote={vote} />}
      {vue.phase === "fin" && <FinMobile vue={vue} />}
    </div>
  );
}

/** Clé du scrutin en cours : l'élection de la présidence ou le tour de jeu. */
function scrutinDe(vue: VuePublique): string {
  return vue.phase === "election" || vue.phase === "presidence" ? "election" : `t${vue.tour}`;
}

function VoterPresidence({ code, jeton, vue, vote, enregistrer, pseudo }: { code: string; jeton: string; vue: VuePublique; vote: Vote | null; enregistrer: (v: Vote) => void; pseudo: string }) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const choisir = async (choix: string) => {
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await appel<{ choix: Vote }>(`/api/salles/${code}/vote`, { jeton, choix });
      enregistrer(r.choix);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, letterSpacing: 1.3, color: "var(--moutarde)" }}>
          <IconeCouronne taille={16} /> PREMIER VOTE
        </span>
        <h1 className="titre" style={{ margin: 0, fontWeight: 800, fontSize: 28, lineHeight: 1.1 }}>Qui préside le sénat ?</h1>
        <span style={{ fontSize: 15, lineHeight: 1.4, color: "var(--texte-2)" }}>En cas d&apos;égalité lors d&apos;un vote, sa voix comptera double.</span>
      </div>
      {vote !== null && (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--ok-fond)", border: "2px solid var(--p2)", borderRadius: 16, padding: "12px 14px", fontSize: 15 }}>
          <IconeCoche taille={24} couleur="#2ED47A" /> Vote enregistré. Tu peux encore changer.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }} role="radiogroup" aria-label="Présidence du sénat">
        {vue.joueurs.map((j) => {
          const choisi = vote === j.pseudo;
          return (
            <button key={j.pseudo} type="button" role="radio" aria-checked={choisi} disabled={envoi} onClick={() => choisir(j.pseudo)} className="option-mobile"
              style={{ flexDirection: "row", alignItems: "center", gap: 12, ...(choisi ? { borderColor: "var(--moutarde)" } : {}) }}>
              <span style={{ width: 36, height: 36, flex: "none", borderRadius: "50%", background: j.couleur, color: "var(--encre)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18 }}>{j.pseudo.charAt(0).toUpperCase()}</span>
              <span className="titre" style={{ flex: 1, fontWeight: 700, fontSize: 19, textAlign: "left" }}>{j.pseudo}{j.pseudo === pseudo ? " (toi)" : ""}</span>
              {choisi && <IconeCoche couleur="#FFD23F" />}
            </button>
          );
        })}
      </div>
      {erreur && <span role="alert" style={{ fontSize: 15, color: "#FFB3BA" }}>{erreur}</span>}
      <span style={{ fontSize: 14, color: "var(--texte-3)" }}>{vue.nbVotes}/{vue.joueurs.length} ont voté · vote anonyme</span>
    </>
  );
}

function PresidenceMobile({ vue, preside }: { vue: VuePublique; preside: boolean }) {
  const p = vue.presidence;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center", animation: "apparition .5s ease" }}>
      <IconeCouronne taille={56} couleur="#FFD23F" />
      {p ? (
        <>
          <span className="titre" style={{ fontWeight: 800, fontSize: 32, lineHeight: 1.1 }}>{preside ? "Tu présides le sénat !" : `${p.pseudo} préside le sénat`}</span>
          <span style={{ fontSize: 16, lineHeight: 1.4, color: "var(--texte-2)" }}>
            {preside ? "Quand un vote est à égalité, ta voix compte double. Si l'égalité persiste, le sort tranche." : "Quand un vote est à égalité, sa voix compte double. Si l'égalité persiste, le sort tranche."}
          </span>
        </>
      ) : (
        <span className="titre" style={{ fontWeight: 800, fontSize: 26 }}>Pas de présidence</span>
      )}
      <span style={{ fontSize: 15, color: "var(--texte-3)" }}>La partie commence dans un instant.</span>
    </div>
  );
}

function Chargement() {
  return (
    <div className="mobile" style={{ justifyContent: "center", alignItems: "center" }}>
      <Logo taille={54} />
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
      <Logo taille={54} />
      {contenu}
    </div>
  );
}

function EnTete({ vue, decalage }: { vue: VuePublique; decalage: number }) {
  const restant = useRestant(vue.echeance, decalage);
  if (vue.phase === "accueil") return <Logo taille={40} />;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 16, fontWeight: 700, color: "var(--texte-2)" }}>
        {vue.phase === "election" || vue.phase === "presidence" ? (
          <span className="titre" style={{ fontWeight: 800, fontSize: 20, color: "var(--craie)" }}>Élection</span>
        ) : (
          <>
            <span className="titre" style={{ fontWeight: 800, fontSize: 22, color: "var(--craie)" }}>{vue.annee}</span> · Tour {Math.min(vue.tour, vue.nbTours)}/{vue.nbTours}
          </>
        )}
      </span>
      {vue.phase === "vote" || vue.phase === "election" ? (
        <span className="titre tabnum" role="timer" aria-live="off" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: restant <= 10 ? "var(--n1)" : "var(--moutarde)", color: "var(--encre)", borderRadius: 999, padding: "6px 14px 6px 10px", fontWeight: 800, fontSize: 20 }}>
          <IconeHorloge taille={20} /> {formatMinuteur(restant)}
        </span>
      ) : vue.phase === "resultat" || vue.phase === "fin" || vue.phase === "presidence" ? (
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--texte-2)", background: "var(--surface)", borderRadius: 999, padding: "6px 12px" }}>{vue.phase === "fin" ? "Partie terminée" : "Vote clos"}</span>
      ) : (
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--texte-2)", background: "var(--surface)", borderRadius: 999, padding: "6px 12px" }}>Lecture</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Rejoindre({ code, onRejoint }: { code: string; onRejoint: (jeton: string, pseudo: string) => void }) {
  const [pseudo, setPseudo] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const valider = async (e: React.FormEvent) => {
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
    <form className="mobile" onSubmit={valider} style={{ paddingTop: 56, gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Logo taille={54} />
        <span style={{ fontSize: 17, color: "var(--texte-2)" }}>30 ans pour comprendre l&apos;impact de chaque décision.</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface)", borderRadius: 18, padding: "16px 18px" }}>
        <span style={{ fontSize: 16, color: "var(--texte-3)" }}>Salle</span>
        <span className="titre" style={{ fontWeight: 800, fontSize: 30, letterSpacing: 4, color: "var(--moutarde)" }}>{code}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label htmlFor="pseudo" style={{ fontSize: 20, fontWeight: 700 }}>Ton pseudo</label>
        <input id="pseudo" type="text" value={pseudo} onChange={(e) => setPseudo(e.target.value)} maxLength={16} autoComplete="nickname" required autoFocus
          style={{ height: 60, background: "var(--surface)", color: "var(--craie)", border: "3px solid var(--moutarde)", borderRadius: 16, padding: "0 18px", font: "500 22px var(--texte)", outline: "none" }} />
        <span style={{ fontSize: 15, color: "var(--texte-3)" }}>Visible par les autres sur le grand écran. Ton vote, lui, reste secret.</span>
        {erreur && <span role="alert" style={{ fontSize: 15, color: "#FFB3BA" }}>{erreur}</span>}
      </div>
      <div style={{ flex: 1 }} />
      <button type="submit" className="btn-principal" disabled={envoi || !pseudo.trim()} style={{ height: 64, fontSize: 26 }}>Entrer au sénat</button>
      <span style={{ textAlign: "center", fontSize: 15, color: "var(--texte-3)" }}>Pas de compte, pas d&apos;application.</span>
    </form>
  );
}

function Attente({ pseudo, vue }: { pseudo: string; vue: VuePublique }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
      <div role="status" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", background: "var(--ok-fond)", border: "2px solid var(--p2)", borderRadius: 22, padding: "26px 18px" }}>
        <IconeCoche taille={40} couleur="#2ED47A" />
        <span className="titre" style={{ fontWeight: 800, fontSize: 28 }}>Bienvenue, {pseudo}</span>
        <span style={{ fontSize: 16, color: "var(--texte-2)" }}>Tu es au sénat. La partie commence dès que l&apos;hôte la lance.</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", borderRadius: 16, padding: "14px 16px" }}>
        <span className="titre tabnum" style={{ fontWeight: 800, fontSize: 28 }}>{vue.joueurs.length}</span>
        <span style={{ fontSize: 15, color: "var(--texte-2)" }}>sénateur{vue.joueurs.length > 1 ? "s" : ""} connecté{vue.joueurs.length > 1 ? "s" : ""}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.3, color: "var(--texte-3)" }}>EN ATTENDANT : COMMENT ÇA MARCHE</span>
        {[
          ["1", "Chaque année, une décision. Lis la carte sur le grand écran, puis vote ici avant la fin du minuteur."],
          ["2", <>Les pastilles montrent les jauges touchées : <b style={{ color: "var(--p2)" }}>▲</b> hausse, <b style={{ color: "var(--n1)" }}>▼</b> baisse. Les chiffres exacts arrivent après le vote.</>],
          ["3", "Attention aux imprévus : certaines décisions ont des conséquences que personne n'annonce."],
        ].map(([n, t]) => (
          <div key={n as string} style={{ display: "flex", gap: 12, alignItems: "flex-start", background: "var(--surface)", borderRadius: 14, padding: "12px 14px" }}>
            <span className="titre" style={{ width: 28, height: 28, flex: "none", borderRadius: "50%", background: "var(--moutarde)", color: "var(--encre)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16 }}>{n}</span>
            <span style={{ fontSize: 15, lineHeight: 1.4, color: "var(--texte-2)" }}>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TitreCarte({ carte }: { carte: VueCarte }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Puce taille={12} fond={carte.type === "curseur" ? "var(--moutarde)" : "var(--craie)"}>{libelleType(carte.type, false)}</Puce>
      <h1 className="titre" style={{ margin: 0, fontWeight: 700, fontSize: 25, lineHeight: 1.1 }}>{carte.titre}</h1>
    </div>
  );
}

function CarteOption({ o, choisi, curseur, attenue, onClick }: { o: VueOption; choisi: boolean; curseur?: boolean; attenue?: boolean; onClick?: () => void }) {
  return (
    <button type="button" className="option-mobile" aria-pressed={choisi} onClick={onClick} disabled={!onClick} style={{ opacity: attenue ? 0.45 : 1 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {!curseur && (
          <span className="titre" style={{ width: 30, height: 30, flex: "none", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, ...(choisi ? { background: "var(--moutarde)", color: "var(--encre)" } : { border: "2px solid var(--moutarde)", color: "var(--moutarde)" }) }}>
            {o.lettre}
          </span>
        )}
        <span className="titre" style={{ fontWeight: 700, fontSize: 19, lineHeight: 1.1, flex: 1 }}>{o.titre}</span>
        {choisi && <IconeCoche couleur="#FFD23F" />}
      </span>
      <MentionDuree duree={o.duree} taille={12} />
      <span style={{ fontSize: 14, lineHeight: 1.35, color: "var(--texte-2)" }}>{o.explication}</span>
      <Pastilles liste={o.pastilles} taille={13} />
    </button>
  );
}

function Lecture({ carte }: { carte: VueCarte }) {
  return (
    <>
      <TitreCarte carte={carte} />
      <span style={{ fontSize: 15, color: "var(--texte-3)" }}>{carte.contexte}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {carte.options.map((o) => (
          <CarteOption key={o.id} o={o} choisi={false} curseur={carte.type === "curseur"} />
        ))}
      </div>
      <div role="status" style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", borderRadius: 16, padding: "14px 16px", fontSize: 15, color: "var(--texte-2)" }}>
        <IconeHorloge /> Le vote s&apos;ouvre dans un instant : lis les options.
      </div>
    </>
  );
}

function Voter({ code, jeton, vue, vote, enregistrer }: { code: string; jeton: string; vue: VuePublique; vote: Vote | null; enregistrer: (v: Vote) => void }) {
  const carte = vue.carte!;
  const curseur = carte.type === "curseur" && carte.curseur;
  const defaut: Vote = curseur ? carte.curseur!.valeurs[Math.floor(carte.curseur!.valeurs.length / 2)] : carte.options[0].id;
  const [selection, setSelection] = useState<Vote | null>(vote ?? (curseur ? defaut : null));
  const [modification, setModification] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (vote !== null) setSelection(vote);
  }, [vote]);

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

  // Vote enregistré : écran de confirmation.
  if (vote !== null && !modification) {
    const o = curseur ? carte.parValeur?.[String(vote)] : carte.options.find((x) => x.id === vote);
    return (
      <>
        <div role="status" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", background: "var(--ok-fond)", border: "2px solid var(--p2)", borderRadius: 22, padding: "24px 18px" }}>
          <IconeCoche taille={44} couleur="#2ED47A" />
          <span className="titre" style={{ fontWeight: 800, fontSize: 28 }}>Vote enregistré</span>
          <span style={{ fontSize: 16, color: "var(--texte-2)" }}>Tu peux encore changer d&apos;avis jusqu&apos;à la fin du minuteur.</span>
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1, color: "var(--texte-3)", marginTop: 4 }}>TON CHOIX</span>
        {o && <CarteOption o={o} choisi curseur={!!curseur} />}
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", borderRadius: 16, padding: "14px 16px" }}>
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
      <TitreCarte carte={carte} />
      {curseur ? (
        <ChoixCurseur carte={carte} valeur={(selection as number) ?? (defaut as number)} changer={setSelection} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {carte.options.map((o) => (
            <CarteOption key={o.id} o={o} choisi={selection === o.id} onClick={() => setSelection(o.id)} />
          ))}
          {carte.type === "cumulable" && <span style={{ fontSize: 14, color: "var(--texte-3)" }}>Une voix par personne : les 2 options les plus votées seront retenues.</span>}
        </div>
      )}
      {erreur && <span role="alert" style={{ fontSize: 15, color: "#FFB3BA" }}>{erreur}</span>}
      <div style={{ flex: 1 }} />
      <button type="button" className="btn-principal" disabled={selection === null || envoi} onClick={envoyer} style={{ height: 62, fontSize: 22, position: "sticky", bottom: 12 }}>
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
  const bouton = { width: 60, height: 60, borderRadius: "50%", background: "var(--surface-2)", color: "var(--craie)", border: "2px solid var(--trait-2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 30, fontWeight: 700 } as const;
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, background: "var(--surface)", borderRadius: 22, padding: "18px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button type="button" aria-label="Diminuer" style={bouton} disabled={i <= 0} onClick={() => changer(c.valeurs[Math.max(0, i - 1)])}>−</button>
          <span className="titre tabnum" style={{ fontWeight: 800, fontSize: c.unite.length > 5 ? 52 : 72, lineHeight: 1, textAlign: "center" }}>
            {formatNombre(valeur, valeur % 1 ? 1 : 0)}
            <span style={{ display: "block", fontSize: 18, fontWeight: 700, color: "var(--texte-3)" }}>{c.unite}</span>
          </span>
          <button type="button" aria-label="Augmenter" style={bouton} disabled={i >= c.valeurs.length - 1} onClick={() => changer(c.valeurs[Math.min(c.valeurs.length - 1, i + 1)])}>+</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${c.valeurs.length}, minmax(0,1fr))`, gap: 6 }} role="radiogroup" aria-label={carte.titre}>
          {c.valeurs.map((v) => (
            <button key={v} type="button" role="radio" aria-checked={v === valeur} onClick={() => changer(v)}
              className="titre" style={{ height: 48, borderRadius: 12, fontWeight: 800, fontSize: c.valeurs.length > 5 ? 14 : 18, cursor: "pointer", ...(v === valeur ? { background: "var(--moutarde)", color: "var(--encre)", border: 0 } : { background: "transparent", color: "var(--craie)", border: "2px solid var(--trait-2)" }) }}>
              {formatNombre(v, v % 1 ? 1 : 0)}
            </button>
          ))}
        </div>
      </div>
      {o && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--surface-2)", borderRadius: 18, padding: "14px 16px" }}>
          <MentionDuree duree={o.duree} taille={12} />
          <span style={{ fontSize: 15, lineHeight: 1.4, color: "var(--texte-2)" }}>{o.explication}</span>
          <Pastilles liste={o.pastilles} taille={13} />
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

function ResultatMobile({ vue, vote }: { vue: VuePublique; vote: Vote | null }) {
  const r = vue.resultat;
  if (!r) return <Message titre="Vote clos" texte="Regardez le grand écran." compact />;
  let phrase = "Tu n'as pas voté cette fois-ci.";
  if (vote !== null) {
    const voix = r.decompte.find((d) => d.id === String(vote))?.voix ?? 0;
    const retenue = r.decompte.find((d) => d.id === String(vote))?.retenue;
    phrase = retenue
      ? `Ton choix a été retenu (${voix} voix sur ${r.nbVotes}).`
      : vue.carte?.type === "curseur"
        ? `Tu avais voté ${formatNombre(Number(vote), Number(vote) % 1 ? 1 : 0)} ; la médiane du sénat l'emporte.`
        : `Ton choix n'a pas été retenu (${voix} voix sur ${r.nbVotes}).`;
  }
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--surface)", borderRadius: 24, padding: "24px 18px", animation: "apparition .4s ease" }}>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1.5, color: "var(--moutarde)" }}>{r.aucunVote ? "LE HASARD A CHOISI" : r.departagePresident ? "ÉGALITÉ · LA PRÉSIDENCE A TRANCHÉ" : r.egalite ? "ÉGALITÉ TRANCHÉE AU SORT" : "LE SÉNAT A CHOISI"}</span>
        <span className="titre" style={{ fontWeight: 800, fontSize: 32, lineHeight: 1.05 }}>{r.titre}</span>
        <span style={{ fontSize: 16, lineHeight: 1.4, color: "var(--texte-2)" }}>{r.explication}</span>
        <Pastilles liste={r.pastilles} taille={14} chiffre style={{ marginTop: 4 }} />
      </div>
      {r.imprevu && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "var(--surface-2)", border: "2px dashed var(--violet)", borderRadius: 20, padding: "16px 16px", animation: "apparition .5s ease 1.2s both" }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.3, color: "var(--violet)" }}>IMPRÉVU · {r.imprevu.nature === "negatif" ? "PERSONNE NE L'AVAIT VU VENIR" : "BONNE SURPRISE"}</span>
          <span style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.2 }}>{r.imprevu.titre}</span>
          <span style={{ fontSize: 15, lineHeight: 1.4, color: "var(--texte-2)" }}>{r.imprevu.description}</span>
          <Pastilles liste={r.imprevu.pastilles} taille={13} chiffre style={{ marginTop: 2 }} />
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface-2)", borderRadius: 16, padding: "14px 16px" }}>
        <IconeCadenas />
        <span style={{ fontSize: 16 }}>{phrase}</span>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center", color: "var(--texte-3)" }}>
        <span style={{ fontSize: 17, lineHeight: 1.4 }}>
          Regardez le grand écran :<br />on découvre ce qui change, puis {vue.annee + 1} commence.
        </span>
      </div>
    </>
  );
}

function FinMobile({ vue }: { vue: VuePublique }) {
  const b = vue.bilan;
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--surface)", borderRadius: 24, padding: "22px 18px" }}>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1.5, color: "var(--moutarde)" }}>FIN DE PARTIE</span>
        <span className="titre" style={{ fontWeight: 800, fontSize: 30, lineHeight: 1.05 }}>Votre France en {b?.anneeFin ?? vue.annee}</span>
      </div>
      {b && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {b.jauges.map((j) => (
            <div key={j.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 16, background: "var(--surface)", borderRadius: 12, padding: "10px 14px" }}>
              <span>{j.nom}</span>
              <span className="tabnum" style={{ fontWeight: 700 }}>{j.depart} → {j.fin} <span style={{ color: "var(--violet)", fontWeight: 500 }}>(sans : {j.sans})</span></span>
            </div>
          ))}
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1, color: "var(--texte-3)", marginTop: 8 }}>CE QU&apos;ON RETIENT</span>
          {b.enseignements.map((e, i) => (
            <p key={i} style={{ margin: 0, fontSize: 15, lineHeight: 1.4, color: "var(--texte-2)" }}>
              <b style={{ color: "var(--moutarde)" }}>{i + 1}.</b> {e}
            </p>
          ))}
        </div>
      )}
    </>
  );
}
