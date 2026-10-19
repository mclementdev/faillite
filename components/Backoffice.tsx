"use client";
/** Backoffice : poids des cartes et événements, simulation, journal des modifications. */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { JaugeId, ResultatSimulation } from "@/engine";
import type { EntreeJournal } from "@/lib/poids";
import { Logo } from "./ui";

const NOMS_JAUGES: Record<JaugeId, string> = {
  economie: "Économie",
  finances: "Finances publiques",
  cohesion: "Cohésion sociale",
  ecologie: "Climat et nature",
  services_publics: "Services publics",
  souverainete: "Souveraineté",
  popularite: "Popularité",
};
const ORDRE_JAUGES = Object.keys(NOMS_JAUGES) as JaugeId[];

async function api<T>(url: string, methode = "GET", corps?: unknown): Promise<T> {
  const r = await fetch(url, { method: methode, headers: { "Content-Type": "application/json" }, body: corps === undefined ? undefined : JSON.stringify(corps), cache: "no-store" });
  const d = (await r.json().catch(() => ({}))) as T & { erreur?: string };
  if (r.status === 401) {
    window.location.reload();
    throw new Error("Session expirée.");
  }
  if (!r.ok) throw new Error(d.erreur ?? `Erreur ${r.status}`);
  return d;
}

/* ------------------------------------------------------------------ */

export function ConnexionAdmin({ avecCode }: { avecCode: boolean }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const valider = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await api("/api/admin/connexion", "POST", { email, code });
      window.location.reload();
    } catch (err) {
      setErreur((err as Error).message);
      setEnvoi(false);
    }
  };
  return (
    <main className="admin" style={{ maxWidth: 460, paddingTop: "12vh" }}>
      <Logo taille={48} />
      <form onSubmit={valider} className="carte-admin">
        <h1 style={{ fontSize: 26 }}>Backoffice</h1>
        <label htmlFor="email" style={{ fontWeight: 700 }}>Adresse e-mail</label>
        <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        {avecCode && (
          <>
            <label htmlFor="code" style={{ fontWeight: 700 }}>Code d&apos;accès</label>
            <input id="code" type="password" autoComplete="current-password" required value={code} onChange={(e) => setCode(e.target.value)} />
          </>
        )}
        {erreur && <p role="alert" style={{ margin: 0, color: "var(--n2-texte)" }}>{erreur}</p>}
        <button className="btn" type="submit" disabled={envoi}>Entrer</button>
        <p className="note" style={{ margin: 0 }}>Accès réservé aux adresses autorisées. Aucun e-mail n&apos;est envoyé.</p>
      </form>
    </main>
  );
}

/* ------------------------------------------------------------------ */

interface LigneCarte { id: string; theme: string; type: string; titre: string; poids: number; defaut: number; tirages: number | null; conditions: boolean }
interface LigneEvt { id: string; nature: string; alerte: string | null; titre: string; poids: number; defaut: number; tirages: number | null }
interface DonneesPoids { cartes: LigneCarte[]; evenements: LigneEvt[]; simulationDu: string | null }
type Simulation = ResultatSimulation & { lancePar: string };

type Onglet = "cartes" | "evenements" | "simulation" | "journal";

