/**
 * Eine App, wie ihr Verwalter sie sieht (Phase D4).
 *
 * Fünf Abschnitte, und jeder beantwortet eine Frage, die ein Administrator
 * wirklich stellt:
 *
 *   Stände   welche Fassung läuft wo, ist sie gesund — und: live schalten
 *   Tester   wer sieht den Teststand
 *   Flows    was kann diese App, und womit rechnet sie
 *   Läufe    was hat sie getan
 *   Logs     was sagt ihr Container
 *
 * Flow und Lauf ÖFFNEN SICH AN DERSELBEN STELLE statt in einem Dialog: beide
 * sind zum Lesen da, beide können lang sein, und ein Dialog über einer Seite,
 * die man daneben braucht, ist die schlechtere Fläche. Der Weg zurück ist ein
 * Knopf, wie in der Modell-Detailseite (Plan 012).
 */
import { useState } from 'react';
import { AppWindow, FileText, ListOrdered, ScrollText, Users } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { Section, SectionList } from '@/components/ui/Section';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useToast } from '@/contexts/ToastContext';
import { formatDate } from '@/utils/formatting';
import { cn } from '@/lib/utils';
import type { Stand } from '../mitarbeiter/useAppFreigaben';
import { AppStaende } from './AppStaende';
import { AppTester } from './AppTester';
import { FlowAnsicht, ModellZeile } from './FlowAnsicht';
import { LaufAnsicht, LaufZustand } from './LaufAnsicht';
import { ModellDialog } from './ModellDialog';
import {
  useApp,
  useAppLaeufe,
  useAppLogs,
  useFlowModell,
  useKurzliste,
  useSchalten,
  type AppFlow,
  type FlowDefinition,
  type ModellWunsch,
} from './useAppVerwaltung';

/** Was in der Mitte steht: die App selbst, ein Flow oder ein Lauf. */
type Blick =
  { was: 'app' } | { was: 'flow'; name: string; stand: Stand } | { was: 'lauf'; id: number };

/** Der Stand, dessen Flows und Logs gezeigt werden. */
function StandWahl({
  stand,
  setStand,
  hatTest,
}: {
  stand: Stand;
  setStand: (s: Stand) => void;
  hatTest: boolean;
}) {
  // Ohne Teststand gibt es nichts zu wählen. Ein Umschalter mit einer
  // gesperrten Hälfte wäre eine Frage, die nur eine Antwort zulässt.
  if (!hatTest) return null;
  return (
    <div className="inline-flex rounded-md border border-border p-0.5">
      {(['live', 'test'] as const).map(s => (
        <button
          key={s}
          type="button"
          onClick={() => setStand(s)}
          data-testid={`stand-wahl-${s}`}
          className={cn(
            'rounded px-2 py-1 text-ui-xs transition-colors',
            stand === s ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground'
          )}
        >
          {s === 'live' ? 'Livestand' : 'Teststand'}
        </button>
      ))}
    </div>
  );
}

