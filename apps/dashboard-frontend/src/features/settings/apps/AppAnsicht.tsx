/**
 * Die Seite einer App in der Verwaltung (Phase D4, seit M5 die EINE Seite je
 * App, Auftrag verwaltung-app-seite).
 *
 * Alles, was eine App tut und darf, steht hier untereinander, in dieser
 * Reihenfolge und nirgends sonst in der Oberfläche:
 *
 *   Zustand          ein Satz, rot nur, wenn sie deshalb nicht arbeiten kann
 *   Fassungen        Test und Live mit dem Änderungstext, Live schalten, zurück
 *   Personen         wer Zugang hat und wer davon Testperson ist
 *   Freigabestufen   wer je Stufe zuerst gefragt wird
 *   Flows            Schritte, Art, Auslöser, Schalter „aktiv"
 *   Verbindungen     wohin sie ins Internet darf, lesbar benannt
 *
 * Darunter ein Weg zu den Läufen dieser App (Bereich Läufe der Verwaltung, die
 * eine Stelle dafür) und, erst auf „Zeigen": Modellaufrufe und Protokoll. Ein
 * Flow ÖFFNET SICH AN DERSELBEN STELLE statt in einem Dialog: er ist zum Lesen
 * da und kann lang sein. Der Weg zurück ist ein Knopf.
 */
import { useState } from 'react';
import {
  Activity,
  AppWindow,
  Brain,
  ClipboardCheck,
  FileText,
  Globe,
  ListOrdered,
  ScrollText,
  Trash2,
  Users,
} from 'lucide-react';
import { Button, cn } from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useToast } from '@/contexts/ToastContext';
import type { ApiError } from '@/hooks/useApi';
import type { Stand } from '../personen/useAppFreigaben';
import { AppEntfernenDialog } from './AppEntfernenDialog';
import { AppFlows } from './AppFlows';
import { AppSchrittModelle } from './AppSchrittModelle';
import { AppPersonen } from './AppPersonen';
import { AppStaende } from './AppStaende';
import { AppStufen } from './AppStufen';
import { AppVerbindungen } from './AppVerbindungen';
import { AppZustand } from './AppZustand';
import { KlappGruppe } from './Aufklappen';
import { FlowAnsicht } from './FlowAnsicht';
import { KiAufrufe } from './KiAufrufe';
import { LiveSchaltenDialog } from './LiveSchaltenDialog';
import { ModellDialog } from './ModellDialog';
import {
  useApp,
  useAppLogs,
  useEntfernen,
  useKiAufrufe,
  useFlowModell,
  useKurzliste,
  useSchalten,
  type AppFlow,
  type FlowDefinition,
  type ModellWunsch,
} from './useAppVerwaltung';
import { Feldgruppe, Formularseite } from '@marken';
import { fehlertext } from '@/utils/fehlertext';
import { useWorkspaceStore } from '@/stores/workspaceStore';

/** Was in der Mitte steht: die App selbst oder ein Flow. */
type Blick = { was: 'app' } | { was: 'flow'; name: string; stand: Stand };

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
            'rounded px-2 py-1 text-xs transition-colors',
            stand === s ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground'
          )}
        >
          {s === 'live' ? 'Live' : 'Test'}
        </button>
      ))}
    </div>
  );
}

function KiAufrufeAbfrage({ appId }: { appId: string }) {
  const { data } = useKiAufrufe(appId);
  return <KiAufrufe aufrufe={data} />;
}

/** Die Logs, erst auf „Zeigen": ein Aufruf an den Docker-Proxy und ein paar Dutzend Kilobyte. */
function Protokoll({
  appId,
  stand,
  hatBackend,
}: {
  appId: string;
  stand: Stand;
  hatBackend: boolean;
}) {
  const { data: logs, isFetching } = useAppLogs(appId, stand, hatBackend);
  if (!hatBackend) {
    return (
      <p className="text-sm text-muted-foreground">
        Diese App hat keinen Server-Teil, der etwas aufschreiben könnte.
      </p>
    );
  }
  if (isFetching && !logs) return <SkeletonText lines={4} />;
  return (
    <pre
      className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border p-ui-3 font-mono text-xs text-foreground"
      data-testid="app-logs"
    >
      {logs || '(keine Ausgabe)'}
    </pre>
  );
}

