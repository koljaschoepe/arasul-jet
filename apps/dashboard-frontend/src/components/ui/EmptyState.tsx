/**
 * EmptyState — was an der Stelle einer leeren Liste steht.
 *
 * Bestehender Baustein mit fünf Verwendern, in C1 geschärft statt neu gebaut.
 * Drei Änderungen, alle gemessen an dem, was die fünf Aufrufer tatsächlich
 * übergeben:
 *
 * 1. `title` ist Pflicht. Alle fünf setzen ihn ohnehin, und ohne Satz ist ein
 *    Leerzustand nur ein leerer Kasten mit einem Symbol darin.
 * 2. Die Umhüllung des Symbols trug `text-5xl`. Auf ein SVG mit eigener
 *    Größenklasse wirkt das nicht, und das voreingestellte `size-12` fiel
 *    dadurch doppelt so groß aus wie die `size-6` der Aufrufer. Jetzt setzt
 *    der Baustein die Größe, nicht der Aufrufer.
 * 3. `opacity-50` auf bereits gedämpftem Grau ergab knapp lesbaren Kontrast.
 *
 * Der `action`-Einstieg ist der Zweck des Bausteins, nicht ein Zusatz: eine
 * leere Liste soll sagen, wie sie sich füllt.
 */

import { type ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  /** Symbol, in `size-6` gesetzt. Ohne Angabe ein Posteingang. */
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  /** Der Einstieg: ein Knopf oder Link, der die Liste füllt. */
  action?: ReactNode;
}

function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      className="mx-auto flex max-w-96 flex-col items-center justify-center p-8 text-center"
      role="status"
    >
      <div className="mb-3 text-muted-foreground [&>svg]:size-6" aria-hidden="true">
        {icon || <Inbox />}
      </div>
      <div className="text-base font-semibold text-foreground">{title}</div>
      {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;
