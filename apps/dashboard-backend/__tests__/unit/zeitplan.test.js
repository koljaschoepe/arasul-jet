/**
 * Zeitplan-Ausdruecke (M5, Zeitplaner im Geraet).
 *
 * Gemessen wird, was bei einer Uhr schiefgeht: die Umstellung auf Sommer- und
 * auf Winterzeit. Ein Zeitplan, der in einer Nacht im Jahr ausfaellt oder
 * doppelt laeuft, faellt in keinem Test der Normalwoche auf.
 */
const zeitplan = require('../../src/services/flows/zeitplan');

const BERLIN = 'Europe/Berlin';
const iso = ms => new Date(ms).toISOString();
const faellig = (ausdruck, von, bis) =>
  zeitplan.faellige([zeitplan.lese(ausdruck)], Date.parse(von), Date.parse(bis), BERLIN).map(iso);
const naechster = (ausdruck, ab) => {
  const t = zeitplan.naechster([zeitplan.lese(ausdruck)], Date.parse(ab), BERLIN);
  return t === null ? null : iso(t);
};

describe('lese', () => {
  it.each([
    ['0 6 * * 1-5'],
    ['*/15 * * * *'],
    ['0,30 8-17 * * *'],
    ['0 0 1 1 *'],
    ['0 6 * * 7'],
    ['5/10 * * * *'],
  ])('nimmt %s an', ausdruck => {
    expect(() => zeitplan.lese(ausdruck)).not.toThrow();
  });

  it.each([
    ['61 * * * *', /Minute: "61" liegt außerhalb von 0 bis 59/],
    ['0 24 * * *', /Stunde/],
    ['0 6 0 * *', /Tag/],
    ['0 6 * 13 *', /Monat/],
    ['0 6 * * 8', /Wochentag/],
    ['*/0 * * * *', /Schrittweite/],
    ['5-2 * * * *', /außerhalb/],
    ['0 6 * *', /fünf Felder/],
  ])('weist %s ab', (ausdruck, muster) => {
    expect(() => zeitplan.lese(ausdruck)).toThrow(muster);
  });
});

describe('faellige: in der Zeitzone des Geraets', () => {
  it('06:00 in Berlin ist im Sommer 04:00 UTC und im Winter 05:00 UTC', () => {
    expect(faellig('0 6 * * *', '2026-07-14T00:00:00Z', '2026-07-15T00:00:00Z')).toEqual([
      '2026-07-14T04:00:00.000Z',
    ]);
    expect(faellig('0 6 * * *', '2026-12-14T00:00:00Z', '2026-12-15T00:00:00Z')).toEqual([
      '2026-12-14T05:00:00.000Z',
    ]);
  });

  it('Wochentage 1-5: werktags, nicht am Wochenende', () => {
    const tage = faellig('0 6 * * 1-5', '2026-10-01T00:00:00Z', '2026-10-08T00:00:00Z');
    expect(tage).toHaveLength(5);
    expect(tage).not.toContain('2026-10-03T04:00:00.000Z'); // Samstag
    expect(tage).not.toContain('2026-10-04T04:00:00.000Z'); // Sonntag
  });

  it('Tag UND Wochentag eingeschraenkt: eines genuegt, wie in cron', () => {
    // der 13. oder ein Freitag
    const tage = faellig('0 8 13 * 5', '2026-10-01T00:00:00Z', '2026-10-31T00:00:00Z');
    expect(tage).toContain('2026-10-13T06:00:00.000Z'); // Dienstag, der 13.
    expect(tage).toContain('2026-10-09T06:00:00.000Z'); // ein Freitag
  });

  it('Sonntag ist 0 und 7', () => {
    const a = faellig('0 6 * * 0', '2026-10-01T00:00:00Z', '2026-10-08T00:00:00Z');
    expect(faellig('0 6 * * 7', '2026-10-01T00:00:00Z', '2026-10-08T00:00:00Z')).toEqual(a);
    expect(a).toEqual(['2026-10-04T04:00:00.000Z']);
  });

  it('von zaehlt nicht mehr dazu, bis schon', () => {
    expect(faellig('0 6 * * *', '2026-10-05T04:00:00Z', '2026-10-05T04:05:00Z')).toEqual([]);
    expect(faellig('0 6 * * *', '2026-10-05T03:59:00Z', '2026-10-05T04:00:00Z')).toEqual([
      '2026-10-05T04:00:00.000Z',
    ]);
  });
});

