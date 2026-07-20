/**
 * TipTap WYSIWYG Editor
 * Replaces the textarea-based MarkdownEditor with a full WYSIWYG experience.
 * Documents are loaded/saved as Markdown via the existing API.
 */

import {
  memo,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  Fragment,
  type ReactNode,
} from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import {
  X,
  Save,
  FileText,
  Maximize2,
  Minimize2,
  AlertCircle,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link2,
  Link2Off,
  MoreHorizontal,
} from 'lucide-react';
import useConfirm from '../../../hooks/useConfirm';
import { useApi } from '../../../hooks/useApi';
import { createExtensions } from './extensions';
import { computeInlineCount } from './toolbarOverflow';
import './tiptap-editor.css';

/** Platz (px), der in der Formatier-Leiste fürs ⋯-Überlaufmenü freigehalten wird. */
const MORE_RESERVED_PX = 40;

/** Idle-Zeit (ms) nach der letzten Änderung, bevor automatisch gespeichert wird. */
const AUTOSAVE_DELAY_MS = 1200;
/** Wie lange der „Gespeichert"-Hinweis nach dem Speichern sichtbar bleibt. */
const SAVED_FLASH_MS = 2500;

/** Shape of the tiptap-markdown storage slot we read from editor.storage. */
interface MarkdownStorage {
  markdown?: { getMarkdown?: () => string };
}

interface TipTapEditorProps {
  documentId: string;
  filename: string;
  onClose: () => void;
  onSave?: () => void;
  token: string;
  /**
   * Inline-Modus: der Editor füllt seinen Eltern-Container (flex column,
   * height 100%) statt als fixed Vollbild-Overlay zu erscheinen. Der
   * Vollbild-Toggle wechselt weiterhin in ein temporäres fixed Overlay.
   */
  embedded?: boolean;
}

