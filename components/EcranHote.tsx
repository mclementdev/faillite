"use client";
/** Grand écran de l'hôte (paysage 1920×1080, mis à l'échelle de la fenêtre). */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { appel, ecrireLocal, lireLocal, useSalle } from "@/lib/client";
import { MOIS_COURTS, nomMois } from "@/lib/libelles";
import type { VueCarte, VueEvenement, VueIndicateur, VueJauge, VueOption, VuePublique } from "@/lib/types";
import { CoucheInfobulles, Info, TitreBulle } from "./Infobulle";
import Tutoriel from "./Tutoriel";
import {
  Anneau,
  BadgeMinistere,
  DESCRIPTION_JAUGE,
  EtiquetteOutil,
  formatMinuteur,
  formatNombre,
  IconeAlerte,
  IconeCadenas,
  IconeCoche,
  IconeElysee,
  IconeFleche,
  IconeHorloge,
  IconeJauge,
  JaugeLigne,
  JaugeIntentions,
  JaugePopularite,
  LIBELLE_NIVEAU,
  libelleType,
  Logo,
  MentionBudget,
  MentionDuree,
  Pastilles,
  Points,
  Puce,
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

const CADRE: CSSProperties = {
  width: 1920,
  height: 1080,
  boxSizing: "border-box",
  background: "var(--fond)",
  color: "var(--texte-1)",
  overflow: "hidden",
  position: "relative",
};

const CARTE: CSSProperties = { background: "var(--surface)", border: "2px solid var(--trait)", borderRadius: 24, boxShadow: "var(--ombre)" };

type Agir = (c: Record<string, unknown>) => Promise<void>;
type PropsEcran = { vue: VuePublique; agir: Agir; occupe: boolean; controle: boolean; ouvrirMenu: () => void; decalage: number };

export default function EcranHote({ code }: { code: string }) {
  const { vue, erreur, decalage, rafraichir, appliquer } = useSalle(code, 1000);
  const [hote, setHote] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /** tutoriel : "demarrage" (avant la campagne) ou "salon" (simple consultation) */
  const [tuto, setTuto] = useState<null | "demarrage" | "salon">(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => setHote(lireLocal(`faillite:hote:${code}`)), [code]);

  const agir: Agir = async (corps) => {
    if (!hote) return;
    setOccupe(true);
    setMessage(null);
    try {
      const r = await appel<{ vue?: VuePublique }>(`/api/salles/${code}/hote`, { ...corps, hote });
      if (r.vue) appliquer(r.vue);
      else await rafraichir();
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
          <Logo taille={110} />
          <p style={{ fontSize: 30, color: "var(--texte-3)" }}>{erreur ?? "Connexion à la salle…"}</p>
        </div>
      </Scene>
    );

  const controle = !!hote;
  const demarrer = () => {
    // Le tutoriel passe une fois par salle avant la campagne (on peut le passer).
    if (!lireLocal(`faillite:tuto:${code}`)) setTuto("demarrage");
    else agir({ action: "demarrer", nbAnnees: vue.nbAnnees });
  };
  const finTuto = () => {
    const mode = tuto;
    setTuto(null);
    if (mode === "demarrage") {
      ecrireLocal(`faillite:tuto:${code}`, "1");
      agir({ action: "demarrer", nbAnnees: vue.nbAnnees });
    }
  };
  const props: PropsEcran = { vue, agir, occupe, controle, ouvrirMenu: () => setMenu(true), decalage };
  const mandat = ["annonce", "vote", "secondTour", "resultat", "bilanAnnee"].includes(vue.phase);
  return (
    <Scene>
      {vue.phase === "accueil" && <Salon {...props} demarrer={demarrer} ouvrirTuto={() => setTuto("salon")} />}
      {vue.phase === "campagne" && <Campagne {...props} />}
      {vue.phase === "investiture" && <Investiture {...props} />}
      {mandat && <Mandat {...props} />}
      {vue.phase === "fin" && <Fin {...props} />}
      {tuto && vue.phase === "accueil" && (
        <Tutoriel nbAnnees={vue.nbAnnees} anneeDepart={vue.anneeDepart} seuil={vue.seuil} terminer={finTuto} libelleFin={tuto === "demarrage" ? "Lancer la campagne" : "Fermer"} />
      )}
      {menu && <DialogueMenu code={vue.code} enCours={vue.phase !== "accueil" && vue.phase !== "fin"} fermer={() => setMenu(false)} />}
      {(message || erreur) && (
        <div role="alert" style={{ position: "absolute", left: "50%", bottom: 24, transform: "translateX(-50%)", background: "var(--alerte-fond)", border: "2px solid var(--n2)", color: "var(--n2-texte)", borderRadius: 14, padding: "12px 22px", fontSize: 22, zIndex: 40 }}>
          {message ?? erreur}
        </div>
      )}
      {!controle && vue.phase !== "fin" && (
        <div style={{ position: "absolute", right: 24, bottom: 14, fontSize: 18, color: "var(--texte-3)" }}>Écran en lecture seule (la partie est pilotée depuis l&apos;écran qui l&apos;a créée).</div>
      )}
    </Scene>
  );
}

/* ------------------------------------------------------------------ */
/* Menu                                                                */

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
    <button type="button" onClick={ouvrir} aria-label="Revenir au menu" className="btn-contour" style={{ font: "600 20px var(--texte)", padding: "9px 16px", borderRadius: 14, flex: "none", ...style }}>
      <IconeMaison /> Menu
    </button>
  );
}

