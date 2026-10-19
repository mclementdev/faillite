"use client";
/** Composants d'interface réutilisables (grand écran, téléphones, tutoriel). */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { JaugeId, Ministere, NiveauImpact, Outil } from "@/engine";
import { MINISTERES_LIBELLES, OUTILS_LIBELLES } from "@/lib/libelles";
import type { Pastille as TPastille, VueJauge } from "@/lib/types";
import { Info, TitreBulle } from "./Infobulle";

export const SYMBOLE: Record<NiveauImpact, string> = { n2: "▼▼", n1: "▼", "0": "–", p1: "▲", p2: "▲▲" };
export const LIBELLE_NIVEAU: Record<NiveauImpact, string> = {
  n2: "forte baisse",
  n1: "baisse",
  "0": "pas d'effet notable",
  p1: "hausse",
  p2: "forte hausse",
};

/** Ce que mesure chaque jauge (infobulles). */
export const DESCRIPTION_JAUGE: Record<JaugeId, string> = {
  economie: "La santé de l'activité : croissance, emploi, prix, investissement, productivité et commerce extérieur.",
  finances: "L'état des comptes publics : dette, déficit, charge des intérêts, taux d'emprunt et niveau des prélèvements.",
  cohesion: "Le climat du pays : pauvreté, inégalités, logement, chômage des jeunes, confiance, grèves, sécurité et moral des Français.",
  ecologie: "L'environnement : émissions de gaz à effet de serre, énergies renouvelables, sols bétonnés, qualité de l'air, biodiversité.",
  services_publics: "La qualité des services : accès aux médecins, niveau scolaire, taille des classes, délais de justice, santé.",
  souverainete: "La capacité à décider seul : énergie produite en France, industrie, alimentation, défense, numérique, dette détenue à l'étranger.",
  popularite: "La part de Français qui approuvent votre action. Elle réagit vite : au porte-monnaie, aux grèves, aux crises et aux promesses tenues ou trahies.",
};

