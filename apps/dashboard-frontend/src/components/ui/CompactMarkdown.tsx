/**
 * Kompakte Markdown-Darstellung — geteilt von der Chat-Nachricht (rechtes
 * Panel) und der Skill-Lauf-Karte (Plan 011, Schritt 19).
 *
 * Bewusst dichter als die klassische Chat-Ansicht: kleinere Schrift,
 * eingedampfte Überschriften (nur Gewicht/Farbe differenziert), Codeblöcke
 * als Karte mit Kopierknopf und horizontalem Scroll statt Umbruch. Weil zwei
 * Features (workspace-Chat und skills) dieselbe Darstellung brauchen, liegt die
 * Komponente hier in `components/ui/` und nicht mehr in einem Feature-Ordner.
 */
import { useCallback, useState, type ComponentProps, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';

const remarkPlugins = [remarkGfm];

function CodeBlock({ className, children }: { className?: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const language = /language-(\w+)/.exec(className || '')?.[1];
  const text = String(children ?? '').replace(/\n$/, '');

  const copy = useCallback(() => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }, [text]);

  return (
    <div className="my-2 overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
          aria-label="Code kopieren"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? 'Kopiert' : 'Kopieren'}
        </button>
      </div>
      <pre className="m-0 overflow-x-auto px-2.5 pb-2.5 text-xs leading-relaxed">
        <code>{text}</code>
      </pre>
    </div>
  );
}

/** Inline- vs. Block-Code unterscheiden (react-markdown v9: kein `inline`-Flag mehr). */
function Code({ className, children, ...props }: ComponentProps<'code'>) {
  const isBlock = /language-/.test(className || '') || String(children ?? '').includes('\n');
  if (isBlock) {
    return <CodeBlock className={className}>{children}</CodeBlock>;
  }
  return (
    <code
      className="rounded bg-card px-1 py-px text-[0.85em] text-foreground border border-border"
      {...props}
    >
      {children}
    </code>
  );
}

const components = {
  h1: ({ children, ...p }: ComponentProps<'h1'>) => (
    <h3 className="mb-1 mt-3 text-sm font-semibold text-foreground" {...p}>
      {children}
    </h3>
  ),
  h2: ({ children, ...p }: ComponentProps<'h2'>) => (
    <h4 className="mb-1 mt-3 text-sm font-semibold text-foreground" {...p}>
      {children}
    </h4>
  ),
  h3: ({ children, ...p }: ComponentProps<'h3'>) => (
    <h5 className="mb-1 mt-2.5 text-[13px] font-semibold text-foreground" {...p}>
      {children}
    </h5>
  ),
  h4: ({ children, ...p }: ComponentProps<'h4'>) => (
    <h6 className="mb-1 mt-2 text-[13px] font-medium text-foreground" {...p}>
      {children}
    </h6>
  ),
  p: (p: ComponentProps<'p'>) => <p className="my-1.5 leading-relaxed" {...p} />,
  ul: (p: ComponentProps<'ul'>) => <ul className="my-1.5 list-disc pl-4 space-y-0.5" {...p} />,
  ol: (p: ComponentProps<'ol'>) => <ol className="my-1.5 list-decimal pl-4 space-y-0.5" {...p} />,
  li: (p: ComponentProps<'li'>) => <li className="leading-relaxed" {...p} />,
  a: ({ children, ...p }: ComponentProps<'a'>) => (
    <a
      className="text-primary underline-offset-2 hover:underline"
      target="_blank"
      rel="noopener noreferrer"
      {...p}
    >
      {children}
    </a>
  ),
  blockquote: (p: ComponentProps<'blockquote'>) => (
    <blockquote className="my-1.5 border-l-2 border-border pl-2.5 text-muted-foreground" {...p} />
  ),
  table: (p: ComponentProps<'table'>) => (
    <div className="my-2 overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-xs" {...p} />
    </div>
  ),
  th: (p: ComponentProps<'th'>) => (
    <th className="border-b border-border bg-card px-2 py-1 text-left font-medium" {...p} />
  ),
  td: (p: ComponentProps<'td'>) => <td className="border-b border-border px-2 py-1" {...p} />,
  hr: () => <hr className="my-3 border-border" />,
  code: Code,
  pre: ({ children }: ComponentProps<'pre'>) => <>{children}</>,
};

export function CompactMarkdown({ content }: { content: string }) {
  return (
    <div className="text-[13px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
