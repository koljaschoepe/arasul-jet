/**
 * Rechnungs-Kern (Plan 014, Phase 5).
 *
 * Kernzusagen: (1) Summen rechnet CODE in ganzen Cent — deterministisch, mit
 * USt-Aufschlüsselung je Satz. (2) Der Nummernkreis ist lückenlos: eine
 * scheiternde Erzeugung rollt die Nummer zurück. (3) Die eingebaute
 * Validierung nennt ALLE Mängel vor der Nummer. (4) Das Factur-X-XML trägt
 * exakt die Code-Summen. (5) Das PDF ist PDF/A-3-gerüstet (XMP + Anhang).
 */

jest.mock('../../src/utils/logger');
jest.mock('../../src/database');
// Das PDF/A-3-Gerüst braucht das ECHTE pdfkit. Der moduleNameMapper der
// Jest-Config mappt `pdfkit` hart auf den Mock (auch für requireActual per
// Name) — deshalb hier über den echten node_modules-Pfad (Root-Workspace).
jest.mock('pdfkit', () => jest.requireActual('../../../../node_modules/pdfkit'));

const { berechneSummen } = require('../../src/services/flows/rechnung/summen');
const {
  validiereRechnung,
  unabhaengigeQuersumme,
} = require('../../src/services/flows/rechnung/validierung');
const { erzeugeXml } = require('../../src/services/flows/rechnung/zugferdXml');
const { erzeugePdf } = require('../../src/services/flows/rechnung/rechnungsPdf');
const { mitNaechsterNummer, formatNummer } = require('../../src/services/flows/rechnung/nummernkreis');
const { verkaeuferAusProfil, parsePositionen } = require('../../src/services/flows/rechnung');

const VERKAEUFER = {
  name: 'Muster GmbH',
  strasse: 'Musterweg 1',
  plz: '33602',
  ort: 'Bielefeld',
  land: 'DE',
  ust_id: 'DE123456789',
  email: 'info@muster.de',
};
const KAEUFER = { name: 'Beispiel AG', strasse: 'Beispielallee 2', plz: '10115', ort: 'Berlin', land: 'DE' };

describe('berechneSummen', () => {
  test('rechnet Zeilen, Netto, USt je Satz und Brutto in ganzen Cent', () => {
    const s = berechneSummen([
      { bezeichnung: 'Beratungstag', menge: 2, einheit: 'Tag', einzelpreis_netto: '1200.00', ust_satz: 19 },
      { bezeichnung: 'Fachbuch', menge: 3, einheit: 'Stück', einzelpreis_netto: '19,99', ust_satz: 7 },
    ]);
    expect(s.netto_cent).toBe(240000 + 5997);
    expect(s.ust_saetze).toEqual([
      { satz: 7, basis_cent: 5997, betrag_cent: 420 }, // 419.79 → kaufmännisch 420
      { satz: 19, basis_cent: 240000, betrag_cent: 45600 },
    ]);
    expect(s.brutto_cent).toBe(245997 + 46020);
    expect(s.api.brutto).toBe('2920.17');
  });

  test('weist ungültige Positionen ab (Satz, Menge, Betrag)', () => {
    expect(() => berechneSummen([{ bezeichnung: 'X', menge: 1, einzelpreis_netto: '10', ust_satz: 12 }])).toThrow(
      /USt-Satz/
    );
    expect(() => berechneSummen([{ bezeichnung: 'X', menge: 0, einzelpreis_netto: '10', ust_satz: 19 }])).toThrow(
      /größer als 0/
    );
    expect(() => berechneSummen([{ bezeichnung: 'X', menge: 1, einzelpreis_netto: 'abc', ust_satz: 19 }])).toThrow(
      /Betrag/
    );
    expect(() => berechneSummen([])).toThrow(/mindestens eine Position/);
  });

  test('Cent-Umrechnung ist STRING-basiert — keine Float-Drift (1.005 → Fehler statt 100)', () => {
    // 1.005 * 100 === 100.4999… → Math.round → 100 (der Klassiker). Wir weisen
    // >2 Nachkommastellen ab, statt still einen Cent zu verschlucken.
    expect(() =>
      berechneSummen([{ bezeichnung: 'X', menge: 1, einzelpreis_netto: '1.005', ust_satz: 19 }])
    ).toThrow(/max\. 2 Nachkommastellen/);
    // 0.10 + 0.20 muss exakt 30 Cent ergeben (Float: 0.1+0.2 = 0.30000000004).
    const s = berechneSummen([
      { bezeichnung: 'A', menge: 1, einzelpreis_netto: '0.10', ust_satz: 0 },
      { bezeichnung: 'B', menge: 1, einzelpreis_netto: '0.20', ust_satz: 0 },
    ]);
    expect(s.netto_cent).toBe(30);
  });

  test('Nachkomma-Mengen laufen als Integer-Arithmetik (1.5 × 10,00 € = 15,00 €)', () => {
    const s = berechneSummen([
      { bezeichnung: 'Stunden', menge: '1.5', einheit: 'Stunde', einzelpreis_netto: '10.00', ust_satz: 19 },
    ]);
    expect(s.netto_cent).toBe(1500);
    expect(s.ust_saetze[0].betrag_cent).toBe(285);
  });
});