const PROPS_ICONE = { fill: "none", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export function IconeJauge({ id, taille = 30, couleur = "currentColor" }: { id: JaugeId; taille?: number; couleur?: string }) {
  const p = { ...PROPS_ICONE, width: taille, height: taille, viewBox: "0 0 24 24", stroke: couleur };
  switch (id) {
    case "economie":
      return (<svg {...p}><polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" /></svg>);
    case "finances":
      return (<svg {...p}><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></svg>);
    case "cohesion":
      return (<svg {...p}><circle cx="8" cy="8" r="3" /><circle cx="16" cy="8" r="3" /><path d="M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M14 14.5c.6-.3 1.3-.5 2-.5 3.3 0 6 2.7 6 6" /></svg>);
    case "ecologie":
      return (<svg {...p}><path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15" /><path d="M5 19c3-4 6-7 10-9" /></svg>);
    case "services_publics":
      return (<svg {...p}><path d="M3 9.5L12 4l9 5.5" /><line x1="4" y1="20" x2="20" y2="20" /><line x1="6" y1="11" x2="6" y2="17" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /><line x1="18" y1="11" x2="18" y2="17" /></svg>);
    case "souverainete":
      return (<svg {...p}><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" /></svg>);
    case "popularite":
      return (<svg {...p}><path d="M7 11v9H4v-9z" /><path d="M7 11l4-7c1.5 0 2.5 1 2.5 2.5L13 10h6a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.8 20H7" /></svg>);
  }
}

export function IconeHorloge({ taille = 20 }: { taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  );
}

export function IconeFleche({ taille = 22 }: { taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="13 6 19 12 13 18" />
    </svg>
  );
}

export function IconeCadenas({ taille = 22 }: { taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function IconeCoche({ taille = 24, couleur = "currentColor" }: { taille?: number; couleur?: string }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="5 12.5 10 17.5 19 7" />
    </svg>
  );
}

export function IconeAlerte({ taille = 18 }: { taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l10 18H2z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <line x1="12" y1="17.5" x2="12" y2="17.6" />
    </svg>
  );
}

/** Le palais : logo-symbole du jeu. */
export function IconeElysee({ taille = 28, couleur = "currentColor" }: { taille?: number; couleur?: string }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l9-5 9 5" />
      <line x1="3" y1="20" x2="21" y2="20" />
      <line x1="5" y1="10" x2="5" y2="17" /><line x1="9.5" y1="10" x2="9.5" y2="17" /><line x1="14.5" y1="10" x2="14.5" y2="17" /><line x1="19" y1="10" x2="19" y2="17" />
      <line x1="4" y1="17.5" x2="20" y2="17.5" />
    </svg>
  );
}

/** Pastille d'impact : toujours symbole + couleur (jamais la couleur seule). */
export function Pastille({ p, taille = 20, chiffre = false }: { p: TPastille; taille?: number; chiffre?: boolean }) {
  const pad = taille >= 19 ? "7px 14px" : taille >= 16 ? "4px 12px" : "3px 9px";
  const delta = chiffre && p.delta !== undefined ? ` ${p.delta > 0 ? "+" : p.delta < 0 ? "−" : ""}${Math.abs(p.delta).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}` : "";
  const fort = p.niveau === "p2" || p.niveau === "n2";
  const bulle = (
    <>
      <TitreBulle>{p.nom.toUpperCase()} · {LIBELLE_NIVEAU[p.niveau].toUpperCase()}</TitreBulle>
      {p.delta !== undefined && chiffre
        ? <>Écart mesuré : <b>{p.delta > 0 ? "+" : p.delta < 0 ? "−" : ""}{Math.abs(p.delta).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} point{Math.abs(p.delta) >= 2 ? "s" : ""}</b> sur la jauge, au plus fort des années qui viennent. </>
        : <>Effet estimé sur la jauge, au plus fort des années qui viennent. </>}
      {fort ? "Double flèche : effet fort (2 points de jauge ou plus)." : "Flèche simple : effet modéré."}
    </>
  );
  return (
    <Info texte={bulle}>
      <span className={`pastille niv-${p.niveau}`} style={{ fontSize: taille, padding: pad }}>
        <span aria-hidden="true">{SYMBOLE[p.niveau]}</span>
        <span>
          <span className="sr-only">{LIBELLE_NIVEAU[p.niveau]} : </span>
          {p.nom}
          {delta}
        </span>
      </span>
    </Info>
  );
}

export function Pastilles({ liste, taille = 20, chiffre = false, style }: { liste: TPastille[]; taille?: number; chiffre?: boolean; style?: CSSProperties }) {
  if (!liste.length)
    return (
      <span style={{ display: "flex", flexWrap: "wrap", gap: 10, ...style }}>
        <span className="pastille niv-0" style={{ fontSize: taille, padding: taille >= 19 ? "7px 14px" : "3px 9px" }}>
          <span aria-hidden="true">–</span> Pas d&apos;effet notable
        </span>
      </span>
    );
  return (
    <span style={{ display: "flex", flexWrap: "wrap", gap: taille >= 19 ? 10 : 6, ...style }}>
      {liste.map((p) => (
        <Pastille key={p.jauge} p={p} taille={taille} chiffre={chiffre} />
      ))}
    </span>
  );
}

export function MentionDuree({ duree, taille = 18 }: { duree: "un_an" | "plusieurs_annees"; taille?: number }) {
  return (
    <Info
      texte={
        duree === "un_an"
          ? "La mesure agit surtout l'année du vote. Ses conséquences peuvent pourtant se prolonger : un déficit d'un an, par exemple, laisse une dette plus élevée."
          : "Une partie des effets dure ou n'arrive qu'après plusieurs années (formation, construction, investissement). Ils seront signalés quand ils se produiront."
      }
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: taille, fontWeight: 700, color: "var(--texte-3)" }}>
        <IconeHorloge taille={taille + 2} />
        {duree === "un_an" ? "Effet sur 1 an" : "Effet sur plusieurs années"}
      </span>
    </Info>
  );
}

/** Comment la mesure se met en œuvre (décret, loi, budget…). */
export function EtiquetteOutil({ outil, taille = 18 }: { outil: Outil; taille?: number }) {
  const o = OUTILS_LIBELLES[outil];
  const couleurs: Record<Outil, string> = { decret: "#e8eefc", loi: "#efe9fb", budget: "#fff3cf", referendum: "#fde7ec", negociation: "#e4f4ee", decision: "#eef0f4" };
  return (
    <Info texte={<><TitreBulle>{o.court.toUpperCase()}</TitreBulle>{o.detail}</>}>
      <span style={{ display: "inline-flex", alignItems: "center", fontSize: taille, fontWeight: 700, color: "var(--texte-1)", background: couleurs[outil], border: "1px solid var(--trait)", borderRadius: 8, padding: taille >= 16 ? "3px 10px" : "2px 7px", whiteSpace: "nowrap" }}>
        {o.court}
      </span>
    </Info>
  );
}

/** Effet sur le budget de l'État, en milliards d'euros par an. */
export function MentionBudget({ budget, taille = 18 }: { budget?: number; taille?: number }) {
  if (budget === undefined) return null;
  const cout = budget > 0;
  return (
    <Info texte={`Effet estimé sur le budget de l'État : ${cout ? "dépense ou perte de recettes" : "économie ou recette"} d'environ ${Math.abs(budget)} milliard${Math.abs(budget) >= 2 ? "s" : ""} d'euros par an.`}>
      <span className="tabnum" style={{ fontSize: taille, fontWeight: 700, color: cout ? "var(--n1-texte)" : "var(--p2-texte)", whiteSpace: "nowrap" }}>
        {cout ? "Coût" : "Économie"} ≈ {Math.abs(budget)} Md€/an
      </span>
    </Info>
  );
}

/** Badge du ministère d'une carte. */
export function BadgeMinistere({ ministere, taille = 18 }: { ministere: Ministere; taille?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: taille, fontWeight: 700, letterSpacing: 1, color: "var(--bleu)", textTransform: "uppercase" }}>
      <span style={{ width: taille * 0.6, height: taille * 0.6, borderRadius: 3, background: "var(--bleu)" }} aria-hidden="true" />
      Ministère · {MINISTERES_LIBELLES[ministere]}
    </span>
  );
}

