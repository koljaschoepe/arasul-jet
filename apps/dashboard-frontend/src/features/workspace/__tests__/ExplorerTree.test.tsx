import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExplorerPanel, DND_SCOPE_TYPE, DND_ABLAGE_TYPE } from '../explorer/ExplorerPanel';
import type { AblageEintrag } from '../explorer/ExplorerPanel';
import { ToastProvider } from '@/contexts/ToastContext';
import { useWorkspaceStore } from '@/stores/workspaceStore';

// Der Explorer lädt Baum + aktives Projekt über React Query — Provider bereitstellen.
function Providers({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

/** DataTransfer-Attrappe für Drag-/Drop-Events (jsdom hat keine echte). */
function makeDataTransfer(opts: { files?: File[]; data?: Record<string, string> } = {}) {
  const data: Record<string, string> = opts.data ?? {};
  const dt = {
    files: (opts.files ?? []) as unknown as FileList,
    types: [...(opts.files?.length ? ['Files'] : []), ...Object.keys(data)],
    getData: (type: string) => data[type] ?? '',
    setData: (type: string, value: string) => {
      data[type] = value;
    },
    dropEffect: 'none',
    effectAllowed: 'all',
  } as unknown as DataTransfer;
  return { dt, data };
}

/** Zeilencontainer (role=treeitem) zu einem sichtbaren Label. */
function row(label: string): HTMLElement {
  const el = screen.getByText(label).closest('[role="treeitem"]');
  if (!el) throw new Error(`Zeile für „${label}“ nicht gefunden`);
  return el as HTMLElement;
}

// EIN Baum aus dem Projektordner: Ordner tragen space_id (Wissensraum-Spiegel),
// Dateien ggf. dokument {id, status} (Auto-Indexierung).
const eintraege: AblageEintrag[] = [
  { pfad: 'docs', name: 'docs', typ: 'ordner', groesse: null, geaendert: null, space_id: 'ks-1' },
  {
    pfad: 'docs/sub',
    name: 'sub',
    typ: 'ordner',
    groesse: null,
    geaendert: null,
    space_id: 'ks-2',
  },
  {
    pfad: 'docs/bericht.pdf',
    name: 'bericht.pdf',
    typ: 'datei',
    groesse: 10,
    geaendert: null,
    dokument: { id: 'd1', status: 'indexed' },
  },
  // Frisch angelegter Ordner, dessen Wissensraum-Spiegel noch fehlt.
  { pfad: 'neu', name: 'neu', typ: 'ordner', groesse: null, geaendert: null },
  {
    pfad: 'notiz.md',
    name: 'notiz.md',
    typ: 'datei',
    groesse: 5,
    geaendert: null,
    dokument: { id: 'd2', status: 'processing' },
  },
  {
    pfad: 'kaputt.md',
    name: 'kaputt.md',
    typ: 'datei',
    groesse: 5,
    geaendert: null,
    dokument: { id: 'd3', status: 'failed' },
  },
  // Nicht indexierbare Datei ohne Wissens-Spiegel.
  { pfad: 'roh.bin', name: 'roh.bin', typ: 'datei', groesse: 3, geaendert: null },
];

const apiMock = {
  get: vi.fn((path: string) => {
    if (path === '/projects/active') {
      return Promise.resolve({ data: { project: { id: 'p1', name: 'Projekt Alpha' } } });
    }
    if (path === '/projects/p1/dateien') {
      return Promise.resolve({ data: { eintraege, gekuerzt: false } });
    }
    if (path.startsWith('/projects/p1/dateien/suche')) {
      // Serverseitige Suche: findet auch Einträge unterhalb des Baum-Deckels.
      return Promise.resolve({
        data: {
          eintraege: [
            { pfad: 'docs/tief/bericht.pdf', name: 'bericht.pdf', typ: 'datei', groesse: null },
          ],
          gekuerzt: false,
        },
      });
    }
    if (path.startsWith('/projects/p1/dateien/inhalt')) {
      const pfad = decodeURIComponent(path.split('pfad=')[1] ?? '');
      // PDFs sind binär → Dokument-Viewer; Markdown ist Text → Editor.
      return Promise.resolve({ data: { binaer: pfad.endsWith('.pdf') } });
    }
    return Promise.resolve({});
  }),
  post: vi.fn(() => Promise.resolve({})),
  patch: vi.fn(() => Promise.resolve({})),
  put: vi.fn(() => Promise.resolve({})),
  del: vi.fn(() => Promise.resolve({})),
};
vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));

