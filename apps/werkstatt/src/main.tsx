/**
 * Die Werkstatt (J44, M7; bis J52 Entwickler-Cockpit): die mitgelieferte App
 * für alle. Jeder sieht seine Rückmeldungen mit Stand; wer das Recht in der
 * Werkstatt hat, dazu den Eingang aller Meldungen, Stand jeder App und den
 * Schritt von Test nach Live. Vertrag: `docs/features/RUECKMELDUNG.md`,
 * Abschnitt „Die Werkstatt".
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';

const abfragen = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 10_000 } },
});

const knoten = document.getElementById('app');
if (knoten) {
  createRoot(knoten).render(
    <StrictMode>
      <QueryClientProvider client={abfragen}>
        <App />
      </QueryClientProvider>
    </StrictMode>
  );
}
