/**
 * Das Entwickler-Cockpit (J44, M7): die mitgelieferte App für alle mit dem
 * Kennzeichen Entwickler. Eingang der Rückmeldungen, Stand jeder App, der
 * Schritt von Test nach Live. Vertrag: `docs/features/RUECKMELDUNG.md`,
 * Abschnitt „Das Entwickler-Cockpit".
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
