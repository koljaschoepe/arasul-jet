import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Mock } from 'vitest';
import DocumentViewerTab from '../DocumentViewerTab';

const mockApi = { get: vi.fn(), post: vi.fn(), put: vi.fn() };
vi.mock('@/hooks/useApi', () => ({ useApi: () => mockApi }));

// Workspace-Store: nur die beiden vom Viewer genutzten Selektoren.
const mockCloseTab = vi.fn();
const mockUpdateTabTitle = vi.fn();
vi.mock('@/stores/workspaceStore', () => ({
  useWorkspaceStore: (selector: (s: unknown) => unknown) =>
    selector({ closeTab: mockCloseTab, updateTabTitle: mockUpdateTabTitle }),
}));

// Der schwere TipTap-Editor wird gemockt — wir testen nur die Verdrahtung.
// Der Stub spiegelt die relevanten Props als data-Attribute wider.
vi.mock('@/components/editor/tiptap/TipTapEditor', () => ({
  default: ({
    embedded,
    documentId,
    filename,
    onClose,
  }: {
    embedded?: boolean;
    documentId: string;
    filename: string;
    onClose: () => void;
  }) => (
    <div data-testid="tiptap-stub" data-embedded={String(embedded)} data-doc-id={documentId}>
      <span>{filename}</span>
      <button type="button" onClick={onClose}>
        stub-close
      </button>
    </div>
  ),
}));

function mockDoc(ext: string, mime: string, content = '# Hallo Welt') {
  (mockApi.get as Mock).mockImplementation((path: string) => {
    if (path === '/documents/doc1/content') return Promise.resolve({ content });
    if (path === '/documents/doc1') {
      return Promise.resolve({
        document: { id: 'doc1', filename: `notiz${ext}`, mime_type: mime, file_extension: ext },
      });
    }
    return Promise.resolve({});
  });
}

describe('DocumentViewerTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('öffnet eine editierbare Datei direkt im TipTap-Editor (embedded), ohne „Bearbeiten"', async () => {
    mockDoc('.md', 'text/markdown');
    render(<DocumentViewerTab documentId="doc1" tabId="tab1" />);

    const stub = await screen.findByTestId('tiptap-stub');
    expect(stub).toBeInTheDocument();
    // Direkt im Editor — kein Read-only-Vorschau-/„Bearbeiten"-Umweg.
    expect(stub).toHaveAttribute('data-embedded', 'true');
    expect(stub).toHaveAttribute('data-doc-id', 'doc1');
    expect(screen.getByText('notiz.md')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Bearbeiten/ })).not.toBeInTheDocument();
  });

  it('„Schließen" im Editor schließt den Tab über den Store', async () => {
    mockDoc('.md', 'text/markdown');
    render(<DocumentViewerTab documentId="doc1" tabId="tab1" />);

    fireEvent.click(await screen.findByText('stub-close'));
    expect(mockCloseTab).toHaveBeenCalledWith('tab1');
  });

  it('nicht-editierbare Dateien (PDF) öffnen keinen Editor', async () => {
    // PDF lädt per Blob-Download; get liefert eine Response-artige Blob-Quelle.
    (mockApi.get as Mock).mockImplementation((path: string) => {
      if (path === '/documents/doc1') {
        return Promise.resolve({
          document: {
            id: 'doc1',
            filename: 'notiz.pdf',
            mime_type: 'application/pdf',
            file_extension: '.pdf',
          },
        });
      }
      return Promise.resolve({ blob: () => Promise.resolve(new Blob(['x'])) });
    });
    render(<DocumentViewerTab documentId="doc1" tabId="tab1" />);
    await waitFor(() =>
      expect(mockApi.get).toHaveBeenCalledWith('/documents/doc1', expect.anything())
    );
    expect(screen.queryByTestId('tiptap-stub')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Bearbeiten/ })).not.toBeInTheDocument();
  });
});
