/**
 * Die zwei Stände einer App, nebeneinander (Phase D4).
 *
 * Der Lebenslauf einer App aus `kit-grundriss.md`: der Partner rollt in den
 * **Teststand**, die benannten Tester sehen ihn, und **live schaltet ein
 * Mensch**. Bis D4 war dieser Mensch jemand mit einem API-Schlüssel und einer
 * Befehlszeile; hier ist es der Administrator, der eben den Teststand gesehen
 * hat.
 *
 * ZWEI KARTEN UND KEIN UMSCHALTER. Beide Stände stehen gleichzeitig da, mit
 * ihrer Version und dem Zustand ihres Containers. Ein Umschalter wäre die
 * kleinere Fläche und die größere Falle: die Frage vor dem Schalten lautet
 * „was ist im Test, und was ist gerade live", und die beantwortet man nicht,
 * indem man hin- und herklickt.
 */
import { Activity, ArrowLeftRight, Rocket, TriangleAlert } from 'lucide-react';
import { Button, cn } from '@marken';
import { formatDate } from '@/utils/formatting';
import { TechnischeAngaben } from '@/features/system/TechnischeAngaben';
import { Bibliothek, bibliothekWarnt } from './Bibliothek';
import type { AppSchaltung, AppStandDetail, Backendzustand } from './useAppVerwaltung';

/**
 * Der Zustand des App-Backends in einem Wort und einer Farbe.
 *
 * Drei Zustände, die man auseinanderhalten muss: es läuft und meldet sich
 * gesund, es läuft und meldet nichts (das Manifest nennt keine Prüfung), es
 * läuft nicht. Der mittlere ist kein Fehler — deshalb ist er grau und nicht
 * rot.
 */
function Gesundheit({
  backend,
  mangel,
}: {
  backend: Backendzustand | null;
  /** Was dem Stand fehlt, um ausgeliefert zu werden — oder null. */
  mangel: string | null;
}) {
  // Vor allem anderen: ein Container, der gesund meldet, während die Dateien
  // daneben fehlen, ist genau der Zustand, den niemand sehen konnte
  // (Auftrag app-leiche). Das Gerät sagt jetzt, was fehlt, und die Karte
  // sagt es weiter — rot, weil ein Mensch auf die Kachel klickt und nichts
  // bekommt.
  if (mangel) {
    return (
      <span className="inline-flex items-start gap-1.5 text-destructive" data-testid="stand-mangel">
        <Activity className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-medium">nicht lieferbar</span> — {mangel}
        </span>
      </span>
    );
  }
  if (!backend) {
    return <span className="text-muted-foreground">kein Server-Teil</span>;
  }
  const gut = backend.laeuft && backend.gesundheit !== 'unhealthy';
  const wort = !backend.laeuft
    ? backend.status || 'steht'
    : backend.gesundheit === 'healthy'
      ? 'läuft, gesund'
      : backend.gesundheit === 'unhealthy'
        ? 'läuft, meldet Fehler'
        : backend.gesundheit === 'starting'
          ? 'startet'
          : 'läuft';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5',
        gut ? 'text-primary' : 'text-destructive',
        backend.laeuft && !backend.gesundheit && 'text-muted-foreground'
      )}
    >
      <Activity className="size-3.5" aria-hidden="true" />
      {wort}
    </span>
  );
}

/**
 * Wie der letzte Versuch, live zu schalten, ausging — nur, wenn er nicht
 * glatt ging (M5). Ein Satz, was geschah, ein zweiter, was zu tun ist; die
 * Technik (Grund, letzte Zeilen der Fassung, Stand der Sicherung) nur
 * aufgeklappt.
 */
function SchaltungHinweis({ schaltung }: { schaltung: AppSchaltung }) {
  const t = schaltung.technik;
  const rueckfall = t?.rueckfall;
  return (
    <div
      className="flex flex-col gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-ui-2 text-sm"
      role="status"
      data-testid="schaltung-hinweis"
      data-ergebnis={schaltung.ergebnis}
    >
      <p className="flex items-start gap-1.5 font-medium text-foreground">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
        <span data-testid="schaltung-satz">{schaltung.satz}</span>
      </p>
      {schaltung.hilfe && (
        <p className="text-muted-foreground" data-testid="schaltung-hilfe">
          {schaltung.hilfe}
        </p>
      )}
      <TechnischeAngaben
        kennzeichen="schaltung-technik"
        angaben={[
          {
            beschriftung: 'Fassung',
            wert: `${schaltung.von_version ?? '—'} → ${schaltung.nach_version}`,
          },
          { beschriftung: 'Versucht', wert: formatDate(schaltung.begonnen_am) },
          { beschriftung: 'Grund', wert: t?.grund ?? null },
          { beschriftung: 'Exit-Code', wert: t?.exit_code != null ? String(t.exit_code) : null },
          {
            beschriftung: 'Stand der Sicherung',
            wert: schaltung.sicherung_id?.slice(0, 8) ?? null,
          },
          {
            beschriftung: 'Daten zurück',
            wert: rueckfall?.daten ? (rueckfall.daten.erfolg ? 'ja' : 'nein') : null,
          },
          {
            beschriftung: 'Fassung zurück',
            wert: rueckfall?.fassung
              ? rueckfall.fassung.erfolg
                ? (rueckfall.fassung.version ?? 'nichts live')
                : `nein${rueckfall.fassung.fehler ? ` (${rueckfall.fassung.fehler})` : ''}`
              : null,
          },
          { beschriftung: 'Letzte Zeilen', wert: t?.letzte_zeilen || t?.ausgabe || null },
          // Was der Versuch nicht kennt, steht nicht da: ein Rückfall wegen
          // `unhealthy` hat keinen Exit-Code, und „Exit-Code —" las sich wie einer.
        ].filter(a => a.wert)}
      />
    </div>
  );
}

