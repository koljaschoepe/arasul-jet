/**
 * Tests: Terminal-Konsolidierung (Cursor-Shell Stufe 3).
 *
 * 1. Dedup: Panel-Toggle (visible false→true, Keep-alive) und Session-Wechsel
 *    erzeugen KEINE zweite WebSocket-/xterm-Instanz — genau 1 Socket pro
 *    Session, Session-State im Store bleibt erhalten.
 * 2. Migration: der Legacy-Key 'sandbox-open-tabs' (v2, SandboxApp-Lokalstate)
 *    wird einmalig in die Store-Registry gehoben und danach entfernt.
 * 3. Refit: beim Wieder-Einblenden wird xterm neu gefittet (fit() auf
 *    verstecktem Container misst 0×0 — bekannte xterm-Falle).
 */

import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import SandboxApp from '../SandboxApp';
import type { SandboxProject } from '../types';

// ---- Mocks ----------------------------------------------------------------

const { xtermInstances, fitInstances, apiState, apiMock, toastMock, confirmMock } = vi.hoisted(
  () => {
    const apiState = { projects: [] as unknown[] };
    return {
      xtermInstances: [] as unknown[],
      fitInstances: [] as Array<{ fit: ReturnType<typeof vi.fn> }>,
      apiState,
      // Stabile Singletons — neue Objekte pro Render würden die
      // useCallback-Identitäten in SandboxApp kippen (Refetch-Schleife).
      toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
      confirmMock: { confirm: async () => true, ConfirmDialog: null },
      apiMock: {
        get: vi.fn(async (path: string) => {
          if (path.startsWith('/sandbox/projects')) {
            return { projects: apiState.projects, total: apiState.projects.length };
          }
          if (path.startsWith('/sandbox/stats')) {
            return {
              stats: {
                total_projects: apiState.projects.length,
                active_projects: apiState.projects.length,
                running_containers: 0,
                stopped_containers: 0,
                active_sessions: 0,
              },
            };
          }
          return {};
        }),
        post: vi.fn(async () => ({})),
        put: vi.fn(async () => ({})),
        patch: vi.fn(async () => ({})),
        del: vi.fn(async () => ({})),
      },
    };
  }
);

vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => toastMock }));
vi.mock('@/hooks/useConfirm', () => ({ default: () => confirmMock }));

vi.mock('@xterm/xterm', () => {
  class MockTerminal {
    options: Record<string, unknown>;
    cols = 80;
    rows = 24;
    unicode = { activeVersion: '' };
    constructor(options: Record<string, unknown>) {
      this.options = options;
      xtermInstances.push(this);
    }
    open(): void {}
    loadAddon(): void {}
    onData(): void {}
    onBinary(): void {}
    write(): void {}
    dispose(): void {}
  }
  return { Terminal: MockTerminal };
});

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = vi.fn();
    constructor() {
      fitInstances.push(this as unknown as { fit: ReturnType<typeof vi.fn> });
    }
  },
}));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }));
vi.mock('@xterm/addon-search', () => ({ SearchAddon: class {} }));
vi.mock('@xterm/addon-unicode11', () => ({ Unicode11Addon: class {} }));

/** Zählender WebSocket-Mock — Kern der Dedup-Assertion. */
class CountingWebSocket {
  static instances: CountingWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;
  url: string;
  readyState = 1;
  binaryType = '';
  onopen: ((ev?: unknown) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onmessage: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    CountingWebSocket.instances.push(this);
    setTimeout(() => this.onopen?.(), 0);
  }
  send(): void {}
  close(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  }
}

// ---- Fixtures ---------------------------------------------------------------

function makeProject(id: string, name: string): SandboxProject {
  return {
    id,
    name,
    slug: id,
    description: null,
    icon: null,
    color: null,
    base_image: 'arasul-sandbox:latest',
    status: 'active',
    container_id: `c-${id}`,
    container_name: `sandbox-${id}`,
    container_status: 'running',
    committed_image: null,
    host_path: `/data/sandbox/${id}`,
    container_path: '/workspace',
    resource_limits: { memory: '2g', cpus: '2', pids: 256 },
    environment: null,
    installed_packages: null,
    last_accessed_at: null,
    network_mode: 'isolated',
    total_terminal_seconds: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function resetStore() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    sidebarVisible: true,
    rightPanelVisible: false,
    rightPanelMode: 'chat',
    terminalSessions: [],
    activeTerminalSessionId: null,
    chatScope: null,
    explorerRequest: null,
  });
}

