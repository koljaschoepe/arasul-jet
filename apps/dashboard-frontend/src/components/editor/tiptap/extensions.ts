/**
 * TipTap Extensions Configuration
 * Central factory for the editor's extension array.
 * Each phase adds extensions here.
 */

import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import TextAlign from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import Image from '@tiptap/extension-image';
import { Markdown } from 'tiptap-markdown';
import { lowlight } from './code-languages';
import { MermaidCodeBlock } from './MermaidNode';
import { SlashCommandsExtension } from './SlashCommands';

export function createExtensions() {
  return [
    StarterKit.configure({
      codeBlock: false, // replaced by CodeBlockLowlight
      heading: {
        levels: [1, 2, 3, 4],
      },
      // Link ist in StarterKit v3 enthalten — im Editor sollen Klicks nicht
      // navigieren, sondern nur den Cursor setzen (Bearbeiten statt Öffnen).
      link: {
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          rel: 'noopener noreferrer nofollow',
          class: 'tiptap-link',
        },
      },
    }),
    Underline,
    // Text-Ausrichtung für Absätze und Überschriften (links/mittig/rechts).
    TextAlign.configure({
      types: ['heading', 'paragraph'],
      alignments: ['left', 'center', 'right'],
      defaultAlignment: 'left',
    }),
    Placeholder.configure({
      placeholder: 'Schreiben Sie hier...',
    }),
    CharacterCount,
    Table.configure({
      resizable: true,
      HTMLAttributes: {
        class: 'tiptap-table',
      },
    }),
    TableRow,
    TableHeader,
    TableCell,
    MermaidCodeBlock.configure({
      lowlight,
      defaultLanguage: 'plaintext',
    }),
    Image.configure({
      inline: false,
      allowBase64: false,
    }),
    SlashCommandsExtension,
    Markdown.configure({
      html: false,
      transformPastedText: true,
      transformCopiedText: true,
    }),
  ];
}
