/**
 * ArgumentHints — der graue Argument-Hinweis hinter dem Befehl (Plan 011, Schritt 14).
 *
 * Eine Textarea kann Text nicht teils schwarz, teils grau zeigen. Deshalb liegt
 * über der Textarea eine deckungsgleiche „Spiegel"-Ebene: Sie zeichnet den
 * bereits getippten Text UNSICHTBAR (nur um exakt denselben Platz einzunehmen)
 * und hängt den grauen Hinweis genau dahinter an. Die Ebene fängt keine Klicks
 * ab — getippt und geklickt wird weiter in der echten Textarea darunter.
 *
 * Damit der graue Text an der richtigen Stelle sitzt, MÜSSEN Schriftgröße,
 * Zeilenhöhe, Innenabstand und Umbruchverhalten mit der Textarea übereinstimmen
 * (siehe die geteilten Klassen).
 */

/** Die Typografie/Abstände, die Textarea UND Spiegel teilen MÜSSEN. */
export const COMPOSER_TEXT_CLASSES =
  'px-2.5 py-2 text-[13px] leading-relaxed whitespace-pre-wrap break-words';

interface ArgumentHintsProps {
  /** Der aktuelle Feldwert (wird unsichtbar gespiegelt). */
  value: string;
  /** Der graue Hinweis, der hinter dem Wert erscheint. */
  ghost: string;
}

export default function ArgumentHints({ value, ghost }: ArgumentHintsProps) {
  if (!ghost) return null;
  return (
    <div
      aria-hidden="true"
      data-testid="argument-hints"
      className={`pointer-events-none absolute inset-0 max-h-40 overflow-hidden ${COMPOSER_TEXT_CLASSES}`}
    >
      {/* Unsichtbar, nur als Platzhalter fuer die exakte Breite des Getippten. */}
      <span className="invisible">{value}</span>
      <span className="text-muted-foreground">{ghost}</span>
    </div>
  );
}
