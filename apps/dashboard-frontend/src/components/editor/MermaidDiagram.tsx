import React, { memo, useEffect, useRef, useState, useCallback } from 'react';
import DOMPurify from 'dompurify';

let mermaidInstance: typeof import('mermaid').default | null = null;
let mermaidLoading: Promise<typeof import('mermaid').default> | null = null;

async function getMermaid() {
  if (mermaidInstance) return mermaidInstance;
  if (!mermaidLoading) {
    mermaidLoading = import('mermaid').then(m => {
      mermaidInstance = m.default;
      mermaidInstance.initialize({
        startOnLoad: false,
        theme: 'dark',
        themeVariables: {
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
