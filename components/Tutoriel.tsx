"use client";
/**
 * Tutoriel du grand écran (6 étapes), affiché avant la campagne ou depuis le salon.
 * Chaque étape montre les vrais composants du jeu avec des valeurs d'exemple.
 */
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { MOIS_COURTS } from "@/lib/libelles";
import type { Pastille, VueJauge } from "@/lib/types";
import { BadgeMinistere, EtiquetteOutil, IconeAlerte, IconeElysee, IconeFleche, IconeHorloge, JaugeLigne, JaugePopularite, MentionBudget, MentionDuree, Pastilles } from "./ui";

const P = (jauge: Pastille["jauge"], nom: string, niveau: Pastille["niveau"], delta?: number): Pastille => ({ jauge, nom, niveau, delta });

const JAUGES_EXEMPLE: VueJauge[] = [
  { id: "economie", nom: "Économie", valeur: 52, tendance: "p1", alerte: false },
  { id: "finances", nom: "Finances publiques", valeur: 31, tendance: "n2", alerte: true },
  { id: "ecologie", nom: "Climat et nature", valeur: 44, tendance: "0", alerte: false },
];

const BLOC: CSSProperties = { background: "var(--surface)", border: "2px solid var(--trait)", borderRadius: 24, padding: "24px 28px", display: "flex", flexDirection: "column", gap: 14, boxShadow: "var(--ombre)" };

function Bloc({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...BLOC, ...style }}>{children}</div>;
}

interface Etape {
  titre: string;
  texte: ReactNode;
  visuel: ReactNode;
}