function EnTete({ ouvrirMenu, taille = 40, children }: { ouvrirMenu: () => void; taille?: number; children?: ReactNode }) {
  return (
    <header style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <Logo taille={taille} />
      <BoutonMenu ouvrir={ouvrirMenu} />
      <div style={{ flex: 1 }} />
      {children}
    </header>
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
      style={{ position: "absolute", inset: 0, zIndex: 30, background: "rgba(251,247,239,.85)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...CARTE, width: 860, padding: "44px 48px", display: "flex", flexDirection: "column", gap: 22, animation: "apparition .3s ease" }}>
        <h2 className="titre" style={{ margin: 0, fontSize: 52, fontWeight: 800 }}>Revenir au menu ?</h2>
        <p style={{ margin: 0, fontSize: 26, lineHeight: 1.4, color: "var(--texte-2)" }}>
          {enCours
            ? <>Le mandat n&apos;est pas perdu : la salle <b>{code}</b> reste ouverte 12 heures. Vous pourrez la reprendre depuis le menu, là où vous l&apos;avez laissée.</>
            : <>La salle <b>{code}</b> reste ouverte 12 heures : vous pourrez y revenir depuis le menu.</>}
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
/* Salon                                                               */

function Salon({ vue, agir, occupe, controle, ouvrirMenu, demarrer, ouvrirTuto }: PropsEcran & { demarrer: () => void; ouvrirTuto: () => void }) {
  const [qr, setQr] = useState<string>("");
  const url = typeof window !== "undefined" ? `${window.location.origin}/rejoindre/${vue.code}` : "";
  useEffect(() => {
    if (!url) return;
    QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#1d2445", light: "#ffffff" } }).then(setQr);
  }, [url]);
  const libelle = (n: number) => (n === 5 ? "Un quinquennat" : "Deux quinquennats");
  const detail = (n: number) => `${vue.anneeDepart} à ${vue.anneeDepart + n - 1} · ${n * 3} décisions · ${n === 5 ? "env. 1 h" : "env. 2 h"}`;

  return (
    <div style={{ ...CADRE, padding: "52px 72px", display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 64 }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 36 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <Logo taille={80} />
            <BoutonMenu ouvrir={ouvrirMenu} style={{ font: "600 22px var(--texte)", padding: "12px 20px", borderRadius: 16 }} />
          </div>
          <p style={{ margin: "18px 0 0", fontSize: 32, color: "var(--texte-2)", lineHeight: 1.3 }}>
            Ensemble, faites campagne, gouvernez la France et découvrez l&apos;impact réel de vos décisions.
          </p>
        </div>
        <div style={{ ...CARTE, display: "flex", alignItems: "center", gap: 40, padding: 34 }}>
          <div style={{ background: "#fff", border: "2px solid var(--trait)", borderRadius: 22, padding: 24, flex: "none", width: 340, height: 340 }} aria-label={`QR code vers ${url}`} role="img">
            <div style={{ width: 288, height: 288 }} dangerouslySetInnerHTML={{ __html: qr.replace("<svg", '<svg width="288" height="288"') }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <span style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.15 }}>Scannez avec votre téléphone pour rejoindre l&apos;équipe</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: 2, color: "var(--texte-3)" }}>CODE DE SALLE</span>
              <span className="titre" style={{ fontWeight: 800, fontSize: 100, lineHeight: 1, letterSpacing: 10, color: "var(--bleu)" }}>{vue.code}</span>
            </div>
            <span style={{ fontSize: 21, color: "var(--texte-3)" }}>{url.replace(/^https?:\/\//, "")}</span>
          </div>
        </div>
        <div style={{ marginTop: "auto", display: "flex", gap: 14 }}>
          <button type="button" onClick={ouvrirTuto} className="btn-contour" style={{ font: "700 24px var(--texte)", padding: "14px 24px" }}>
            <span aria-hidden="true" className="titre" style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--soleil)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>?</span>
            Comment jouer
          </button>
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 28, minHeight: 0 }}>
        <div style={{ ...CARTE, display: "flex", flexDirection: "column", gap: 18, padding: "32px 34px", flex: 1, minHeight: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <h2 className="titre" style={{ margin: 0, fontWeight: 800, fontSize: 40 }}>L&apos;équipe de campagne</h2>
            <span className="tabnum" style={{ fontSize: 28, fontWeight: 700 }}>
              {vue.joueurs.length} <span style={{ color: "var(--texte-3)", fontWeight: 500 }}>connecté{vue.joueurs.length > 1 ? "s" : ""}</span>
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12, alignContent: "start" }}>
            {vue.joueurs.slice(0, 26).map((j, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface-2)", borderRadius: 16, padding: "9px 12px", animation: "apparition .4s ease" }}>
                <span style={{ width: 42, height: 42, flex: "none", borderRadius: "50%", background: j.couleur, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 21 }}>
                  {j.pseudo.charAt(0).toUpperCase()}
                </span>
                <span style={{ fontSize: 23, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.pseudo}</span>
              </div>
            ))}
            {vue.joueurs.length > 26 && <div style={{ fontSize: 23, color: "var(--texte-3)", alignSelf: "center" }}>+ {vue.joueurs.length - 26} autres</div>}
            <div style={{ display: "flex", alignItems: "center", gap: 12, border: "2px dashed var(--trait-2)", borderRadius: 16, padding: "7px 12px", color: "var(--texte-3)" }}>
              <span style={{ width: 42, height: 42, flex: "none", borderRadius: "50%", border: "2px dashed var(--trait-2)" }} />
              <span style={{ fontSize: 22 }}>En attente…</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Info texte="Un tour = une décision. Le mandat avance mois par mois : trois décisions par an, et des événements qui peuvent tomber à tout moment.">
              <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: 2, color: "var(--texte-3)" }}>DURÉE DU MANDAT</span>
            </Info>
            <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 20, color: "var(--texte-3)" }}>
              <IconeHorloge /> Minuteur de vote
              {[45, 60, 90].map((s) => (
                <button key={s} type="button" disabled={!controle || occupe} onClick={() => agir({ action: "configurer", dureeVote: s })} aria-pressed={vue.dureeVote === s}
                  style={{ background: vue.dureeVote === s ? "var(--soleil)" : "var(--surface)", color: "var(--texte-1)", border: "2px solid var(--trait-2)", borderRadius: 10, padding: "4px 12px", fontSize: 19, fontWeight: 700, cursor: "pointer" }}>
                  {s} s
                </button>
              ))}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 16 }} role="radiogroup" aria-label="Durée du mandat">
            {vue.dureesPossibles.map((n) => {
              const actif = vue.nbAnnees === n;
              return (
                <button key={n} type="button" role="radio" aria-checked={actif} disabled={!controle || occupe} onClick={() => agir({ action: "configurer", nbAnnees: n })}
                  style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, textAlign: "left", background: actif ? "#fff8e1" : "var(--surface)", color: "var(--texte-1)", border: `4px solid ${actif ? "var(--soleil)" : "var(--trait)"}`, borderRadius: 22, padding: "20px 24px", cursor: "pointer" }}>
                  <span className="titre" style={{ display: "flex", alignItems: "center", gap: 12, fontWeight: 800, fontSize: 38, lineHeight: 1 }}>
                    {libelle(n)} {actif && <IconeCoche taille={32} couleur="#8a5d00" />}
                  </span>
                  <span style={{ fontSize: 21, color: "var(--texte-2)" }}>{detail(n)}</span>
                </button>
              );
            })}
          </div>
        </div>
        <button type="button" className="btn-principal" disabled={!controle || occupe} onClick={demarrer} style={{ borderRadius: 26, padding: 28, fontSize: 46 }}>
          Lancer la campagne <IconeFleche taille={44} />
        </button>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Minuteur et votes (partagés)                                        */

function Minuteur({ vue, decalage, controle, occupe, agir, total }: PropsEcran & { total: number }) {
  const restant = useRestant(vue.echeance, decalage);
  return (
    <Info texte="Le vote se ferme automatiquement à zéro, côté serveur : les votes arrivés après ne comptent pas. L'hôte peut aussi le clore plus tôt quand tout le monde a voté." style={{ alignItems: "center", gap: 16, ...CARTE, padding: "12px 20px 12px 16px", borderRadius: 22 }}>
      <Anneau restant={restant} total={total} taille={72} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span className="titre tabnum" style={{ fontWeight: 800, fontSize: 48, lineHeight: 1, color: restant <= 10 ? "var(--n1-texte)" : "var(--texte-1)" }}>{formatMinuteur(restant)}</span>
        <span style={{ fontSize: 18, color: "var(--texte-3)" }}>pour voter</span>
      </div>
      {controle && (
        <button type="button" className="btn-contour" disabled={occupe} onClick={() => agir({ action: "clore" })} style={{ fontSize: 19, padding: "10px 14px", marginLeft: 6 }}>
          Clore
        </button>
      )}
    </Info>
  );
}

