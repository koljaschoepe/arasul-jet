/**
 * Kompakter zeilenweiser Diff (Plan 022) für die Diff-/Undo-Leiste im Editor.
 * LCS-basiert; auf eine Zeilenobergrenze gedeckelt, damit ein Riesen-Diff die
 * UI nicht blockiert.
 */

export type DiffZeile = { art: 'gleich' | 'plus' | 'minus'; text: string };

const MAX_ZEILEN = 4000;

/**
 * Berechnet den Zeilen-Diff von `alt` → `neu`. Über der Zeilenobergrenze wird
 * nicht Zeile für Zeile verglichen (zu teuer) — dann liefert die Funktion einen
 * groben „alles ersetzt"-Diff.
 */
export function lineDiff(alt: string, neu: string): DiffZeile[] {
  const a = alt.split('\n');
  const b = neu.split('\n');
  if (a.length > MAX_ZEILEN || b.length > MAX_ZEILEN) {
    return [
      ...a.map(text => ({ art: 'minus' as const, text })),
      ...b.map(text => ({ art: 'plus' as const, text })),
    ];
  }

  // LCS-Längentabelle (dynamische Programmierung).
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const out: DiffZeile[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ art: 'gleich', text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ art: 'minus', text: a[i]! });
      i++;
    } else {
      out.push({ art: 'plus', text: b[j]! });
      j++;
    }
  }
  while (i < n) {
    out.push({ art: 'minus', text: a[i]! });
    i++;
  }
  while (j < m) {
    out.push({ art: 'plus', text: b[j]! });
    j++;
  }
  return out;
}

/** Zählt geänderte Zeilen (+/−) im Diff. */
export function diffZusammenfassung(zeilen: DiffZeile[]): { plus: number; minus: number } {
  let plus = 0;
  let minus = 0;
  for (const z of zeilen) {
    if (z.art === 'plus') plus++;
    else if (z.art === 'minus') minus++;
  }
  return { plus, minus };
}
