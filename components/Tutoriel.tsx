"use client";
/**
 * Tutoriel du grand écran (6 étapes), affiché avant le premier tour ou depuis le salon.
 * Chaque étape montre les vrais composants du jeu avec des valeurs d'exemple.
 */
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { Pastille, VueJauge } from "@/lib/types";
import { IconeCadenas, IconeFleche, IconeHorloge, JaugeLigne, MentionDuree, Pastilles, Puce } from "./ui";

const P = (jauge: Pastille["jauge"], nom: string, niveau: Pastille["niveau"], delta?: number): Pastille => ({ jauge, nom, niveau, delta });

const JAUGES_EXEMPLE: VueJauge[] = [
  { id: "economie", nom: "Économie", valeur: 52, tendance: "p1", alerte: false },
  { id: "finances", nom: "Finances publiques", valeur: 31, tendance: "n2", alerte: true },
  { id: "ecologie", nom: "Écologie", valeur: 44, tendance: "0", alerte: false },
];

function Bloc({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ background: "var(--surface)", borderRadius: 24, padding: "24px 28px", display: "flex", flexDirection: "column", gap: 14, ...style }}>{children}</div>;
}

function Etiquette({ children, couleur = "var(--moutarde)" }: { children: ReactNode; couleur?: string }) {
  return <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1.5, color: couleur }}>{children}</span>;
}

interface Etape {
  titre: string;
  texte: ReactNode;
  visuel: ReactNode;
}

