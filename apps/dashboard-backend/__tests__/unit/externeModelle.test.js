/**
 * Plan 023 D9: externes Cloud-Modell dazuschalten.
 *
 * Geprueft wird hier, was ohne Netz pruefbar ist und was wehtut, wenn es
 * kippt: die Trennlinie zwischen lokal und extern, das Deuten der beiden
 * unterschiedlichen Ereignisstroeme, und die drei Zusagen der Abnahme.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-geheimnis-fuer-die-verschluesselung';

const registry = require('../../src/services/llm/extern/providerRegistry');
const { zeileDeuten } = require('../../src/services/llm/extern/adapter');

describe('providerRegistry: die Trennlinie zwischen lokal und extern', () => {
  test('eine lokale Kennung ist nicht extern', () => {
    for (const id of ['qwen3-coder:30b', 'gemma3:4b', 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS']) {
      expect(registry.istExtern(id)).toBe(false);
      expect(registry.zerlegeId(id)).toBeNull();
    }
  });

  test('eine externe Kennung laesst sich hin und zurueck uebersetzen', () => {
    const id = registry.externeId('anthropic', 'claude-sonnet-4-5');
    expect(id).toBe('extern:anthropic/claude-sonnet-4-5');
    expect(registry.istExtern(id)).toBe(true);
    expect(registry.zerlegeId(id)).toEqual({
      anbieter: 'anthropic',
      modell: 'claude-sonnet-4-5',
    });
  });

  test('ein Modellname mit Schraegstrich ueberlebt das Zerlegen', () => {
    // Bei OpenAI kommen Kennungen wie "ft:gpt-4o:meine-firma::abc" vor, und
    // ein Anbieter kann jederzeit einen Schraegstrich einfuehren. Zerlegt
    // wird deshalb am ERSTEN Schraegstrich, der Rest bleibt der Modellname.
    const id = registry.externeId('openai', 'org/modell/variante');
    expect(registry.zerlegeId(id)).toEqual({
      anbieter: 'openai',
      modell: 'org/modell/variante',
    });
  });

  test('ein unbekannter Anbieter mit Praefix gilt als extern, aber ungueltig', () => {
    // Der Unterschied ist load-bearing: die Kennung darf NICHT still zum
    // lokalen Pfad durchrutschen (deshalb istExtern true), und sie darf auch
    // nicht ausgefuehrt werden (deshalb zerlegeId null).
    expect(registry.istExtern('extern:erfunden/x')).toBe(true);
    expect(registry.zerlegeId('extern:erfunden/x')).toBeNull();
  });

  test('kaputte Kennungen ergeben null statt eines halben Ergebnisses', () => {
    for (const id of ['extern:', 'extern:anthropic', 'extern:/modell', 'extern:anthropic/', '']) {
      expect(registry.zerlegeId(id)).toBeNull();
    }
  });
});

describe('adapter: die zwei Ereignisstroeme deuten', () => {
  test('Anthropic liefert Text in content_block_delta', () => {
    const roh = JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'Hallo' },
    });
    expect(zeileDeuten('anthropic', roh)).toEqual({ text: 'Hallo' });
  });

  test('OpenAI liefert Text in choices[0].delta.content', () => {
    const roh = JSON.stringify({ choices: [{ delta: { content: 'Hallo' } }] });
    expect(zeileDeuten('openai', roh)).toEqual({ text: 'Hallo' });
  });

  test('beide Enden werden erkannt, obwohl sie verschieden aussehen', () => {
    expect(zeileDeuten('openai', '[DONE]')).toEqual({ fertig: true });
    expect(zeileDeuten('anthropic', JSON.stringify({ type: 'message_stop' }))).toEqual({
      fertig: true,
    });
  });

  test('die Tokenzahlen kommen aus beiden Stroemen an', () => {
    expect(
      zeileDeuten(
        'anthropic',
        JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 42 } } })
      )
    ).toEqual({ vorlauf: 42 });
    expect(
      zeileDeuten(
        'anthropic',
        JSON.stringify({ type: 'message_delta', usage: { output_tokens: 7 } })
      )
    ).toEqual({ ausgabe: 7 });
    expect(
      zeileDeuten(
        'openai',
        JSON.stringify({ usage: { prompt_tokens: 42, completion_tokens: 7 }, choices: [] })
      )
    ).toEqual({ vorlauf: 42, ausgabe: 7 });
  });

  test('ein Fehler im Anthropic-Strom wird geworfen, nicht verschluckt', () => {
    const roh = JSON.stringify({ type: 'error', error: { message: 'overloaded' } });
    expect(() => zeileDeuten('anthropic', roh)).toThrow(/overloaded/);
  });

  test('unbrauchbare Zeilen ergeben null, statt den Strom zu sprengen', () => {
    expect(zeileDeuten('openai', 'kein json')).toBeNull();
    expect(zeileDeuten('anthropic', JSON.stringify({ type: 'ping' }))).toBeNull();
    // Ein leeres Textstueck ist kein Text: OpenAI schickt beim ersten Chunk
    // ein delta mit content "", und das darf nicht als Token durchgehen.
    expect(zeileDeuten('openai', JSON.stringify({ choices: [{ delta: { content: '' } }] })))
      .toBeNull();
  });
});

describe('die drei Zusagen der Abnahme', () => {
  let externeModelle;
  let speicher;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../src/services/llm/extern/schluesselSpeicher', () => ({
      aktiveAnbieter: jest.fn(),
      schluesselLesen: jest.fn(),
      ergebnisFesthalten: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock('../../src/services/llm/extern/adapter', () => ({
      modelleHolen: jest.fn(),
      antwortStroemen: jest.fn(),
    }));
    jest.doMock('../../src/middleware/audit', () => ({
      writeAuditLog: jest.fn().mockResolvedValue(undefined),
    }));
    speicher = require('../../src/services/llm/extern/schluesselSpeicher');
    externeModelle = require('../../src/services/llm/extern/externeModelle');
    externeModelle.speicherLeeren();
  });

  test('ohne eingeschalteten Anbieter taucht nichts auf', async () => {
    speicher.aktiveAnbieter.mockResolvedValue([]);
    await expect(externeModelle.modelleListen()).resolves.toEqual([]);
  });

  test('ein hinterlegter Schluessel macht die Modelle waehlbar, als extern gekennzeichnet', async () => {
    speicher.aktiveAnbieter.mockResolvedValue(['anthropic']);
    speicher.schluesselLesen.mockResolvedValue('sk-ant-test');
    require('../../src/services/llm/extern/adapter').modelleHolen.mockResolvedValue([
      { id: 'claude-x', name: 'Claude X' },
    ]);

    const liste = await externeModelle.modelleListen();
    expect(liste).toHaveLength(1);
    expect(liste[0].id).toBe('extern:anthropic/claude-x');
    expect(liste[0].extern).toBe(true);
    expect(liste[0].anbieter_name).toBe('Anthropic');
    // Ein Cloud-Modell belegt auf diesem Gerät keinen Speicher. Stünde hier
    // eine Zahl, rechnete die Speicheranzeige sie mit.
    expect(liste[0].ram_required_gb).toBe(0);
  });

  test('ein eingeschalteter Anbieter ohne Schluessel liefert trotzdem nichts', async () => {
    speicher.aktiveAnbieter.mockResolvedValue(['openai']);
    speicher.schluesselLesen.mockResolvedValue(null);
    await expect(externeModelle.modelleListen()).resolves.toEqual([]);
  });

  test('ein ausgeschalteter Anbieter antwortet auch dann nicht, wenn die Kennung von Hand kommt', async () => {
    // Der Plan verlangt "standardmaessig aus". Das muss auch halten, wenn
    // jemand die Modell-Id direkt an die Schnittstelle schickt, statt sie in
    // der Oberflaeche auszuwaehlen.
    speicher.aktiveAnbieter.mockResolvedValue([]);
    speicher.schluesselLesen.mockResolvedValue('sk-ant-test');
    await expect(
      externeModelle.antworten({
        modellId: 'extern:anthropic/claude-x',
        nachrichten: [{ role: 'user', content: 'Hallo' }],
        aufToken: () => {},
      })
    ).rejects.toThrow(/nicht eingeschaltet/);
  });

  test('eine ungueltige Kennung wird abgewiesen, nicht geraten', async () => {
    speicher.aktiveAnbieter.mockResolvedValue(['anthropic']);
    await expect(
      externeModelle.antworten({
        modellId: 'extern:erfunden/x',
        nachrichten: [],
        aufToken: () => {},
      })
    ).rejects.toThrow(/keine gültige Kennung/);
  });

  test('jede externe Anfrage steht im Pruefprotokoll, auch eine gescheiterte', async () => {
    const { writeAuditLog } = require('../../src/middleware/audit');
    speicher.aktiveAnbieter.mockResolvedValue(['openai']);
    speicher.schluesselLesen.mockResolvedValue('sk-test');
    require('../../src/services/llm/extern/adapter').antwortStroemen.mockRejectedValue(
      new Error('Anbieter down')
    );

    await expect(
      externeModelle.antworten({
        modellId: 'extern:openai/gpt-x',
        nachrichten: [{ role: 'user', content: 'Hallo' }],
        aufToken: () => {},
      })
    ).rejects.toThrow('Anbieter down');

    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    const eintrag = writeAuditLog.mock.calls[0][0];
    expect(eintrag.action_type).toBe('externes_modell');
    expect(eintrag.request_payload.anbieter).toBe('openai');
    expect(eintrag.error_message).toBe('Anbieter down');
  });

  test('das Pruefprotokoll haelt fest, WAS ging, nicht den Text', async () => {
    const { writeAuditLog } = require('../../src/middleware/audit');
    speicher.aktiveAnbieter.mockResolvedValue(['openai']);
    speicher.schluesselLesen.mockResolvedValue('sk-test');
    require('../../src/services/llm/extern/adapter').antwortStroemen.mockResolvedValue({
      text: 'Antwort',
      vorlauf: 100,
      ausgabe: 5,
    });

    await externeModelle.antworten({
      modellId: 'extern:openai/gpt-x',
      nachrichten: [{ role: 'user', content: 'Das Geheimnis ist 42' }],
      aufToken: () => {},
    });

    const eintrag = require('../../src/middleware/audit').writeAuditLog.mock.calls[0][0];
    const alsText = JSON.stringify(eintrag);
    expect(alsText).not.toContain('Das Geheimnis ist 42');
    expect(eintrag.request_payload.zeichen_gesendet).toBe('Das Geheimnis ist 42'.length);
    expect(eintrag.request_payload.vorlauf_token).toBe(100);
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
  });

  test('ein stiller Anbieter macht die Modellauswahl nicht kaputt', async () => {
    // Faellt ein Anbieter aus, darf die Liste leer bleiben, aber nicht die
    // ganze Modellauswahl mitreissen: die lokalen Modelle stehen in
    // derselben Antwort.
    speicher.aktiveAnbieter.mockResolvedValue(['anthropic']);
    speicher.schluesselLesen.mockResolvedValue('sk-ant-test');
    require('../../src/services/llm/extern/adapter').modelleHolen.mockRejectedValue(
      new Error('Netz weg')
    );
    await expect(externeModelle.modelleListen()).resolves.toEqual([]);
    expect(speicher.ergebnisFesthalten).toHaveBeenCalledWith('anthropic', 'Netz weg');
  });

  test('die Modellliste wird zwischengespeichert, statt bei jedem Blick ins Netz zu gehen', async () => {
    speicher.aktiveAnbieter.mockResolvedValue(['anthropic']);
    speicher.schluesselLesen.mockResolvedValue('sk-ant-test');
    const holen = require('../../src/services/llm/extern/adapter').modelleHolen;
    holen.mockResolvedValue([{ id: 'claude-x', name: 'Claude X' }]);

    await externeModelle.modelleListen();
    await externeModelle.modelleListen();
    expect(holen).toHaveBeenCalledTimes(1);

    await externeModelle.modelleListen({ frisch: true });
    expect(holen).toHaveBeenCalledTimes(2);
  });
});

describe('die Buchhaltung darf den echten Fehler nicht verdraengen', () => {
  /**
   * Am 22.08.2026 am Geraet: `ergebnisFesthalten` scheiterte an einem
   * fehlenden Typ-Cast im SQL, und weil der Aufruf im catch-Zweig steht,
   * ersetzte SEIN Fehler den des Anbieters. Der Nutzer las "Internal server
   * error" statt "Anthropic weist den Schluessel zurueck". Der Cast ist
   * behoben; dieser Test haelt fest, dass die naechste solche Ursache die
   * Diagnose nicht wieder unbrauchbar macht.
   */
  let externeModelle;
  let speicher;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../src/services/llm/extern/schluesselSpeicher', () => ({
      aktiveAnbieter: jest.fn().mockResolvedValue([]),
      schluesselLesen: jest.fn().mockResolvedValue('sk-test'),
      ergebnisFesthalten: jest.fn().mockRejectedValue(new Error('could not determine data type')),
    }));
    jest.doMock('../../src/services/llm/extern/adapter', () => ({
      modelleHolen: jest.fn().mockRejectedValue(new Error('Anthropic weist den Schlüssel zurück')),
      antwortStroemen: jest.fn(),
    }));
    jest.doMock('../../src/middleware/audit', () => ({
      writeAuditLog: jest.fn().mockResolvedValue(undefined),
    }));
    speicher = require('../../src/services/llm/extern/schluesselSpeicher');
    externeModelle = require('../../src/services/llm/extern/externeModelle');
    externeModelle.speicherLeeren();
  });

  test('scheitert das Festhalten, kommt trotzdem der Fehler des Anbieters an', async () => {
    await expect(externeModelle.schluesselPruefen('anthropic')).rejects.toThrow(
      'Anthropic weist den Schlüssel zurück'
    );
    expect(speicher.ergebnisFesthalten).toHaveBeenCalled();
  });

  test('und die Modellliste bleibt leer, statt zu werfen', async () => {
    await expect(externeModelle.modelleEinesAnbieters('anthropic')).resolves.toEqual([]);
  });
});