function CompteurVotes({ vue }: { vue: VuePublique }) {
  const nb = vue.joueurs.length;
  return (
    <Info texte="Nombre de personnes qui ont déjà voté. Le vote est anonyme : personne, pas même l'hôte, ne sait qui a voté quoi. Chacun peut changer d'avis jusqu'à la clôture." style={{ alignItems: "center", gap: 18, ...CARTE, padding: "12px 24px", borderRadius: 22 }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span className="titre tabnum" style={{ fontWeight: 800, fontSize: 48, lineHeight: 1 }}>
          {vue.nbVotes}
          <span style={{ color: "var(--gris)" }}> / {nb}</span>
        </span>
        <span style={{ fontSize: 18, color: "var(--texte-3)" }}>ont voté</span>
      </div>
      <Points n={vue.nbVotes} total={Math.max(nb, 1)} taille={nb > 18 ? 14 : 20} />
    </Info>
  );
}

/* ------------------------------------------------------------------ */
/* Campagne                                                            */

function Campagne(props: PropsEcran) {
  const { vue, agir, occupe, controle, ouvrirMenu } = props;
  const c = vue.campagne!;
  const resultat = c.etat === "resultat";
  const d = c.dernier;
  return (
    <div style={{ ...CADRE, padding: "34px 56px", display: "grid", gridTemplateColumns: "minmax(0,1fr) 520px", gridTemplateRows: "auto minmax(0,1fr)", gap: "28px 48px" }}>
      <div style={{ gridColumn: "1 / -1" }}>
        <EnTete ouvrirMenu={ouvrirMenu}>
          {!resultat && <Minuteur {...props} total={20} />}
          {!resultat && <CompteurVotes vue={vue} />}
        </EnTete>
      </div>

      <main style={{ display: "flex", flexDirection: "column", gap: 30, minHeight: 0, justifyContent: "center", paddingBottom: 40 }}>
        <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: 2, color: "var(--accent-texte)" }}>
          {c.tentative ? "NOUVELLE CAMPAGNE" : "CAMPAGNE PRÉSIDENTIELLE"} · PROMESSE {c.index + 1} SUR {c.total}
        </span>
        <div key={c.index} style={{ ...CARTE, position: "relative", padding: "56px 64px", borderRadius: 36, animation: "apparition .5s ease" }}>
          <span aria-hidden="true" className="titre" style={{ position: "absolute", top: -30, left: 40, fontSize: 160, lineHeight: 1, color: "var(--soleil)", fontWeight: 800 }}>“</span>
          <p className="titre" style={{ margin: 0, fontSize: c.promesse.texte.length > 80 ? 60 : 72, fontWeight: 800, lineHeight: 1.1, letterSpacing: -1 }}>{c.promesse.texte}</p>
          <p style={{ margin: "26px 0 0", fontSize: 26, color: "var(--texte-3)" }}>Une promesse qui plaît… Mais est-elle tenable ? Les vrais chiffres seront révélés à la fin du mandat.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {(["promettre", "refuser"] as const).map((choix) => {
            const gagnant = resultat && d && (choix === "promettre" ? d.faite : !d.faite);
            return (
              <div key={choix} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, padding: "28px 34px", borderRadius: 26, background: choix === "promettre" ? "#fff3cf" : "var(--surface)", border: `4px solid ${gagnant ? (choix === "promettre" ? "var(--soleil)" : "var(--texte-1)") : "var(--trait)"}`, opacity: resultat && !gagnant ? 0.5 : 1 }}>
                <span className="titre" style={{ fontSize: 46, fontWeight: 800 }}>{choix === "promettre" ? "On le promet !" : "Trop risqué"}</span>
                {resultat && d && <span className="titre tabnum" style={{ fontSize: 44, fontWeight: 800 }}>{choix === "promettre" ? d.promettre : d.refuser}</span>}
              </div>
            );
          })}
        </div>
        {resultat && d && (
          <div style={{ display: "flex", alignItems: "center", gap: 24, animation: "apparition .4s ease" }}>
            <span className="titre" style={{ fontSize: 40, fontWeight: 800, color: d.faite ? "var(--accent-texte)" : "var(--texte-2)" }}>
              {d.faite ? "Promis ! Elle entre dans votre programme." : "Écartée. Plus prudent… mais moins vendeur."}
              {d.hasard && <span style={{ fontSize: 24, color: "var(--texte-3)", fontWeight: 600 }}> (égalité : le sort a tranché)</span>}
            </span>
            <div style={{ flex: 1 }} />
            {controle && (
              <button type="button" className="btn-principal" disabled={occupe} onClick={() => agir({ action: "suivant" })} style={{ fontSize: 30, padding: "20px 32px", flex: "none" }}>
                {c.index + 1 < c.total ? "Promesse suivante" : "Le soir de l'élection"} <IconeFleche taille={30} />
              </button>
            )}
          </div>
        )}
      </main>

      <aside style={{ display: "flex", flexDirection: "column", gap: 18, minHeight: 0 }}>
        <Info bloc texte="Chaque promesse vous fait gagner des voix, chaque refus en laisse à l'adversaire. Il faut plus de 50 % au second tour pour être élus. Mais une promesse trahie pendant le mandat coûtera cher en popularité.">
          <JaugeIntentions valeur={c.intentions} />
        </Info>
        <div style={{ ...CARTE, padding: "22px 26px", display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0, overflow: "hidden" }}>
          <h2 style={{ margin: 0, fontSize: 26 }}>Votre programme</h2>
          {c.faites.length === 0 && <p style={{ margin: 0, fontSize: 21, color: "var(--texte-3)" }}>Aucune promesse pour l&apos;instant.</p>}
          {c.faites.map((p) => (
            <div key={p.id} style={{ display: "flex", gap: 12, fontSize: 20, lineHeight: 1.3, animation: "apparition .4s ease" }}>
              <IconeCoche taille={22} couleur="#8a5d00" />
              <span>{p.texte}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function Investiture(props: PropsEcran) {
  const { vue, agir, occupe, controle, ouvrirMenu } = props;
  const c = vue.campagne!;
  if (c.election && !c.election.elu) return <Defaite {...props} />;
  return (
    <div style={{ ...CADRE, padding: "34px 56px", display: "flex", flexDirection: "column", gap: 30 }}>
      <EnTete ouvrirMenu={ouvrirMenu} />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 56, flex: 1, minHeight: 0, alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 26, animation: "apparition .6s ease" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 14, fontSize: 26, fontWeight: 800, letterSpacing: 2, color: "var(--accent-texte)" }}>
            <IconeElysee taille={36} /> MAI {vue.anneeDepart} · SOIR DU SECOND TOUR
          </span>
          <h1 className="titre" style={{ margin: 0, fontSize: 140, fontWeight: 800, lineHeight: 0.95, letterSpacing: -4 }}>Vous êtes élus !</h1>
          {c.election && (
            <span className="titre tabnum" style={{ fontSize: 46, fontWeight: 800, color: "var(--p2-texte)" }}>
              {c.election.score.toLocaleString("fr-FR")} % des voix{c.election.score < 51 ? " : sur le fil !" : ""}
            </span>
          )}
          <p style={{ margin: 0, fontSize: 32, lineHeight: 1.35, color: "var(--texte-2)" }}>
            Pendant {vue.nbAnnees === 5 ? "cinq ans" : "dix ans"}, vous gouvernez ensemble : {vue.nbDecisions} décisions, des crises imprévues, et un pays qui évolue mois après mois.
          </p>
          <div style={{ width: 640 }}>
            <JaugePopularite j={{ id: "popularite", nom: "Popularité", valeur: c.popularite, tendance: "0", alerte: false }} seuil={vue.seuil} taille={1.2} />
          </div>
          {controle && (
            <button type="button" className="btn-principal" disabled={occupe} onClick={() => agir({ action: "suivant" })} style={{ alignSelf: "flex-start", fontSize: 38, padding: "24px 40px", borderRadius: 24, marginTop: 10 }}>
              Entrer à l&apos;Élysée <IconeFleche taille={36} />
            </button>
          )}
        </div>
        <div style={{ ...CARTE, padding: "34px 38px", display: "flex", flexDirection: "column", gap: 16, maxHeight: "100%", overflow: "hidden" }}>
          <h2 className="titre" style={{ margin: 0, fontSize: 40, fontWeight: 800 }}>Votre programme</h2>
          <p style={{ margin: 0, fontSize: 21, color: "var(--texte-3)" }}>Ces promesses reviendront pendant le mandat. Tenues ou trahies, elles compteront.</p>
          {c.faites.length === 0 && <p style={{ margin: 0, fontSize: 26 }}>Aucune promesse : une campagne très prudente. Popularité plus basse, mais les mains libres.</p>}
          {c.faites.map((p, i) => (
            <div key={p.id} style={{ display: "flex", gap: 16, alignItems: "flex-start", fontSize: 25, lineHeight: 1.3, padding: "10px 0", borderTop: i ? "1px solid var(--trait)" : undefined }}>
              <span className="titre" style={{ fontWeight: 800, color: "var(--accent-texte)", fontSize: 28 }}>{i + 1}</span>
              <span>{p.texte}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Soir du second tour perdu : on repart en campagne avec d'autres promesses. */
function Defaite({ vue, agir, occupe, controle, ouvrirMenu }: PropsEcran) {
  const c = vue.campagne!;
  const e = c.election!;
  return (
    <div style={{ ...CADRE, padding: "34px 56px", display: "flex", flexDirection: "column", gap: 30 }}>
      <EnTete ouvrirMenu={ouvrirMenu} />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 56, flex: 1, minHeight: 0, alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 26, animation: "apparition .6s ease" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 14, fontSize: 26, fontWeight: 800, letterSpacing: 2, color: "var(--texte-2)" }}>
            <IconeElysee taille={36} /> MAI {vue.anneeDepart} · SOIR DU SECOND TOUR
          </span>
          <h1 className="titre" style={{ margin: 0, fontSize: 140, fontWeight: 800, lineHeight: 0.95, letterSpacing: -4 }}>Battus.</h1>
          <span className="titre tabnum" style={{ fontSize: 46, fontWeight: 800, color: "var(--n2-texte)" }}>
            {e.score.toLocaleString("fr-FR")} % des voix{e.score > 49 ? " : à un cheveu !" : ""}
          </span>
          <p style={{ margin: 0, fontSize: 30, lineHeight: 1.35, color: "var(--texte-2)" }}>
            {c.faites.length <= c.total / 3
              ? "Une campagne honnête… mais trop timide : l'adversaire a promis ce que vous avez refusé."
              : "Le pays n'a pas été convaincu. Les sondages se trompent parfois, le soir du vote aussi."}{" "}
            Vous repartez en campagne avec de nouvelles promesses.
          </p>
          {controle && (
            <button type="button" className="btn-principal" disabled={occupe} onClick={() => agir({ action: "suivant" })} style={{ alignSelf: "flex-start", fontSize: 38, padding: "24px 40px", borderRadius: 24, marginTop: 10 }}>
              Repartir en campagne <IconeFleche taille={36} />
            </button>
          )}
        </div>
        <div style={{ ...CARTE, padding: "34px 38px", display: "flex", flexDirection: "column", gap: 16, maxHeight: "100%", overflow: "hidden" }}>
          <h2 className="titre" style={{ margin: 0, fontSize: 40, fontWeight: 800 }}>Votre programme</h2>
          <p style={{ margin: 0, fontSize: 23, color: "var(--texte-3)" }}>
            {c.faites.length} promesse{c.faites.length > 1 ? "s" : ""} sur {c.total}. Chaque refus a laissé des voix à l&apos;adversaire.
          </p>
          {c.faites.map((p, i) => (
            <div key={p.id} style={{ display: "flex", gap: 16, alignItems: "flex-start", fontSize: 24, lineHeight: 1.3, padding: "8px 0", borderTop: i ? "1px solid var(--trait)" : undefined }}>
              <span className="titre" style={{ fontWeight: 800, color: "var(--texte-3)", fontSize: 26 }}>{i + 1}</span>
              <span>{p.texte}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mandat : colonne des jauges, frise des mois, étapes                 */

function ColonneJauges({ vue, ouvrirIndicateurs, ouvrirMenu }: { vue: VuePublique; ouvrirIndicateurs: () => void; ouvrirMenu: () => void }) {
  return (
    <aside style={{ display: "flex", flexDirection: "column", gap: 9, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
        <Logo taille={30} />
        <BoutonMenu ouvrir={ouvrirMenu} />
      </div>
      <Info bloc texte={<BulleJauge vue={vue} j={vue.popularite} />}>
        <JaugePopularite j={vue.popularite} seuil={vue.seuil} />
      </Info>
      {vue.jauges.map((j) => (
        <Info key={j.id} bloc texte={<BulleJauge vue={vue} j={j} />}>
          <JaugeLigne j={j} seuil={vue.seuil} compacte />
        </Info>
      ))}
      <span style={{ marginTop: "auto", fontSize: 15, color: "var(--texte-3)" }}>Survolez un élément pour en voir le détail.</span>
      <button type="button" onClick={ouvrirIndicateurs} className="btn-contour" style={{ justifyContent: "space-between", font: "600 20px var(--texte)", padding: "11px 16px", borderRadius: 14 }}>
        Les vrais chiffres ({vue.indicateurs.length}) <IconeFleche />
      </button>
    </aside>
  );
}

function BulleJauge({ vue, j }: { vue: VuePublique; j: VueJauge }) {
  const inds = vue.indicateurs.filter((i) => i.groupe === j.id);
  return (
    <>
      <TitreBulle>{j.nom.toUpperCase()} · {j.valeur}{j.id === "popularite" ? " %" : " / 100"}</TitreBulle>
      {DESCRIPTION_JAUGE[j.id]}
      {inds.length > 0 && (
        <span style={{ display: "block", marginTop: 8, color: "var(--texte-2)", fontSize: 18 }}>
          {inds.slice(0, 7).map((i) => `${i.nom} : ${formatNombre(i.valeur, i.decimales)} ${i.unite}`).join(" · ")}
        </span>
      )}
      <span style={{ display: "block", marginTop: 8, fontSize: 18, color: "var(--texte-3)" }}>
        Flèche : {LIBELLE_NIVEAU[j.tendance]} depuis janvier. Sous {vue.seuil}, la jauge passe en alerte et une crise liée peut éclater l&apos;année suivante.
      </span>
    </>
  );
}

const GROUPES: { id: VueIndicateur["groupe"]; nom: string }[] = [
  { id: "economie", nom: "Économie et emploi" },
  { id: "finances", nom: "Finances publiques" },
  { id: "cohesion", nom: "Cohésion sociale" },
  { id: "ecologie", nom: "Climat et nature" },
  { id: "services_publics", nom: "Services publics" },
  { id: "souverainete", nom: "Souveraineté" },
  { id: "demographie", nom: "Démographie (tendance de fond)" },
];

function PanneauIndicateurs({ vue, fermer }: { vue: VuePublique; fermer: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Les vrais chiffres" onClick={fermer}
      style={{ position: "absolute", inset: 0, background: "rgba(251,247,239,.98)", padding: "36px 48px", display: "flex", flexDirection: "column", gap: 18, zIndex: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 className="titre" style={{ margin: 0, fontSize: 46, fontWeight: 800 }}>Les vrais chiffres en {nomMois(Math.max(1, vue.mois))} {vue.annee}</h2>
        <button type="button" className="btn-contour" onClick={fermer} style={{ fontSize: 22, padding: "10px 20px" }}>Fermer</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 16, flex: 1, minHeight: 0 }} onClick={(e) => e.stopPropagation()}>
        {GROUPES.map((g) => (
          <section key={g.id} style={{ ...CARTE, borderRadius: 18, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 5, gridRow: g.id === "cohesion" ? "span 2" : undefined }}>
            <h3 style={{ margin: "0 0 4px", display: "flex", alignItems: "center", gap: 10, fontSize: 21 }}>
              {g.id !== "demographie" && <IconeJauge id={g.id} taille={22} />} {g.nom}
            </h3>
            {vue.indicateurs.filter((i) => i.groupe === g.id).map((i) => (
              <Info key={i.id} bloc texte={<><TitreBulle>{i.nom.toUpperCase()}</TitreBulle>Point de départ : {i.source} ({i.annee}).{i.provisoire ? " Valeur provisoire : donnée récente introuvable, ancienne ou approchée." : ""} La valeur évolue ensuite selon le modèle, les événements et vos décisions.</>}
                style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 16, borderTop: "1px solid var(--trait)", paddingTop: 4 }}>
                <span style={{ color: "var(--texte-2)" }}>{i.nom}{i.provisoire ? " *" : ""}</span>
                <span className="tabnum" style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{formatNombre(i.valeur, i.decimales)} <span style={{ color: "var(--texte-3)", fontWeight: 500 }}>{i.unite}</span></span>
              </Info>
            ))}
          </section>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 16, color: "var(--texte-3)" }}>* valeur de départ provisoire (donnée introuvable ou ancienne). Le jeu est une simplification pédagogique : les effets sont des ordres de grandeur, pas des prévisions.</p>
    </div>
  );
}

/** Frise des 12 mois : défile du mois précédent jusqu'au mois de l'arrêt en cours. */
function Frise({ vue, affiche }: { vue: VuePublique; affiche: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
      <Info texte={<><TitreBulle>ANNÉE {vue.annee}</TitreBulle>Les mois défilent : trois décisions par an tombent à des moments imprévisibles, et au plus deux événements. L&apos;évolution naturelle du pays (vieillissement, dette, climat…) s&apos;applique en fin d&apos;année.</>}>
        <span className="titre tabnum" style={{ fontWeight: 800, fontSize: 84, lineHeight: 0.9, letterSpacing: -3 }}>{vue.annee}</span>
      </Info>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(12, minmax(0,1fr))", gap: 6 }} aria-label={`${nomMois(affiche || 1)} ${vue.annee}`}>
        {MOIS_COURTS.map((m, i) => {
          const n = i + 1;
          const passe = n < affiche;
          const courant = n === affiche;
          return (
            <div key={m} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ width: "100%", height: courant ? 18 : 12, borderRadius: 99, background: courant ? "var(--soleil)" : passe ? "var(--texte-1)" : "var(--piste)", transition: "all .25s ease" }} />
              <span style={{ fontSize: courant ? 21 : 17, fontWeight: courant ? 800 : 600, color: courant ? "var(--texte-1)" : passe ? "var(--texte-2)" : "var(--gris)" }}>{m}</span>
            </div>
          );
        })}
      </div>
      <Info texte="Décisions du mandat (hors réponses aux crises).">
        <span style={{ fontSize: 22, fontWeight: 700, background: "var(--surface)", border: "2px solid var(--trait)", padding: "8px 16px", borderRadius: 999, whiteSpace: "nowrap" }}>
          Décision {Math.max(1, vue.numeroDecision)} / {vue.nbDecisions}
        </span>
      </Info>
    </div>
  );
}

/** Défilement animé des mois entre deux arrêts. */
function useDefilement(vue: VuePublique): { affiche: number; enCours: boolean } {
  const cible = vue.mois;
  const cle = `${vue.annee}-${vue.scrutin ?? vue.phase}-${cible}`;
  const [etat, setEtat] = useState<{ cle: string; affiche: number }>({ cle, affiche: cible });
  useEffect(() => {
    const depart = vue.moisPrecedent;
    if (vue.phase !== "annonce" || cible <= depart + 1) {
      setEtat({ cle, affiche: cible });
      return;
    }
    let m = depart;
    setEtat({ cle, affiche: m });
    const t = setInterval(() => {
      m++;
      setEtat({ cle, affiche: m });
      if (m >= cible) clearInterval(t);
    }, 700);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  const affiche = etat.cle === cle ? etat.affiche : vue.phase === "annonce" ? vue.moisPrecedent : cible;
  return { affiche, enCours: affiche < cible };
}

function Mandat(props: PropsEcran) {
  const { vue, ouvrirMenu } = props;
  const [indicateurs, setIndicateurs] = useState(false);
  const { affiche, enCours } = useDefilement(vue);
  return (
    <div style={{ ...CADRE, padding: "28px 40px", display: "grid", gridTemplateColumns: "410px minmax(0,1fr)", gap: 36 }}>
      <ColonneJauges vue={vue} ouvrirIndicateurs={() => setIndicateurs(true)} ouvrirMenu={ouvrirMenu} />
      <main style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0, minHeight: 0 }}>
        <Frise vue={vue} affiche={vue.phase === "bilanAnnee" ? 13 : affiche} />
        {vue.phase === "bilanAnnee" ? (
          <BilanAnnee {...props} />
        ) : enCours ? (
          <Defilement mois={affiche} annee={vue.annee} />
        ) : (
          <Etape {...props} />
        )}
      </main>
      {indicateurs && <PanneauIndicateurs vue={vue} fermer={() => setIndicateurs(false)} />}
    </div>
  );
}

function Defilement({ mois, annee }: { mois: number; annee: number }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
      <span key={mois} className="titre" style={{ fontSize: 150, fontWeight: 800, letterSpacing: -4, color: "var(--texte-1)", animation: "apparition .2s ease", textTransform: "capitalize" }}>
        {nomMois(Math.max(1, mois))}
      </span>
      <span style={{ fontSize: 30, color: "var(--texte-3)" }}>{annee} · le temps passe…</span>
    </div>
  );
}

function Etape(props: PropsEcran) {
  const { vue, agir, occupe, controle } = props;
  const e = vue.etape;
  if (!e) return null;
  if (vue.phase === "resultat") return <Resultat {...props} />;
  const carte = e.carte;
  const enVote = vue.phase === "vote" || vue.phase === "secondTour";
  const barre = (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      {carte && (
        <Info texte={<><TitreBulle>TYPE DE VOTE</TitreBulle>{TEXTE_TYPE[carte.type]}</>}>
          <Puce fond={carte.type === "curseur" ? "#fff3cf" : "var(--surface-2)"}>{libelleType(carte.type, true)}</Puce>
        </Info>
      )}
      <div style={{ flex: 1 }} />
      {enVote && <Minuteur {...props} total={vue.phase === "secondTour" ? 20 : vue.dureeVote} />}
      {enVote && <CompteurVotes vue={vue} />}
      {!enVote && controle && carte && (
        <button type="button" className="btn-principal" disabled={occupe} onClick={() => agir({ action: "ouvrirVote" })} style={{ fontSize: 32, padding: "20px 30px", borderRadius: 22 }}>
          Ouvrir le vote · {vue.dureeVote} s <IconeFleche taille={30} />
        </button>
      )}
      {!enVote && controle && !carte && (
        <button type="button" className="btn-principal" disabled={occupe} onClick={() => agir({ action: "suivant" })} style={{ fontSize: 32, padding: "20px 30px", borderRadius: 22 }}>
          Continuer <IconeFleche taille={30} />
        </button>
      )}
    </div>
  );

  // Événement sans vote : une brève d'actualité.
  if (e.type === "evenement" && !carte && e.evenement)
    return (
      <>
        <Breve evt={e.evenement} mois={e.mois} annee={e.annee} />
        <Bandeaux vue={vue} />
        <div style={{ marginTop: "auto" }}>{barre}</div>
      </>
    );

  return (
    <>
      {e.type === "evenement" && e.evenement && <BandeauCrise evt={e.evenement} mois={e.mois} annee={e.annee} />}
      {e.type === "decision" && <Bandeaux vue={vue} />}
      {carte && <Carte carte={carte} titreVisible={e.type === "decision"} secondTour={vue.secondTour?.options.map((o) => o.id)} />}
      {vue.phase === "secondTour" && (
        <div style={{ display: "flex", alignItems: "center", gap: 16, background: "#fff3cf", border: "3px solid var(--soleil)", borderRadius: 18, padding: "12px 22px", animation: "apparition .4s ease" }}>
          <span className="titre" style={{ fontSize: 30, fontWeight: 800 }}>Égalité ! Second tour</span>
          <span style={{ fontSize: 22, color: "var(--texte-2)" }}>Revotez entre les options à égalité. Si l&apos;égalité persiste, le sort tranchera.</span>
        </div>
      )}
      {barre}
      {vue.flash && vue.phase === "vote" && <FlashInfo texte={vue.flash} />}
    </>
  );
}

const TEXTE_TYPE: Record<VueCarte["type"], string> = {
  unique: "Chacun choisit une option. La plus votée est appliquée. En cas d'égalité, un second tour rapide départage les ex aequo ; si l'égalité persiste, le sort tranche.",
  cumulable: "Chacun choisit une option. Les deux plus votées sont appliquées ensemble.",
  curseur: "Chacun place le curseur. La valeur médiane du groupe est appliquée.",
};

function Bandeaux({ vue }: { vue: VuePublique }) {
  if (!vue.arrivees.length && !vue.resonances.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 18, color: "var(--texte-2)" }}>
      {vue.resonances.map((r) => (
        <Info key={r.titre} texte={<><TitreBulle>COMBINAISON DE DÉCISIONS</TitreBulle>{r.explication}</>} style={{ background: "var(--violet-fond)", border: "2px solid var(--violet)", borderRadius: 12, padding: "5px 12px", display: "inline-block" }}>
          <b style={{ color: "var(--violet)" }}>Combinaison · </b>{r.titre}
        </Info>
      ))}
      {vue.arrivees.map((a) => (
        <Info key={a} texte="Effet différé : une décision prise plus tôt commence à agir cette année. Ses effets sont déjà dans les jauges." style={{ ...CARTE, boxShadow: "none", borderRadius: 12, padding: "5px 12px", alignItems: "center", gap: 8 }}>
          <IconeHorloge taille={18} /> {a}
        </Info>
      ))}
    </div>
  );
}

function Cause({ evt, taille = 22 }: { evt: VueEvenement; taille?: number }) {
  if (evt.cause)
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: taille, fontWeight: 600, color: "var(--violet)", background: "var(--violet-fond)", borderRadius: 12, padding: "8px 14px", alignSelf: "flex-start" }}>
        <IconeHorloge taille={taille} /> Conséquence de votre décision de {nomMois(evt.cause.mois)} {evt.cause.annee} : {evt.cause.titre}
      </span>
    );
  if (evt.alerte)
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: taille, fontWeight: 600, color: "var(--n2-texte)", background: "var(--alerte-fond)", borderRadius: 12, padding: "8px 14px", alignSelf: "flex-start" }}>
        <IconeAlerte taille={taille} /> Provoqué par l&apos;alerte sur la jauge {evt.alerte}
      </span>
    );
  return null;
}

