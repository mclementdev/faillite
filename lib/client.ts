"use client";
/** Côté navigateur : interrogation régulière de l'état d'une salle et appels d'API. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { VuePublique } from "./types";

export async function appel<T = unknown>(url: string, corps?: unknown, entetes?: Record<string, string>): Promise<T> {
  const r = await fetch(url, {
    method: corps === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(entetes ?? {}) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
    cache: "no-store",
  });
  const data = (await r.json().catch(() => ({}))) as T & { erreur?: string };
  if (!r.ok) throw new Error(data.erreur ?? `Erreur ${r.status}`);
  return data;
}

/**
 * Interroge l'état public de la salle toutes les `intervalle` ms (ralenti si l'onglet est caché).
 * La réponse est mise en cache 1 s par le CDN : 30 téléphones ≈ 1 lecture Redis par seconde.
 */
export function useSalle(code: string, intervalle: number) {
  const [vue, setVue] = useState<VuePublique | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [decalage, setDecalage] = useState(0);
  const echantillons = useRef<number[]>([]);
  const versionVue = useRef(-1);

  const rafraichir = useCallback(async () => {
    try {
      const r = await fetch(`/api/salles/${code}`, { cache: "no-store" });
      const data = (await r.json()) as VuePublique & { erreur?: string };
      if (!r.ok) {
        setErreur(data.erreur ?? "Salle introuvable.");
        return;
      }
      setErreur(null);
      // Décalage d'horloge : la réponse la plus « fraîche » (cache CDN ≤ 1 s) donne la meilleure estimation.
      echantillons.current = [...echantillons.current.slice(-9), data.serveurMaintenant - Date.now()];
      setDecalage(Math.max(...echantillons.current));
      // On ignore une réponse en cache plus ancienne que celle déjà affichée.
      if (data.version >= versionVue.current) {
        versionVue.current = data.version;
        setVue(data);
      }
    } catch {
      setErreur("Connexion perdue, nouvelle tentative…");
    }
  }, [code]);

  useEffect(() => {
    let actif = true;
    let minuterie: ReturnType<typeof setTimeout>;
    const boucle = async () => {
      if (!actif) return;
      await rafraichir();
      const delai = typeof document !== "undefined" && document.hidden ? intervalle * 4 : intervalle;
      minuterie = setTimeout(boucle, delai);
    };
    boucle();
    return () => {
      actif = false;
      clearTimeout(minuterie);
    };
  }, [rafraichir, intervalle]);

  return { vue, erreur, decalage, rafraichir };
}

export function lireLocal(cle: string): string | null {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
}

export function ecrireLocal(cle: string, valeur: string) {
  try {
    localStorage.setItem(cle, valeur);
  } catch {}
}
