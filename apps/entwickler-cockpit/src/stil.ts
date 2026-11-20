/**
 * Was das Cockpit selbst gestaltet, steht mit den Tokens der Bibliothek da
 * (`--ara-*` aus `marken.css`), nicht mit Tailwind-Klassen: die gibt es zur
 * Laufzeit nur, soweit die Bibliothek sie selbst benutzt (APPS.md). Drei
 * Größen, zwei Gewichte, Farben nur aus Tokens.
 */
import type { CSSProperties } from 'react';

export const spalte = (abstand = 3): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap: `var(--ara-abstand-${abstand})`,
});

export const zeile = (abstand = 2): CSSProperties => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: `var(--ara-abstand-${abstand})`,
});

/**
 * Die Fläche einer Ansicht. Oben 10 px: der Seitenkopf (28 px hoch) steht
 * damit auf derselben Linie wie die Kapsel des Rahmens (8 px vom Rand,
 * 32 px hoch), deren Platz er rechts freihält.
 */
export const inhalt: CSSProperties = {
  ...spalte(4),
  // Dieselben Ränder wie Verwaltung und Einstellungen (`Bereichsrahmen`).
  padding: '10px clamp(16px, 4vw, 24px) 24px',
  maxWidth: '64rem',
  width: '100%',
  boxSizing: 'border-box',
};

export const text: CSSProperties = { fontSize: 'var(--ara-groesse-sm)', margin: 0 };

export const leise: CSSProperties = {
  fontSize: 'var(--ara-groesse-xs)',
  color: 'var(--ara-text-leise)',
  margin: 0,
};

export const fest: CSSProperties = {
  fontFamily: 'var(--ara-schrift-fest)',
  fontSize: 'var(--ara-groesse-xs)',
  overflowWrap: 'anywhere',
};

export const titel: CSSProperties = {
  fontSize: 'var(--ara-groesse-lg)',
  fontWeight: 500,
  margin: 0,
};

export const fliesstext: CSSProperties = {
  ...text,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
};

export const rahmen: CSSProperties = {
  border: '1px solid var(--ara-kante)',
  borderRadius: 'var(--ara-rundung-sm)',
  padding: 'var(--ara-abstand-3)',
  background: 'var(--ara-flaeche-karte)',
};
