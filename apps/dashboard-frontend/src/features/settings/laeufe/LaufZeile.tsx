/**
 * Eine Zeile der Läufe: ein Klick klappt den Lauf auf (mehrere zugleich), der
 * Link daneben öffnet genau diesen einen Lauf unter seiner eigenen Adresse.
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, Link2 } from 'lucide-react';
import { cn } from '@marken';
import { formatDate } from '@/utils/formatting';
import { LaufZustand, ausloeserText } from '../apps/LaufAnsicht';
import type { AppLauf } from '../apps/useAppVerwaltung';
import { LaufAktionen } from './LaufAktionen';
import { LaufInhalt } from './LaufInhalt';
import { personText } from './personText';

function laufAdresse(id: number, filter: string): string {
  return `/workspace/verwaltung/laeufe/${id}${filter ? `?${filter}` : ''}`;
}

export function LaufZeile({
  lauf,
  appName,
  filter,
  onOeffnen,
}: {
  lauf: AppLauf;
  appName: string;
  /** Die Abfrage der Liste, damit „Zurück" dieselbe Auswahl findet. */
  filter: string;
  onOeffnen: (id: number) => void;
}) {
  const [offen, setOffen] = useState(false);
  const person = personText(lauf);
  const schlecht = lauf.status === 'fehler' || lauf.status === 'nicht_uebergeben';
  return (
    <li
      className="border-b border-border last:border-b-0"
      data-testid={`lauf-zeile-${lauf.id}`}
      data-lauf-status={lauf.status}
    >
      <div className="flex items-center">
        <button
          type="button"
          aria-expanded={offen}
          onClick={() => setOffen(o => !o)}
          data-testid={`lauf-aufklappen-${lauf.id}`}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 p-ui-3 text-left transition-colors duration-120 hover:bg-accent/40 motion-reduce:transition-none"
        >
          {offen ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="font-mono text-xs text-muted-foreground">#{lauf.id}</span>
          <span className={cn('text-sm text-foreground', schlecht ? 'font-medium' : '')}>
            {lauf.flow_name}
          </span>
          <LaufZustand status={lauf.status} />
          <span className="text-xs text-muted-foreground" data-testid={`lauf-app-${lauf.id}`}>
            {appName}
            {lauf.stand === 'test' ? ' (Test)' : ''}
          </span>
          <span className="text-xs text-muted-foreground" data-testid={`lauf-wer-${lauf.id}`}>
            {lauf.ausloeser === 'hand' || !lauf.ausloeser
              ? (person ?? 'ohne Person')
              : ausloeserText(lauf, person)}
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            {formatDate(lauf.created_at)}
          </span>
        </button>
        <a
          href={laufAdresse(lauf.id, filter)}
          onClick={e => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            onOeffnen(lauf.id);
          }}
          aria-label={`Lauf ${lauf.id} einzeln öffnen`}
          title="Diesen Lauf einzeln öffnen (Link)"
          data-testid={`lauf-link-${lauf.id}`}
          className="mr-2 shrink-0 rounded p-2 text-muted-foreground hover:bg-accent/40 hover:text-foreground"
        >
          <Link2 className="size-4" aria-hidden="true" />
        </a>
      </div>
      {lauf.error && !offen && (
        <p className="line-clamp-1 px-ui-3 pb-2 pl-10 text-xs text-destructive">{lauf.error}</p>
      )}
      {offen && (
        <div className="flex flex-col gap-3 px-ui-3 pb-ui-3 pl-10">
          <div className="flex flex-wrap items-center gap-2 empty:hidden">
            <LaufAktionen lauf={lauf} />
          </div>
          <LaufInhalt runId={lauf.id} />
        </div>
      )}
    </li>
  );
}
