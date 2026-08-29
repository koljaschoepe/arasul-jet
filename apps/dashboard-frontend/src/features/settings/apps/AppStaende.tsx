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
import { Activity, ArrowLeftRight, Rocket } from 'lucide-react';
import { Button, cn, FASSUNG } from '@marken';
import { formatDate } from '@/utils/formatting';
import type { AppStandDetail, Backendzustand } from './useAppVerwaltung';

/** Drei Zahlen als Zahlen: `3.10.0` steht hinter `3.9.0` und nicht davor. */
function zahlen(fassung: string): number[] {
  return fassung.split('.').map(teil => Number.parseInt(teil, 10) || 0);
}

/** Ist `a` älter als `b`? */
function aelter(a: string, b: string): boolean {
  const links = zahlen(a);
  const rechts = zahlen(b);
  for (let i = 0; i < Math.max(links.length, rechts.length); i += 1) {
    const eins = links[i] ?? 0;
    const zwei = rechts[i] ?? 0;
    if (eins !== zwei) {
      return eins < zwei;
    }
  }
  return false;
}

/**
 * Auf welcher Fassung des Designsystems diese App steht (Phase H6).
 *
 * Eine App trägt die Bibliothek als KOPIE — als Spiegel der Quelle in ihrem
 * Frontend oder als beigelegtes `marken.js`. Die Shell zieht mit jedem Deploy
 * nach, die App bleibt auf dem Stand ihres letzten Paketbaus, und der Mensch
 * sieht beides in EINEM Rahmen übereinander. Nichts an einer laufenden App
 * würde davon rot — deshalb steht es hier.
 *
 * KEIN ROT. Eine App mit einer alten Bibliothek läuft; sie sieht nur nicht
 * mehr aus wie das Gerät um sie herum. Rot ist in dieser Karte reserviert
 * für „ein Mensch klickt auf die Kachel und bekommt nichts".
 *
 * Verglichen wird gegen `FASSUNG` aus `@marken` und nicht gegen eine Zahl vom
 * Backend: die Shell ÜBERSETZT die Bibliothek mit, also ist ihre Fassung die
 * des Geräts. Eine zweite Zahl daneben wäre eine, die eines Tages etwas
 * anderes sagt.
 */
function Bibliothek({ fassung }: { fassung: string | null }) {
  if (!fassung) {
    return (
      <span className="text-warning" data-testid="marken-fassung">
        nicht genannt: die App sagt nicht, worauf sie steht
      </span>
    );
  }
  if (fassung === FASSUNG) {
    return (
      <span className="font-mono text-foreground" data-testid="marken-fassung">
        {fassung}
      </span>
    );
  }
  return (
    <span className="text-warning" data-testid="marken-fassung">
      <span className="font-mono">{fassung}</span>
      {aelter(fassung, FASSUNG)
        ? `, älter als das Gerät (${FASSUNG})`
        : `, neuer als das Gerät (${FASSUNG})`}
    </span>
  );
}

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
    return <span className="text-muted-foreground">kein Backend</span>;
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
        gut ? 'text-success' : 'text-destructive',
        backend.laeuft && !backend.gesundheit && 'text-muted-foreground'
      )}
    >
      <Activity className="size-3.5" aria-hidden="true" />
      {wort}
    </span>
  );
}

function StandKarte({
  stand,
  detail,
  aktion,
}: {
  stand: 'test' | 'live';
  detail: AppStandDetail | null;
  aktion?: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-border p-ui-3"
      data-testid={`stand-${stand}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">
          {stand === 'live' ? 'Livestand' : 'Teststand'}
        </span>
        {detail && (
          <span
            className="rounded bg-accent px-1.5 py-0.5 font-mono text-ui-xs text-foreground"
            data-testid={`version-${stand}`}
          >
            {detail.version}
          </span>
        )}
      </div>

      {!detail ? (
        <p className="text-sm text-muted-foreground">
          {stand === 'live'
            ? 'Noch nichts live. Was im Teststand steht, schaltet der Knopf daneben.'
            : 'Kein Teststand. Der Partner rollt eine Version mit dem Ara-Kit hierher.'}
        </p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Zustand</dt>
          <dd>
            <Gesundheit backend={detail.backend} mangel={detail.lieferbar ? null : detail.mangel} />
          </dd>
          <dt className="text-muted-foreground">Eingespielt</dt>
          <dd className="text-foreground">{formatDate(detail.eingespielt_am)}</dd>
          {detail.vorige_version && (
            <>
              <dt className="text-muted-foreground">Davor</dt>
              <dd className="font-mono text-foreground">{detail.vorige_version}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Flows</dt>
          <dd className="text-foreground">{detail.flows.length}</dd>
          <dt className="text-muted-foreground">Bausteine</dt>
          <dd>
            <Bibliothek fassung={detail.marken} />
          </dd>
          {detail.pfad && (
            <>
              <dt className="text-muted-foreground">Weg</dt>
              <dd className="truncate font-mono text-ui-xs text-muted-foreground">{detail.pfad}</dd>
            </>
          )}
        </dl>
      )}

      {aktion && <div className="mt-1">{aktion}</div>}
    </div>
  );
}

export function AppStaende({
  staende,
  laeuft,
  onSchalten,
}: {
  staende: { test: AppStandDetail | null; live: AppStandDetail | null };
  laeuft: boolean;
  onSchalten: (ziel: 'live' | 'zurueck') => void;
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
              {staende.live ? `Live schalten (${staende.test?.version})` : 'Live schalten'}
            </Button>
          ) : undefined
        }
      />
      <StandKarte
        stand="live"
        detail={staende.live}
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
