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
const deps = { getProject: jest.fn(async id => ({ id, slug: 'testprojekt' })) };

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
});
