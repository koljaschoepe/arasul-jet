/**
 * Reine Overflow-Rechnung für die Editor-Formatier-Leiste (Plan 009).
 *
 * Die Leiste muss STRIKT einzeilig bleiben: passt eine Gruppe nicht mehr in die
 * verfügbare Breite, wandert sie (und alle folgenden) hinter ein ⋯-Menü. Diese
 * Funktion ist bewusst DOM-frei, damit sie deterministisch testbar ist — die
 * gemessenen Gruppenbreiten kommen aus einem versteckten Mess-Lineal.
 *
 * @param containerWidth  verfügbare Innenbreite der Leiste (px)
 * @param groupWidths     gemessene Breite jeder Gruppe in Reihenfolge (px)
 * @param moreReserved    Platz, der fürs ⋯-Menü freigehalten wird (px)
 * @param gap             Abstand zwischen Gruppen (px)
 * @returns Anzahl der Gruppen, die inline gezeigt werden (Rest → ⋯-Menü)
 */
export function computeInlineCount(
  containerWidth: number,
  groupWidths: number[],
  moreReserved: number,
  gap = 6
): number {
  const n = groupWidths.length;
  if (n === 0) return 0;
  if (containerWidth <= 0) return n; // noch nicht gemessen → optimistisch alle

  // Passt alles ohne ⋯? Dann kein Menü, alle inline.
  const fullSum = groupWidths.reduce((a, b) => a + b, 0) + gap * (n - 1);
  if (fullSum <= containerWidth) return n;

  // Sonst ⋯-Platz reservieren und gierig auffüllen.
  let used = moreReserved;
  let count = 0;
  for (const w of groupWidths) {
    const next = used + w + (count > 0 ? gap : 0);
    if (next > containerWidth) break;
    used = next;
    count += 1;
  }
  // Mindestens die erste Gruppe inline lassen (sonst wirkt die Leiste leer);
  // sie darf notfalls clippen (overflow:hidden), nie umbrechen.
  return Math.max(count, 1);
}
