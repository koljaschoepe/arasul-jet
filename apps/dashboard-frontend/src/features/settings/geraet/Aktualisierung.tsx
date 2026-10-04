/**
 * Aktualisierung: die Plattform auf die nächste Fassung bringen, mit einem
 * Knopf (J39, seit M5 im Bereich Gerät).
 *
 * Das Gerät holt das Paket selbst, sichert VORHER, spielt ein und geht bei einem
 * Fehler auf die vorige Fassung zurück. Dieser Abschnitt zeigt nur, was das
 * Backend sagt (`GET /api/update/fassung`) und stößt die zwei Wege an; er
 * rechnet nichts selbst. Vor beiden Wegen steht eine Bestätigung: das Gerät
 * ist danach einige Minuten nicht erreichbar.
 *
 * EIN WEG, NICHT ZWEI. Bis M5 stand darunter „Paket von Hand einspielen"
 * (`.araupdate` hochladen oder vom USB-Stick). Der Weg braucht ein
 * `docker`-Programm im Container des Backends, und das ausgelieferte Gerät hat
 * keines (`updateService.wegPruefen`): er zeigte am Orin nur den Satz, dass er
 * nicht geht. Ein Gerät ohne Netz aktualisiert der Betreuer an der Konsole
 * (`./arasul update`). Der Schalter „nachts selbst einspielen" gehört zur
 * Karte update-nachts und steht hier noch nicht.
 *
 * WÄHREND DES UMSCHALTENS IST DAS GERÄT EINIGE MINUTEN NICHT ERREICHBAR. Die
 * Abfrage schlägt dann fehl, und das ist kein Fehler des Laufs: der Abschnitt
 * sagt es und fragt weiter. Der Stand liegt im Zustand des Geräts und wird vom
 * NEUEN Backend gelesen, sobald es da ist.
 */
import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, ChevronDown, Download, RotateCcw, Settings } from 'lucide-react';
import {
  Bestaetigung,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Feldgruppe,
  cn,
} from '@marken';
import { useApi } from '@/hooks/useApi';
import { fassungLesbar } from '@/utils/formatting';

interface Lauf {
  art?: 'einspielen' | 'zurueck';
  status: string;
  schritt?: string;
  meldung?: string;
  von?: string;
  nach?: string;
  protokoll?: string[];
}

interface FassungStand {
  fassung: { version: string | null; nummer: string | null };
  einspielenMoeglich: boolean;
  einspielenGrund: string | null;
  laeuft: boolean;
  lauf: Lauf | null;
  zurueckMoeglich: boolean;
  vorige: { fassung: string } | null;
}

interface Neueste {
  fassung: string;
}

const STAND_KEY = ['update', 'fassung'] as const;

const SCHRITTE: Record<string, string> = {
  herunterladen: 'Das Paket wird geholt und geprüft',
  sichern: 'Vor dem Einspielen wird gesichert',
  uebergabe: 'Das Einspielen wird übergeben',
  auspacken: 'Das Paket wird ausgepackt',
  installieren: 'Die neue Fassung wird gebaut, das Gerät läuft solange weiter',
  pruefen: 'Das Gerät wird geprüft',
  aufraeumen: 'Aufräumen',
  rueckweg: 'Etwas ist schiefgegangen, das Gerät geht auf die vorige Fassung zurück',
};

const ENDE: Record<string, string> = {
  fertig: 'Fertig',
  fehlgeschlagen: 'Nicht eingespielt',
  zurueckgerollt: 'Nicht eingespielt, das Gerät läuft wieder mit der vorigen Fassung',
  rueckweg_fehlgeschlagen: 'Nicht eingespielt, und auch der Weg zurück ist gescheitert',
  abgebrochen: 'Abgebrochen',
};

type Vorhaben = { art: 'einspielen'; fassung: string } | { art: 'zurueck'; fassung: string };

