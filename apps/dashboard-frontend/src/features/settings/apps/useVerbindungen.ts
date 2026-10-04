/**
 * Was die Apps ins Internet dürfen und tun (J38), seit M5 auf der Seite der
 * App statt in einem eigenen Bereich der Verwaltung. Ein Weg aus
 * `routes/admin/ausgang.js`: `GET /api/ausgang`, für alle Apps auf einmal;
 * die Seite einer App nimmt sich ihre Zeile.
 */
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';

export interface Ziel {
  host: string;
  anzahl: number;
  zuletzt: string | null;
  staende: ('live' | 'test')[];
}

/** Ein abgewiesener Name. `stoerung`: er ist eingetragen und kam trotzdem nicht durch. */
interface Abgewiesen extends Ziel {
  stoerung?: boolean;
}

interface AppVerbindungen {
  id: string;
  name: string;
  /** Was das Manifest in `verbindungen` fordert, je Name mit den Ständen. */
  eingetragen: { host: string; staende: ('live' | 'test')[] }[];
  genutzt: Ziel[];
  abgewiesen: Abgewiesen[];
}

interface Verbindungen {
  apps: AppVerbindungen[];
  plattform: { genutzt: Ziel[] };
}

function useVerbindungen() {
  const api = useApi();
  return useQuery({
    queryKey: ['ausgang'],
    queryFn: async () =>
      (await api.get<{ data: Verbindungen }>('/ausgang', { showError: false })).data,
    // Die Zahlen laufen weiter, auch während die Seite offen ist.
    refetchInterval: 15000,
  });
}

/** Die Zeile einer App, oder null, solange nichts da ist. */
export function useAppVerbindungen(appId: string) {
  const abfrage = useVerbindungen();
  return { ...abfrage, data: abfrage.data?.apps.find(a => a.id === appId) ?? null };
}

/**
 * Ein Name, den ein Mensch liest, statt einer Adresse (M5). Die bekannten
 * Dienste beim Namen, sonst der Name der Domain mit großem Anfang:
 * `api.example.org` wird „Example". Die Adresse steht aufgeklappt daneben.
 */
const BEKANNT: Record<string, string> = {
  'api.openai.com': 'OpenAI',
  'api.anthropic.com': 'Anthropic',
  'api.mistral.ai': 'Mistral',
  'generativelanguage.googleapis.com': 'Google Gemini',
  'graph.microsoft.com': 'Microsoft 365',
  'login.microsoftonline.com': 'Microsoft-Anmeldung',
  'api.github.com': 'GitHub',
  'api.lexoffice.io': 'lexoffice',
  'api.lexware.io': 'Lexware',
  'my.sevdesk.de': 'sevDesk',
  'api.stripe.com': 'Stripe',
};

const ZWEITE_EBENE = new Set(['co', 'com', 'org', 'net', 'ac', 'gv']);

export function lesbarerName(host: string): string {
  const bekannt = BEKANNT[host];
  if (bekannt) return bekannt;
  const teile = host.split('.').filter(Boolean);
  if (teile.length < 2) return host;
  // `example.co.uk` hat seinen Namen eine Stelle weiter links.
  const vorletzter = teile[teile.length - 2] ?? '';
  const name =
    teile.length >= 3 && ZWEITE_EBENE.has(vorletzter) ? teile[teile.length - 3] : vorletzter;
  if (!name) return host;
  return name.charAt(0).toUpperCase() + name.slice(1);
}
