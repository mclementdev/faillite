"use client";
/** Composants d'interface réutilisables, repris des maquettes (Composants.dc.html). */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { JaugeId, NiveauImpact } from "@/engine";
import type { Pastille as TPastille, VueJauge } from "@/lib/types";
import { Info, TitreBulle } from "./Infobulle";

/** Ce que mesure chaque jauge (infobulles). */
export const DESCRIPTION_JAUGE: Record<JaugeId, string> = {
  economie: "La santé de l'activité : croissance, emploi, prix, investissement, productivité et commerce extérieur.",
  finances: "L'état des comptes publics : dette, déficit, charge des intérêts, taux d'emprunt et niveau des prélèvements.",
  paix_sociale: "Le climat du pays : confiance dans les institutions, participation aux élections, grèves, sécurité et satisfaction de vie.",
  ecologie: "L'environnement : émissions de gaz à effet de serre, énergies renouvelables, sols bétonnés, qualité de l'air, biodiversité.",
  services_publics: "La qualité des services : accès aux médecins, niveau scolaire, taille des classes, délais de justice, santé.",
  cohesion: "Les écarts entre Français : pauvreté, inégalités de revenus, chômage des jeunes, coût du logement, écart femmes-hommes.",
  demographie: "L'équilibre des générations : naissances, vieillissement, espérance de vie, nombre d'actifs par retraité.",
  souverainete: "La capacité à décider seul : énergie produite en France, industrie, alimentation, défense, numérique, dette détenue à l'étranger.",
};

export const SYMBOLE: Record<NiveauImpact, string> = { n2: "▼▼", n1: "▼", "0": "–", p1: "▲", p2: "▲▲" };
export const LIBELLE_NIVEAU: Record<NiveauImpact, string> = {
  n2: "forte baisse",
  n1: "baisse",
  "0": "pas d'effet notable",
  p1: "hausse",
  p2: "forte hausse",
};

const PROPS_ICONE = { fill: "none", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export function IconeJauge({ id, taille = 30, couleur = "#F6F1E7" }: { id: JaugeId; taille?: number; couleur?: string }) {
  const p = { ...PROPS_ICONE, width: taille, height: taille, viewBox: "0 0 24 24", stroke: couleur };
  switch (id) {
    case "economie":
      return (<svg {...p}><polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" /></svg>);
    case "finances":
      return (<svg {...p}><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></svg>);
    case "paix_sociale":
      return (<svg {...p}><circle cx="12" cy="12" r="9" /><path d="M8 14.5c1 1.3 2.4 2 4 2s3-.7 4-2" /><line x1="9" y1="9.5" x2="9" y2="10" /><line x1="15" y1="9.5" x2="15" y2="10" /></svg>);
    case "ecologie":
      return (<svg {...p}><path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15" /><path d="M5 19c3-4 6-7 10-9" /></svg>);
    case "services_publics":
      return (<svg {...p}><path d="M3 9.5L12 4l9 5.5" /><line x1="4" y1="20" x2="20" y2="20" /><line x1="6" y1="11" x2="6" y2="17" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /><line x1="18" y1="11" x2="18" y2="17" /></svg>);
    case "cohesion":
      return (<svg {...p}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>);
    case "demographie":
      return (<svg {...p}><circle cx="8" cy="6" r="2.5" /><path d="M4 21v-6a4 4 0 0 1 8 0v6" /><circle cx="17" cy="10" r="2" /><path d="M14 21v-4a3 3 0 0 1 6 0v4" /></svg>);
    case "souverainete":
      return (<svg {...p}><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" /></svg>);
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
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: taille, fontWeight: 700, letterSpacing: 1.2, color: "var(--texte-3)" }}>
        <IconeHorloge taille={taille + 2} />
        {duree === "un_an" ? "EFFET SUR 1 AN" : "EFFET SUR PLUSIEURS ANNÉES"}
      </span>
    </Info>
  );
}

export function Logo({ taille = 46 }: { taille?: number }) {
  return (
    <div className="titre" style={{ fontWeight: 800, fontSize: taille, letterSpacing: taille > 100 ? -6 : -1, lineHeight: 0.9 }}>
      Faillite<span style={{ color: "var(--moutarde)" }}> !</span>
    </div>
  );
}

/** Jauge de la colonne de gauche (normale ou en alerte). */
export function JaugeLigne({ j, seuil, anneeSuivante }: { j: VueJauge; seuil: number; anneeSuivante: number }) {
  const alerte = j.alerte;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        background: alerte ? "var(--alerte-fond)" : "var(--surface)",
        border: alerte ? "2px solid var(--n2)" : "2px solid transparent",
        borderRadius: 16,
        padding: alerte ? "10px 16px" : "10px 18px",
        animation: alerte ? "alertPulse 1.8s ease-in-out infinite" : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <IconeJauge id={j.id} couleur={alerte ? "#FF4D5E" : "#F6F1E7"} />
        <span style={{ fontSize: 24, fontWeight: alerte ? 700 : 500, flex: 1 }}>{j.nom}</span>
        <span className={`fleche-${j.tendance}`} style={{ fontSize: 20, fontWeight: 700 }} aria-label={`tendance : ${LIBELLE_NIVEAU[j.tendance]}`}>
          {SYMBOLE[j.tendance]}
        </span>
        <span className="tabnum" style={{ fontSize: 34, fontWeight: 700, width: 52, textAlign: "right", color: alerte ? "var(--n2)" : undefined }}>
          {j.valeur}
        </span>
      </div>
      <div style={{ position: "relative", height: 10, background: alerte ? "var(--alerte-piste)" : "var(--piste)", borderRadius: 99 }}>
        <div style={{ width: `${j.valeur}%`, height: "100%", background: alerte ? "var(--n2)" : "var(--craie)", borderRadius: 99, transition: "width .8s ease" }} />
        <div style={{ position: "absolute", left: `${seuil}%`, top: -3, width: 2, height: 16, background: alerte ? "var(--craie)" : "var(--gris)" }} />
      </div>
      {alerte && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 17, fontWeight: 700, color: "#FFB3BA", letterSpacing: 0.3 }}>
          <IconeAlerte />
          ALERTE · sous {seuil}, événement en {anneeSuivante}
        </div>
      )}
    </div>
  );
}