export function Logo({ taille = 46, couleur }: { taille?: number; couleur?: string }) {
  return (
    <div className="titre" style={{ fontWeight: 800, fontSize: taille, letterSpacing: taille > 100 ? -4 : -1, lineHeight: 0.95, color: couleur ?? "var(--texte-1)", whiteSpace: "nowrap" }}>
      À vous l&apos;Élysée<span style={{ color: "var(--soleil)" }}> !</span>
    </div>
  );
}

/** Jauge de la colonne de gauche (normale ou en alerte). */
export function JaugeLigne({ j, seuil, compacte }: { j: VueJauge; seuil: number; compacte?: boolean }) {
  const alerte = j.alerte;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: compacte ? 5 : 7,
        background: alerte ? "var(--alerte-fond)" : "var(--surface)",
        border: alerte ? "2px solid var(--n2)" : "2px solid var(--trait)",
        borderRadius: 16,
        padding: compacte ? "8px 14px" : "10px 16px",
        animation: alerte ? "alertPulse 1.8s ease-in-out infinite" : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <IconeJauge id={j.id} taille={compacte ? 24 : 28} couleur={alerte ? "#b42525" : "#1d2445"} />
        <span style={{ fontSize: compacte ? 21 : 23, fontWeight: alerte ? 700 : 600, flex: 1 }}>{j.nom}</span>
        <span className={`fleche-${j.tendance}`} style={{ fontSize: 19, fontWeight: 700 }} aria-label={`tendance : ${LIBELLE_NIVEAU[j.tendance]}`}>
          {SYMBOLE[j.tendance]}
        </span>
        <span className="tabnum" style={{ fontSize: compacte ? 28 : 32, fontWeight: 800, width: 48, textAlign: "right", color: alerte ? "var(--n2-texte)" : undefined }}>
          {j.valeur}
        </span>
      </div>
      <div style={{ position: "relative", height: 9, background: alerte ? "var(--alerte-piste)" : "var(--piste)", borderRadius: 99 }}>
        <div style={{ width: `${j.valeur}%`, height: "100%", background: alerte ? "var(--n2-texte)" : "var(--texte-1)", borderRadius: 99, transition: "width .8s ease" }} />
        <div style={{ position: "absolute", left: `${seuil}%`, top: -3, width: 2, height: 15, background: alerte ? "var(--n2-texte)" : "var(--gris)" }} />
      </div>
      {alerte && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 700, color: "var(--n2-texte)" }}>
          <IconeAlerte />
          Alerte : une crise peut éclater
        </div>
      )}
    </div>
  );
}

