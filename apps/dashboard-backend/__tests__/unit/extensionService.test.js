/**
 * Erweiterungs-Register (Plan 012 Phase E · Schritt 16).
 *
 * Der Fokus liegt auf den Grenzen, nicht auf dem Glücksfall:
 *  - `buildFromSandbox` darf NIEMALS aus dem Sandbox-Ordner ausbrechen.
 *  - Ein unbekannter Slug/eine unbekannte Id endet als sauberer Fehler.
 *  - Die DB-Zeile wird verlustfrei auf die API-Form abgebildet.
 */

const path = require('path');

jest.mock('../../src/database', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));
jest.mock('../../src/services/extensions/flowDeployService', () => ({
  liveSchalten: jest.fn(),
  pausieren: jest.fn(),
  entfernen: jest.fn(),
  status: jest.fn(),
}));

const db = require('../../src/database');
const flowDeployService = require('../../src/services/extensions/flowDeployService');
const extensionService = require('../../src/services/extensions/extensionService');
const { SANDBOX_DATA_DIR } = require('../../src/services/sandbox/sandboxShared');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('buildFromSandbox — Ausbruchsschutz', () => {
  it.each([
    ['../..', 'Elternordner'],
    ['../andere-sandbox', 'Nachbar-Sandbox'],
    ['unter/../../raus', 'Umweg über einen Unterordner'],
  ])('weist "%s" ab (%s)', async subfolder => {
    await expect(
      extensionService.buildFromSandbox({ slug: 'werkstatt', subfolder, userId: 1 })
    ).rejects.toThrow(/innerhalb der Sandbox/i);
    // Kein DB-Schreibzugriff, wenn der Pfad nicht passt.
    expect(db.query).not.toHaveBeenCalled();
  });

  it('weist einen unsauberen Slug ab', async () => {
    await expect(
      extensionService.buildFromSandbox({ slug: '../etc', subfolder: '.', userId: 1 })
    ).rejects.toThrow(/Slug/i);
  });

  it('meldet einen nicht existierenden Unterordner als NotFound', async () => {
    // Werkstatt-Check (Plan 017 Schritt 1) besteht, erst der stat() scheitert.
    db.query.mockResolvedValue({ rows: [{ workspace_type: 'erweiterungs-werkstatt' }] });
    await expect(
      extensionService.buildFromSandbox({
        slug: 'werkstatt',
        subfolder: 'gibt-es-nicht',
        userId: 1,
      })
    ).rejects.toThrow(/existiert/i);
  });

  it('weist einen unbekannten Sandbox-Slug als NotFound ab (Plan 017 Schritt 1)', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await expect(
      extensionService.buildFromSandbox({ slug: 'gibt-es-nicht', subfolder: '.', userId: 1 })
    ).rejects.toThrow(/existiert nicht/i);
  });

  it('weist eine Standard-Sandbox ab — nur Erweiterungs-Werkstätten dürfen bauen', async () => {
    db.query.mockResolvedValue({ rows: [{ workspace_type: 'standard' }] });
    await expect(
      extensionService.buildFromSandbox({ slug: 'normale-sandbox', subfolder: '.', userId: 1 })
    ).rejects.toThrow(/Erweiterungs-Werkstatt/i);
  });

  it('die kanonische Werkstatt "werkstatt" braucht keine sandbox_projects-Zeile', async () => {
    // Kein Treffer in sandbox_projects → für den kanonischen Slug trotzdem
    // erlaubt; der Pfad scheitert erst am fehlenden Ordner (NotFound des
    // stat), nicht an der Werkstatt-Prüfung.
    db.query.mockResolvedValue({ rows: [] });
    await expect(
      extensionService.buildFromSandbox({
        slug: 'werkstatt',
        subfolder: 'gibt-es-nicht',
        userId: null,
      })
    ).rejects.toThrow(/Ordner "gibt-es-nicht" existiert/i);
  });

  it('eine ECHTE Standard-Sandbox mit Slug "werkstatt" wird trotzdem geprüft und abgelehnt', async () => {
    // Die Ausnahme gilt nur, wenn KEINE Zeile existiert — eine angelegte
    // Standard-Sandbox namens „werkstatt" darf die Prüfung nicht aushebeln.
    db.query.mockResolvedValue({ rows: [{ workspace_type: 'standard' }] });
    await expect(
      extensionService.buildFromSandbox({ slug: 'werkstatt', subfolder: '.', userId: 1 })
    ).rejects.toThrow(/Erweiterungs-Werkstatt/i);
  });

  it('der geprüfte Pfad liegt unter dem Sandbox-Ordner', () => {
    // Dokumentiert die Basis, gegen die geprüft wird — ändert sie sich,
    // muss der Ausbruchsschutz erneut betrachtet werden.
    const base = path.join(SANDBOX_DATA_DIR, 'werkstatt');
    expect(path.resolve(base, '.')).toBe(base);
    expect(path.resolve(base, '../raus').startsWith(base + path.sep)).toBe(false);
  });
});

