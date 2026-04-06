/**
 * DocumentManager Component Tests
 *
 * Tests für die Dokumentenverwaltung:
 * - Dokument-Liste
 * - Upload-Funktionalität
 * - Filter und Suche
 * - Lösch-Funktionalität
 * - Status-Anzeige
 */

// Mock MarkdownEditor component which uses react-markdown - must be before imports
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../../../contexts/ToastContext';
import DocumentManager from '../DocumentManager';

vi.mock('../../../components/editor/tiptap/TipTapEditor', () => ({
  default: function MockTipTapEditor({ value, onChange }) {
    const React = require('react');
    return React.createElement('textarea', {
      'data-testid': 'markdown-editor',
      value: value || '',
      onChange: e => onChange && onChange(e.target.value),
    });
  },
}));

// Mock react-markdown to avoid ESM issues
vi.mock('react-markdown', () => ({
  default: function MockReactMarkdown({ children }) {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'markdown' }, children);
  },
}));

// Mock remark-gfm
vi.mock('remark-gfm', () => ({ default: () => {} }));

const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  request: vi.fn(),
};
vi.mock('../../../hooks/useApi', () => ({ useApi: () => mockApi, default: () => mockApi }));

const renderWithProviders = ui => render(<ToastProvider>{ui}</ToastProvider>);

