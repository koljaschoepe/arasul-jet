/**
 * ProjectMarkdownEditor — WYSIWYG-Vorschau-Editor für Projekt-Markdown
 * (Plan 016, Schritt 4).
 *
 * KONTROLLIERT: Der Elternteil (ProjectFileTab) besitzt Inhalt, Dirty-Status,
 * Auto-Save und Ctrl+S — genau EINE Quelle der Wahrheit, geteilt mit dem
 * Code-Modus (CodeMirror). Diese Komponente rendert nur den TipTap-Editor und
 * meldet echte Nutzer-Änderungen über `onChange` zurück.
 *
 * Wiederverwendung: dieselbe TipTap-Engine, Extension-Konfiguration und CSS wie
 * der Dokument-Editor (DocumentViewerTab) — der „schöne Editor mit Animationen".
 *
 * Sicherheit (Ein-Ordner-Modell = Platte ist Wahrheit):
 * - YAML-Frontmatter wird VOR dem Editor abgeschnitten, wörtlich gehalten und
 *   beim Zurückmelden unverändert wieder angehängt (kein Frontmatter-Bruch).
 * - Bloßes Öffnen meldet NIE eine Änderung (Hydration-Sperre) → kein Auto-Save,
 *   keine Disk-Schreibung ohne echte Nutzer-Eingabe.
 */
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Table as TableIcon,
  Undo2,
} from 'lucide-react';
import { createExtensions } from '@/components/editor/tiptap/extensions';
import { splitFrontmatter } from '@/components/editor/tiptap/markdownFrontmatter';
import '@/components/editor/tiptap/tiptap-editor.css';

/** Shape des tiptap-markdown-Storage-Slots. */
interface MarkdownStorage {
  markdown?: { getMarkdown?: () => string };
}

function bodyMarkdown(editor: Editor): string {
  const storage = editor.storage as MarkdownStorage;
  return storage.markdown?.getMarkdown?.() ?? '';
}

interface Props {
  /** Voller Markdown-Inhalt (inkl. etwaigem Frontmatter). */
  value: string;
  /** Wird bei ECHTEN Nutzer-Änderungen mit dem vollen Markdown aufgerufen. */
  onChange: (next: string) => void;
  ariaLabel?: string;
}