export function AppAnsicht({ appId, onZurueck }: { appId: string; onZurueck: () => void }) {
  const toast = useToast();
  const { data: app, isLoading, isError } = useApp(appId);
  const schalten = useSchalten(appId);
  const entfernen = useEntfernen(appId);
  const modellSetzen = useFlowModell(appId);
  // Die Kurzliste des Geräts — dieselbe Abfrage wie die Ansicht „Modelle",
  // über denselben Schlüssel: React Query holt sie nicht zweimal.
  const { data: modelle } = useKurzliste();

  const [blick, setBlick] = useState<Blick>({ was: 'app' });
  const oeffneAnsicht = useWorkspaceStore(st => st.oeffne);
  const [stand, setStand] = useState<Stand>('live');
  const [modellFuer, setModellFuer] = useState<AppFlow | FlowDefinition | null>(null);
  const [entfernenOffen, setEntfernenOffen] = useState(false);
  const [liveFrage, setLiveFrage] = useState(false);

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

  // Live schalten fragt erst (mit dem, was neu ist), zurück geht sofort (M5).
  const handleSchalten = (ziel: 'live' | 'zurueck') => {
    if (ziel === 'live') {
      setLiveFrage(true);
      return;
    }
    schalten.mutate(ziel, {
      onSuccess: () => toast.success(`${app.name} steht wieder auf der vorigen Fassung.`),
      onError: fehler => toast.error(fehlertext(fehler)),
    });
  };

  const handleLiveSchalten = () => {
    schalten.mutate('live', {
      onSuccess: () => {
        setLiveFrage(false);
        toast.success(`${app.name} ist live. Wer sie freigegeben hat, sieht die neue Fassung.`);
      },
      onError: fehler => {
        setLiveFrage(false);
        // Ein Rückfall steht danach in der Karte des Livestands, mit zweitem
        // Satz und Technik; eine Meldung obendrauf sagte dasselbe zweimal.
        const code = (fehler as ApiError).code;
        if (code !== 'LIVE_ZURUECKGESCHALTET' && code !== 'LIVE_NICHT_GESICHERT') {
          toast.error(fehlertext(fehler));
        }
      },
    });
  };

  const handleEntfernen = () => {
    entfernen.mutate(undefined, {
      onSuccess: () => {
        setEntfernenOffen(false);
        toast.success(`${app.name} ist vom Gerät entfernt.`);
        onZurueck();
      },
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
              ? `„${flow.name}“ rechnet wieder mit dem Modell aus dem Paket.`
              : `Das Modell für „${flow.name}“ ist gesetzt.`
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

  return (
    <div className="flex flex-col gap-6" data-testid={`app-ansicht-${appId}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-lg font-medium text-foreground">
            <AppWindow className="size-4 text-muted-foreground" aria-hidden="true" />
            {app.name}
            <span className="font-mono text-xs text-muted-foreground">{app.id}</span>
          </h3>
          {app.beschreibung && (
            <p className="mt-1 text-sm text-muted-foreground">{app.beschreibung}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Der eine Weg, eine App loszuwerden, den es für einen Menschen
              gibt (Auftrag app-leiche): bis dahin konnte ein Kunde eine App
              nur über das Kit oder in der Datenbank entfernen. */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEntfernenOffen(true)}
            data-testid="app-entfernen"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            App entfernen
          </Button>
          <Button variant="outline" size="sm" onClick={onZurueck} data-testid="app-zurueck">
            Alle Apps
          </Button>
        </div>
      </div>

      <Formularseite>
        <Feldgruppe titel="Zustand" symbol={<Activity />}>
          <AppZustand app={app} />
        </Feldgruppe>

        <Feldgruppe
          titel="Fassungen"
          symbol={<AppWindow />}
          beschreibung="Eine neue Fassung kommt zuerst in Test. Live schalten Sie; vorher sichert Arasul die Daten der App."
        >
          <AppStaende
            staende={app.staende}
            laeuft={schalten.isPending}
            onSchalten={handleSchalten}
            letzteSchaltung={app.letzte_schaltung ?? null}
          />
        </Feldgruppe>

        <Feldgruppe
          titel="Personen"
          symbol={<Users />}
          beschreibung={
            'Wer die App benutzt. Testpersonen sehen zusätzlich die Testfassung, als „(Test)“ in ihrer Leiste.'
          }
        >
          <AppPersonen appId={appId} hatTeststand={Boolean(app.staende.test)} />
        </Feldgruppe>

        <Feldgruppe
          titel="Freigabestufen"
          symbol={<ClipboardCheck />}
          beschreibung="Wer je Stufe zuerst gefragt wird. Jeder mit Zugang kann eine Freigabe übernehmen oder weitergeben."
        >
          <AppStufen appId={appId} />
        </Feldgruppe>

        <Feldgruppe
          titel="Flows"
          symbol={<FileText />}
          beschreibung="Was die App selbst tut. Aus heißt: der Flow startet nicht. Eine neue Art gilt ab dem nächsten Lauf."
          aktion={
            <StandWahl stand={stand} setStand={setStand} hatTest={Boolean(app.staende.test)} />
          }
        >
          <AppFlows
            appId={appId}
            flows={detail?.flows ?? []}
            stand={gezeigterStand}
            onModell={setModellFuer}
            onOeffnen={(name, st) => setBlick({ was: 'flow', name, stand: st })}
          />
          {/* Modell je Schritt (M5): gilt dem Flow, nicht dem Stand, und steht
              deshalb unter der Liste und nicht in ihren Zeilen. */}
          <AppSchrittModelle appId={appId} />
        </Feldgruppe>

        <Feldgruppe
          titel="Verbindungen"
          symbol={<Globe />}
          beschreibung="Wohin die App ins Internet darf. Was sie nicht eingetragen hat, lässt das Gerät nicht hinaus."
        >
          <AppVerbindungen
            appId={appId}
            flows={[...(app.staende.live?.flows ?? []), ...(app.staende.test?.flows ?? [])]}
          />
        </Feldgruppe>

        {/* Die Läufe stehen im Bereich Läufe der Verwaltung, an EINER Stelle für
            alle Apps; hier ist nur der Weg dorthin, mit dieser App als Filter. */}
        <Feldgruppe
          titel="Läufe"
          symbol={<ListOrdered />}
          beschreibung="Was diese App hat laufen lassen, mit Schritten und Gedankengang. Alle Läufe stehen im Bereich Läufe."
          aktion={
            <Button
              variant="outline"
              size="sm"
              data-testid="laeufe-ansehen"
              onClick={() =>
                oeffneAnsicht({
                  type: 'verwaltung',
                  bereich: 'laeufe',
                  filter: `app=${appId}`,
                })
              }
            >
              Läufe ansehen
            </Button>
          }
        >
          {null}
        </Feldgruppe>

        <KlappGruppe
          titel="KI-Aufrufe"
          symbol={<Brain />}
          beschreibung="Jeder Modellaufruf dieser App, auch ohne Flow: wann, für wen, welches Modell, wie lange. Ohne Inhalt."
          kennzeichen="ki-aufrufe"
        >
          <KiAufrufeAbfrage appId={appId} />
        </KlappGruppe>

        <KlappGruppe
          titel="Protokoll"
          symbol={<ScrollText />}
          beschreibung="Die letzten 200 Zeilen, die die App über sich aufgeschrieben hat."
          kennzeichen="logs"
        >
          <Protokoll appId={appId} stand={gezeigterStand} hatBackend={Boolean(detail?.backend)} />
        </KlappGruppe>
      </Formularseite>

      <ModellDialog
        fuer={modellFuer}
        modelle={modelle ?? []}
        laeuft={modellSetzen.isPending}
        onSchliessen={() => setModellFuer(null)}
        onSetzen={handleModell}
      />
      {app.staende.test && (
        <LiveSchaltenDialog
          offen={liveFrage}
          name={app.name}
          neu={app.staende.test.version}
          alt={app.staende.live?.version ?? null}
          aenderungstext={app.staende.test.aenderungstext ?? null}
          mitDaten={app.staende.test.api !== null}
          laeuft={schalten.isPending}
          onSchliessen={() => setLiveFrage(false)}
          onSchalten={handleLiveSchalten}
        />
      )}
      <AppEntfernenDialog
        fuer={entfernenOffen ? { id: app.id, name: app.name } : null}
        laeuft={entfernen.isPending}
        onSchliessen={() => setEntfernenOffen(false)}
        onEntfernen={handleEntfernen}
      />
    </div>
  );
}