describe('validiereRechnung', () => {
  const POSITIONEN = [{ bezeichnung: 'Tag', menge: 1, einzelpreis_netto: '100.00', ust_satz: 19 }];
  const summen = () => berechneSummen(POSITIONEN);

  test('nennt ALLE Mängel auf einmal', async () => {
    await expect(
      validiereRechnung({
        verkaeufer: { name: 'Nur Name' },
        kaeufer: {},
        summen: summen(),
        positionen: POSITIONEN,
        datum: new Date('2026-08-03'),
      })
    ).rejects.toThrow(/Straße fehlt[\s\S]*USt-IdNr\. fehlt[\s\S]*Käufer: Name fehlt/);
  });

  test('vollständige Daten bestehen inkl. Probe-XML', async () => {
    const { checks } = await validiereRechnung({
      verkaeufer: VERKAEUFER,
      kaeufer: KAEUFER,
      summen: summen(),
      positionen: POSITIONEN,
      datum: new Date('2026-08-03'),
    });
    expect(checks).toEqual(
      expect.arrayContaining([
        'Verkäufer-Pflichtangaben vollständig',
        'Summen konsistent (zwei unabhängige Rechenwege)',
        'Factur-X-Struktur erzeugbar (Probelauf)',
      ])
    );
  });

  test('unabhängige Quersumme FÄNGT eine manipulierte Summe (echter zweiter Rechenweg)', async () => {
    const kaputt = summen();
    kaputt.netto_cent += 1; // Simuliert einen Bug in summen.js
    await expect(
      validiereRechnung({
        verkaeufer: VERKAEUFER,
        kaeufer: KAEUFER,
        summen: kaputt,
        positionen: POSITIONEN,
        datum: new Date('2026-08-03'),
      })
    ).rejects.toThrow(/Netto stimmt nicht/);
  });

  test('unabhaengigeQuersumme rechnet netto/ust/brutto aus Rohpositionen', () => {
    expect(
      unabhaengigeQuersumme([
        { bezeichnung: 'A', menge: 2, einzelpreis_netto: '1200.00', ust_satz: 19 },
      ])
    ).toEqual({ netto_cent: 240000, ust_cent: 45600, brutto_cent: 285600 });
  });

  test('kaputtes USt-IdNr-Format wird abgewiesen', async () => {
    await expect(
      validiereRechnung({
        verkaeufer: { ...VERKAEUFER, ust_id: '12345' },
        kaeufer: KAEUFER,
        summen: summen(),
        positionen: POSITIONEN,
        datum: new Date(),
      })
    ).rejects.toThrow(/kein gültiges Format/);
  });
});

describe('erzeugeXml', () => {
  test('das XML trägt exakt die Code-Summen und die Nummer', async () => {
    const summen = berechneSummen([
      { bezeichnung: 'Beratungstag', menge: 2, einheit: 'Tag', einzelpreis_netto: '1200.00', ust_satz: 19 },
    ]);
    const xml = await erzeugeXml({
      nummer: 'RE-2026-00007',
      datum: new Date('2026-08-03'),
      verkaeufer: VERKAEUFER,
      kaeufer: KAEUFER,
      summen,
    });
    expect(xml).toContain('CrossIndustryInvoice');
    expect(xml).toContain('RE-2026-00007');
    expect(xml).toContain('2400.00');
    expect(xml).toContain('456.00');
    expect(xml).toContain('2856.00');
    expect(xml).toContain('DE123456789');
    expect(xml).toContain('urn:factur-x.eu:1p0:basic');
  });
});

describe('erzeugePdf', () => {
  test('erzeugt ein PDF mit Factur-X-Anhang und PDF/A-Kennung', async () => {
    const summen = berechneSummen([
      { bezeichnung: 'Beratungstag', menge: 2, einheit: 'Tag', einzelpreis_netto: '1200.00', ust_satz: 19 },
    ]);
    const xml = await erzeugeXml({
      nummer: 'RE-2026-00007',
      datum: new Date('2026-08-03'),
      verkaeufer: VERKAEUFER,
      kaeufer: KAEUFER,
      summen,
    });
    const pdf = await erzeugePdf({
      nummer: 'RE-2026-00007',
      datum: new Date('2026-08-03'),
      verkaeufer: VERKAEUFER,
      kaeufer: KAEUFER,
      summen,
      xml,
    });
    const kopf = pdf.toString('latin1');
    expect(kopf.startsWith('%PDF-1.7')).toBe(true);
    expect(kopf).toContain('factur-x.xml');
    expect(kopf).toContain('AFRelationship');
    expect(kopf).toContain('pdfaid:part');
    // Genau EINE Seite (Fußzeilen-Falle: kein Auto-Umbruch durch die Fußzeile).
    expect((kopf.match(/\/Type \/Page[^s]/g) || []).length).toBe(1);
  });
});

