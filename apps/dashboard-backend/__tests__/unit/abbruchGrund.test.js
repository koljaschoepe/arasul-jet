/**
 * Plan 023 E1: Grund und Kennung eines Abbruchs.
 *
 * Geprüft wird vor allem, was die Form garantiert. Die Kennung ist der Faden
 * zwischen dem Satz auf dem Bildschirm und der Zeile im Protokoll; reißt er,
 * ist der ganze Aufwand umsonst, und zwar ohne dass irgendetwas rot wird.
 */

const {
  GRUENDE,
  istGrund,
  kennung,
  abbruchMelden,
  abbruchFesthalten,
  abbruchText,
  grundAusFehler,
} = require('../../src/services/llm/abbruchGrund');

const JOB = '3f2a9155-1234-4321-9876-abcdefabcdef';

describe('abbruchGrund', () => {
  describe('Kennung', () => {
    it('ist aus Job-Id und Grund ableitbar, nicht zufällig', () => {
      expect(kennung(JOB, 'stream_still')).toBe('ABB-3f2a91-stream_still');
      expect(kennung(JOB, 'stream_still')).toBe(kennung(JOB, 'stream_still'));
    });

    it('trennt zwei Läufe mit demselben Grund', () => {
      const anderer = '99887766-1111-2222-3333-444455556666';
      expect(kennung(JOB, 'nutzer')).not.toBe(kennung(anderer, 'nutzer'));
    });

    it('macht aus einem unbekannten Grund kein unbekanntes Format', () => {
      expect(kennung(JOB, 'ausgedacht')).toBe('ABB-3f2a91-unbekannt');
    });

    it('kommt auch ohne Job-Id zu einer Kennung', () => {
      expect(kennung(null, 'nutzer')).toBe('ABB-ohnejo-nutzer');
    });
  });

  describe('GRUENDE', () => {
    it('sind alle deutsch und enden als Satz', () => {
      for (const [schluessel, satz] of Object.entries(GRUENDE)) {
        expect(satz).toMatch(/\.$/);
        expect(schluessel).toMatch(/^[a-z_]+$/);
      }
    });

    it('tragen keinen Gedankenstrich als Trenner', () => {
      for (const satz of Object.values(GRUENDE)) {
        expect(satz).not.toContain(' — ');
      }
    });

    it('sind eingefroren, damit niemand zur Laufzeit einen Grund erfindet', () => {
      // Object.freeze wirft nur im strict mode; diese Datei ist CommonJS.
      // Geprüft wird deshalb die Wirkung, nicht die Ausnahme: die Zuweisung
      // verpufft, und istGrund bleibt bei seinem Nein.
      GRUENDE.neu = 'x';
      expect(GRUENDE.neu).toBeUndefined();
      expect(istGrund('neu')).toBe(false);
    });

    it('kennt jeden Grund, den istGrund bejaht', () => {
      expect(istGrund('nutzer')).toBe(true);
      expect(istGrund('gibtsnicht')).toBe(false);
    });
  });

  describe('abbruchMelden', () => {
    it('schreibt eine Zeile in fester, durchsuchbarer Form', () => {
      const log = { warn: jest.fn(), info: jest.fn() };
      const k = abbruchMelden({
        log,
        jobId: JOB,
        grund: 'stream_still',
        quelle: 'test.stelle',
        detail: 'vor dem ersten Zeichen',
        nachMs: 125_000,
      });
      expect(k).toBe('ABB-3f2a91-stream_still');
      const zeile = log.warn.mock.calls[0][0];
      expect(zeile).toContain('[ABBRUCH]');
      expect(zeile).toContain('kennung=ABB-3f2a91-stream_still');
      expect(zeile).toContain('grund=stream_still');
      expect(zeile).toContain('quelle=test.stelle');
      expect(zeile).toContain('nach=125s');
      expect(zeile).toContain('detail="vor dem ersten Zeichen"');
    });

    it('meldet einen Nutzer-Abbruch als Information, nicht als Warnung', () => {
      const log = { warn: jest.fn(), info: jest.fn() };
      abbruchMelden({ log, jobId: JOB, grund: 'nutzer', quelle: 't', fehler: false });
      expect(log.warn).not.toHaveBeenCalled();
      expect(log.info).toHaveBeenCalledTimes(1);
    });

    it('kürzt ein überlanges Detail, statt das Protokoll zu fluten', () => {
      const log = { warn: jest.fn(), info: jest.fn() };
      abbruchMelden({ log, jobId: JOB, grund: 'werkzeug', quelle: 't', detail: 'x'.repeat(5000) });
      expect(log.warn.mock.calls[0][0].length).toBeLessThan(600);
    });

    it('läuft auch ohne Logger durch', () => {
      expect(() => abbruchMelden({ jobId: JOB, grund: 'nutzer', quelle: 't' })).not.toThrow();
    });
  });

  describe('abbruchFesthalten', () => {
    it('schreibt Grund, Kennung und Detail an die Job-Zeile', async () => {
      const database = { query: jest.fn().mockResolvedValue({ rows: [] }) };
      await abbruchFesthalten({
        database,
        log: {},
        jobId: JOB,
        grund: 'lauf_zeitlimit',
        kennung: 'ABB-3f2a91-lauf_zeitlimit',
        detail: 'Zeitlimit erreicht',
      });
      const [sql, werte] = database.query.mock.calls[0];
      expect(sql).toContain('abbruch_grund');
      expect(sql).toContain('abbruch_kennung');
      expect(werte).toEqual([
        JOB,
        'lauf_zeitlimit',
        'ABB-3f2a91-lauf_zeitlimit',
        'Zeitlimit erreicht',
      ]);
    });

    it('ersetzt den echten Grund NICHT durch einen Datenbankfehler', async () => {
      // Genau dieser Fehler ist am 22.08.2026 in D9 schon einmal passiert:
      // die Buchführung warf, und ihr Fehler verdrängte die ehrliche Ursache.
      const database = { query: jest.fn().mockRejectedValue(new Error('Spalte fehlt')) };
      const log = { error: jest.fn() };
      await expect(
        abbruchFesthalten({ database, log, jobId: JOB, grund: 'nutzer', kennung: 'k' })
      ).resolves.toBeUndefined();
      expect(log.error).toHaveBeenCalled();
    });

    it('tut ohne Datenbank oder ohne Job-Id nichts', async () => {
      await expect(abbruchFesthalten({ jobId: JOB, grund: 'nutzer', kennung: 'k' })).resolves
        .toBeUndefined();
      const database = { query: jest.fn() };
      await abbruchFesthalten({ database, jobId: null, grund: 'nutzer', kennung: 'k' });
      expect(database.query).not.toHaveBeenCalled();
    });
  });

  describe('abbruchText', () => {
    it('trägt Satz und Kennung, damit die Meldung ein Suchbegriff wird', () => {
      const text = abbruchText('stream_still', 'ABB-3f2a91-stream_still');
      expect(text).toContain('Das Modell hat zu lange nichts mehr geschickt.');
      expect(text).toContain('Kennung ABB-3f2a91-stream_still');
      expect(text.startsWith('\n\n_')).toBe(true);
      expect(text.endsWith('._')).toBe(true);
    });

    it('fällt bei unbekanntem Grund auf einen ehrlichen Satz zurück', () => {
      expect(abbruchText('ausgedacht', 'k')).toContain('unerwartet geendet');
    });

    it('passt zum Wächter der Oberfläche, der ein Doppel verhindert', () => {
      // ChatContext prüft mit /_Abgebrochen\.?_\s*$/ auf einen schon
      // vorhandenen Marker. Der neue Text muss davor bestehen, sonst hängt
      // die Oberfläche beim Nachladen ein zweites „_Abgebrochen._" an.
      const text = abbruchText('nutzer', 'ABB-3f2a91-nutzer').trimStart();
      expect(text).toMatch(/^_Abgebrochen: .+ Kennung .+\._$/);
    });
  });

  describe('grundAusFehler', () => {
    it.each([
      ['Modell-Stream 120s ohne Daten, abgebrochen', 'stream_still'],
      ['connect ECONNREFUSED 127.0.0.1:11434', 'modell_weg'],
      ['socket hang up', 'modell_weg'],
      ['Request timed out', 'lauf_zeitlimit'],
      ['irgendwas ganz anderes', 'unbekannt'],
    ])('ordnet %s zu %s', (roh, erwartet) => {
      expect(grundAusFehler(new Error(roh))).toBe(erwartet);
    });

    it('rät nie an einer Stelle, die den Grund kennt', () => {
      // Absichtsprüfung: grundAusFehler ist der Notnagel, nicht der Normalweg.
      // Ein leerer Fehler darf nicht als konkreter Grund durchgehen.
      expect(grundAusFehler(null)).toBe('unbekannt');
      expect(grundAusFehler('')).toBe('unbekannt');
    });
  });
});

