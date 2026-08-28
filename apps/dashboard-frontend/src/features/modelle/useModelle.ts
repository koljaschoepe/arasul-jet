/**
 * Die Modelle des Geräts, für die Ansicht daneben (Phase D5).
 *
 * Der Katalog IST seit C8 die Kurzliste: vier Modelle, an diesem Gerät
 * gemessen und in Migration 175 festgeschrieben
 * (`config/modelle/kurzliste.json` sagt, welche vier). Es gibt keinen Weg
 * mehr, etwas anderes hineinzuholen; deshalb braucht diese Ansicht keine
 * Suche, keine Facetten und keine Detailseite, sondern eine Liste.
 *
 * Abfragen und Mutationen stehen zusammen, wie in `useMitarbeiter.ts` (D3)
 * und `useAppVerwaltung.ts` (D4). Die Abfrageschlüssel kommen aus
 * `hooks/useStoreCatalog`, weil die Statusleiste und der Modell-Dialog der
 * App-Verwaltung dieselben Zahlen zeigen: ein Cache-Eintrag, kein zweiter
 * Takt auf dem Jetson.
 */
import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import { useMemoryBudget, MEMORY_BUDGET_QUERY_KEY } from '@/hooks/useMemoryBudget';
import {
  useStoreCatalog,
  STORE_MODELS_KEY,
  STORE_MODEL_STATUS_KEY,
  STORE_MODEL_DEFAULT_KEY,
} from '@/hooks/useStoreCatalog';

/** Alles, was die Modell-Ansicht liest, aus einer Hand. */
export function useModelle(busy = false) {
  const { models, defaultModel, isLoading } = useStoreCatalog();
  // Schneller Takt, solange etwas lädt oder entladen wird; sonst gemütlich.
  const { data: budget } = useMemoryBudget({
    refetchInterval: busy ? 2_000 : 10_000,
    staleTime: busy ? 0 : 5_000,
  });

  return { modelle: models, standard: defaultModel, budget, isLoading };
}

/** Die drei Handgriffe an einem Modell. */
export function useModellAktionen() {
  const api = useApi();
  const qc = useQueryClient();

  const entwerten = useCallback(() => {
    qc.invalidateQueries({ queryKey: STORE_MODELS_KEY });
    qc.invalidateQueries({ queryKey: STORE_MODEL_STATUS_KEY });
    qc.invalidateQueries({ queryKey: STORE_MODEL_DEFAULT_KEY });
    qc.invalidateQueries({ queryKey: MEMORY_BUDGET_QUERY_KEY });
  }, [qc]);

  const standardSetzen = useMutation({
    mutationFn: (id: string) => api.post('/models/default', { model_id: id }),
    onSettled: entwerten,
  });

  const entfernen = useMutation({
    mutationFn: (id: string) => api.del(`/models/${encodeURIComponent(id)}`),
    onSettled: entwerten,
  });

  const entladen = useMutation({
    mutationFn: (id: string) =>
      api.post<{ success?: boolean; error?: string }>(
        `/models/${encodeURIComponent(id)}/unload`,
        {}
      ),
    onSettled: entwerten,
  });

  return { standardSetzen, entfernen, entladen, entwerten };
}
