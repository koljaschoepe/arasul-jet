/**
 * Der Rahmen der Werkstatt: die Seitenleiste der Bibliothek, daneben die
 * gewählte Ansicht. Welche Einträge die Leiste trägt, hängt am Recht in der
 * Werkstatt (J52, `GET /api/werkstatt/ich`): ohne es genau einer, „Meine
 * Meldungen“; mit ihm drei, Eingang (alle Meldungen), Apps und Test nach
 * Live. Einen Wechsel der Rolle gibt es nicht, das Recht entscheidet allein
 * (`company/schleife.md`, Regel 2).
 * Unter 900 px wird die Leiste ein Blatt. Der Knopf dafür sitzt im
 * Seitenkopf jeder Ansicht (`KopfVorne`, Bibliothek 5.9.0), nicht mehr in
 * einer eigenen Zeile darüber. Die
 * Ansicht steht im Fragment der Adresse (`#apps`), damit Neuladen dort
 * bleibt, wo man war.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppWindow, ArrowUpFromLine, Inbox, MessageSquareText, RefreshCw } from '@marken/symbole';
import {
  Icon,
  Meldung as Hinweis,
  KopfVorne,
  Seitenleiste,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  Werkzeug,
} from '@marken';
import { AppsAnsicht } from './AppsAnsicht';
import { EigeneMeldungen } from './EigeneMeldungen';
import { Eingang } from './Eingang';
import { TestNachLive } from './TestNachLive';
import { SCHLUESSEL, useApps, useIch, useMeldungen } from './daten';
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
  meine: 'Meine Meldungen',
  eingang: 'Eingang',
  apps: 'Apps',
  live: 'Test nach Live',
};

export function App() {
  const ich = useIch();
  const recht = ich.data?.recht === true;
  const [ansicht, setAnsicht] = useState<Ansicht>(() =>
    ansichtAusAdresse(window.location.hash, true)
  );
  const [filter, setFilter] = useState<EingangFilter>(FILTER_VORGABE);
  const meldungen = useMeldungen();
  const apps = useApps(recht);
  const qc = useQueryClient();
  // Ohne das Recht gibt es nur „Meine Meldungen“, was immer im Fragment steht.
  const sicht: Ansicht = recht ? ansicht : 'meine';
  const neuLaden = (
    <Werkzeug
      symbol={<Icon symbol={RefreshCw} />}
      beschriftung="Neu laden"
      onClick={() => {
        void qc.invalidateQueries({ queryKey: SCHLUESSEL.ich });
        void qc.invalidateQueries({ queryKey: SCHLUESSEL.meldungen });
        void qc.invalidateQueries({ queryKey: SCHLUESSEL.apps });
      }}
      data-testid="werkstatt-neu-laden"
    />
  );

  useEffect(() => {
    const folgen = () => setAnsicht(ansichtAusAdresse(window.location.hash, true));
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
    aktiv: sicht === kennung,
    zahl: zahl || undefined,
    aufKlick: () => oeffne(kennung),
    kennzeichen: `werkstatt-leiste-${kennung}`,
  });

  return (
    <SidebarProvider>
      <Seitenleiste
        titel="Werkstatt"
        gruppen={
          ich.isLoading
            ? []
            : [
                {
                  eintraege: recht
                    ? [
                        eintrag('eingang', <Icon symbol={Inbox} />, offen),
                        eintrag('apps', <Icon symbol={AppWindow} />),
                        eintrag('live', <Icon symbol={ArrowUpFromLine} />, wartend),
                      ]
                    : [eintrag('meine', <Icon symbol={MessageSquareText} />, offen)],
                },
              ]
        }
      />
      <SidebarInset>
        <KopfVorne knopf={<SidebarTrigger data-testid="werkstatt-leiste-umschalten" />}>
          <div style={inhalt}>
            {ich.isError && (
              <Hinweis
                art="fehler"
                titel="Die Werkstatt ließ sich nicht laden."
                kennzeichen="werkstatt-ich-fehler"
              >
                {ich.error.message}
              </Hinweis>
            )}
            {ich.isSuccess && sicht === 'meine' && (
              <EigeneMeldungen
                meldungen={meldungen.data ?? []}
                laedt={meldungen.isLoading}
                fehler={meldungen.isError ? meldungen.error.message : null}
                werkzeuge={neuLaden}
              />
            )}
            {recht && sicht === 'eingang' && (
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
            {recht && sicht === 'apps' && (
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
            {recht && sicht === 'live' && (
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