describe('getExtension', () => {
  it('wirft NotFound, wenn die Erweiterung nicht registriert ist', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(extensionService.getExtension('fehlt')).rejects.toThrow(/nicht installiert/i);
  });

  it('weist eine unsaubere Id ab, bevor die DB gefragt wird', async () => {
    await expect(extensionService.getExtension('../etc')).rejects.toThrow();
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('listExtensions — Abbildung auf die API-Form', () => {
  it('übersetzt Spaltennamen und normalisiert enabled', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'mein-tool',
          name: 'Mein Tool',
          description: 'tut was',
          ext_type: 'tool',
          access_tier: 'internet',
          version: '0.2.0',
          source: 'built',
          enabled: true,
          manifest: { entry: 'tool.mjs' },
          installed_at: '2026-07-23T10:00:00.000Z',
          package_path: '/arasul/extensions/mein-tool',
        },
      ],
    });

    const [ext] = await extensionService.listExtensions();
    expect(ext).toEqual({
      id: 'mein-tool',
      name: 'Mein Tool',
      description: 'tut was',
      type: 'tool',
      accessTier: 'internet',
      version: '0.2.0',
      source: 'built',
      enabled: true,
      manifest: { entry: 'tool.mjs' },
      // Alt-Zeilen ohne Fähigkeits-Spalten → leere Listen (Plan 017 Schritt 2).
      faehigkeiten: { deklariert: [], freigegeben: [], wirksam: [] },
      n8nWorkflowId: null,
      installedAt: '2026-07-23T10:00:00.000Z',
    });
    // Interne Pfade gehören nicht in die API-Antwort.
    expect(ext).not.toHaveProperty('package_path');
  });
});

describe('setEnabled — Fähigkeiten-Freigabe (Plan 017 Schritt 2)', () => {
  function row(overrides = {}) {
    return {
      id: 'app1',
      name: 'App',
      description: '',
      ext_type: 'app',
      access_tier: 'internet',
      version: '1.0.0',
      source: 'built',
      enabled: false,
      manifest: {},
      declared_capabilities: ['llm', 'rag'],
      approved_capabilities: [],
      installed_at: new Date().toISOString(),
      ...overrides,
    };
  }

  it('Aktivieren ohne Freigabe → Validierungsfehler mit fehlender Liste', async () => {
    db.query.mockResolvedValue({ rows: [row()] });
    await expect(extensionService.setEnabled('app1', true)).rejects.toMatchObject({
      name: 'ValidationError',
      details: { freigabe_erforderlich: true, fehlend: ['llm', 'rag'] },
    });
  });

  it('Aktivieren mit faehigkeitenFreigeben übernimmt deklariert → freigegeben', async () => {
    db.query.mockImplementation(async sql => {
      if (/approved_capabilities = declared_capabilities/.test(sql)) {
        return {
          rows: [row({ enabled: true, approved_capabilities: ['llm', 'rag'] })],
        };
      }
      return { rows: [row()] };
    });
    const ext = await extensionService.setEnabled('app1', true, {
      faehigkeitenFreigeben: true,
      userId: 1,
    });
    expect(ext.enabled).toBe(true);
    expect(ext.faehigkeiten.wirksam.sort()).toEqual(['llm', 'rag']);
    const freigabeCall = db.query.mock.calls.find(([sql]) =>
      /approved_capabilities = declared_capabilities/.test(sql)
    );
    // App-Erweiterung → workflowId-Parameter ist null.
    expect(freigabeCall[1]).toEqual(['app1', 1, null]);
  });

  it('Aktivieren ohne deklarierte Fähigkeiten braucht keine Freigabe', async () => {
    db.query.mockResolvedValue({
      rows: [row({ declared_capabilities: [], enabled: true })],
    });
    const ext = await extensionService.setEnabled('app1', true);
    expect(ext.enabled).toBe(true);
  });

  it('Deaktivieren ist immer erlaubt und lässt die Freigabe stehen', async () => {
    db.query.mockResolvedValue({
      rows: [row({ enabled: false, approved_capabilities: ['llm'] })],
    });
    const ext = await extensionService.setEnabled('app1', false);
    expect(ext.enabled).toBe(false);
    expect(ext.faehigkeiten.freigegeben).toEqual(['llm']);
  });
});