describe('Umstellung auf Sommerzeit, 29.03.2026: 02:00 springt auf 03:00', () => {
  const [von, bis] = ['2026-03-28T23:00:00Z', '2026-03-29T03:00:00Z'];

  it('02:30 gibt es nicht und laeuft doch, einmal, in der ersten Minute danach', () => {
    expect(faellig('30 2 * * *', von, bis)).toEqual(['2026-03-29T01:00:00.000Z']);
  });

  it('03:00 laeuft nicht zusaetzlich: dieselbe Minute, ein Termin', () => {
    expect(faellig('0 3 * * *', von, bis)).toEqual(['2026-03-29T01:00:00.000Z']);
  });

  it('03:30 bleibt, wo es ist', () => {
    expect(faellig('30 3 * * *', von, bis)).toEqual(['2026-03-29T01:30:00.000Z']);
  });

  // Befund 10 der zweiten Pruefung (05.10.2026) meinte, die Luecke werde fuer
  // die Gesamtmenge der Plaene nachgeholt statt je Plan, und ein Plan in der
  // Luecke ginge verloren, wenn ein anderer die erste Minute danach trifft.
  // Nachgeprueft: `faellige` liefert Zeitpunkte EINES Flows, und beide Plaene
  // landen auf derselben Minute. Je Plan gerechnet kaeme dasselbe heraus.
  it('zwei Plaene, einer in der Luecke, einer danach: ein Termin, keiner verloren', () => {
    const plaene = ['30 2 * * *', '0 3 * * *'].map(a => zeitplan.lese(a));
    expect(zeitplan.faellige(plaene, Date.parse(von), Date.parse(bis), BERLIN).map(iso)).toEqual([
      '2026-03-29T01:00:00.000Z',
    ]);
  });
});

describe('Umstellung auf Winterzeit, 25.10.2026: 03:00 springt auf 02:00', () => {
  const [von, bis] = ['2026-10-24T22:00:00Z', '2026-10-25T05:00:00Z'];

  it('02:30 gibt es zweimal und laeuft nur beim ersten Mal', () => {
    expect(faellig('30 2 * * *', von, bis)).toEqual(['2026-10-25T00:30:00.000Z']);
  });

  it('jede Minute laeuft durch, auch in der wiederholten Stunde', () => {
    const minuten = faellig('* * * * *', '2026-10-25T00:58:00Z', '2026-10-25T01:03:00Z');
    expect(minuten).toHaveLength(5);
  });

  it('ein Takt in der wiederholten Stunde: Termine der ersten Stunde nicht noch einmal', () => {
    expect(faellig('30 2 * * *', '2026-10-25T01:00:00Z', '2026-10-25T02:00:00Z')).toEqual([]);
  });
});