function etapes(nbAnnees: number, anneeDepart: number, seuil: number): Etape[] {
  const fin = anneeDepart + nbAnnees - 1;
  return [
    {
      titre: "Vous êtes le président",
      texte: (
        <>
          Ensemble, vous formez une seule équipe présidentielle. D&apos;abord la campagne, puis {nbAnnees === 5 ? "un quinquennat" : "deux quinquennats"}, de {anneeDepart} à {fin}.
          <br />
          <br />
          Chacun vote en secret sur son téléphone, la majorité l&apos;emporte. Il n&apos;y a pas de « bonne » réponse : le jeu montre les effets de vos choix.
        </>
      ),
      visuel: (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 18 }}>
          {[
            ["1", "La campagne", "Promettre ou pas ? Il faut plus de 50 % pour être élus… mais chaque promesse devra être tenue."],
            ["2", "Le mandat", "Les mois défilent : des décisions à prendre, des crises à gérer."],
            ["3", "Le bilan", "Votre France, comparée à celle qu'on aurait eue sans rien faire."],
          ].map(([n, t, d]) => (
            <Bloc key={n} style={{ alignItems: "flex-start" }}>
              <span className="titre" style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--soleil)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 34 }}>{n}</span>
              <span className="titre" style={{ fontSize: 34, fontWeight: 800 }}>{t}</span>
              <span style={{ fontSize: 22, color: "var(--texte-2)", lineHeight: 1.35 }}>{d}</span>
            </Bloc>
          ))}
        </div>
      ),
    },
    {
      titre: "Le pays, et votre popularité",
      texte: (
        <>
          Six jauges de 0 à 100 résument le pays, chacune à partir de vrais indicateurs partis des derniers chiffres officiels.
          <br />
          <br />
          Sous <b style={{ color: "var(--n2-texte)" }}>{seuil}</b>, une jauge passe <b style={{ color: "var(--n2-texte)" }}>en alerte</b> : une crise peut éclater. La <b>popularité</b> réagit plus vite que tout le reste.
        </>
      ),
      visuel: (
        <Bloc style={{ gap: 10 }}>
          <JaugePopularite j={{ id: "popularite", nom: "Popularité", valeur: 47, tendance: "n1", alerte: false }} seuil={seuil} />
          {JAUGES_EXEMPLE.map((j) => (
            <JaugeLigne key={j.id} j={j} seuil={seuil} compacte />
          ))}
          <span style={{ fontSize: 19, color: "var(--texte-3)", marginTop: 6 }}>Le bouton « Les vrais chiffres » montre à tout moment les indicateurs derrière chaque jauge, dont la démographie.</span>
        </Bloc>
      ),
    },
    {
      titre: "Les mois défilent",
      texte: (
        <>
          Chaque année, <b>trois décisions</b> tombent à des moments imprévisibles, et <b>au plus deux événements</b> : bonnes nouvelles, coups durs ou crises.
          <br />
          <br />
          Une crise exige une réponse immédiate. Et vos décisions passées peuvent en provoquer : le jeu vous dira laquelle.
        </>
      ),
      visuel: (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Bloc>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0,1fr))", gap: 6 }}>
              {MOIS_COURTS.map((m, i) => (
                <div key={m} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <div style={{ width: "100%", height: i === 4 ? 18 : 12, borderRadius: 99, background: i === 4 ? "var(--soleil)" : i < 4 ? "var(--texte-1)" : "var(--piste)" }} />
                  <span style={{ fontSize: i === 4 ? 19 : 15, fontWeight: i === 4 ? 800 : 600, color: i <= 4 ? "var(--texte-1)" : "var(--gris)" }}>{m}</span>
                </div>
              ))}
            </div>
          </Bloc>
          <div style={{ background: "var(--alerte-fond)", border: "3px solid var(--n2)", borderRadius: 24, padding: "20px 26px", display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start", fontSize: 18, fontWeight: 800, letterSpacing: 2, color: "#fff", background: "var(--n2-texte)", padding: "4px 12px", borderRadius: 8 }}>
              <IconeAlerte /> CRISE · MAI {anneeDepart + 1}
            </span>
            <span className="titre" style={{ fontSize: 34, fontWeight: 800 }}>Plus d&apos;essence : les raffineries bloquées</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 19, fontWeight: 600, color: "var(--violet)", background: "var(--violet-fond)", borderRadius: 10, padding: "6px 12px", alignSelf: "flex-start" }}>
              <IconeHorloge taille={18} /> Conséquence de votre décision de février {anneeDepart + 1} : Taxe carbone à 150 €/t
            </span>
          </div>
        </div>
      ),
    },
    {
      titre: "Lire une décision",
      texte: (
        <>
          Chaque carte relève d&apos;un <b>ministère</b>. Chaque option dit <b>comment</b> elle s&apos;applique (décret, loi, budget, référendum…) et ce qu&apos;elle <b>coûte</b>.
          <br />
          <br />
          Les pastilles montrent les jauges touchées : <b className="fleche-p1">▲</b> hausse, <b className="fleche-n1">▼</b> baisse, doublées si l&apos;effet est fort. Les chiffres exacts arrivent après le vote.
        </>
      ),
      visuel: (
        <Bloc style={{ gap: 14 }}>
          <BadgeMinistere ministere="sante" />
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="titre" style={{ width: 50, height: 50, flex: "none", borderRadius: "50%", background: "var(--soleil)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 27 }}>A</span>
            <span className="titre" style={{ fontWeight: 800, fontSize: 36, lineHeight: 1.05 }}>Former plus de médecins</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <EtiquetteOutil outil="decret" taille={19} />
            <MentionDuree duree="plusieurs_annees" taille={18} />
            <MentionBudget budget={2} taille={19} />
          </div>
          <p style={{ margin: 0, fontSize: 23, lineHeight: 1.35, color: "var(--texte-2)" }}>Plus de places en faculté de médecine : les nouveaux médecins arrivent dans dix ans.</p>
          <Pastilles liste={[P("services_publics", "Services", "p2"), P("finances", "Finances", "n1")]} taille={21} />
        </Bloc>
      ),
    },
    {
      titre: "Pendant le vote",
      texte: (
        <>
          À mi-vote, un <b>flash info</b> peut tomber pour relancer le débat : 15 secondes de plus pour changer d&apos;avis.
          <br />
          <br />
          En cas d&apos;<b>égalité</b>, un second tour rapide départage les ex aequo. Si l&apos;égalité persiste, le sort tranche.
        </>
      ),
      visuel: (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20, background: "var(--texte-1)", color: "#fff", borderRadius: 20, padding: "18px 24px" }}>
            <span className="titre" style={{ flex: "none", fontSize: 24, fontWeight: 800, background: "var(--n2-texte)", padding: "6px 12px", borderRadius: 8 }}>FLASH INFO</span>
            <span style={{ fontSize: 23, lineHeight: 1.3, fontWeight: 600 }}>Les urgences de cinq hôpitaux ferment la nuit cet été faute de personnel.</span>
          </div>
          <Bloc style={{ flexDirection: "row", alignItems: "center", gap: 18, background: "#fff3cf", border: "3px solid var(--soleil)" }}>
            <span className="titre" style={{ fontSize: 30, fontWeight: 800 }}>Égalité ! Second tour</span>
            <span style={{ fontSize: 21, color: "var(--texte-2)" }}>20 secondes pour départager A et C.</span>
          </Bloc>
        </div>
      ),
    },
    {
      titre: `Rendez-vous en ${fin}`,
      texte: (
        <>
          Le bilan compare votre France à celle qu&apos;on aurait eue <b style={{ color: "var(--violet)" }}>sans aucune décision</b>, montre l&apos;héritage dix ans plus tard… et sort le <b>démagomètre</b> : vos promesses face aux vrais chiffres.
          <br />
          <br />
          Gouverner, c&apos;est arbitrer. Bonne campagne !
        </>
      ),
      visuel: (
        <Bloc style={{ alignItems: "center", gap: 18 }}>
          <IconeElysee taille={90} couleur="#1d2445" />
          <span className="titre" style={{ fontSize: 40, fontWeight: 800 }}>Démagomètre : 72 %</span>
          <span style={{ fontSize: 22, color: "var(--texte-2)", textAlign: "center" }}>« Je ramènerai l&apos;âge de la retraite à 62 ans » : environ 10 à 15 milliards d&apos;euros par an. Promesse trahie.</span>
        </Bloc>
      ),
    },
  ];
}