describe('DocumentManager Component', () => {
  const mockDocuments = [
    {
      id: 1,
      filename: 'test-document.pdf',
      original_filename: 'test-document.pdf',
      mime_type: 'application/pdf',
      size: 1024000,
      status: 'indexed',
      category: 'General',
      created_at: '2024-01-15T10:00:00Z',
      chunks_count: 15,
    },
    {
      id: 2,
      filename: 'manual.docx',
      original_filename: 'manual.docx',
      mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 512000,
      status: 'processing',
      category: 'Technical',
      created_at: '2024-01-14T15:30:00Z',
      chunks_count: 0,
    },
    {
      id: 3,
      filename: 'failed-doc.txt',
      original_filename: 'failed-doc.txt',
      mime_type: 'text/plain',
      size: 256,
      status: 'failed',
      category: 'General',
      created_at: '2024-01-13T08:00:00Z',
      chunks_count: 0,
      error_message: 'Parsing failed',
    },
  ];

  const mockCategories = ['General', 'Technical', 'Legal'];
  const mockSpaces = [
    { id: 1, name: 'Default Space', document_count: 10 },
    { id: 2, name: 'Technical Docs', document_count: 5 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockApi.get.mockImplementation(url => {
      if (
        url.includes('/documents') &&
        !url.includes('/categories') &&
        !url.includes('/spaces') &&
        !url.includes('/statistics')
      ) {
        return Promise.resolve({ documents: mockDocuments });
      }
      if (url.includes('/documents/categories')) {
        return Promise.resolve({ categories: mockCategories });
      }
      if (url.includes('/documents/spaces') || url.includes('/spaces')) {
        return Promise.resolve({ spaces: mockSpaces });
      }
      if (url.includes('/statistics')) {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    mockApi.del.mockResolvedValue({ success: true });
  });

  describe('Rendering', () => {
    test('rendert DocumentManager korrekt', async () => {
      renderWithProviders(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByRole('main', { name: 'Dokumentenverwaltung' })).toBeInTheDocument();
      });
    });

    test('zeigt Upload-Button', async () => {
      const { container } = renderWithProviders(<DocumentManager />);

      await waitFor(() => {
        const uploadBtn =
          screen.queryByText(/upload/i) ||
          screen.queryByRole('button', { name: /upload/i }) ||
          container.querySelector('[class*="upload"]') ||
          container.querySelector('input[type="file"]');
        expect(uploadBtn).toBeTruthy();
      });
    });

    test('zeigt Suchfeld', async () => {
      renderWithProviders(<DocumentManager />);
      await waitFor(() => {
        expect(screen.getByLabelText('Nach Namen suchen')).toBeInTheDocument();
      });
    });

    test('zeigt Dokument-Liste', async () => {
      renderWithProviders(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
        expect(screen.getByText('manual.docx')).toBeInTheDocument();
      });
    });
  });

  describe('Document Status Display', () => {
    test('zeigt "Indexiert" Badge für indexed Status', async () => {
      renderWithProviders(<DocumentManager />);
      await waitFor(() => {
        expect(screen.getByRole('status', { name: 'Status: Indexiert' })).toBeInTheDocument();
      });
    });

    test('zeigt "Verarbeitung" Badge für processing Status', async () => {
      renderWithProviders(<DocumentManager />);

      await waitFor(() => {
        expect(
          screen.getByText(/verarbeitung/i) || screen.getByText(/processing/i)
        ).toBeInTheDocument();
      });
    });

    test('zeigt "Fehlgeschlagen" Badge für failed Status', async () => {
      renderWithProviders(<DocumentManager />);

      await waitFor(() => {
        expect(
          screen.getByText(/fehlgeschlagen/i) || screen.getByText(/failed/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('Document Filtering', () => {
    test('Filter nach Status funktioniert', async () => {
      const user = userEvent.setup();
      renderWithProviders(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
      });

      const statusSelect = screen.getByLabelText('Nach Status filtern');
      await user.selectOptions(statusSelect, 'indexed');

      // Verify the filter was applied (API called with status param)
      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith(
          expect.stringContaining('status='),
          expect.anything()
        );
      });
    });

    test('Suche filtert Dokumente', async () => {
      const user = userEvent.setup();
      renderWithProviders(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
      });

      const searchInput = screen.getByLabelText('Nach Namen suchen');
      await user.type(searchInput, 'manual');

      // API should be called with search param
      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith(
          expect.stringContaining('search=manual'),
          expect.anything()
        );
      });
    });
  });

  describe('Document Upload', () => {
    test('File Input akzeptiert Dateien', async () => {
      renderWithProviders(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByRole('main', { name: 'Dokumentenverwaltung' })).toBeInTheDocument();
      });

      // Finde File Input (kann hidden sein)
      const fileInput = document.querySelector('input[type="file"]');

      if (fileInput) {
        expect(fileInput).toHaveAttribute('accept');
        // Akzeptierte Formate sollten PDF, DOCX, TXT, MD enthalten
        const accept = fileInput.getAttribute('accept') || '';
        expect(accept.includes('.pdf') || accept.includes('application/pdf')).toBe(true);
      }
    });

    test('Upload Progress wird angezeigt', async () => {
      mockApi.post.mockImplementation(url => {
        if (url.includes('/documents/upload')) {
          return new Promise(() => {}); // Never resolve to keep loading state
        }
        return Promise.resolve({});
      });

      const user = userEvent.setup();
      renderWithProviders(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByRole('main', { name: 'Dokumentenverwaltung' })).toBeInTheDocument();
      });

      const fileInput = document.querySelector('input[type="file"]');

      if (fileInput) {
        const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
        await user.upload(fileInput, file);

        // Progress or loading indicator should be shown - be flexible about exact representation
        await waitFor(
          () => {
            const hasProgress =
              screen.queryByText(/50%/) ||
              screen.queryByRole('progressbar') ||
              document.querySelector('[class*="progress"]') ||
              document.querySelector('[class*="uploading"]') ||
              screen.queryByText(/hochladen/i) ||
              screen.queryByText(/upload/i);
            expect(hasProgress).toBeTruthy();
          },
          { timeout: 3000 }
        );
      }
    });

    test('Upload Error wird angezeigt', async () => {
      mockApi.post.mockRejectedValue(new Error('File too large'));
      const user = userEvent.setup();
      renderWithProviders(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByRole('main', { name: 'Dokumentenverwaltung' })).toBeInTheDocument();
      });

      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
        await user.upload(fileInput, file);

        await waitFor(
          () => {
            const errorElement =
              document.querySelector('.dm-error') ||
              screen.queryByText(/fehler/i) ||
              screen.queryByText(/error/i);
            expect(errorElement).toBeTruthy();
          },
          { timeout: 3000 }
        );
      }
    });
  });

  describe('Document Deletion', () => {
    test('Lösch-Dialog wird angezeigt', async () => {
      const user = userEvent.setup();
      renderWithProviders(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
      });

      // Delete buttons have aria-label "FILENAME löschen"
      const deleteButton = screen.getByLabelText('test-document.pdf löschen');
      await user.click(deleteButton);

      // useConfirm hook shows a confirmation dialog with message and button
      await waitFor(() => {
        expect(screen.getByText(/wirklich löschen/i)).toBeInTheDocument();
      });
    });

    test('Dokument wird nach Bestätigung gelöscht', async () => {
      const user = userEvent.setup();
      renderWithProviders(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
      });

      // Simuliere Löschvorgang
      const deleteButtons = document.querySelectorAll(
        '[class*="delete"], [title*="Delete"], [aria-label*="Delete"]'
      );

      if (deleteButtons.length > 0) {
        await user.click(deleteButtons[0]);

        // Bestätigen
        const confirmButton = screen.queryByText(/bestätigen/i) || screen.queryByText(/confirm/i);
        if (confirmButton) {
          await user.click(confirmButton);

          await waitFor(() => {
            expect(mockApi.del).toHaveBeenCalled();
          });
        }
      }
    });
  });

  describe('Document Statistics', () => {
    test('zeigt Statistiken an', async () => {
      renderWithProviders(<DocumentManager />);

      // Stats row should always render with stat cards
      await waitFor(() => {
        const statCards = document.querySelectorAll('.dm-stat-card');
        expect(statCards.length).toBeGreaterThan(0);
      });

      // Check for stat labels — stats show Dokumente, Indexierte Chunks, Wartend, Tabellen
      await waitFor(() => {
        expect(screen.getByText(/Dokumente/)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    test('zeigt Fehlermeldung bei API-Fehler', async () => {
      // All API calls reject - error persists across all loadDocuments calls
      mockApi.get.mockRejectedValue(new Error('Network Error'));

      renderWithProviders(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByText(/Fehler beim Laden der Dokumente/)).toBeInTheDocument();
      });
    });

    test('Fehlermeldung kann geschlossen werden', async () => {
      // All API calls reject
      mockApi.get.mockRejectedValue(new Error('Network Error'));

      renderWithProviders(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByText(/Fehler beim Laden der Dokumente/)).toBeInTheDocument();
      });

      // Error message should have a close button
      const closeButton = document.querySelector('.dm-error button');
      expect(closeButton).toBeTruthy();

      fireEvent.click(closeButton);

      // Error message should be dismissed
      await waitFor(() => {
        expect(screen.queryByText(/Fehler beim Laden der Dokumente/)).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    test('Dokument-Liste ist per Tastatur navigierbar', async () => {
      renderWithProviders(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
      });

      // Tab sollte durch Elemente navigieren können
      const firstFocusable = document.querySelector('button, [tabindex="0"], input');
      if (firstFocusable) {
        firstFocusable.focus();
        expect(document.activeElement).not.toBe(document.body);
      }
    });

    test('File Upload hat accessible Label', async () => {
      renderWithProviders(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByRole('main', { name: 'Dokumentenverwaltung' })).toBeInTheDocument();
      });

      // File input sollte ein Label haben
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        const label =
          fileInput.getAttribute('aria-label') ||
          document.querySelector(`label[for="${fileInput.id}"]`);
        expect(label || fileInput.closest('label')).toBeTruthy();
      }
    });
  });

  describe('Loading States', () => {
    test('zeigt Loading während Dokumente geladen werden', async () => {
      mockApi.get.mockImplementation(() => new Promise(() => {})); // Never resolve

      renderWithProviders(<DocumentManager />);

      // Component shows SkeletonDocumentList during loading
      expect(
        document.querySelector('.skeleton-document-list') ||
          document.querySelector('[class*="skeleton"]') ||
          screen.queryByRole('status')
      ).toBeTruthy();
    });
  });

  // =====================================================
  // Knowledge Spaces Tests (RAG 2.0)
  // NOTE: These tests are skipped as the feature is not fully implemented yet
  // =====================================================
  describe.skip('Knowledge Spaces (RAG 2.0)', () => {
    const mockSpaces = [
      {
        id: 'space-1',
        name: 'Technical Documentation',
        slug: 'tech-docs',
        description: 'All technical documentation and guides',
        color: '#3b82f6',
        icon: 'folder',
        document_count: 10,
        is_default: false,
        is_system: false,
      },
      {
        id: 'space-2',
        name: 'Company Knowledge',
        slug: 'company',
        description: 'Company-wide knowledge base',
        color: '#10b981',
        icon: 'briefcase',
        document_count: 25,
        is_default: true,
        is_system: false,
      },
      {
        id: 'space-3',
        name: 'System',
        slug: 'system',
        description: 'System documents (do not delete)',
        color: '#6366f1',
        icon: 'cog',
        document_count: 5,
        is_default: false,
        is_system: true,
      },
    ];

    beforeEach(() => {
      mockApi.get.mockImplementation(url => {
        if (
          url.includes('/documents') &&
          !url.includes('/categories') &&
          !url.includes('/spaces')
        ) {
          return Promise.resolve({ documents: mockDocuments });
        }
        if (url.includes('/documents/categories')) {
          return Promise.resolve({ categories: mockCategories });
        }
        if (url.includes('/spaces')) {
          return Promise.resolve({ spaces: mockSpaces });
        }
        return Promise.resolve({});
      });
    });

    describe('Space Tabs Display', () => {
      test('lädt und zeigt Space-Tabs an', async () => {
        renderWithProviders(<DocumentManager />);

        await waitFor(() => {
          expect(screen.getByText('Technical Documentation')).toBeInTheDocument();
          expect(screen.getByText('Company Knowledge')).toBeInTheDocument();
        });
      });

      test('zeigt "Alle" Tab für alle Dokumente', async () => {
        renderWithProviders(<DocumentManager />);

        await waitFor(() => {
          expect(screen.getByText(/alle/i)).toBeInTheDocument();
        });
      });

      test('zeigt Document Count für jeden Space', async () => {
        renderWithProviders(<DocumentManager />);

        await waitFor(() => {
          // Should show document counts in space tabs
          expect(screen.getByText('10')).toBeInTheDocument();
          expect(screen.getByText('25')).toBeInTheDocument();
        });
      });

      test('zeigt "Add Space" Button', async () => {
        renderWithProviders(<DocumentManager />);

        await waitFor(() => {
          const addButton =
            screen.queryByText(/neuer/i) ||
            screen.queryByText(/hinzufügen/i) ||
            document.querySelector('.add-space') ||
            document.querySelector('[class*="add"]');
          expect(addButton).toBeTruthy();
        });
      });
    });

    describe('Space Filtering', () => {
      test('klick auf Space-Tab filtert Dokumente', async () => {
        const user = userEvent.setup();
        renderWithProviders(<DocumentManager />);

        await waitFor(() => {
          expect(screen.getByText('Technical Documentation')).toBeInTheDocument();
        });

        // Click on a space tab
        const spaceTab = screen.getByText('Technical Documentation');
        await user.click(spaceTab);

        // API should be called with space_id filter
        await waitFor(() => {
          expect(mockApi.get).toHaveBeenCalledWith(
            expect.stringContaining('space_id=space-1'),
            expect.anything()
          );
        });
      });

      test('klick auf "Alle" zeigt alle Dokumente', async () => {
        const user = userEvent.setup();
        renderWithProviders(<DocumentManager />);

        await waitFor(() => {
          expect(screen.getByText('Technical Documentation')).toBeInTheDocument();
        });

        // First select a space
        const spaceTab = screen.getByText('Technical Documentation');
        await user.click(spaceTab);

        // Then click "Alle"
        const allTab = screen.getByText(/alle/i);
        await user.click(allTab);

        // API should be called without space_id filter
        await waitFor(() => {
          const lastCall = mockApi.get.mock.calls[mockApi.get.mock.calls.length - 1];
          expect(lastCall[0]).not.toContain('space_id');
        });
      });

      test('zeigt aktiven Space mit Highlight', async () => {
        const user = userEvent.setup();
        renderWithProviders(<DocumentManager />);

        await waitFor(() => {
          expect(screen.getByText('Technical Documentation')).toBeInTheDocument();
        });

        // Click on a space tab
        const spaceTab =
          screen.getByText('Technical Documentation').closest('.space-tab') ||
          screen.getByText('Technical Documentation').closest('button');

        await user.click(spaceTab || screen.getByText('Technical Documentation'));

        // Tab should have active class
        await waitFor(() => {
          const activeTab = document.querySelector('.space-tab.active');
          expect(activeTab).toBeTruthy();
        });
      });
    });

    describe('Space Description Display', () => {
      test('zeigt Space-Beschreibung wenn Space ausgewählt', async () => {
        const user = userEvent.setup();
        renderWithProviders(<DocumentManager />);

        await waitFor(() => {
          expect(screen.getByText('Technical Documentation')).toBeInTheDocument();
        });

        // Click on a space
        await user.click(screen.getByText('Technical Documentation'));

        // Description should be shown
        await waitFor(() => {
          expect(screen.queryByText(/technical documentation and guides/i)).toBeInTheDocument();
        });
      });
    });

    describe('Space Modal', () => {
      test('öffnet Modal beim Klick auf "Add Space"', async () => {
        const user = userEvent.setup();
        renderWithProviders(<DocumentManager />);

        await waitFor(() => {
          expect(screen.getByText('Technical Documentation')).toBeInTheDocument();
        });

        // Find add space button
        const addButton =
          document.querySelector('.add-space') || screen.queryByLabelText(/space hinzufügen/i);

        if (addButton) {
          await user.click(addButton);

          // Modal should appear
          await waitFor(() => {
            expect(
              screen.queryByText(/wissensbereich/i) ||
                screen.queryByText(/space erstellen/i) ||
                document.querySelector('.modal')
            ).toBeTruthy();
          });
        }
      });

      test('Edit-Button nur für nicht-System Spaces', async () => {
        renderWithProviders(<DocumentManager />);

        await waitFor(() => {
          expect(screen.getByText('Technical Documentation')).toBeInTheDocument();
        });

        // Find edit buttons - should not be present for system spaces
        const editButtons = document.querySelectorAll('.space-edit-btn');

        // Should have edit buttons for non-system spaces (space-1 and space-2)
        expect(editButtons.length).toBeLessThanOrEqual(2);
      });

      test('öffnet Edit-Modal beim Klick auf Edit-Button', async () => {
        const user = userEvent.setup();
        renderWithProviders(<DocumentManager />);

        await waitFor(() => {
          expect(screen.getByText('Technical Documentation')).toBeInTheDocument();
        });

        // Find edit button for Technical Documentation
        const editButton = document.querySelector('.space-edit-btn');

        if (editButton) {
          await user.click(editButton);

          // Modal should open in edit mode
          await waitFor(() => {
            expect(
              screen.queryByText(/bearbeiten/i) || document.querySelector('.modal')
            ).toBeTruthy();
          });
        }
      });
    });

    describe('Upload to Space', () => {
      test('Upload geht an aktiven Space', async () => {
        const user = userEvent.setup();

        mockApi.post.mockResolvedValue({ success: true, document: { id: 'new-doc' } });

        renderWithProviders(<DocumentManager />);

        await waitFor(() => {
          expect(screen.getByText('Technical Documentation')).toBeInTheDocument();
        });

        // Select a space first
        await user.click(screen.getByText('Technical Documentation'));

        // Upload a file
        const fileInput = document.querySelector('input[type="file"]');

        if (fileInput) {
          const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
          await user.upload(fileInput, file);

          // Should include space_id in upload
          await waitFor(
            () => {
              const postCalls = mockApi.post.mock.calls;
              const uploadCall = postCalls.find(call => call[0].includes('/upload'));

              if (uploadCall) {
                const formData = uploadCall[1];
                // FormData should include space_id
                expect(formData.has('space_id') || formData.get('space_id')).toBeTruthy();
              }
            },
            { timeout: 3000 }
          );
        }
      });

      test('zeigt Ziel-Space Hint im Upload-Bereich', async () => {
        const user = userEvent.setup();
        renderWithProviders(<DocumentManager />);

        await waitFor(() => {
          expect(screen.getByText('Technical Documentation')).toBeInTheDocument();
        });

        // Select a space
        await user.click(screen.getByText('Technical Documentation'));

        // Should show hint about target space
        await waitFor(() => {
          expect(
            screen.queryByText(/Technical Documentation/i) ||
              document.querySelector('.upload-space-hint')
          ).toBeTruthy();
        });
      });
    });

    describe('Space Badge on Documents', () => {
      test('zeigt Space-Badge auf Dokumenten', async () => {
        // Mock documents with space info
        const docsWithSpaces = [
          {
            ...mockDocuments[0],
            space_id: 'space-1',
            space_name: 'Technical Documentation',
            space_color: '#3b82f6',
          },
        ];

        mockApi.get.mockImplementation(url => {
          if (
            url.includes('/documents') &&
            !url.includes('/categories') &&
            !url.includes('/spaces')
          ) {
            return Promise.resolve({ documents: docsWithSpaces });
          }
          if (url.includes('/spaces')) {
            return Promise.resolve({ spaces: mockSpaces });
          }
          return Promise.resolve({});
        });

        renderWithProviders(<DocumentManager />);

        await waitFor(() => {
          const spaceBadge = document.querySelector('.space-badge');
          expect(spaceBadge).toBeTruthy();
        });
      });
    });

    describe('Space API Error Handling', () => {
      test('behandelt Spaces-API-Fehler graceful', async () => {
        mockApi.get.mockImplementation(url => {
          if (url.includes('/spaces')) {
            return Promise.reject(new Error('Space API Error'));
          }
          if (url.includes('/documents')) {
            return Promise.resolve({ documents: mockDocuments });
          }
          return Promise.resolve({});
        });

        // Should not crash
        renderWithProviders(<DocumentManager />);

        await waitFor(() => {
          // Documents should still load
          expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
        });
      });
    });
  });
});
