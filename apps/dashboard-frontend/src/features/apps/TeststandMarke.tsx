import { Badge } from '@marken';

/**
 * Das Abzeichen an einer App, die als Teststand freigegeben ist.
 *
 * ES STEHT AN EINER STELLE, weil es an zwei Orten erscheint: in der
 * Sidebar-Spalte ab 900 px und im Hamburger-Menü darunter (D7). Bis H5 war es
 * zweimal geschrieben — dort ein `span` mit `bg-warning/15 text-warning` und
 * einem Satz im `title`, hier das nackte Wort „Test" ohne Erklärung. Zwei
 * Formen für eine Sache laufen auseinander, sobald eine von beiden angefasst
 * wird; und die zweite hat den Satz, auf den es ankommt, gar nicht getragen.
 *
 * `warning` und nicht `outline`: ein Teststand IST ein Zustand, und
 * Statusfarben gelten dort, wo ein Zustand gemeint ist (DESIGN.md,
 * Grundsatz). Was der Mensch hier tut, zählt nicht.
 */
export function TeststandMarke() {
  return (
    <Badge
      variant="warning"
      title="Teststand: diese Fassung ist noch nicht live. Was du hier tust, ist ein Test."
    >
      Test
    </Badge>
  );
}
