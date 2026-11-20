import type { ReactNode } from 'react';
import {
  KopfVorne,
  Seitenleiste,
  SidebarProvider,
  SidebarTrigger,
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
 * Der Knopf der Seitenleiste sitzt im Seitenkopf jeder Seite (`KopfVorne`,
 * Bibliothek 5.9.0): am Rechner klappt er die Leiste ein und aus, unter
 * 900 px öffnet er sie als Blatt. Die eigene Zeile mit diesem einen Icon
 * über dem Kopf gibt es nicht mehr. Unten hält der Bereich am Handy den
 * Platz der schwebenden Leiste frei (`--ara-leiste-platz`).
 *
 * Der Bereich rollt in einem GEWÖHNLICHEN `div` und nicht in einer
 * `ScrollArea` (Phase D4, Fund der D3-Abnahme am Orin): Radix' Ansichtsfenster
 * legt um den Inhalt ein Element mit `display: table`, und eine Tabelle, die
 * breiter ist als die Spalte, machte damit den ganzen Rollbereich breiter.
 * Kein `SidebarInset` daneben: der ist ein `main`, und die Shell hat schon eins.
 */
export function Bereichsrahmen({ titel, gruppen, kennzeichen, children }: BereichsrahmenProps) {
  return (
    <SidebarProvider eingebettet className="h-full">
      <Seitenleiste
        titel={titel}
        beschriftung={`Bereiche: ${titel}`}
        kennzeichen={kennzeichen}
        gruppen={gruppen}
      />
      <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col bg-background">
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto animate-in fade-in">
          {/* Dieselben Ränder wie im Entwickler-Cockpit (`stil.ts`): oben
              10 px, seitlich 16 bis 24 px, höchstens 64rem breit. */}
          <div className="min-w-0 max-w-[64rem] px-[clamp(16px,4vw,24px)] pt-[10px] pb-[calc(24px+var(--ara-leiste-platz,0px))]">
            <KopfVorne knopf={<SidebarTrigger data-testid={`${kennzeichen}-oeffnen`} />}>
              {children}
            </KopfVorne>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
