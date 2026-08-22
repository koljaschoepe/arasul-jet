/**
 * Was ein Flow HAT, muss ueber die API auch setzbar sein (Plan 023 I2).
 *
 * `FlowDefinition` beschreibt, was ein Flow ist. `SaveFlowBody` beschreibt, was
 * die API entgegennimmt, und ist `.strict()`. Faellt dort ein Feld weg, wird
 * jeder Aufruf abgewiesen, der es nennt:
 *
 *   POST /api/flows  ->  Unrecognized key: "betriebsart"
 *
 * Genau das war am 22.08.2026 der Fall. `betriebsart` gab es seit I2 in der
 * Definition, aber nicht im API-Schema. Damit war die gesamte
 * Rueckfrage-Betriebsart ueber den normalen Weg unerreichbar, einschliesslich
 * des `angebot`-Beispiels, das sie vorfuehren soll. Aufgefallen beim Versuch,
 * es aus dem Katalog anzulegen, also beim BENUTZEN.
 *
 * Dieselbe Klasse Fehler wie bei `BRUECKE_FAEHIGKEITEN` und den nicht
 * exportierten Bruecken-Schemata: zwei Listen, die dasselbe meinen, und keine
 * prueft die andere.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';

const fs = require('fs');
const path = require('path');
const { CreateFlowBody } = require('../../src/schemas/flows');

/**
 * Die Feldnamen aus dem `z.object({...})` von `FlowDefinition`, aus der Quelle
 * gelesen.
 *
 * Warum nicht `FlowDefinition.shape`: die Definition endet auf
 * `.superRefine(...)` und ist damit ein ZodEffects, das `shape` nicht
 * durchreicht. Sie deshalb zu exportieren, nur damit ein Test sie sieht, waere
 * eine Aenderung am Code fuer den Test. Der Quelltext ist hier die ehrlichere
 * Quelle.
 */
function felderAusDefinition() {
  const quelle = fs.readFileSync(path.join(__dirname, '../../src/schemas/flows.js'), 'utf8');
  const start = quelle.indexOf('const FlowDefinition = z');
  expect(start).toBeGreaterThan(-1);
  const ende = quelle.indexOf('.superRefine', start);
  const block = quelle.slice(start, ende > -1 ? ende : start + 4000);
  // Feldnamen stehen auf Ebene vier Leerzeichen, direkt vor einem Doppelpunkt.
  return [...new Set([...block.matchAll(/^ {4}([a-zA-Z][a-zA-Z0-9_]*):/gm)].map(m => m[1]))];
}

describe('Flow-Schema: Definition und API-Rumpf passen zusammen', () => {
  // Felder, die es im API-Rumpf bewusst NICHT gibt, mit dem Grund dafuer.
  // Eine Ausnahme ohne Begruendung waere eine Luecke mit besserer Tarnung.
  const AUSNAHMEN = {
    name: 'kommt beim Anlegen aus dem eigenen Feld, beim Aendern aus der URL',
    systemPrompt: 'heisst im Rumpf `prompt` (siehe fromApi in routes/flows.js)',
  };

  test('jedes Feld eines Flows ist ueber die API setzbar', () => {
    const inDefinition = felderAusDefinition();
    expect(inDefinition.length).toBeGreaterThan(5);
    const imRumpf = new Set(Object.keys(CreateFlowBody.shape));
    const fehlend = inDefinition.filter(f => !imRumpf.has(f) && !(f in AUSNAHMEN));
    expect(fehlend).toEqual([]);
  });

  test('die Betriebsart, an der es aufgefallen ist', () => {
    const r = CreateFlowBody.safeParse({
      name: 'probe',
      prompt: 'Ein Prompt.',
      betriebsart: 'rueckfragen',
    });
    expect(r.success).toBe(true);
    expect(r.data.betriebsart).toBe('rueckfragen');
  });

  test('eine unbekannte Betriebsart wird weiterhin abgewiesen', () => {
    const r = CreateFlowBody.safeParse({
      name: 'probe',
      prompt: 'Ein Prompt.',
      betriebsart: 'irgendwas',
    });
    expect(r.success).toBe(false);
  });
});
