/**
 * Die Quellen unter einer Antwort (Plan 023 E8).
 *
 * Zwei Fälle, und der zweite ist der, um den es eigentlich geht:
 *
 *   gefunden   Datei und Stelle, klickbar. Die Stelle ist der Ausschnitt, auf
 *              den sich die Antwort stützt; ohne ihn stünde nur ein Dateiname
 *              da, und der Nutzer müsste die Datei öffnen, um zu sehen, worauf.
 *   nichts     ein Satz, der sagt, dass gesucht und nichts gefunden wurde, mit
 *              dem Suchbegriff. Vorher fehlte er, und eine Antwort ohne Quelle
 *              sah aus wie eine Antwort, bei der niemand nachgesehen hat.
 *
 * Hat der Lauf gar nicht in Dokumenten gesucht, steht hier nichts. Ein „keine
 * Quellen" unter jeder Plauderei wäre Lärm.
 */
import { useState } from 'react';
import { ChevronRight, FileSearch, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { Quellenlage } from './quellen';

export function Quellenzeile({
  lage,
  projectId,
}: {
  lage: Quellenlage;
  /** Ohne Projekt sind die Pfade nicht anklickbar, aber weiter lesbar. */
  projectId?: string | null;
}) {
  const [offen, setOffen] = useState(false);
  const openTab = useWorkspaceStore(s => s.openTab);

  if (!lage.gesucht) {
    return null;
  }

  if (lage.quellen.length === 0) {
    return (
      <p
        className="mt-1 flex items-start gap-1.5 px-1 text-xs text-muted-foreground"
        data-testid="quellen-leer"
      >
        <FileSearch className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
        <span>
          In deinen Dokumenten wurde nichts Passendes gefunden
          {lage.ohneTreffer.length > 0 && (
            <> (gesucht nach {lage.ohneTreffer.map(b => `„${b}"`).join(', ')})</>
          )}
          . Die Antwort stützt sich auf das Modellwissen.
        </span>
      </p>
    );
  }

  return (
    <div className="mt-1" data-testid="quellen">
      <button
        type="button"
        onClick={() => setOffen(o => !o)}
        className="flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-expanded={offen}
        data-testid="quellen-schalter"
      >
        <ChevronRight className={cn('size-3 transition-transform', offen && 'rotate-90')} />
        {lage.quellen.length} {lage.quellen.length === 1 ? 'Quelle' : 'Quellen'}
      </button>
      {offen && (
        <ul className="mt-0.5 flex flex-col gap-0.5 pl-5" data-testid="quellen-liste">
          {lage.quellen.map(q => (
            <li key={q.datei}>
              <button
                type="button"
                disabled={!projectId}
                onClick={() =>
                  projectId &&
                  openTab({
                    type: 'projektdatei',
                    projectId,
                    filePath: q.datei,
                    title: q.datei.split('/').pop() || q.datei,
                  })
                }
                className={cn(
                  'flex w-full items-start gap-1.5 rounded px-1 py-0.5 text-left text-xs',
                  projectId ? 'hover:bg-accent hover:text-foreground' : 'cursor-default'
                )}
              >
                <FileText className="mt-0.5 size-3 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">{q.datei}</span>
                  {q.stelle && (
                    <span className="block text-muted-foreground [overflow-wrap:anywhere]">
                      {q.stelle}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Quellenzeile;
