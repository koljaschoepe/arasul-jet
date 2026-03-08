/**
 * MarkdownEditor Component
 * Simple markdown editor with live preview
 * Uses ReactMarkdown with remarkGfm for full GFM support (tables, strikethrough, etc.)
 */

import React, { memo, useState, useEffect, useCallback, useRef } from 'react';
import { X, Save, Eye, Pencil, Maximize2, Minimize2, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MermaidDiagram from './MermaidDiagram';
import useConfirm from '../../hooks/useConfirm';
import { useApi } from '../../hooks/useApi';
import './markdown-editor.css';

interface MarkdownEditorProps {
  documentId: string;
  filename: string;
  onClose: () => void;
  onSave?: () => void;
  token: string;
}

const MarkdownEditor = memo(function MarkdownEditor({
  documentId,
  filename,
  onClose,
  onSave,
  token,
}: MarkdownEditorProps) {
  const api = useApi();
  const { confirm, ConfirmDialog } = useConfirm();
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('split'); // 'edit', 'preview', 'split'
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [hasChanges, setHasChanges] = useState<boolean>(false);

  // Prevent body scroll while editor is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Load document content
  useEffect(() => {
    const loadContent = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await api.get(`/documents/${documentId}/content`, { showError: false });
        setContent(data.content);
        setOriginalContent(data.content);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (documentId && token) {
      loadContent();
    }
  }, [documentId, token, api]);

  // Track changes
  useEffect(() => {
    setHasChanges(content !== originalContent);
  }, [content, originalContent]);

  // Handle save
  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      setError(null);

      await api.put(`/documents/${documentId}/content`, { content }, { showError: false });

      setOriginalContent(content);
      setHasChanges(false);

      if (onSave) {
        onSave();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [documentId, content, onSave, api]);

  // Handle close with unsaved changes warning
  const handleClose = useCallback(async () => {
    if (hasChanges) {
      if (
        await confirm({
          message: 'Es gibt ungespeicherte Änderungen. Wirklich schließen?',
          confirmText: 'Schließen',
          confirmVariant: 'danger',
        })
      ) {
        onClose();
      }
    } else {
      onClose();
    }
  }, [hasChanges, confirm, onClose]);

  // Handle keyboard shortcuts + focus trap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasChanges && !saving) {
          handleSave();
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          handleClose();
        }
      }
      // Focus trap: cycle Tab within the editor
      if (e.key === 'Tab' && containerRef.current) {
        const focusable = containerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea, input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasChanges, saving, handleSave, handleClose, isFullscreen]);

  // Render highlighted content for backdrop
  const renderHighlightedContent = useCallback((text: string) => {
    return text.split('\n').map((line, i) => {
      if (/^#{1,6}\s/.test(line)) {
        return (
          <React.Fragment key={i}>
            {i > 0 && '\n'}
            <span className="md-heading-line">{line}</span>
          </React.Fragment>
        );
      }
      return i > 0 ? '\n' + line : line;
    });
  }, []);

  // Sync scroll between textarea and backdrop
  const handleTextareaScroll = useCallback(() => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  // Insert text helper
  const insertText = (before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    const newText =
      content.substring(0, start) + before + selectedText + after + content.substring(end);

    setContent(newText);

    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + before.length,
        start + before.length + selectedText.length
      );
    }, 0);
  };

  if (loading) {
    return (
      <div
        className={`markdown-editor-overlay ${isFullscreen ? 'fullscreen' : ''}`}
        role="presentation"
      >
        <div
          className="markdown-editor-container"
          role="dialog"
          aria-modal="true"
          aria-label={`Markdown Editor: ${filename}`}
        >
          <div className="markdown-editor-loading">
            <div className="spinner"></div>
            <p>Dokument wird geladen...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`markdown-editor-overlay ${isFullscreen ? 'fullscreen' : ''}`}
      role="presentation"
    >
      <div
        ref={containerRef}
        className="markdown-editor-container"
        role="dialog"
        aria-modal="true"
        aria-label={`Markdown Editor: ${filename}`}
      >
        {/* Header */}
        <div className="markdown-editor-header">
          <div className="markdown-editor-title">
            <Pencil />
            <span>{filename}</span>
            {hasChanges && <span className="unsaved-indicator">*</span>}
          </div>

          <div className="markdown-editor-toolbar">
            {/* Format buttons */}
            <div className="toolbar-group">
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => insertText('**', '**')}
                title="Fett (Ctrl+B)"
                aria-label="Fett"
              >
                <strong>B</strong>
              </button>
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => insertText('*', '*')}
                title="Kursiv (Ctrl+I)"
                aria-label="Kursiv"
              >
                <em>I</em>
              </button>
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => insertText('# ')}
                title="Überschrift"
                aria-label="Überschrift"
              >
                H
              </button>
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => insertText('`', '`')}
                title="Code"
                aria-label="Code"
              >
                {'</>'}
              </button>
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => insertText('[', '](url)')}
                title="Link"
                aria-label="Link einfügen"
              >
                Link
              </button>
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => insertText('- ')}
                title="Liste"
                aria-label="Liste"
              >
                List
              </button>
            </div>

            {/* View mode buttons */}
            <div className="toolbar-group">
              <button
                type="button"
                className={`toolbar-btn ${viewMode === 'edit' ? 'active' : ''}`}
                onClick={() => setViewMode('edit')}
                title="Nur Editor"
                aria-label="Nur Editor"
                aria-pressed={viewMode === 'edit'}
              >
                <Pencil />
              </button>
              <button
                type="button"
                className={`toolbar-btn ${viewMode === 'split' ? 'active' : ''}`}
                onClick={() => setViewMode('split')}
                title="Geteilte Ansicht"
                aria-label="Geteilte Ansicht"
                aria-pressed={viewMode === 'split'}
              >
                <Pencil />
                <Eye />
              </button>
              <button
                type="button"
                className={`toolbar-btn ${viewMode === 'preview' ? 'active' : ''}`}
                onClick={() => setViewMode('preview')}
                title="Nur Vorschau"
                aria-label="Nur Vorschau"
                aria-pressed={viewMode === 'preview'}
              >
                <Eye />
              </button>
            </div>

            {/* Action buttons */}
            <div className="toolbar-group">
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => setIsFullscreen(!isFullscreen)}
                title={isFullscreen ? 'Verkleinern' : 'Vollbild'}
                aria-label={isFullscreen ? 'Verkleinern' : 'Vollbild'}
              >
                {isFullscreen ? <Minimize2 /> : <Maximize2 />}
              </button>
              <button
                type="button"
                className={`toolbar-btn save-btn ${hasChanges ? 'has-changes' : ''}`}
                onClick={handleSave}
                disabled={!hasChanges || saving}
                title="Speichern (Ctrl+S)"
              >
                <Save />
                {saving ? 'Speichert...' : 'Speichern'}
              </button>
              <button
                type="button"
                className="toolbar-btn close-btn"
                onClick={handleClose}
                title="Schließen"
                aria-label="Schließen"
              >
                <X />
              </button>
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="markdown-editor-error">
            <AlertCircle />
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Fehlermeldung schließen"
            >
              <X />
            </button>
          </div>
        )}

        {/* Editor content */}
        <div className={`markdown-editor-content view-${viewMode}`}>
          {/* Editor pane */}
          {viewMode !== 'preview' && (
            <div className="editor-pane">
              <div className="pane-header">Editor</div>
              <div className="editor-pane-content">
                <div ref={backdropRef} className="editor-backdrop" aria-hidden="true">
                  {renderHighlightedContent(content)}
                </div>
                <textarea
                  ref={textareaRef}
                  id="markdown-textarea"
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  onScroll={handleTextareaScroll}
                  placeholder="Markdown hier eingeben..."
                  spellCheck="true"
                />
              </div>
            </div>
          )}

          {/* Preview pane - using ReactMarkdown with remarkGfm for full GFM support */}
          {viewMode !== 'edit' && (
            <div className="preview-pane">
              <div className="pane-header">Vorschau</div>
              <div className="preview-content">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Custom code renderer for mermaid diagrams
                    code({ node, inline, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      const language = match ? match[1] : '';

                      // Handle mermaid code blocks
                      if (!inline && language === 'mermaid') {
                        return <MermaidDiagram content={String(children).replace(/\n$/, '')} />;
                      }

                      // Default code rendering
                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {content}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="markdown-editor-footer">
          <span>{content.length} Zeichen</span>
          <span>{content.split(/\s+/).filter(w => w.length > 0).length} Wörter</span>
          <span>{content.split('\n').length} Zeilen</span>
          {hasChanges && <span className="changes-indicator">Ungespeicherte Änderungen</span>}
        </div>
      </div>
      {ConfirmDialog}
    </div>
  );
});

export default MarkdownEditor;