function etapes(nbTours: number, anneeDepart: number, seuil: number): Etape[] {
  const fin = anneeDepart + nbTours - 1;
  return [
    {
      titre: "Vous êtes le sénat",
      texte: (
        <>
          De {anneeDepart} à {fin}, chaque année, une décision à prendre. Chacun vote en secret sur son téléphone, la majorité l&apos;emporte.
          <br />
          <br />
          Il n&apos;y a pas de « bonne » réponse : le jeu montre seulement les effets de vos choix, à court et à long terme.
        </>
      ),
      visuel: (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 18 }}>
          {[
            ["1", "Lisez", "La carte de l'année et ses options s'affichent ici."],
            ["2", "Votez", "Sur votre téléphone, avant la fin du minuteur."],
            ["3", "Découvrez", "Le choix du sénat et ce qui change, en vrais chiffres."],
          ].map(([n, t, d]) => (
            <Bloc key={n} style={{ alignItems: "flex-start" }}>
              <span className="titre" style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--moutarde)", color: "var(--encre)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 36 }}>{n}</span>
              <span className="titre" style={{ fontSize: 36, fontWeight: 800 }}>{t}</span>
              <span style={{ fontSize: 22, color: "var(--texte-2)", lineHeight: 1.35 }}>{d}</span>
            </Bloc>
          ))}
        </div>
      ),
    },
    {
      titre: "Huit jauges pour suivre le pays",
      texte: (
        <>
          Économie, finances, paix sociale, écologie… Chaque jauge va de 0 à 100 et résume au moins cinq vrais indicateurs (chômage, dette, émissions…), partis des derniers chiffres officiels.
          <br />
          <br />
          Sous <b style={{ color: "var(--n2)" }}>{seuil}</b>, la jauge passe <b style={{ color: "var(--n2)" }}>en alerte</b> : une crise liée éclate l&apos;année suivante.
        </>
      ),
      visuel: (
        <Bloc style={{ gap: 12 }}>
          {JAUGES_EXEMPLE.map((j) => (
            <JaugeLigne key={j.id} j={j} seuil={seuil} anneeSuivante={anneeDepart + 1} />
          ))}
          <span style={{ fontSize: 20, color: "var(--texte-3)", marginTop: 6 }}>Le bouton « Indicateurs chiffrés » affiche à tout moment les vrais chiffres derrière chaque jauge.</span>
        </Bloc>
      ),
    },
    {
      titre: "Lire une option",
      texte: (
        <>
          Les pastilles disent <b>quelles jauges bougent</b> et dans quel sens : <b className="fleche-p1">▲</b> hausse, <b className="fleche-n1">▼</b> baisse, doublées si l&apos;effet est fort.
          <br />
          <br />
          Les chiffres exacts restent cachés jusqu&apos;au vote. Certaines mesures agissent tout de suite, d&apos;autres mettent des années à produire leurs effets.
        </>
      ),
      visuel: (
        <Bloc style={{ border: "2px solid var(--trait)", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="titre" style={{ width: 52, height: 52, flex: "none", borderRadius: "50%", border: "3px solid var(--moutarde)", color: "var(--moutarde)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 28 }}>A</span>
            <span className="titre" style={{ fontWeight: 700, fontSize: 38, lineHeight: 1.05 }}>Former plus de médecins</span>
          </div>
          <MentionDuree duree="plusieurs_annees" taille={20} />
          <p style={{ margin: 0, fontSize: 24, lineHeight: 1.35, color: "var(--texte-2)" }}>Plus de places en faculté de médecine : les nouveaux médecins arrivent dans dix ans.</p>
          <Pastilles liste={[P("services_publics", "Services", "p2"), P("finances", "Finances", "n1")]} taille={22} />
          <span style={{ fontSize: 19, color: "var(--texte-3)" }}>Après le vote, les écarts sont chiffrés :</span>
          <Pastilles liste={[P("services_publics", "Services", "p2", 3.4), P("finances", "Finances", "n1", -0.6)]} taille={20} chiffre />
        </Bloc>
      ),
    },
    {
      titre: "Trois façons de voter",
      texte: (
        <>
          La carte annonce toujours le type de vote. Vous pouvez changer d&apos;avis tant que le minuteur tourne.
          <br />
          <br />
          En cas d&apos;égalité, la voix de la <b>présidence</b>, élue juste après ce tutoriel, compte double. Si l&apos;égalité persiste, ou si personne ne vote, le sort tranche.
        </>
      ),
      visuel: (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            ["unique" as const, "Un seul choix", "L'option qui a le plus de voix est appliquée."],
            ["cumulable" as const, "Deux mesures retenues", "Les deux options les plus votées sont appliquées ensemble."],
            ["curseur" as const, "Un curseur", "Chacun place le curseur ; la valeur médiane l'emporte."],
          ].map(([type, t, d]) => (
            <Bloc key={type} style={{ flexDirection: "row", alignItems: "center", gap: 22, padding: "20px 24px" }}>
              <span style={{ flex: "none", whiteSpace: "nowrap" }}>
                <Puce fond={type === "curseur" ? "var(--moutarde)" : "var(--craie)"}>{t}</Puce>
              </span>
              <span style={{ fontSize: 23, color: "var(--texte-2)" }}>{d}</span>
            </Bloc>
          ))}
          <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 20, color: "var(--texte-3)" }}>
            <IconeCadenas /> Vote anonyme : personne ne sait qui a voté quoi.
          </span>
        </div>
      ),
    },
    {
      titre: "Le monde ne vous attend pas",
      texte: (
        <>
          Chaque année peut apporter un <b>événement</b> : bonne nouvelle ou coup dur. Des <b>imprévus</b> peuvent aussi suivre vos décisions : une conséquence que personne n&apos;avait annoncée, révélée seulement après le vote.
          <br />
          <br />
          Enfin, certaines décisions se combinent et produisent un effet en plus.
        </>
      ),
      visuel: (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Bloc style={{ background: "var(--surface-2)", gap: 8 }}>
            <Etiquette couleur="#FFB3BA">ÉVÉNEMENT · COUP DUR</Etiquette>
            <span style={{ fontSize: 30, fontWeight: 700 }}>Choc pétrolier : le baril double en trois mois</span>
            <Pastilles liste={[P("economie", "Économie", "n2"), P("paix_sociale", "Paix sociale", "n1")]} taille={19} />
          </Bloc>
          <Bloc style={{ background: "var(--surface-2)", border: "2px dashed var(--violet)", gap: 8 }}>
            <Etiquette couleur="var(--violet)">IMPRÉVU · RÉVÉLÉ APRÈS LE VOTE</Etiquette>
            <span style={{ fontSize: 30, fontWeight: 700 }}>Les trains du quotidien sont pris d&apos;assaut</span>
            <Pastilles liste={[P("ecologie", "Écologie", "p1", 1.2), P("cohesion", "Cohésion", "p1", 0.8)]} taille={19} chiffre />
          </Bloc>
          <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 20, color: "var(--texte-3)" }}>
            <IconeHorloge /> Les effets différés de vos anciens votes sont signalés quand ils arrivent.
          </span>
        </div>
      ),
    },
    {
      titre: `Rendez-vous en ${fin}`,
      texte: (
        <>
          À la fin, le bilan compare votre France à celle qu&apos;on aurait eue <b style={{ color: "var(--violet)" }}>sans aucune intervention</b>, avec les mêmes événements.
          <br />
          <br />
          Gouverner, c&apos;est arbitrer : chaque gain se paie quelque part. Premier vote : élire la présidence du sénat.
        </>
      ),
      visuel: (
        <Bloc style={{ gap: 18 }}>
          {[
            ["Économie", 52, 61, 48],
            ["Finances publiques", 56, 44, 36],
            ["Écologie", 41, 67, 59],
          ].map(([nom, depart, finV, sans]) => (
            <div key={nom as string} style={{ display: "grid", gridTemplateColumns: "240px minmax(0,1fr) 110px", alignItems: "center", gap: 18, fontSize: 23 }}>
              <span>{nom}</span>
              <div style={{ position: "relative", height: 16, background: "var(--piste)", borderRadius: 99 }}>
                <div style={{ width: `${finV}%`, height: "100%", background: "var(--moutarde)", borderRadius: 99 }} />
                <div style={{ position: "absolute", left: `${depart}%`, top: -6, width: 4, height: 28, background: "var(--gris)", borderRadius: 2 }} />
                <div style={{ position: "absolute", left: `${sans}%`, top: -3, width: 22, height: 22, marginLeft: -11, border: "4px solid var(--violet)", borderRadius: "50%", background: "var(--surface)" }} />
              </div>
              <span className="tabnum" style={{ textAlign: "right", fontWeight: 700 }}>{depart} → {finV}</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 26, fontSize: 18, color: "var(--texte-2)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 4, height: 20, background: "var(--gris)", borderRadius: 2 }} />Départ</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 14, height: 14, border: "3px solid var(--violet)", borderRadius: "50%" }} />Sans intervention</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 22, height: 10, background: "var(--moutarde)", borderRadius: 99 }} />Votre partie</span>
          </div>
        </Bloc>
      ),
    },
  ];
}

/**
 * `terminer` est appelé à la dernière étape (ou avec « Passer ») ; `libelleFin` nomme ce bouton
 * (« Commencer la partie » avant le premier tour, « Fermer » depuis le salon).
 */
export default function Tutoriel({ nbTours, anneeDepart, seuil, terminer, libelleFin }: { nbTours: number; anneeDepart: number; seuil: number; terminer: () => void; libelleFin: string }) {
  const liste = etapes(nbTours, anneeDepart, seuil);
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
    <div role="dialog" aria-modal="true" aria-label="Comment jouer" style={{ position: "absolute", inset: 0, zIndex: 20, background: "var(--encre)", padding: "56px 72px", display: "flex", flexDirection: "column", gap: 36 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2, color: "var(--texte-3)" }}>COMMENT JOUER · {i + 1} / {liste.length}</span>
        <div style={{ display: "flex", gap: 10 }} aria-hidden="true">
          {liste.map((_, k) => (
            <span key={k} style={{ width: k === i ? 40 : 14, height: 14, borderRadius: 99, background: k <= i ? "var(--moutarde)" : "var(--piste)", transition: "width .3s ease" }} />
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
          <h1 className="titre" style={{ margin: 0, fontWeight: 800, fontSize: 84, lineHeight: 1, letterSpacing: -2 }}>{e.titre}</h1>
          <p style={{ margin: 0, fontSize: 31, lineHeight: 1.4, color: "var(--texte-2)" }}>{e.texte}</p>
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
