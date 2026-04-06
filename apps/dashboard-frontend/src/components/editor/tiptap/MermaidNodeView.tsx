/**
 * MermaidNodeView — React component rendered inside a TipTap NodeView
 * for code blocks with language "mermaid". Shows editable source above
 * and a live diagram preview below.
 */

import { useState, useEffect, useCallback } from 'react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import MermaidDiagram from '../MermaidDiagram';

export default function MermaidNodeView({ node, updateAttributes }: NodeViewProps) {
  const language: string = node.attrs.language ?? '';
  const isMermaid = language === 'mermaid';
  const [showPreview, setShowPreview] = useState(true);

  // Get text content from the node
  const textContent = node.textContent ?? '';

  if (!isMermaid) {
    // Fallback: render as normal code block with language label
    return (
      <NodeViewWrapper className="tiptap-codeblock-wrapper">
        <pre>
          {language && <div className="tiptap-codeblock-lang">{language}</div>}
          <NodeViewContent />
        </pre>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="tiptap-mermaid-wrapper" data-type="mermaid">
      {/* Header with toggle */}
      <div className="tiptap-mermaid-header" contentEditable={false}>
        <span className="tiptap-mermaid-label">Mermaid Diagramm</span>
        <button
          type="button"
          className="tiptap-mermaid-toggle"
          onClick={() => setShowPreview(!showPreview)}
        >
          {showPreview ? 'Vorschau ausblenden' : 'Vorschau anzeigen'}
        </button>
      </div>

      {/* Editable code area */}
      <pre className="tiptap-mermaid-code">
        <NodeViewContent />
      </pre>

      {/* Live preview */}
      {showPreview && textContent.trim() && (
        <div className="tiptap-mermaid-preview" contentEditable={false}>
          <MermaidDiagram content={textContent} />
        </div>
      )}
    </NodeViewWrapper>
  );
}
