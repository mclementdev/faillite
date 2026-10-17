"use client";
/** Grand écran de l'hôte (paysage 1920×1080, mis à l'échelle de la fenêtre). */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { appel, ecrireLocal, lireLocal, useSalle } from "@/lib/client";
import type { VueCarte, VueImprevu, VueIndicateur, VueJauge, VuePublique } from "@/lib/types";
import Tutoriel from "./Tutoriel";
import { CoucheInfobulles, Info, TitreBulle } from "./Infobulle";
import {
  Anneau,
  formatMinuteur,
  formatNombre,
  IconeCadenas,
  IconeCoche,
  IconeFleche,
  IconeHorloge,
  IconeJauge,
  JaugeLigne,
  libelleType,
  Logo,
  MentionDuree,
  Pastilles,
  IconeCouronne,
  Points,
  Puce,
  DESCRIPTION_JAUGE,
  InfoPresidence,
  LIBELLE_NIVEAU,
  useRestant,
} from "./ui";

/* ------------------------------------------------------------------ */

function Scene({ children }: { children: ReactNode }) {
  const [echelle, setEchelle] = useState(1);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const maj = () => setEchelle(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    maj();
    window.addEventListener("resize", maj);
    return () => window.removeEventListener("resize", maj);
  }, []);
  return (
    <div className="scene-ext">
      <div ref={ref} className="scene" style={{ transform: `translate(-50%, -50%) scale(${echelle})` }}>
        <CoucheInfobulles scene={ref}>{children}</CoucheInfobulles>
      </div>
    </div>
  );
}

const CADRE = {
  width: 1920,
  height: 1080,
  boxSizing: "border-box" as const,
  background: "var(--encre)",
  color: "var(--craie)",
  overflow: "hidden" as const,
};

export default function EcranHote({ code }: { code: string }) {
  const { vue, erreur, decalage, rafraichir } = useSalle(code, 1000);
  const [hote, setHote] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /** tutoriel : "demarrage" (avant le premier tour) ou "salon" (simple consultation) */
  const [tuto, setTuto] = useState<null | "demarrage" | "salon">(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => setHote(lireLocal(`faillite:hote:${code}`)), [code]);

  const agir = async (corps: Record<string, unknown>) => {
    if (!hote) return;
    setOccupe(true);
    setMessage(null);
    try {
      await appel(`/api/salles/${code}/hote`, { ...corps, hote });
      await rafraichir();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setOccupe(false);
    }
  };

  if (!vue)
    return (
      <Scene>
        <div style={{ ...CADRE, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 24 }}>
          <Logo taille={120} />
          <p style={{ fontSize: 30, color: "var(--texte-3)" }}>{erreur ?? "Connexion à la salle…"}</p>
        </div>
      </Scene>
    );

  const controle = !!hote;
  const demarrer = () => {
    // Le tutoriel passe une fois par salle avant le premier tour (on peut le passer).
    if (!lireLocal(`faillite:tuto:${code}`)) setTuto("demarrage");
    else agir({ action: "demarrer", nbTours: vue.nbTours });
  };
  const finTuto = () => {
    const mode = tuto;
    setTuto(null);
    if (mode === "demarrage") {
      ecrireLocal(`faillite:tuto:${code}`, "1");
      agir({ action: "demarrer", nbTours: vue.nbTours });
    }
  };
  const ouvrirMenu = () => setMenu(true);
  return (
    <Scene>
      {vue.phase === "election" && <Election vue={vue} agir={agir} occupe={occupe} controle={controle} decalage={decalage} ouvrirMenu={ouvrirMenu} />}
      {vue.phase === "presidence" && <Presidence vue={vue} agir={agir} occupe={occupe} controle={controle} ouvrirMenu={ouvrirMenu} />}
      {vue.phase === "accueil" && <Accueil vue={vue} agir={agir} occupe={occupe} controle={controle} demarrer={demarrer} ouvrirTuto={() => setTuto("salon")} ouvrirMenu={ouvrirMenu} />}
      {(vue.phase === "annonce" || vue.phase === "vote") && <Tour vue={vue} agir={agir} occupe={occupe} controle={controle} decalage={decalage} ouvrirMenu={ouvrirMenu} />}
      {vue.phase === "resultat" && <Resultat vue={vue} agir={agir} occupe={occupe} controle={controle} ouvrirMenu={ouvrirMenu} />}
      {vue.phase === "fin" && <Fin vue={vue} ouvrirMenu={ouvrirMenu} />}
      {tuto && vue.phase === "accueil" && (
        <Tutoriel nbTours={vue.nbTours} anneeDepart={vue.anneeDepart} seuil={vue.seuil} terminer={finTuto} libelleFin={tuto === "demarrage" ? "Élire la présidence" : "Fermer"} />
      )}
      {menu && <DialogueMenu code={vue.code} enCours={vue.phase !== "accueil" && vue.phase !== "fin"} fermer={() => setMenu(false)} />}
      {(message || erreur) && (
        <div role="alert" style={{ position: "absolute", left: "50%", bottom: 24, transform: "translateX(-50%)", background: "var(--alerte-fond)", border: "2px solid var(--n2)", borderRadius: 14, padding: "12px 22px", fontSize: 22 }}>
          {message ?? erreur}
        </div>
      )}
      {!controle && vue.phase !== "fin" && (
        <div style={{ position: "absolute", right: 24, bottom: 18, fontSize: 18, color: "var(--texte-3)" }}>Écran en lecture seule (la partie est pilotée depuis l&apos;écran qui l&apos;a créée).</div>
      )}
    </Scene>
  );
}

type PropsEcran = { vue: VuePublique; agir: (c: Record<string, unknown>) => Promise<void>; occupe: boolean; controle: boolean; ouvrirMenu: () => void };

/* ------------------------------------------------------------------ */
/* Retour au menu                                                      */

function IconeMaison({ taille = 22 }: { taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}

function BoutonMenu({ ouvrir, style }: { ouvrir: () => void; style?: CSSProperties }) {
  return (
    <button type="button" onClick={ouvrir} aria-label="Revenir au menu"
      style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "transparent", color: "var(--craie)", border: "2px solid var(--trait)", borderRadius: 14, padding: "10px 18px", font: "500 21px var(--texte)", cursor: "pointer", ...style }}>
      <IconeMaison /> Menu
    </button>
  );
}

