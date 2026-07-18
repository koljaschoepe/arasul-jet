import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExplorerPanel, DND_DOC_TYPE } from '../explorer/ExplorerPanel';
import { ToastProvider } from '@/contexts/ToastContext';
import { useWorkspaceStore } from '@/stores/workspaceStore';

// Upload-Hook mocken, damit Import-Drops die echte XHR-Kette nicht anfassen.
const { uploadFilesMock } = vi.hoisted(() => ({ uploadFilesMock: vi.fn() }));
vi.mock('@/hooks/uploadDocuments', () => ({
  useUploadDocuments: () => ({ uploadFiles: uploadFilesMock, uploading: false, progress: 0 }),
}));

/** DataTransfer-Attrappe für Drop-Events (jsdom hat keine echte). */
function makeDataTransfer(opts: { files?: File[]; data?: Record<string, string> }): DataTransfer {
  const data = opts.data ?? {};
  return {
    files: (opts.files ?? []) as unknown as FileList,
    types: [...(opts.files?.length ? ['Files'] : []), ...Object.keys(data)],
    getData: (type: string) => data[type] ?? '',
    setData: () => undefined,
    dropEffect: 'none',
    effectAllowed: 'all',
  } as unknown as DataTransfer;
}

/** Zeilencontainer (role=treeitem) zu einem sichtbaren Label. */
function row(label: string): HTMLElement {
  const el = screen.getByText(label).closest('[role="treeitem"]');
  if (!el) throw new Error(`Zeile für „${label}“ nicht gefunden`);
  return el as HTMLElement;
}

const spaces = [
  {
    id: 'ks-m',
    name: 'Marketing-Ordner',
    slug: 'm',
    icon: null,
    color: null,
    parent_id: null,
    is_default: false,
    is_system: false,
    sort_order: 0,
  },
  {
    id: 'ks-m-sub',
    name: 'Kampagnen',
    slug: 'k',
    icon: null,
    color: null,
    parent_id: 'ks-m',
    is_default: false,
    is_system: false,
    sort_order: 0,
  },
  {
    id: 'ks-frei',
    name: 'Unzugeordnet',
    slug: 'u',
    icon: null,
    color: null,
    parent_id: null,
    is_default: false,
    is_system: false,
    sort_order: 1,
  },
];
const documents = [
  {
    id: 'd1',
    filename: 'Briefing.pdf',
    title: null,
    status: 'indexed',
    space_id: 'ks-m',
    is_context_file: false,
    mime_type: 'application/pdf',
    file_extension: '.pdf',
    file_size: 10,
  },
  {
    id: 'd2',
    filename: 'Notiz.md',
    title: null,
    status: 'processing',
    space_id: null,
    is_context_file: false,
    mime_type: 'text/markdown',
    file_extension: '.md',
    file_size: 5,
  },
];

const apiMock = {
  get: vi.fn((path: string) => {
    if (path === '/spaces/tree') return Promise.resolve({ spaces, documents });
    return Promise.resolve({});
  }),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
};
vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));