export default function Backoffice({ email }: { email: string }) {
  const [onglet, setOnglet] = useState<Onglet>("cartes");
  const [donnees, setDonnees] = useState<DonneesPoids | null>(null);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [journal, setJournal] = useState<EntreeJournal[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const [p, s, j] = await Promise.all([
      api<DonneesPoids>("/api/admin/poids"),
      api<{ simulation: Simulation | null }>("/api/admin/simulation"),
      api<{ journal: EntreeJournal[] }>("/api/admin/journal"),
    ]);
    setDonnees(p);
    setSimulation(s.simulation);
    setJournal(j.journal);
  }, []);

  useEffect(() => {
    charger().catch((e) => setMessage((e as Error).message));
  }, [charger]);

  const deconnexion = async () => {
    await api("/api/admin/deconnexion", "POST");
    window.location.reload();
  };

  return (
    <main className="admin">
      <header style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <Logo taille={36} />
        <h1 style={{ fontSize: 26, color: "var(--texte-3)", fontWeight: 500 }}>· backoffice</h1>
        <span style={{ marginLeft: "auto" }} className="note">{email}</span>
        <button type="button" className="btn-sec" onClick={deconnexion}>Se déconnecter</button>
      </header>
      <div className="onglets" role="tablist">
        {(
          [
            ["cartes", "Poids des cartes"],
            ["evenements", "Poids des événements"],
            ["simulation", "Simulation"],
            ["journal", "Journal"],
          ] as [Onglet, string][]
        ).map(([id, nom]) => (
          <button key={id} type="button" role="tab" className="onglet" aria-selected={onglet === id} onClick={() => setOnglet(id)}>{nom}</button>
        ))}
      </div>
      {message && <p role="alert" style={{ color: "var(--n2-texte)", margin: 0 }}>{message}</p>}
      {!donnees ? (
        <p className="note">Chargement…</p>
      ) : (
        <>
          {onglet === "cartes" && <TablePoids type="carte" lignes={donnees.cartes} simulationDu={donnees.simulationDu} recharger={charger} />}
          {onglet === "evenements" && <TablePoids type="evenement" lignes={donnees.evenements} simulationDu={donnees.simulationDu} recharger={charger} />}
          {onglet === "simulation" && <PanneauSimulation simulation={simulation} donnees={donnees} recharger={charger} />}
          {onglet === "journal" && <Journal journal={journal} />}
        </>
      )}
      <p className="note">Une salle fige les poids au moment de sa création : les modifications s&apos;appliquent aux prochaines parties.</p>
    </main>
  );
}

/* ------------------------------------------------------------------ */

