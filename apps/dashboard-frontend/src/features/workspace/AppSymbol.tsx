import { useEffect, useState, type ComponentType } from 'react';

/**
 * Das Bild einer App in der Aktivitätsleiste (M5, Kontrakt 8).
 *
 * `symbol` aus `app.json` ist ein Kürzel aus 1 bis 3 Großbuchstaben oder
 * Ziffern (wird als Text gezeichnet) oder ein Lucide-Name wie `file-text`.
 * Ohne Symbol — und solange der Name noch lädt oder die Shell ihn nicht kennt —
 * steht das Kürzel aus dem Namen der App da: ein Tippfehler kostet ein Bild,
 * nie eine App.
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

export function AppSymbol({ symbol, kuerzel }: { symbol?: string | null; kuerzel: string }) {
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
        /* das Kürzel bleibt */
      });
    return () => {
      weg = true;
    };
  }, [lucide]);

  if (lucide && Bild) {
    return <Bild className="size-4.5" />;
  }
  return (
    <span className="text-ui-xs font-medium" aria-hidden="true" data-testid="app-kuerzel">
      {istKuerzel ? symbol : kuerzel}
    </span>
  );
}

/**
 * Das Kürzel einer App, wenn `app.json` kein Symbol nennt: die Anfänge von zwei
 * Wörtern, sonst die ersten zwei Buchstaben.
 */
export function appKuerzel(name: string): string {
  const woerter = name.trim().split(/\s+/).filter(Boolean);
  if (woerter.length >= 2) {
    return `${woerter[0]?.charAt(0) ?? ''}${woerter[1]?.charAt(0) ?? ''}`.toUpperCase();
  }
  const wort = woerter[0] ?? '?';
  return wort.charAt(0).toUpperCase() + wort.charAt(1).toLowerCase();
}
