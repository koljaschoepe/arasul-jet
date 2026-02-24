/**
 * MarkdownEditor Component
 * Simple markdown editor with live preview
 * Uses ReactMarkdown with remarkGfm for full GFM support (tables, strikethrough, etc.)
 */

import React, { memo, useState, useEffect, useCallback, useRef } from 'react';
import {
  FiX,
  FiSave,
  FiEye,
  FiEdit2,
  FiMaximize2,
  FiMinimize2,
  FiAlertCircle,
} from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MermaidDiagram from './MermaidDiagram';
import useConfirm from '../hooks/useConfirm';
import { API_BASE } from '../config/api';
import '../markdown-editor.css';

const MarkdownEditor = memo(function MarkdownEditor({
  documentId,
  filename,
  onClose,
  onSave,
  token,
}) {
  const { confirm, ConfirmDialog } = useConfirm();
  const containerRef = useRef(null);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('split'); // 'edit', 'preview', 'split'
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

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

        const response = await fetch(`${API_BASE}/documents/${documentId}/content`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Fehler beim Laden');
        }

        const data = await response.json();
        setContent(data.content);
        setOriginalContent(data.content);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (documentId && token) {
      loadContent();
    }
  }, [documentId, token]);

  // Track changes
  useEffect(() => {
    setHasChanges(content !== originalContent);
  }, [content, originalContent]);

  // Handle save
  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      setError(null);

      const response = await fetch(`${API_BASE}/documents/${documentId}/content`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Fehler beim Speichern');
      }

      setOriginalContent(content);
      setHasChanges(false);

      if (onSave) {
        onSave();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [documentId, content, token, onSave]);

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
    const handleKeyDown = e => {
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
        const focusable = containerRef.current.querySelectorAll(
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

  // Insert text helper
  const insertText = (before, after = '') => {
    const textarea = document.getElementById('markdown-textarea');
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
            <FiEdit2 />
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
              >
                <strong>B</strong>
              </button>
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => insertText('*', '*')}
                title="Kursiv (Ctrl+I)"
              >
                <em>I</em>
              </button>
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => insertText('# ')}
                title="Überschrift"
              >
                H
              </button>
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => insertText('`', '`')}
                title="Code"
              >
                {'</>'}
              </button>
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => insertText('[', '](url)')}
                title="Link"
              >
                Link
              </button>
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => insertText('- ')}
                title="Liste"
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
              >
                <FiEdit2 />
              </button>
              <button
                type="button"
                className={`toolbar-btn ${viewMode === 'split' ? 'active' : ''}`}
                onClick={() => setViewMode('split')}
                title="Geteilte Ansicht"
              >
                <FiEdit2 />
                <FiEye />
              </button>
              <button
                type="button"
                className={`toolbar-btn ${viewMode === 'preview' ? 'active' : ''}`}
                onClick={() => setViewMode('preview')}
                title="Nur Vorschau"
              >
                <FiEye />
              </button>
            </div>

            {/* Action buttons */}
            <div className="toolbar-group">
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => setIsFullscreen(!isFullscreen)}
                title={isFullscreen ? 'Verkleinern' : 'Vollbild'}
              >
                {isFullscreen ? <FiMinimize2 /> : <FiMaximize2 />}
              </button>
              <button
                type="button"
                className={`toolbar-btn save-btn ${hasChanges ? 'has-changes' : ''}`}
                onClick={handleSave}
                disabled={!hasChanges || saving}
                title="Speichern (Ctrl+S)"
              >
                <FiSave />
                {saving ? 'Speichert...' : 'Speichern'}
              </button>
              <button
                type="button"
                className="toolbar-btn close-btn"
                onClick={handleClose}
                title="Schließen"
              >
                <FiX />
              </button>
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="markdown-editor-error">
            <FiAlertCircle />
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)}>
              <FiX />
            </button>
          </div>
        )}

        {/* Editor content */}
        <div className={`markdown-editor-content view-${viewMode}`}>
          {/* Editor pane */}
          {viewMode !== 'preview' && (
            <div className="editor-pane">
              <div className="pane-header">Editor</div>
              <textarea
                id="markdown-textarea"
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Markdown hier eingeben..."
                spellCheck="true"
              />
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
                    code({ node, inline, className, children, ...props }) {
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
