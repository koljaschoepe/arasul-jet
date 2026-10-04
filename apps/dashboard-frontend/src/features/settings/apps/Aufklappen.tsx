/**
 * Aufklappen auf der Seite einer App (M5): „lange Inhalte klappen auf",
 * „Technik nur aufgeklappt". Zwei Formen, beide auf `Collapsible` aus
 * `@marken`; der Inhalt ist erst gemountet, wenn er offen ist — die Läufe,
 * Modellaufrufe und das Protokoll fragen das Gerät erst, wenn jemand sie sehen
 * will.
 */
import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Feldgruppe,
  cn,
} from '@marken';

/** Ein Knopf mit Pfeil und darunter, was er aufklappt. */
export function Aufklappen({
  titel,
  kennzeichen,
  children,
}: {
  titel: ReactNode;
  kennzeichen: string;
  children: ReactNode;
}) {
  const [offen, setOffen] = useState(false);
  return (
    <Collapsible open={offen} onOpenChange={setOffen} data-testid={kennzeichen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground"
          data-testid={`${kennzeichen}-knopf`}
          aria-expanded={offen}
        >
          <ChevronDown
            className={cn(
              'size-4 transition-transform duration-150 motion-reduce:transition-none',
              offen && 'rotate-180'
            )}
            aria-hidden="true"
          />
          {titel}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>{offen && <div className="mt-1">{children}</div>}</CollapsibleContent>
    </Collapsible>
  );
}

/** Ein Block der Seite, dessen Inhalt erst auf „Zeigen" kommt. */
export function KlappGruppe({
  titel,
  symbol,
  beschreibung,
  kennzeichen,
  children,
}: {
  titel: string;
  symbol: ReactNode;
  beschreibung: string;
  kennzeichen: string;
  children: ReactNode;
}) {
  const [offen, setOffen] = useState(false);
  return (
    <Feldgruppe
      titel={titel}
      symbol={symbol}
      beschreibung={beschreibung}
      aktion={
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOffen(o => !o)}
          aria-expanded={offen}
          data-testid={`${kennzeichen}-schalter`}
        >
          {offen ? 'Zuklappen' : 'Zeigen'}
        </Button>
      }
    >
      {offen ? children : null}
    </Feldgruppe>
  );
}