describe('ExplorerPanel (Ein-Ordner-Modell: EIN Baum aus /projects/:id/dateien)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({
      tabs: [],
      activeTabId: null,
      chatScope: null,
      chatDateiZiel: null,
      explorerRequest: null,
    });
  });

  const renderPanel = () =>
    render(
      <Providers>
        <ExplorerPanel />
      </Providers>
    );

  it('rendert EINEN Baum mit Index-Status als Text, ohne Punkte und ohne „Projektablage“-Bereich', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('docs')).toBeInTheDocument());
    // Wurzel-Einträge sichtbar, Unterordner erst nach Aufklappen
    expect(screen.getByText('neu')).toBeInTheDocument();
    expect(screen.getByText('roh.bin')).toBeInTheDocument();
    expect(screen.queryByText('sub')).not.toBeInTheDocument();
    // Status NUR als Text-Suffix
    expect(screen.getByText('· wird indexiert')).toBeInTheDocument();
    expect(screen.getByText('· Index fehlgeschlagen')).toBeInTheDocument();
    // indexed/stored zeigen nichts: es gibt genau die zwei Suffixe von oben
    expect(screen.queryAllByText(/^· /)).toHaveLength(2);
    // Kein zweiter Bereich mehr
    expect(screen.queryByText('Projektablage')).not.toBeInTheDocument();
  });

  it('Ordner öffnet Unterordner; Datei mit binärem Inhalt öffnet den Dokument-Viewer-Tab', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('docs')).toBeInTheDocument());
    fireEvent.click(screen.getByText('docs'));
    expect(screen.getByText('sub')).toBeInTheDocument();
    fireEvent.click(screen.getByText('bericht.pdf'));
    await waitFor(() =>
      expect(useWorkspaceStore.getState().tabs[0]).toMatchObject({
        type: 'document',
        documentId: 'd1',
      })
    );
  });

  it('Text-Datei öffnet den Projektdatei-Editor-Tab', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('notiz.md')).toBeInTheDocument());
    fireEvent.click(screen.getByText('notiz.md'));
    await waitFor(() =>
      expect(useWorkspaceStore.getState().tabs[0]).toMatchObject({
        type: 'projektdatei',
        projectId: 'p1',
        filePath: 'notiz.md',
      })
    );
  });

  it('Datei-Kontextmenü: Öffnen/Umbenennen/Löschen, aber KEIN „In Wissensraum übernehmen“ mehr', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('notiz.md')).toBeInTheDocument());
    fireEvent.contextMenu(row('notiz.md'), { clientX: 5, clientY: 5 });
    expect(await screen.findByText('Öffnen')).toBeInTheDocument();
    expect(screen.getByText('Umbenennen')).toBeInTheDocument();
    expect(screen.getByText('Löschen')).toBeInTheDocument();
    expect(screen.queryByText(/übernehmen/i)).not.toBeInTheDocument();
  });

  it('Umbenennen ruft die verschieben-Route mit von/nach', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('notiz.md')).toBeInTheDocument());
    fireEvent.contextMenu(row('notiz.md'), { clientX: 5, clientY: 5 });
    fireEvent.click(await screen.findByText('Umbenennen'));
    const input = (await screen.findByDisplayValue('notiz.md')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'meine-notiz.md' } });
    fireEvent.click(screen.getByRole('button', { name: 'Umbenennen' }));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/projects/p1/dateien/verschieben', {
        von: 'notiz.md',
        nach: 'meine-notiz.md',
      })
    );
  });

  it('Löschen ruft DELETE ?pfad= erst nach Bestätigung', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('notiz.md')).toBeInTheDocument());
    fireEvent.contextMenu(row('notiz.md'), { clientX: 5, clientY: 5 });
    fireEvent.click(await screen.findByText('Löschen'));
    await screen.findByText(/wirklich löschen/);
    expect(apiMock.del).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() =>
      expect(apiMock.del).toHaveBeenCalledWith('/projects/p1/dateien?pfad=notiz.md')
    );
  });

  it('F2 auf einem Baum-Eintrag öffnet den Umbenennen-Dialog (vorbelegt)', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('notiz.md')).toBeInTheDocument());
    fireEvent.keyDown(row('notiz.md'), { key: 'F2' });
    const input = (await screen.findByDisplayValue('notiz.md')) as HTMLInputElement;
    expect(input).toBeInTheDocument();
  });

  it('Entf auf einem Baum-Eintrag öffnet die Löschen-Bestätigung (löscht nicht sofort)', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('notiz.md')).toBeInTheDocument());
    fireEvent.keyDown(row('notiz.md'), { key: 'Delete' });
    expect(await screen.findByText(/wirklich löschen/)).toBeInTheDocument();
    expect(apiMock.del).not.toHaveBeenCalled();
  });

  it('Ordner-Drag liefert space_id (samt Unterordnern) und das Pfad-Ziel für den Composer', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('docs')).toBeInTheDocument());
    const { dt, data } = makeDataTransfer();
    fireEvent.dragStart(row('docs'), { dataTransfer: dt });
    expect(JSON.parse(data[DND_SCOPE_TYPE] ?? '{}')).toEqual({
      spaceIds: ['ks-1', 'ks-2'],
      label: 'docs',
    });
    expect(JSON.parse(data[DND_ABLAGE_TYPE] ?? '{}')).toEqual({
      projectId: 'p1',
      pfad: 'docs',
      name: 'docs',
      typ: 'ordner',
    });
  });

  it('Ordner ohne space_id (noch nicht gesynct) ist nicht draggbar', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('neu')).toBeInTheDocument());
    expect(row('neu')).toHaveAttribute('draggable', 'false');
    expect(row('docs')).toHaveAttribute('draggable', 'true');
  });

  it('OS-Datei-Drop auf einen Ordner lädt per dateien/upload in diesen Ordner', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('docs')).toBeInTheDocument());
    const file = new File(['x'], 'neu.pdf', { type: 'application/pdf' });
    fireEvent.drop(row('docs'), { dataTransfer: makeDataTransfer({ files: [file] }).dt });
    await waitFor(() => expect(apiMock.post).toHaveBeenCalled());
    const call = apiMock.post.mock.calls[0] as unknown as [string, FormData];
    expect(call[0]).toBe('/projects/p1/dateien/upload');
    expect(call[1].get('ordner')).toBe('docs');
    expect((call[1].get('file') as File).name).toBe('neu.pdf');
  });

  it('Upload-Request aus der Menubar öffnet den Datei-Dialog', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('docs')).toBeInTheDocument());
    const input = screen.getByTestId('explorer-upload-input') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');
    useWorkspaceStore.getState().requestExplorerAction('upload-files');
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(useWorkspaceStore.getState().explorerRequest).toBeNull();
  });

  it('Suche ab 2 Zeichen fragt den Server (entprellt) und zeigt eine flache Trefferliste', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('docs')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Explorer durchsuchen'), {
      target: { value: 'bericht' },
    });
    // Entprellt (~300 ms), dann geht die Anfrage an den Suche-Endpoint
    await waitFor(() =>
      expect(apiMock.get).toHaveBeenCalledWith(
        '/projects/p1/dateien/suche?q=bericht',
        expect.anything()
      )
    );
    // Flache Trefferliste: Name + gedimmter Eltern-Pfad, Baum ausgeblendet
    await waitFor(() => expect(screen.getByTestId('explorer-suchtreffer')).toBeInTheDocument());
    expect(screen.getByText('bericht.pdf')).toBeInTheDocument();
    expect(screen.getByText('docs/tief')).toBeInTheDocument();
    expect(screen.queryByText('roh.bin')).not.toBeInTheDocument();
  });
});
