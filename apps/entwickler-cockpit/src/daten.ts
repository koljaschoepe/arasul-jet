/** Abfragen und Änderungen des Cockpits, über React Query. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { StandMeldung } from './typen';

export const SCHLUESSEL = { meldungen: ['meldungen'], apps: ['apps'] } as const;

export const useMeldungen = () =>
  useQuery({ queryKey: SCHLUESSEL.meldungen, queryFn: api.meldungen });

export const useApps = () => useQuery({ queryKey: SCHLUESSEL.apps, queryFn: api.apps });

/** Nach jedem Ausgang beide Listen neu: die Zahl offener Meldungen hängt dran. */
function useNeuLaden() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: SCHLUESSEL.meldungen });
    void qc.invalidateQueries({ queryKey: SCHLUESSEL.apps });
  };
}

export function useStandSetzen() {
  const neu = useNeuLaden();
  return useMutation({
    mutationFn: (a: { id: number; stand: StandMeldung; grund?: string }) =>
      api.standSetzen(a.id, a.stand, a.grund),
    onSettled: neu,
  });
}

export function useEntfernen() {
  const neu = useNeuLaden();
  return useMutation({ mutationFn: (id: number) => api.entfernen(id), onSettled: neu });
}

export function useSchalten() {
  const neu = useNeuLaden();
  return useMutation({
    mutationFn: (a: { appId: string; ziel: 'live' | 'zurueck' }) => api.schalten(a.appId, a.ziel),
    onSettled: neu,
  });
}