export function Aktualisierung() {
  const api = useApi();
  const qc = useQueryClient();
  const [fehler, setFehler] = useState('');
  const [startet, setStartet] = useState(false);
  const [vorhaben, setVorhaben] = useState<Vorhaben | null>(null);

  const { data: stand, isError: unerreichbar } = useQuery({
    queryKey: STAND_KEY,
    queryFn: () => api.get<{ data: FassungStand }>('/update/fassung', { showError: false }),
    select: antwort => antwort.data,
    // Läuft etwas, im Drei-Sekunden-Takt; sonst nur beim Öffnen.
    refetchInterval: query => (query.state.data?.data.laeuft || startet ? 3_000 : false),
    retry: false,
  });

  const lauft = stand?.laeuft === true || startet;

  const { data: neueste, isError: neuesteFehlt } = useQuery({
    queryKey: ['update', 'fassung', 'neueste'],
    queryFn: () =>
      api.get<{ data: Neueste | null }>('/update/fassung/neueste', { showError: false }),
    select: antwort => antwort.data,
    enabled: stand?.einspielenMoeglich === true && !lauft,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const rahmen = (inhalt: ReactNode) => (
    <Feldgruppe titel="Aktualisierung" symbol={<Download />}>
      <div className="space-y-4" data-abschnitt="aktualisierung" data-testid="fassung-karte">
        {inhalt}
      </div>
    </Feldgruppe>
  );

  if (!stand && !unerreichbar) {
    return rahmen(<p className="text-sm text-muted-foreground">Wird geladen …</p>);
  }
  // Während des Umschaltens ist das Gerät weg; der Abschnitt sagt es und fragt weiter.
  if (!stand) {
    return rahmen(
      <p className="text-sm text-muted-foreground" data-testid="fassung-unerreichbar">
        Das Gerät antwortet gerade nicht. Läuft eine Aktualisierung, ist das erwartbar: es startet
        sich dabei selbst neu. Diese Seite bitte offen lassen.
      </p>
    );
  }

  const aktuell = stand.fassung.nummer;
  const hierLaeuft = (
    <p className="text-sm text-foreground" data-testid="fassung-hier">
      Hier läuft Fassung {fassungLesbar(aktuell ?? stand.fassung.version)}.
    </p>
  );

  if (!stand.einspielenMoeglich) {
    return rahmen(
      <>
        {hierLaeuft}
        <p className="text-sm text-muted-foreground" data-testid="einspielen-nicht-moeglich">
          {stand.einspielenGrund ??
            'Aktualisierungen spielt Ihr Betreuer auf dieses Gerät ein, nicht diese Seite.'}
        </p>
      </>
    );
  }

  const neuer =
    neueste && aktuell && neueste.fassung !== aktuell && vergleiche(neueste.fassung, aktuell) > 0
      ? neueste.fassung
      : null;
  const lauf = stand.lauf;
  const imLauf = lauf?.status === 'laeuft';

  const los = async (v: Vorhaben) => {
    setFehler('');
    setStartet(true);
    try {
      if (v.art === 'einspielen') {
        await api.post('/update/fassung/einspielen', { fassung: v.fassung }, { showError: false });
      } else {
        await api.post('/update/fassung/zurueck', {}, { showError: false });
      }
      await qc.invalidateQueries({ queryKey: STAND_KEY });
    } catch (err: unknown) {
      setFehler((err as { message?: string }).message || 'Das ließ sich nicht starten.');
    } finally {
      setStartet(false);
    }
  };

  return rahmen(
    <>
      <Bestaetigung
        offen={vorhaben !== null}
        beiSchliessen={() => setVorhaben(null)}
        beiBestaetigen={() => {
          const v = vorhaben;
          setVorhaben(null);
          if (v) void los(v);
        }}
        titel={
          vorhaben?.art === 'zurueck'
            ? `Zurück auf ${fassungLesbar(vorhaben.fassung)}?`
            : `Auf ${fassungLesbar(vorhaben?.fassung)} aktualisieren?`
        }
        frage={
          vorhaben?.art === 'zurueck'
            ? 'Das holt das Programm zurück, nicht die Daten. Das Gerät ist einige Minuten nicht erreichbar.'
            : 'Das Gerät sichert vorher und ist beim Umschalten einige Minuten nicht erreichbar. Geht etwas schief, kehrt es von selbst zur jetzigen Fassung zurück.'
        }
        jaText={vorhaben?.art === 'zurueck' ? 'Zurück' : 'Aktualisieren'}
      />

      {imLauf || startet ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Settings className="size-4 animate-spin text-primary" />
            {lauf?.art === 'zurueck' ? 'Zurück auf ' : 'Wird eingespielt: '}
            {fassungLesbar(lauf?.nach)}
          </p>
          <p className="text-sm text-muted-foreground" data-testid="fassung-schritt">
            {(lauf?.schritt && SCHRITTE[lauf.schritt]) || lauf?.meldung || 'Wird gestartet …'}
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-full animate-pulse rounded-full bg-primary" />
          </div>
          <p className="text-xs text-muted-foreground">
            Das Gerät ist beim Umschalten einige Minuten nicht erreichbar. Diese Seite bitte offen
            lassen und das Gerät nicht ausschalten.
          </p>
          <Protokoll zeilen={lauf?.protokoll} />
        </div>
      ) : (
        <>
          {hierLaeuft}
          {lauf && ENDE[lauf.status] && lauf.status !== 'fertig' && (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <AlertCircle className="size-4" />
                {ENDE[lauf.status]}
                {lauf.nach ? `: ${fassungLesbar(lauf.nach)}` : ''}
              </p>
              {lauf.meldung && <p className="text-sm text-muted-foreground">{lauf.meldung}</p>}
              <Protokoll zeilen={lauf.protokoll} />
            </div>
          )}

          {neuer ? (
            <div className="space-y-2">
              <p className="text-sm text-foreground">
                Es gibt eine neuere Fassung:{' '}
                <strong className="font-medium">{fassungLesbar(neuer)}</strong>. Das Gerät sichert
                vorher und geht bei einem Fehler von selbst zurück. Konten, Lizenz, Apps mit ihren
                Daten, Flows, Modelle und der Firmenordner bleiben, wie sie sind.
              </p>
              <Button
                onClick={() => setVorhaben({ art: 'einspielen', fassung: neuer })}
                data-testid="fassung-einspielen"
              >
                Auf {fassungLesbar(neuer)} aktualisieren
              </Button>
            </div>
          ) : (
            <p
              className="flex items-center gap-2 text-sm text-muted-foreground"
              data-testid="fassung-aktuell"
            >
              {neueste ? (
                <>
                  <CheckCircle className="size-4 text-primary" aria-hidden="true" />
                  Das ist die neueste Fassung.
                </>
              ) : neuesteFehlt || neueste === null ? (
                'Ob es eine neuere Fassung gibt, ließ sich nicht erfragen. Ist das Gerät im Netz?'
              ) : (
                'Sieht nach einer neueren Fassung …'
              )}
            </p>
          )}

          {stand.zurueckMoeglich && stand.vorige && (
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">
                Die Fassung davor ({fassungLesbar(stand.vorige.fassung)}) lässt sich wieder holen.
              </p>
              <Button
                variant="outline"
                size="sm"
                data-testid="fassung-zurueck"
                onClick={() =>
                  stand.vorige && setVorhaben({ art: 'zurueck', fassung: stand.vorige.fassung })
                }
              >
                <RotateCcw className="size-3.5" />
                Zurück auf {fassungLesbar(stand.vorige.fassung)}
              </Button>
            </div>
          )}

          {fehler && (
            <p className="flex items-center gap-2 text-sm text-foreground" role="alert">
              <AlertCircle className="size-4 shrink-0" />
              {fehler}
            </p>
          )}
        </>
      )}
    </>
  );
}

/** Die Ausgabe des Laufs, nur aufgeklappt: sie ist für den Betreuer. */
function Protokoll({ zeilen }: { zeilen?: string[] }) {
  const [offen, setOffen] = useState(false);
  if (!zeilen || zeilen.length === 0) return null;
  return (
    <Collapsible open={offen} onOpenChange={setOffen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-2" data-testid="fassung-protokoll-knopf">
          <ChevronDown
            className={cn('size-4 transition-transform', offen && 'rotate-180')}
            aria-hidden="true"
          />
          Protokoll
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre
          className="max-h-48 overflow-auto rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs text-muted-foreground"
          data-testid="fassung-protokoll"
        >
          {zeilen
            .slice(-12)
            // Farbcodes der Konsole (ESC [ … m) stehen sonst als Zeichensalat da.
            // eslint-disable-next-line no-control-regex
            .map(z => z.replace(/\u001b\[[0-9;]*m/g, ''))
            .join('\n')}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** `X.Y.Z` gegen `X.Y.Z`; größer als null heißt: das erste ist neuer. */
function vergleiche(a: string, b: string): number {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  }
  return 0;
}
