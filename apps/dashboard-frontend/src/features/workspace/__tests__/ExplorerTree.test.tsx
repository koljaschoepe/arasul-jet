import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExplorerPanel } from '../explorer/ExplorerPanel';
import { ToastProvider } from '@/contexts/ToastContext';
import { useWorkspaceStore } from '@/stores/workspaceStore';

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
    useWorkspaceStore.setState({
      tabs: [],
      activeTabId: null,
      chatScope: null,
      explorerRequest: null,
    });
  });

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
});
