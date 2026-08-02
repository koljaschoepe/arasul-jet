/**
 * Tests für die Flow-Ausgabe (Flows-Umbau 2026-08-02): Anweisungsblock,
 * Dateiname-Muster und Dokument-Erzeugung (Markdown-Pfad; PDF/Word-Renderer
 * sind in Jest gemockt bzw. schwergewichtig und werden am lebenden System
 * verifiziert).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  bauAusgabeAnweisungen,
  dokumentDateiname,
  erzeugeDokument,
} = require('../../src/services/flows/dokumentAusgabe');

describe('bauAusgabeAnweisungen', () => {
  it('liefert ohne ausgabe einen leeren String', async () => {
    expect(await bauAusgabeAnweisungen(undefined)).toBe('');
    expect(await bauAusgabeAnweisungen(null)).toBe('');
  });

  it('setzt Sprache, Tonalität, Stufe und Gliederung in Klartext um', async () => {
    const block = await bauAusgabeAnweisungen({
      format: 'keins',
      sprache: 'Deutsch',
      tonalitaet: 'formell',
      laenge: { stufe: 'ausfuehrlich' },
      gliederung: ['Zusammenfassung', 'Details'],
    });
    expect(block).toContain('Sprache des Ergebnisses: Deutsch');
    expect(block).toContain('formell und geschäftlich');
    expect(block).toContain('mindestens 2500 Wörter');
    expect(block).toContain('Zusammenfassung · Details');
    // Kein Dokument-Format → keine Markdown-Pflicht für die finale Antwort.
    expect(block).not.toContain('FINALE Antwort');
  });

  it('Wortzahl überstimmt die Stufe; Dokument-Format verpflichtet auf Markdown', async () => {
    const block = await bauAusgabeAnweisungen({
      format: 'pdf',
      laenge: { stufe: 'kurz', wortzahl: 1234 },
    });
    expect(block).toContain('etwa 1234 Wörter');
    expect(block).not.toContain('300–600');
    expect(block).toContain('FINALE Antwort');
  });

  it('hängt den Vorlagen-Text als abgegrenzten Block an — fehlende Vorlage fällt still weg', async () => {
    const mitVorlage = await bauAusgabeAnweisungen(
      { format: 'pdf', vorlage: 'angebot.docx' },
      { ladeVorlage: async () => ({ gefunden: true, text: 'Muster-Aufbau', gekuerzt: false }) }
    );
    expect(mitVorlage).toContain('--- Vorlage "angebot.docx" ---');
    expect(mitVorlage).toContain('Muster-Aufbau');

    const ohneVorlage = await bauAusgabeAnweisungen(
      { format: 'pdf', vorlage: 'weg.docx' },
      { ladeVorlage: async () => ({ gefunden: false, text: '', gekuerzt: false }) }
    );
    expect(ohneVorlage).not.toContain('Vorlage');
  });
});

describe('dokumentDateiname', () => {
  const datum = new Date('2026-08-02T10:00:00Z');

  it('füllt Argument- und Datum-Platzhalter und hängt die Format-Endung an', () => {
    const name = dokumentDateiname({
      ausgabe: { format: 'pdf', dateiname: 'angebot-{{kunde}}-{{datum}}' },
      flowName: 'angebot',
      werte: { kunde: 'Müller GmbH' },
      datum,
    });
    expect(name).toBe('angebot-Müller GmbH-2026-08-02.pdf');
  });

  it('fällt ohne Muster auf <flowname>-<datum> zurück', () => {
    expect(dokumentDateiname({ ausgabe: { format: 'docx' }, flowName: 'bericht', datum })).toBe(
      'bericht-2026-08-02.docx'
    );
  });

  it('entschärft Pfad-Zeichen und lässt leere Platzhalter weg', () => {
    const name = dokumentDateiname({
      ausgabe: { format: 'markdown', dateiname: '../{{boese}}/bericht:{{kunde}}' },
      flowName: 'bericht',
      werte: { boese: '../..' },
      datum,
    });
    expect(name).not.toContain('/');
    expect(name).not.toContain(':');
    expect(name.endsWith('.md')).toBe(true);
  });
});

describe('erzeugeDokument', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-ausgabe-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('schreibt Markdown-Ergebnisse als .md in den Zielordner', async () => {
    const { dateiname, pfad } = await erzeugeDokument({
      ausgabe: { format: 'markdown', dateiname: 'notiz-{{datum}}' },
      flowName: 'notiz',
      markdown: '# Hallo',
      zielOrdner: dir,
    });
    expect(dateiname.endsWith('.md')).toBe(true);
    expect(fs.readFileSync(pfad, 'utf8')).toBe('# Hallo\n');
  });

  it('überschreibt nie: bei Namenskollision entsteht -2', async () => {
    const eins = await erzeugeDokument({
      ausgabe: { format: 'markdown', dateiname: 'fix' },
      flowName: 'f',
      markdown: 'eins',
      zielOrdner: dir,
    });
    const zwei = await erzeugeDokument({
      ausgabe: { format: 'markdown', dateiname: 'fix' },
      flowName: 'f',
      markdown: 'zwei',
      zielOrdner: dir,
    });
    expect(eins.dateiname).toBe('fix.md');
    expect(zwei.dateiname).toBe('fix-2.md');
    expect(fs.readFileSync(eins.pfad, 'utf8')).toBe('eins\n');
    expect(fs.readFileSync(zwei.pfad, 'utf8')).toBe('zwei\n');
  });

  it('wirft bei leerem Inhalt, statt eine leere Datei abzulegen', async () => {
    await expect(
      erzeugeDokument({
        ausgabe: { format: 'markdown' },
        flowName: 'f',
        markdown: '   ',
        zielOrdner: dir,
      })
    ).rejects.toThrow(/keinen Inhalt/);
  });
});