function Breve({ evt, mois, annee }: { evt: VueEvenement; mois: number; annee: number }) {
  const negatif = evt.nature === "negatif";
  return (
    <div style={{ ...CARTE, flex: 1, minHeight: 0, padding: "40px 52px", display: "flex", flexDirection: "column", gap: 22, justifyContent: "center", borderLeft: `14px solid ${negatif ? "var(--n2)" : "var(--p2)"}`, animation: "apparition .5s ease" }}>
      <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2, color: negatif ? "var(--n2-texte)" : "var(--p2-texte)" }}>
        ACTUALITÉ · {nomMois(mois).toUpperCase()} {annee} · {negatif ? "COUP DUR" : "BONNE NOUVELLE"}
      </span>
      <h1 className="titre" style={{ margin: 0, fontSize: 70, fontWeight: 800, lineHeight: 1.02, letterSpacing: -1.5 }}>{evt.titre}</h1>
      <p style={{ margin: 0, fontSize: 30, lineHeight: 1.35, color: "var(--texte-2)" }}>{evt.description}</p>
      <Cause evt={evt} />
      <Pastilles liste={evt.pastilles} taille={22} />
    </div>
  );
}

function BandeauCrise({ evt, mois, annee }: { evt: VueEvenement; mois: number; annee: number }) {
  return (
    <div style={{ background: "var(--alerte-fond)", border: "3px solid var(--n2)", borderRadius: 24, padding: "20px 28px", display: "flex", flexDirection: "column", gap: 10, animation: "apparition .5s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 800, letterSpacing: 2, color: "#fff", background: "var(--n2-texte)", padding: "5px 14px", borderRadius: 8 }}>
          <IconeAlerte /> CRISE · {nomMois(mois).toUpperCase()} {annee}
        </span>
        <span style={{ fontSize: 20, color: "var(--n2-texte)", fontWeight: 700 }}>Votre réponse est attendue</span>
        <div style={{ flex: 1 }} />
        <Pastilles liste={evt.pastilles} taille={18} />
      </div>
      <h1 className="titre" style={{ margin: 0, fontSize: 50, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1 }}>{evt.titre}</h1>
      <p style={{ margin: 0, fontSize: 23, lineHeight: 1.35, color: "var(--texte-2)" }}>{evt.description}</p>
      <Cause evt={evt} taille={20} />
    </div>
  );
}

function FlashInfo({ texte }: { texte: string }) {
  return (
    <div role="status" style={{ position: "absolute", left: 486, right: 40, top: 152, zIndex: 8, display: "flex", alignItems: "center", gap: 22, background: "var(--texte-1)", color: "#fff", borderRadius: 20, padding: "18px 26px", boxShadow: "0 18px 40px rgba(29,36,69,.3)", animation: "flash .6s ease" }}>
      <span className="titre" style={{ flex: "none", fontSize: 26, fontWeight: 800, background: "var(--n2-texte)", padding: "6px 14px", borderRadius: 8, animation: "clignote 1.2s ease-in-out 3" }}>FLASH INFO</span>
      <span style={{ fontSize: 27, lineHeight: 1.3, fontWeight: 600 }}>{texte}</span>
      <span style={{ flex: "none", fontSize: 20, color: "var(--soleil)", fontWeight: 700 }}>+15 s pour en débattre</span>
    </div>
  );
}

function Carte({ carte, titreVisible, secondTour }: { carte: VueCarte; titreVisible: boolean; secondTour?: string[] }) {
  const curseur = carte.type === "curseur";
  const n = carte.options.length;
  return (
    <>
      {titreVisible && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {carte.ministere && <BadgeMinistere ministere={carte.ministere} />}
          <h1 className="titre" style={{ margin: 0, fontWeight: 800, fontSize: 50, lineHeight: 1.05, letterSpacing: -1 }}>{carte.titre}</h1>
          <p style={{ margin: 0, fontSize: 22, color: "var(--texte-2)", lineHeight: 1.35 }}>{carte.contexte}</p>
        </div>
      )}
      {curseur && carte.curseur && <Echelle carte={carte} />}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${n}, minmax(0,1fr))`, gap: 18, flex: 1, minHeight: 0 }}>
        {carte.options.map((o) => (
          <CarteOption key={o.id} o={o} curseur={curseur} serre={n > 3} attenue={!!secondTour && !secondTour.includes(o.id)} />
        ))}
      </div>
    </>
  );
}

function CarteOption({ o, curseur, serre, attenue }: { o: VueOption; curseur: boolean; serre: boolean; attenue: boolean }) {
  return (
    <div style={{ ...CARTE, display: "flex", flexDirection: "column", gap: 12, padding: serre ? "18px 20px" : "20px 24px", minHeight: 0, overflow: "hidden", opacity: attenue ? 0.3 : 1, transition: "opacity .3s ease" }}>
      {curseur ? (
        <span className="titre" style={{ fontWeight: 800, fontSize: 34, lineHeight: 1 }}>{o.titre}</span>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span className="titre" style={{ width: 46, height: 46, flex: "none", borderRadius: "50%", background: "var(--soleil)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 25 }}>{o.lettre}</span>
          <span className="titre" style={{ fontWeight: 800, fontSize: serre ? 27 : 31, lineHeight: 1.05 }}>{o.titre}</span>
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <EtiquetteOutil outil={o.outil} taille={17} />
        <MentionDuree duree={o.duree} taille={16} />
        <MentionBudget budget={o.budget} taille={17} />
      </div>
      <p style={{ margin: 0, fontSize: serre ? 19 : 21, lineHeight: 1.35, color: "var(--texte-2)" }}>{o.explication}</p>
      <Pastilles liste={o.pastilles} taille={serre ? 17 : 19} style={{ marginTop: "auto" }} />
    </div>
  );
}

function Echelle({ carte }: { carte: VueCarte }) {
  const c = carte.curseur!;
  const valeursOptions = new Set(carte.options.map((o) => o.valeur));
  const pos = (v: number) => `${((v - c.min) / (c.max - c.min)) * 100}%`;
  return (
    <Info bloc texte="Chacun place le curseur sur son téléphone. On retient la médiane : la moitié du groupe veut moins, l'autre moitié plus. Les grands points sont les options décrites ci-dessous ; entre les deux, les effets sont intermédiaires."
      style={{ ...CARTE, padding: "16px 56px 12px" }}>
      <div style={{ position: "relative", height: 40 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 15, height: 10, borderRadius: 99, background: "var(--piste)" }} />
        {c.valeurs.map((v) => {
          const fort = valeursOptions.has(v);
          return <div key={v} style={{ position: "absolute", left: pos(v), top: fort ? 9 : 12, width: fort ? 22 : 16, height: fort ? 22 : 16, marginLeft: fort ? -11 : -8, borderRadius: "50%", background: fort ? "var(--texte-1)" : "var(--trait-2)" }} />;
        })}
      </div>
      <div className="titre tabnum" style={{ position: "relative", height: 42, fontWeight: 800 }}>
        {c.valeurs.map((v) => {
          const fort = valeursOptions.has(v);
          return (
            <span key={v} style={{ position: "absolute", left: pos(v), transform: "translateX(-50%)", fontSize: fort ? 34 : 24, color: fort ? undefined : "var(--gris)", top: fort ? 0 : 6, whiteSpace: "nowrap" }}>
              {formatNombre(v, v % 1 ? 1 : 0)}
            </span>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 18, color: "var(--texte-3)" }}>
        <IconeCadenas /> {c.unite} · les positions restent secrètes, la médiane est révélée à la clôture
      </div>
    </Info>
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
    <div style={{ position: "absolute", inset: 0, background: "rgba(251,247,239,.96)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 30, zIndex: 5 }}>
      <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: 3, color: "var(--accent-texte)" }}>ÉGALITÉ PERSISTANTE · TIRAGE AU SORT</span>
      <span className="titre" style={{ fontSize: 90, fontWeight: 800, animation: "tirage .32s linear infinite" }}>{noms[i % noms.length]}</span>
    </div>
  );
}

function Resultat({ vue, agir, occupe, controle }: PropsEcran) {
  const r = vue.resultat;
  const [animation, setAnimation] = useState(true);
  const fin = useMemo(() => () => setAnimation(false), []);
  if (!r) return null;
  const max = Math.max(1, ...r.decompte.map((d) => d.voix));
  const etiquette = r.rejete
    ? "RÉFÉRENDUM : LE NON L'EMPORTE"
    : r.aucunVote
      ? "PERSONNE N'A VOTÉ : LE HASARD A CHOISI"
      : r.secondTour
        ? r.egalite
          ? "ÉGALITÉ PERSISTANTE · TRANCHÉE AU SORT"
          : "DÉPARTAGÉ AU SECOND TOUR"
        : r.crise
          ? "VOTRE RÉPONSE À LA CRISE"
          : "VOUS AVEZ DÉCIDÉ";
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, animation: "apparition .5s ease" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: 2, color: r.rejete ? "var(--n2-texte)" : "var(--accent-texte)" }}>{etiquette}</span>
          <EtiquetteOutil outil={r.outil} taille={17} />
          <div style={{ flex: 1 }} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 20, color: "var(--texte-3)" }}>
            <IconeCadenas /> {r.nbVotes} / {vue.joueurs.length} ont voté
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {r.lettres.map((l) => (
            <span key={l} className="titre" style={{ width: 70, height: 70, flex: "none", borderRadius: "50%", background: "var(--soleil)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 38 }}>{l}</span>
          ))}
          <h1 className="titre" style={{ margin: 0, fontWeight: 800, fontSize: r.titre.length > 40 ? 52 : 66, lineHeight: 1.02, letterSpacing: -1.5 }}>{r.titre}</h1>
        </div>
        <p style={{ margin: 0, fontSize: 23, lineHeight: 1.35, color: "var(--texte-2)" }}>{r.explication}</p>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, marginTop: 4 }}>
          <Pastilles liste={r.pastilles} taille={20} chiffre />
          {r.promesse && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 21, fontWeight: 700, padding: "6px 14px", borderRadius: 999, background: r.promesse.tenue ? "var(--ok-fond)" : "var(--alerte-fond)", color: r.promesse.tenue ? "var(--p2-texte)" : "var(--n2-texte)" }}>
              {r.promesse.tenue ? <IconeCoche taille={22} /> : <IconeAlerte taille={20} />} Promesse {r.promesse.tenue ? "tenue" : "trahie"} : « {r.promesse.texte} »
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,4fr) minmax(0,7fr)", gap: 20, flex: 1, minHeight: 0 }}>
        <section style={{ ...CARTE, display: "flex", flexDirection: "column", gap: 12, padding: "20px 24px", minHeight: 0, overflow: "hidden" }}>
          <h2 style={{ margin: 0, fontSize: 23, fontWeight: 700 }}>{r.secondTour ? "Second tour" : "Les votes"}</h2>
          {(r.secondTour?.decompte ?? r.decompte).map((d) => {
            const m = Math.max(1, ...(r.secondTour?.decompte ?? r.decompte).map((x) => x.voix));
            return (
              <div key={d.label} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 19, fontWeight: d.retenue ? 700 : 400 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</span>
                  <span className="tabnum" style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{d.voix}</span>
                </div>
                <div style={{ height: r.decompte.length > 5 ? 14 : 20, background: "var(--piste)", borderRadius: 10 }}>
                  <div style={{ width: `${(d.voix / m) * 100}%`, height: "100%", background: d.retenue ? "var(--soleil)" : "var(--gris)", borderRadius: 10, transition: "width .8s ease" }} />
                </div>
              </div>
            );
          })}
          {r.secondTour && <p style={{ margin: 0, fontSize: 17, color: "var(--texte-3)" }}>Premier tour : {r.decompte.filter((d) => d.voix === max).map((d) => d.label).join(", ")} à égalité.</p>}
        </section>

        <section style={{ ...CARTE, display: "flex", flexDirection: "column", gap: 10, padding: "20px 26px", minHeight: 0, overflow: "hidden" }}>
          <h2 style={{ margin: "0 0 2px", fontSize: 23, fontWeight: 700 }}>Ce qui change, en vrais chiffres</h2>
          {r.changements.length === 0 && <p style={{ margin: 0, fontSize: 21, color: "var(--texte-3)" }}>Rien ne bouge tout de suite : les effets arrivent plus tard.</p>}
          {r.changements.map((c) => (
            <div key={c.nom} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", alignItems: "center", gap: 16, padding: "6px 0", borderBottom: "1px solid var(--trait)" }}>
              <span style={{ fontSize: 21 }}>{c.nom}</span>
              <span className="tabnum" style={{ fontSize: 23, fontWeight: 700, whiteSpace: "nowrap" }}>
                {formatNombre(c.avant, c.decimales)} <span style={{ color: "var(--gris)" }}>→</span> {formatNombre(c.apres, c.decimales)} <span style={{ fontSize: 17, color: "var(--texte-3)", fontWeight: 500 }}>{c.unite}</span>
              </span>
              {c.pastille ? <Pastilles liste={[c.pastille]} taille={16} /> : <span />}
            </div>
          ))}
          {r.programme.length > 0 && (
            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8, background: "var(--surface-2)", borderRadius: 14, padding: "12px 16px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 17, fontWeight: 700, letterSpacing: 1.5, color: "var(--texte-3)" }}>
                <IconeHorloge /> PROGRAMMÉ POUR LA SUITE
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 18 }}>
                {r.programme.map((p, i) => (
                  <span key={i} style={{ background: "var(--surface)", borderRadius: 10, padding: "5px 10px", display: "inline-flex", alignItems: "center", gap: 8 }}>
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
          <b style={{ color: "var(--texte-2)" }}>Le saviez-vous ?</b> {r.notePedagogique}
        </p>
        {controle && (
          <button type="button" className="btn-principal" disabled={occupe} onClick={() => agir({ action: "suivant" })} style={{ fontSize: 28, padding: "18px 32px", flex: "none" }}>
            Continuer <IconeFleche taille={28} />
          </button>
        )}
      </div>
      {animation && r.egalite && r.exAequo.length > 1 && <TirageAuSort noms={r.exAequo} fin={fin} />}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Bilan de l'année                                                    */

function BilanAnnee({ vue, agir, occupe, controle }: PropsEcran) {
  const b = vue.bilanAnnee;
  if (!b) return null;
  const derniere = b.annee >= vue.anneeFin;
  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 20, animation: "apparition .5s ease" }}>
        <h1 className="titre" style={{ margin: 0, fontSize: 64, fontWeight: 800, letterSpacing: -1.5 }}>Bilan de l&apos;année {b.annee}</h1>
        <span style={{ fontSize: 24, color: "var(--texte-3)" }}>de janvier à décembre</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 22, flex: 1, minHeight: 0 }}>
        <section style={{ ...CARTE, padding: "22px 28px", display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 24 }}>Les jauges sur l&apos;année</h2>
          {b.jauges.map((j) => {
            const d = j.fin - j.debut;
            return (
              <div key={j.id} style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr) 150px", alignItems: "center", gap: 14, fontSize: 22 }}>
                <IconeJauge id={j.id} taille={28} />
                <span style={{ fontWeight: j.id === "popularite" ? 800 : 500 }}>{j.nom}</span>
                <span className="tabnum" style={{ textAlign: "right", fontWeight: 700 }}>
                  {j.debut} → {j.fin}{" "}
                  <span className={d > 0 ? "fleche-p1" : d < 0 ? "fleche-n1" : "fleche-0"}>{d > 0 ? `+${d}` : d < 0 ? `−${-d}` : "="}</span>
                </span>
              </div>
            );
          })}
        </section>
        <section style={{ ...CARTE, padding: "22px 28px", display: "flex", flexDirection: "column", gap: 10, minHeight: 0, overflow: "hidden" }}>
          <h2 style={{ margin: 0, fontSize: 24 }}>L&apos;année en bref</h2>
          {b.faits.length === 0 && <p style={{ margin: 0, fontSize: 21, color: "var(--texte-3)" }}>Une année calme.</p>}
          {b.faits.map((f, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "110px minmax(0,1fr)", gap: 14, alignItems: "baseline", fontSize: 21, padding: "6px 0", borderTop: i ? "1px solid var(--trait)" : undefined }}>
              <span style={{ fontWeight: 700, color: "var(--texte-3)", textTransform: "capitalize" }}>{nomMois(f.mois)}</span>
              <span>
                <b style={{ color: f.type === "decision" ? "var(--bleu)" : f.type === "crise" ? "var(--n2-texte)" : "var(--texte-3)" }}>
                  {f.type === "decision" ? "Décision · " : f.type === "crise" ? "Crise · " : "Actualité · "}
                </b>
                {f.titre}
              </span>
            </div>
          ))}
          {b.arrivees.length > 0 && (
            <p style={{ margin: "auto 0 0", fontSize: 19, color: "var(--texte-2)", background: "var(--surface-2)", borderRadius: 12, padding: "10px 14px" }}>
              <IconeHorloge taille={18} /> L&apos;an prochain, vos décisions passées commenceront à agir : {b.arrivees.join(" · ")}.
            </p>
          )}
        </section>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 20, alignItems: "center" }}>
        <p style={{ margin: 0, flex: 1, fontSize: 19, color: "var(--texte-3)" }}>En fin d&apos;année, le pays évolue de lui-même : vieillissement, dette, climat… avant l&apos;année suivante.</p>
        {controle && (
          <button type="button" className="btn-principal" disabled={occupe} onClick={() => agir({ action: "suivant" })} style={{ fontSize: 30, padding: "20px 34px" }}>
            {derniere ? "Fin du mandat : le bilan" : `Passer en ${b.annee + 1}`} <IconeFleche taille={30} />
          </button>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Fin du mandat                                                       */

function Fin({ vue, ouvrirMenu }: PropsEcran) {
  const b = vue.bilan;
  const [onglet, setOnglet] = useState<"pays" | "promesses" | "mandat">("pays");
  if (!b) return null;
  return (
    <div style={{ ...CADRE, padding: "30px 52px", display: "flex", flexDirection: "column", gap: 20 }}>
      <EnTete ouvrirMenu={ouvrirMenu} taille={32}>
        <div role="tablist" style={{ display: "flex", gap: 10 }}>
          {([["pays", "Le pays"], ["promesses", "Vos promesses"], ["mandat", "Le mandat"]] as const).map(([id, nom]) => (
            <button key={id} type="button" role="tab" aria-selected={onglet === id} onClick={() => setOnglet(id)}
              style={{ fontSize: 23, fontWeight: 700, padding: "10px 22px", borderRadius: 999, cursor: "pointer", border: "2px solid var(--trait-2)", background: onglet === id ? "var(--soleil)" : "var(--surface)", color: "var(--texte-1)" }}>
              {nom}
            </button>
          ))}
        </div>
      </EnTete>
      <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
        <h1 className="titre" style={{ margin: 0, fontWeight: 800, fontSize: 68, lineHeight: 1, letterSpacing: -2 }}>Votre France en {b.anneeFin}</h1>
        <span style={{ fontSize: 24, color: "var(--texte-3)" }}>Fin du mandat · {vue.joueurs.length} membre{vue.joueurs.length > 1 ? "s" : ""} dans l&apos;équipe</span>
      </div>

      {onglet === "pays" && (
        <section style={{ ...CARTE, flex: 1, minHeight: 0, padding: "24px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 26, fontSize: 18, color: "var(--texte-2)" }}>
            <h2 style={{ margin: 0, fontSize: 26, flex: 1 }}>De {b.anneeDebut} à {b.anneeFin}, puis dix ans après</h2>
            <Legende forme={<span style={{ width: 4, height: 20, background: "var(--gris)", borderRadius: 2 }} />} texte="Départ" bulle={`Valeur en ${b.anneeDebut}, avec les derniers chiffres officiels.`} />
            <Legende forme={<span style={{ width: 14, height: 14, border: "3px solid var(--violet)", borderRadius: "50%" }} />} texte="Sans intervention" bulle="Le même mandat sans aucune décision : mêmes événements tirés au sort, seule l'évolution naturelle agit." />
            <Legende forme={<span style={{ width: 22, height: 10, background: "var(--soleil)", borderRadius: 99 }} />} texte="Votre mandat" bulle={`Où en est chaque jauge en ${b.anneeFin} après vos décisions.`} />
            <Legende forme={<span style={{ width: 12, height: 12, background: "var(--bleu)", transform: "rotate(45deg)" }} />} texte={`Héritage ${b.anneeHeritage}`} bulle="Dix ans après votre départ, si plus personne ne décidait rien : beaucoup de réformes agissent après la fin du mandat." />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "300px minmax(0,1fr) 200px", alignItems: "center", columnGap: 24, rowGap: 22, fontSize: 24, flex: 1 }}>
            {b.jauges.map((j) => (
              <JaugeFin key={j.id} {...j} />
            ))}
          </div>
          <p style={{ margin: 0, fontSize: 21, color: "var(--texte-2)" }}>{b.enseignements[1] ?? b.enseignements[0]}</p>
        </section>
      )}

      {onglet === "promesses" && (
        <div style={{ display: "grid", gridTemplateColumns: "460px minmax(0,1fr)", gap: 24, flex: 1, minHeight: 0 }}>
          <section style={{ ...CARTE, padding: "28px 30px", display: "flex", flexDirection: "column", gap: 18, alignItems: "center", textAlign: "center" }}>
            <Info texte="Part de la démagogie possible que vous avez promise : chaque promesse a été notée de 0 (réaliste) à 3 (très démagogique) d'après les vrais chiffres.">
              <h2 style={{ margin: 0, fontSize: 30 }}>Démagomètre</h2>
            </Info>
            <Demagometre valeur={b.demagometre} />
            <span className="titre tabnum" style={{ fontSize: 56, fontWeight: 800, lineHeight: 1, marginTop: -8 }}>{b.demagometre} %</span>
            <p style={{ margin: 0, fontSize: 22, lineHeight: 1.35, color: "var(--texte-2)" }}>
              {b.demagometre >= 60
                ? "Votre campagne a promis bien plus que ce que les comptes permettaient."
                : b.demagometre >= 30
                  ? "Quelques promesses séduisantes, mais coûteuses."
                  : "Une campagne prudente : moins de rêve, moins de promesses trahies."}
            </p>
            <span className="tabnum" style={{ fontSize: 24, fontWeight: 700 }}>
              {b.promesses.filter((p) => p.faite && p.tenue).length} tenue(s) sur {b.promesses.filter((p) => p.faite).length} promise(s)
            </span>
          </section>
          <section style={{ ...CARTE, padding: "18px 26px", display: "flex", flexDirection: "column", gap: 4, minHeight: 0, overflow: "hidden" }}>
            {b.promesses.map((p, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "160px minmax(0,1fr)", gap: 18, padding: "9px 0", borderTop: i ? "1px solid var(--trait)" : undefined, opacity: p.faite ? 1 : 0.55 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: !p.faite ? "var(--texte-3)" : p.tenue ? "var(--p2-texte)" : "var(--n2-texte)" }}>
                  {!p.faite ? "Pas promise" : p.tenue ? "Tenue" : "Trahie"}
                  <span style={{ display: "block", fontWeight: 600, color: "var(--texte-3)" }}>Démago {"●".repeat(p.demago)}{"○".repeat(3 - p.demago)}</span>
                </span>
                <span style={{ fontSize: 19, lineHeight: 1.3 }}>
                  <b>« {p.texte} »</b> <span style={{ color: "var(--texte-2)" }}>{p.realite}</span>
                </span>
              </div>
            ))}
          </section>
        </div>
      )}

      {onglet === "mandat" && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 24, flex: 1, minHeight: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20, minHeight: 0 }}>
            <section style={{ ...CARTE, padding: "20px 26px", display: "flex", flexDirection: "column", gap: 10 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 24 }}>Les décisions les plus marquantes</h2>
              {b.decisions.map((d) => (
                <div key={d.annee + d.titre} style={{ display: "grid", gridTemplateColumns: "150px minmax(0,1fr) auto", alignItems: "center", gap: 14, fontSize: 20 }}>
                  <span className="tabnum" style={{ fontWeight: 700, color: "var(--texte-3)", textTransform: "capitalize" }}>{nomMois(d.mois)} {d.annee}</span>
                  <span style={{ fontWeight: 600 }}>{d.titre}</span>
                  <Pastilles liste={[d.pastille]} taille={16} />
                </div>
              ))}
            </section>
            <section style={{ ...CARTE, padding: "20px 26px", display: "flex", flexDirection: "column", gap: 10 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 24 }}>Moments clés</h2>
              {b.moments.map((m) => (
                <div key={m.annee + m.evenement} style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 19 }}>
                  <span><b className="tabnum" style={{ color: "var(--texte-3)", textTransform: "capitalize" }}>{nomMois(m.mois)} {m.annee}</b> · <b>{m.evenement}</b></span>
                  <span style={{ color: "var(--texte-2)" }}>
                    {m.cause ? `Après votre décision « ${m.cause} ». ` : ""}{m.reponse ? `Votre réponse : ${m.reponse}.` : ""}
                  </span>
                </div>
              ))}
            </section>
          </div>
          <section style={{ background: "#fff8e1", border: "2px solid var(--soleil)", borderRadius: 24, padding: "24px 30px", display: "flex", flexDirection: "column", gap: 14 }}>
            <h2 style={{ margin: "0 0 2px", fontSize: 28 }}>Ce qu&apos;on retient</h2>
            {b.enseignements.map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 14, fontSize: 22, lineHeight: 1.35 }}>
                <span className="titre" style={{ fontWeight: 800, color: "var(--accent-texte)" }}>{i + 1}</span>
                <span>{e}</span>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

function Legende({ forme, texte, bulle }: { forme: ReactNode; texte: string; bulle: string }) {
  return (
    <Info texte={bulle} style={{ alignItems: "center", gap: 8 }}>
      {forme}
      {texte}
    </Info>
  );
}

function JaugeFin({ id, nom, depart, fin, sans, heritage }: { id: VueJauge["id"]; nom: string; depart: number; fin: number; sans: number; heritage: number }) {
  return (
    <>
      <span style={{ display: "flex", alignItems: "center", gap: 12, fontWeight: id === "popularite" ? 800 : 600 }}>
        <IconeJauge id={id} taille={28} /> {nom}
      </span>
      <div style={{ position: "relative", height: 18, background: "var(--piste)", borderRadius: 99 }}>
        <div style={{ width: `${fin}%`, height: "100%", background: "var(--soleil)", borderRadius: 99 }} />
        <div style={{ position: "absolute", left: `${depart}%`, top: -7, width: 4, height: 32, background: "var(--gris)", borderRadius: 2 }} title={`Départ : ${depart}`} />
        <div style={{ position: "absolute", left: `${sans}%`, top: -3, width: 24, height: 24, marginLeft: -12, border: "4px solid var(--violet)", borderRadius: "50%", background: "var(--surface)" }} title={`Sans intervention : ${sans}`} />
        <div style={{ position: "absolute", left: `${heritage}%`, top: 1, width: 16, height: 16, marginLeft: -8, background: "var(--bleu)", transform: "rotate(45deg)" }} title={`Héritage : ${heritage}`} />
      </div>
      <span className="tabnum" style={{ textAlign: "right", fontWeight: 700 }}>
        {depart} → {fin} <span style={{ color: "var(--bleu)", fontSize: 20 }}>· {heritage}</span>
      </span>
    </>
  );
}

function Demagometre({ valeur }: { valeur: number }) {
  const angle = -90 + (valeur / 100) * 180;
  return (
    <svg width="340" height="200" viewBox="0 0 340 200" role="img" aria-label={`Démagomètre : ${valeur} %`}>
      <path d="M30 180 A140 140 0 0 1 310 180" fill="none" stroke="#e9e1d2" strokeWidth="34" />
      <path d="M30 180 A140 140 0 0 1 123 48" fill="none" stroke="#4cbb7a" strokeWidth="34" />
      <path d="M123 48 A140 140 0 0 1 217 48" fill="none" stroke="#f6a552" strokeWidth="34" />
      <path d="M217 48 A140 140 0 0 1 310 180" fill="none" stroke="#f07070" strokeWidth="34" />
      <g transform={`rotate(${angle} 170 180)`}>
        <line x1="170" y1="180" x2="170" y2="62" stroke="#1d2445" strokeWidth="8" strokeLinecap="round" />
      </g>
      <circle cx="170" cy="180" r="14" fill="#1d2445" />
    </svg>
  );
}

/** Mémorise le jeton hôte (utilisé juste après la création de salle). */
export function memoriserHote(code: string, hote: string) {
  ecrireLocal(`faillite:hote:${code}`, hote);
  ecrireLocal("faillite:derniere-salle", JSON.stringify({ code, le: Date.now() }));
}
