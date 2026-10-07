import { useEffect, useState, type ComponentType } from 'react';
import { AppWindow } from 'lucide-react';

/**
 * Das Bild einer App: in der Aktivitätsleiste, in der Leiste unten und auf
 * der Kachel der Startseite (M5, Kontrakt 8).
 *
 * `symbol` aus `app.json` ist ein Kürzel aus 1 bis 3 Großbuchstaben oder
 * Ziffern (wird als Text gezeichnet) oder ein Lucide-Name wie `file-text`.
 *
 * OHNE SYMBOL STEHT EIN NEUTRALES BILD DA, kein Kürzel aus dem Namen (Karte
 * jet-gesicht-startseite, 07.10.2026). Zwei Buchstaben neben lauter Symbolen
 * sahen aus wie ein Fehler, und manche App bekommt nie ein Symbol, weil ihre
 * Quelle fehlt. Dasselbe Bild steht da, solange der Name noch lädt oder die
 * Shell ihn nicht kennt: ein Tippfehler kostet ein Bild, nie eine App. Ein
 * Kürzel, das die App selbst nennt, bleibt Text; das hat sie so gewählt.
 *
 * DER LUCIDE-SATZ KOMMT NACH, in einem eigenen Bündel und nur, wenn eine App
 * einen Namen nennt. Ein statischer Import aller Symbole läge in jeder Shell,
 * auch wenn keine App eines braucht. Der Pfad zeigt auf die Sammlung statt auf
 * `lucide-react`, damit das Bündel nicht in das der Shell fällt.
 */
type Symbolsatz = Record<string, ComponentType<{ className?: string }>>;

let satz: Promise<Symbolsatz> | null = null;
function ladeSatz(): Promise<Symbolsatz> {
  // @ts-expect-error — die Sammlung hat keine Typdatei
  satz ??= import('lucide-react/dist/esm/icons/index.js').then(m => m as Symbolsatz);
  return satz;
}

const KUERZEL = /^[A-Z0-9]{1,3}$/;

/** `file-text` → `FileText`, so heißt der Eintrag in der Sammlung. */
function symbolName(name: string): string {
  return name
    .split('-')
    .map(t => t.charAt(0).toUpperCase() + t.slice(1))
    .join('');
}

/**
 * @param klasse Größe des Bildes; die Leiste nimmt 18 px, die Kachel ihre
 *   eigene (das Quadrat der Karte setzt sie).
 */
export function AppSymbol({
  symbol,
  klasse = 'size-4.5',
}: {
  symbol?: string | null;
  klasse?: string;
}) {
  const istKuerzel = !!symbol && KUERZEL.test(symbol);
  const lucide = symbol && !istKuerzel ? symbol : null;
  const [Bild, setBild] = useState<ComponentType<{ className?: string }> | null>(null);

  useEffect(() => {
    if (!lucide) return;
    let weg = false;
    ladeSatz()
      .then(s => {
        const b = s[symbolName(lucide)];
        if (!weg && b) setBild(() => b);
      })
      .catch(() => {
        /* das neutrale Bild bleibt */
      });
    return () => {
      weg = true;
    };
  }, [lucide]);

  if (istKuerzel) {
    return (
      <span className="text-xs font-medium" aria-hidden="true" data-testid="app-kuerzel">
        {symbol}
      </span>
    );
  }
  if (lucide && Bild) {
    return <Bild className={klasse} />;
  }
  return <AppWindow className={klasse} aria-hidden="true" data-testid="app-symbol-neutral" />;
}