function DialogueMenu({ code, enCours, fermer }: { code: string; enCours: boolean; fermer: () => void }) {
  const router = useRouter();
  useEffect(() => {
    const touche = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [fermer]);
  return (
    <div role="dialog" aria-modal="true" aria-label="Revenir au menu" onClick={fermer}
      style={{ position: "absolute", inset: 0, zIndex: 30, background: "rgba(21,19,28,.85)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 860, background: "var(--surface)", border: "2px solid var(--trait-2)", borderRadius: 32, padding: "44px 48px", display: "flex", flexDirection: "column", gap: 22, animation: "apparition .3s ease" }}>
        <h2 className="titre" style={{ margin: 0, fontSize: 52, fontWeight: 800 }}>Revenir au menu ?</h2>
        <p style={{ margin: 0, fontSize: 26, lineHeight: 1.4, color: "var(--texte-2)" }}>
          {enCours
            ? <>La partie n&apos;est pas perdue : la salle <b style={{ color: "var(--moutarde)" }}>{code}</b> reste ouverte 12 heures. Vous pourrez la reprendre depuis le menu, là où vous l&apos;avez laissée.</>
            : <>La salle <b style={{ color: "var(--moutarde)" }}>{code}</b> reste ouverte 12 heures : vous pourrez y revenir depuis le menu.</>}
        </p>
        <div style={{ display: "flex", gap: 18, justifyContent: "flex-end", marginTop: 10 }}>
          <button type="button" className="btn-contour" onClick={fermer} autoFocus style={{ fontSize: 26, padding: "16px 28px" }}>Rester ici</button>
          <button type="button" className="btn-principal" onClick={() => router.push("/")} style={{ fontSize: 26, padding: "16px 30px" }}>
            <IconeMaison taille={26} /> Revenir au menu
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Accueil                                                             */

function Accueil({ vue, agir, occupe, controle, demarrer, ouvrirTuto, ouvrirMenu }: PropsEcran & { demarrer: () => void; ouvrirTuto: () => void }) {
  const [qr, setQr] = useState<string>("");
  const url = typeof window !== "undefined" ? `${window.location.origin}/rejoindre/${vue.code}` : "";
  useEffect(() => {
    if (!url) return;
    QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#15131C", light: "#F6F1E7" } }).then(setQr);
  }, [url]);
  const fin = (n: number) => vue.anneeDepart + n - 1;
  const duree = (n: number) => (n === 30 ? "Partie complète" : "Partie courte");
  const temps = (n: number) => (n === 30 ? "env. 1 h 30" : "env. 1 h");

  return (
    <div style={{ ...CADRE, padding: "56px 72px", display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 72 }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <span style={{ flex: "none" }}><Logo taille={150} /></span>
            <BoutonMenu ouvrir={ouvrirMenu} style={{ font: "500 24px var(--texte)", padding: "14px 24px", borderRadius: 16 }} />
          </div>
          <p style={{ margin: "16px 0 0", fontSize: 34, color: "var(--texte-2)" }}>{vue.nbTours} ans pour comprendre l&apos;impact de chaque décision.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 44, background: "var(--surface)", borderRadius: 32, padding: 36 }}>
          <div style={{ background: "var(--craie)", borderRadius: 22, padding: 26, flex: "none", width: 352, height: 352 }} aria-label={`QR code vers ${url}`} role="img">
            <div style={{ width: 300, height: 300 }} dangerouslySetInnerHTML={{ __html: qr.replace("<svg", '<svg width="300" height="300"') }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <span style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.15 }}>Scannez avec votre téléphone pour entrer au sénat</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: 2, color: "var(--texte-3)" }}>CODE DE SALLE</span>
              <span className="titre" style={{ fontWeight: 800, fontSize: 104, lineHeight: 1, letterSpacing: 10, color: "var(--moutarde)" }}>{vue.code}</span>
            </div>
            <span style={{ fontSize: 22, color: "var(--texte-3)" }}>{url.replace(/^https?:\/\//, "")}</span>
          </div>
        </div>
        <div style={{ marginTop: "auto", display: "flex", gap: 14 }}>
          <button type="button" onClick={ouvrirTuto}
            style={{ display: "inline-flex", alignItems: "center", gap: 12, background: "var(--surface)", color: "var(--craie)", border: "2px solid var(--trait-2)", borderRadius: 16, padding: "14px 24px", font: "700 24px var(--texte)", cursor: "pointer" }}>
            <span aria-hidden="true" className="titre" style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--moutarde)", color: "var(--encre)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>?</span>
            Comment jouer
          </button>
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 32, minHeight: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, background: "var(--surface)", borderRadius: 32, padding: "34px 36px", flex: 1, minHeight: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <h2 className="titre" style={{ margin: 0, fontWeight: 700, fontSize: 42 }}>Le sénat</h2>
            <span className="tabnum" style={{ fontSize: 28, fontWeight: 700 }}>
              {vue.joueurs.length} <span style={{ color: "var(--texte-3)", fontWeight: 500 }}>connecté{vue.joueurs.length > 1 ? "s" : ""}</span>
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 14, alignContent: "start" }}>
            {vue.joueurs.slice(0, 26).map((j, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--surface-2)", borderRadius: 16, padding: "10px 14px", animation: "apparition .4s ease" }}>
                <span style={{ width: 44, height: 44, flex: "none", borderRadius: "50%", background: j.couleur, color: "var(--encre)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 22 }}>
                  {j.pseudo.charAt(0).toUpperCase()}
                </span>
                <span style={{ fontSize: 24, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.pseudo}</span>
              </div>
            ))}
            {vue.joueurs.length > 26 && <div style={{ fontSize: 24, color: "var(--texte-3)", alignSelf: "center" }}>+ {vue.joueurs.length - 26} autres</div>}
            <div style={{ display: "flex", alignItems: "center", gap: 14, border: "2px dashed var(--trait-2)", borderRadius: 16, padding: "8px 12px", color: "var(--texte-3)" }}>
              <span style={{ width: 44, height: 44, flex: "none", borderRadius: "50%", border: "2px dashed var(--trait-2)" }} />
              <span style={{ fontSize: 23 }}>En attente…</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Info texte="Un tour = une année et une décision. La partie complète couvre trois décennies : assez pour voir arriver les effets lents (retraites, éducation, climat)."><span style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2, color: "var(--texte-3)" }}>DURÉE DE LA PARTIE</span></Info>
            <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 20, color: "var(--texte-3)" }}>
              <Info texte="Temps laissé pour voter à chaque tour. Il peut être changé avant le début de la partie." style={{ alignItems: "center", gap: 10 }}><IconeHorloge /> Minuteur de vote</Info>
              {[45, 60, 90].map((s) => (
                <button key={s} type="button" disabled={!controle || occupe} onClick={() => agir({ action: "configurer", dureeVote: s })} aria-pressed={vue.dureeVote === s}
                  style={{ background: vue.dureeVote === s ? "var(--moutarde)" : "transparent", color: vue.dureeVote === s ? "var(--encre)" : "var(--craie)", border: "2px solid var(--trait-2)", borderRadius: 10, padding: "4px 12px", fontSize: 19, fontWeight: 700, cursor: "pointer" }}>
                  {s} s
                </button>
              ))}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 18 }} role="radiogroup" aria-label="Durée de la partie">
            {vue.toursPossibles.map((n) => {
              const actif = vue.nbTours === n;
              return (
                <button key={n} type="button" role="radio" aria-checked={actif} disabled={!controle || occupe} onClick={() => agir({ action: "configurer", nbTours: n })}
                  style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, textAlign: "left", background: actif ? "var(--surface-2)" : "var(--surface)", color: "var(--craie)", border: `4px solid ${actif ? "var(--moutarde)" : "var(--trait)"}`, borderRadius: 24, padding: "22px 26px", cursor: "pointer" }}>
                  <span className="titre" style={{ display: "flex", alignItems: "center", gap: 12, fontWeight: 800, fontSize: 44, lineHeight: 1 }}>
                    {n} tours {actif && <IconeCoche taille={34} couleur="#FFD23F" />}
                  </span>
                  <span style={{ fontSize: 22, color: "var(--texte-2)" }}>
                    {duree(n)} · {vue.anneeDepart} à {fin(n)} · {temps(n)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <button type="button" className="btn-principal" disabled={!controle || occupe} onClick={demarrer}
          style={{ borderRadius: 26, padding: 30, fontSize: 50 }}>
          Démarrer la partie <IconeFleche taille={46} />
        </button>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Élection de la présidence                                           */

function EnTeteSimple({ ouvrirMenu, children }: { ouvrirMenu: () => void; children?: ReactNode }) {
  return (
    <header style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <Logo taille={46} />
      <BoutonMenu ouvrir={ouvrirMenu} />
      <div style={{ flex: 1 }} />
      {children}
    </header>
  );
}

function Election({ vue, agir, occupe, controle, decalage, ouvrirMenu }: PropsEcran & { decalage: number }) {
  const restant = useRestant(vue.echeance, decalage);
  const nb = vue.joueurs.length;
  return (
    <div style={{ ...CADRE, padding: "34px 56px", display: "flex", flexDirection: "column", gap: 30 }}>
      <EnTeteSimple ouvrirMenu={ouvrirMenu}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, background: "var(--surface)", borderRadius: 22, padding: "14px 22px 14px 18px" }}>
          <Anneau restant={restant} total={vue.dureeVote} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span className="titre tabnum" style={{ fontWeight: 800, fontSize: 52, lineHeight: 1, color: restant <= 10 ? "var(--n1)" : "var(--moutarde)" }}>{formatMinuteur(restant)}</span>
            <span style={{ fontSize: 19, color: "var(--texte-3)" }}>pour voter</span>
          </div>
          {controle && (
            <button type="button" className="btn-contour" disabled={occupe} onClick={() => agir({ action: "clore" })} style={{ fontSize: 19, padding: "10px 14px", marginLeft: 8 }}>
              Clore
            </button>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, background: "var(--surface)", borderRadius: 22, padding: "14px 26px" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span className="titre tabnum" style={{ fontWeight: 800, fontSize: 52, lineHeight: 1 }}>
              {vue.nbVotes}
              <span style={{ color: "var(--gris)" }}> / {nb}</span>
            </span>
            <span style={{ fontSize: 19, color: "var(--texte-3)" }}>ont voté</span>
          </div>
          <Points n={vue.nbVotes} total={Math.max(nb, 1)} taille={nb > 18 ? 16 : 22} />
        </div>
      </EnTeteSimple>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12, fontSize: 24, fontWeight: 700, letterSpacing: 2, color: "var(--moutarde)" }}>
          <IconeCouronne taille={30} /> AVANT {vue.anneeDepart} · PREMIER VOTE
        </span>
        <h1 className="titre" style={{ margin: 0, fontWeight: 800, fontSize: 104, lineHeight: 1, letterSpacing: -3 }}>Qui préside le sénat ?</h1>
        <p style={{ margin: 0, fontSize: 32, lineHeight: 1.35, color: "var(--texte-2)", maxWidth: 1500 }}>
          Votez sur votre téléphone pour l&apos;une des personnes présentes. En cas d&apos;égalité lors d&apos;un vote, <b style={{ color: "var(--craie)" }}>sa voix comptera double</b> ; si l&apos;égalité persiste, le sort tranche.
        </p>
      </div>

      <div style={{ flex: 1, minHeight: 0, background: "var(--surface)", borderRadius: 32, padding: "30px 34px", display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 16, alignContent: "start", overflow: "hidden" }}>
        {vue.joueurs.length === 0 && <span style={{ fontSize: 28, color: "var(--texte-3)", gridColumn: "1 / -1" }}>Personne n&apos;a rejoint la salle : la partie se jouera sans présidence.</span>}
        {vue.joueurs.slice(0, 28).map((j, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--surface-2)", borderRadius: 18, padding: "12px 16px" }}>
            <span style={{ width: 52, height: 52, flex: "none", borderRadius: "50%", background: j.couleur, color: "var(--encre)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 26 }}>{j.pseudo.charAt(0).toUpperCase()}</span>
            <span style={{ fontSize: 28, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.pseudo}</span>
          </div>
        ))}
      </div>
      <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 10, fontSize: 21, color: "var(--texte-3)" }}>
        <IconeCadenas /> Vote anonyme. Chacun peut voter pour soi.
      </p>
    </div>
  );
}

function Presidence({ vue, agir, occupe, controle, ouvrirMenu }: PropsEcran) {
  const e = vue.election;
  const [animation, setAnimation] = useState(true);
  const elu = vue.presidence;
  const max = Math.max(1, ...(e?.decompte.map((d) => d.voix) ?? [1]));
  const fin = useMemo(() => () => setAnimation(false), []);
  return (
    <div style={{ ...CADRE, padding: "34px 56px", display: "flex", flexDirection: "column", gap: 30, position: "relative" }}>
      <EnTeteSimple ouvrirMenu={ouvrirMenu}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 24, fontWeight: 700, background: "var(--surface)", padding: "14px 22px", borderRadius: 18 }}>
          <IconeCadenas /> Vote clos · {e?.nbVotes ?? 0} / {vue.joueurs.length} ont voté
        </span>
      </EnTeteSimple>
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0,6fr) minmax(0,5fr)", gap: 48, alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 22, animation: "apparition .6s ease" }}>
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: 2, color: "var(--moutarde)" }}>
            {!elu ? "PAS DE PRÉSIDENCE" : e?.aucunVote ? "PERSONNE N'A VOTÉ : LE SORT A DÉSIGNÉ" : e?.egalite ? "ÉGALITÉ TRANCHÉE AU SORT" : "LE SÉNAT A ÉLU"}
          </span>
          {elu ? (
            <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
              <span style={{ width: 150, height: 150, flex: "none", borderRadius: "50%", background: elu.couleur, color: "var(--encre)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 80, position: "relative" }} className="titre">
                {elu.pseudo.charAt(0).toUpperCase()}
                <span style={{ position: "absolute", top: -44, left: "50%", transform: "translateX(-50%)" }}><IconeCouronne taille={64} couleur="#FFD23F" /></span>
              </span>
              <h1 className="titre" style={{ margin: 0, fontWeight: 800, fontSize: elu.pseudo.length > 10 ? 100 : 140, lineHeight: 1, letterSpacing: -3, overflowWrap: "anywhere" }}>{elu.pseudo}</h1>
            </div>
          ) : (
            <h1 className="titre" style={{ margin: 0, fontWeight: 800, fontSize: 80 }}>Personne dans la salle</h1>
          )}
          <p style={{ margin: 0, fontSize: 32, lineHeight: 1.35, color: "var(--texte-2)" }}>
            {elu
              ? <>préside le sénat jusqu&apos;en {vue.anneeDepart + vue.nbTours - 1}. Quand un vote est à égalité, sa voix compte double. Si l&apos;égalité persiste, le sort tranche.</>
              : <>Les égalités seront tranchées au sort.</>}
          </p>
        </div>
        {e && e.decompte.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: 14, background: "var(--surface)", borderRadius: 28, padding: "28px 32px", maxHeight: "100%", overflow: "hidden" }}>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Répartition des votes</h2>
            {e.decompte.slice(0, 10).map((d) => (
              <div key={d.pseudo} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 23, fontWeight: d.elu ? 700 : 400 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.pseudo}</span>
                  <span className="tabnum" style={{ fontWeight: 700, color: d.elu ? "var(--moutarde)" : undefined }}>{d.voix} vote{d.voix > 1 ? "s" : ""}</span>
                </div>
                <div style={{ height: 20, background: "var(--piste)", borderRadius: 10 }}>
                  <div style={{ width: `${(d.voix / max) * 100}%`, height: "100%", background: d.elu ? "var(--moutarde)" : "var(--gris)", borderRadius: 10, transition: "width .8s ease" }} />
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
      {controle && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="btn-principal" disabled={occupe} onClick={() => agir({ action: "suivant" })} style={{ fontSize: 34, padding: "22px 36px", borderRadius: 22 }}>
            Commencer {vue.anneeDepart} <IconeFleche taille={32} />
          </button>
        </div>
      )}
      {animation && e?.egalite && e.exAequo.length > 1 && <TirageAuSort noms={e.exAequo} fin={fin} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Colonne des jauges + panneau des indicateurs                        */

function ColonneJauges({ vue, ouvrirIndicateurs, ouvrirMenu }: { vue: VuePublique; ouvrirIndicateurs: () => void; ouvrirMenu: () => void }) {
  return (
    <aside style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
      <div style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Logo taille={46} />
        <BoutonMenu ouvrir={ouvrirMenu} />
      </div>
      {vue.presidence && <InfoPresidence pseudo={vue.presidence.pseudo} taille={20} />}
      {vue.jauges.map((j) => (
        <Info key={j.id} bloc texte={<BulleJauge vue={vue} id={j.id} />}>
          <JaugeLigne j={j} seuil={vue.seuil} anneeSuivante={vue.annee + 1} />
        </Info>
      ))}
      <span style={{ marginTop: "auto", fontSize: 16, color: "var(--texte-3)" }}>Survolez un élément pour en voir le détail.</span>
      <Info bloc texte="Les vrais chiffres derrière chaque jauge, mis à jour année après année : le point de départ vient des statistiques officielles (INSEE, Eurostat, Banque de France…).">
      <button type="button" onClick={ouvrirIndicateurs}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", color: "var(--craie)", border: "2px solid var(--trait)", borderRadius: 14, padding: "12px 18px", font: "500 21px var(--texte)", cursor: "pointer" }}>
        Indicateurs chiffrés ({vue.indicateurs.length})
        <IconeFleche />
      </button>
      </Info>
    </aside>
  );
}

function BulleJauge({ vue, id }: { vue: VuePublique; id: VueJauge["id"] }) {
  const j = vue.jauges.find((x) => x.id === id)!;
  const inds = vue.indicateurs.filter((i) => i.jauge === id);
  return (
    <>
      <TitreBulle>{j.nom.toUpperCase()} · {j.valeur} / 100</TitreBulle>
      {DESCRIPTION_JAUGE[id]}
      <span style={{ display: "block", marginTop: 8, color: "var(--texte-2)", fontSize: 18 }}>
        {inds.slice(0, 7).map((i) => `${i.nom} : ${formatNombre(i.valeur, i.decimales)} ${i.unite}`).join(" · ")}
      </span>
      <span style={{ display: "block", marginTop: 8, fontSize: 18, color: "var(--texte-3)" }}>
        Flèche : {LIBELLE_NIVEAU[j.tendance]} depuis l&apos;an dernier. Trait vertical : seuil d&apos;alerte ({vue.seuil}). Sous ce seuil, une crise liée éclate l&apos;année suivante.
      </span>
    </>
  );
}

function PanneauIndicateurs({ vue, fermer }: { vue: VuePublique; fermer: () => void }) {
  const parJauge = useMemo(() => {
    const m = new Map<string, VueIndicateur[]>();
    for (const i of vue.indicateurs) m.set(i.jauge, [...(m.get(i.jauge) ?? []), i]);
    return m;
  }, [vue.indicateurs]);
  return (
    <div role="dialog" aria-modal="true" aria-label="Indicateurs chiffrés" onClick={fermer}
      style={{ position: "absolute", inset: 0, background: "rgba(21,19,28,.97)", padding: "40px 48px", display: "flex", flexDirection: "column", gap: 20, zIndex: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 className="titre" style={{ margin: 0, fontSize: 48, fontWeight: 800 }}>Les vrais chiffres en {vue.annee}</h2>
        <button type="button" className="btn-contour" onClick={fermer} style={{ fontSize: 22, padding: "10px 20px" }}>Fermer</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 18, flex: 1, minHeight: 0 }} onClick={(e) => e.stopPropagation()}>
        {vue.jauges.map((j) => (
          <section key={j.id} style={{ background: "var(--surface)", borderRadius: 18, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
            <h3 style={{ margin: "0 0 4px", display: "flex", alignItems: "center", gap: 10, fontSize: 22 }}>
              <IconeJauge id={j.id} taille={24} /> {j.nom} <span className="tabnum" style={{ marginLeft: "auto", color: "var(--moutarde)" }}>{j.valeur}</span>
            </h3>
            {(parJauge.get(j.id) ?? []).map((i) => (
              <Info key={i.id} bloc texte={<><TitreBulle>{i.nom.toUpperCase()}</TitreBulle>Point de départ : {i.source} ({i.annee}).{i.provisoire ? " Valeur provisoire : donnée récente introuvable, ancienne ou approchée." : ""} La valeur évolue ensuite chaque année selon le modèle, les événements et vos décisions.</>}
                style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 17, borderTop: "1px solid var(--trait)", paddingTop: 5 }}>
                <span style={{ color: "var(--texte-2)" }}>{i.nom}{i.provisoire ? " *" : ""}</span>
                <span className="tabnum" style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{formatNombre(i.valeur, i.decimales)} <span style={{ color: "var(--texte-3)", fontWeight: 500 }}>{i.unite}</span></span>
              </Info>
            ))}
          </section>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 17, color: "var(--texte-3)" }}>* valeur de départ provisoire (donnée introuvable ou ancienne). Le jeu est une simplification pédagogique : les effets sont des ordres de grandeur, pas des prévisions.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tour en cours : annonce puis vote                                   */

function BandeauEvenement({ vue }: { vue: VuePublique }) {
  const e = vue.evenement;
  if (!e) return null;
  const negatif = e.nature === "negatif";
  return (
    <Info bloc texte={<><TitreBulle>ÉVÉNEMENT DE L&apos;ANNÉE</TitreBulle>{e.alerte ? `Déclenché parce que la jauge ${e.alerte} est passée sous le seuil d'alerte l'an dernier.` : "Tiré au sort chaque année, indépendamment de vos choix : il arrive aussi dans la trajectoire « sans intervention »."} Ses effets s&apos;appliquent déjà aux jauges ; les pastilles montrent son impact estimé.</>}
      style={{ display: "flex", alignItems: "center", gap: 22, background: "var(--surface-2)", borderRadius: 20, padding: "16px 26px", animation: "apparition .5s ease" }}>
      <div style={{ width: 64, height: 64, flex: "none", borderRadius: 16, background: negatif ? "var(--n2)" : "var(--p2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--encre)", fontSize: 34, fontWeight: 800 }} aria-hidden="true">
        {negatif ? "!" : "+"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: 1.5, color: negatif ? "#FFB3BA" : "#9BF0C2" }}>
          ÉVÉNEMENT {vue.annee} · {e.alerte ? `DÉCLENCHÉ PAR L'ALERTE ${e.alerte.toUpperCase()}` : negatif ? "COUP DUR" : "BONNE NOUVELLE"}
        </span>
        <span style={{ fontSize: 30, fontWeight: 700 }}>{e.titre}</span>
        <span style={{ fontSize: 21, color: "var(--texte-2)" }}>{e.description}</span>
      </div>
      <Pastilles liste={e.pastilles} taille={19} style={{ flex: "none", maxWidth: 520, justifyContent: "flex-end" }} />
    </Info>
  );
}

function Tour({ vue, agir, occupe, controle, decalage, ouvrirMenu }: PropsEcran & { decalage: number }) {
  const [indicateurs, setIndicateurs] = useState(false);
  const restant = useRestant(vue.echeance, decalage);
  const carte = vue.carte;
  const nb = vue.joueurs.length;

  return (
    <div style={{ ...CADRE, padding: "34px 44px", display: "grid", gridTemplateColumns: "440px minmax(0,1fr)", gap: 40, position: "relative" }}>
      <ColonneJauges vue={vue} ouvrirIndicateurs={() => setIndicateurs(true)} ouvrirMenu={ouvrirMenu} />
      <main style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0, minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <Info texte={<BulleAnnee vue={vue} />} style={{ alignItems: "baseline", gap: 22 }}>
            <span className="titre tabnum" style={{ fontWeight: 800, fontSize: 96, lineHeight: 0.9, letterSpacing: -3 }}>{vue.annee}</span>
            <span style={{ fontSize: 26, fontWeight: 700, background: "var(--surface-2)", padding: "8px 18px", borderRadius: 999 }}>Tour {vue.tour} / {vue.nbTours}</span>
          </Info>
          <div style={{ flex: 1 }} />
          {vue.phase === "vote" ? (
            <Info texte="Le vote se ferme automatiquement à zéro, côté serveur : les votes arrivés après ne comptent pas. L'hôte peut aussi le clore plus tôt quand tout le monde a voté." style={{ alignItems: "center", gap: 18, background: "var(--surface)", borderRadius: 22, padding: "14px 22px 14px 18px" }}>
              <Anneau restant={restant} total={vue.dureeVote} />
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span className="titre tabnum" style={{ fontWeight: 800, fontSize: 52, lineHeight: 1, color: restant <= 10 ? "var(--n1)" : "var(--moutarde)" }}>{formatMinuteur(restant)}</span>
                <span style={{ fontSize: 19, color: "var(--texte-3)" }}>pour voter</span>
              </div>
              {controle && (
                <button type="button" className="btn-contour" disabled={occupe} onClick={() => agir({ action: "clore" })} style={{ fontSize: 19, padding: "10px 14px", marginLeft: 8 }}>
                  Clore
                </button>
              )}
            </Info>
          ) : (
            controle &&
            carte && (
              <button type="button" className="btn-principal" disabled={occupe} onClick={() => agir({ action: "ouvrirVote" })} style={{ fontSize: 34, padding: "22px 30px", borderRadius: 22 }}>
                Ouvrir le vote · {vue.dureeVote} s <IconeFleche taille={32} />
              </button>
            )
          )}
          <Info texte="Nombre de personnes qui ont déjà voté. Le vote est anonyme : personne, pas même l'hôte, ne sait qui a voté quoi. Chacun peut changer d'avis jusqu'à la clôture." style={{ alignItems: "center", gap: 20, background: "var(--surface)", borderRadius: 22, padding: "14px 26px" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span className="titre tabnum" style={{ fontWeight: 800, fontSize: 52, lineHeight: 1 }}>
                {vue.phase === "vote" ? vue.nbVotes : 0}
                <span style={{ color: "var(--gris)" }}> / {nb}</span>
              </span>
              <span style={{ fontSize: 19, color: "var(--texte-3)" }}>ont voté</span>
            </div>
            <Points n={vue.phase === "vote" ? vue.nbVotes : 0} total={Math.max(nb, 1)} taille={nb > 18 ? 16 : 22} />
          </Info>
        </div>

        <BandeauEvenement vue={vue} />
        {(vue.arrivees.length > 0 || vue.resonances.length > 0) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 19, color: "var(--texte-2)" }}>
            {vue.resonances.map((r) => (
              <Info key={r.titre} texte={<><TitreBulle>COMBINAISON DE DÉCISIONS</TitreBulle>{r.explication}</>} style={{ background: "var(--surface)", border: "2px solid var(--violet)", borderRadius: 12, padding: "6px 14px", display: "inline-block" }}>
                <b style={{ color: "var(--violet)" }}>Combinaison · </b>{r.titre}
              </Info>
            ))}
            {vue.arrivees.slice(0, 3).map((a) => (
              <Info key={a} texte="Effet différé : une décision prise une année précédente commence à agir cette année. Ses effets sont déjà dans les jauges." style={{ background: "var(--surface)", borderRadius: 12, padding: "6px 14px", alignItems: "center", gap: 8 }}>
                <IconeHorloge taille={18} /> {a}
              </Info>
            ))}
          </div>
        )}

        {carte ? <Carte carte={carte} /> : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, fontSize: 30, color: "var(--texte-2)" }}>
            Aucune décision à prendre cette année : toutes les cartes disponibles ont été jouées.
            {controle && (
              <button type="button" className="btn-principal" disabled={occupe} onClick={() => agir({ action: "suivant" })} style={{ fontSize: 28, padding: "18px 34px" }}>
                Passer à {vue.annee + 1} <IconeFleche />
              </button>
            )}
          </div>
        )}
      </main>
      {indicateurs && <PanneauIndicateurs vue={vue} fermer={() => setIndicateurs(false)} />}
    </div>
  );
}

const TEXTE_TYPE: Record<VueCarte["type"], string> = {
  unique: "Chacun choisit une option. La plus votée est appliquée. En cas d'égalité, la voix de la présidence compte double, puis le sort tranche.",
  cumulable: "Chacun choisit une option. Les deux plus votées sont appliquées ensemble.",
  curseur: "Chacun place le curseur. La valeur médiane du sénat est appliquée.",
};

function BulleAnnee({ vue }: { vue: VuePublique }) {
  return (
    <>
      <TitreBulle>ANNÉE {vue.annee}</TitreBulle>
      Chaque tour représente une année. L&apos;évolution naturelle (vieillissement, dette, climat…) et les effets différés des votes passés sont déjà appliqués aux jauges. Fin de partie en {vue.anneeDepart + vue.nbTours - 1}.
    </>
  );
}

function Carte({ carte }: { carte: VueCarte }) {
  const curseur = carte.type === "curseur";
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Info texte={<><TitreBulle>TYPE DE VOTE</TitreBulle>{TEXTE_TYPE[carte.type]}</>} style={{ alignSelf: "flex-start" }}>
          <Puce fond={curseur ? "var(--moutarde)" : "var(--craie)"}>{libelleType(carte.type, true)}</Puce>
        </Info>
        <h1 className="titre" style={{ margin: 0, fontWeight: 700, fontSize: 52, lineHeight: 1.05, letterSpacing: -1 }}>{carte.titre}</h1>
        <p style={{ margin: 0, fontSize: 22, color: "var(--texte-3)", lineHeight: 1.3 }}>{carte.contexte}</p>
      </div>
      {curseur && carte.curseur && <Echelle carte={carte} />}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${carte.options.length}, minmax(0,1fr))`, gap: 22, flex: 1, minHeight: 0 }}>
        {carte.options.map((o) => (
          <div key={o.id} style={{ display: "flex", flexDirection: "column", gap: curseur ? 12 : 14, background: "var(--surface)", border: "2px solid var(--trait)", borderRadius: 24, padding: curseur ? "20px 24px" : "22px 26px", minHeight: 0, overflow: "hidden" }}>
            {curseur ? (
              <span className="titre" style={{ fontWeight: 800, fontSize: 36, lineHeight: 1 }}>{o.titre}</span>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span className="titre" style={{ width: 48, height: 48, flex: "none", borderRadius: "50%", border: "3px solid var(--moutarde)", color: "var(--moutarde)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 26 }}>{o.lettre}</span>
                <span className="titre" style={{ fontWeight: 700, fontSize: carte.options.length > 3 ? 28 : 33, lineHeight: 1.05 }}>{o.titre}</span>
              </div>
            )}
            <MentionDuree duree={o.duree} taille={curseur ? 17 : 18} />
            <p style={{ margin: 0, fontSize: carte.options.length > 3 ? 20 : 22, lineHeight: 1.35, color: "var(--texte-2)" }}>{o.explication}</p>
            <Pastilles liste={o.pastilles} taille={carte.options.length > 3 ? 18 : 20} style={{ marginTop: "auto" }} />
          </div>
        ))}
      </div>
    </>
  );
}

function Echelle({ carte }: { carte: VueCarte }) {
  const c = carte.curseur!;
  const valeursOptions = new Set(carte.options.map((o) => o.valeur));
  const pos = (v: number) => `${((v - c.min) / (c.max - c.min)) * 100}%`;
  return (
    <div style={{ background: "var(--surface)", borderRadius: 24, padding: "20px 56px 16px" }}>
      <div style={{ position: "relative", height: 50 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 20, height: 12, borderRadius: 99, background: "var(--piste)" }} />
        {c.valeurs.map((v) => {
          const fort = valeursOptions.has(v);
          return <div key={v} style={{ position: "absolute", left: pos(v), top: fort ? 14 : 17, width: fort ? 24 : 18, height: fort ? 24 : 18, marginLeft: fort ? -12 : -9, borderRadius: "50%", background: fort ? "var(--craie)" : "#6B6479" }} />;
        })}
      </div>
      <div className="titre tabnum" style={{ position: "relative", height: 52, fontWeight: 800 }}>
        {c.valeurs.map((v) => {
          const fort = valeursOptions.has(v);
          return (
            <span key={v} style={{ position: "absolute", left: pos(v), transform: "translateX(-50%)", fontSize: fort ? 42 : 30, color: fort ? undefined : "var(--gris)", top: fort ? 0 : 8, whiteSpace: "nowrap" }}>
              {formatNombre(v, v % 1 ? 1 : 0)}
            </span>
          );
        })}
      </div>
      <Info bloc texte="Chacun place le curseur sur son téléphone. On retient la médiane : la moitié du sénat veut moins, l'autre moitié plus. Les grands points sont les options décrites ci-dessous ; les valeurs entre les deux ont des effets intermédiaires." style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 20, color: "var(--texte-3)" }}>
        <IconeCadenas /> Les positions de chacun restent secrètes : la médiane est révélée à la clôture
      </Info>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Résultat                                                            */

function TirageAuSort({ noms, fin }: { noms: string[]; fin: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => x + 1), 160);
    const f = setTimeout(fin, 2600);
    return () => {
      clearInterval(t);
      clearTimeout(f);
    };
  }, [fin]);
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(21,19,28,.94)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 30, zIndex: 5 }}>
      <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: 3, color: "var(--moutarde)" }}>ÉGALITÉ · TIRAGE AU SORT</span>
      <span className="titre" style={{ fontSize: 90, fontWeight: 800, animation: "tirage .32s linear infinite" }}>{noms[i % noms.length]}</span>
    </div>
  );
}

/** Imprévu : apparaît avec un léger retard, après la révélation du choix. */
function BandeauImprevu({ imprevu }: { imprevu: VueImprevu }) {
  const negatif = imprevu.nature === "negatif";
  return (
    <Info bloc texte={<><TitreBulle>IMPRÉVU</TitreBulle>Une conséquence que la carte n&apos;annonçait pas, tirée au sort après le vote. Chaque décision a ses risques et ses bonnes surprises ; un même imprévu ne revient jamais deux fois dans une partie.</>}
      style={{ display: "flex", alignItems: "center", gap: 22, background: "var(--surface-2)", border: "3px dashed var(--violet)", borderRadius: 20, padding: "14px 24px", animation: "apparition .6s ease 1.6s both" }}>
      <div style={{ width: 60, height: 60, flex: "none", borderRadius: 16, background: "var(--violet)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--encre)", fontSize: 36, fontWeight: 800 }} aria-hidden="true">
        ?!
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: 1.5, color: "var(--violet)" }}>
          IMPRÉVU · {negatif ? "UN EFFET QUE PERSONNE N'AVAIT VU VENIR" : "UNE BONNE SURPRISE"}
        </span>
        <span style={{ fontSize: 28, fontWeight: 700 }}>{imprevu.titre}</span>
        <span style={{ fontSize: 20, color: "var(--texte-2)" }}>{imprevu.description}</span>
      </div>
      <Pastilles liste={imprevu.pastilles} taille={18} chiffre style={{ flex: "none", maxWidth: 480, justifyContent: "flex-end" }} />
    </Info>
  );
}

function Resultat({ vue, agir, occupe, controle, ouvrirMenu }: PropsEcran) {
  const r = vue.resultat;
  const [animation, setAnimation] = useState(true);
  const [indicateurs, setIndicateurs] = useState(false);
  useEffect(() => setAnimation(true), [vue.annee]);
  if (!r) return null;
  const max = Math.max(1, ...r.decompte.map((d) => d.voix));
  const derniere = vue.tour >= vue.nbTours;
  return (
    <div style={{ ...CADRE, padding: "34px 44px", display: "grid", gridTemplateColumns: "440px minmax(0,1fr)", gap: 40, position: "relative" }}>
      <ColonneJauges vue={vue} ouvrirIndicateurs={() => setIndicateurs(true)} ouvrirMenu={ouvrirMenu} />
      <main style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0, minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <Info texte={<BulleAnnee vue={vue} />} style={{ alignItems: "center", gap: 22 }}>
            <span className="titre tabnum" style={{ fontWeight: 800, fontSize: 96, lineHeight: 0.9, letterSpacing: -3 }}>{vue.annee}</span>
            <span style={{ fontSize: 26, fontWeight: 700, background: "var(--surface-2)", padding: "8px 18px", borderRadius: 999 }}>Tour {vue.tour} / {vue.nbTours}</span>
          </Info>
          <div style={{ flex: 1 }} />
          <Info texte="Le vote est terminé : la décision est appliquée. Les pastilles chiffrées montrent maintenant l'écart réel estimé sur chaque jauge." style={{ alignItems: "center", gap: 10, fontSize: 24, fontWeight: 700, background: "var(--surface)", padding: "14px 22px", borderRadius: 18 }}>
            <IconeCadenas /> Vote clos · {r.nbVotes} / {vue.joueurs.length} ont voté
          </Info>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, animation: "apparition .5s ease" }}>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2, color: "var(--moutarde)" }}>
            {r.aucunVote
              ? "PERSONNE N'A VOTÉ : LE HASARD A CHOISI"
              : r.departagePresident
                ? `ÉGALITÉ · LA VOIX DE LA PRÉSIDENCE (${vue.presidence?.pseudo ?? ""}) A COMPTÉ DOUBLE`.replace(" ()", "")
                : r.egalite
                  ? "ÉGALITÉ TRANCHÉE AU SORT · LE SÉNAT A CHOISI"
                  : "LE SÉNAT A CHOISI"}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            {r.lettres.map((l) => (
              <span key={l} className="titre" style={{ width: 76, height: 76, flex: "none", borderRadius: "50%", background: "var(--moutarde)", color: "var(--encre)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 42 }}>{l}</span>
            ))}
            <h1 className="titre" style={{ margin: 0, fontWeight: 800, fontSize: r.titre.length > 34 ? 60 : 78, lineHeight: 1, letterSpacing: -2 }}>{r.titre}</h1>
          </div>
          <p style={{ margin: 0, fontSize: 24, color: "var(--texte-2)" }}>{r.explication}</p>
          <Pastilles liste={r.pastilles} taille={20} chiffre style={{ marginTop: 6 }} />
        </div>

        {r.imprevu && <BandeauImprevu imprevu={r.imprevu} />}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,5fr) minmax(0,7fr)", gap: 26, flex: 1, minHeight: 0 }}>
          <section style={{ display: "flex", flexDirection: "column", gap: 16, background: "var(--surface)", borderRadius: 24, padding: "24px 28px", minHeight: 0, overflow: "hidden" }}>
            <Info bloc texte={vue.carte?.type === "curseur" ? "Nombre de votes pour chaque valeur. La valeur retenue est la médiane (en jaune)." : vue.carte?.type === "cumulable" ? "Nombre de voix par option. Les deux options les plus votées sont retenues (en jaune)." : "Nombre de voix par option. L'option la plus votée est retenue (en jaune) ; en cas d'égalité, la voix de la présidence compte double, puis le sort tranche."}>
              <h2 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>Répartition des votes</h2>
            </Info>
            {r.decompte.map((d) => (
              <div key={d.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 21, fontWeight: d.retenue ? 700 : 400 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</span>
                  <span className="tabnum" style={{ fontWeight: 700, color: d.retenue ? "var(--moutarde)" : undefined, whiteSpace: "nowrap" }}>{d.voix} vote{d.voix > 1 ? "s" : ""}</span>
                </div>
                <div style={{ height: r.decompte.length > 5 ? 18 : 26, background: "var(--piste)", borderRadius: 10 }}>
                  <div style={{ width: `${(d.voix / max) * 100}%`, height: "100%", background: d.retenue ? "var(--moutarde)" : "var(--gris)", borderRadius: 10, transition: "width .8s ease" }} />
                </div>
              </div>
            ))}
            <p style={{ margin: "auto 0 0", display: "flex", alignItems: "center", gap: 10, fontSize: 19, color: "var(--texte-3)" }}>
              <IconeCadenas /> Vote anonyme : personne ne sait qui a voté quoi.
            </p>
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--surface)", borderRadius: 24, padding: "24px 28px", minHeight: 0, overflow: "hidden" }}>
            <Info bloc texte="Les indicateurs réels qui changent dès cette année, avant → après, avec la jauge qu'ils font bouger. Cela inclut l'éventuel imprévu. Les 5 changements les plus marquants sont affichés.">
              <h2 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 700 }}>Ce qui bouge, en vrais chiffres</h2>
            </Info>
            {r.changements.length === 0 && <p style={{ margin: 0, fontSize: 22, color: "var(--texte-3)" }}>Rien ne bouge cette année : les effets arrivent plus tard.</p>}
            {r.changements.map((c) => (
              <div key={c.nom} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", alignItems: "center", gap: 18, padding: "8px 0", borderBottom: "1px solid var(--trait)" }}>
                <span style={{ fontSize: 22 }}>{c.nom}</span>
                <span className="tabnum" style={{ fontSize: 24, fontWeight: 700, whiteSpace: "nowrap" }}>
                  {formatNombre(c.avant, c.decimales)} <span style={{ color: "var(--gris)" }}>→</span> {formatNombre(c.apres, c.decimales)} <span style={{ fontSize: 18, color: "var(--texte-3)", fontWeight: 500 }}>{c.unite}</span>
                </span>
                {c.pastille ? <Pastilles liste={[c.pastille]} taille={17} /> : <span />}
              </div>
            ))}
            {r.programme.length > 0 && (
              <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10, background: "var(--surface-2)", borderRadius: 16, padding: "14px 18px" }}>
                <Info texte="Effets différés de cette décision : ils s'appliqueront automatiquement les années indiquées. Les alertes en cours y figurent aussi : une jauge sous le seuil déclenchera un événement l'an prochain." style={{ alignItems: "center", gap: 10, fontSize: 18, fontWeight: 700, letterSpacing: 1.5, color: "var(--texte-3)" }}>
                  <IconeHorloge /> PROGRAMMÉ POUR LA SUITE
                </Info>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 19 }}>
                  {r.programme.map((p, i) => (
                    <span key={i} style={{ background: "var(--surface)", borderRadius: 12, padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <b>{p.annee}</b> · {p.texte}
                      {p.pastille && <span className={`fleche-${p.pastille.niveau}`} style={{ fontWeight: 700 }}>{p.pastille.niveau.startsWith("p") ? "▲" : "▼"} {p.pastille.nom}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <p style={{ margin: 0, flex: 1, fontSize: 19, color: "var(--texte-3)", lineHeight: 1.35 }}>
            <Info texte="Un repère pour comprendre le débat réel derrière cette décision. Le jeu simplifie : les effets sont des ordres de grandeur plausibles, pas des prévisions."><b style={{ color: "var(--texte-2)" }}>Le saviez-vous ?</b></Info> {r.notePedagogique}
          </p>
          {controle && (
            <button type="button" className="btn-principal" disabled={occupe} onClick={() => agir({ action: "suivant" })} style={{ fontSize: 28, padding: "18px 34px", flex: "none" }}>
              {derniere ? "Voir le bilan" : `Passer à ${vue.annee + 1}`} <IconeFleche taille={28} />
            </button>
          )}
        </div>
      </main>
      {indicateurs && <PanneauIndicateurs vue={vue} fermer={() => setIndicateurs(false)} />}
      {animation && r.egalite && r.exAequo.length > 1 && <TirageAuSort noms={r.exAequo} fin={() => setAnimation(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fin de partie                                                       */

function Fin({ vue, ouvrirMenu }: { vue: VuePublique; ouvrirMenu: () => void }) {
  const b = vue.bilan;
  if (!b) return null;
  return (
    <div style={{ ...CADRE, padding: "36px 56px", display: "flex", flexDirection: "column", gap: 22 }}>
      <header style={{ display: "flex", alignItems: "flex-end", gap: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2, color: "var(--moutarde)" }}>
            FIN DE PARTIE · {vue.nbTours} TOURS · {vue.joueurs.length} SÉNATEUR{vue.joueurs.length > 1 ? "S" : ""}
          </span>
          <h1 className="titre" style={{ margin: 0, fontWeight: 800, fontSize: 76, lineHeight: 1, letterSpacing: -2 }}>Votre France en {b.anneeFin}</h1>
        </div>
        <div style={{ flex: 1 }} />
        <Logo taille={40} />
        <BoutonMenu ouvrir={ouvrirMenu} />
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,11fr) minmax(0,9fr)", gap: 28, flex: 1, minHeight: 0 }}>
        <section style={{ display: "flex", flexDirection: "column", gap: 12, background: "var(--surface)", borderRadius: 26, padding: "24px 30px", minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 700, flex: 1 }}>De {b.anneeDebut} à {b.anneeFin}</h2>
            <Info texte={`Valeur de la jauge en ${b.anneeDebut}, avec les derniers chiffres officiels.`} style={{ alignItems: "center", gap: 8, fontSize: 18, color: "var(--texte-2)" }}><span style={{ width: 4, height: 20, background: "var(--gris)", borderRadius: 2 }} />Départ</Info>
            <Info texte="La même partie rejouée sans aucune décision : mêmes événements tirés au sort, seule l'évolution naturelle agit. C'est la référence pour juger vos choix." style={{ alignItems: "center", gap: 8, fontSize: 18, color: "var(--texte-2)" }}><span style={{ width: 14, height: 14, border: "3px solid var(--violet)", borderRadius: "50%" }} />Sans intervention</Info>
            <Info texte={`Où en est chaque jauge en ${b.anneeFin} après toutes vos décisions.`} style={{ alignItems: "center", gap: 8, fontSize: 18, color: "var(--texte-2)" }}><span style={{ width: 22, height: 10, background: "var(--moutarde)", borderRadius: 99 }} />Votre partie</Info>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "250px minmax(0,1fr) 120px", alignItems: "center", columnGap: 20, rowGap: 14, fontSize: 23 }}>
            {b.jauges.map((j) => (
              <JaugeFin key={j.id} nom={j.nom} depart={j.depart} fin={j.fin} sans={j.sans} />
            ))}
          </div>
          <Info bloc texte="Les événements les plus marquants de la partie, et la décision prise la même année.">
            <h3 style={{ margin: "10px 0 0", fontSize: 21, fontWeight: 700, letterSpacing: 1.5, color: "var(--texte-3)" }}>MOMENTS CLÉS</h3>
          </Info>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 14 }}>
            {b.moments.map((m) => (
              <div key={m.annee + m.evenement} style={{ display: "flex", flexDirection: "column", gap: 4, background: "var(--surface-2)", borderRadius: 16, padding: "12px 16px" }}>
                <span className="titre" style={{ fontWeight: 800, fontSize: 28, color: "var(--moutarde)" }}>{m.annee}</span>
                <span style={{ fontSize: 19, fontWeight: 700 }}>{m.evenement}</span>
                <span style={{ fontSize: 17, color: "var(--texte-2)" }}>{m.reponse ? `Réponse : ${m.reponse}` : "Pas de décision liée"}</span>
              </div>
            ))}
          </div>
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: 24, minHeight: 0 }}>
          <section style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--surface)", borderRadius: 26, padding: "22px 28px" }}>
            <Info bloc texte="Les décisions dont l'effet estimé sur une jauge a été le plus fort, avec la jauge la plus touchée.">
              <h2 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 700 }}>Les {b.decisions.length} décisions les plus marquantes</h2>
            </Info>
            <div style={{ display: "grid", gridTemplateColumns: "70px minmax(0,1fr) auto", alignItems: "center", gap: 14, fontSize: 21 }}>
              {b.decisions.map((d) => (
                <FragmentDecision key={d.annee + d.titre} annee={d.annee} titre={d.titre}>
                  <Pastilles liste={[d.pastille]} taille={16} />
                </FragmentDecision>
              ))}
            </div>
          </section>
          <section style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--surface)", borderRadius: 26, padding: "18px 28px" }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Quelques indicateurs</h2>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", columnGap: 16, rowGap: 4, fontSize: 18 }}>
              <span /><span style={{ color: "var(--texte-3)" }}>Votre partie</span><span style={{ color: "var(--texte-3)" }}>Sans intervention</span>
              {b.indicateurs.slice(0, 6).map((i) => (
                <FragmentIndicateur key={i.nom} {...i} />
              ))}
            </div>
          </section>
          <section style={{ display: "flex", flexDirection: "column", gap: 12, background: "var(--surface-2)", borderRadius: 26, padding: "22px 28px", flex: 1, minHeight: 0 }}>
            <h2 style={{ margin: "0 0 2px", fontSize: 26, fontWeight: 700 }}>Ce qu&apos;on retient</h2>
            {b.enseignements.map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 14, fontSize: 20, lineHeight: 1.3 }}>
                <span className="titre" style={{ fontWeight: 800, color: "var(--moutarde)" }}>{i + 1}</span>
                <span>{e}</span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

function JaugeFin({ nom, depart, fin, sans }: { nom: string; depart: number; fin: number; sans: number }) {
  return (
    <>
      <span>{nom}</span>
      <div style={{ position: "relative", height: 16, background: "var(--piste)", borderRadius: 99 }}>
        <div style={{ width: `${fin}%`, height: "100%", background: "var(--moutarde)", borderRadius: 99 }} />
        <div style={{ position: "absolute", left: `${depart}%`, top: -6, width: 4, height: 28, background: "var(--gris)", borderRadius: 2 }} title={`Départ : ${depart}`} />
        <div style={{ position: "absolute", left: `${sans}%`, top: -3, width: 22, height: 22, marginLeft: -11, border: "4px solid var(--violet)", borderRadius: "50%", background: "var(--surface)" }} title={`Sans intervention : ${sans}`} />
      </div>
      <span className="tabnum" style={{ textAlign: "right", fontWeight: 700 }}>{depart} → {fin}</span>
    </>
  );
}

function FragmentDecision({ annee, titre, children }: { annee: number; titre: string; children: ReactNode }) {
  return (
    <>
      <span className="tabnum" style={{ fontWeight: 700, color: "var(--texte-3)" }}>{annee}</span>
      <span style={{ fontWeight: 500 }}>{titre}</span>
      {children}
    </>
  );
}

function FragmentIndicateur({ nom, fin, sans, unite, decimales }: { nom: string; fin: number; sans: number; unite: string; decimales: number }) {
  return (
    <>
      <span style={{ color: "var(--texte-2)" }}>{nom}</span>
      <span className="tabnum" style={{ fontWeight: 700, textAlign: "right" }}>{formatNombre(fin, decimales)} <span style={{ color: "var(--texte-3)", fontWeight: 400, fontSize: 15 }}>{unite}</span></span>
      <span className="tabnum" style={{ textAlign: "right", color: "var(--violet)" }}>{formatNombre(sans, decimales)}</span>
    </>
  );
}

/** Mémorise le jeton hôte puis affiche l'écran (utilisé juste après la création de salle). */
export function memoriserHote(code: string, hote: string) {
  ecrireLocal(`faillite:hote:${code}`, hote);
  ecrireLocal("faillite:derniere-salle", JSON.stringify({ code, le: Date.now() }));
}

