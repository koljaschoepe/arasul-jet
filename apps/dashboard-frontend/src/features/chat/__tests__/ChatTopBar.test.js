/**
 * ChatTopBar Component Tests
 *
 * Tests fuer die obere Leiste der Chat-Ansicht:
 * - Zurueck-Button navigiert zur Landing
 * - Titel wird angezeigt
 * - Titel kann per Klick editiert werden
 * - Escape bricht Titel-Bearbeitung ab
 * - Enter speichert neuen Titel
 * - Export-Button loest Download aus
 * - Loeschen-Button mit Bestaetigung
 * - Projekt-Badge Anzeige
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ChatTopBar from '../ChatTopBar';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const mockApi = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  del: jest.fn(),
  request: jest.fn(),
};
jest.mock('../../../hooks/useApi', () => ({ useApi: () => mockApi }));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('../../../contexts/ToastContext', () => ({ useToast: () => mockToast }));

jest.mock('../../../contexts/ChatContext', () => ({
  useChatContext: () => ({ activeJobIds: {} }),
}));

// Mock useConfirm
const mockConfirm = jest.fn().mockResolvedValue(true);
jest.mock('../../../hooks/useConfirm', () => {
  return () => ({
    confirm: mockConfirm,
    ConfirmDialog: null,
  });
});

describe('ChatTopBar Component', () => {
  const defaultProps = {
    chatId: 1,
    title: 'Mein Test Chat',
    onTitleChange: jest.fn(),
    project: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =====================================================
  // Rendering
  // =====================================================
  describe('Rendering', () => {
    test('rendert Zurueck-Button', () => {
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

    test('rendert Loeschen-Button', () => {
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
    test('Zurueck-Button navigiert zu /chat', async () => {
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
    test('Klick auf Titel oeffnet Input', async () => {
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
      const onTitleChange = jest.fn();
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
    test('Export-Button loest API-Aufruf aus', async () => {
      const user = userEvent.setup();
      const mockBlob = new Blob(['test'], { type: 'application/json' });
      mockApi.get.mockResolvedValueOnce({
        headers: { get: () => 'attachment; filename="chat.json"' },
        blob: () => Promise.resolve(mockBlob),
      });

      // Mock URL.createObjectURL
      global.URL.createObjectURL = jest.fn(() => 'blob:test');
      global.URL.revokeObjectURL = jest.fn();

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
  // Loeschen
  // =====================================================
  describe('Loeschen', () => {
    test('Loeschen-Button fragt Bestaetigung', async () => {
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

    test('bei Bestaetigung wird Chat geloescht und navigiert', async () => {
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

    test('bei Ablehnung wird nicht geloescht', async () => {
      const user = userEvent.setup();
      mockConfirm.mockResolvedValueOnce(false);

      render(<ChatTopBar {...defaultProps} />);

      await user.click(screen.getByTitle('Chat löschen'));

      expect(mockApi.del).not.toHaveBeenCalled();
    });

    test('zeigt Toast bei Loeschen-Fehler', async () => {
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