describe('setEnabled — Flow-Erweiterungen (Plan 017 Schritt 3)', () => {
  function flowRow(overrides = {}) {
    return {
      id: 'mein-flow',
      name: 'Flow',
      description: '',
      ext_type: 'flow',
      access_tier: 'internal',
      version: '1.0.0',
      source: 'built',
      enabled: false,
      manifest: { entry: 'workflow.json' },
      declared_capabilities: [],
      approved_capabilities: [],
      n8n_workflow_id: null,
      installed_at: new Date().toISOString(),
      ...overrides,
    };
  }

  it('importiert ZUERST, schreibt die Workflow-ID im selben UPDATE', async () => {
    flowDeployService.liveSchalten.mockResolvedValue('wf-42');
    db.query.mockImplementation(async (_sql, params) => ({
      rows: [flowRow({ enabled: true, n8n_workflow_id: params[2] })],
    }));

    const ext = await extensionService.setEnabled('mein-flow', true);

    expect(flowDeployService.liveSchalten).toHaveBeenCalledTimes(1);
    // Kein separater merke-Aufruf mehr — die ID geht in den enable-UPDATE.
    const updateCall = db.query.mock.calls.find(([sql]) => /SET enabled/.test(sql));
    expect(updateCall[1]).toContain('wf-42');
    expect(ext.n8nWorkflowId).toBe('wf-42');
  });

  it('scheitert der n8n-Import, bleibt enabled=false (kein Register-Widerspruch)', async () => {
    const { ServiceUnavailableError } = require('../../src/utils/errors');
    flowDeployService.liveSchalten.mockRejectedValue(new ServiceUnavailableError('n8n aus'));
    db.query.mockResolvedValue({ rows: [flowRow()] });

    await expect(extensionService.setEnabled('mein-flow', true)).rejects.toThrow(
      ServiceUnavailableError
    );
    // Kein enable-UPDATE, wenn der Import vorher scheitert.
    const updateCall = db.query.mock.calls.find(([sql]) => /SET enabled/.test(sql));
    expect(updateCall).toBeUndefined();
  });

  it('Deaktivieren pausiert den Workflow', async () => {
    db.query.mockImplementation(async () => ({
      rows: [flowRow({ enabled: false, n8n_workflow_id: 'wf-42' })],
    }));

    await extensionService.setEnabled('mein-flow', false);

    expect(flowDeployService.pausieren).toHaveBeenCalledTimes(1);
    expect(flowDeployService.liveSchalten).not.toHaveBeenCalled();
  });

  it('removeExtension räumt den n8n-Workflow ab', async () => {
    db.query.mockImplementation(async sql =>
      /DELETE FROM extensions/.test(sql)
        ? { rows: [] }
        : { rows: [flowRow({ enabled: true, n8n_workflow_id: 'wf-7' })] }
    );

    await extensionService.removeExtension('mein-flow');

    expect(flowDeployService.entfernen).toHaveBeenCalledTimes(1);
  });
});

describe('flowStatus (Plan 017 Schritt 3)', () => {
  it('reicht den n8n-Status einer Flow-Erweiterung durch', async () => {
    db.query.mockResolvedValue({
      rows: [
        {
          id: 'mein-flow',
          name: 'Flow',
          description: '',
          ext_type: 'flow',
          access_tier: 'internal',
          version: '1.0.0',
          source: 'built',
          enabled: true,
          manifest: {},
          declared_capabilities: [],
          approved_capabilities: [],
          n8n_workflow_id: 'wf-1',
          installed_at: new Date().toISOString(),
        },
      ],
    });
    flowDeployService.status.mockResolvedValue({ erreichbar: true, aktiv: true });

    const s = await extensionService.flowStatus('mein-flow');
    expect(s).toEqual({ erreichbar: true, aktiv: true });
    expect(flowDeployService.status).toHaveBeenCalledTimes(1);
  });

  it('lehnt Nicht-Flow-Erweiterungen ab', async () => {
    db.query.mockResolvedValue({
      rows: [
        {
          id: 'app1',
          name: 'App',
          ext_type: 'app',
          access_tier: 'internet',
          version: '1.0.0',
          source: 'built',
          enabled: true,
          manifest: {},
          declared_capabilities: [],
          approved_capabilities: [],
          installed_at: new Date().toISOString(),
        },
      ],
    });
    await expect(extensionService.flowStatus('app1')).rejects.toThrow(/Flow-Erweiterungen/i);
  });
});
