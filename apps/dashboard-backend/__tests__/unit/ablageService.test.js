/**
 * Projektablage — Datei-Service (Batch 2).
 *
 * Die Tests laufen gegen einen echten Temp-Ordner: Pfad-Einsperrung, Baum,
 * Lesen/Schreiben/Löschen/Verschieben, Binär-Erkennung, .git-Schutz.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// ABLAGE_DIR wird beim Laden aus der Umgebung gelesen — VOR dem require setzen.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ablage-test-'));
process.env.PROJECT_GIT_DIR = TMP;

const ablage = require('../../src/services/projects/ablageService');
const { ValidationError, NotFoundError, ConflictError } = require('../../src/utils/errors');

const PROJEKT = '11111111-2222-3333-4444-555555555555';
const deps = {
  getProject: jest.fn(async id => ({ id, slug: 'testprojekt' })),
  // Rechnungsschutz-Wächter (Plan 014, Phase 5): keine registrierten Rechnungen.
  db: { query: jest.fn(async () => ({ rows: [] })) },
};

afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe('ablageService', () => {
  it('legt den Projektordner beim ersten Zugriff an', async () => {
    const dir = await ablage.projektOrdner(PROJEKT, deps);
    expect(dir).toBe(path.join(TMP, PROJEKT));
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('wirft NotFound für ein unbekanntes Projekt', async () => {
    const kaputt = {
      getProject: jest.fn(async () => {
        throw new NotFoundError('Projekt nicht gefunden');
      }),
    };
    await expect(ablage.listTree(PROJEKT, kaputt)).rejects.toThrow(NotFoundError);
  });

  it('schreibt und liest eine Textdatei (legt Zwischenordner an)', async () => {
    const geschrieben = await ablage.writeFile(PROJEKT, 'notizen/heute.md', '# Hallo', deps);
    expect(geschrieben.pfad).toBe('notizen/heute.md');
    const gelesen = await ablage.readFile(PROJEKT, 'notizen/heute.md', deps);
    expect(gelesen.inhalt).toBe('# Hallo');
    expect(gelesen.binaer).toBe(false);
  });

  it('listet den Baum: Ordner vor Dateien, Pfade relativ', async () => {
    await ablage.writeFile(PROJEKT, 'aaa.txt', 'x', deps);
    const { eintraege, gekuerzt } = await ablage.listTree(PROJEKT, deps);
    expect(gekuerzt).toBe(false);
    const pfade = eintraege.map(e => e.pfad);
    expect(pfade).toContain('notizen');
    expect(pfade).toContain('notizen/heute.md');
    expect(pfade).toContain('aaa.txt');
    // Ordner vor Dateien auf oberster Ebene.
    expect(pfade.indexOf('notizen')).toBeLessThan(pfade.indexOf('aaa.txt'));
  });

  it('blendet .git aus und schützt es vor Schreiben/Löschen', async () => {
    fs.mkdirSync(path.join(TMP, PROJEKT, '.git'), { recursive: true });
    fs.writeFileSync(path.join(TMP, PROJEKT, '.git', 'HEAD'), 'ref: x');
    const { eintraege } = await ablage.listTree(PROJEKT, deps);
    expect(eintraege.map(e => e.pfad)).not.toContain('.git');
    await expect(ablage.writeFile(PROJEKT, '.git/config', 'x', deps)).rejects.toThrow(
      ValidationError
    );
    await expect(ablage.remove(PROJEKT, '.git', deps)).rejects.toThrow(ValidationError);
  });

  it('sperrt Pfad-Ausbrüche ein (.. und absolute Pfade)', async () => {
    await expect(ablage.readFile(PROJEKT, '../anderes', deps)).rejects.toThrow(ValidationError);
    await expect(ablage.writeFile(PROJEKT, '../../etc/passwd', 'x', deps)).rejects.toThrow(
      ValidationError
    );
  });

  it('folgt Symlinks nicht aus der Ablage heraus', async () => {
    const draussen = path.join(TMP, 'draussen.txt');
    fs.writeFileSync(draussen, 'geheim');
    fs.symlinkSync(draussen, path.join(TMP, PROJEKT, 'falle.txt'));
    await expect(ablage.readFile(PROJEKT, 'falle.txt', deps)).rejects.toThrow(ValidationError);
    // Und im Baum taucht der Symlink gar nicht erst auf.
    const { eintraege } = await ablage.listTree(PROJEKT, deps);
    expect(eintraege.map(e => e.pfad)).not.toContain('falle.txt');
  });

  it('meldet Binärdateien als binaer statt sie als Text zu liefern', async () => {
    fs.writeFileSync(path.join(TMP, PROJEKT, 'bild.png'), Buffer.from([0x89, 0x50, 0x00, 0x0a]));
    const gelesen = await ablage.readFile(PROJEKT, 'bild.png', deps);
    expect(gelesen.binaer).toBe(true);
    expect(gelesen.inhalt).toBeNull();
  });

  it('verschiebt Dateien und weigert sich bei belegtem Ziel', async () => {
    await ablage.writeFile(PROJEKT, 'a.txt', '1', deps);
    await ablage.move(PROJEKT, 'a.txt', 'unter/b.txt', deps);
    expect((await ablage.readFile(PROJEKT, 'unter/b.txt', deps)).inhalt).toBe('1');
    await ablage.writeFile(PROJEKT, 'a.txt', '2', deps);
    await expect(ablage.move(PROJEKT, 'a.txt', 'unter/b.txt', deps)).rejects.toThrow(
      ConflictError
    );
  });

  it('löscht Dateien und Ordner rekursiv, aber nie die Wurzel', async () => {
    await ablage.writeFile(PROJEKT, 'weg/tief/x.txt', 'x', deps);
    const geloescht = await ablage.remove(PROJEKT, 'weg', deps);
    expect(geloescht.typ).toBe('ordner');
    await expect(ablage.readFile(PROJEKT, 'weg/tief/x.txt', deps)).rejects.toThrow(NotFoundError);
    await expect(ablage.remove(PROJEKT, '.', deps)).rejects.toThrow(ValidationError);
  });

  it('legt Uploads mit reinem Dateinamen ab (keine Pfade von außen)', async () => {
    const datei = await ablage.saveUpload(
      PROJEKT,
      null,
      '../../boese.sh',
      Buffer.from('echo hi'),
      deps
    );
    expect(datei.pfad).toBe('boese.sh');
    expect((await ablage.readFile(PROJEKT, 'boese.sh', deps)).inhalt).toBe('echo hi');
  });

  it('fuerDownload: Datei liefert Pfad+Name, Wurzel liefert Projekt-Slug', async () => {
    const datei = await ablage.fuerDownload(PROJEKT, 'boese.sh', deps);
    expect(datei.typ).toBe('datei');
    expect(datei.name).toBe('boese.sh');
    const wurzel = await ablage.fuerDownload(PROJEKT, '.', deps);
    expect(wurzel.typ).toBe('ordner');
    expect(wurzel.name).toBe('testprojekt');
  });

  it('move: lehnt Ordner-in-eigenen-Unterbaum sauber ab (kein roher EINVAL)', async () => {
    await ablage.createDir(PROJEKT, 'schachtel/innen', deps);
    await expect(ablage.move(PROJEKT, 'schachtel', 'schachtel/innen/schachtel', deps)).rejects.toThrow(
      ValidationError
    );
    await expect(ablage.move(PROJEKT, 'schachtel', 'schachtel', deps)).rejects.toThrow(
      ValidationError
    );
  });

  it('searchTree: findet tiefe Dateien case-insensitiv, flache Trefferliste', async () => {
    await ablage.writeFile(PROJEKT, 'tief/a/b/SuchZiel.md', 'x', deps);
    await ablage.writeFile(PROJEKT, 'tief/anderes.txt', 'x', deps);
    const { eintraege, gekuerzt } = await ablage.searchTree(PROJEKT, 'suchziel', deps);
    expect(gekuerzt).toBe(false);
    expect(eintraege.map(e => e.pfad)).toEqual(['tief/a/b/SuchZiel.md']);
    expect(eintraege[0].typ).toBe('datei');
  });

  it('searchTree: matcht auch Ordnernamen und liefert leer bei Leer-Suche', async () => {
    const treffer = await ablage.searchTree(PROJEKT, 'schachtel', deps);
    expect(treffer.eintraege.some(e => e.pfad === 'schachtel' && e.typ === 'ordner')).toBe(true);
    const leer = await ablage.searchTree(PROJEKT, '   ', deps);
    expect(leer.eintraege).toEqual([]);
  });

  // Schreibschutz ausgestellter Rechnungen (Plan 014, Phase 5).
  describe('Rechnungs-Schreibschutz', () => {
    // db.query meldet den Pfad als registrierte Rechnung, sobald er (oder ein
    // Elternteil) auf die Rechnungsdatei zeigt.
    const schutzDeps = {
      getProject: deps.getProject,
      db: {
        query: jest.fn(async (_sql, params) => {
          const [, rel, prefix] = params;
          const treffer =
            rel === 'Rechnungen/RE-2026-00001.pdf' || prefix === 'Rechnungen/%';
          return { rows: treffer ? [{ nummer: 'RE-2026-00001' }] : [] };
        }),
      },
    };

    it('write/remove/move/upload/createDir werfen ForbiddenError für eine Rechnung', async () => {
      const p = 'Rechnungen/RE-2026-00001.pdf';
      await expect(ablage.writeFile(PROJEKT, p, 'x', schutzDeps)).rejects.toThrow(/schreibgeschützt/);
      await expect(ablage.remove(PROJEKT, p, schutzDeps)).rejects.toThrow(/schreibgeschützt/);
      await expect(ablage.move(PROJEKT, p, 'woanders.pdf', schutzDeps)).rejects.toThrow(
        /schreibgeschützt/
      );
      await expect(
        ablage.saveUpload(PROJEKT, 'Rechnungen', 'RE-2026-00001.pdf', Buffer.from('x'), schutzDeps)
      ).rejects.toThrow(/schreibgeschützt/);
      // Elternordner der Rechnung darf nicht gelöscht/angelegt werden.
      await expect(ablage.remove(PROJEKT, 'Rechnungen', schutzDeps)).rejects.toThrow(
        /schreibgeschützt/
      );
      await expect(ablage.createDir(PROJEKT, 'Rechnungen', schutzDeps)).rejects.toThrow(
        /schreibgeschützt/
      );
    });

    it('lässt unbeteiligte Pfade unberührt', async () => {
      await expect(
        ablage.writeFile(PROJEKT, 'Notizen/frei.md', 'x', schutzDeps)
      ).resolves.toMatchObject({ pfad: 'Notizen/frei.md' });
    });
  });
});

describe('resolveOrdnerListe (projekt://aktiv)', () => {
  const { resolveOrdnerListe, PROJEKT_ORDNER_TOKEN } = require('../../src/services/flows/runFlow');

  it('ersetzt den Token durch den Ablage-Pfad des aktiven Projekts', async () => {
    const ordner = await resolveOrdnerListe(['/statisch', PROJEKT_ORDNER_TOKEN], {
      getActiveProjectId: async () => PROJEKT,
      projektOrdner: async id => `/arasul/projects/${id}`,
    });
    expect(ordner).toEqual(['/statisch', `/arasul/projects/${PROJEKT}`]);
  });

  it('lässt Listen ohne Token unangetastet', async () => {
    const ordner = await resolveOrdnerListe(['/a', '/b'], {
      getActiveProjectId: async () => {
        throw new Error('darf nicht gerufen werden');
      },
    });
    expect(ordner).toEqual(['/a', '/b']);
  });

  it('löst projekt://aktiv/<unterordner> in einen Unterordner auf und legt ihn an', async () => {
    const basis = fs.mkdtempSync(path.join(os.tmpdir(), 'ablage-ordner-'));
    const ordner = await resolveOrdnerListe(['projekt://aktiv/kunden/mueller'], {
      getActiveProjectId: async () => PROJEKT,
      projektOrdner: async () => basis,
    });
    expect(ordner).toEqual([path.join(basis, 'kunden/mueller')]);
    expect(fs.statSync(path.join(basis, 'kunden/mueller')).isDirectory()).toBe(true);
    fs.rmSync(basis, { recursive: true, force: true });
  });

  it('löst projekt://<uuid> über die angegebene Projekt-ID auf', async () => {
    const gesehen = [];
    const ordner = await resolveOrdnerListe(['projekt://11111111-2222-3333-4444-555555555555'], {
      getActiveProjectId: async () => {
        throw new Error('darf nicht gerufen werden');
      },
      projektOrdner: async id => {
        gesehen.push(id);
        return `/arasul/projects/${id}`;
      },
    });
    expect(gesehen).toEqual(['11111111-2222-3333-4444-555555555555']);
    expect(ordner).toEqual(['/arasul/projects/11111111-2222-3333-4444-555555555555']);
  });

  it('weist .. im Unterpfad ab', async () => {
    await expect(
      resolveOrdnerListe(['projekt://aktiv/../ausbruch'], {
        getActiveProjectId: async () => PROJEKT,
        projektOrdner: async () => '/arasul/projects/x',
      })
    ).rejects.toThrow(/Ungültiger Ordner/);
  });
});