const totalFitCalls = () => fitInstances.reduce((sum, f) => sum + f.fit.mock.calls.length, 0);

// ---- Tests ------------------------------------------------------------------

describe('SandboxApp Session-Registry (Stufe 3)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    xtermInstances.length = 0;
    fitInstances.length = 0;
    CountingWebSocket.instances.length = 0;
    apiState.projects = [];
    apiMock.post.mockClear();
    vi.stubGlobal('WebSocket', CountingWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hält genau 1 WebSocket pro Session über Panel-Toggle und Session-Wechsel', async () => {
    apiState.projects = [makeProject('p1', 'Projekt Eins'), makeProject('p2', 'Projekt Zwei')];
    useWorkspaceStore.setState({
      terminalSessions: [
        { id: 'p1', projectId: 'p1', title: 'Projekt Eins' },
        { id: 'p2', projectId: 'p2', title: 'Projekt Zwei' },
      ],
      activeTerminalSessionId: 'p1',
      rightPanelVisible: true,
      rightPanelMode: 'terminal',
    });

    const { rerender } = render(<SandboxApp visible />);

    // Beide Sessions verbinden — genau eine Socket-Instanz je Session
    await waitFor(() => expect(CountingWebSocket.instances).toHaveLength(2));
    expect(new Set(CountingWebSocket.instances.map(ws => ws.url)).size).toBe(2);

    // Panel-Toggle (Keep-alive: verstecken, nicht unmounten) …
    rerender(<SandboxApp visible={false} />);
    rerender(<SandboxApp visible />);

    // … und Session-Wechsel hin und zurück (entspricht Ansichtswechsel)
    act(() => {
      useWorkspaceStore.getState().activateTerminalSession('p2');
    });
    act(() => {
      useWorkspaceStore.getState().activateTerminalSession('p1');
    });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    // Keine neuen Sockets/Terminals, keine geschlossenen Verbindungen
    expect(CountingWebSocket.instances).toHaveLength(2);
    expect(CountingWebSocket.instances.every(ws => ws.readyState === CountingWebSocket.OPEN)).toBe(
      true
    );
    expect(xtermInstances).toHaveLength(2);

    // Session-State im Store unverändert erhalten
    const state = useWorkspaceStore.getState();
    expect(state.terminalSessions.map(s => s.id)).toEqual(['p1', 'p2']);
    expect(state.activeTerminalSessionId).toBe('p1');
  });

  it('hält für ZWEI Sessions im selben Projekt zwei distinkte, unabhängige Sockets (eigener tmux-Name)', async () => {
    apiState.projects = [makeProject('p1', 'Projekt Eins')];
    // Zwei Sessions desselben Projekts: erste (tmux 'main', id === projectId),
    // zweite (tmux 'main-2', id 'p1#2') — müssen DISTINKTE WS-URLs ergeben.
    useWorkspaceStore.setState({
      terminalSessions: [
        { id: 'p1', projectId: 'p1', title: 'Projekt Eins', terminalName: 'main' },
        { id: 'p1#2', projectId: 'p1', title: 'Projekt Eins', terminalName: 'main-2' },
      ],
      activeTerminalSessionId: 'p1',
      rightPanelVisible: true,
      rightPanelMode: 'terminal',
    });

    render(<SandboxApp visible />);

    // Genau zwei Sockets, mit DISTINKTEN URLs (nur die zweite trägt terminal=main-2)
    await waitFor(() => expect(CountingWebSocket.instances).toHaveLength(2));
    const urls = CountingWebSocket.instances.map(ws => ws.url);
    expect(new Set(urls).size).toBe(2);
    // Beide Sessions zielen auf dasselbe Projekt, aber distinkte tmux-Namen
    expect(urls.every(u => u.includes('projectId=p1'))).toBe(true);
    expect(urls.some(u => u.includes('terminal=main-2'))).toBe(true);
    expect(urls.some(u => u.includes('terminal=main&') || /terminal=main$/.test(u))).toBe(true);
    // Zwei getrennte xterm-Instanzen (keine geteilte)
    expect(xtermInstances).toHaveLength(2);

    // Beide Sessions bleiben in der Registry, dasselbe Projekt
    const state = useWorkspaceStore.getState();
    expect(state.terminalSessions.map(s => s.id)).toEqual(['p1', 'p1#2']);
    expect(state.terminalSessions.every(s => s.projectId === 'p1')).toBe(true);
  });

  it('startet gestoppte Container beim Session-Restore und lädt die Projekte nach', async () => {
    // Restore nach Reboot: Registry-Session existiert, Container ist gestoppt.
    // Der Bootstrap muss POST /start feuern UND danach loadProjects() nachziehen,
    // sonst bliebe das Terminal dauerhaft im Spinner (Keep-alive: kein Remount).
    const stopped: SandboxProject = {
      ...makeProject('p1', 'Projekt Eins'),
      container_status: 'stopped',
    };
    apiState.projects = [stopped];
    useWorkspaceStore.setState({
      terminalSessions: [{ id: 'p1', projectId: 'p1', title: 'Projekt Eins' }],
      activeTerminalSessionId: 'p1',
      rightPanelVisible: true,
      rightPanelMode: 'terminal',
    });
    // Nach dem Start-POST liefert die API den Container als 'running'
    apiMock.post.mockImplementationOnce(async () => {
      apiState.projects = [{ ...stopped, container_status: 'running' }];
      return {};
    });

    render(<SandboxApp visible />);

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith(
        '/sandbox/projects/p1/start',
        {},
        { showError: false }
      )
    );

    // loadProjects() nach dem Start → container_status 'running' kommt an
    // → Terminal verbindet (genau 1 Socket), statt endlos zu warten
    await waitFor(() => expect(CountingWebSocket.instances).toHaveLength(1));
  });

  it("migriert den Legacy-Key 'sandbox-open-tabs' einmalig in die Store-Registry", async () => {
    apiState.projects = [makeProject('p1', 'Projekt Eins')];
    localStorage.setItem('sandbox-open-tabs', JSON.stringify({ tabs: ['p1'], activeId: 'p1' }));

    render(<SandboxApp visible />);

    await waitFor(() => {
      const state = useWorkspaceStore.getState();
      expect(state.terminalSessions).toEqual([
        { id: 'p1', projectId: 'p1', title: 'Projekt Eins' },
      ]);
      expect(state.activeTerminalSessionId).toBe('p1');
    });

    // Registry ist jetzt die Quelle der Wahrheit — Legacy-Key entfernt,
    // Terminal-Panel eingeblendet, genau 1 Socket
    expect(localStorage.getItem('sandbox-open-tabs')).toBeNull();
    expect(useWorkspaceStore.getState().rightPanelVisible).toBe(true);
    expect(useWorkspaceStore.getState().rightPanelMode).toBe('terminal');
    await waitFor(() => expect(CountingWebSocket.instances).toHaveLength(1));
  });

  it('fittet xterm beim Wieder-Einblenden neu (fit auf verstecktem Container schlägt fehl)', async () => {
    apiState.projects = [makeProject('p1', 'Projekt Eins')];
    useWorkspaceStore.setState({
      terminalSessions: [{ id: 'p1', projectId: 'p1', title: 'Projekt Eins' }],
      activeTerminalSessionId: 'p1',
      rightPanelVisible: true,
      rightPanelMode: 'terminal',
    });

    const { rerender } = render(<SandboxApp visible />);
    await waitFor(() => expect(CountingWebSocket.instances).toHaveLength(1));
    await waitFor(() => expect(totalFitCalls()).toBeGreaterThan(0));

    const callsBefore = totalFitCalls();

    rerender(<SandboxApp visible={false} />);
    rerender(<SandboxApp visible />);

    // Double-rAF nach dem Einblenden → mindestens ein weiterer fit()
    await waitFor(() => expect(totalFitCalls()).toBeGreaterThan(callsBefore));

    // Refit erzeugt weder neue Sockets noch neue Terminals
    expect(CountingWebSocket.instances).toHaveLength(1);
    expect(xtermInstances).toHaveLength(1);
  });
});
