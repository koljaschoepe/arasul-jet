/**
 * Die Plattform auf die nächste Fassung bringen (J39, 02.10.2026).
 *
 * Das Gerät holt das Paket selbst, sichert VORHER, spielt ein und geht bei einem
 * Fehler auf die vorige Fassung zurück. Diese Karte zeigt nur, was das Backend
 * sagt (`GET /api/update/fassung`) und stößt die zwei Wege an; sie rechnet
 * nichts selbst.
 *
 * WÄHREND DES UMSCHALTENS IST DAS GERÄT EINIGE MINUTEN NICHT ERREICHBAR. Die
 * Abfrage schlägt dann fehl, und das ist kein Fehler des Laufs: die Karte
 * sagt es und fragt weiter. Der Stand liegt im Zustand des Geräts und wird vom
 * NEUEN Backend gelesen, sobald es da ist.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, Download, RotateCcw, Settings } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { fassungLesbar } from '../../utils/formatting';
import { Button } from '@marken';
import { Feldgruppe } from '@marken';

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

export function FassungAktualisieren() {
  const api = useApi();
  const qc = useQueryClient();
  const [fehler, setFehler] = useState('');
  const [startet, setStartet] = useState(false);

  const { data: stand, isError: unerreichbar } = useQuery({
    queryKey: STAND_KEY,
    queryFn: () => api.get<{ data: FassungStand }>('/update/fassung', { showError: false }),
    select: antwort => antwort.data,
    // Läuft etwas, im Drei-Sekunden-Takt; sonst nur beim Öffnen.
    refetchInterval: query => (query.state.data?.data.laeuft || startet ? 3_000 : false),
    retry: false,
  });

  const lauft = stand?.laeuft === true || startet;

  const { data: neueste } = useQuery({
    queryKey: ['update', 'fassung', 'neueste'],
    queryFn: () =>
      api.get<{ data: Neueste | null }>('/update/fassung/neueste', { showError: false }),
    select: antwort => antwort.data,
    enabled: stand?.einspielenMoeglich === true && !lauft,
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (!stand && !unerreichbar) return null;
  // Während des Umschaltens ist das Gerät weg; die Karte sagt es und fragt weiter.
  if (!stand) {
    return (
      <Feldgruppe titel="Neue Fassung" symbol={<Settings />}>
        <p className="text-sm text-muted-foreground" data-testid="fassung-unerreichbar">
          Das Gerät antwortet gerade nicht. Läuft eine Aktualisierung, ist das erwartbar: es startet
          sich dabei selbst neu. Diese Seite bitte offen lassen.
        </p>
      </Feldgruppe>
    );
  }
  if (!stand.einspielenMoeglich) return null;

  const aktuell = stand.fassung.nummer;
  const neuer =
    neueste && aktuell && neueste.fassung !== aktuell && vergleiche(neueste.fassung, aktuell) > 0
      ? neueste.fassung
      : null;
  const lauf = stand.lauf;
  const imLauf = lauf?.status === 'laeuft';

  const los = async (pfad: string, koerper?: Record<string, unknown>) => {
    setFehler('');
    setStartet(true);
    try {
      await api.post(pfad, koerper ?? {}, { showError: false });
      await qc.invalidateQueries({ queryKey: STAND_KEY });
    } catch (err: unknown) {
      setFehler((err as { message?: string }).message || 'Das ließ sich nicht starten');
    } finally {
      setStartet(false);
    }
  };

  return (
    <Feldgruppe titel="Neue Fassung" symbol={<Download />}>
      <div className="space-y-4" data-testid="fassung-karte">
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
            {lauf && ENDE[lauf.status] && (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {lauf.status === 'fertig' ? (
                    <CheckCircle className="size-4 text-primary" />
                  ) : (
                    <AlertCircle className="size-4" />
                  )}
                  {ENDE[lauf.status]}
                  {lauf.nach ? `: ${fassungLesbar(lauf.nach)}` : ''}
                </p>
                {lauf.status !== 'fertig' && lauf.meldung && (
                  <p className="text-sm text-muted-foreground">{lauf.meldung}</p>
                )}
                <Protokoll zeilen={lauf.protokoll} />
              </div>
            )}

            {neuer ? (
              <div className="space-y-2">
                <p className="text-sm text-foreground">
                  Es gibt eine neuere Fassung: <strong>{fassungLesbar(neuer)}</strong> (hier läuft{' '}
                  {fassungLesbar(aktuell)}).
                </p>
                <p className="text-xs text-muted-foreground">
                  Das Gerät sichert vorher, spielt die neue Fassung ein und geht bei einem Fehler
                  von selbst auf die vorige zurück. Konten, Lizenz, Apps mit ihren Daten, Flows,
                  Modelle und der Firmenordner bleiben, wie sie sind.
                </p>
                <Button onClick={() => void los('/update/fassung/einspielen', { fassung: neuer })}>
                  Auf {fassungLesbar(neuer)} aktualisieren
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="fassung-aktuell">
                {neueste
                  ? `Dieses Gerät trägt die neueste Fassung (${fassungLesbar(aktuell)}).`
                  : 'Ob es eine neuere Fassung gibt, ließ sich nicht erfragen. Ist das Gerät im Netz?'}
              </p>
            )}

            {stand.zurueckMoeglich && stand.vorige && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  Zurück auf die Fassung davor ({fassungLesbar(stand.vorige.fassung)}). Das holt das
                  Programm zurück, nicht die Daten; die Sicherung vom Einspielen liegt unter
                  „Sicherung“ bereit.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void los('/update/fassung/zurueck')}
                >
                  <RotateCcw className="mr-1 size-3.5" />
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
      </div>
    </Feldgruppe>
  );
}

function Protokoll({ zeilen }: { zeilen?: string[] }) {
  if (!zeilen || zeilen.length === 0) return null;
  return (
    <pre
      className="max-h-48 overflow-auto rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground"
      data-testid="fassung-protokoll"
    >
      {zeilen.slice(-12).join('\n')}
    </pre>
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
