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
const projects = [
  { id: 'p-def', name: 'Allgemein', is_default: true, knowledge_space_id: null },
  { id: 'p-mkt', name: 'Marketing', is_default: false, knowledge_space_id: 'ks-m', color: '#f00' },
];

const apiMock = {
  get: vi.fn((path: string) => {
    if (path === '/spaces/tree') return Promise.resolve({ spaces, documents });
    if (path === '/projects') return Promise.resolve({ projects });
    return Promise.resolve({});
  }),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
};
vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));

describe('ExplorerPanel (Projekte-Baum)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({
      tabs: [],
      activeTabId: null,
      chatScope: null,
      explorerRequest: null,
    });
  });

  it('zeigt Projekte als oberste Ebene, Standard-Projekt zuerst', async () => {
    render(
      <ToastProvider>
        <ExplorerPanel />
      </ToastProvider>
    );
    await waitFor(() => expect(screen.getByText('Marketing')).toBeInTheDocument());
    const tree = screen.getByTestId('projects-tree');
    const rows = tree.querySelectorAll('[data-testid^="project-"]');
    expect(rows[0]?.getAttribute('data-testid')).toBe('project-p-def');
    expect(screen.getByText('Allgemein')).toBeInTheDocument();
  });

  it('Standard-Projekt nimmt unzugeordnete Ordner und Wurzel-Dateien auf', async () => {
    render(
      <ToastProvider>
        <ExplorerPanel />
      </ToastProvider>
    );
    await waitFor(() => expect(screen.getByText('Allgemein')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Allgemein'));
    // ks-frei ist von keinem Projekt abgedeckt → unter Allgemein
    expect(screen.getByText('Unzugeordnet')).toBeInTheDocument();
    // Datei ohne Ordner ebenfalls, mit Indexierungs-Status
    expect(screen.getByText('Notiz.md')).toBeInTheDocument();
    expect(screen.getByLabelText('Wird indexiert …')).toBeInTheDocument();
    // Der Marketing-Ordner gehört zum Projekt Marketing, NICHT zu Allgemein
    expect(screen.queryByText('Marketing-Ordner')).not.toBeInTheDocument();
  });

  it('Projekt-Ordnerbaum öffnet Dateien als Dokument-Tab', async () => {
    render(
      <ToastProvider>
        <ExplorerPanel />
      </ToastProvider>
    );
    await waitFor(() => expect(screen.getByText('Marketing')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Marketing'));
    // Kinder des Projekt-Ordners: Unterordner + Datei
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
    await waitFor(() => expect(screen.getByText('Marketing')).toBeInTheDocument());
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
    await waitFor(() => expect(screen.getByText('Allgemein')).toBeInTheDocument());
    const input = screen.getByTestId('explorer-upload-input') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');
    useWorkspaceStore.getState().requestExplorerAction('upload-files');
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(useWorkspaceStore.getState().explorerRequest).toBeNull();
  });
});
