/**
 * Was der Agent an einer Datei geändert hat, im Chat aufklappbar (Plan 023 E4).
 *
 * Vorher zeigte der Chat eine Karte mit dem Dateinamen und einem Abzeichen
 * „Neu" oder „Geändert". Was drinsteht, sah man erst, wenn man die Datei in
 * einem eigenen Tab öffnete, und was sich geändert hat, gar nicht. Bei einem
 * Auftrag über drei Dateien heißt das dreimal Tab öffnen, dreimal suchen,
 * dreimal zurück.
 *
 * Der Diff wird ERST beim Aufklappen geholt. Ein Lauf, der zehn Dateien
 * anfasst, würde sonst zwanzig Abfragen auslösen, von denen niemand eine
 * angesehen hat, und zwar auf einem Gerät, das gerade ein Modell rechnet.
 *
 * Die Vorher-Fassung kommt aus dem Schnappschuss-Dienst, der seit Plan 022
 * jeden Schreibschritt sichert, Agent wie Editor. Gibt es keine (eine neue
 * Datei hat keine Vorgeschichte), ist der ganze Inhalt ein Zuwachs, und genau
 * so wird er gezeigt.
 */
import { useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { lineDiff, diffZusammenfassung } from '@/utils/lineDiff';
import type { DiffZeile } from '@/utils/lineDiff';

/** So viele Zeilen zeigt der Chat; der Rest steht im Editor-Tab. */
const MAX_ZEILEN = 200;

interface VersionsAntwort {
  data: { anzahl: number; vorherInhalt: string | null } | null;
}

interface InhaltAntwort {
  data: { inhalt: string | null; binaer?: boolean; zuGross?: boolean };
}

export function DateiDiff({
  projectId,
  pfad,
  neu,
}: {
  projectId: string;
  pfad: string;
  /** Eine neue Datei hat keine Vorgeschichte: alles ist Zuwachs. */
  neu: boolean;
}) {
  const api = useApi();
  const [offen, setOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [zeilen, setZeilen] = useState<DiffZeile[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const holen = async () => {
    setLaeuft(true);
    setFehler(null);
    try {
      const inhaltAntwort = await api.get<InhaltAntwort>(
        `/projects/${projectId}/dateien/inhalt?pfad=${encodeURIComponent(pfad)}`,
        { showError: false }
      );
      const jetzt = inhaltAntwort.data?.inhalt ?? '';
      if (inhaltAntwort.data?.binaer) {
        setFehler('Das ist keine Textdatei, ein Vergleich ergibt hier nichts.');
        return;
      }
      if (inhaltAntwort.data?.zuGross) {
        setFehler('Die Datei ist zu groß für einen Vergleich im Chat.');
        return;
      }
      let vorher = '';
      if (!neu) {
        const versionen = await api.get<VersionsAntwort>(
          `/projects/${projectId}/dateien/versionen?pfad=${encodeURIComponent(pfad)}`,
          { showError: false }
        );
        vorher = versionen.data?.vorherInhalt ?? '';
      }
      setZeilen(lineDiff(vorher, jetzt));
    } catch {
      // Der Chat soll nicht wegen eines Vergleichs rot werden. Eine Karte
      // ohne Diff ist immer noch eine Karte, die zur Datei führt.
      setFehler('Der Vergleich ließ sich nicht laden.');
    } finally {
      setLaeuft(false);
    }
  };

  const umschalten = () => {
    const naechster = !offen;
    setOffen(naechster);
    if (naechster && zeilen === null && !laeuft && !fehler) {
      void holen();
    }
  };

  const summe = zeilen ? diffZusammenfassung(zeilen) : null;
  const sichtbar = zeilen ? zeilen.slice(0, MAX_ZEILEN) : [];

  return (
    <div className="mt-1" data-testid="datei-diff">
      <button
        type="button"
        onClick={umschalten}
        className="flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-expanded={offen}
        data-testid="datei-diff-schalter"
      >
        <ChevronRight className={cn('size-3 transition-transform', offen && 'rotate-90')} />
        Änderungen
        {summe && (
          <span className="ml-1 tabular-nums">
            <span className="text-primary">+{summe.plus}</span>{' '}
            <span className="text-destructive">−{summe.minus}</span>
          </span>
        )}
        {laeuft && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
      </button>
      {offen && (
        <div className="mt-0.5">
          {fehler && (
            <p className="px-1 text-xs text-muted-foreground" data-testid="datei-diff-fehler">
              {fehler}
            </p>
          )}
          {zeilen && zeilen.length === 0 && (
            <p className="px-1 text-xs text-muted-foreground">
              Der Inhalt ist unverändert geblieben.
            </p>
          )}
          {zeilen && zeilen.length > 0 && (
            <div
              className="max-h-64 overflow-auto rounded border border-border bg-card font-mono text-[11px]"
              data-testid="datei-diff-zeilen"
            >
              {sichtbar.map((z, i) => (
                <div
                  key={i}
                  className={cn(
                    'whitespace-pre-wrap px-2 [overflow-wrap:anywhere]',
                    z.art === 'plus' && 'bg-primary/10 text-primary',
                    z.art === 'minus' && 'bg-destructive/10 text-destructive',
                    z.art === 'gleich' && 'text-muted-foreground/70'
                  )}
                >
                  <span className="select-none opacity-60">
                    {z.art === 'plus' ? '+ ' : z.art === 'minus' ? '− ' : '  '}
                  </span>
                  {z.text || ' '}
                </div>
              ))}
              {zeilen.length > MAX_ZEILEN && (
                <div className="px-2 py-1 text-muted-foreground/60">
                  … {zeilen.length - MAX_ZEILEN} weitere Zeilen, vollständig im Editor
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DateiDiff;