/** Popularité du président : grande jauge à part, en pourcentage. */
export function JaugePopularite({ j, seuil, taille = 1 }: { j: VueJauge; seuil: number; taille?: number }) {
  const bas = j.valeur < seuil;
  const couleur = bas ? "var(--n2-texte)" : j.valeur >= 50 ? "var(--p2-texte)" : "var(--accent-texte)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 * taille, background: bas ? "var(--alerte-fond)" : "#fff8e1", border: `2px solid ${bas ? "var(--n2)" : "var(--soleil)"}`, borderRadius: 18, padding: `${12 * taille}px ${16 * taille}px` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <IconeJauge id="popularite" taille={30 * taille} couleur="#1d2445" />
        <span style={{ fontSize: 23 * taille, fontWeight: 800, flex: 1 }}>Popularité</span>
        <span className={`fleche-${j.tendance}`} style={{ fontSize: 19 * taille, fontWeight: 700 }}>{SYMBOLE[j.tendance]}</span>
        <span className="titre tabnum" style={{ fontSize: 40 * taille, fontWeight: 800, color: couleur }}>{j.valeur} %</span>
      </div>
      <div style={{ position: "relative", height: 12 * taille, background: "rgba(29,36,69,.1)", borderRadius: 99 }}>
        <div style={{ width: `${j.valeur}%`, height: "100%", background: couleur, borderRadius: 99, transition: "width .8s ease" }} />
        <div style={{ position: "absolute", left: "50%", top: -3, width: 2, height: 12 * taille + 6, background: "var(--gris)" }} title="50 %" />
      </div>
    </div>
  );
}

/** Anneau du minuteur (orange et battement sous 10 s). */
export function Anneau({ restant, total, taille = 80 }: { restant: number; total: number; taille?: number }) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, restant / total)) : 0;
  const urgent = restant <= 10;
  return (
    <svg width={taille} height={taille} viewBox="0 0 100 100" role="img" aria-label={`${Math.ceil(restant)} secondes restantes`} style={{ animation: urgent && restant > 0 ? "battement 1s ease-in-out infinite" : undefined }}>
      <circle cx="50" cy="50" r="42" fill="none" stroke="#e9e1d2" strokeWidth="10" />
      <circle cx="50" cy="50" r="42" fill="none" stroke={urgent ? "#e5762a" : "#f5b700"} strokeWidth="10" strokeLinecap="round" strokeDasharray="264" strokeDashoffset={264 * (1 - ratio)} transform="rotate(-90 50 50)" style={{ transition: "stroke-dashoffset .3s linear" }} />
    </svg>
  );
}

export function formatMinuteur(s: number): string {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** Secondes restantes avant l'échéance (corrigées du décalage d'horloge avec le serveur). */
export function useRestant(echeance: number | undefined, decalage: number): number {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    if (!echeance) return;
    const t = setInterval(() => setMaintenant(Date.now()), 250);
    return () => clearInterval(t);
  }, [echeance]);
  if (!echeance) return 0;
  return Math.max(0, (echeance - (maintenant + decalage)) / 1000);
}

export function Points({ n, total, taille = 22 }: { n: number; total: number; taille?: number }) {
  const max = Math.min(total, 30);
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(Math.max(6, Math.ceil(max / 2)), 10)}, minmax(0, 1fr))`, gap: 8 }} role="img" aria-label={`${n} votes sur ${total}`}>
      {Array.from({ length: max }, (_, i) =>
        i < n ? (
          <span key={i} style={{ width: taille, height: taille, borderRadius: "50%", background: "var(--soleil)" }} />
        ) : (
          <span key={i} style={{ width: taille, height: taille, borderRadius: "50%", border: "3px solid var(--trait-2)" }} />
        ),
      )}
    </div>
  );
}

export function Puce({ children, fond = "var(--surface-2)", taille = 18 }: { children: ReactNode; fond?: string; taille?: number }) {
  return (
    <span style={{ alignSelf: "flex-start", fontSize: taille, fontWeight: 700, letterSpacing: 1, color: "var(--texte-1)", background: fond, padding: taille > 14 ? "6px 14px" : "3px 8px", borderRadius: taille > 14 ? 8 : 6 }}>
      {children}
    </span>
  );
}

export function libelleType(type: "unique" | "cumulable" | "curseur", long: boolean): string {
  if (type === "unique") return long ? "CHOIX UNIQUE · UNE SEULE OPTION RETENUE" : "CHOIX UNIQUE";
  if (type === "cumulable") return long ? "CUMULABLE · LES 2 OPTIONS LES PLUS VOTÉES SONT RETENUES" : "CUMULABLE · 2 RETENUES";
  return long ? "CURSEUR · LA VALEUR MÉDIANE DES VOTES EST RETENUE" : "CURSEUR · LA MÉDIANE L'EMPORTE";
}

export function formatNombre(v: number, decimales: number): string {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}
