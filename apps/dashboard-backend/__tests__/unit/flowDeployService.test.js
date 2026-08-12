/**
 * Flow-Deploy (Plan 017 Schritt 3) — Import/Aktivierung/Pause/Löschen eines
 * Flow-Erweiterungs-Workflows über die n8n-API. axios ist gemockt; geprüft
 * werden die aufgerufenen Endpunkte, das idempotente Verhalten (404) und die
 * sichtbare Degradierung bei n8n-Ausfall.
 */

jest.mock('axios');
jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('fs/promises', () => ({ readFile: jest.fn() }));

const axios = require('axios');
const fsp = require('fs/promises');
const flowDeployService = require('../../src/services/extensions/flowDeployService');
const { ServiceUnavailableError, ValidationError } = require('../../src/utils/errors');

const WF = { name: 'Beispiel', nodes: [{ id: 'a' }], connections: {}, settings: {} };

function flowExt(overrides = {}) {
  return {
    id: 'mein-flow',
    name: 'Mein Flow',
    type: 'flow',
    manifest: { entry: 'workflow.json' },
    n8nWorkflowId: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  fsp.readFile.mockResolvedValue(JSON.stringify(WF));
});

describe('flowDeployService.liveSchalten', () => {
  test('neuer Workflow: POST create + activate, liefert die ID', async () => {
    axios.post.mockImplementation(async url => {
      if (url.endsWith('/workflows')) {
        return { data: { id: 'wf-123' } };
      }
      return { data: {} }; // activate
    });

    const id = await flowDeployService.liveSchalten(flowExt());

    expect(id).toBe('wf-123');
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/workflows$/),
      expect.objectContaining({ name: 'Beispiel', nodes: WF.nodes }),
      expect.any(Object)
    );
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringMatching(/\/workflows\/wf-123\/activate$/),
      {},
      expect.any(Object)
    );
  });

  test('bestehende ID: PUT überschreibt denselben Workflow', async () => {
    axios.put.mockResolvedValue({ data: { id: 'wf-9' } });
    axios.post.mockResolvedValue({ data: {} });

    const id = await flowDeployService.liveSchalten(flowExt({ n8nWorkflowId: 'wf-9' }));

    expect(id).toBe('wf-9');
    expect(axios.put).toHaveBeenCalledWith(
      expect.stringMatching(/\/workflows\/wf-9$/),
      expect.any(Object),
      expect.any(Object)
    );
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringMatching(/\/workflows\/wf-9\/activate$/),
      {},
      expect.any(Object)
    );
  });

  test('verschwundene ID (404 bei PUT) → Neuanlage', async () => {
    axios.put.mockRejectedValue({ response: { status: 404 } });
    axios.post.mockImplementation(async url =>
      url.endsWith('/workflows') ? { data: { id: 'wf-neu' } } : { data: {} }
    );

    const id = await flowDeployService.liveSchalten(flowExt({ n8nWorkflowId: 'wf-alt' }));
    expect(id).toBe('wf-neu');
  });

  test('n8n nicht erreichbar → ServiceUnavailableError', async () => {
    axios.post.mockRejectedValue({ code: 'ECONNREFUSED' });
    await expect(flowDeployService.liveSchalten(flowExt())).rejects.toThrow(
      ServiceUnavailableError
    );
  });

  test('kaputte workflow.json → ValidationError', async () => {
    fsp.readFile.mockResolvedValue('kein json');
    await expect(flowDeployService.liveSchalten(flowExt())).rejects.toThrow(ValidationError);
  });

  test('workflow.json ohne nodes → ValidationError', async () => {
    fsp.readFile.mockResolvedValue(JSON.stringify({ name: 'x' }));
    await expect(flowDeployService.liveSchalten(flowExt())).rejects.toThrow(ValidationError);
  });
});

describe('flowDeployService.pausieren / entfernen', () => {
  test('pausieren ruft deactivate', async () => {
    axios.post.mockResolvedValue({ data: {} });
    await flowDeployService.pausieren(flowExt({ n8nWorkflowId: 'wf-1' }));
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringMatching(/\/workflows\/wf-1\/deactivate$/),
      {},
      expect.any(Object)
    );
  });

  test('pausieren ohne Workflow-ID ist ein No-op', async () => {
    await flowDeployService.pausieren(flowExt({ n8nWorkflowId: null }));
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('pausieren toleriert 404 (schon weg)', async () => {
    axios.post.mockRejectedValue({ response: { status: 404 } });
    await expect(
      flowDeployService.pausieren(flowExt({ n8nWorkflowId: 'wf-x' }))
    ).resolves.toBeUndefined();
  });

  test('entfernen ruft DELETE und schluckt Fehler', async () => {
    axios.delete.mockRejectedValue({ code: 'ECONNREFUSED' });
    await expect(
      flowDeployService.entfernen(flowExt({ n8nWorkflowId: 'wf-1' }))
    ).resolves.toBeUndefined();
    expect(axios.delete).toHaveBeenCalled();
  });

  test('entfernen schluckt auch beliebige HTTP-Fehler (bricht nie)', async () => {
    axios.delete.mockRejectedValue({ response: { status: 500 } });
    await expect(
      flowDeployService.entfernen(flowExt({ n8nWorkflowId: 'wf-1' }))
    ).resolves.toBeUndefined();
  });
});

describe('flowDeployService.status', () => {
  test('nicht importiert → importiert:false', async () => {
    const s = await flowDeployService.status(flowExt({ n8nWorkflowId: null }));
    expect(s).toEqual({ erreichbar: true, importiert: false, aktiv: false });
  });

  test('aktiver Workflow inkl. letztem Lauf', async () => {
    axios.get.mockImplementation(async url => {
      if (/\/workflows\/wf-1$/.test(url)) {
        return { data: { active: true } };
      }
      return { data: { data: [{ startedAt: '2026-08-12T10:00:00Z', status: 'success' }] } };
    });
    const s = await flowDeployService.status(flowExt({ n8nWorkflowId: 'wf-1' }));
    expect(s.aktiv).toBe(true);
    expect(s.letzterLauf.status).toBe('success');
  });

  test('n8n-Ausfall → erreichbar:false statt Fehler', async () => {
    axios.get.mockRejectedValue({ code: 'ETIMEDOUT' });
    const s = await flowDeployService.status(flowExt({ n8nWorkflowId: 'wf-1' }));
    expect(s.erreichbar).toBe(false);
  });

  test('gemerkte ID in n8n verschwunden (404) → importiert:false', async () => {
    axios.get.mockRejectedValue({ response: { status: 404 } });
    const s = await flowDeployService.status(flowExt({ n8nWorkflowId: 'weg' }));
    expect(s).toEqual({ erreichbar: true, importiert: false, aktiv: false });
  });

  test('App-Erweiterung hat keinen Flow-Status', async () => {
    const s = await flowDeployService.status(flowExt({ type: 'app' }));
    expect(s).toBeNull();
  });
});
