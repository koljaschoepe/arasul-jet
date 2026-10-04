/**
 * Verwaltung Modelle (M5): wer ein Modell nutzt und warum es gesperrt ist.
 *
 * Geprueft wird, was der Auftrag abnimmt: ein Flow, der ein Modell im Kopf, in
 * einer Rolle, an einem Schritt oder per Wahl des Admins nennt, nutzt es; ein
 * Flow ohne Modell nutzt den Standard; Entfernen eines genutzten Modells und des
 * Standards ist ein 409, das die Flows nennt.
 */

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/services/llm/modelService', () => ({
  getDefaultModel: jest.fn(),
  getLoadedModels: jest.fn(),
}));
jest.mock('../../src/services/flows/schrittModelle', () => ({ installierte: jest.fn() }));
jest.mock('../../src/services/llm/freiesModell', () => ({ pruefe: jest.fn() }));

const db = require('../../src/database');
const modelService = require('../../src/services/llm/modelService');
const schrittModelle = require('../../src/services/flows/schrittModelle');
const freiesModell = require('../../src/services/llm/freiesModell');
const verwaltung = require('../../src/services/llm/modellVerwaltung');

const MODELLE = [
  { id: 'gross', name: 'Groß', ollama_name: 'gross:27b', faehigkeiten: { text: true } },
  { id: 'klein', name: 'Klein', ollama_name: 'klein:4b', faehigkeiten: { text: true } },
  { id: 'frei', name: 'Frei', ollama_name: 'frei:1b', faehigkeiten: { text: true } },
];

function flowsLesen({ flows = [], wahlen = [] }) {
  db.query.mockImplementation(async sql => {
    if (sql.includes('FROM public.app_flows')) return { rows: flows };
    if (sql.includes('flow_schritt_modelle')) return { rows: wahlen };
    return { rows: [] };
  });
}

describe('modellVerwaltung', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    schrittModelle.installierte.mockResolvedValue(MODELLE);
    modelService.getDefaultModel.mockResolvedValue('gross');
  });

  describe('nutzung', () => {
    test('Kopf, Rolle, Schritt und Wahl des Admins zaehlen; ohne Modell im Kopf der Standard', async () => {
      flowsLesen({
        flows: [
          { app_id: 'a', app_name: 'App A', name: 'f1', definition: { modell: 'klein:4b' } },
          {
            app_id: 'a',
            app_name: 'App A',
            name: 'f2',
            definition: { rollen: [{ name: 'r', modell: 'frei' }], schritte: [] },
          },
          { app_id: 'b', app_name: 'App B', name: 'f3', definition: { modell: 'gross' } },
        ],
        wahlen: [{ app_id: 'b', flow_name: 'f3', modell: 'klein' }],
      });

      const wo = await verwaltung.nutzung(MODELLE, 'gross');

      expect(
        wo
          .get('klein')
          .map(f => f.flow)
          .sort()
      ).toEqual(['f1', 'f3']);
      expect(wo.get('frei').map(f => f.flow)).toEqual(['f2']);
      // f2 nennt im Kopf keines und rechnet mit dem Standard; f3 nennt es.
      expect(
        wo
          .get('gross')
          .map(f => f.flow)
          .sort()
      ).toEqual(['f2', 'f3']);
    });

    test('ein Flow in zwei Staenden zaehlt einmal', async () => {
      const def = { modell: 'klein' };
      flowsLesen({
        flows: [
          { app_id: 'a', app_name: 'A', name: 'f', definition: def },
          { app_id: 'a', app_name: 'A', name: 'f', definition: def },
        ],
      });
      expect((await verwaltung.nutzung(MODELLE, 'gross')).get('klein')).toHaveLength(1);
    });
  });

  describe('entfernenPruefen', () => {
    test('ein Modell, das ein Flow nutzt, ist ein 409 mit dem Namen des Flows', async () => {
      flowsLesen({
        flows: [{ app_id: 'a', app_name: 'Probe', name: 'beleg', definition: { modell: 'klein' } }],
      });

      const fehler = await verwaltung.entfernenPruefen('klein').catch(e => e);

      expect(fehler.statusCode).toBe(409);
      expect(fehler.message).toContain('„beleg" (Probe)');
      expect(fehler.details.grund).toBe('IN_NUTZUNG');
    });

    test('das Standardmodell ist gesperrt, auch ohne nutzenden Flow', async () => {
      flowsLesen({});
      const fehler = await verwaltung.entfernenPruefen('gross').catch(e => e);
      expect(fehler.statusCode).toBe(409);
      expect(fehler.message).toContain('Standardmodell');
    });

    test('ein nicht genutztes Modell darf gehen', async () => {
      flowsLesen({
        flows: [{ app_id: 'a', app_name: 'A', name: 'f', definition: { modell: 'klein' } }],
      });
      await expect(verwaltung.entfernenPruefen('frei')).resolves.toBeUndefined();
    });

    test('ein Modell, das nicht am Geraet liegt, wird hier nicht gesperrt', async () => {
      flowsLesen({});
      await expect(verwaltung.entfernenPruefen('gibtsnicht')).resolves.toBeUndefined();
    });
  });

  describe('uebersicht', () => {
    test('je Zeile warm, Faehigkeiten, Flows und Sperre; die Liste mit Vorpruefung', async () => {
      modelService.getLoadedModels.mockResolvedValue([{ model_id: 'klein:4b' }]);
      db.query.mockImplementation(async sql => {
        if (sql.includes('FROM public.app_flows')) {
          return {
            rows: [{ app_id: 'a', app_name: 'A', name: 'f', definition: { modell: 'klein' } }],
          };
        }
        if (sql.includes('flow_schritt_modelle')) return { rows: [] };
        if (sql.includes('c.jetson_tested')) {
          return {
            rows: [
              { id: 'klein', size_bytes: '4000000000', jetson_tested: true },
              { id: 'frei', size_bytes: '1000000000', jetson_tested: false },
            ],
          };
        }
        if (sql.includes('LEFT JOIN llm_installed_models')) {
          return {
            rows: [{ id: 'riesig', name: 'Riesig', description: 'x', size_bytes: '90000000000' }],
          };
        }
        return { rows: [] };
      });
      freiesModell.pruefe.mockResolvedValue({ passt: false, grund: 'Zu groß. Kleiner wählen.' });

      const aus = await verwaltung.uebersicht();

      const klein = aus.modelle.find(m => m.id === 'klein');
      expect(klein).toMatchObject({ warm: true, ist_standard: false, groesse_bytes: 4e9 });
      expect(klein.flows).toEqual([{ app_id: 'a', app_name: 'A', flow: 'f' }]);
      expect(klein.sperre).toContain('nutzen');
      expect(aus.modelle.find(m => m.id === 'frei')).toMatchObject({
        warm: false,
        ungemessen: true,
      });
      expect(aus.modelle.find(m => m.id === 'gross').sperre).toContain('Standardmodell');
      expect(aus.liste).toEqual([
        expect.objectContaining({ id: 'riesig', passt: false, grund: 'Zu groß. Kleiner wählen.' }),
      ]);
    });
  });
});