export function AppAnsicht({ appId, onZurueck }: { appId: string; onZurueck: () => void }) {
  const toast = useToast();
  const { data: app, isLoading, isError } = useApp(appId);
  const { data: laeufe } = useAppLaeufe(appId);
  const schalten = useSchalten(appId);
  const modellSetzen = useFlowModell(appId);
  // Die Kurzliste des Geräts — dieselbe Abfrage wie die Ansicht „Modelle",
  // über denselben Schlüssel: React Query holt sie nicht zweimal.
  const { data: modelle } = useKurzliste();

  const [blick, setBlick] = useState<Blick>({ was: 'app' });
  const [stand, setStand] = useState<Stand>('live');
  const [logsAn, setLogsAn] = useState(false);
  const [modellFuer, setModellFuer] = useState<AppFlow | FlowDefinition | null>(null);

  const { data: logs, isFetching: logsLaden } = useAppLogs(appId, stand, logsAn);

  if (isLoading) return <SkeletonText lines={6} />;
  if (isError || !app) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground" data-testid="app-fehler">
          Diese App ließ sich nicht laden.
        </p>
        <Button variant="outline" size="sm" onClick={onZurueck}>
          Zurück zur Liste
        </Button>
      </div>
    );
  }

  // Der gewählte Stand, mit Rückfall auf den, den es gibt: eine App ohne
  // Livestand (frisch gerollt, noch nicht geschaltet) soll ihre Flows zeigen
  // und nicht eine leere Liste.
  const gezeigterStand: Stand = app.staende[stand] ? stand : app.staende.live ? 'live' : 'test';
  const detail = app.staende[gezeigterStand];

  const handleSchalten = (ziel: 'live' | 'zurueck') => {
    schalten.mutate(ziel, {
      onSuccess: () =>
        toast.success(
          ziel === 'live'
            ? `${app.name} ist live. Wer sie freigegeben hat, sieht die neue Fassung.`
            : `${app.name} steht wieder auf der vorigen Fassung.`
        ),
    });
  };

  const handleModell = (wunsch: ModellWunsch) => {
    const flow = modellFuer;
    if (!flow) return;
    modellSetzen.mutate(
      { flow: flow.name, wunsch },
      {
        onSuccess: () => {
          setModellFuer(null);
          toast.success(
            'modell' in wunsch && wunsch.modell === null
              ? `„${flow.name}" rechnet wieder mit dem Modell aus dem Paket.`
              : `Das Modell für „${flow.name}" ist gesetzt.`
          );
        },
      }
    );
  };

  if (blick.was === 'flow') {
    return (
      <>
        <FlowAnsicht
          appId={appId}
          stand={blick.stand}
          name={blick.name}
          onZurueck={() => setBlick({ was: 'app' })}
          onModellAendern={setModellFuer}
        />
        <ModellDialog
          fuer={modellFuer}
          modelle={modelle ?? []}
          laeuft={modellSetzen.isPending}
          onSchliessen={() => setModellFuer(null)}
          onSetzen={handleModell}
        />
      </>
    );
  }

  if (blick.was === 'lauf') {
    return (
      <LaufAnsicht appId={appId} runId={blick.id} onZurueck={() => setBlick({ was: 'app' })} />
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid={`app-ansicht-${appId}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <AppWindow className="size-4 text-muted-foreground" aria-hidden="true" />
            {app.name}
            <span className="font-mono text-ui-xs text-muted-foreground">{app.id}</span>
          </h3>
          {app.beschreibung && (
            <p className="mt-1 text-sm text-muted-foreground">{app.beschreibung}</p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onZurueck} data-testid="app-zurueck">
          Alle Apps
        </Button>
      </div>

      <SectionList>
        <Section
          title="Stände"
          icon={<AppWindow />}
          description="Gerollt wird in den Teststand; live schaltet ein Mensch."
        >
          <AppStaende
            staende={app.staende}
            laeuft={schalten.isPending}
            onSchalten={handleSchalten}
          />
        </Section>

        <Section
          title="Tester"
          icon={<Users />}
          description="Wer diese App sieht, und wer davon zusätzlich den Teststand bekommt."
        >
          <AppTester appId={appId} hatTeststand={Boolean(app.staende.test)} />
        </Section>

        <Section
          title="Flows"
          icon={<FileText />}
          description="Was die App kann. Die Dateien kommen aus ihrem Paket; das Modell entscheidest du."
          action={
            <StandWahl stand={stand} setStand={setStand} hatTest={Boolean(app.staende.test)} />
          }
        >
          {!detail || detail.flows.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="flows-leer">
              Dieser Stand bringt keine Flows mit.
            </p>
          ) : (
            <ul className="flex flex-col rounded-md border border-border" data-testid="flow-liste">
              {detail.flows.map(f => (
                <li
                  key={f.name}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-ui-3 last:border-b-0"
                  data-testid={`flow-${f.name}`}
                >
                  <button
                    type="button"
                    onClick={() => setBlick({ was: 'flow', name: f.name, stand: gezeigterStand })}
                    className="min-w-0 flex-1 text-left"
                    data-testid={`flow-oeffnen-${f.name}`}
                  >
                    <span className="block text-sm font-medium text-foreground">{f.name}</span>
                    {f.beschreibung && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {f.beschreibung}
                      </span>
                    )}
                    <ModellZeile
                      modell={f.modell}
                      ueberschrieben={f.modell_ueberschrieben}
                      extern={f.extern}
                    />
                  </button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setModellFuer(f)}
                    data-testid={`flow-modell-${f.name}`}
                  >
                    Modell
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Läufe"
          icon={<ListOrdered />}
          description="Was diese App hat laufen lassen, mit Schritten und Gedankengang."
        >
          {!laeufe || laeufe.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="laeufe-leer">
              Noch kein Lauf. Die App startet ihre Flows selbst, über ihren Schlüssel.
            </p>
          ) : (
            <ul className="flex flex-col rounded-md border border-border" data-testid="lauf-liste">
              {laeufe.map(l => (
                <li key={l.id} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setBlick({ was: 'lauf', id: l.id })}
                    data-testid={`lauf-oeffnen-${l.id}`}
                    className="flex w-full flex-wrap items-center gap-2 p-ui-3 text-left hover:bg-accent/40"
                  >
                    <span className="font-mono text-ui-xs text-muted-foreground">#{l.id}</span>
                    <span className="text-sm font-medium text-foreground">{l.flow_name}</span>
                    <LaufZustand status={l.status} />
                    {l.stand === 'test' && (
                      <span className="rounded bg-warning/15 px-1.5 py-0.5 text-ui-xs text-warning">
                        Test
                      </span>
                    )}
                    <span className="ml-auto text-ui-xs text-muted-foreground">
                      {formatDate(l.created_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Logs"
          icon={<ScrollText />}
          description="Die letzten 200 Zeilen des App-Containers."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLogsAn(a => !a)}
              data-testid="logs-schalter"
            >
              {logsAn ? 'Zuklappen' : 'Logs zeigen'}
            </Button>
          }
        >
          {!logsAn ? (
            // Erst auf Klick, und das ist kein Geiz: die Logs sind ein Aufruf
            // an den Docker-Proxy und ein paar Dutzend Kilobyte. Wer eine App
            // anschaut, will sie meistens nicht sehen.
            <p className="text-sm text-muted-foreground">
              {detail?.backend
                ? 'Ausgeblendet, bis du sie brauchst.'
                : 'Diese App hat kein Backend, das etwas sagen könnte.'}
            </p>
          ) : logsLaden ? (
            <SkeletonText lines={4} />
          ) : (
            <pre
              className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-card p-ui-3 font-mono text-ui-xs text-foreground"
              data-testid="app-logs"
            >
              {logs || '(keine Ausgabe)'}
            </pre>
          )}
        </Section>
      </SectionList>

      <ModellDialog
        fuer={modellFuer}
        modelle={modelle ?? []}
        laeuft={modellSetzen.isPending}
        onSchliessen={() => setModellFuer(null)}
        onSetzen={handleModell}
      />
    </div>
  );
}