/** Die Ergebnisse, die in der Karte stehen bleiben. „live" sieht man an der Version. */
const HINWEIS_BEI: ReadonlyArray<AppSchaltung['ergebnis']> = [
  'zurueckgeschaltet',
  'nicht_gesichert',
  'fehlgeschlagen',
];

function StandKarte({
  stand,
  detail,
  aktion,
  hinweis,
}: {
  stand: 'test' | 'live';
  detail: AppStandDetail | null;
  aktion?: React.ReactNode;
  hinweis?: React.ReactNode;
}) {
  const hatFrontend = detail?.dateien.frontend !== null;
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-border p-ui-3"
      data-testid={`stand-${stand}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">
          {stand === 'live' ? 'Livefassung' : 'Testfassung'}
        </span>
        {detail && (
          <span
            className="font-mono text-ui-xs text-muted-foreground"
            data-testid={`version-${stand}`}
          >
            {detail.version}
          </span>
        )}
      </div>

      {!detail ? (
        <p className="text-sm text-muted-foreground">
          {stand === 'live'
            ? 'Noch nichts live. Was in Test steht, schaltet der Knopf daneben live.'
            : 'Nichts in Test. Eine neue Fassung bringt Ihr Partner auf das Gerät.'}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Zustand</dt>
            <dd>
              <Gesundheit
                backend={detail.backend}
                mangel={detail.lieferbar ? null : detail.mangel}
              />
            </dd>
            {/* Was der Entwickler beim Ausrollen schrieb (Kontrakt 8, M5). */}
            {detail.aenderungstext && (
              <>
                <dt className="text-muted-foreground">Neu</dt>
                <dd
                  className="whitespace-pre-line text-foreground"
                  data-testid={`aenderungstext-${stand}`}
                >
                  {detail.aenderungstext}
                </dd>
              </>
            )}
            {/* Die Bibliothek offen nur, wenn sie warnt (H6): sonst ist sie
                Technik und steht aufgeklappt darunter. */}
            {bibliothekWarnt(detail.marken, hatFrontend) && (
              <>
                <dt className="text-muted-foreground">Bibliothek</dt>
                <dd>
                  <Bibliothek fassung={detail.marken} hatFrontend={hatFrontend} />
                </dd>
              </>
            )}
          </dl>
          <TechnischeAngaben
            kennzeichen={`stand-${stand}-technik`}
            angaben={[
              { beschriftung: 'Fassung', wert: detail.version },
              { beschriftung: 'Davor', wert: detail.vorige_version },
              { beschriftung: 'Eingespielt', wert: formatDate(detail.eingespielt_am) },
              { beschriftung: 'Weg', wert: detail.pfad },
              {
                beschriftung: 'Bibliothek',
                wert: hatFrontend ? (detail.marken ?? 'nicht genannt') : 'ohne Oberfläche',
              },
              { beschriftung: 'Server-Teil', wert: detail.backend?.status ?? null },
            ]}
          />
        </>
      )}

      {hinweis}
      {aktion && <div className="mt-1">{aktion}</div>}
    </div>
  );
}

export function AppStaende({
  staende,
  laeuft,
  onSchalten,
  letzteSchaltung = null,
}: {
  staende: { test: AppStandDetail | null; live: AppStandDetail | null };
  laeuft: boolean;
  onSchalten: (ziel: 'live' | 'zurueck') => void;
  /** Der letzte Versuch, live zu schalten (M5). */
  letzteSchaltung?: AppSchaltung | null;
}) {
  // Beide Knöpfe stehen nur da, wenn sie etwas tun können. Ein „Zurück", das
  // sicher mit 409 antwortet, weil im Livestand nie etwas anderes lief, ist
  // eine Sackgasse — dieselbe Linie wie bei den Knöpfen der Mitarbeiter-Liste
  // für das eigene Konto (D3).
  const kannLive = Boolean(staende.test);
  const kannZurueck = Boolean(staende.live?.vorige_version);

  return (
    <div className="grid grid-cols-1 gap-ui-2 md:grid-cols-2">
      <StandKarte
        stand="test"
        detail={staende.test}
        aktion={
          kannLive ? (
            <Button
              size="sm"
              disabled={laeuft}
              onClick={() => onSchalten('live')}
              data-testid="schalten-live"
            >
              <Rocket className="size-4" aria-hidden="true" />
              {laeuft
                ? 'Wird live geschaltet…'
                : staende.live
                  ? `Live schalten (${staende.test?.version})`
                  : 'Live schalten'}
            </Button>
          ) : undefined
        }
      />
      <StandKarte
        stand="live"
        detail={staende.live}
        hinweis={
          letzteSchaltung && HINWEIS_BEI.includes(letzteSchaltung.ergebnis) ? (
            <SchaltungHinweis schaltung={letzteSchaltung} />
          ) : undefined
        }
        aktion={
          kannZurueck ? (
            <Button
              size="sm"
              variant="outline"
              disabled={laeuft}
              onClick={() => onSchalten('zurueck')}
              data-testid="schalten-zurueck"
            >
              <ArrowLeftRight className="size-4" aria-hidden="true" />
              Zurück auf {staende.live?.vorige_version}
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
