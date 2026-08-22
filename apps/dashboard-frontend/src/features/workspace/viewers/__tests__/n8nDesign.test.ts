/**
 * Plan 023 H4: n8n folgt dem Arasul-Design.
 *
 * Die beiden Hebel sind am 22.08.2026 aus der laufenden Fassung gelesen
 * (n8n 2.29.10 auf dem Orin): der Akzent hängt an `--color--primary--h/s/l`,
 * das Thema an `body[data-theme]` und dem Schlüssel `N8N_THEME`.
 *
 * Geprüft wird die Farbrechnung und was im Dokument landet. Der iframe selbst
 * ist nicht prüfbar; er ist auch nicht die Stelle, an der etwas schiefgeht.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { zuHsl, n8nThema, akzentStil, gleicheN8nAn, ORANGE_STUFEN, STIL_ID } from '../n8nDesign';

describe('zuHsl', () => {
  it('rechnet Arasuls Akzent im schwarzen Thema um', () => {
    // #81A1C1 aus index.css, Zeile mit --primary im :root-Block.
    expect(zuHsl('#81A1C1')).toEqual({ h: 210, s: 34, l: 63 });
  });

  it('rechnet Arasuls Akzent im hellen Thema um', () => {
    expect(zuHsl('#2D8FD9')).toEqual({ h: 206, s: 69, l: 51 });
  });

  it('nimmt auch rgb(), weil getComputedStyle das liefern kann', () => {
    expect(zuHsl('rgb(45, 143, 217)')).toEqual({ h: 206, s: 69, l: 51 });
    expect(zuHsl('rgba(45, 143, 217, 0.5)')).toEqual({ h: 206, s: 69, l: 51 });
  });

  it('nimmt die Kurzform und Weiß und Schwarz', () => {
    expect(zuHsl('#fff')).toEqual({ h: 0, s: 0, l: 100 });
    expect(zuHsl('#000')).toEqual({ h: 0, s: 0, l: 0 });
  });

  it('gibt bei Unlesbarem null zurueck, statt zu raten', () => {
    // Lieber n8n in Ruhe lassen als es mit einer geratenen Farbe anmalen.
    expect(zuHsl('')).toBeNull();
    expect(zuHsl('var(--irgendwas)')).toBeNull();
    expect(zuHsl('#12345')).toBeNull();
  });
});

describe('n8nThema', () => {
  it('bildet Arasuls drei Themen auf n8ns zwei ab', () => {
    expect(n8nThema('black')).toBe('dark');
    expect(n8nThema('dark')).toBe('dark');
    expect(n8nThema('light')).toBe('light');
  });
});

describe('akzentStil', () => {
  const blau = { h: 210, s: 34, l: 63 };

  it('setzt die drei Teile, aus denen n8n alles ableitet', () => {
    const css = akzentStil(blau);
    expect(css).toContain('--color--primary--h: 210 !important');
    expect(css).toContain('--color--primary--s: 34% !important');
    expect(css).toContain('--color--primary--l: 63% !important');
  });

  it('ersetzt die ganze Orange-Leiter, die nicht am Akzent haengt', () => {
    const css = akzentStil(blau);
    for (const stufe of Object.keys(ORANGE_STUFEN)) {
      expect(css).toContain(`--color--orange-${stufe}: hsl(210 34%`);
    }
  });

  it('behaelt die Helligkeit jeder Stufe', () => {
    // Sonst kippen die Kontraste, die n8n mit der Leiter baut.
    const css = akzentStil(blau);
    expect(css).toContain('--color--orange-50: hsl(210 34% 96%)');
    expect(css).toContain('--color--orange-950: hsl(210 34% 14%)');
  });

  it('traegt ueberall !important', () => {
    // n8n setzt seine Werte auf :root im selben Dokument; ohne die
    // Kennzeichnung entschiede die Reihenfolge im head, und die hat n8n.
    const zeilen = akzentStil(blau)
      .split('\n')
      .filter(z => z.includes('--color'));
    expect(zeilen.every(z => z.includes('!important'))).toBe(true);
  });
});

describe('gleicheN8nAn', () => {
  let doc: Document;

  beforeEach(() => {
    doc = document.implementation.createHTMLDocument('n8n');
  });

  it('setzt Thema und Akzent', () => {
    expect(gleicheN8nAn(doc, { h: 210, s: 34, l: 63 }, 'dark')).toBe(true);
    expect(doc.body.getAttribute('data-theme')).toBe('dark');
    expect(doc.getElementById(STIL_ID)?.textContent).toContain('--color--primary--h: 210');
  });

  it('setzt beim zweiten Mal kein zweites Stylesheet', () => {
    gleicheN8nAn(doc, { h: 210, s: 34, l: 63 }, 'dark');
    gleicheN8nAn(doc, { h: 206, s: 69, l: 51 }, 'light');
    expect(doc.querySelectorAll(`#${STIL_ID}`)).toHaveLength(1);
    expect(doc.getElementById(STIL_ID)?.textContent).toContain('--color--primary--h: 206');
    expect(doc.body.getAttribute('data-theme')).toBe('light');
  });

  it('setzt das Thema auch ohne lesbare Akzentfarbe', () => {
    // Das Thema ist der groessere Bruch; es an einer nicht lesbaren Farbe
    // scheitern zu lassen waere die schlechtere Wahl.
    expect(gleicheN8nAn(doc, null, 'dark')).toBe(true);
    expect(doc.body.getAttribute('data-theme')).toBe('dark');
    expect(doc.getElementById(STIL_ID)).toBeNull();
  });

  it('tut ohne Dokument nichts und wirft nicht', () => {
    // Der iframe ist beim ersten Zeichnen noch leer.
    expect(gleicheN8nAn(null, null, 'dark')).toBe(false);
    expect(gleicheN8nAn(undefined, null, 'dark')).toBe(false);
  });
});
