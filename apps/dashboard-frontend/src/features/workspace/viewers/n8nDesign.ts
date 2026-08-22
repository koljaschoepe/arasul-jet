/**
 * n8n im Arasul-Design (Plan 023 H4).
 *
 * Das eingebettete n8n war vollständig hell und orange mitten in einer
 * schwarzen, blauen Oberfläche. Im Rundgang war das der auffälligste Bruch.
 *
 * n8n läuft als same-origin-iframe unter `/n8n/`, sein Dokument ist also
 * erreichbar. Zwei Hebel reichen, beide am 22.08.2026 aus der laufenden
 * Fassung gelesen (n8n 2.29.10 auf dem Orin,
 * `n8n-editor-ui/dist/assets/*.css` und `*.js`):
 *
 *   Akzent   `--color--primary--h/s/l` auf `:root`, in HSL-Teilen.
 *            Alles Weitere leitet n8n daraus ab.
 *   Thema    `document.body[data-theme]` im n8n-Dokument, gespeichert unter
 *            dem localStorage-Schlüssel `N8N_THEME`.
 *
 * Dazu die Orange-Leiter `--color--orange-50` bis `-950`. Sie hängt nicht am
 * Akzent und bliebe sonst stehen. Ersetzt wird nur der Farbton, die Helligkeit
 * jeder Stufe bleibt — sonst kippen die Kontraste, die n8n damit baut.
 *
 * Die Regeln stehen hier und nicht im Tab, weil sich Farbrechnung prüfen lässt
 * und ein iframe nicht.
 */

/** Ein Farbton in HSL, wie n8n ihn erwartet. */
export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/**
 * Helligkeit der n8n-Orange-Leiter, am 22.08.2026 aus n8n 2.29.10 gelesen.
 *
 * Quelle: `--color--orange-<stufe>` in
 * `n8n-editor-ui/dist/assets/*.css`. Die Werte sind die L-Anteile der dort
 * stehenden Hex-Farben, gerundet. Wird n8n aktualisiert und ändert die Leiter,
 * ist hier nachzuziehen; falsch wären dann die Abstände, nicht die Farbe.
 */
export const ORANGE_STUFEN: Record<string, number> = {
  '50': 96,
  '100': 92,
  '150': 92,
  '200': 83,
  '250': 83,
  '300': 71,
  '400': 51,
  '500': 50,
  '600': 48,
  '700': 40,
  '800': 31,
  '900': 27,
  '950': 14,
};

/** Ist der Wert eine sechsstellige Hex-Farbe (mit oder ohne Raute)? */
function alsHex(wert: string): string | null {
  const roh = wert.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(roh)) return roh;
  if (/^[0-9a-fA-F]{3}$/.test(roh)) {
    return roh
      .split('')
      .map(z => z + z)
      .join('');
  }
  return null;
}

/**
 * Eine Farbe nach HSL umrechnen.
 *
 * Nimmt Hex (`#2D8FD9`, `#abc`) und `rgb(45, 143, 217)`. Beides kommt
 * vor: `getComputedStyle` liefert je nach Browser das eine oder das andere.
 *
 * @returns null, wenn sich nichts erkennen lässt — der Aufrufer lässt n8n dann
 *   in Ruhe, statt es mit einer geratenen Farbe anzumalen.
 */
export function zuHsl(wert: string): Hsl | null {
  let r: number;
  let g: number;
  let b: number;

  const hex = alsHex(wert);
  if (hex) {
    r = parseInt(hex.slice(0, 2), 16) / 255;
    g = parseInt(hex.slice(2, 4), 16) / 255;
    b = parseInt(hex.slice(4, 6), 16) / 255;
  } else {
    const m = wert.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    if (!m || !m[1] || !m[2] || !m[3]) return null;
    r = Number(m[1]) / 255;
    g = Number(m[2]) / 255;
    b = Number(m[3]) / 255;
  }
  if (![r, g, b].every(v => Number.isFinite(v) && v >= 0 && v <= 1)) return null;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** Welches n8n-Thema passt zu einem Arasul-Thema? */
export function n8nThema(arasul: 'black' | 'dark' | 'light'): 'dark' | 'light' {
  return arasul === 'light' ? 'light' : 'dark';
}

/**
 * Das Stylesheet, das n8n den Arasul-Akzent gibt.
 *
 * `!important` überall: n8n setzt seine Werte auf `:root`, und diese Regel
 * kommt aus demselben Dokument. Ohne die Kennzeichnung entschiede die
 * Reihenfolge im `<head>`, und die hat n8n in der Hand, nicht wir.
 */
export function akzentStil(primaer: Hsl): string {
  const stufen = Object.entries(ORANGE_STUFEN)
    .map(
      ([stufe, l]) =>
        `  --color--orange-${stufe}: hsl(${primaer.h} ${primaer.s}% ${l}%) !important;`
    )
    .join('\n');
  return [
    ':root, body {',
    `  --color--primary--h: ${primaer.h} !important;`,
    `  --color--primary--s: ${primaer.s}% !important;`,
    `  --color--primary--l: ${primaer.l}% !important;`,
    stufen,
    '}',
  ].join('\n');
}

/** Kennzeichen des eingefügten Stylesheets, damit es nicht doppelt entsteht. */
export const STIL_ID = 'arasul-n8n-design';

/**
 * n8n an Arasul angleichen: Akzent und Thema in EINEM Dokument setzen.
 *
 * Idempotent — ein zweiter Aufruf ersetzt den Inhalt, statt ein zweites
 * Stylesheet anzuhängen. Das ist wichtig, weil der Tab bei jedem Themawechsel
 * und bei jedem Neuladen des iframes erneut angleicht.
 *
 * @param doc Dokument im iframe (same-origin, sonst gibt es hier gar nichts)
 * @param primaer Arasuls Akzentfarbe, oder null wenn nicht lesbar
 * @param thema 'dark' oder 'light'
 * @returns true, wenn etwas gesetzt wurde
 */
export function gleicheN8nAn(
  doc: Document | null | undefined,
  primaer: Hsl | null,
  thema: 'dark' | 'light'
): boolean {
  if (!doc?.head || !doc.body) {
    return false;
  }
  // Das Thema geht auch ohne lesbare Akzentfarbe — es ist der größere Bruch.
  doc.body.setAttribute('data-theme', thema);
  doc.documentElement.style.colorScheme = thema;
  try {
    // n8n merkt sich das Thema selbst; ohne diesen Schlüssel stellt es beim
    // nächsten Start wieder sein eigenes ein und flackert kurz hell auf.
    doc.defaultView?.localStorage?.setItem('N8N_THEME', thema);
  } catch {
    // Ein Browser, der Speicher im Rahmen verbietet. Das Thema steht trotzdem.
  }

  if (!primaer) {
    return true;
  }
  let stil = doc.getElementById(STIL_ID);
  if (!stil) {
    stil = doc.createElement('style');
    stil.id = STIL_ID;
    doc.head.appendChild(stil);
  }
  stil.textContent = akzentStil(primaer);
  return true;
}
