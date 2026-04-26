/**
 * ChatTopBar Component Tests
 *
 * Tests für die obere Leiste der Chat-Ansicht:
 * - Zurück-Button navigiert zur Landing
 * - Titel wird angezeigt
 * - Titel kann per Klick editiert werden
 * - Escape bricht Titel-Bearbeitung ab
 * - Enter speichert neuen Titel
 * - Export-Button löst Download aus
 * - Löschen-Button mit Bestätigung
 * - Projekt-Badge Anzeige
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ChatTopBar from '../components/ChatTopBar';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  request: vi.fn(),
};
vi.mock('../../../hooks/useApi', () => ({ useApi: () => mockApi }));

const mockToast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
vi.mock('../../../contexts/ToastContext', () => ({ useToast: () => mockToast }));

vi.mock('../../../contexts/ChatContext', () => ({
  useChatContext: () => ({ activeJobIds: {} }),
}));

// Mock useConfirm
const mockConfirm = vi.fn().mockResolvedValue(true);
vi.mock('../../../hooks/useConfirm', () => ({
  default: () => ({
    confirm: mockConfirm,
    ConfirmDialog: null,
  }),
}));

describe('ChatTopBar Component', () => {
  const defaultProps = {
    chatId: 1,
    title: 'Mein Test Chat',
    onTitleChange: vi.fn(),
    project: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =====================================================
  // Rendering
  // =====================================================
  describe('Rendering', () => {
    test('rendert Zurück-Button', () => {
      render(<ChatTopBar {...defaultProps} />);
      expect(screen.getByRole('button', { name: 'Zurück zur Übersicht' })).toBeInTheDocument();
    });

    test('rendert Chat-Titel', () => {
      render(<ChatTopBar {...defaultProps} />);
      expect(screen.getByText('Mein Test Chat')).toBeInTheDocument();
    });

    test('zeigt "Neuer Chat" wenn Titel leer', () => {
      render(<ChatTopBar {...defaultProps} title="" />);
      expect(screen.getByText('Neuer Chat')).toBeInTheDocument();
    });

    test('rendert Export-Button', () => {
      render(<ChatTopBar {...defaultProps} />);
      expect(screen.getByTitle('Chat exportieren')).toBeInTheDocument();
    });

    test('rendert Löschen-Button', () => {
      render(<ChatTopBar {...defaultProps} />);
      expect(screen.getByTitle('Chat löschen')).toBeInTheDocument();
    });

    test('zeigt Projekt-Badge wenn project gesetzt', () => {
      render(<ChatTopBar {...defaultProps} project={{ name: 'Test Projekt', color: '#45ADFF' }} />);
      expect(screen.getByText('Test Projekt')).toBeInTheDocument();
    });

    test('zeigt kein Projekt-Badge wenn project null', () => {
      render(<ChatTopBar {...defaultProps} project={null} />);
      expect(screen.queryByText('Test Projekt')).not.toBeInTheDocument();
    });
  });

  // =====================================================
  // Navigation
  // =====================================================
  describe('Navigation', () => {
    test('Zurück-Button navigiert zu /chat', async () => {
      const user = userEvent.setup();
      render(<ChatTopBar {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'Zurück zur Übersicht' }));
      expect(mockNavigate).toHaveBeenCalledWith('/chat');
    });
  });

  // =====================================================
  // Titel-Bearbeitung
  // =====================================================
  describe('Titel-Bearbeitung', () => {
    test('Klick auf Titel öffnet Input', async () => {
      const user = userEvent.setup();
      render(<ChatTopBar {...defaultProps} />);

      await user.click(screen.getByText('Mein Test Chat'));

      const input = screen.getByRole('textbox');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('Mein Test Chat');
    });

    test('Input hat autoFocus', async () => {
      const user = userEvent.setup();
      render(<ChatTopBar {...defaultProps} />);

      await user.click(screen.getByText('Mein Test Chat'));

      expect(screen.getByRole('textbox')).toHaveFocus();
    });

    test('Enter speichert neuen Titel', async () => {
      const user = userEvent.setup();
      const onTitleChange = vi.fn();
      mockApi.patch.mockResolvedValueOnce({});

      render(<ChatTopBar {...defaultProps} onTitleChange={onTitleChange} />);

      await user.click(screen.getByText('Mein Test Chat'));
      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, 'Neuer Titel{enter}');

      expect(mockApi.patch).toHaveBeenCalledWith(
        '/chats/1',
        { title: 'Neuer Titel' },
        expect.any(Object)
      );
      expect(onTitleChange).toHaveBeenCalledWith('Neuer Titel');
    });

    test('Escape bricht Bearbeitung ab', async () => {
      const user = userEvent.setup();
      render(<ChatTopBar {...defaultProps} />);

      await user.click(screen.getByText('Mein Test Chat'));
      expect(screen.getByRole('textbox')).toBeInTheDocument();

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.getByText('Mein Test Chat')).toBeInTheDocument();
    });

    test('Leerer Titel wird nicht gespeichert', async () => {
      const user = userEvent.setup();
      render(<ChatTopBar {...defaultProps} />);

      await user.click(screen.getByText('Mein Test Chat'));
      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.keyboard('{Enter}');

      expect(mockApi.patch).not.toHaveBeenCalled();
    });

    test('Gleicher Titel wird nicht gespeichert', async () => {
      const user = userEvent.setup();
      render(<ChatTopBar {...defaultProps} />);

      await user.click(screen.getByText('Mein Test Chat'));
      await user.keyboard('{Enter}');

      expect(mockApi.patch).not.toHaveBeenCalled();
    });
  });

  // =====================================================
  // Export
  // =====================================================
  describe('Export', () => {
    test('Export-Button löst API-Aufruf aus', async () => {
      const user = userEvent.setup();
      const mockBlob = new Blob(['test'], { type: 'application/json' });
      mockApi.get.mockResolvedValueOnce({
        headers: { get: () => 'attachment; filename="chat.json"' },
        blob: () => Promise.resolve(mockBlob),
      });

      // Mock URL.createObjectURL
      global.URL.createObjectURL = vi.fn(() => 'blob:test');
      global.URL.revokeObjectURL = vi.fn();

      render(<ChatTopBar {...defaultProps} />);

      await user.click(screen.getByTitle('Chat exportieren'));

      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith(
          '/chats/1/export?format=json',
          expect.objectContaining({ raw: true })
        );
      });
    });

    test('zeigt Toast bei Export-Fehler', async () => {
      const user = userEvent.setup();
      mockApi.get.mockRejectedValueOnce(new Error('Export failed'));

      render(<ChatTopBar {...defaultProps} />);

      await user.click(screen.getByTitle('Chat exportieren'));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Export fehlgeschlagen');
      });
    });
  });

  // =====================================================
  // Löschen
  // =====================================================
  describe('Löschen', () => {
    test('Löschen-Button fragt Bestätigung', async () => {
      const user = userEvent.setup();
      mockConfirm.mockResolvedValueOnce(false);

      render(<ChatTopBar {...defaultProps} />);

      await user.click(screen.getByTitle('Chat löschen'));

      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Chat löschen',
          confirmText: 'Löschen',
        })
      );
    });

    test('bei Bestätigung wird Chat gelöscht und navigiert', async () => {
      const user = userEvent.setup();
      mockConfirm.mockResolvedValueOnce(true);
      mockApi.del.mockResolvedValueOnce({});

      render(<ChatTopBar {...defaultProps} />);

      await user.click(screen.getByTitle('Chat löschen'));

      await waitFor(() => {
        expect(mockApi.del).toHaveBeenCalledWith('/chats/1', expect.any(Object));
        expect(mockNavigate).toHaveBeenCalledWith('/chat', { replace: true });
      });
    });

    test('bei Ablehnung wird nicht gelöscht', async () => {
      const user = userEvent.setup();
      mockConfirm.mockResolvedValueOnce(false);

      render(<ChatTopBar {...defaultProps} />);

      await user.click(screen.getByTitle('Chat löschen'));

      expect(mockApi.del).not.toHaveBeenCalled();
    });

    test('zeigt Toast bei Löschen-Fehler', async () => {
      const user = userEvent.setup();
      mockConfirm.mockResolvedValueOnce(true);
      mockApi.del.mockRejectedValueOnce(new Error('Delete failed'));

      render(<ChatTopBar {...defaultProps} />);

      await user.click(screen.getByTitle('Chat löschen'));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Löschen fehlgeschlagen');
      });
    });
  });

  // =====================================================
  // Accessibility
  // =====================================================
  describe('Accessibility', () => {
    test('header hat korrekte Semantik', () => {
      const { container } = render(<ChatTopBar {...defaultProps} />);
      expect(container.querySelector('header.chat-top-bar')).toBeInTheDocument();
    });

    test('Titel hat "Klicken zum Bearbeiten" Tooltip', () => {
      render(<ChatTopBar {...defaultProps} />);
      expect(screen.getByTitle('Klicken zum Bearbeiten')).toBeInTheDocument();
    });
  });
});