export default function ProjectMarkdownEditor({ value, onChange, ariaLabel }: Props) {
  // Wörtlich gehaltener Frontmatter-Block; wird beim Melden wieder vorangestellt.
  const frontmatterRef = useRef('');
  // Zuletzt selbst gemeldeter Wert — trennt eigene Echos von echten externen
  // Änderungen (z. B. Fenster-Fokus-Refresh in ProjectFileTab), damit ein
  // Tastendruck nicht den Cursor durch ein erneutes setContent zurücksetzt.
  const lastEmittedRef = useRef<string | null>(null);
  // Sperrt das onChange während der initialen Hydration (setContent löst
  // onUpdate aus) — sonst gälte bloßes Öffnen als Änderung.
  const hydratedRef = useRef(false);

  const editor = useEditor({
    extensions: createExtensions(),
    editorProps: {
      attributes: {
        class: 'tiptap-content',
        spellcheck: 'true',
        'aria-label': ariaLabel ?? 'Markdown-Editor',
      },
    },
    onUpdate: ({ editor: e }) => {
      if (!hydratedRef.current) return;
      const full = frontmatterRef.current + bodyMarkdown(e);
      lastEmittedRef.current = full;
      onChange(full);
    },
  });

  // Hydration aus dem externen Wert (Erstladung + externer Refresh). Eigene
  // Echos (value === zuletzt gemeldet) überspringen, um den Cursor zu halten.
  useEffect(() => {
    if (!editor) return;
    if (value === lastEmittedRef.current) return;
    hydratedRef.current = false;
    const { frontmatter, body } = splitFrontmatter(value);
    frontmatterRef.current = frontmatter;
    editor.commands.setContent(body);
    lastEmittedRef.current = value; // Grundlinie: Öffnen ist keine Änderung
    hydratedRef.current = true;
  }, [editor, value]);

  if (!editor) return null;

  const btn = (
    active: boolean,
    onClick: () => void,
    label: string,
    node: React.ReactNode,
    disabled = false
  ) => (
    <button
      type="button"
      className={`tiptap-toolbar-btn ${active ? 'active' : ''}`}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
    >
      {node}
    </button>
  );

  const setLink = () => {
    const previous = (editor.getAttributes('link').href as string | undefined) ?? '';
    const url = window.prompt('Link-URL (leer lassen zum Entfernen):', previous);
    if (url === null) return;
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  return (
    <div className="tiptap-editor-overlay tiptap-editor-embedded" role="presentation">
      <div className="tiptap-editor-container">
        {/* Formatier-Leiste — immer EINE Zeile; bei schmalem Panel verdichtet
            die Container-Query die Buttons, darunter scrollt die Leiste
            horizontal statt umzubrechen. */}
        <div className="tiptap-editor-header tiptap-toolbar-slim">
          <div
            className="flex flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto"
            role="toolbar"
            aria-label="Formatierung"
          >
            <div className="tiptap-toolbar-group">
              {btn(
                editor.isActive('paragraph') && !editor.isActive('heading'),
                () => editor.chain().focus().setParagraph().run(),
                'Fließtext',
                'P'
              )}
              {([1, 2, 3] as const).map(level =>
                btn(
                  editor.isActive('heading', { level }),
                  () => editor.chain().focus().toggleHeading({ level }).run(),
                  `Überschrift ${level}`,
                  `H${level}`
                )
              )}
            </div>
            <div className="tiptap-toolbar-group">
              {btn(
                editor.isActive('bold'),
                () => editor.chain().focus().toggleBold().run(),
                'Fett',
                <Bold size={16} />
              )}
              {btn(
                editor.isActive('italic'),
                () => editor.chain().focus().toggleItalic().run(),
                'Kursiv',
                <Italic size={16} />
              )}
              {btn(
                editor.isActive('strike'),
                () => editor.chain().focus().toggleStrike().run(),
                'Durchgestrichen',
                <Strikethrough size={16} />
              )}
              {btn(
                editor.isActive('code'),
                () => editor.chain().focus().toggleCode().run(),
                'Inline-Code',
                <Code size={16} />
              )}
              {btn(editor.isActive('link'), setLink, 'Link', <Link2 size={16} />)}
              {btn(
                false,
                () => editor.chain().focus().extendMarkRange('link').unsetLink().run(),
                'Link entfernen',
                <Link2Off size={16} />,
                !editor.isActive('link')
              )}
            </div>
            <div className="tiptap-toolbar-group">
              {btn(
                editor.isActive({ textAlign: 'left' }),
                () => editor.chain().focus().setTextAlign('left').run(),
                'Linksbündig',
                <AlignLeft size={16} />
              )}
              {btn(
                editor.isActive({ textAlign: 'center' }),
                () => editor.chain().focus().setTextAlign('center').run(),
                'Zentriert',
                <AlignCenter size={16} />
              )}
              {btn(
                editor.isActive({ textAlign: 'right' }),
                () => editor.chain().focus().setTextAlign('right').run(),
                'Rechtsbündig',
                <AlignRight size={16} />
              )}
            </div>
            <div className="tiptap-toolbar-group">
              {btn(
                editor.isActive('bulletList'),
                () => editor.chain().focus().toggleBulletList().run(),
                'Aufzählung',
                <List size={16} />
              )}
              {btn(
                editor.isActive('orderedList'),
                () => editor.chain().focus().toggleOrderedList().run(),
                'Nummerierte Liste',
                <ListOrdered size={16} />
              )}
              {btn(
                editor.isActive('blockquote'),
                () => editor.chain().focus().toggleBlockquote().run(),
                'Zitat',
                <Quote size={16} />
              )}
              {btn(
                editor.isActive('codeBlock'),
                () => editor.chain().focus().toggleCodeBlock().run(),
                'Code-Block',
                <span className="font-mono text-xs">{'{ }'}</span>
              )}
              {btn(
                false,
                () =>
                  editor
                    .chain()
                    .focus()
                    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                    .run(),
                'Tabelle einfügen',
                <TableIcon size={16} />
              )}
            </div>
            <div className="tiptap-toolbar-group">
              {btn(
                false,
                () => editor.chain().focus().undo().run(),
                'Rückgängig',
                <Undo2 size={16} />,
                !editor.can().undo()
              )}
              {btn(
                false,
                () => editor.chain().focus().redo().run(),
                'Wiederholen',
                <Redo2 size={16} />,
                !editor.can().redo()
              )}
            </div>
          </div>
        </div>

        <div className="tiptap-editor-content">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
