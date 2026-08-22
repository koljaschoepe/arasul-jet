/**
 * Dateien im Eingabefeld finden, mit `@` (Plan 023 E7).
 *
 * Der Slash öffnet Flows. Für Dateien gab es bisher nichts: wer eine Datei
 * meinen wollte, musste ihren Pfad kennen und tippen, oder sie aus dem
 * Explorer herüberziehen. Beides setzt voraus, dass man weiß, wo sie liegt.
 *
 * `@` sucht stattdessen nach dem Namen, quer durch die Ablage, und setzt den
 * gefundenen Pfad in den Text. Was danach dort steht, ist gewöhnlicher Text
 * für das Modell, kein Sonderzustand: der Agent liest den Pfad und benutzt
 * `dateien_lesen`. Genau deshalb bleibt hier auch nichts hängen, was beim
 * Absenden noch aufgelöst werden müsste.
 *
 * Der Such-Endpunkt ist ein anderer als der Baum: er hat ein eigenes, höheres
 * Besuchs-Budget und findet deshalb auch in tiefen Ordnern.
 */
import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';

/** Ab so vielen Zeichen wird gesucht. Darunter kämen zu viele Treffer. */
export const DATEI_SUCHE_AB = 1;
/** So viele Treffer zeigt das Menü. */
export const DATEI_SUCHE_MAX = 12;
/** Wartezeit nach dem letzten Tastendruck, bevor gesucht wird. */
const ENTPRELLUNG_MS = 180;

export interface DateiTreffer {
  pfad: string;
  name: string;
}

interface SuchAntwort {
  data: { eintraege: Array<{ pfad: string; name: string; typ: string }>; gekuerzt?: boolean };
}

/**
 * Liest das `@`-Fragment aus dem Eingabetext.
 *
 * Nur am Wortanfang, damit eine Mailadresse in einer Frage nicht das Menü
 * öffnet. Und nur bis zum nächsten Leerzeichen, denn ein Dateiname ohne
 * Leerzeichen ist der Normalfall und alles andere macht das Menü unlesbar.
 *
 * @returns das Fragment ohne `@`, oder null
 */
export function dateiFragment(text: string, cursor: number): string | null {
  const bisCursor = String(text ?? '').slice(0, cursor);
  const treffer = bisCursor.match(/(?:^|\s)@([^\s@]*)$/);
  return treffer ? (treffer[1] ?? '') : null;
}

/**
 * Ersetzt das `@`-Fragment durch den Pfad.
 *
 * Gibt Text UND neue Cursor-Position zurück: ohne die zweite steht der Cursor
 * nach dem Einsetzen am Ende der Zeile statt hinter dem eingesetzten Pfad, und
 * wer weiterschreibt, schreibt an der falschen Stelle.
 */
export function setzePfadEin(
  text: string,
  cursor: number,
  pfad: string
): { text: string; cursor: number } {
  const vorne = String(text ?? '').slice(0, cursor);
  const hinten = String(text ?? '').slice(cursor);
  const treffer = vorne.match(/(?:^|\s)@([^\s@]*)$/);
  if (!treffer) {
    return { text: String(text ?? ''), cursor };
  }
  const start = vorne.length - (treffer[1] ?? '').length - 1;
  const neuVorne = `${vorne.slice(0, start)}${pfad} `;
  return { text: neuVorne + hinten, cursor: neuVorne.length };
}

export function DateiMenue({
  projectId,
  fragment,
  activeIndex,
  onTreffer,
  onPick,
  onHover,
}: {
  projectId: string;
  /** Das getippte Fragment hinter dem `@`. */
  fragment: string;
  activeIndex: number;
  /** Meldet die aktuelle Trefferliste nach oben, damit die Tastatur sie kennt. */
  onTreffer: (treffer: DateiTreffer[]) => void;
  onPick: (treffer: DateiTreffer) => void;
  onHover: (index: number) => void;
}) {
  const api = useApi();
  const [treffer, setTreffer] = useState<DateiTreffer[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const aktivRef = useRef<HTMLDivElement | null>(null);
  const meldeRef = useRef(onTreffer);
  meldeRef.current = onTreffer;

  useEffect(() => {
    let abgemeldet = false;
    // Entprellt: jeder Tastendruck sonst eine Anfrage an ein Geraet, das
    // nebenher ein Modell rechnet.
    const uhr = setTimeout(async () => {
      setLaeuft(true);
      try {
        const res = await api.get<SuchAntwort>(
          `/projects/${projectId}/dateien/suche?q=${encodeURIComponent(fragment)}`,
          { showError: false }
        );
        if (abgemeldet) {
          return;
        }
        const gefunden = (res.data?.eintraege ?? [])
          .filter(e => e.typ === 'datei')
          .slice(0, DATEI_SUCHE_MAX)
          .map(e => ({ pfad: e.pfad, name: e.name }));
        setTreffer(gefunden);
        meldeRef.current(gefunden);
      } catch {
        if (!abgemeldet) {
          setTreffer([]);
          meldeRef.current([]);
        }
      } finally {
        if (!abgemeldet) {
          setLaeuft(false);
        }
      }
    }, ENTPRELLUNG_MS);
    return () => {
      abgemeldet = true;
      clearTimeout(uhr);
    };
  }, [api, projectId, fragment]);

  useEffect(() => {
    aktivRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <div
      className="absolute bottom-full left-0 z-20 mb-1 max-h-64 w-80 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md"
      data-testid="datei-menue"
      role="listbox"
      aria-label="Dateien"
    >
      {laeuft && treffer.length === 0 && (
        <div className="flex items-center gap-2 px-2 py-1.5 text-ui-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Suche …
        </div>
      )}
      {!laeuft && treffer.length === 0 && (
        <div
          className="px-2 py-1.5 text-ui-xs text-muted-foreground"
          data-testid="datei-menue-leer"
        >
          Keine Datei gefunden.
        </div>
      )}
      {treffer.map((t, i) => {
        const aktiv = i === activeIndex;
        return (
          <div
            key={t.pfad}
            ref={aktiv ? aktivRef : undefined}
            role="option"
            aria-selected={aktiv}
            tabIndex={-1}
            data-testid="datei-menue-eintrag"
            onMouseMove={() => onHover(i)}
            // mousedown, damit der Textarea-Blur die Auswahl nicht abfaengt.
            onMouseDown={e => {
              e.preventDefault();
              onPick(t);
            }}
            className={cn(
              'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left',
              aktiv ? 'bg-accent' : 'hover:bg-accent/60'
            )}
          >
            <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-foreground">{t.name}</div>
              <div className="truncate text-ui-xs text-muted-foreground">{t.pfad}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default DateiMenue;
