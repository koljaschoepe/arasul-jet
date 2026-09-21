/**
 * Das Feld `agent` im Manifest (Bruecke, 21.09.2026, J34).
 *
 * DIESE FORM IST NICHT HIER ENTSCHIEDEN WORDEN, und das ist der Grund, warum
 * dieser Test so genau ist. Drei Repositorien sagen dasselbe: das Kit liest
 * das Feld (`arasul.mjs`, `readAgent`), die Werkstatt schreibt es
 * (`apps/belege/app.json`), und dieses Schema nimmt es an. Ein Geraet, das
 * MEHR annimmt als das Kit, laesst ein Manifest durch, mit dem das CLI
 * nachher nichts anfangen kann -- der Partner haette dann ein gueltiges
 * Manifest und eine App, die kein Agent aufrufen kann.
 *
 * Deshalb steht hier nicht nur „das Gute geht durch", sondern jede einzelne
 * Abweisung, die das Kit auch kennt.
 */
const { AppManifest } = require('../../src/schemas/apps');
const appKontrakt = require('../../src/services/app/appKontrakt');

const BASIS = {
  schema: 1,
  id: 'belege',
  name: 'Belege',
  version: '0.3.0',
  frontend: { verzeichnis: 'frontend' },
  backend: { image: 'belege:0.3.0' },
  ports: { backend: 8080 },
};

/** Der erste Befund, oder `null`, wenn das Manifest durchging. */
function befund(agent) {
  const ergebnis = AppManifest.safeParse({ ...BASIS, agent });
  if (ergebnis.success) {
    return null;
  }
  const erste = ergebnis.error.issues[0];
  return { feld: erste.path.join('.'), meldung: erste.message };
}

describe('Eine App darf sagen, welche Routen sie einem Agenten anbietet', () => {
  test('das Feld aus `belege` 0.3.0 geht durch, Wort fuer Wort', () => {
    // Genau die drei Eintraege aus PR 11 der Werkstatt. Wenn dieser Test
    // faellt, rollt diese App am Geraet nicht aus -- das ist die Abnahme.
    const ergebnis = AppManifest.safeParse({
      ...BASIS,
      agent: [
        {
          method: 'GET',
          path: 'lage',
          purpose:
            'Sagt, in welchem Zustand die App ist: Ablage, Modelle, wie viele Belege gerade gelesen werden und was die Rolle des Anfragenden darf.',
          params: [],
          writes: false,
        },
        {
          method: 'GET',
          path: 'belege',
          purpose:
            'Listet alle abgelegten Belege mit ihren Feldern, ihrem Buchungsstand und der Nummer der Ausgangsrechnung, falls es eine ist.',
          params: [],
          writes: false,
        },
        {
          method: 'GET',
          path: 'journal',
          purpose:
            'Liefert alle Zeilen des Journals in ihrer Reihenfolge und sagt, ob die Kette der Abdruecke haelt.',
          params: [],
          writes: false,
        },
      ],
    });
    expect(ergebnis.success).toBe(true);
    expect(ergebnis.data.agent).toHaveLength(3);
  });

  test('eine Route mit Parametern geht durch', () => {
    const ergebnis = AppManifest.safeParse({
      ...BASIS,
      agent: [
        {
          method: 'POST',
          path: 'vorgaenge',
          purpose: 'Einen Vorgang einreichen und damit den Flow freigabe starten.',
          params: [
            { name: 'titel', type: 'string', required: true },
            { name: 'text', type: 'string', required: false },
          ],
          writes: true,
        },
      ],
    });
    expect(ergebnis.success).toBe(true);
  });

  test('ein fuehrender Schraegstrich faellt weg, statt abgewiesen zu werden', () => {
    // `"/lage"` und `"lage"` meinen dasselbe, und wer das eine schreibt, hat
    // nichts falsch gemacht. Das Kit macht es genauso -- eine Abweisung hier
    // waere eine Abweisung, die es dort nicht gibt.
    const ergebnis = AppManifest.safeParse({
      ...BASIS,
      agent: [
        { method: 'GET', path: '/lage', purpose: 'Sagt, wie es steht.', params: [], writes: false },
      ],
    });
    expect(ergebnis.success).toBe(true);
    expect(ergebnis.data.agent[0].path).toBe('lage');
  });

  test('eine App ohne das Feld bleibt gueltig', () => {
    // Jede App vor der Bruecke hat es nicht. Ein Manifest daran scheitern zu
    // lassen hiesse, eine laufende App an einer Auskunft zu messen, die es zu
    // ihrer Bauzeit nicht gab -- dieselbe Entscheidung wie bei `marken` (H6).
    expect(AppManifest.safeParse(BASIS).success).toBe(true);
    expect(AppManifest.safeParse(BASIS).data.agent).toBeUndefined();
  });
});

