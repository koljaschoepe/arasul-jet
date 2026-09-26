/**
 * Technische Angaben: was der Betreuer fragt und ein Administrator nicht
 * braucht (J35, 26.09.2026).
 *
 * JetPack, Bau und Versionskennung standen gleichrangig neben „Fassung" und
 * „Gerätename" -- für einen Administrator, der kein Entwickler ist, drei
 * Kacheln mit Wörtern, die er nicht kennt, und das Gerät wirkt unfertig. Am
 * Telefon mit dem Betreuer braucht er sie trotzdem; deshalb stehen sie hier,
 * zugeklappt und einen Klick entfernt.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger, cn } from '@marken';

export interface TechnischeAngabe {
  beschriftung: string;
  wert: string | null | undefined;
}

export function TechnischeAngaben({
  angaben,
  kennzeichen = 'technische-angaben',
}: {
  angaben: TechnischeAngabe[];
  kennzeichen?: string;
}) {
  const [offen, setOffen] = useState(false);
  return (
    <Collapsible open={offen} onOpenChange={setOffen} data-testid={kennzeichen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-2" data-testid={`${kennzeichen}-knopf`}>
          <ChevronDown
            className={cn('size-4 transition-transform', offen && 'rotate-180')}
            aria-hidden="true"
          />
          Technische Angaben
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {angaben.map(a => (
            <div key={a.beschriftung} className="contents">
              <dt className="text-muted-foreground">{a.beschriftung}</dt>
              <dd className="min-w-0 break-all font-mono text-foreground">{a.wert || '—'}</dd>
            </div>
          ))}
        </dl>
      </CollapsibleContent>
    </Collapsible>
  );
}