describe('mitNaechsterNummer (Nummernkreis)', () => {
  function fakeDb() {
    let stand = 0;
    const registriert = [];
    const client = {
      query: jest.fn(async (sql, params) => {
        if (sql.includes('INSERT INTO rechnungsnummern_zaehler')) {
          return { rows: [] };
        }
        if (sql.includes('UPDATE rechnungsnummern_zaehler')) {
          stand += 1;
          return { rows: [{ stand }] };
        }
        if (sql.includes('INSERT INTO rechnungsnummern')) {
          registriert.push(params[3]);
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };
    return {
      registriert,
      holeStand: () => stand,
      setzeStand: n => {
        stand = n;
      },
      transaction: async cb => cb(client),
    };
  }

  test('vergibt fortlaufende Nummern und ersetzt {{nummer}} im Pfad', async () => {
    const db = fakeDb();
    const a = await mitNaechsterNummer(
      { projektId: 'p1', jahr: 2026, pfad: 'Rechnungen/{{nummer}}.pdf', summen: {}, arbeit: async () => {} },
      { db }
    );
    const b = await mitNaechsterNummer(
      { projektId: 'p1', jahr: 2026, pfad: 'Rechnungen/{{nummer}}.pdf', summen: {}, arbeit: async () => {} },
      { db }
    );
    expect(a.nummer).toBe('RE-2026-00001');
    expect(b.nummer).toBe('RE-2026-00002');
    expect(b.pfad).toBe('Rechnungen/RE-2026-00002.pdf');
  });

  test('scheiternde Arbeit hinterlässt KEINE Lücke (Rollback-Semantik)', async () => {
    const db = fakeDb();
    // Echte Rollback-Semantik nachbilden: wirft die Arbeit, verwirft die
    // Transaktion die Zähler-Erhöhung.
    const echteTransaction = db.transaction;
    db.transaction = async cb => {
      const vorher = db.holeStand();
      try {
        return await echteTransaction(cb);
      } catch (err) {
        db.setzeStand(vorher);
        throw err;
      }
    };

    await expect(
      mitNaechsterNummer(
        {
          projektId: 'p1',
          jahr: 2026,
          pfad: '{{nummer}}.pdf',
          summen: {},
          arbeit: async () => {
            throw new Error('PDF kaputt');
          },
        },
        { db }
      )
    ).rejects.toThrow('PDF kaputt');

    const danach = await mitNaechsterNummer(
      { projektId: 'p1', jahr: 2026, pfad: '{{nummer}}.pdf', summen: {}, arbeit: async () => {} },
      { db }
    );
    expect(danach.nummer).toBe('RE-2026-00001');
  });

  test('formatNummer polstert 5-stellig', () => {
    expect(formatNummer(2026, 7)).toBe('RE-2026-00007');
    expect(formatNummer(2026, 123456)).toBe('RE-2026-123456');
  });
});

describe('Werkzeug-Helfer', () => {
  test('verkaeuferAusProfil liest die Firmenprofil-Tabelle', () => {
    const profil = [
      '| Firma | Muster GmbH |',
      '| Straße | Musterweg 1 |',
      '| PLZ | 33602 |',
      '| Ort | Bielefeld |',
      '| Land | DE |',
      '| USt-IdNr. | DE123456789 |',
      '| E-Mail | info@muster.de |',
    ].join('\n');
    expect(verkaeuferAusProfil(profil)).toMatchObject({
      name: 'Muster GmbH',
      strasse: 'Musterweg 1',
      plz: '33602',
      ort: 'Bielefeld',
      ust_id: 'DE123456789',
    });
  });

  test('verkaeuferAusProfil liest die IBAN (Zahlungshinweis)', () => {
    const profil = '| Firma | Muster GmbH |\n| IBAN | DE89370400440532013000 |';
    expect(verkaeuferAusProfil(profil).iban).toBe('DE89370400440532013000');
  });

  test('verkaeuferAusProfil: Platzhalter zählen nicht als Daten', () => {
    const profil = '| Firma | Muster GmbH |\n| USt-IdNr. | [DE123456789] |';
    expect(verkaeuferAusProfil(profil).ust_id).toBeNull();
  });

  test('parsePositionen liest JSON-String und echtes Array, weist Unsinn ab', () => {
    expect(parsePositionen('[{"bezeichnung":"X"}]')).toEqual([{ bezeichnung: 'X' }]);
    expect(parsePositionen([{ bezeichnung: 'X' }])).toEqual([{ bezeichnung: 'X' }]);
    expect(parsePositionen('kein json')).toBeNull();
    expect(parsePositionen('{"kein":"array"}')).toBeNull();
  });
});
