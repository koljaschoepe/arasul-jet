/**
 * MermaidNode — TipTap extension that adds a custom NodeView for
 * code blocks with language="mermaid". Uses ReactNodeViewRenderer to
 * render MermaidNodeView with live diagram preview.
 *
 * Non-mermaid code blocks also get a NodeView with a language label.
 */

import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { ReactNodeViewRenderer } from '@tiptap/react';
import MermaidNodeView from './MermaidNodeView';

export const MermaidCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeView);
  },
});
