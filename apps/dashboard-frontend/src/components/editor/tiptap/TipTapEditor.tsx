/**
 * TipTap WYSIWYG Editor
 * Replaces the textarea-based MarkdownEditor with a full WYSIWYG experience.
 * Documents are loaded/saved as Markdown via the existing API.
 */

import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { X, Save, FileText, Maximize2, Minimize2, AlertCircle } from 'lucide-react';
import useConfirm from '../../../hooks/useConfirm';
import { useApi } from '../../../hooks/useApi';
import { createExtensions } from './extensions';
import './tiptap-editor.css';

interface TipTapEditorProps {
  documentId: string;
  filename: string;
  onClose: () => void;
  onSave?: () => void;
  token: string;
}

const TipTapEditor = memo(function TipTapEditor({
  documentId,
  filename,
  onClose,
  onSave,
}: TipTapEditorProps) {
  const api = useApi();
  const { confirm, ConfirmDialog } = useConfirm();
  const containerRef = useRef<HTMLDivElement>(null);
  const originalContentRef = useRef<string>('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload image to MinIO and return the URL
  const uploadImage = useCallback(
    async (file: File): Promise<string | null> => {
      const formData = new FormData();
      formData.append('image', file);
      try {
        const result = await api.post<{ url: string }>('/documents/images/upload', formData, {
          showError: false,
        });
        return result.url;
      } catch (err: unknown) {
        setError(
          `Bild-Upload fehlgeschlagen: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`
        );
        return null;
      }
    },
    [api]
  );

  const editor = useEditor({
    extensions: createExtensions(),
    editorProps: {
      attributes: {
        class: 'tiptap-content',
        spellcheck: 'true',
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) {
              uploadImage(file).then(url => {
                if (url && view.state) {
                  const { tr } = view.state;
                  const node = view.state.schema.nodes.image.create({ src: url });
                  view.dispatch(tr.replaceSelectionWith(node));
                }
              });
            }
            return true;
          }
        }
        return false;
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return false;
        event.preventDefault();
        for (const file of imageFiles) {
          uploadImage(file).then(url => {
            if (url && view.state) {
              const { tr } = view.state;
              const pos =
                view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ??
                tr.selection.from;
              const node = view.state.schema.nodes.image.create({ src: url });
              view.dispatch(tr.insert(pos, node));
            }
          });
        }
        return true;
      },
    },
    onUpdate: ({ editor: e }) => {
      const storage = e.storage as Record<string, any>;
      const currentMd: string = storage.markdown?.getMarkdown?.() ?? '';
      setHasChanges(currentMd !== originalContentRef.current);
    },
  });

  // Prevent body scroll while editor is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Load document content
  useEffect(() => {
    if (!editor || !documentId) return;

    const loadContent = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.get<{ content: string }>(`/documents/${documentId}/content`, {
          showError: false,
        });
        const md = data.content || '';
        originalContentRef.current = md;
        editor.commands.setContent(md);
        setHasChanges(false);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
      } finally {
        setLoading(false);
      }
    };

    loadContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, documentId]);

  // Get markdown from editor
  const getMarkdown = useCallback((): string => {
    if (!editor) return '';
    const storage = editor.storage as Record<string, any>;
    return storage.markdown?.getMarkdown?.() ?? '';
  }, [editor]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!editor) return;
    try {
      setSaving(true);
      setError(null);
      const markdown = getMarkdown();
      await api.put(
        `/documents/${documentId}/content`,
        { content: markdown },
        { showError: false }
      );
      originalContentRef.current = markdown;
      setHasChanges(false);
      onSave?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setSaving(false);
    }
  }, [editor, documentId, getMarkdown, onSave, api]);

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

  // Keyboard shortcuts + focus trap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S / Cmd+S — Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasChanges && !saving) {
          handleSave();
        }
      }
      // Escape — close or exit fullscreen
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          handleClose();
        }
      }
      // Focus trap: cycle Tab within the editor container
      if (e.key === 'Tab' && containerRef.current) {
        const focusable = containerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [contenteditable="true"], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
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

  // Word/line count from the editor
  const charCount = editor?.storage.characterCount?.characters() ?? 0;
  const wordCount = editor?.storage.characterCount?.words() ?? 0;

  // Loading state
  if (loading || !editor) {
    return (
      <div
        className={`tiptap-editor-overlay ${isFullscreen ? 'fullscreen' : ''}`}
        role="presentation"
      >
        <div
          className="tiptap-editor-container"
          role="dialog"
          aria-modal="true"
          aria-label={`Editor: ${filename}`}
        >
          <div className="tiptap-editor-loading">
            <div className="tiptap-spinner" />
            <p>Dokument wird geladen...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`tiptap-editor-overlay ${isFullscreen ? 'fullscreen' : ''}`}
      role="presentation"
    >
      <div
        ref={containerRef}
        className="tiptap-editor-container"
        role="dialog"
        aria-modal="true"
        aria-label={`Editor: ${filename}`}
      >
        {/* Header / Toolbar */}
        <div className="tiptap-editor-header">
          <div className="tiptap-editor-title">
            <FileText />
            <span>{filename}</span>
            {hasChanges && <span className="tiptap-unsaved-indicator">*</span>}
          </div>

          <div className="tiptap-editor-toolbar">
            {/* Formatting buttons — will be extracted to EditorToolbar in Phase 2 */}
            <div className="tiptap-toolbar-group">
              <button
                type="button"
                className={`tiptap-toolbar-btn ${editor.isActive('bold') ? 'active' : ''}`}
                onClick={() => editor.chain().focus().toggleBold().run()}
                title="Fett (Ctrl+B)"
              >
                <strong>B</strong>
              </button>
              <button
                type="button"
                className={`tiptap-toolbar-btn ${editor.isActive('italic') ? 'active' : ''}`}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                title="Kursiv (Ctrl+I)"
              >
                <em>I</em>
              </button>
              <button
                type="button"
                className={`tiptap-toolbar-btn ${editor.isActive('underline') ? 'active' : ''}`}
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                title="Unterstrichen (Ctrl+U)"
              >
                <u>U</u>
              </button>
              <button
                type="button"
                className={`tiptap-toolbar-btn ${editor.isActive('strike') ? 'active' : ''}`}
                onClick={() => editor.chain().focus().toggleStrike().run()}
                title="Durchgestrichen"
              >
                <s>S</s>
              </button>
              <button
                type="button"
                className={`tiptap-toolbar-btn ${editor.isActive('code') ? 'active' : ''}`}
                onClick={() => editor.chain().focus().toggleCode().run()}
                title="Inline-Code"
              >
                {'</>'}
              </button>
            </div>

            {/* Heading buttons */}
            <div className="tiptap-toolbar-group">
              {([1, 2, 3] as const).map(level => (
                <button
                  key={level}
                  type="button"
                  className={`tiptap-toolbar-btn ${editor.isActive('heading', { level }) ? 'active' : ''}`}
                  onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
                  title={`Überschrift ${level}`}
                >
                  H{level}
                </button>
              ))}
            </div>

            {/* List & block buttons */}
            <div className="tiptap-toolbar-group">
              <button
                type="button"
                className={`tiptap-toolbar-btn ${editor.isActive('bulletList') ? 'active' : ''}`}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                title="Aufzählung"
              >
                &bull;
              </button>
              <button
                type="button"
                className={`tiptap-toolbar-btn ${editor.isActive('orderedList') ? 'active' : ''}`}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                title="Nummerierte Liste"
              >
                1.
              </button>
              <button
                type="button"
                className={`tiptap-toolbar-btn ${editor.isActive('blockquote') ? 'active' : ''}`}
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                title="Zitat"
              >
                &ldquo;
              </button>
              <button
                type="button"
                className={`tiptap-toolbar-btn ${editor.isActive('codeBlock') ? 'active' : ''}`}
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                title="Code-Block"
              >
                {'{ }'}
              </button>
              <button
                type="button"
                className="tiptap-toolbar-btn"
                onClick={() => editor.chain().focus().setHorizontalRule().run()}
                title="Trennlinie"
              >
                &mdash;
              </button>
            </div>

            {/* Table buttons */}
            <div className="tiptap-toolbar-group">
              <button
                type="button"
                className="tiptap-toolbar-btn"
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                    .run()
                }
                title="Tabelle einfügen"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="3" y1="15" x2="21" y2="15" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                  <line x1="15" y1="3" x2="15" y2="21" />
                </svg>
              </button>
              <button
                type="button"
                className="tiptap-toolbar-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Bild einfügen"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={async e => {
                  const file = e.target.files?.[0];
                  if (file && editor) {
                    const url = await uploadImage(file);
                    if (url) {
                      editor.chain().focus().setImage({ src: url }).run();
                    }
                  }
                  e.target.value = '';
                }}
              />
              {editor.isActive('table') && (
                <>
                  <button
                    type="button"
                    className="tiptap-toolbar-btn"
                    onClick={() => editor.chain().focus().addRowAfter().run()}
                    title="Zeile hinzufügen"
                  >
                    +↓
                  </button>
                  <button
                    type="button"
                    className="tiptap-toolbar-btn"
                    onClick={() => editor.chain().focus().addColumnAfter().run()}
                    title="Spalte hinzufügen"
                  >
                    +→
                  </button>
                  <button
                    type="button"
                    className="tiptap-toolbar-btn"
                    onClick={() => editor.chain().focus().deleteRow().run()}
                    title="Zeile löschen"
                  >
                    -↓
                  </button>
                  <button
                    type="button"
                    className="tiptap-toolbar-btn"
                    onClick={() => editor.chain().focus().deleteColumn().run()}
                    title="Spalte löschen"
                  >
                    -→
                  </button>
                  <button
                    type="button"
                    className="tiptap-toolbar-btn tiptap-close-btn"
                    onClick={() => editor.chain().focus().deleteTable().run()}
                    title="Tabelle löschen"
                  >
                    ✕
                  </button>
                </>
              )}
            </div>

            {/* Action buttons */}
            <div className="tiptap-toolbar-group">
              <button
                type="button"
                className="tiptap-toolbar-btn"
                onClick={() => editor.chain().focus().undo().run()}
                disabled={!editor.can().undo()}
                title="Rückgängig (Ctrl+Z)"
              >
                &#x21B6;
              </button>
              <button
                type="button"
                className="tiptap-toolbar-btn"
                onClick={() => editor.chain().focus().redo().run()}
                disabled={!editor.can().redo()}
                title="Wiederholen (Ctrl+Y)"
              >
                &#x21B7;
              </button>
            </div>

            <div className="tiptap-toolbar-group">
              <button
                type="button"
                className="tiptap-toolbar-btn"
                onClick={() => setIsFullscreen(!isFullscreen)}
                title={isFullscreen ? 'Verkleinern' : 'Vollbild'}
              >
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button
                type="button"
                className={`tiptap-toolbar-btn tiptap-save-btn ${hasChanges ? 'has-changes' : ''}`}
                onClick={handleSave}
                disabled={!hasChanges || saving}
                title="Speichern (Ctrl+S)"
              >
                <Save size={16} />
                {saving ? 'Speichert...' : 'Speichern'}
              </button>
              <button
                type="button"
                className="tiptap-toolbar-btn tiptap-close-btn"
                onClick={handleClose}
                title="Schließen"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="tiptap-editor-error">
            <AlertCircle size={16} />
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Fehlermeldung schließen"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Editor content area */}
        <div className="tiptap-editor-content">
          <EditorContent editor={editor} />
        </div>

        {/* Footer */}
        <div className="tiptap-editor-footer">
          <span>{charCount} Zeichen</span>
          <span>{wordCount} Wörter</span>
          {hasChanges && (
            <span className="tiptap-changes-indicator">Ungespeicherte Änderungen</span>
          )}
        </div>
      </div>
      {ConfirmDialog}
    </div>
  );
});

export default TipTapEditor;
