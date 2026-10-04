/**
 * Die Modelle des Geräts, für die Verwaltung (M5, Auftrag verwaltung-modelle).
 *
 * Eine Abfrage trägt alles, was eine Zeile braucht: Fähigkeiten, „warm", die
 * Flows, die das Modell nutzen, und den Grund einer Sperre
 * (`GET /api/models/verwaltung`). Dazu das Speicherbudget für die Zeile
 * „Speicher für KI". Laden und Entladen von Hand gibt es nicht mehr: das Gerät
 * hält ein Modell nach Nutzung und lädt es bei Bedarf selbst.
 *
 * Abfragen und Mutationen stehen zusammen, wie in `usePersonen.ts` (D3)
 * und `useAppVerwaltung.ts` (D4). Die Schlüssel des Katalogs kommen aus
 * `hooks/useStoreCatalog`, weil die Statusleiste und der Modell-Dialog der
 * App-Verwaltung dieselben Zahlen zeigen: ein Cache-Eintrag, kein zweiter
 * Takt auf dem Jetson.
 */
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import { useMemoryBudget, MEMORY_BUDGET_QUERY_KEY } from '@/hooks/useMemoryBudget';
import {
  STORE_MODELS_KEY,
  STORE_MODEL_STATUS_KEY,
  STORE_MODEL_DEFAULT_KEY,
} from '@/hooks/useStoreCatalog';

export interface Faehigkeiten {
  text: boolean;
  bild: boolean;
  werkzeuge: boolean;
  /** Kontextfenster in Tokens, null = unbekannt. */
  kontext: number | null;
}

interface NutzenderFlow {
  app_id: string;
  app_name: string;
  flow: string;
}

/** Ein Modell am Gerät, so wie `GET /api/models/verwaltung` es liefert. */
export interface VerwaltungModell {
  id: string;
  name: string;
  groesse_bytes: number | null;
  faehigkeiten: Faehigkeiten;
  warm: boolean;
  ist_standard: boolean;
  ungemessen: boolean;
  flows: NutzenderFlow[];
  /** Ein Satz, warum es sich nicht entfernen lässt, sonst null. */
  sperre: string | null;
}

/** Ein geprüftes Modell, das noch nicht am Gerät liegt. */
export interface ListenModell {
  id: string;
  name: string;
  beschreibung: string | null;
  groesse_bytes: number | null;
  laedt: boolean;
  /** Passt es auf dieses Gerät? null = nicht geprüft. */
  passt: boolean | null;
  grund: string | null;
}

interface Verwaltung {
  standard: string | null;
  modelle: VerwaltungModell[];
  liste: ListenModell[];
}

export interface Pruefung {
  passt: boolean;
  grund: string | null;
  groesse_bytes: number;
}

const MODELLE_VERWALTUNG_KEY = ['models', 'verwaltung'] as const;

/** Alles, was die Modell-Ansicht liest, aus einer Hand. */
export function useModelle(busy = false) {
  const api = useApi();
  const { data, isLoading } = useQuery({
    queryKey: MODELLE_VERWALTUNG_KEY,
    queryFn: () => api.get<Verwaltung>('/models/verwaltung', { showError: false }),
    refetchInterval: busy ? 2_000 : 10_000,
    staleTime: busy ? 0 : 5_000,
  });
  // Das Speicherbudget ändert sich mit jeder Nutzung; derselbe Eintrag wie in
  // der Statusleiste.
  const { data: budget } = useMemoryBudget({
    refetchInterval: busy ? 2_000 : 10_000,
    staleTime: busy ? 0 : 5_000,
  });

  return {
    modelle: data?.modelle ?? [],
    liste: data?.liste ?? [],
    standard: data?.standard ?? null,
    budget,
    isLoading,
  };
}

/** Die Handgriffe an einem Modell. */
export function useModellAktionen() {
  const api = useApi();
  const qc = useQueryClient();

  const entwerten = useCallback(() => {
    qc.invalidateQueries({ queryKey: MODELLE_VERWALTUNG_KEY });
    qc.invalidateQueries({ queryKey: STORE_MODELS_KEY });
    qc.invalidateQueries({ queryKey: STORE_MODEL_STATUS_KEY });
    qc.invalidateQueries({ queryKey: STORE_MODEL_DEFAULT_KEY });
    qc.invalidateQueries({ queryKey: MEMORY_BUDGET_QUERY_KEY });
  }, [qc]);

  const standardSetzen = useMutation({
    mutationFn: (id: string) => api.post('/models/default', { model_id: id }),
    onSettled: entwerten,
  });

  // Das Gerät sperrt ein Modell, das ein Flow nutzt (409 mit den Flows); der
  // Satz steht schon an der Zeile, ein zweiter Fehlerhinweis wäre doppelt.
  const entfernen = useMutation({
    mutationFn: (id: string) => api.del(`/models/${encodeURIComponent(id)}`),
    onSettled: entwerten,
  });

  // Passt das Modell auf dieses Gerät (Speicher, Platte)? Lädt nichts.
  const pruefen = useMutation({
    mutationFn: (id: string) =>
      api.post<Pruefung>('/models/pruefen', { model_id: id }, { showError: false }),
  });

  return { standardSetzen, entfernen, pruefen, entwerten };
}
