import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Mock } from 'vitest';
import DocumentViewerTab from '../DocumentViewerTab';

const mockApi = { get: vi.fn(), post: vi.fn(), put: vi.fn() };
vi.mock('@/hooks/useApi', () => ({ useApi: () => mockApi }));

// Der schwere TipTap-Editor wird gemockt — wir testen nur die Verdrahtung.
vi.mock('@/components/editor/tiptap/TipTapEditor', () => ({
  default: ({
    filename,
    onSave,
    onClose,
  }: {
    filename: string;
    onSave?: () => void;
    onClose: () => void;
  }) => (
    <div data-testid="tiptap-stub">
      <span>{filename}</span>
      <button type="button" onClick={onSave}>
        stub-save
      </button>
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

  it('zeigt Markdown-Vorschau mit „Bearbeiten"-Button', async () => {
    mockDoc('.md', 'text/markdown');
    render(<DocumentViewerTab documentId="doc1" tabId="tab1" />);
    expect(await screen.findByText('Hallo Welt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bearbeiten/ })).toBeInTheDocument();
  });

  it('„Bearbeiten" öffnet den Editor; Speichern lädt die Vorschau neu', async () => {
    mockDoc('.md', 'text/markdown');
    render(<DocumentViewerTab documentId="doc1" tabId="tab1" />);
    fireEvent.click(await screen.findByRole('button', { name: /Bearbeiten/ }));

    const stub = await screen.findByTestId('tiptap-stub');
    expect(stub).toBeInTheDocument();

    const contentCallsBefore = (mockApi.get as Mock).mock.calls.filter(
      c => c[0] === '/documents/doc1/content'
    ).length;
    fireEvent.click(screen.getByText('stub-save'));
    // Re-Fetch des Inhalts nach dem Speichern
    await waitFor(() =>
      expect(
        (mockApi.get as Mock).mock.calls.filter(c => c[0] === '/documents/doc1/content').length
      ).toBeGreaterThan(contentCallsBefore)
    );
  });

  it('nicht-editierbare Dateien (PDF) haben keinen „Bearbeiten"-Button', async () => {
    mockDoc('.pdf', 'application/pdf');
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
    expect(screen.queryByRole('button', { name: /Bearbeiten/ })).not.toBeInTheDocument();
  });
});
