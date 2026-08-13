/**
 * Tests: Terminal folgt dem aktiven Projekt (Plan 018: Projekt-Vereinheitlichung).
 *
 * Das Terminal leitet seinen Container aus dem aktiven Workspace-Projekt ab
 * (POST /sandbox/projects/ensure) und rendert nur dessen Sitzungen. Geprüft:
 * 1. Dedup: genau 1 WebSocket/xterm je Sitzung, auch über Panel-Toggle
 *    (Keep-alive) und Sitzungswechsel — zwei Sitzungen im selben Container
 *    ergeben zwei distinkte Sockets (eigener tmux-Name).
 * 2. Auto-Start: ohne offene Sitzung wird EINE angelegt und ein gestoppter
 *    Container gestartet (POST /start).
 * 3. Refit: beim Wieder-Einblenden wird xterm neu gefittet (fit() auf
 *    verstecktem Container misst 0×0 — bekannte xterm-Falle).
 */

import { render, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactElement } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import SandboxApp from '../SandboxApp';
import type { SandboxProject } from '../types';

// ---- Mocks ----------------------------------------------------------------

const { xtermInstances, fitInstances, containerState, apiMock, toastMock, activeProjectMock } =
  vi.hoisted(() => {
    const containerState = {
      running: true,
      status: 'running' as SandboxProject['container_status'],
    };
    return {
      xtermInstances: [] as unknown[],
      fitInstances: [] as Array<{ fit: ReturnType<typeof vi.fn> }>,
      containerState,
      toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
      activeProjectMock: {
        activeProject: { id: 'ws1', name: 'Projekt Eins' } as { id: string; name: string } | null,
        activeId: 'ws1' as string | null,
        spaceIds: [] as string[],
        isLoading: false,
        setActive: { mutate: vi.fn(), isPending: false },
      },
      apiMock: {
        get: vi.fn(async (path: string) => {
          if (path.includes('/status')) {
            return { status: { running: containerState.running, status: containerState.status } };
          }
          if (path.includes('/sessions')) {
            return { titles: {} };
          }
          return {};
        }),
        post: vi.fn(async (path: string) => {
          if (path === '/sandbox/projects/ensure') {
            return {
              project: {
                ...makeProject('c1', 'Projekt Eins'),
                container_status: containerState.status,
              },
              created: false,
            };
          }
          return {};
        }),
        put: vi.fn(async () => ({})),
        patch: vi.fn(async () => ({})),
        del: vi.fn(async () => ({})),
      },
    };
  });

vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => toastMock }));
vi.mock('@/features/workspace/useProjects', () => ({ useActiveProject: () => activeProjectMock }));

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
    network_mode: 'internal',
    project_id: 'ws1',
    total_terminal_seconds: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
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

describe('SandboxApp — Terminal folgt aktivem Projekt (Plan 018)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    xtermInstances.length = 0;
    fitInstances.length = 0;
    CountingWebSocket.instances.length = 0;
    apiMock.post.mockClear();
    apiMock.get.mockClear();
    containerState.running = true;
    containerState.status = 'running';
    activeProjectMock.activeId = 'ws1';
    activeProjectMock.activeProject = { id: 'ws1', name: 'Projekt Eins' };
    vi.stubGlobal('WebSocket', CountingWebSocket);
    // jsdom kennt kein Layout → clientWidth/-Height sind immer 0. useTerminal
    // fittet bewusst NICHT auf einen 0×0-Container. Echte Maße vortäuschen.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('hält für ZWEI Sitzungen im selben Container zwei distinkte, unabhängige Sockets', async () => {
    useWorkspaceStore.setState({
      terminalSessions: [
        { id: 'c1', projectId: 'c1', title: 'Sitzung 1', terminalName: 'main' },
        { id: 'c1#2', projectId: 'c1', title: 'Sitzung 2', terminalName: 'main-2' },
      ],
      activeTerminalSessionId: 'c1',
      rightPanelVisible: true,
      rightPanelMode: 'terminal',
    });

    const { rerender } = renderWithClient(<SandboxApp visible />);

    await waitFor(() => expect(CountingWebSocket.instances).toHaveLength(2));
    const urls = CountingWebSocket.instances.map(ws => ws.url);
    expect(new Set(urls).size).toBe(2);
    expect(urls.every(u => u.includes('projectId=c1'))).toBe(true);
    expect(urls.some(u => u.includes('terminal=main-2'))).toBe(true);
    expect(xtermInstances).toHaveLength(2);

    // Panel-Toggle (Keep-alive) + Sitzungswechsel erzeugen keine neuen Sockets
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <SandboxApp visible={false} />
      </QueryClientProvider>
    );
    act(() => useWorkspaceStore.getState().activateTerminalSession('c1#2'));
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    expect(CountingWebSocket.instances).toHaveLength(2);
    expect(useWorkspaceStore.getState().terminalSessions.map(s => s.id)).toEqual(['c1', 'c1#2']);
  });

  it('legt automatisch eine Sitzung an und startet einen gestoppten Container', async () => {
    containerState.running = false;
    containerState.status = 'stopped';

    renderWithClient(<SandboxApp visible />);

    // Eine Sitzung wird automatisch für den gekoppelten Container angelegt …
    await waitFor(() => {
      const sess = useWorkspaceStore.getState().terminalSessions;
      expect(sess.some(s => s.projectId === 'c1')).toBe(true);
    });
    // … und der gestoppte Container gestartet.
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith(
        '/sandbox/projects/c1/start',
        {},
        { showError: false }
      )
    );
  });

  it('verbindet genau einen Socket, sobald der Container läuft', async () => {
    useWorkspaceStore.setState({
      terminalSessions: [{ id: 'c1', projectId: 'c1', title: 'Sitzung 1', terminalName: 'main' }],
      activeTerminalSessionId: 'c1',
      rightPanelVisible: true,
      rightPanelMode: 'terminal',
    });

    renderWithClient(<SandboxApp visible />);
    await waitFor(() => expect(CountingWebSocket.instances).toHaveLength(1));
    expect(CountingWebSocket.instances[0]?.url).toContain('projectId=c1');
  });

  it('fittet xterm beim Wieder-Einblenden neu (fit auf verstecktem Container schlägt fehl)', async () => {
    useWorkspaceStore.setState({
      terminalSessions: [{ id: 'c1', projectId: 'c1', title: 'Sitzung 1', terminalName: 'main' }],
      activeTerminalSessionId: 'c1',
      rightPanelVisible: true,
      rightPanelMode: 'terminal',
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <SandboxApp visible />
      </QueryClientProvider>
    );
    await waitFor(() => expect(CountingWebSocket.instances).toHaveLength(1));
    await waitFor(() => expect(totalFitCalls()).toBeGreaterThan(0));

    const callsBefore = totalFitCalls();
    rerender(
      <QueryClientProvider client={client}>
        <SandboxApp visible={false} />
      </QueryClientProvider>
    );
    rerender(
      <QueryClientProvider client={client}>
        <SandboxApp visible />
      </QueryClientProvider>
    );

    await waitFor(() => expect(totalFitCalls()).toBeGreaterThan(callsBefore));
    expect(CountingWebSocket.instances).toHaveLength(1);
    expect(xtermInstances).toHaveLength(1);
  });
});