/** Anneau du minuteur (orange et battement sous 10 s). */
export function Anneau({ restant, total, taille = 80 }: { restant: number; total: number; taille?: number }) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, restant / total)) : 0;
  const urgent = restant <= 10;
  return (
    <svg width={taille} height={taille} viewBox="0 0 100 100" role="img" aria-label={`${Math.ceil(restant)} secondes restantes`} style={{ animation: urgent && restant > 0 ? "battement 1s ease-in-out infinite" : undefined }}>
      <circle cx="50" cy="50" r="42" fill="none" stroke="#34303F" strokeWidth="10" />
      <circle cx="50" cy="50" r="42" fill="none" stroke={urgent ? "#FF9A3C" : "#FFD23F"} strokeWidth="10" strokeLinecap="round" strokeDasharray="264" strokeDashoffset={264 * (1 - ratio)} transform="rotate(-90 50 50)" style={{ transition: "stroke-dashoffset .3s linear" }} />
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
          <span key={i} style={{ width: taille, height: taille, borderRadius: "50%", background: "var(--moutarde)" }} />
        ) : (
          <span key={i} style={{ width: taille, height: taille, borderRadius: "50%", border: "3px solid var(--trait-2)" }} />
        ),
      )}
    </div>
  );
}

export function Puce({ children, fond = "var(--craie)", taille = 18 }: { children: ReactNode; fond?: string; taille?: number }) {
  return (
    <span style={{ alignSelf: "flex-start", fontSize: taille, fontWeight: 700, letterSpacing: 1.2, color: "var(--encre)", background: fond, padding: taille > 14 ? "6px 14px" : "3px 8px", borderRadius: taille > 14 ? 8 : 6 }}>
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

export function IconeCouronne({ taille = 22, couleur = "currentColor" }: { taille?: number; couleur?: string }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" />
    </svg>
  );
}

/** Mention de la présidence du sénat (élue en début de partie). */
export function PucePresidence({ pseudo, taille = 22 }: { pseudo: string; taille?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: taille, fontWeight: 700, background: "var(--surface-2)", padding: `${taille * 0.3}px ${taille * 0.7}px`, borderRadius: 999, whiteSpace: "nowrap", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>
      <IconeCouronne taille={taille} couleur="#FFD23F" />
      <span style={{ color: "var(--texte-3)", fontWeight: 500 }}>Présidence</span> {pseudo}
    </span>
  );
}

export function InfoPresidence({ pseudo, taille = 22 }: { pseudo: string; taille?: number }) {
  return (
    <Info bloc texte={<><TitreBulle>PRÉSIDENCE DU SÉNAT</TitreBulle>{pseudo} a reçu le plus de voix au premier vote de la partie. Quand un vote est à égalité, sa voix compte double : son option l&apos;emporte si elle fait partie des ex aequo. Sinon, le sort tranche.</>}>
      <PucePresidence pseudo={pseudo} taille={taille} />
    </Info>
  );
}
