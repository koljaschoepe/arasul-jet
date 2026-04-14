import React, { memo, useEffect, useRef, useState, useCallback } from 'react';
import DOMPurify from 'dompurify';

let mermaidInstance: typeof import('mermaid').default | null = null;
let mermaidLoading: Promise<typeof import('mermaid').default> | null = null;

function getCssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

async function getMermaid() {
  if (mermaidInstance) return mermaidInstance;
  if (!mermaidLoading) {
    mermaidLoading = import('mermaid').then(m => {
      mermaidInstance = m.default;
      // Read theme colors from CSS custom properties for design system consistency
      const primary = getCssVar('--primary', '#45ADFF');
      const foreground = getCssVar('--foreground', '#F8FAFC');
      const border = getCssVar('--border', '#2A3544');
      const muted = getCssVar('--muted-foreground', '#94A3B8');
      const card = getCssVar('--card', '#1A2330');
      const background = getCssVar('--background', '#101923');
      const cardAlt = getCssVar('--muted', '#222D3D');

      mermaidInstance.initialize({
        startOnLoad: false,
        theme: 'dark',
        themeVariables: {
          primaryColor: primary,
          primaryTextColor: foreground,
          primaryBorderColor: border,
          lineColor: muted,
          secondaryColor: card,
          tertiaryColor: cardAlt,
          background,
          mainBkg: card,
          secondBkg: cardAlt,
          textColor: foreground,
          nodeTextColor: foreground,
          edgeLabelBackground: card,
          errorBkgColor: 'rgba(239, 68, 68, 0.1)',
          errorTextColor: '#EF4444',
        },
        securityLevel: 'strict',
        fontFamily: 'inherit',
      });
      return mermaidInstance;
    });
  }
  return mermaidLoading;
}

let diagramCounter = 0;
const generateId = () => `mermaid-diagram-${++diagramCounter}`;

interface MermaidDiagramProps {
  content: string;
}

const MermaidDiagram = memo(function MermaidDiagram({ content }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const idRef = useRef(generateId());

  const renderDiagram = useCallback(async () => {
    if (!content || !containerRef.current) return;

    const diagramCode = String(content).trim();

    if (!diagramCode) {
      setError('Empty diagram content');
      setLoading(false);
      return;
    }

    try {
      setError(null);
      setLoading(true);

      const mermaid = await getMermaid();

      const isValid = await mermaid.parse(diagramCode);

      if (!isValid) {
        setError('Invalid Mermaid syntax');
        setLoading(false);
        return;
      }

      const { svg: renderedSvg } = await mermaid.render(idRef.current, diagramCode);
      const sanitizedSvg = DOMPurify.sanitize(renderedSvg, { USE_PROFILES: { svg: true } });
      setSvg(sanitizedSvg);
      setLoading(false);
    } catch (err: unknown) {
      console.error('Mermaid rendering error:', err);
      setError(err instanceof Error ? err.message : 'Failed to render diagram');
      setSvg(null);
      setLoading(false);
    }
  }, [content]);

  useEffect(() => {
    renderDiagram();
  }, [renderDiagram]);

  if (loading && !svg && !error) {
    return (
      <div className="mermaid-container" style={{ padding: '1rem', opacity: 0.5 }}>
        Diagramm wird geladen...
      </div>
    );
  }

  if (error) {
    return (
      <div className="mermaid-error">
        <span>Diagramm-Fehler: {error}</span>
        <code>
          {String(content).slice(0, 200)}
          {String(content).length > 200 ? '...' : ''}
        </code>
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