/**
 * Plan 023 E2, gefunden bei der Live-Abnahme: ein Abbruch ZWISCHEN zwei Runden.
 *
 * Der Stopp-Knopf beendete am 22.08.2026 einen Lauf, der 32 Minuten gelaufen
 * war. In der Datenbank stand alles richtig (`nutzer`, `ABB-f4fd66-nutzer`), im
 * Chat aber nur der nackte Satz `_Abgebrochen._`. Der Grund: dieser Weg
 * verlaesst die Runden-Schleife, ohne zu werfen, und der catch-Zweig, der die
 * Kennung setzt, laeuft nie.
 *
 * Die Lehre steckt in `kennung`: sie ist aus Job-Id und Grund ABLEITBAR. Wo
 * keine mitgefuehrt wurde, wird sie hergeleitet, statt sie wegzulassen.
 */
describe('Kennung als Notnagel (Plan 023 E2)', () => {
  it('laesst sich jederzeit aus Job und Grund herleiten', () => {
    expect(kennung(JOB, 'nutzer')).toBe('ABB-3f2a91-nutzer');
    expect(abbruchText('nutzer', kennung(JOB, 'nutzer'))).toContain('Kennung ABB-3f2a91-nutzer');
  });

  it('ergibt denselben Satz wie der Weg ueber den catch-Zweig', () => {
    // Sonst stuende im Chat je nach Weg etwas anderes, und der Nutzer koennte
    // aus dem Satz nicht schliessen, wonach er suchen soll.
    const ueberCatch = abbruchText('nutzer', 'ABB-3f2a91-nutzer');
    const ueberNotnagel = abbruchText('nutzer', kennung(JOB, 'nutzer'));
    expect(ueberNotnagel).toBe(ueberCatch);
  });
});
