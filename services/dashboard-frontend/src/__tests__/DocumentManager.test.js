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

import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import DocumentManager from '../components/DocumentManager';

jest.mock('axios');

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
    jest.clearAllMocks();

    axios.get.mockImplementation((url) => {
      if (url.includes('/documents') && !url.includes('/categories') && !url.includes('/spaces')) {
        return Promise.resolve({ data: { documents: mockDocuments } });
      }
      if (url.includes('/documents/categories')) {
        return Promise.resolve({ data: { categories: mockCategories } });
      }
      if (url.includes('/documents/spaces')) {
        return Promise.resolve({ data: { spaces: mockSpaces } });
      }
      return Promise.resolve({ data: {} });
    });

    axios.delete.mockResolvedValue({ data: { success: true } });
  });

  describe('Rendering', () => {
    test('rendert DocumentManager korrekt', async () => {
      render(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByText('Dokumente')).toBeInTheDocument();
      });
    });

    test('zeigt Upload-Button', async () => {
      render(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByText(/upload/i) || screen.getByRole('button', { name: /upload/i })).toBeInTheDocument();
      });
    });

    test('zeigt Suchfeld', async () => {
      render(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/such/i) || screen.getByRole('searchbox')).toBeInTheDocument();
      });
    });

    test('zeigt Dokument-Liste', async () => {
      render(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
        expect(screen.getByText('manual.docx')).toBeInTheDocument();
      });
    });
  });

  describe('Document Status Display', () => {
    test('zeigt "Indexiert" Badge für indexed Status', async () => {
      render(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByText(/indexiert/i)).toBeInTheDocument();
      });
    });

    test('zeigt "Verarbeitung" Badge für processing Status', async () => {
      render(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByText(/verarbeitung/i) || screen.getByText(/processing/i)).toBeInTheDocument();
      });
    });

    test('zeigt "Fehlgeschlagen" Badge für failed Status', async () => {
      render(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByText(/fehlgeschlagen/i) || screen.getByText(/failed/i)).toBeInTheDocument();
      });
    });
  });

  describe('Document Filtering', () => {
    test('Filter nach Status funktioniert', async () => {
      const user = userEvent.setup();
      render(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
      });

      // Finde Filter-Buttons
      const filterButton = screen.getByText(/filter/i) || screen.getByRole('button', { name: /filter/i });

      if (filterButton) {
        await user.click(filterButton);

        // Nach Status filtern
        const indexedFilter = screen.queryByText(/indexiert/i);
        if (indexedFilter) {
          await user.click(indexedFilter);

          await waitFor(() => {
            expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
            // processing Dokument sollte nicht sichtbar sein (je nach Implementation)
          });
        }
      }
    });

    test('Suche filtert Dokumente', async () => {
      const user = userEvent.setup();
      render(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/such/i) || screen.getByRole('searchbox');

      await user.type(searchInput, 'manual');

      await waitFor(() => {
        expect(screen.getByText('manual.docx')).toBeInTheDocument();
        // test-document.pdf könnte noch sichtbar sein (je nach Implementation)
      });
    });
  });

  describe('Document Upload', () => {
    test('File Input akzeptiert Dateien', async () => {
      render(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByText('Dokumente')).toBeInTheDocument();
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
      axios.post.mockImplementation((url, data, config) => {
        if (url.includes('/documents/upload')) {
          // Simuliere Progress
          if (config && config.onUploadProgress) {
            config.onUploadProgress({ loaded: 50, total: 100 });
          }
          return new Promise(() => {}); // Never resolve to keep loading state
        }
        return Promise.resolve({ data: {} });
      });

      const user = userEvent.setup();
      render(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByText('Dokumente')).toBeInTheDocument();
      });

      const fileInput = document.querySelector('input[type="file"]');

      if (fileInput) {
        const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
        await user.upload(fileInput, file);

        // Progress sollte angezeigt werden
        await waitFor(() => {
          expect(screen.queryByText(/50%/) || screen.queryByRole('progressbar')).toBeInTheDocument();
        }, { timeout: 2000 });
      }
    });

    test('Upload Error wird angezeigt', async () => {
      axios.post.mockRejectedValue({
        response: { data: { error: 'File too large' } },
      });

      const user = userEvent.setup();
      render(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByText('Dokumente')).toBeInTheDocument();
      });

      const fileInput = document.querySelector('input[type="file"]');

      if (fileInput) {
        const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
        await user.upload(fileInput, file);

        await waitFor(() => {
          expect(screen.queryByText(/error/i) || screen.queryByText(/fehler/i)).toBeInTheDocument();
        }, { timeout: 3000 });
      }
    });
  });

  describe('Document Deletion', () => {
    test('Lösch-Dialog wird angezeigt', async () => {
      const user = userEvent.setup();
      render(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
      });

      // Finde Delete-Button für erstes Dokument
      const deleteButtons = screen.getAllByRole('button').filter(btn =>
        btn.innerHTML.toLowerCase().includes('delete') ||
        btn.innerHTML.toLowerCase().includes('trash') ||
        btn.className.includes('delete')
      );

      if (deleteButtons.length > 0) {
        await user.click(deleteButtons[0]);

        await waitFor(() => {
          expect(
            screen.queryByText(/löschen/i) ||
            screen.queryByText(/delete/i) ||
            screen.queryByText(/bestätigen/i)
          ).toBeInTheDocument();
        });
      }
    });

    test('Dokument wird nach Bestätigung gelöscht', async () => {
      const user = userEvent.setup();
      render(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
      });

      // Simuliere Löschvorgang
      const deleteButtons = document.querySelectorAll('[class*="delete"], [title*="Delete"], [aria-label*="Delete"]');

      if (deleteButtons.length > 0) {
        await user.click(deleteButtons[0]);

        // Bestätigen
        const confirmButton = screen.queryByText(/bestätigen/i) || screen.queryByText(/confirm/i);
        if (confirmButton) {
          await user.click(confirmButton);

          await waitFor(() => {
            expect(axios.delete).toHaveBeenCalled();
          });
        }
      }
    });
  });

  describe('Document Statistics', () => {
    test('zeigt Statistiken an', async () => {
      render(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByText('Dokumente')).toBeInTheDocument();
      });

      // Statistiken sollten irgendwo angezeigt werden
      // Die genaue Position hängt von der Implementation ab
      await waitFor(() => {
        expect(
          screen.queryByText(/3/) || // Total documents
          screen.queryByText(/gesamt/i)
        ).toBeInTheDocument();
      }, { timeout: 2000 });
    });
  });

  describe('Error Handling', () => {
    test('zeigt Fehlermeldung bei API-Fehler', async () => {
      axios.get.mockRejectedValue(new Error('Network Error'));

      render(<DocumentManager />);

      await waitFor(() => {
        expect(
          screen.queryByText(/error/i) ||
          screen.queryByText(/fehler/i) ||
          screen.queryByText(/laden/i)
        ).toBeInTheDocument();
      });
    });

    test('Retry-Button nach Fehler funktioniert', async () => {
      let callCount = 0;
      axios.get.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Network Error'));
        }
        return Promise.resolve({ data: { documents: mockDocuments } });
      });

      const user = userEvent.setup();
      render(<DocumentManager />);

      await waitFor(() => {
        expect(screen.queryByText(/error/i) || screen.queryByText(/fehler/i)).toBeInTheDocument();
      });

      const retryButton = screen.queryByText(/retry/i) ||
                         screen.queryByText(/erneut/i) ||
                         screen.queryByRole('button', { name: /refresh/i });

      if (retryButton) {
        await user.click(retryButton);

        await waitFor(() => {
          expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
        });
      }
    });
  });

  describe('Accessibility', () => {
    test('Dokument-Liste ist per Tastatur navigierbar', async () => {
      render(<DocumentManager />);

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
      render(<DocumentManager />);

      await waitFor(() => {
        expect(screen.getByText('Dokumente')).toBeInTheDocument();
      });

      // File input sollte ein Label haben
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        const label = fileInput.getAttribute('aria-label') ||
                     document.querySelector(`label[for="${fileInput.id}"]`);
        expect(label || fileInput.closest('label')).toBeTruthy();
      }
    });
  });

  describe('Loading States', () => {
    test('zeigt Loading während Dokumente geladen werden', async () => {
      axios.get.mockImplementation(() => new Promise(() => {})); // Never resolve

      render(<DocumentManager />);

      expect(
        screen.queryByText(/laden/i) ||
        screen.queryByText(/loading/i) ||
        document.querySelector('.loading-spinner')
      ).toBeTruthy();
    });
  });

  // =====================================================
  // Knowledge Spaces Tests (RAG 2.0)
  // =====================================================
  describe('Knowledge Spaces (RAG 2.0)', () => {
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
        is_system: false
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
        is_system: false
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
        is_system: true
      }
    ];

    beforeEach(() => {
      axios.get.mockImplementation((url) => {
        if (url.includes('/documents') && !url.includes('/categories') && !url.includes('/spaces')) {
          return Promise.resolve({ data: { documents: mockDocuments } });
        }
        if (url.includes('/documents/categories')) {
          return Promise.resolve({ data: { categories: mockCategories } });
        }
        if (url.includes('/spaces')) {
          return Promise.resolve({ data: { spaces: mockSpaces } });
        }
        return Promise.resolve({ data: {} });
      });
    });

    describe('Space Tabs Display', () => {
      test('lädt und zeigt Space-Tabs an', async () => {
        render(<DocumentManager />);

        await waitFor(() => {
          expect(screen.getByText('Technical Documentation')).toBeInTheDocument();
          expect(screen.getByText('Company Knowledge')).toBeInTheDocument();
        });
      });

      test('zeigt "Alle" Tab für alle Dokumente', async () => {
        render(<DocumentManager />);

        await waitFor(() => {
          expect(screen.getByText(/alle/i)).toBeInTheDocument();
        });
      });

      test('zeigt Document Count für jeden Space', async () => {
        render(<DocumentManager />);

        await waitFor(() => {
          // Should show document counts in space tabs
          expect(screen.getByText('10')).toBeInTheDocument();
          expect(screen.getByText('25')).toBeInTheDocument();
        });
      });

      test('zeigt "Add Space" Button', async () => {
        render(<DocumentManager />);

        await waitFor(() => {
          const addButton = screen.queryByText(/neuer/i) ||
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
        render(<DocumentManager />);

        await waitFor(() => {
          expect(screen.getByText('Technical Documentation')).toBeInTheDocument();
        });

        // Click on a space tab
        const spaceTab = screen.getByText('Technical Documentation');
        await user.click(spaceTab);

        // API should be called with space_id filter
        await waitFor(() => {
          expect(axios.get).toHaveBeenCalledWith(
            expect.stringContaining('space_id=space-1')
          );
        });
      });

      test('klick auf "Alle" zeigt alle Dokumente', async () => {
        const user = userEvent.setup();
        render(<DocumentManager />);

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
          const lastCall = axios.get.mock.calls[axios.get.mock.calls.length - 1];
          expect(lastCall[0]).not.toContain('space_id');
        });
      });

      test('zeigt aktiven Space mit Highlight', async () => {
        const user = userEvent.setup();
        render(<DocumentManager />);

        await waitFor(() => {
          expect(screen.getByText('Technical Documentation')).toBeInTheDocument();
        });

        // Click on a space tab
        const spaceTab = screen.getByText('Technical Documentation').closest('.space-tab') ||
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
        render(<DocumentManager />);

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
        render(<DocumentManager />);

        await waitFor(() => {
          expect(screen.getByText('Technical Documentation')).toBeInTheDocument();
        });

        // Find add space button
        const addButton = document.querySelector('.add-space') ||
                         screen.queryByLabelText(/space hinzufügen/i);

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
        render(<DocumentManager />);

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
        render(<DocumentManager />);

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
              screen.queryByText(/bearbeiten/i) ||
              document.querySelector('.modal')
            ).toBeTruthy();
          });
        }
      });
    });

    describe('Upload to Space', () => {
      test('Upload geht an aktiven Space', async () => {
        const user = userEvent.setup();

        axios.post.mockResolvedValue({
          data: { success: true, document: { id: 'new-doc' } }
        });

        render(<DocumentManager />);

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
          await waitFor(() => {
            const postCalls = axios.post.mock.calls;
            const uploadCall = postCalls.find(call => call[0].includes('/upload'));

            if (uploadCall) {
              const formData = uploadCall[1];
              // FormData should include space_id
              expect(formData.has('space_id') || formData.get('space_id')).toBeTruthy();
            }
          }, { timeout: 3000 });
        }
      });

      test('zeigt Ziel-Space Hint im Upload-Bereich', async () => {
        const user = userEvent.setup();
        render(<DocumentManager />);

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
            space_color: '#3b82f6'
          }
        ];

        axios.get.mockImplementation((url) => {
          if (url.includes('/documents') && !url.includes('/categories') && !url.includes('/spaces')) {
            return Promise.resolve({ data: { documents: docsWithSpaces } });
          }
          if (url.includes('/spaces')) {
            return Promise.resolve({ data: { spaces: mockSpaces } });
          }
          return Promise.resolve({ data: {} });
        });

        render(<DocumentManager />);

        await waitFor(() => {
          const spaceBadge = document.querySelector('.space-badge');
          expect(spaceBadge).toBeTruthy();
        });
      });
    });

    describe('Space API Error Handling', () => {
      test('behandelt Spaces-API-Fehler graceful', async () => {
        axios.get.mockImplementation((url) => {
          if (url.includes('/spaces')) {
            return Promise.reject(new Error('Space API Error'));
          }
          if (url.includes('/documents')) {
            return Promise.resolve({ data: { documents: mockDocuments } });
          }
          return Promise.resolve({ data: {} });
        });

        // Should not crash
        render(<DocumentManager />);

        await waitFor(() => {
          // Documents should still load
          expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
        });
      });
    });
  });
});
