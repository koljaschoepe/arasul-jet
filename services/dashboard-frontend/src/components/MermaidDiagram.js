/**
 * MermaidDiagram Component
 * Renders Mermaid diagrams from markdown code blocks
 */

import React, { memo, useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';
import DOMPurify from 'dompurify';

// Initialize mermaid with dark theme settings
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    // Match design system colors
    primaryColor: '#45ADFF',
    primaryTextColor: '#F8FAFC',
    primaryBorderColor: '#2A3544',
    lineColor: '#94A3B8',
    secondaryColor: '#1A2330',
    tertiaryColor: '#222D3D',
    background: '#101923',
    mainBkg: '#1A2330',
    secondBkg: '#222D3D',
    textColor: '#F8FAFC',
    nodeTextColor: '#F8FAFC',
    edgeLabelBackground: '#1A2330',
    // Error colors
    errorBkgColor: 'rgba(239, 68, 68, 0.1)',
    errorTextColor: '#EF4444',
  },
  securityLevel: 'strict',
  fontFamily: 'inherit',
});

// Generate unique IDs for diagrams
let diagramCounter = 0;
const generateId = () => `mermaid-diagram-${++diagramCounter}`;

const MermaidDiagram = memo(function MermaidDiagram({ content }) {
  const containerRef = useRef(null);
  const [error, setError] = useState(null);
  const [svg, setSvg] = useState(null);
  const idRef = useRef(generateId());

  const renderDiagram = useCallback(async () => {
    if (!content || !containerRef.current) return;

    // Clean up the content - remove leading/trailing whitespace
    const diagramCode = String(content).trim();

    if (!diagramCode) {
      setError('Empty diagram content');
      return;
    }

    try {
      setError(null);

      // Validate the diagram syntax first
      const isValid = await mermaid.parse(diagramCode);

      if (!isValid) {
        setError('Invalid Mermaid syntax');
        return;
      }

      // Render the diagram
      const { svg: renderedSvg } = await mermaid.render(idRef.current, diagramCode);
      // Sanitize SVG to prevent XSS attacks
      const sanitizedSvg = DOMPurify.sanitize(renderedSvg, { USE_PROFILES: { svg: true } });
      setSvg(sanitizedSvg);
    } catch (err) {
      console.error('Mermaid rendering error:', err);
      setError(err.message || 'Failed to render diagram');
      setSvg(null);
    }
  }, [content]);

  useEffect(() => {
    renderDiagram();
  }, [renderDiagram]);

  if (error) {
    return (
      <div className="mermaid-error">
        <span>Diagramm-Fehler: {error}</span>
        <code>{String(content).slice(0, 200)}{String(content).length > 200 ? '...' : ''}</code>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-container"
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
});

export default MermaidDiagram;