function TablePoids({ type, lignes, simulationDu, recharger }: { type: "carte" | "evenement"; lignes: (LigneCarte | LigneEvt)[]; simulationDu: string | null; recharger: () => Promise<void> }) {
  const [saisie, setSaisie] = useState<Record<string, string>>({});
  const [filtre, setFiltre] = useState("");
  const [etat, setEtat] = useState<string | null>(null);
  const groupes = useMemo(() => [...new Set(lignes.map((l) => ("theme" in l ? l.theme : l.alerte ? "alerte" : l.nature)))].sort(), [lignes]);
  const visibles = lignes.filter((l) => !filtre || ("theme" in l ? l.theme : l.alerte ? "alerte" : l.nature) === filtre);
  const total = lignes.reduce((s, l) => s + (l.tirages ?? 0), 0);

  const valeur = (l: LigneCarte | LigneEvt) => (saisie[l.id] !== undefined ? saisie[l.id] : String(l.poids));
  const modifs = lignes.filter((l) => saisie[l.id] !== undefined && Number(saisie[l.id]) !== l.poids);

  const enregistrer = async () => {
    setEtat("Enregistrement…");
    try {
      await api("/api/admin/poids", "PUT", { modifs: modifs.map((l) => ({ type, id: l.id, poids: Number(saisie[l.id]) })) });
      setSaisie({});
      await recharger();
      setEtat("Enregistré.");
    } catch (e) {
      setEtat((e as Error).message);
    }
  };
  const reinitialiser = async () => {
    if (!confirm(`Revenir aux poids par défaut pour tous les ${type === "carte" ? "cartes" : "événements"} ?`)) return;
    setEtat("Réinitialisation…");
    try {
      await api("/api/admin/poids/reinitialiser", "POST", { type });
      setSaisie({});
      await recharger();
      setEtat("Poids par défaut rétablis.");
    } catch (e) {
      setEtat((e as Error).message);
    }
  };

  return (
    <section className="carte-admin">
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 22 }}>{type === "carte" ? `Cartes (${lignes.length})` : `Événements (${lignes.length})`}</h2>
        <label className="note" htmlFor={`filtre-${type}`} style={{ marginLeft: "auto" }}>{type === "carte" ? "Thème" : "Type"}</label>
        <select id={`filtre-${type}`} value={filtre} onChange={(e) => setFiltre(e.target.value)}>
          <option value="">Tous</option>
          {groupes.map((g) => (
            <option key={g} value={g}>{g.replace(/_/g, " ")}</option>
          ))}
        </select>
        <button type="button" className="btn" disabled={!modifs.length} onClick={enregistrer}>Enregistrer{modifs.length ? ` (${modifs.length})` : ""}</button>
        <button type="button" className="btn-sec" onClick={reinitialiser}>Revenir aux valeurs par défaut</button>
      </div>
      {etat && <p className="note" role="status" style={{ margin: 0 }}>{etat}</p>}
      <p className="note" style={{ margin: 0 }}>
        Le tirage est proportionnel aux poids parmi les éléments éligibles ; un poids de 0 désactive l&apos;élément.
        {simulationDu ? ` Tirages : dernière simulation du ${new Date(simulationDu).toLocaleString("fr-FR")}.` : " Lancez une simulation pour voir les fréquences de tirage."}
      </p>
      <div className="tableau">
        <table>
          <thead>
            <tr>
              <th>{type === "carte" ? "Thème" : "Type"}</th>
              {type === "carte" && <th>Format</th>}
              <th>Titre</th>
              <th>Poids</th>
              <th>Défaut</th>
              <th>Actif</th>
              <th>Tirages (simu.)</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((l) => {
              const v = valeur(l);
              const modifie = Number(v) !== l.defaut;
              return (
                <tr key={l.id} className={`${modifie ? "modifie" : ""} ${Number(v) === 0 ? "desactive" : ""}`}>
                  <td>{"theme" in l ? l.theme.replace(/_/g, " ") : l.alerte ? `alerte · ${l.alerte}` : l.nature}</td>
                  {"type" in l && <td>{l.type}{l.conditions ? " · conditionnelle" : ""}</td>}
                  <td>
                    {l.titre}
                    <div className="note">{l.id}</div>
                  </td>
                  <td>
                    <input type="number" min={0} max={100} step={0.1} value={v} aria-label={`Poids de ${l.titre}`} style={{ width: 90 }} onChange={(e) => setSaisie((s) => ({ ...s, [l.id]: e.target.value }))} />
                  </td>
                  <td className="tabnum">{l.defaut}</td>
                  <td>
                    <input type="checkbox" checked={Number(v) > 0} aria-label={`Activer ${l.titre}`}
                      onChange={(e) => setSaisie((s) => ({ ...s, [l.id]: e.target.checked ? String(l.defaut > 0 ? l.defaut : 1) : "0" }))} />
                  </td>
                  <td className="tabnum">{l.tirages === null ? "–" : `${l.tirages}${total ? ` (${((100 * l.tirages) / total).toFixed(1)} %)` : ""}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function PanneauSimulation({ simulation, donnees, recharger }: { simulation: Simulation | null; donnees: DonneesPoids; recharger: () => Promise<void> }) {
  const [n, setN] = useState(1000);
  const [graine, setGraine] = useState(42);
  const [mode, setMode] = useState<"aleatoire" | "sans_intervention">("aleatoire");
  const [nbAnnees, setNbAnnees] = useState(5);
  const [encours, setEncours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const lancer = async () => {
    setEncours(true);
    setErreur(null);
    try {
      await api("/api/admin/simulation", "POST", { n, graine, mode, nbAnnees });
      await recharger();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEncours(false);
    }
  };
  const titreCarte = (id: string) => donnees.cartes.find((c) => c.id === id)?.titre ?? id;
  const titreEvt = (id: string) => donnees.evenements.find((c) => c.id === id)?.titre ?? id;

  return (
    <>
      <section className="carte-admin">
        <h2 style={{ fontSize: 22 }}>Lancer une simulation</h2>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }} className="note">
            Parties
            <input type="number" min={1} max={3000} value={n} onChange={(e) => setN(Number(e.target.value))} style={{ width: 110 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }} className="note">
            Graine
            <input type="number" value={graine} onChange={(e) => setGraine(Number(e.target.value))} style={{ width: 110 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }} className="note">
            Mandat
            <select value={nbAnnees} onChange={(e) => setNbAnnees(Number(e.target.value))}>
              <option value={5}>1 quinquennat (5 ans)</option>
              <option value={10}>2 quinquennats (10 ans)</option>
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }} className="note">
            Choix
            <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="aleatoire">Votes aléatoires</option>
              <option value="sans_intervention">Sans intervention</option>
            </select>
          </label>
          <button type="button" className="btn" onClick={lancer} disabled={encours}>{encours ? "Calcul en cours…" : `Lancer ${n.toLocaleString("fr-FR")} parties`}</button>
        </div>
        <p className="note" style={{ margin: 0 }}>Utilise les poids actuels. 1 000 parties prennent une dizaine de secondes.</p>
        {erreur && <p role="alert" style={{ margin: 0, color: "var(--n2-texte)" }}>{erreur}</p>}
      </section>

      {simulation && (
        <>
          <section className="carte-admin">
            <h2 style={{ fontSize: 22 }}>Synthèse</h2>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.5 }}>{simulation.synthese}</p>
            <p className="note" style={{ margin: 0 }}>
              {simulation.n} parties · {simulation.nbAnnees} ans · {simulation.evenementsParPartie} événements par partie, dont {simulation.crisesParPartie} crises et {simulation.provoquesParPartie} provoqués par une décision · graine {simulation.graine} · {simulation.mode === "aleatoire" ? "votes aléatoires" : "sans intervention"} · {(simulation.dureeMs / 1000).toFixed(1)} s · {new Date(simulation.date).toLocaleString("fr-FR")} · {simulation.lancePar}
            </p>
          </section>

          <section className="carte-admin">
            <h2 style={{ fontSize: 22 }}>Jauges en fin de partie</h2>
            <div className="tableau">
              <table>
                <thead>
                  <tr><th>Jauge</th><th>Moyenne</th><th>Médiane</th><th>10e centile</th><th>90e centile</th><th>Distribution (P10 – P90)</th><th>Parties sous le seuil</th></tr>
                </thead>
                <tbody>
                  {ORDRE_JAUGES.map((j) => {
                    const s = simulation.jaugesFin[j];
                    return (
                      <tr key={j}>
                        <td>{NOMS_JAUGES[j]}</td>
                        <td className="tabnum">{s.moyenne}</td>
                        <td className="tabnum">{s.mediane}</td>
                        <td className="tabnum">{s.p10}</td>
                        <td className="tabnum">{s.p90}</td>
                        <td style={{ minWidth: 200 }}>
                          <div style={{ position: "relative", height: 12, background: "var(--piste)", borderRadius: 99 }} aria-hidden="true">
                            <div style={{ position: "absolute", left: `${s.p10}%`, width: `${Math.max(1, s.p90 - s.p10)}%`, height: "100%", background: "var(--soleil)", borderRadius: 99, opacity: 0.6 }} />
                            <div style={{ position: "absolute", left: `${s.mediane}%`, top: -3, width: 3, height: 18, background: "var(--texte-1)" }} />
                            <div style={{ position: "absolute", left: "35%", top: -3, width: 2, height: 18, background: "var(--n2)" }} />
                          </div>
                        </td>
                        <td className="tabnum">{Math.round(simulation.alertes.parJauge[j] * 100)} %</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="note" style={{ margin: 0 }}>Au moins une jauge sous le seuil d&apos;alerte : <b>{Math.round(simulation.alertes.auMoinsUne * 100)} %</b> des parties. Trait rouge : seuil d&apos;alerte (35).</p>
          </section>

          <section className="carte-admin">
            <h2 style={{ fontSize: 22 }}>Effet moyen des options (points de jauge)</h2>
            <p className="note" style={{ margin: 0 }}>Impact estimé au moment où la carte est proposée, moyenné sur toutes les apparitions. « Dominante » : bien meilleure que ses voisines sans coût notable ; « perdante » : toujours moins bonne sans bénéfice notable.</p>
            <div className="tableau">
              <table>
                <thead>
                  <tr>
                    <th>Carte · option</th>
                    <th>Statut</th>
                    {ORDRE_JAUGES.map((j) => (
                      <th key={j} title={NOMS_JAUGES[j]}>{NOMS_JAUGES[j].slice(0, 5)}.</th>
                    ))}
                    <th>Total</th>
                    <th>Retenue</th>
                  </tr>
                </thead>
                <tbody>
                  {[...simulation.options]
                    .sort((a, b) => (a.statut === "equilibree" ? 1 : 0) - (b.statut === "equilibree" ? 1 : 0) || a.carte.localeCompare(b.carte))
                    .map((o) => (
                      <tr key={o.carte + o.option}>
                        <td>
                          {titreCarte(o.carte)}
                          <div className="note">{o.titre}</div>
                        </td>
                        <td style={{ color: o.statut === "dominante" ? "var(--p2)" : o.statut === "perdante" ? "var(--n2)" : "var(--texte-3)", fontWeight: 700 }}>
                          {o.statut === "dominante" ? "▲ dominante" : o.statut === "perdante" ? "▼ perdante" : "équilibrée"}
                        </td>
                        {ORDRE_JAUGES.map((j) => {
                          const v = o.impactsMoyens[j];
                          return (
                            <td key={j} className="tabnum" style={{ color: v >= 0.6 ? "var(--p1)" : v <= -0.6 ? "var(--n1)" : "var(--texte-3)" }}>{v === 0 ? "·" : v.toFixed(1)}</td>
                          );
                        })}
                        <td className="tabnum" style={{ fontWeight: 700 }}>{o.score.toFixed(1)}</td>
                        <td className="tabnum">{o.propositions ? `${Math.round((100 * o.retenue) / o.propositions)} %` : "–"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="carte-admin">
            <h2 style={{ fontSize: 22 }}>Fréquence de tirage</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
              <Frequences titre="Cartes" valeurs={simulation.cartes} nom={titreCarte} n={simulation.n} />
              <Frequences titre="Événements" valeurs={simulation.evenements} nom={titreEvt} n={simulation.n} />
            </div>
          </section>
        </>
      )}
    </>
  );
}

function Frequences({ titre, valeurs, nom, n }: { titre: string; valeurs: Record<string, number>; nom: (id: string) => string; n: number }) {
  const tri = Object.entries(valeurs).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...tri.map(([, v]) => v));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <h3 style={{ margin: 0, fontSize: 17 }}>{titre}</h3>
      {tri.map(([id, v]) => (
        <div key={id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 120px 70px", gap: 10, alignItems: "center", fontSize: 14 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={nom(id)}>{nom(id)}</span>
          <div style={{ height: 8, background: "var(--piste)", borderRadius: 99 }}>
            <div style={{ width: `${(100 * v) / max}%`, height: "100%", background: v ? "var(--soleil)" : "var(--n2)", borderRadius: 99 }} />
          </div>
          <span className="tabnum" style={{ textAlign: "right" }}>{(v / n).toFixed(2)}/partie</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Journal({ journal }: { journal: EntreeJournal[] }) {
  return (
    <section className="carte-admin">
      <h2 style={{ fontSize: 22 }}>50 dernières modifications de poids</h2>
      {!journal.length ? (
        <p className="note">Aucune modification pour l&apos;instant.</p>
      ) : (
        <div className="tableau">
          <table>
            <thead>
              <tr><th>Date</th><th>Adresse</th><th>Élément</th><th>Ancien</th><th>Nouveau</th></tr>
            </thead>
            <tbody>
              {journal.map((j, i) => (
                <tr key={i}>
                  <td>{new Date(j.date).toLocaleString("fr-FR")}</td>
                  <td>{j.email}</td>
                  <td>{j.type === "carte" ? "Carte" : "Événement"} · {j.id}</td>
                  <td className="tabnum">{j.ancien}</td>
                  <td className="tabnum">{j.nouveau}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
