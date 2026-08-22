/**
 * Plan 023 G2: Projekt aus einem Ordner oder aus GitHub.
 *
 * Geprüft wird der Teil, an dem ein Ordnerimport still falsch wird: die
 * Ableitung des Zielordners aus `webkitRelativePath`. Landet dort ein Segment
 * zu viel, liegt der ganze Import eine Ebene zu tief, und das fällt erst auf,
 * wenn jemand im Dateibaum nachsieht.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  zielOrdner,
  nimmMit,
  ordnerDateien,
  ordnerName,
  ordnerHochladen,
  repoName,
} from '../projektImport';

/** Eine Datei mit `webkitRelativePath`, wie der Browser sie liefert. */
function datei(rel: string): File {
  const teile = rel.split('/');
  const f = new File(['x'], teile[teile.length - 1] ?? 'x');
  Object.defineProperty(f, 'webkitRelativePath', { value: rel });
  return f;
}

describe('zielOrdner (Plan 023 G2)', () => {
  it('laesst das erste Segment weg, es ist das Projekt selbst', () => {
    // Wer `Projekte/kunde-a` waehlt, bekommt `kunde-a/vertraege/2026.pdf`.
    // Das Ziel ist `vertraege`, nicht `kunde-a/vertraege`.
    expect(zielOrdner('kunde-a/vertraege/2026.pdf')).toBe('vertraege');
  });

  it('legt eine Datei aus der obersten Ebene in die Wurzel', () => {
    expect(zielOrdner('kunde-a/liesmich.md')).toBe('');
  });

  it('haelt tiefe Verschachtelung durch', () => {
    expect(zielOrdner('p/a/b/c/d.txt')).toBe('a/b/c');
  });

  it('kommt mit einem Dateinamen ohne Ordner zurecht', () => {
    expect(zielOrdner('einzeln.md')).toBe('');
  });

  it('ignoriert leere Segmente', () => {
    expect(zielOrdner('p//a//d.txt')).toBe('a');
  });
});

describe('nimmMit', () => {
  it('laesst .git draussen', () => {
    // Sonst laege eine halbe Git-Verwaltung im Projektordner, und der Sync
    // faende dort spaeter ein Repository vor, das keins ist.
    expect(nimmMit('p/.git/config')).toBe(false);
    expect(nimmMit('p/.git/objects/ab/cd')).toBe(false);
  });

  it('laesst node_modules und .DS_Store draussen', () => {
    expect(nimmMit('p/node_modules/lib/index.js')).toBe(false);
    expect(nimmMit('p/.DS_Store')).toBe(false);
  });

  it('nimmt eine Datei, die .git nur im Namen traegt', () => {
    expect(nimmMit('p/gitignore-erklaert.md')).toBe(true);
    expect(nimmMit('p/.gitignore')).toBe(true);
  });
});

describe('ordnerDateien und ordnerName', () => {
  it('filtert und schlaegt den Ordnernamen vor', () => {
    const liste = [datei('kunde-a/x.md'), datei('kunde-a/.git/HEAD'), datei('kunde-a/u/y.md')];
    const gefiltert = ordnerDateien(liste);
    expect(gefiltert).toHaveLength(2);
    expect(ordnerName(gefiltert)).toBe('kunde-a');
  });

  it('gibt bei nichts Gewaehltem eine leere Liste', () => {
    expect(ordnerDateien(null)).toEqual([]);
    expect(ordnerName([])).toBe('');
  });
});

describe('ordnerHochladen', () => {
  it('laedt jede Datei mit ihrem Zielordner hoch', async () => {
    const gesehen: Array<{ name: string; ordner: string | null }> = [];
    const hochladen = vi.fn(async (_id: string, form: FormData) => {
      const f = form.get('file') as File;
      gesehen.push({ name: f.name, ordner: (form.get('ordner') as string) ?? null });
    });

    const res = await ordnerHochladen(
      'p1',
      [datei('quelle/a.md'), datei('quelle/unter/b.md')],
      hochladen
    );

    expect(res.hochgeladen).toBe(2);
    expect(gesehen).toEqual([
      { name: 'a.md', ordner: null },
      { name: 'b.md', ordner: 'unter' },
    ]);
  });

  it('bricht bei einer kaputten Datei nicht ab', async () => {
    // Bei dreihundert Dateien stuende der Nutzer sonst mit einem halb
    // gefuellten Projekt da und wuesste nicht, wo es aufgehoert hat.
    const hochladen = vi.fn(async (_id: string, form: FormData) => {
      const f = form.get('file') as File;
      if (f.name === 'kaputt.md') throw new Error('Datei zu gross');
    });

    const res = await ordnerHochladen(
      'p1',
      [datei('q/a.md'), datei('q/kaputt.md'), datei('q/c.md')],
      hochladen
    );

    expect(res.hochgeladen).toBe(2);
    expect(res.fehler).toEqual([{ pfad: 'q/kaputt.md', grund: 'Datei zu gross' }]);
  });

  it('meldet den Fortschritt', async () => {
    const stufen: number[] = [];
    await ordnerHochladen(
      'p1',
      [datei('q/a.md'), datei('q/b.md')],
      async () => {},
      f => stufen.push(f.fertig)
    );
    expect(stufen).toEqual([0, 1, 2]);
  });
});

describe('repoName', () => {
  it('zieht den Namen aus einer HTTPS-Adresse', () => {
    expect(repoName('https://github.com/org/mein-repo.git')).toBe('mein-repo');
    expect(repoName('https://github.com/org/mein-repo')).toBe('mein-repo');
    expect(repoName('https://github.com/org/mein-repo/')).toBe('mein-repo');
  });

  it('kommt mit der SSH-Kurzform zurecht', () => {
    expect(repoName('git@github.com:org/mein-repo.git')).toBe('mein-repo');
  });

  it('gibt bei leerer Eingabe nichts zurueck', () => {
    expect(repoName('')).toBe('');
    expect(repoName('   ')).toBe('');
  });
});
