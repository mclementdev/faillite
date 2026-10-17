"use client";
/** Page d'accueil : créer une salle (grand écran) ou rejoindre avec un code (téléphone). */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { appel, lireLocal } from "@/lib/client";
import { memoriserHote } from "./EcranHote";
import { IconeFleche, Logo } from "./ui";

export default function Accueil() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  /** dernière salle créée sur cet appareil (une salle expire au bout de 12 h) */
  const [reprise, setReprise] = useState<string | null>(null);

  useEffect(() => {
    try {
      const d = JSON.parse(lireLocal("faillite:derniere-salle") ?? "null") as { code: string; le: number } | null;
      if (d && Date.now() - d.le < 12 * 3600 * 1000) setReprise(d.code);
    } catch {}
  }, []);

  const creer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await appel<{ code: string; hote: string }>("/api/salles", {});
      memoriserHote(r.code, r.hote);
      router.push(`/salle/${r.code}`);
    } catch (e) {
      setErreur((e as Error).message);
      setEnvoi(false);
    }
  };

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "8vh 20px 40px", display: "flex", flexDirection: "column", gap: 40 }}>
      <div>
        <Logo taille={96} />
        <p style={{ margin: "6px 0 0", fontSize: 17, fontWeight: 700, letterSpacing: 1, color: "var(--moutarde)" }}>Imaginé par François K.</p>
        <p style={{ fontSize: 22, color: "var(--texte-2)", margin: "16px 0 0", maxWidth: 640, lineHeight: 1.4 }}>
          Un jeu de soirée : votre groupe gouverne la France de 2027 à 2056 et découvre l&apos;impact de chaque décision. Aucune option n&apos;est « la bonne » : on regarde seulement les effets.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
        <section style={{ background: "var(--surface)", borderRadius: 24, padding: 28, display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 className="titre" style={{ margin: 0, fontSize: 30 }}>Sur le grand écran</h2>
          <p style={{ margin: 0, color: "var(--texte-2)", fontSize: 17, lineHeight: 1.4 }}>Ouvrez cette page sur la télé ou l&apos;ordinateur relié au vidéoprojecteur, puis créez la salle.</p>
          <button type="button" className="btn-principal" onClick={creer} disabled={envoi} style={{ fontSize: 24, padding: "18px 24px", marginTop: "auto" }}>
            Créer une salle <IconeFleche />
          </button>
          {reprise && (
            <button type="button" className="btn-contour" onClick={() => router.push(`/salle/${reprise}`)} style={{ fontSize: 18, padding: "12px 20px" }}>
              Reprendre la salle <b style={{ color: "var(--moutarde)", letterSpacing: 2 }}>{reprise}</b>
            </button>
          )}
        </section>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim().length === 4) router.push(`/rejoindre/${code.trim().toUpperCase()}`);
          }}
          style={{ background: "var(--surface)", borderRadius: 24, padding: 28, display: "flex", flexDirection: "column", gap: 14 }}
        >
          <h2 className="titre" style={{ margin: 0, fontSize: 30 }}>Sur mon téléphone</h2>
          <label htmlFor="code" style={{ color: "var(--texte-2)", fontSize: 17 }}>Scannez le QR code, ou tapez le code de salle :</label>
          <input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))} placeholder="K7P2" autoComplete="off" inputMode="text"
            className="titre" style={{ height: 64, background: "var(--encre)", color: "var(--moutarde)", border: "3px solid var(--trait-2)", borderRadius: 16, padding: "0 18px", fontSize: 34, fontWeight: 800, letterSpacing: 8 }} />
          <button type="submit" className="btn-principal" disabled={code.length !== 4} style={{ fontSize: 22, padding: "16px 24px" }}>Rejoindre</button>
        </form>
      </div>
      {erreur && <p role="alert" style={{ color: "#FFB3BA" }}>{erreur}</p>}
      <p style={{ fontSize: 14, color: "var(--texte-3)", lineHeight: 1.5 }}>
        Le jeu part des chiffres officiels les plus récents (INSEE, Banque de France, SDES, DREES…). C&apos;est une simplification pédagogique : les effets des décisions sont des ordres de grandeur plausibles, pas des prévisions.
      </p>
    </main>
  );
}