const TipTapEditor = memo(function TipTapEditor({
  documentId,
  filename,
  onClose,
  onSave,
  embedded = false,
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
  const [savedFlash, setSavedFlash] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Autosave-Verdrahtung: `hydratedRef` verhindert einen No-Op-Save direkt nach
  // dem initialen Laden (setContent löst onUpdate aus). `autosaveTimerRef` ist
  // der laufende Debounce-Timer, `autosaveRunRef` hält stets die aktuelle
  // Save-Funktion (Refs sind stabil, der Timer liest so nie eine veraltete
  // Closure).
  const hydratedRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveRunRef = useRef<() => void>(() => {});

  // Reaktive Überlauf-Steuerung der Formatier-Leiste: die Leiste bleibt strikt
  // einzeilig; überzählige Gruppen wandern hinter das ⋯-Menü. Ein verstecktes
  // Mess-Lineal liefert die Gruppenbreiten, ein ResizeObserver die Container-
  // breite; die reine Rechnung steckt in computeInlineCount (getestet).
  const toolbarRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const groupWidthsRef = useRef<number[]>([]);
  const moreWrapRef = useRef<HTMLDivElement>(null);
  const [inlineCount, setInlineCount] = useState(Number.MAX_SAFE_INTEGER);
  const [moreOpen, setMoreOpen] = useState(false);
  // Lineal nur mounten, solange gemessen werden muss (dann aushängen → keine
  // dauerhaft doppelten aria-labels im DOM).
  const [measurePending, setMeasurePending] = useState(true);

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
                // schema.nodes is an index type; 'image' is always registered
                // via the Image extension, the guard only narrows the type.
                const imageType = view.state?.schema.nodes.image;
                if (url && view.state && imageType) {
                  const { tr } = view.state;
                  const node = imageType.create({ src: url });
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
            // See handlePaste: 'image' node is always registered.
            const imageType = view.state?.schema.nodes.image;
            if (url && view.state && imageType) {
              const { tr } = view.state;
              const pos =
                view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ??
                tr.selection.from;
              const node = imageType.create({ src: url });
              view.dispatch(tr.insert(pos, node));
            }
          });
        }
        return true;
      },
    },
    onUpdate: ({ editor: e }) => {
      const storage = e.storage as MarkdownStorage;
      const currentMd: string = storage.markdown?.getMarkdown?.() ?? '';
      const changed = currentMd !== originalContentRef.current;
      setHasChanges(changed);

      // Kein Autosave während der initialen Hydration (verhindert Speicher-Loop).
      if (!hydratedRef.current) return;
      setSavedFlash(false);
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      // Nichts (mehr) zu speichern (z. B. Änderung zurückgenommen).
      if (!changed) return;
      autosaveTimerRef.current = setTimeout(() => {
        autosaveRunRef.current();
      }, AUTOSAVE_DELAY_MS);
    },
  });

  // Prevent body scroll while the editor is open — but not in embedded mode
  // (there it lives inline in a tab and must not lock the whole page). When
  // the embedded editor is toggled to fullscreen it covers the page, so lock
  // then too.
  useEffect(() => {
    if (embedded && !isFullscreen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [embedded, isFullscreen]);

  // Load document content
  useEffect(() => {
    if (!editor || !documentId) return;

    // Neue Datei: Autosave still legen, bis der Inhalt hydratisiert ist.
    hydratedRef.current = false;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    setSavedFlash(false);

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
        // Ab jetzt sind Änderungen echte Nutzereingaben → Autosave erlauben.
        hydratedRef.current = true;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
      } finally {
        setLoading(false);
      }
    };

    loadContent();
    // NOTE: effect deps intentionally scoped (exhaustive-deps reviewed)
  }, [editor, documentId]);

  // Get markdown from editor
  const getMarkdown = useCallback((): string => {
    if (!editor) return '';
    const storage = editor.storage as MarkdownStorage;
    return storage.markdown?.getMarkdown?.() ?? '';
  }, [editor]);

  // Handle save (manuell wie auch per Autosave über denselben PUT-Pfad)
  const handleSave = useCallback(async () => {
    if (!editor) return;
    // Einen anstehenden Autosave verwerfen — dieser Save deckt ihn ab.
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
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
      // „Gespeichert"-Hinweis kurz einblenden.
      setSavedFlash(true);
      if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
      savedFlashTimerRef.current = setTimeout(() => setSavedFlash(false), SAVED_FLASH_MS);
      onSave?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setSaving(false);
    }
  }, [editor, documentId, getMarkdown, onSave, api]);

  // Autosave-Runner immer auf die aktuelle Save-Funktion zeigen lassen; der
  // Debounce-Timer ruft nur, wenn es wirklich etwas zu speichern gibt.
  useEffect(() => {
    autosaveRunRef.current = () => {
      if (hasChanges && !saving) handleSave();
    };
  }, [hasChanges, saving, handleSave]);

  // Timer beim Unmount aufräumen.
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
    };
  }, []);

  // Link setzen/entfernen (nutzt das in StarterKit v3 enthaltene Link-Mark).
  const handleSetLink = useCallback(() => {
    if (!editor) return;
    const previous = (editor.getAttributes('link').href as string | undefined) ?? '';
    const url = window.prompt('Link-URL (leer lassen zum Entfernen):', previous);
    // Abgebrochen → nichts tun.
    if (url === null) return;
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  }, [editor]);

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
        // Das versteckte Mess-Lineal (data-toolbar-ruler) aus der Tab-Reihenfolge
        // ausschließen — sonst landet der Fokus in unsichtbaren Doppel-Buttons.
        const focusable = Array.from(
          containerRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [contenteditable="true"], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter(el => !el.closest('[data-toolbar-ruler]'));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        // length > 0 was checked above, so both ends exist; type-only guard.
        if (!first || !last) return;
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

  // Root layout: fullscreen (fixed, page-covering) wins; otherwise embedded
  // fills its parent inline; otherwise the classic fixed overlay.
  const rootClass = `tiptap-editor-overlay ${
    isFullscreen ? 'fullscreen' : embedded ? 'tiptap-editor-embedded' : ''
  }`;

  // Reaktive Überlauf-Steuerung. Das Mess-Lineal wird NUR gerendert, solange
  // gemessen werden muss (measurePending), und danach wieder ausgehängt — sonst
  // dupliziert es alle Button-Beschriftungen (aria-label) dauerhaft im DOM.
  // tableActive ändert die Breite der Einfügen-Gruppe (Tabellen-Aktionen) →
  // Neu-Messung anstoßen.
  const tableActive = editor?.isActive('table') ?? false;

  // Reine Neuberechnung aus zwischengespeicherten Gruppenbreiten + Containerbreite.
  const recomputeToolbar = useCallback(() => {
    const container = toolbarRef.current;
    const widths = groupWidthsRef.current;
    if (!container || widths.length === 0) return;
    setInlineCount(computeInlineCount(container.clientWidth, widths, MORE_RESERVED_PX));
  }, []);

  // Messen (Lineal aktuell im DOM) → Breiten cachen → Lineal aushängen.
  useLayoutEffect(() => {
    if (loading || !editor || !measurePending) return;
    const ruler = rulerRef.current;
    if (ruler && ruler.children.length > 0) {
      groupWidthsRef.current = Array.from(ruler.children).map(c => (c as HTMLElement).offsetWidth);
    }
    recomputeToolbar();
    setMeasurePending(false);
  }, [loading, editor, measurePending, recomputeToolbar]);

  // Ändert sich der Gruppensatz (Tabellen-Aktionen) oder das Layout (Vollbild),
  // neu messen: Lineal wieder einhängen.
  useEffect(() => {
    setMeasurePending(true);
  }, [tableActive, isFullscreen]);

  // Containerbreite beobachten → nur neu rechnen (aus gecachten Breiten).
  useEffect(() => {
    if (loading || !editor) return;
    const el = toolbarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => recomputeToolbar());
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, editor, recomputeToolbar]);

  // ⋯-Menü bei Klick außerhalb schließen.
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      if (moreWrapRef.current && !moreWrapRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [moreOpen]);

  // Loading state
  if (loading || !editor) {
    return (
      <div className={rootClass} role="presentation">
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

  // Formatier-Gruppen in fester Reihenfolge; Überlauf wandert ins ⋯-Menü.
  const toolbarGroups: Array<{ id: string; node: ReactNode }> = [
    {
      id: 'headings',
      node: (
        <div className="tiptap-toolbar-group">
          <button
            type="button"
            className={`tiptap-toolbar-btn ${editor.isActive('paragraph') && !editor.isActive('heading') ? 'active' : ''}`}
            onClick={() => editor.chain().focus().setParagraph().run()}
            title="Fließtext"
            aria-label="Fließtext"
            aria-pressed={editor.isActive('paragraph') && !editor.isActive('heading')}
          >
            P
          </button>
          {([1, 2, 3] as const).map(level => (
            <button
              key={level}
              type="button"
              className={`tiptap-toolbar-btn ${editor.isActive('heading', { level }) ? 'active' : ''}`}
              onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
              title={`Überschrift ${level}`}
              aria-label={`Überschrift ${level}`}
              aria-pressed={editor.isActive('heading', { level })}
            >
              H{level}
            </button>
          ))}
        </div>
      ),
    },
    {
      id: 'marks',
      node: (
        <div className="tiptap-toolbar-group">
          <button
            type="button"
            className={`tiptap-toolbar-btn ${editor.isActive('bold') ? 'active' : ''}`}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Fett (Ctrl+B)"
            aria-label="Fett"
            aria-pressed={editor.isActive('bold')}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${editor.isActive('italic') ? 'active' : ''}`}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Kursiv (Ctrl+I)"
            aria-label="Kursiv"
            aria-pressed={editor.isActive('italic')}
          >
            <em>I</em>
          </button>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${editor.isActive('underline') ? 'active' : ''}`}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Unterstrichen (Ctrl+U)"
            aria-label="Unterstrichen"
            aria-pressed={editor.isActive('underline')}
          >
            <u>U</u>
          </button>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${editor.isActive('strike') ? 'active' : ''}`}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="Durchgestrichen"
            aria-label="Durchgestrichen"
            aria-pressed={editor.isActive('strike')}
          >
            <s>S</s>
          </button>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${editor.isActive('code') ? 'active' : ''}`}
            onClick={() => editor.chain().focus().toggleCode().run()}
            title="Inline-Code"
            aria-label="Inline-Code"
            aria-pressed={editor.isActive('code')}
          >
            {'</>'}
          </button>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${editor.isActive('link') ? 'active' : ''}`}
            onClick={handleSetLink}
            title="Link einfügen/bearbeiten"
            aria-label="Link einfügen oder bearbeiten"
            aria-pressed={editor.isActive('link')}
          >
            <Link2 size={16} />
          </button>
          <button
            type="button"
            className="tiptap-toolbar-btn"
            onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
            disabled={!editor.isActive('link')}
            title="Link entfernen"
            aria-label="Link entfernen"
          >
            <Link2Off size={16} />
          </button>
        </div>
      ),
    },
    {
      id: 'align',
      node: (
        <div className="tiptap-toolbar-group">
          <button
            type="button"
            className={`tiptap-toolbar-btn ${editor.isActive({ textAlign: 'left' }) ? 'active' : ''}`}
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            title="Linksbündig"
            aria-label="Linksbündig"
            aria-pressed={editor.isActive({ textAlign: 'left' })}
          >
            <AlignLeft size={16} />
          </button>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${editor.isActive({ textAlign: 'center' }) ? 'active' : ''}`}
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            title="Zentriert"
            aria-label="Zentriert"
            aria-pressed={editor.isActive({ textAlign: 'center' })}
          >
            <AlignCenter size={16} />
          </button>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${editor.isActive({ textAlign: 'right' }) ? 'active' : ''}`}
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            title="Rechtsbündig"
            aria-label="Rechtsbündig"
            aria-pressed={editor.isActive({ textAlign: 'right' })}
          >
            <AlignRight size={16} />
          </button>
        </div>
      ),
    },
    {
      id: 'blocks',
      node: (
        <div className="tiptap-toolbar-group">
          <button
            type="button"
            className={`tiptap-toolbar-btn ${editor.isActive('bulletList') ? 'active' : ''}`}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Aufzählung"
            aria-label="Aufzählung"
            aria-pressed={editor.isActive('bulletList')}
          >
            &bull;
          </button>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${editor.isActive('orderedList') ? 'active' : ''}`}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Nummerierte Liste"
            aria-label="Nummerierte Liste"
            aria-pressed={editor.isActive('orderedList')}
          >
            1.
          </button>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${editor.isActive('blockquote') ? 'active' : ''}`}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Zitat"
            aria-label="Zitat"
            aria-pressed={editor.isActive('blockquote')}
          >
            &ldquo;
          </button>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${editor.isActive('codeBlock') ? 'active' : ''}`}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            title="Code-Block"
            aria-label="Code-Block"
            aria-pressed={editor.isActive('codeBlock')}
          >
            {'{ }'}
          </button>
          <button
            type="button"
            className="tiptap-toolbar-btn"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Trennlinie"
            aria-label="Trennlinie"
          >
            &mdash;
          </button>
        </div>
      ),
    },
    {
      id: 'insert',
      node: (
        <div className="tiptap-toolbar-group">
          <button
            type="button"
            className="tiptap-toolbar-btn"
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
            title="Tabelle einfügen"
            aria-label="Tabelle einfügen"
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
            aria-label="Bild einfügen"
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
      ),
    },
    {
      id: 'history',
      node: (
        <div className="tiptap-toolbar-group">
          <button
            type="button"
            className="tiptap-toolbar-btn"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Rückgängig (Ctrl+Z)"
            aria-label="Rückgängig"
          >
            &#x21B6;
          </button>
          <button
            type="button"
            className="tiptap-toolbar-btn"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Wiederholen (Ctrl+Y)"
            aria-label="Wiederholen"
          >
            &#x21B7;
          </button>
        </div>
      ),
    },
  ];

  const count = Math.min(inlineCount, toolbarGroups.length);
  const hasOverflow = count < toolbarGroups.length;

  return (
    <div className={rootClass} role="presentation">
      <div
        ref={containerRef}
        className="tiptap-editor-container"
        role="dialog"
        aria-modal="true"
        aria-label={`Editor: ${filename}`}
      >
        {/* Header: Zeile 1 = Formatier-Leiste (strikt einzeilig, ⋯-Überlauf),
            Zeile 2 = Dateiname + Autosave-Status + Aktionen. */}
        <div className="tiptap-editor-header">
          <div
            className="tiptap-editor-toolbar"
            role="toolbar"
            aria-label="Formatierung"
            ref={toolbarRef}
          >
            <div className="tiptap-toolbar-inline">
              {toolbarGroups.slice(0, count).map(g => (
                <Fragment key={g.id}>{g.node}</Fragment>
              ))}
            </div>

            {hasOverflow && (
              <div className="tiptap-toolbar-more" ref={moreWrapRef}>
                <button
                  type="button"
                  className={`tiptap-toolbar-btn ${moreOpen ? 'active' : ''}`}
                  onClick={() => setMoreOpen(o => !o)}
                  title="Weitere Formatierung"
                  aria-label="Weitere Formatierung"
                  aria-haspopup="true"
                  aria-expanded={moreOpen}
                >
                  <MoreHorizontal size={16} />
                </button>
                {moreOpen && (
                  <div className="tiptap-toolbar-more-panel" role="menu">
                    {toolbarGroups.slice(count).map(g => (
                      <Fragment key={g.id}>{g.node}</Fragment>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Verstecktes Mess-Lineal: alle Gruppen, liefert die Gruppenbreiten.
                Nur gemountet, solange gemessen wird (measurePending) — danach
                ausgehängt, damit die Button-Beschriftungen nicht dauerhaft
                doppelt im DOM stehen. visibility:hidden + data-toolbar-ruler
                halten es aus Tab-Fluss und Fokus-Trap heraus. */}
            {measurePending && (
              <div
                className="tiptap-toolbar-ruler"
                data-toolbar-ruler
                ref={rulerRef}
                aria-hidden="true"
              >
                {toolbarGroups.map(g => (
                  <Fragment key={g.id}>{g.node}</Fragment>
                ))}
              </div>
            )}
          </div>

          <div className="tiptap-editor-titlebar">
            <div className="tiptap-editor-title">
              <FileText />
              <span>{filename}</span>
              {hasChanges && <span className="tiptap-unsaved-indicator">*</span>}
            </div>
            <span className="tiptap-autosave-status" role="status" aria-live="polite">
              {saving ? 'Speichert…' : savedFlash ? 'Gespeichert' : ''}
            </span>
            <div className="tiptap-toolbar-group tiptap-titlebar-actions">
              <button
                type="button"
                className="tiptap-toolbar-btn"
                onClick={() => setIsFullscreen(!isFullscreen)}
                title={isFullscreen ? 'Verkleinern' : 'Vollbild'}
                aria-label={isFullscreen ? 'Verkleinern' : 'Vollbild'}
              >
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button
                type="button"
                className={`tiptap-toolbar-btn tiptap-save-btn ${hasChanges ? 'has-changes' : ''}`}
                onClick={handleSave}
                disabled={!hasChanges || saving}
                title="Speichern (Ctrl+S)"
                aria-label="Speichern"
              >
                <Save size={16} />
                {saving ? 'Speichert...' : 'Speichern'}
              </button>
              <button
                type="button"
                className="tiptap-toolbar-btn tiptap-close-btn"
                onClick={handleClose}
                title="Schließen"
                aria-label="Schließen"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Bild-Upload-Input (aus der Einfügen-Gruppe ausgelagert, damit es
              nicht dreifach im DOM landet). */}
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
