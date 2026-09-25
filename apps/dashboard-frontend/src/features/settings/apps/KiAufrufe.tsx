/**
 * Die Modellaufrufe einer App (J35).
 *
 * Die Läufe darüber zeigen, was ein FLOW getan hat. Eine App fragt ein Modell
 * aber auch ohne Flow — `document/extract-structured` liefert einen Vorschlag,
 * und der stand bis hierher nur im Protokoll der App selbst. Eine Kanzlei muss
 * nachweisen können, welches Modell welchen Vorschlag gemacht hat, für wen und
 * wann; das Gerät führt dieses Protokoll deshalb selbst.
 *
 * OHNE INHALT, und das ist keine Lücke der Ansicht: das Backend speichert
 * weder Dateinamen noch Text noch Antwort, nur Art und Größe der Datei und den
 * sha256 der Antwort. Mit ihm lässt sich ein Vorschlag, den die App
 * aufbewahrt hat, genau diesem Aufruf zuordnen.
 */
import { formatBytes } from '@/utils/formatting';
import { LaufZustand } from './LaufAnsicht';
import type { KiAufruf } from './useAppVerwaltung';

/** Datum mit Sekunden: in einem Nachweis sind zwei Aufrufe derselben Minute zwei. */
function zeitpunkt(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function dauer(ms: number | null): string | null {
  if (ms == null) return null;
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} s`;
}

/** `application/pdf` → `PDF`; was keinen kurzen Namen hat, bleibt, wie es ist. */
function dateiArt(typ: string | null): string | null {
  if (!typ) return null;
  const teil = typ.split('/').pop() ?? typ;
  return teil.length <= 5 ? teil.toUpperCase() : typ;
}

export function KiAufrufe({ aufrufe }: { aufrufe: KiAufruf[] | undefined }) {
  if (!aufrufe || aufrufe.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="ki-aufrufe-leer">
        Noch kein Modellaufruf. Jeder Aufruf dieser App über die Schnittstelle erscheint hier, mit
        Modell, Mensch und Dauer.
      </p>
    );
  }

  return (
    <ul className="flex flex-col rounded-md border border-border" data-testid="ki-aufrufe-liste">
      {aufrufe.map(a => {
        const d = dauer(a.dauer_ms);
        const art = dateiArt(a.datei_typ);
        return (
          <li
            key={a.id}
            className="flex flex-col gap-1 border-b border-border p-ui-3 last:border-b-0"
            data-testid={`ki-aufruf-${a.id}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ui-xs text-muted-foreground">{zeitpunkt(a.begonnen_am)}</span>
              <span className="font-mono text-ui-xs text-foreground">{a.endpunkt}</span>
              <LaufZustand status={a.status} />
              {a.stand === 'test' && (
                <span className="rounded bg-muted-foreground/15 px-1.5 py-0.5 text-ui-xs text-muted-foreground">
                  Test
                </span>
              )}
            </div>
            <p className="text-sm text-foreground">
              <span data-testid={`ki-aufruf-modell-${a.id}`}>{a.modell ?? 'Modell unbekannt'}</span>
              <span className="text-muted-foreground">
                {' · '}
                {a.benutzer_name ? (
                  <>
                    für <span className="text-foreground">{a.benutzer_name}</span>
                  </>
                ) : (
                  'ohne Angabe, für wen'
                )}
                {d && ` · ${d}`}
                {art &&
                  ` · ${art}${a.datei_bytes != null ? `, ${formatBytes(a.datei_bytes)}` : ''}`}
              </span>
            </p>
            {a.fehler && <p className="text-ui-xs text-destructive">{a.fehler}</p>}
            {(a.job_id || a.antwort_sha256) && (
              <p className="break-all font-mono text-ui-xs text-muted-foreground">
                {a.job_id && `Auftrag ${a.job_id}`}
                {a.job_id && a.antwort_sha256 && ' · '}
                {a.antwort_sha256 && `Antwort sha256 ${a.antwort_sha256}`}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
