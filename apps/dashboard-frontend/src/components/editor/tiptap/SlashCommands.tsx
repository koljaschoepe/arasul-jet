/**
 * Slash Commands Extension
 * Typing "/" opens a filterable command menu for inserting blocks.
 * Uses a pure React/CSS dropdown without tippy.js dependency.
 */

import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import SlashCommandsList from './SlashCommandsList';

export interface SlashCommandItem {
  title: string;
  description: string;
  icon: string;
  command: (props: { editor: any; range: any }) => void;
}

const slashCommands: SlashCommandItem[] = [
  {
    title: 'Text',
    description: 'Normaler Absatz',
    icon: 'Aa',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setParagraph().run();
    },
  },
  {
    title: 'Überschrift 1',
    description: 'Große Überschrift',
    icon: 'H1',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
    },
  },
  {
    title: 'Überschrift 2',
    description: 'Mittlere Überschrift',
    icon: 'H2',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
    },
  },
  {
    title: 'Überschrift 3',
    description: 'Kleine Überschrift',
    icon: 'H3',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
    },
  },
  {
    title: 'Aufzählung',
    description: 'Ungeordnete Liste',
    icon: '•',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: 'Nummerierte Liste',
    description: 'Geordnete Liste',
    icon: '1.',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: 'Zitat',
    description: 'Blockquote',
    icon: '"',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: 'Code-Block',
    description: 'Syntax-hervorgehobener Code',
    icon: '{ }',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: 'Mermaid Diagramm',
    description: 'Diagramm mit Live-Vorschau',
    icon: '◇',
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleCodeBlock()
        .updateAttributes('codeBlock', { language: 'mermaid' })
        .run();
    },
  },
  {
    title: 'Tabelle',
    description: '3×3 Tabelle einfügen',
    icon: '⊞',
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    },
  },
  {
    title: 'Trennlinie',
    description: 'Horizontale Linie',
    icon: '—',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
];

export const SlashCommandsExtension = Extension.create({
  name: 'slashCommands',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({
          editor,
          range,
          props,
        }: {
          editor: any;
          range: any;
          props: SlashCommandItem;
        }) => {
          props.command({ editor, range });
        },
      } as Partial<SuggestionOptions>,
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        items: ({ query }: { query: string }) => {
          return slashCommands.filter(
            item =>
              item.title.toLowerCase().includes(query.toLowerCase()) ||
              item.description.toLowerCase().includes(query.toLowerCase())
          );
        },
        render: () => {
          let component: ReactRenderer | null = null;
          let popupEl: HTMLDivElement | null = null;

          return {
            onStart: (props: SuggestionProps) => {
              component = new ReactRenderer(SlashCommandsList, {
                props,
                editor: props.editor,
              });

              popupEl = document.createElement('div');
              popupEl.classList.add('slash-commands-popup');
              document.body.appendChild(popupEl);
              popupEl.appendChild(component.element);

              const rect = props.clientRect?.();
              if (rect && popupEl) {
                popupEl.style.position = 'fixed';
                popupEl.style.left = `${rect.left}px`;
                popupEl.style.top = `${rect.bottom + 4}px`;
                popupEl.style.zIndex = '99999';
              }
            },

            onUpdate: (props: SuggestionProps) => {
              component?.updateProps(props);
              const rect = props.clientRect?.();
              if (rect && popupEl) {
                popupEl.style.left = `${rect.left}px`;
                popupEl.style.top = `${rect.bottom + 4}px`;
              }
            },

            onKeyDown: (props: { event: KeyboardEvent }) => {
              if (props.event.key === 'Escape') {
                popupEl?.remove();
                popupEl = null;
                component?.destroy();
                component = null;
                return true;
              }
              return (component?.ref as any)?.onKeyDown?.(props) ?? false;
            },

            onExit: () => {
              popupEl?.remove();
              popupEl = null;
              component?.destroy();
              component = null;
            },
          };
        },
      }),
    ];
  },
});