/**
 * `terminer` est appelé à la dernière étape (ou avec « Passer ») ; `libelleFin` nomme ce bouton.
 */
export default function Tutoriel({ nbAnnees, anneeDepart, seuil, terminer, libelleFin }: { nbAnnees: number; anneeDepart: number; seuil: number; terminer: () => void; libelleFin: string }) {
  const liste = etapes(nbAnnees, anneeDepart, seuil);
  const [i, setI] = useState(0);
  const derniere = i === liste.length - 1;
  const suivant = useCallback(() => (derniere ? terminer() : setI((x) => x + 1)), [derniere, terminer]);

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") suivant();
      else if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
      else if (e.key === "Escape") terminer();
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [suivant, terminer]);

  const e = liste[i];
  return (
    <div role="dialog" aria-modal="true" aria-label="Comment jouer" style={{ position: "absolute", inset: 0, zIndex: 20, background: "var(--fond)", padding: "56px 72px", display: "flex", flexDirection: "column", gap: 36 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2, color: "var(--texte-3)" }}>COMMENT JOUER · {i + 1} / {liste.length}</span>
        <div style={{ display: "flex", gap: 10 }} aria-hidden="true">
          {liste.map((_, k) => (
            <span key={k} style={{ width: k === i ? 40 : 14, height: 14, borderRadius: 99, background: k <= i ? "var(--soleil)" : "var(--piste)", transition: "width .3s ease" }} />
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {!derniere && (
          <button type="button" className="btn-contour" onClick={terminer} style={{ fontSize: 22, padding: "10px 22px" }}>
            Passer le tutoriel
          </button>
        )}
      </header>

      <div key={i} style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0,5fr) minmax(0,6fr)", gap: 72, alignItems: "center", animation: "apparition .45s ease" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <h1 className="titre" style={{ margin: 0, fontWeight: 800, fontSize: 80, lineHeight: 1, letterSpacing: -2 }}>{e.titre}</h1>
          <p style={{ margin: 0, fontSize: 30, lineHeight: 1.4, color: "var(--texte-2)" }}>{e.texte}</p>
        </div>
        <div>{e.visuel}</div>
      </div>

      <footer style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <button type="button" className="btn-contour" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} style={{ fontSize: 24, padding: "16px 28px", visibility: i === 0 ? "hidden" : "visible" }}>
          Précédent
        </button>
        <span style={{ flex: 1, textAlign: "center", fontSize: 19, color: "var(--texte-3)" }}>Flèches du clavier pour naviguer · Échap pour passer</span>
        <button type="button" className="btn-principal" onClick={suivant} autoFocus style={{ fontSize: 30, padding: "20px 36px", borderRadius: 22 }}>
          {derniere ? libelleFin : "Suivant"} <IconeFleche taille={30} />
        </button>
      </footer>
    </div>
  );
}