describe('Ein kaputtes Feld wird abgewiesen, und die Meldung sagt wo', () => {
  const gut = {
    method: 'GET',
    path: 'lage',
    purpose: 'Sagt, wie es steht.',
    params: [],
    writes: false,
  };

  test('kein unbekanntes Feld im Eintrag', () => {
    expect(befund([{ ...gut, beschreibung: 'noch ein Satz' }]).feld).toBe('agent.0');
  });

  test('`method` nur aus den fuenf Verben', () => {
    const b = befund([{ ...gut, method: 'HEAD' }]);
    expect(b.feld).toBe('agent.0.method');
    expect(b.meldung).toMatch(/GET, POST, PUT, PATCH, DELETE/);
  });

  test('PUT, PATCH und DELETE muessen `writes: true` tragen', () => {
    // Eine Route, die etwas aendert, darf sich nicht als lesend ausgeben: das
    // CLI verlangt fuer `writes: true` ein ausdrueckliches --write, und genau
    // daran haengt die Rueckfrage an den Menschen.
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      const b = befund([{ ...gut, method, writes: false }]);
      expect(b.feld).toBe('agent.0.writes');
    }
    expect(befund([{ ...gut, method: 'DELETE', writes: true }])).toBeNull();
  });

  test('`path` fuehrt nicht aus der Schnittstelle der App heraus', () => {
    expect(befund([{ ...gut, path: '../boese' }]).feld).toBe('agent.0.path');
    expect(befund([{ ...gut, path: 'a//b' }]).feld).toBe('agent.0.path');
  });

  test('`path` traegt keine Anfrage', () => {
    // Was dort nicht steht, ruft das CLI nicht auf -- ein `?` im Pfad waere
    // eine zweite Stelle, an der der Aufrufer etwas mitgibt.
    expect(befund([{ ...gut, path: 'belege?alle=1' }]).feld).toBe('agent.0.path');
  });

  test('`purpose` ist ein Satz in einer Zeile', () => {
    expect(befund([{ ...gut, purpose: 'zwei\nZeilen' }]).feld).toBe('agent.0.purpose');
    expect(befund([{ ...gut, purpose: 'x'.repeat(201) }]).feld).toBe('agent.0.purpose');
    expect(befund([{ ...gut, purpose: '  ' }]).feld).toBe('agent.0.purpose');
  });

  test('`params` fehlt nicht, es ist hoechstens leer', () => {
    const ohne = { method: 'GET', path: 'lage', purpose: 'Sagt, wie es steht.', writes: false };
    expect(befund([ohne]).feld).toBe('agent.0.params');
  });

  test('ein Parameter hat Name, Art und Pflicht -- und nichts sonst', () => {
    expect(befund([{ ...gut, params: [{ name: '1x', type: 'string', required: true }] }]).feld).toBe(
      'agent.0.params.0.name'
    );
    expect(befund([{ ...gut, params: [{ name: 'q', type: 'objekt', required: true }] }]).feld).toBe(
      'agent.0.params.0.type'
    );
    expect(befund([{ ...gut, params: [{ name: 'q', type: 'string' }] }]).feld).toBe(
      'agent.0.params.0.required'
    );
    expect(
      befund([{ ...gut, params: [{ name: 'q', type: 'string', required: true, art: 'x' }] }]).feld
    ).toBe('agent.0.params.0');
  });

  test('kein Parametername zweimal je Route', () => {
    const b = befund([
      {
        ...gut,
        params: [
          { name: 'q', type: 'string', required: true },
          { name: 'q', type: 'string', required: false },
        ],
      },
    ]);
    expect(b.feld).toBe('agent.0.params');
  });

  test('keine Route zweimal -- method und path zusammen', () => {
    // Zwei Eintraege fuer denselben Weg waeren zwei Zwecke fuer dieselbe
    // Sache, und das CLI muesste sich einen aussuchen. Auch ueber den
    // fuehrenden Schraegstrich hinweg, denn danach sind es dieselben.
    const b = befund([gut, { ...gut, path: '/lage', purpose: 'Etwas anderes.' }]);
    expect(b.feld).toBe('agent');
    expect(b.meldung).toMatch(/zweimal/);
  });

  test('`agent` ist eine Liste und kein Objekt', () => {
    expect(befund({ lage: 'x' }).feld).toBe('agent');
  });
});

describe('Der Kontrakt nennt das Feld', () => {
  const vertrag = appKontrakt.kontrakt();

  test('die Kontraktversion ist gestiegen', () => {
    // Das Manifest ist `.strict()`: ein Geraet auf Fassung 5 weist ein Paket
    // mit `agent` ab. Genau das ist am 21.09.2026 am Orin passiert.
    expect(vertrag.kontrakt).toBe(6);
  });

  test('das JSON-Schema des Manifests fuehrt `agent`', () => {
    const feld = vertrag.app_json.schema.properties.agent;
    expect(feld.type).toBe('array');
    expect(Object.keys(feld.items.properties).sort()).toEqual([
      'method',
      'params',
      'path',
      'purpose',
      'writes',
    ]);
    expect(feld.items.additionalProperties).toBe(false);
    expect(feld.items.properties.method.enum).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
    expect(feld.items.properties.params.items.properties.type.enum).toEqual([
      'string',
      'number',
      'integer',
      'boolean',
    ]);
  });

  test('was JSON-Schema nicht traegt, steht als Satz daneben', () => {
    // `z.toJSONSchema` uebergeht jede `.refine`-Regel still, und bei `agent`
    // sind das gerade die scharfen: der Pfad, die eine Zeile, das `writes` an
    // PUT/PATCH/DELETE. Ein Kit, das nur das Schema prueft, haelte ein
    // Manifest fuer gueltig, das dieses Geraet abweist.
    const regeln = vertrag.app_json.regeln.join('\n');
    expect(regeln).toMatch(/`agent` nennt die Routen/);
    expect(regeln).toMatch(/RELATIV zur Schnittstelle der App/);
    expect(regeln).toMatch(/`writes: true` tragen/);
    expect(regeln).toMatch(/EINER Zeile/);
  });
});
