"use client";
/**
 * Infobulles du grand écran : une seule bulle, affichée au-dessus de la scène mise à l'échelle,
 * pour ne jamais être coupée par un cadre (`overflow: hidden`). Survol à la souris ou focus clavier.
 * Hors grand écran (téléphone), `Info` se replie sur l'attribut `title` natif.
 */
import { createContext, useCallback, useContext, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";

interface Bulle {
  texte: ReactNode;
  x: number;
  y: number;
  dessous: boolean;
}

interface Ctx {
  montrer: (texte: ReactNode, el: HTMLElement) => void;
  cacher: () => void;
}

const Contexte = createContext<Ctx | null>(null);

const LARGEUR = 480;
const LARGEUR_SCENE = 1920;

/** Couche à placer dans la scène 1920×1080 ; `scene` est l'élément mis à l'échelle. */
export function CoucheInfobulles({ scene, children }: { scene: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  const [bulle, setBulle] = useState<Bulle | null>(null);
  const montrer = useCallback(
    (texte: ReactNode, el: HTMLElement) => {
      const s = scene.current?.getBoundingClientRect();
      if (!s) return;
      const echelle = s.width / LARGEUR_SCENE || 1;
      const r = el.getBoundingClientRect();
      const haut = (r.top - s.top) / echelle;
      const bas = (r.bottom - s.top) / echelle;
      const dessous = haut < 240;
      setBulle({ texte, x: (r.left + r.width / 2 - s.left) / echelle, y: dessous ? bas + 12 : haut - 12, dessous });
    },
    [scene],
  );
  const cacher = useCallback(() => setBulle(null), []);
  return (
    <Contexte.Provider value={{ montrer, cacher }}>
      {children}
      {bulle && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            zIndex: 50,
            left: Math.min(Math.max(bulle.x - LARGEUR / 2, 16), LARGEUR_SCENE - LARGEUR - 16),
            top: bulle.y,
            transform: bulle.dessous ? undefined : "translateY(-100%)",
            width: LARGEUR,
            background: "var(--surface)",
            color: "var(--texte-1)",
            border: "2px solid var(--trait-2)",
            borderRadius: 16,
            padding: "14px 18px",
            fontSize: 20,
            fontWeight: 400,
            lineHeight: 1.4,
            letterSpacing: 0,
            textAlign: "left",
            textTransform: "none",
            boxShadow: "0 12px 40px rgba(29,36,69,.18)",
            pointerEvents: "none",
            animation: "apparition .15s ease",
          }}
        >
          {bulle.texte}
        </div>
      )}
    </Contexte.Provider>
  );
}

/** Élément avec infobulle. `bloc` pour envelopper un bloc (div) plutôt qu'un élément en ligne. */
export function Info({ texte, children, bloc, style }: { texte: ReactNode; children: ReactNode; bloc?: boolean; style?: CSSProperties }) {
  const ctx = useContext(Contexte);
  const ref = useRef<HTMLElement | null>(null);
  const Balise = bloc ? "div" : "span";
  if (!ctx) {
    return (
      <Balise title={typeof texte === "string" ? texte : undefined} style={style}>
        {children}
      </Balise>
    );
  }
  const montrer = () => ref.current && ctx.montrer(texte, ref.current);
  return (
    <Balise
      ref={ref as never}
      tabIndex={0}
      className="info"
      onMouseEnter={montrer}
      onMouseLeave={ctx.cacher}
      onFocus={montrer}
      onBlur={ctx.cacher}
      style={{ cursor: "help", ...(bloc ? {} : { display: "inline-flex" }), ...style }}
    >
      {children}
    </Balise>
  );
}

/** Titre en petites capitales d'une infobulle. */
export function TitreBulle({ children }: { children: ReactNode }) {
  return <b style={{ display: "block", marginBottom: 4, color: "var(--accent-texte)", fontSize: 18, letterSpacing: 1 }}>{children}</b>;
}
