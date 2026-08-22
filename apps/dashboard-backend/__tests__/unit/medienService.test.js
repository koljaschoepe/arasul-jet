/**
 * Plan 023 J3: angesteckte Datentraeger als Ziel fuer den Export.
 *
 * Den Export gibt es seit langem, das Ziel fehlte: er kam nur als Download im
 * Browser. Auf einem Geraet, das im Serverraum steht und ueber den Fernzugriff
 * bedient wird, ist ein Browser-Download der unbequemste aller Wege.
 *
 * Geprueft wird gegen einen echten Ordner im Dateisystem, nicht gegen ein
 * Doppel: die Fragen, an denen so etwas scheitert, sind Rechte, Symlinks und
 * abgezogene Platten — und keine davon laesst sich an einem Doppel pruefen.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';

const os = require('os');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

const medien = require('../../src/services/medien/medienService');
const { ValidationError, NotFoundError } = require('../../src/utils/errors');

let wurzel;

beforeEach(async () => {
  wurzel = await fsp.mkdtemp(path.join(os.tmpdir(), 'medien-'));
});

afterEach(async () => {
  await fsp.rm(wurzel, { recursive: true, force: true });
});

describe('liste', () => {
  test('nennt jeden eingehaengten Datentraeger', async () => {
    await fsp.mkdir(path.join(wurzel, 'SICHERUNG'));
    await fsp.mkdir(path.join(wurzel, 'USB-Stick'));

    const { medien: gefunden, hinweis } = await medien.liste({ dir: wurzel });

    expect(gefunden.map(m => m.name)).toEqual(['SICHERUNG', 'USB-Stick']);
    expect(gefunden[0].beschreibbar).toBe(true);
    expect(hinweis).toBeNull();
  });

  test('uebergeht Dateien und versteckte Ordner', async () => {
    await fsp.writeFile(path.join(wurzel, 'egal.txt'), 'x');
    await fsp.mkdir(path.join(wurzel, '.Trash-1000'));
    await fsp.mkdir(path.join(wurzel, 'PLATTE'));

    const { medien: gefunden } = await medien.liste({ dir: wurzel });
    expect(gefunden.map(m => m.name)).toEqual(['PLATTE']);
  });

  test('leer heisst: keine Platte angesteckt, und sagt das auch', async () => {
    const { medien: gefunden, hinweis } = await medien.liste({ dir: wurzel });
    expect(gefunden).toEqual([]);
    expect(hinweis).toMatch(/Platte anstecken/);
  });

  test('fehlender Ordner ist etwas ANDERES als kein Datentraeger', async () => {
    // Ohne diesen Unterschied sucht jemand eine Stunde am falschen Ende: die
    // Platte steckt, nur der Mount fehlt.
    const { medien: gefunden, hinweis } = await medien.liste({
      dir: path.join(wurzel, 'gibtsnicht'),
    });
    expect(gefunden).toEqual([]);
    expect(hinweis).toMatch(/nicht eingebunden/);
    expect(hinweis).toMatch(/EXTERNE_MEDIEN/);
  });

  test('nennt den freien Platz', async () => {
    await fsp.mkdir(path.join(wurzel, 'PLATTE'));
    const { medien: gefunden } = await medien.liste({ dir: wurzel });
    expect(typeof gefunden[0].freiBytes).toBe('number');
    expect(gefunden[0].freiBytes).toBeGreaterThan(0);
  });
});

describe('aufloesen', () => {
  test('einen vorhandenen Datentraeger', async () => {
    await fsp.mkdir(path.join(wurzel, 'PLATTE'));
    const pfad = await medien.aufloesen('PLATTE', { dir: wurzel });
    expect(pfad).toContain('PLATTE');
  });

  test('ein Name mit Pfad wird ABGEWIESEN, nicht bereinigt', async () => {
    // Ein stillschweigend gekuerzter Name schriebe die Daten irgendwohin.
    for (const boese of ['../..', 'a/b', 'a\\b', '/etc']) {
      await expect(medien.aufloesen(boese, { dir: wurzel })).rejects.toThrow(ValidationError);
    }
  });

  test('ein Symlink nach draussen zaehlt nicht als Datentraeger', async () => {
    // Der Ordner liegt auf einer fremden Platte; ein Symlink darauf zeigt
    // zurueck ins Geraet.
    const draussen = await fsp.mkdtemp(path.join(os.tmpdir(), 'draussen-'));
    fs.symlinkSync(draussen, path.join(wurzel, 'TRICK'));
    await expect(medien.aufloesen('TRICK', { dir: wurzel })).rejects.toThrow(NotFoundError);
    await fsp.rm(draussen, { recursive: true, force: true });
  });

  test('ein abgezogener Datentraeger ist ein NotFound', async () => {
    await expect(medien.aufloesen('WEG', { dir: wurzel })).rejects.toThrow(NotFoundError);
  });

  test('ein nur lesbarer Datentraeger wird abgewiesen, mit Grund', async () => {
    const nurLesen = path.join(wurzel, 'READONLY');
    await fsp.mkdir(nurLesen, { mode: 0o500 });
    await expect(medien.aufloesen('READONLY', { dir: wurzel })).rejects.toThrow(
      /schreibgeschützt|nicht schreiben/
    );
    await fsp.chmod(nurLesen, 0o700);
  });
});

describe('schreibe', () => {
  test('legt die Datei ab und meldet Pfad und Groesse', async () => {
    await fsp.mkdir(path.join(wurzel, 'PLATTE'));
    const res = await medien.schreibe('PLATTE', 'export.json', '{"a":1}', { dir: wurzel });

    expect(res.pfad).toBe(path.join('PLATTE', 'export.json'));
    expect(res.bytes).toBe(7);
    expect(fs.readFileSync(path.join(wurzel, 'PLATTE', 'export.json'), 'utf8')).toBe('{"a":1}');
  });

  test('laesst keine halbe Datei zurueck', async () => {
    // Erst daneben schreiben, dann umbenennen: wer die Platte mitten im
    // Schreiben abzieht, haette sonst etwas, das aussieht wie ein Export.
    await fsp.mkdir(path.join(wurzel, 'PLATTE'));
    await medien.schreibe('PLATTE', 'export.json', 'x', { dir: wurzel });
    const drin = await fsp.readdir(path.join(wurzel, 'PLATTE'));
    expect(drin).toEqual(['export.json']);
  });

  test('ein Dateiname mit Pfad landet nicht ausserhalb', async () => {
    // Die Schraegstriche werden zu Unterstrichen, und was danach mit einem
    // Punkt beginnt, wird abgewiesen. Beides zusammen heisst: der Name landet
    // entweder im Zielordner oder gar nicht.
    await fsp.mkdir(path.join(wurzel, 'PLATTE'));
    await expect(
      medien.schreibe('PLATTE', '../../boese.json', 'x', { dir: wurzel })
    ).rejects.toThrow(ValidationError);
    expect(fs.existsSync(path.join(wurzel, 'boese.json'))).toBe(false);

    // Ein harmloser Name mit Schraegstrich wird entschaerft statt abgewiesen.
    const res = await medien.schreibe('PLATTE', 'unter/ordner.json', 'x', { dir: wurzel });
    expect(res.pfad).toBe(path.join('PLATTE', 'unter_ordner.json'));
  });

  test('ein leerer Dateiname geht nicht', async () => {
    await fsp.mkdir(path.join(wurzel, 'PLATTE'));
    await expect(medien.schreibe('PLATTE', '   ', 'x', { dir: wurzel })).rejects.toThrow(
      ValidationError
    );
  });
});