describe('ExplorerPanel (Ordner-Baum)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadFilesMock.mockResolvedValue({ ok: 1, failed: [] });
    useWorkspaceStore.setState({
      tabs: [],
      activeTabId: null,
      chatScope: null,
      explorerRequest: null,
    });
  });

  const renderPanel = () =>
    render(
      <ToastProvider>
        <ExplorerPanel />
      </ToastProvider>
    );

  it('zeigt Wurzel-Ordner und Wurzel-Dateien als oberste Ebene', async () => {
    render(
      <ToastProvider>
        <ExplorerPanel />
      </ToastProvider>
    );
    await waitFor(() => expect(screen.getByText('Marketing-Ordner')).toBeInTheDocument());
    // Wurzel-Ordner ohne Elternordner
    expect(screen.getByText('Unzugeordnet')).toBeInTheDocument();
    // Wurzel-Datei (keinem Ordner zugeordnet), mit Indexierungs-Status
    expect(screen.getByText('Notiz.md')).toBeInTheDocument();
    expect(screen.getByLabelText('Wird indexiert …')).toBeInTheDocument();
    // Unterordner bleibt bis zum Aufklappen verborgen
    expect(screen.queryByText('Kampagnen')).not.toBeInTheDocument();
  });

  it('Ordner öffnet Unterordner und Dateien; Datei öffnet Dokument-Tab', async () => {
    render(
      <ToastProvider>
        <ExplorerPanel />
      </ToastProvider>
    );
    await waitFor(() => expect(screen.getByText('Marketing-Ordner')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Marketing-Ordner'));
    // Kinder des Ordners: Unterordner + Datei
    expect(screen.getByText('Kampagnen')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Briefing.pdf'));
    const tabs = useWorkspaceStore.getState().tabs;
    expect(tabs[0]).toMatchObject({ type: 'document', documentId: 'd1' });
  });

  it('Suche filtert den Baum und expandiert Treffer', async () => {
    render(
      <ToastProvider>
        <ExplorerPanel />
      </ToastProvider>
    );
    await waitFor(() => expect(screen.getByText('Marketing-Ordner')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Explorer durchsuchen'), {
      target: { value: 'briefing' },
    });
    // Treffer sichtbar ohne manuelles Aufklappen
    expect(screen.getByText('Briefing.pdf')).toBeInTheDocument();
    // Nicht-Treffer ausgeblendet
    expect(screen.queryByText('Unzugeordnet')).not.toBeInTheDocument();
  });

  it('Upload-Request aus der Menubar öffnet den Datei-Dialog', async () => {
    render(
      <ToastProvider>
        <ExplorerPanel />
      </ToastProvider>
    );
    await waitFor(() => expect(screen.getByText('Marketing-Ordner')).toBeInTheDocument());
    const input = screen.getByTestId('explorer-upload-input') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');
    useWorkspaceStore.getState().requestExplorerAction('upload-files');
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(useWorkspaceStore.getState().explorerRequest).toBeNull();
  });

  it('Rechtsklick auf eine Datei öffnet ein Kontextmenü mit Umbenennen/Löschen/Neuer Ordner', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('Notiz.md')).toBeInTheDocument());
    fireEvent.contextMenu(row('Notiz.md'), { clientX: 5, clientY: 5 });
    expect(await screen.findByText('Umbenennen')).toBeInTheDocument();
    expect(screen.getByText('Löschen')).toBeInTheDocument();
    expect(screen.getByText('Neuer Ordner')).toBeInTheDocument();
  });

  it('Umbenennen einer Datei ruft den PATCH-Endpunkt mit neuem Titel', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('Notiz.md')).toBeInTheDocument());
    fireEvent.contextMenu(row('Notiz.md'), { clientX: 5, clientY: 5 });
    fireEvent.click(await screen.findByText('Umbenennen'));
    const input = (await screen.findByDisplayValue('Notiz.md')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Meine Notiz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(apiMock.patch).toHaveBeenCalledWith('/documents/d2', { title: 'Meine Notiz' })
    );
  });

  it('Löschen einer Datei ruft den DELETE-Endpunkt erst nach Bestätigung', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('Notiz.md')).toBeInTheDocument());
    fireEvent.contextMenu(row('Notiz.md'), { clientX: 5, clientY: 5 });
    fireEvent.click(await screen.findByText('Löschen'));
    // Bestätigungsdialog erscheint; erst der Bestätigungs-Button löst DELETE aus.
    await screen.findByText('„Notiz.md“ löschen?');
    expect(apiMock.del).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(apiMock.del).toHaveBeenCalledWith('/documents/d2'));
  });

  it('Datei per Drag & Drop auf einen Ordner ruft den Move-Endpunkt mit dessen space_id', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('Marketing-Ordner')).toBeInTheDocument());
    const payload = JSON.stringify({ documentId: 'd2', fromSpaceId: null, label: 'Notiz.md' });
    fireEvent.drop(row('Marketing-Ordner'), {
      dataTransfer: makeDataTransfer({ data: { [DND_DOC_TYPE]: payload } }),
    });
    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith('/documents/d2/move', { space_id: 'ks-m' })
    );
  });

  it('Drop einer Datei auf ihren eigenen Ordner löst KEIN Verschieben aus', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('Marketing-Ordner')).toBeInTheDocument());
    // d1 liegt bereits in ks-m; Drop auf denselben Ordner ist ein No-Op.
    const payload = JSON.stringify({
      documentId: 'd1',
      fromSpaceId: 'ks-m',
      label: 'Briefing.pdf',
    });
    fireEvent.drop(row('Marketing-Ordner'), {
      dataTransfer: makeDataTransfer({ data: { [DND_DOC_TYPE]: payload } }),
    });
    expect(apiMock.put).not.toHaveBeenCalled();
  });

  it('Import per OS-Datei-Drop auf einen Ordner lädt in dessen space hoch', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('Marketing-Ordner')).toBeInTheDocument());
    const file = new File(['x'], 'neu.pdf', { type: 'application/pdf' });
    fireEvent.drop(row('Marketing-Ordner'), {
      dataTransfer: makeDataTransfer({ files: [file] }),
    });
    await waitFor(() => expect(uploadFilesMock).toHaveBeenCalled());
    const call = uploadFilesMock.mock.calls[0];
    expect(call?.[1]).toBe('ks-m');
  });
});
