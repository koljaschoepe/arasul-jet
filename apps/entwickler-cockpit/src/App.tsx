/**
 * Der Rahmen des Cockpits: die Seitenleiste der Bibliothek mit drei
 * Einträgen (Eingang, Apps, Test nach Live), daneben die gewählte Ansicht.
 * Unter 900 px wird die Leiste ein Blatt. Der Knopf dafür sitzt im
 * Seitenkopf jeder Ansicht (`KopfVorne`, Bibliothek 5.9.0), nicht mehr in
 * einer eigenen Zeile darüber. Die
 * Ansicht steht im Fragment der Adresse (`#apps`), damit Neuladen dort
 * bleibt, wo man war.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppWindow, ArrowUpFromLine, Inbox, RefreshCw } from '@marken/symbole';
import {
  Icon,
  KopfVorne,
  Seitenleiste,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  Werkzeug,
} from '@marken';
import { AppsAnsicht } from './AppsAnsicht';
import { Eingang } from './Eingang';
import { TestNachLive } from './TestNachLive';
import { SCHLUESSEL, useApps, useMeldungen } from './daten';
import {
  FILTER_VORGABE,
  ansichtAusAdresse,
  istOffen,
  wartetAufLive,
  type EingangFilter,
} from './logik';
import { inhalt } from './stil';
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
  const qc = useQueryClient();
  const neuLaden = (
    <Werkzeug
      symbol={<Icon symbol={RefreshCw} />}
      beschriftung="Neu laden"
      onClick={() => {
        void qc.invalidateQueries({ queryKey: SCHLUESSEL.meldungen });
        void qc.invalidateQueries({ queryKey: SCHLUESSEL.apps });
      }}
      data-testid="cockpit-neu-laden"
    />
  );

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
              eintrag('eingang', <Icon symbol={Inbox} />, offen),
              eintrag('apps', <Icon symbol={AppWindow} />),
              eintrag('live', <Icon symbol={ArrowUpFromLine} />, wartend),
            ],
          },
        ]}
      />
      <SidebarInset>
        <KopfVorne knopf={<SidebarTrigger data-testid="cockpit-leiste-umschalten" />}>
          <div style={inhalt}>
            {ansicht === 'eingang' && (
              <Eingang
                meldungen={meldungen.data ?? []}
                apps={apps.data ?? []}
                laedt={meldungen.isLoading}
                fehler={meldungen.isError ? meldungen.error.message : null}
                filter={filter}
                setzeFilter={setFilter}
                werkzeuge={neuLaden}
              />
            )}
            {ansicht === 'apps' && (
              <AppsAnsicht
                apps={apps.data ?? []}
                laedt={apps.isLoading}
                fehler={apps.isError ? apps.error.message : null}
                werkzeuge={neuLaden}
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
                werkzeuge={neuLaden}
              />
            )}
          </div>
        </KopfVorne>
      </SidebarInset>
    </SidebarProvider>
  );
}
