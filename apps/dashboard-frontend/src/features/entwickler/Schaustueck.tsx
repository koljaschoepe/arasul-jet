/**
 * Ein Schaustück: der Name eines Primitivs, und darunter seine Zustände.
 *
 * Die Schauseite besteht aus sechsundzwanzig davon. Sie liegt in der Shell
 * und nicht in der Bibliothek, weil sie eine SEITE ist: sie braucht eine
 * Route, eine Sitzung und den Rahmen der Shell — und weil eine Bibliothek,
 * die ihre eigene Ausstellung mitliefert, in jeder App mit ausgeliefert
 * würde.
 *
 * `data-schaustueck` trägt den Namen: die Abnahme fährt die Liste ab und
 * fragt je Stück, ob es überhaupt dasteht. Ein Primitiv, das beim Rendern
 * wirft, ist sonst nur ein leerer Fleck auf einem Bild.
 */
import type { ReactNode } from 'react';

export function Schaustueck({
  name,
  satz,
  children,
}: {
  name: string;
  satz: string;
  children: ReactNode;
}) {
  return (
    <section
      data-schaustueck={name}
      className="flex flex-col gap-ui-2 border-b border-border py-ui-4 last:border-b-0"
    >
      <div className="flex flex-col gap-0.5">
        <h2 className="text-ui-lg font-semibold text-foreground">{name}</h2>
        <p className="text-ui-sm text-muted-foreground">{satz}</p>
      </div>
      {/* EIN EIGENER ROLLKASTEN JE SCHAUSTUECK (Phase H4).
          Seit H4 stehen hier auch Stuecke, die eine Breite mitbringen -- eine
          Tabelle, ein Kalender, ein Diagramm, eine Seitenleiste. Bei 390 px
          passt keines davon in die Spalte, und ohne diesen Kasten schoebe es
          die ganze SEITE breiter; die Abnahme fragt je Zelle danach und war
          am Orin schon einmal genau daran rot (1024 px, hell). Was breiter
          ist als die Seite, rollt jetzt in seinem eigenen Kasten -- dieselbe
          Entscheidung wie bei den Verwaltungstabellen seit D4.

          `relative` gehoert dazu: `overflow` klammert nur ab, was auch IN dem
          Kasten liegt, und ein absolut gesetztes Kind (ein `.sr-only` in
          einem Knopf) entkaeme sonst und zaehlte zur Rollbreite des
          Dokuments -- der Fund der G1-Abnahme, in G2 zur Regel geworden. */}
      <div className="relative flex flex-wrap items-start gap-ui-3 overflow-x-auto">{children}</div>
    </section>
  );
}

/**
 * Ein Zustand innerhalb eines Schaustücks: das Ding und darunter sein Name.
 *
 * Ohne den Namen ist eine Reihe grauer Knöpfe kein Beleg, sondern ein Bild —
 * beim Vergleich zweier Themes will man wissen, welcher davon `disabled` war.
 */
export function Zustand({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-h-9 flex-wrap items-center gap-2">{children}</div>
      <span className="font-mono text-ui-xs text-muted-foreground">{name}</span>
    </div>
  );
}