describe('naechster', () => {
  it('der naechste Werktag um sechs, in Worten der Zone', () => {
    // Sonntag 4. Oktober 2026, 14:00 Berlin
    expect(naechster('0 6 * * 1-5', '2026-10-04T12:00:00Z')).toBe('2026-10-05T04:00:00.000Z');
  });

  it('ohne den Zeitpunkt selbst', () => {
    expect(naechster('0 6 * * *', '2026-10-05T04:00:00Z')).toBe('2026-10-06T04:00:00.000Z');
  });

  it('jede Minute: die naechste', () => {
    expect(naechster('* * * * *', '2026-10-04T12:00:30Z')).toBe('2026-10-04T12:01:00.000Z');
  });

  it('springt ueber Monate, ohne Minuten zu zaehlen', () => {
    expect(naechster('0 6 1 1 *', '2026-10-04T12:00:00Z')).toBe('2027-01-01T05:00:00.000Z');
  });

  it('einen Schalttag findet es, einen 30. Februar nie', () => {
    expect(naechster('0 0 29 2 *', '2026-10-04T12:00:00Z')).toBe('2028-02-28T23:00:00.000Z');
    expect(naechster('0 0 30 2 *', '2026-10-04T12:00:00Z')).toBeNull();
  });

  it('kennt die Umstellung: 02:30 am Tag der Sommerzeit ist 03:00', () => {
    expect(naechster('30 2 * * *', '2026-03-28T12:00:00Z')).toBe('2026-03-29T01:00:00.000Z');
  });

  it('und die Winterzeit: der erste 02:30, danach erst der naechste Tag', () => {
    expect(naechster('30 2 * * *', '2026-10-24T12:00:00Z')).toBe('2026-10-25T00:30:00.000Z');
    expect(naechster('30 2 * * *', '2026-10-25T00:30:00Z')).toBe('2026-10-26T01:30:00.000Z');
  });

  // Befund 11 der zweiten Pruefung (05.10.2026): in der ZWEITEN 02:xx-Stunde
  // (01:00 bis 02:00 UTC am 25.10.2026) fiel die Wanduhr 02:30 auf ihren
  // frueheren, laengst vergangenen Zeitpunkt, und die Anzeige sagte "in einer
  // Minute". Ein fester Plan laeuft dort nicht, `faellige` laesst ihn aus.
  it('in der zweiten 02:xx-Stunde: ein fester Plan erst am naechsten Tag', () => {
    expect(naechster('30 2 * * *', '2026-10-25T01:10:00Z')).toBe('2026-10-26T01:30:00.000Z');
    expect(naechster('30 2 * * *', '2026-10-25T01:40:00Z')).toBe('2026-10-26T01:30:00.000Z');
  });

  it('in der zweiten 02:xx-Stunde: ein Plan mit Stern laeuft dort weiter', () => {
    expect(naechster('*/15 2 * * *', '2026-10-25T01:10:00Z')).toBe('2026-10-25T01:15:00.000Z');
    expect(naechster('*/15 2 * * *', '2026-10-25T00:50:00Z')).toBe('2026-10-25T01:00:00.000Z');
  });

  it('Anzeige und Zeitplaner sagen in der Nacht dasselbe', () => {
    // Was `naechster` nennt, muss `faellige` auch ausloesen, und nichts davor.
    const naechte = [
      ['2026-10-24T23:00:00Z', '2026-10-25T02:30:00Z'],
      ['2026-03-28T23:00:00Z', '2026-03-29T02:30:00Z'],
    ];
    for (const [von, bis] of naechte) {
      for (const ausdruck of ['30 2 * * *', '*/15 2 * * *', '0 3 * * *', '45 1 * * *']) {
        const plaene = [zeitplan.lese(ausdruck)];
        for (let ab = Date.parse(von); ab <= Date.parse(bis); ab += 5 * 60000) {
          const t = zeitplan.naechster(plaene, ab, BERLIN);
          const erster = zeitplan.faellige(plaene, ab, t, BERLIN)[0];
          expect([ausdruck, iso(ab), iso(erster)]).toEqual([ausdruck, iso(ab), iso(t)]);
        }
      }
    }
  });

  it('der fruehere von mehreren Ausdruecken', () => {
    const plaene = [zeitplan.lese('0 18 * * *'), zeitplan.lese('0 6 * * *')];
    expect(iso(zeitplan.naechster(plaene, Date.parse('2026-10-05T00:00:00Z'), BERLIN))).toBe(
      '2026-10-05T04:00:00.000Z'
    );
  });
});
