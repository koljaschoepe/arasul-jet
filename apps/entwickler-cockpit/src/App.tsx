/**
 * Der Rahmen des Cockpits: die Seitenleiste der Bibliothek mit drei
 * Einträgen (Eingang, Apps, Test nach Live), daneben die gewählte Ansicht.
 * Unter 900 px wird die Leiste ein Blatt, das der Knopf oben öffnet. Die
 * Ansicht steht im Fragment der Adresse (`#apps`), damit Neuladen dort
 * bleibt, wo man war.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { AppWindow, ArrowUpFromLine, Inbox } from 'lucide-react';
import { Seitenleiste, SidebarInset, SidebarProvider, SidebarTrigger } from '@marken';
import { AppsAnsicht } from './AppsAnsicht';
import { Eingang } from './Eingang';
import { TestNachLive } from './TestNachLive';
import { useApps, useMeldungen } from './daten';
import {
  FILTER_VORGABE,
  ansichtAusAdresse,
  istOffen,
  wartetAufLive,
  type EingangFilter,
} from './logik';
import { inhalt, text } from './stil';
import type { Ansicht } from './typen';

const NAMEN: Record<Ansicht, string> = {
  eingang: 'Eingang',
  apps: 'Apps',
  live: 'Test nach Live',
};

export function App() {
  const [ansicht, setAnsicht] = useState<Ansicht>(() => ansichtAusAdresse(window.location.hash));
  const [filter, setFilter] = useState<EingangFilter>(FILTER_VORGABE);
  const meldungen = useMeldungen();
  const apps = useApps();

  useEffect(() => {
    const folgen = () => setAnsicht(ansichtAusAdresse(window.location.hash));
    window.addEventListener('hashchange', folgen);
    return () => window.removeEventListener('hashchange', folgen);
  }, []);

  const oeffne = (ziel: Ansicht) => {
    setAnsicht(ziel);
    window.history.replaceState(null, '', `#${ziel}`);
  };

  const offen = (meldungen.data ?? []).filter(istOffen).length;
  const wartend = wartetAufLive(apps.data ?? []).length;
  const eintrag = (kennung: Ansicht, symbol: ReactNode, zahl?: number) => ({
    kennung,
    name: NAMEN[kennung],
    symbol,
    aktiv: ansicht === kennung,
    zahl: zahl || undefined,
    aufKlick: () => oeffne(kennung),
    kennzeichen: `cockpit-leiste-${kennung}`,
  });

  return (
    <SidebarProvider>
      <Seitenleiste
        titel="Entwickler-Cockpit"
        gruppen={[
          {
            eintraege: [
              eintrag('eingang', <Inbox />, offen),
              eintrag('apps', <AppWindow />),
              eintrag('live', <ArrowUpFromLine />, wartend),
            ],
          },
        ]}
      />
      <SidebarInset>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--ara-abstand-2)',
            padding: 'var(--ara-abstand-2) var(--ara-abstand-3)',
            borderBottom: '1px solid var(--ara-kante)',
          }}
        >
          <SidebarTrigger data-testid="cockpit-leiste-umschalten" />
          <span style={text}>{NAMEN[ansicht]}</span>
        </div>
        <main style={inhalt}>
          {ansicht === 'eingang' && (
            <Eingang
              meldungen={meldungen.data ?? []}
              apps={apps.data ?? []}
              laedt={meldungen.isLoading}
              fehler={meldungen.isError ? meldungen.error.message : null}
              filter={filter}
              setzeFilter={setFilter}
            />
          )}
          {ansicht === 'apps' && (
            <AppsAnsicht
              apps={apps.data ?? []}
              laedt={apps.isLoading}
              fehler={apps.isError ? apps.error.message : null}
              zeigeMeldungen={appId => {
                setFilter({ app: appId, stand: 'offen' });
                oeffne('eingang');
              }}
            />
          )}
          {ansicht === 'live' && (
            <TestNachLive
              apps={apps.data ?? []}
              laedt={apps.isLoading}
              fehler={apps.isError ? apps.error.message : null}
            />
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
