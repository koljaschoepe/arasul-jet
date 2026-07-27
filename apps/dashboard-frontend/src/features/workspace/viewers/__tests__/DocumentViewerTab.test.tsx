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

// Der HTML-Viewer nutzt Toasts beim Speichern — Provider hier nicht nötig.
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

// CodeMirror ist im jsdom schwer (Layout-Messung) — durch ein Textarea-Stub
// ersetzen, das value/onChange/testId spiegelt. So bleibt die Verdrahtung
// (HTML-Code-Ansicht, Code-Viewer) prüfbar ohne echten Editor.
vi.mock('../CodeMirrorEditor', () => ({
  default: ({
    value,
    onChange,
    testId,
    ariaLabel,
  }: {
    value: string;
    onChange?: (v: string) => void;
    testId?: string;
    ariaLabel?: string;
  }) => (
    <textarea
      data-testid={testId}
      aria-label={ariaLabel}
      value={value}
      onChange={e => onChange?.(e.target.value)}
    />
  ),
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

  it('öffnet eine HTML-Datei gerendert und schaltet auf den Code-Editor um', async () => {
    mockDoc('.html', 'text/html', '<h1>Hi</h1>');
    render(<DocumentViewerTab documentId="doc1" tabId="tab1" />);

    // Vorschau zuerst: ein Sandbox-iframe mit dem HTML als srcDoc.
    const frame = await screen.findByTestId('html-vorschau');
    expect(frame).toHaveAttribute('srcdoc', '<h1>Hi</h1>');
    expect(frame).toHaveAttribute('sandbox', expect.stringContaining('allow-scripts'));
    // Kein TipTap — HTML rendert, statt als reiner Text zu öffnen.
    expect(screen.queryByTestId('tiptap-stub')).not.toBeInTheDocument();

    // Auf „Code" umschalten → Quelltext im (CodeMirror-)Editor.
    fireEvent.click(screen.getByTestId('html-view-code'));
    const code = await screen.findByTestId('html-code-editor');
    expect(code).toHaveValue('<h1>Hi</h1>');
  });

  it('öffnet Quelltext (.py) farbig im Code-Editor mit Sprach-Label und Speichern', async () => {
    mockDoc('.py', 'text/x-python', 'print("hi")');
    render(<DocumentViewerTab documentId="doc1" tabId="tab1" />);

    // CodeMirror-Editor (Stub) trägt den Inhalt; kein TipTap-Fließtext.
    const editor = await screen.findByTestId('code-editor');
    expect(editor).toHaveValue('print("hi")');
    expect(screen.queryByTestId('tiptap-stub')).not.toBeInTheDocument();
    expect(screen.getByTestId('code-language')).toHaveTextContent('Python');
    expect(screen.getByRole('button', { name: /Speichern/ })).toBeInTheDocument();
  });

  it('Code-Editor: Änderung aktiviert „Speichern" und schreibt den Inhalt zurück', async () => {
    mockDoc('.js', 'text/javascript', 'const a = 1;');
    (mockApi.put as Mock).mockResolvedValue({});
    render(<DocumentViewerTab documentId="doc1" tabId="tab1" />);

    const editor = await screen.findByTestId('code-editor');
    // Vor der Änderung ist „Speichern" deaktiviert (nichts dirty).
    expect(screen.getByRole('button', { name: /Speichern/ })).toBeDisabled();
    fireEvent.change(editor, { target: { value: 'const a = 2;' } });
    fireEvent.click(screen.getByRole('button', { name: /Speichern/ }));
    await waitFor(() =>
      expect(mockApi.put).toHaveBeenCalledWith('/documents/doc1/content', {
        content: 'const a = 2;',
      })
    );
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
