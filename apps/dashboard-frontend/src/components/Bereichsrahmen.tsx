import type { ReactNode } from 'react';
import {
  Seitenleiste,
  SidebarProvider,
  SidebarTrigger,
  useSchmalesFenster,
  type SeitenleistenGruppe,
} from '@marken';

interface BereichsrahmenProps {
  /** Der Titel oben in der Leiste: „Verwaltung", „Einstellungen". */
  titel: string;
  gruppen: readonly SeitenleistenGruppe[];
  /** `data-testid` der Navigation, für Tests und Abnahmen. */
  kennzeichen: string;
  children: ReactNode;
}

/**
 * Verwaltung und Einstellungen, gebaut wie eine App (M5, Karte
 * jet-rahmen-einheitlich, 07.10.2026): links die Seitenleiste aus `@marken`
 * mit Titel, Gruppen und Einträgen, daneben der gewählte Bereich. Es ist
 * DERSELBE Baustein, mit dem jede App ihre Leiste zeichnet; eine eigene Liste
 * hier sähe beim nächsten Stand der Bibliothek anders aus als die Apps.
 *
 * Unter 900 px ist die Leiste ein Blatt (`Sidebar`), und oben steht der
 * Knopf, der es öffnet, mit dem Titel daneben, wie in einer App.
 *
 * Der Bereich rollt in einem GEWÖHNLICHEN `div` und nicht in einer
 * `ScrollArea` (Phase D4, Fund der D3-Abnahme am Orin): Radix' Ansichtsfenster
 * legt um den Inhalt ein Element mit `display: table`, und eine Tabelle, die
 * breiter ist als die Spalte, machte damit den ganzen Rollbereich breiter.
 * Kein `SidebarInset` daneben: der ist ein `main`, und die Shell hat schon eins.
 */
export function Bereichsrahmen({ titel, gruppen, kennzeichen, children }: BereichsrahmenProps) {
  const schmal = useSchmalesFenster();
  return (
    <SidebarProvider eingebettet className="h-full">
      <Seitenleiste
        titel={titel}
        beschriftung={`Bereiche: ${titel}`}
        kennzeichen={kennzeichen}
        gruppen={gruppen}
      />
      <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col bg-background">
        {schmal && (
          <div className="flex h-ui-header shrink-0 items-center gap-2 border-b border-border px-2">
            <SidebarTrigger data-testid={`${kennzeichen}-oeffnen`} />
            <span className="truncate text-sm font-medium text-foreground">{titel}</span>
          </div>
        )}
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto animate-in fade-in">
          <div className="min-w-0 max-w-225 p-6 max-md:p-4">{children}</div>
        </div>
      </div>
    </SidebarProvider>
  );
}
