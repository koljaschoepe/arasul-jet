/**
 * ChatMessage Component Tests
 *
 * Tests fuer die ChatMessage-Komponente:
 * - User- und Assistant-Nachrichten rendern
 * - Thinking-Block Anzeige und Toggle
 * - Markdown-Inhalt rendern
 * - Sources-Block (RAG-Quellen) Anzeige und Toggle
 * - Matched-Spaces Anzeige
 * - Loading-Indikator
 * - Leer- und Edge-Cases
 * - Accessibility (aria-labels, aria-expanded)
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock MermaidDiagram component before import - avoids mermaid module issues
jest.mock('../components/MermaidDiagram', () => {
  const React = require('react');
  return function MockMermaidDiagram({ content }) {
    return React.createElement('div', { 'data-testid': 'mermaid-diagram' }, content);
  };
});

// Mock react-markdown to avoid ESM issues
jest.mock('react-markdown', () => {
  const React = require('react');
  return function MockReactMarkdown({ children, components }) {
    // If content contains a mermaid code block and components.code is defined,
    // simulate react-markdown calling the custom code renderer
    if (
      components &&
      components.code &&
      typeof children === 'string' &&
      children.includes('```mermaid')
    ) {
      const mermaidMatch = children.match(/```mermaid\n([\s\S]*?)```/);
      if (mermaidMatch) {
        const CodeComponent = components.code;
        return React.createElement(
          'div',
          { 'data-testid': 'markdown' },
          React.createElement(CodeComponent, {
            node: {},
            inline: false,
            className: 'language-mermaid',
            children: [mermaidMatch[1]],
          })
        );
      }
    }
    return React.createElement('div', { 'data-testid': 'markdown' }, children);
  };
});

// Mock remark-gfm
jest.mock('remark-gfm', () => () => {});

import ChatMessage from '../components/Chat/ChatMessage';

describe('ChatMessage Component', () => {
  // Default props for convenience
  const defaultProps = {
    index: 0,
    chatId: 'chat-1',
    isLoading: false,
    onToggleThinking: jest.fn(),
    onToggleSources: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =====================================================
  // User-Nachricht rendern
  // =====================================================
  describe('User-Nachricht', () => {
    test('rendert User-Nachricht mit korrektem Inhalt', () => {
      const message = {
        id: 'msg-1',
        role: 'user',
        content: 'Hallo, wie geht es dir?',
      };

      render(<ChatMessage {...defaultProps} message={message} />);

      expect(screen.getByText('Hallo, wie geht es dir?')).toBeInTheDocument();
    });

    test('zeigt "Du" als Label fuer User-Nachrichten', () => {
      const message = {
        id: 'msg-1',
        role: 'user',
        content: 'Test',
      };

      render(<ChatMessage {...defaultProps} message={message} />);

      expect(screen.getByText('Du')).toBeInTheDocument();
    });

    test('hat korrekte CSS-Klasse fuer User-Nachricht', () => {
      const message = {
        id: 'msg-1',
        role: 'user',
        content: 'Test',
      };

      const { container } = render(<ChatMessage {...defaultProps} message={message} />);

      const article = container.querySelector('article');
      expect(article).toHaveClass('message', 'user');
    });

    test('hat korrekte aria-label fuer User-Nachricht', () => {
      const message = {
        id: 'msg-1',
        role: 'user',
        content: 'Test',
      };

      render(<ChatMessage {...defaultProps} message={message} />);

      expect(screen.getByRole('article')).toHaveAttribute('aria-label', 'Deine Nachricht');
    });
  });

  // =====================================================
  // Assistant-Nachricht rendern
  // =====================================================
  describe('Assistant-Nachricht', () => {
    test('rendert Assistant-Nachricht mit korrektem Inhalt', () => {
      const message = {
        id: 'msg-2',
        role: 'assistant',
        content: 'Mir geht es gut, danke!',
      };

      render(<ChatMessage {...defaultProps} message={message} />);

      expect(screen.getByText('Mir geht es gut, danke!')).toBeInTheDocument();
    });

    test('zeigt "AI" als Label fuer Assistant-Nachrichten', () => {
      const message = {
        id: 'msg-2',
        role: 'assistant',
        content: 'Antwort',
      };

      render(<ChatMessage {...defaultProps} message={message} />);

      expect(screen.getByText('AI')).toBeInTheDocument();
    });

    test('hat korrekte CSS-Klasse fuer Assistant-Nachricht', () => {
      const message = {
        id: 'msg-2',
        role: 'assistant',
        content: 'Antwort',
      };

      const { container } = render(<ChatMessage {...defaultProps} message={message} />);

      const article = container.querySelector('article');
      expect(article).toHaveClass('message', 'assistant');
    });

    test('hat korrekte aria-label fuer Assistant-Nachricht', () => {
      const message = {
        id: 'msg-2',
        role: 'assistant',
        content: 'Antwort',
      };

      render(<ChatMessage {...defaultProps} message={message} />);

      expect(screen.getByRole('article')).toHaveAttribute('aria-label', 'AI Antwort');
    });
  });

  // =====================================================
  // Thinking-Block
  // =====================================================
  describe('Thinking-Block', () => {
    test('zeigt Thinking-Block wenn hasThinking und thinking vorhanden', () => {
      const message = {
        id: 'msg-3',
        role: 'assistant',
        content: 'Antwort',
        hasThinking: true,
        thinking: 'Ich denke ueber die Frage nach...',
        thinkingCollapsed: false,
      };

      render(<ChatMessage {...defaultProps} message={message} />);

      expect(screen.getByText('Gedankengang')).toBeInTheDocument();
      expect(screen.getByText('Ich denke ueber die Frage nach...')).toBeInTheDocument();
    });

    test('zeigt keinen Thinking-Block wenn hasThinking false', () => {
      const message = {
        id: 'msg-3',
        role: 'assistant',
        content: 'Antwort',
        hasThinking: false,
        thinking: 'Sollte nicht sichtbar sein',
      };

      render(<ChatMessage {...defaultProps} message={message} />);

      expect(screen.queryByText('Gedankengang')).not.toBeInTheDocument();
    });

    test('zeigt keinen Thinking-Block wenn thinking leer', () => {
      const message = {
        id: 'msg-3',
        role: 'assistant',
        content: 'Antwort',
        hasThinking: true,
        thinking: '',
      };

      render(<ChatMessage {...defaultProps} message={message} />);

      expect(screen.queryByText('Gedankengang')).not.toBeInTheDocument();
    });

    test('ruft onToggleThinking beim Klick auf Thinking-Header', async () => {
      const user = userEvent.setup();
      const onToggleThinking = jest.fn();

      const message = {
        id: 'msg-3',
        role: 'assistant',
        content: 'Antwort',
        hasThinking: true,
        thinking: 'Denkvorgang...',
        thinkingCollapsed: false,
      };

      render(
        <ChatMessage
          {...defaultProps}
          message={message}
          index={2}
          onToggleThinking={onToggleThinking}
        />
      );

      const thinkingButton = screen.getByText('Gedankengang').closest('button');
      await user.click(thinkingButton);

      expect(onToggleThinking).toHaveBeenCalledWith(2);
    });

    test('hat aria-expanded=true wenn Thinking aufgeklappt', () => {
      const message = {
        id: 'msg-3',
        role: 'assistant',
        content: 'Antwort',
        hasThinking: true,
        thinking: 'Denkvorgang...',
        thinkingCollapsed: false,
      };

      render(<ChatMessage {...defaultProps} message={message} />);

      const thinkingButton = screen.getByText('Gedankengang').closest('button');
      expect(thinkingButton).toHaveAttribute('aria-expanded', 'true');
    });

    test('hat aria-expanded=false wenn Thinking zugeklappt', () => {
      const message = {
        id: 'msg-3',
        role: 'assistant',
        content: 'Antwort',
        hasThinking: true,
        thinking: 'Denkvorgang...',
        thinkingCollapsed: true,
      };

      render(<ChatMessage {...defaultProps} message={message} />);

      const thinkingButton = screen.getByText('Gedankengang').closest('button');
      expect(thinkingButton).toHaveAttribute('aria-expanded', 'false');
    });

    test('hat collapsed CSS-Klasse wenn thinkingCollapsed true', () => {
      const message = {
        id: 'msg-3',
        role: 'assistant',
        content: 'Antwort',
        hasThinking: true,
        thinking: 'Denkvorgang...',
        thinkingCollapsed: true,
      };

      const { container } = render(<ChatMessage {...defaultProps} message={message} />);

      expect(container.querySelector('.thinking-block.collapsed')).toBeInTheDocument();
    });

    test('hat collapsing CSS-Klasse wenn thinkingCollapsing true', () => {
      const message = {
        id: 'msg-3',
        role: 'assistant',
        content: 'Antwort',
        hasThinking: true,
        thinking: 'Denkvorgang...',
        thinkingCollapsed: false,
        thinkingCollapsing: true,
      };

      const { container } = render(<ChatMessage {...defaultProps} message={message} />);

      expect(container.querySelector('.thinking-block.collapsing')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Markdown-Inhalt
  // =====================================================
  describe('Markdown-Inhalt', () => {
    test('rendert Markdown ueber ReactMarkdown', () => {
      const message = {
        id: 'msg-4',
        role: 'assistant',
        content: '# Ueberschrift\n\nEin Absatz mit **fett** und *kursiv*.',
      };

      render(<ChatMessage {...defaultProps} message={message} />);

      // MockReactMarkdown rendert children als Text
      const markdownContainer = screen.getByTestId('markdown');
      expect(markdownContainer).toBeInTheDocument();
      expect(markdownContainer.textContent).toContain('# Ueberschrift');
    });

    test('rendert Mermaid-Diagramm fuer mermaid Code-Block', () => {
      const message = {
        id: 'msg-5',
        role: 'assistant',
        content: '```mermaid\ngraph TD;\nA-->B;\n```',
      };

      render(<ChatMessage {...defaultProps} message={message} />);

      expect(screen.getByTestId('mermaid-diagram')).toBeInTheDocument();
    });

    test('rendert message-body Container fuer Inhalt', () => {
      const message = {
        id: 'msg-4',
        role: 'assistant',
        content: 'Einige Inhalte',
      };

      const { container } = render(<ChatMessage {...defaultProps} message={message} />);

      expect(container.querySelector('.message-body')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Loading-Indikator
  // =====================================================
  describe('Loading-Indikator', () => {
    test('zeigt Loading-Animation wenn Assistant ohne Inhalt laedt', () => {
      const message = {
        id: 'msg-6',
        role: 'assistant',
        content: '',
        thinking: '',
      };

      const { container } = render(
        <ChatMessage {...defaultProps} message={message} isLoading={true} />
      );

      expect(container.querySelector('.message-loading')).toBeInTheDocument();
    });

    test('Loading hat role=status und aria-label', () => {
      const message = {
        id: 'msg-6',
        role: 'assistant',
        content: '',
      };

      render(<ChatMessage {...defaultProps} message={message} isLoading={true} />);

      const loadingEl = screen.getByRole('status');
      expect(loadingEl).toHaveAttribute('aria-label', 'AI antwortet...');
    });

    test('zeigt drei Ladeanimation-Spans', () => {
      const message = {
        id: 'msg-6',
        role: 'assistant',
        content: '',
      };

      const { container } = render(
        <ChatMessage {...defaultProps} message={message} isLoading={true} />
      );

      const loadingDiv = container.querySelector('.message-loading');
      const spans = loadingDiv.querySelectorAll('span');
      expect(spans).toHaveLength(3);
    });

    test('zeigt kein Loading wenn Inhalt vorhanden', () => {
      const message = {
        id: 'msg-6',
        role: 'assistant',
        content: 'Antwort bereits vorhanden',
      };

      const { container } = render(
        <ChatMessage {...defaultProps} message={message} isLoading={true} />
      );

      expect(container.querySelector('.message-loading')).not.toBeInTheDocument();
    });

    test('zeigt kein Loading wenn Thinking vorhanden', () => {
      const message = {
        id: 'msg-6',
        role: 'assistant',
        content: '',
        thinking: 'Nachdenken...',
        hasThinking: true,
      };

      const { container } = render(
        <ChatMessage {...defaultProps} message={message} isLoading={true} />
      );

      expect(container.querySelector('.message-loading')).not.toBeInTheDocument();
    });

    test('zeigt kein Loading fuer User-Nachrichten', () => {
      const message = {
        id: 'msg-6',
        role: 'user',
        content: '',
      };

      const { container } = render(
        <ChatMessage {...defaultProps} message={message} isLoading={true} />
      );

      expect(container.querySelector('.message-loading')).not.toBeInTheDocument();
    });

    test('zeigt kein Loading wenn isLoading false', () => {
      const message = {
        id: 'msg-6',
        role: 'assistant',
        content: '',
      };

      const { container } = render(
        <ChatMessage {...defaultProps} message={message} isLoading={false} />
      );

      expect(container.querySelector('.message-loading')).not.toBeInTheDocument();
    });
  });

  // =====================================================
  // Sources-Block (RAG-Quellen)
  // =====================================================
  describe('Sources-Block (RAG-Quellen)', () => {
    const sourcesMessage = {
      id: 'msg-7',
      role: 'assistant',
      content: 'Basierend auf den Dokumenten...',
      sources: [
        {
          document_name: 'Handbuch.pdf',
          text_preview: 'Kapitel 3: Installation...',
          score: 0.95,
        },
        {
          document_name: 'FAQ.md',
          text_preview: 'Haeufig gestellte Fragen...',
          score: 0.82,
        },
      ],
      sourcesCollapsed: false,
    };

    test('zeigt Sources-Block wenn Quellen vorhanden', () => {
      render(<ChatMessage {...defaultProps} message={sourcesMessage} />);

      expect(screen.getByText('Quellen (2)')).toBeInTheDocument();
    });

    test('zeigt Dokumentnamen der Quellen', () => {
      render(<ChatMessage {...defaultProps} message={sourcesMessage} />);

      expect(screen.getByText('Handbuch.pdf')).toBeInTheDocument();
      expect(screen.getByText('FAQ.md')).toBeInTheDocument();
    });

    test('zeigt Textvorschau der Quellen', () => {
      render(<ChatMessage {...defaultProps} message={sourcesMessage} />);

      expect(screen.getByText('Kapitel 3: Installation...')).toBeInTheDocument();
      expect(screen.getByText('Haeufig gestellte Fragen...')).toBeInTheDocument();
    });

    test('zeigt Relevanz-Score der Quellen', () => {
      render(<ChatMessage {...defaultProps} message={sourcesMessage} />);

      expect(screen.getByText('Relevanz: 95%')).toBeInTheDocument();
      expect(screen.getByText('Relevanz: 82%')).toBeInTheDocument();
    });

    test('ruft onToggleSources beim Klick auf Sources-Header', async () => {
      const user = userEvent.setup();
      const onToggleSources = jest.fn();

      render(
        <ChatMessage
          {...defaultProps}
          message={sourcesMessage}
          index={5}
          onToggleSources={onToggleSources}
        />
      );

      const sourcesButton = screen.getByText('Quellen (2)').closest('button');
      await user.click(sourcesButton);

      expect(onToggleSources).toHaveBeenCalledWith(5);
    });

    test('hat aria-expanded=true wenn Sources aufgeklappt', () => {
      render(<ChatMessage {...defaultProps} message={sourcesMessage} />);

      const sourcesButton = screen.getByText('Quellen (2)').closest('button');
      expect(sourcesButton).toHaveAttribute('aria-expanded', 'true');
    });

    test('hat aria-expanded=false wenn Sources zugeklappt', () => {
      const collapsedMessage = {
        ...sourcesMessage,
        sourcesCollapsed: true,
      };

      render(<ChatMessage {...defaultProps} message={collapsedMessage} />);

      const sourcesButton = screen.getByText('Quellen (2)').closest('button');
      expect(sourcesButton).toHaveAttribute('aria-expanded', 'false');
    });

    test('zeigt Quellen-Inhalt nicht wenn sourcesCollapsed true', () => {
      const collapsedMessage = {
        ...sourcesMessage,
        sourcesCollapsed: true,
      };

      render(<ChatMessage {...defaultProps} message={collapsedMessage} />);

      // Header ist noch da, aber Inhalt nicht
      expect(screen.getByText('Quellen (2)')).toBeInTheDocument();
      expect(screen.queryByText('Handbuch.pdf')).not.toBeInTheDocument();
      expect(screen.queryByText('FAQ.md')).not.toBeInTheDocument();
    });

    test('zeigt keinen Sources-Block ohne Quellen', () => {
      const noSourcesMessage = {
        id: 'msg-8',
        role: 'assistant',
        content: 'Antwort ohne Quellen',
        sources: [],
      };

      const { container } = render(<ChatMessage {...defaultProps} message={noSourcesMessage} />);

      expect(container.querySelector('.sources-block')).not.toBeInTheDocument();
    });

    test('zeigt keinen Sources-Block wenn sources undefined', () => {
      const noSourcesMessage = {
        id: 'msg-8',
        role: 'assistant',
        content: 'Antwort ohne Quellen',
      };

      const { container } = render(<ChatMessage {...defaultProps} message={noSourcesMessage} />);

      expect(container.querySelector('.sources-block')).not.toBeInTheDocument();
    });

    test('hat collapsed CSS-Klasse wenn sourcesCollapsed true', () => {
      const collapsedMessage = {
        ...sourcesMessage,
        sourcesCollapsed: true,
      };

      const { container } = render(<ChatMessage {...defaultProps} message={collapsedMessage} />);

      expect(container.querySelector('.sources-block.collapsed')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Matched Spaces
  // =====================================================
  describe('Matched Spaces', () => {
    test('zeigt durchsuchte Bereiche wenn matchedSpaces vorhanden', () => {
      const message = {
        id: 'msg-9',
        role: 'assistant',
        content: 'Antwort',
        matchedSpaces: [
          { id: 'space-1', name: 'Dokumentation', score: 0.9, color: '#45ADFF' },
          { id: 'space-2', name: 'FAQ', score: 0.75, color: '#22c55e' },
        ],
      };

      render(<ChatMessage {...defaultProps} message={message} />);

      expect(screen.getByText('Durchsuchte Bereiche:')).toBeInTheDocument();
      expect(screen.getByText('Dokumentation')).toBeInTheDocument();
      expect(screen.getByText('FAQ')).toBeInTheDocument();
    });

    test('zeigt Relevanz-Score in Matched Spaces', () => {
      const message = {
        id: 'msg-9',
        role: 'assistant',
        content: 'Antwort',
        matchedSpaces: [{ id: 'space-1', name: 'Dokumentation', score: 0.9, color: '#45ADFF' }],
      };

      render(<ChatMessage {...defaultProps} message={message} />);

      expect(screen.getByText('90%')).toBeInTheDocument();
    });

    test('zeigt title-Attribut mit Relevanz', () => {
      const message = {
        id: 'msg-9',
        role: 'assistant',
        content: 'Antwort',
        matchedSpaces: [{ id: 'space-1', name: 'Dokumentation', score: 0.9, color: '#45ADFF' }],
      };

      const { container } = render(<ChatMessage {...defaultProps} message={message} />);

      const chip = container.querySelector('.matched-space-chip');
      expect(chip).toHaveAttribute('title', 'Relevanz: 90%');
    });

    test('behandelt matchedSpaces mit score=0 korrekt', () => {
      const message = {
        id: 'msg-9',
        role: 'assistant',
        content: 'Antwort',
        matchedSpaces: [{ id: 'space-1', name: 'Leer', score: 0 }],
      };

      render(<ChatMessage {...defaultProps} message={message} />);

      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    test('zeigt keine Matched Spaces wenn leer', () => {
      const message = {
        id: 'msg-9',
        role: 'assistant',
        content: 'Antwort',
        matchedSpaces: [],
      };

      render(<ChatMessage {...defaultProps} message={message} />);

      expect(screen.queryByText('Durchsuchte Bereiche:')).not.toBeInTheDocument();
    });

    test('zeigt keine Matched Spaces wenn undefined', () => {
      const message = {
        id: 'msg-9',
        role: 'assistant',
        content: 'Antwort',
      };

      render(<ChatMessage {...defaultProps} message={message} />);

      expect(screen.queryByText('Durchsuchte Bereiche:')).not.toBeInTheDocument();
    });

    test('verwendet angegebene Farbe fuer Space-Chip', () => {
      const message = {
        id: 'msg-9',
        role: 'assistant',
        content: 'Antwort',
        matchedSpaces: [{ id: 'space-1', name: 'Mit Farbe', score: 0.5, color: '#ff0000' }],
      };

      const { container } = render(<ChatMessage {...defaultProps} message={message} />);

      const chip = container.querySelector('.matched-space-chip');
      expect(chip).toBeInTheDocument();
      expect(chip.style.borderLeftColor).toBe('#ff0000');
    });

    test('rendert Space-Chip korrekt ohne explizite color', () => {
      const message = {
        id: 'msg-9',
        role: 'assistant',
        content: 'Antwort',
        matchedSpaces: [{ id: 'space-1', name: 'Ohne Farbe', score: 0.5 }],
      };

      const { container } = render(<ChatMessage {...defaultProps} message={message} />);

      const chip = container.querySelector('.matched-space-chip');
      expect(chip).toBeInTheDocument();
      expect(screen.getByText('Ohne Farbe')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Leere und fehlende Inhalte
  // =====================================================
  describe('Leere und fehlende Inhalte', () => {
    test('rendert keinen message-body wenn content leer', () => {
      const message = {
        id: 'msg-10',
        role: 'assistant',
        content: '',
      };

      const { container } = render(<ChatMessage {...defaultProps} message={message} />);

      expect(container.querySelector('.message-body')).not.toBeInTheDocument();
    });

    test('rendert keinen message-body wenn content null', () => {
      const message = {
        id: 'msg-10',
        role: 'assistant',
        content: null,
      };

      const { container } = render(<ChatMessage {...defaultProps} message={message} />);

      expect(container.querySelector('.message-body')).not.toBeInTheDocument();
    });

    test('rendert keinen message-body wenn content undefined', () => {
      const message = {
        id: 'msg-10',
        role: 'assistant',
      };

      const { container } = render(<ChatMessage {...defaultProps} message={message} />);

      expect(container.querySelector('.message-body')).not.toBeInTheDocument();
    });

    test('rendert Label auch ohne Inhalt', () => {
      const message = {
        id: 'msg-10',
        role: 'user',
        content: '',
      };

      render(<ChatMessage {...defaultProps} message={message} />);

      expect(screen.getByText('Du')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Key/ID Generierung
  // =====================================================
  describe('Artikel-Key Generierung', () => {
    test('rendert korrekt mit message.id', () => {
      const message = {
        id: 'unique-msg-id',
        role: 'user',
        content: 'Test',
      };

      const { container } = render(<ChatMessage {...defaultProps} message={message} />);

      expect(container.querySelector('article')).toBeInTheDocument();
    });

    test('rendert korrekt mit message.jobId als Fallback', () => {
      const message = {
        jobId: 'job-123',
        role: 'assistant',
        content: 'Test',
      };

      const { container } = render(<ChatMessage {...defaultProps} message={message} />);

      expect(container.querySelector('article')).toBeInTheDocument();
    });

    test('rendert korrekt ohne id und jobId', () => {
      const message = {
        role: 'user',
        content: 'Test',
      };

      const { container } = render(<ChatMessage {...defaultProps} message={message} />);

      expect(container.querySelector('article')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Komponentenstruktur
  // =====================================================
  describe('Komponentenstruktur', () => {
    test('hat korrekte DOM-Struktur fuer einfache Nachricht', () => {
      const message = {
        id: 'msg-11',
        role: 'user',
        content: 'Einfache Nachricht',
      };

      const { container } = render(<ChatMessage {...defaultProps} message={message} />);

      const article = container.querySelector('article');
      expect(article).toBeInTheDocument();

      const label = article.querySelector('.message-label');
      expect(label).toBeInTheDocument();
      expect(label.textContent).toBe('Du');
      expect(label).toHaveAttribute('aria-hidden', 'true');

      const body = article.querySelector('.message-body');
      expect(body).toBeInTheDocument();
    });

    test('rendert vollstaendige Assistant-Nachricht mit allen Bloecken', () => {
      const message = {
        id: 'msg-12',
        role: 'assistant',
        content: 'Vollstaendige Antwort',
        hasThinking: true,
        thinking: 'Denkvorgang...',
        thinkingCollapsed: false,
        sources: [{ document_name: 'Quelle.pdf', text_preview: 'Vorschau...', score: 0.88 }],
        sourcesCollapsed: false,
        matchedSpaces: [{ id: 's1', name: 'Bereich 1', score: 0.7, color: '#45ADFF' }],
      };

      const { container } = render(<ChatMessage {...defaultProps} message={message} />);

      // Alle Bloecke vorhanden
      expect(container.querySelector('.thinking-block')).toBeInTheDocument();
      expect(container.querySelector('.message-body')).toBeInTheDocument();
      expect(container.querySelector('.matched-spaces-block')).toBeInTheDocument();
      expect(container.querySelector('.sources-block')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Memoization
  // =====================================================
  describe('Memoization', () => {
    test('ist eine memoized Komponente', () => {
      // ChatMessage is wrapped in React.memo
      // We verify by checking the component type
      expect(ChatMessage.$$typeof).toBe(Symbol.for('react.memo'));
    });
  });

  // =====================================================
  // Edge Cases
  // =====================================================
  describe('Edge Cases', () => {
    test('behandelt sehr langen Inhalt ohne Fehler', () => {
      const longContent = 'A'.repeat(10000);
      const message = {
        id: 'msg-13',
        role: 'assistant',
        content: longContent,
      };

      const { container } = render(<ChatMessage {...defaultProps} message={message} />);

      expect(container.querySelector('.message-body')).toBeInTheDocument();
    });

    test('behandelt Sonderzeichen im Inhalt', () => {
      const message = {
        id: 'msg-14',
        role: 'user',
        content: 'Sonderzeichen: <script>alert("xss")</script> & " \' < >',
      };

      render(<ChatMessage {...defaultProps} message={message} />);

      // ReactMarkdown mock rendert den Content als Text
      expect(screen.getByTestId('markdown')).toBeInTheDocument();
    });

    test('behandelt Source mit Score=1 korrekt', () => {
      const message = {
        id: 'msg-15',
        role: 'assistant',
        content: 'Antwort',
        sources: [
          { document_name: 'Perfekt.pdf', text_preview: 'Exakte Uebereinstimmung', score: 1.0 },
        ],
        sourcesCollapsed: false,
      };

      render(<ChatMessage {...defaultProps} message={message} />);

      expect(screen.getByText('Relevanz: 100%')).toBeInTheDocument();
    });

    test('behandelt Source mit sehr niedrigem Score', () => {
      const message = {
        id: 'msg-16',
        role: 'assistant',
        content: 'Antwort',
        sources: [{ document_name: 'Schwach.pdf', text_preview: 'Kaum relevant', score: 0.01 }],
        sourcesCollapsed: false,
      };

      render(<ChatMessage {...defaultProps} message={message} />);

      expect(screen.getByText('Relevanz: 1%')).toBeInTheDocument();
    });

    test('rendert mehrere Sources korrekt', () => {
      const message = {
        id: 'msg-17',
        role: 'assistant',
        content: 'Antwort',
        sources: [
          { document_name: 'Doc1.pdf', text_preview: 'Vorschau 1', score: 0.9 },
          { document_name: 'Doc2.pdf', text_preview: 'Vorschau 2', score: 0.8 },
          { document_name: 'Doc3.pdf', text_preview: 'Vorschau 3', score: 0.7 },
        ],
        sourcesCollapsed: false,
      };

      render(<ChatMessage {...defaultProps} message={message} />);

      expect(screen.getByText('Quellen (3)')).toBeInTheDocument();

      const sourceItems = document.querySelectorAll('.source-item');
      expect(sourceItems).toHaveLength(3);
    });

    test('behandelt gleichzeitig Thinking und Loading korrekt', () => {
      // Wenn Thinking vorhanden ist, soll kein Loading angezeigt werden
      const message = {
        id: 'msg-18',
        role: 'assistant',
        content: '',
        hasThinking: true,
        thinking: 'Denke nach...',
        thinkingCollapsed: false,
      };

      const { container } = render(
        <ChatMessage {...defaultProps} message={message} isLoading={true} />
      );

      expect(screen.getByText('Gedankengang')).toBeInTheDocument();
      expect(container.querySelector('.message-loading')).not.toBeInTheDocument();
    });
  });
});
