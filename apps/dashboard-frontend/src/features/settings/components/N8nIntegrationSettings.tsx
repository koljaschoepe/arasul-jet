import { useMemo, useState } from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Zap, Download, Copy, Check, Cpu, Key, Globe } from 'lucide-react';
import { renderN8nDoc } from '../n8n-template';
import { useN8nIntegrationData } from '../hooks/useN8nIntegrationData';
import { Skeleton } from '../../../components/ui/Skeleton';
import { cn } from '@/lib/utils';

const remarkPlugins = [remarkGfm];

// react-markdown component overrides — keep styling local to this view so we
// don't need a global @tailwindcss/typography dependency. Each element maps
// to plain Tailwind utility classes that match the rest of the dashboard.
type AnchorProps = ComponentPropsWithoutRef<'a'>;
type CodeProps = ComponentPropsWithoutRef<'code'> & { inline?: boolean };

const markdownComponents = {
  h1: (props: ComponentPropsWithoutRef<'h1'>) => (
    <h1 className="text-xl font-bold text-foreground mt-6 mb-3" {...props} />
  ),
  h2: (props: ComponentPropsWithoutRef<'h2'>) => (
    <h2
      className="text-lg font-semibold text-foreground mt-6 mb-2 pt-4 border-t border-border first:border-t-0 first:pt-0"
      {...props}
    />
  ),
  h3: (props: ComponentPropsWithoutRef<'h3'>) => (
    <h3 className="text-sm font-semibold text-foreground mt-4 mb-2" {...props} />
  ),
  p: (props: ComponentPropsWithoutRef<'p'>) => (
    <p className="text-sm text-muted-foreground my-2 leading-relaxed" {...props} />
  ),
  ul: (props: ComponentPropsWithoutRef<'ul'>) => (
    <ul className="text-sm text-muted-foreground list-disc pl-5 my-2 space-y-1" {...props} />
  ),
  ol: (props: ComponentPropsWithoutRef<'ol'>) => (
    <ol className="text-sm text-muted-foreground list-decimal pl-5 my-2 space-y-1" {...props} />
  ),
  li: (props: ComponentPropsWithoutRef<'li'>) => <li className="leading-relaxed" {...props} />,
  table: (props: ComponentPropsWithoutRef<'table'>) => (
    <div className="my-3 overflow-x-auto border border-border rounded-lg">
      <table className="w-full text-xs" {...props} />
    </div>
  ),
  thead: (props: ComponentPropsWithoutRef<'thead'>) => <thead className="bg-muted/50" {...props} />,
  th: (props: ComponentPropsWithoutRef<'th'>) => (
    <th
      className="text-left font-semibold text-foreground px-3 py-2 border-b border-border"
      {...props}
    />
  ),
  td: (props: ComponentPropsWithoutRef<'td'>) => (
    <td
      className="text-muted-foreground px-3 py-2 border-b border-border/50 last:border-b-0"
      {...props}
    />
  ),
  hr: () => <hr className="my-6 border-border" />,
  blockquote: (props: ComponentPropsWithoutRef<'blockquote'>) => (
    <blockquote
      className="border-l-2 border-primary/40 pl-4 my-3 text-sm text-muted-foreground italic"
      {...props}
    />
  ),
  a: ({ children, ...props }: AnchorProps) => (
    <a
      className="text-primary hover:underline"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  pre: (props: ComponentPropsWithoutRef<'pre'>) => (
    <pre
      className="bg-muted/40 border border-border rounded p-3 font-mono text-xs overflow-x-auto whitespace-pre my-3"
      {...props}
    />
  ),
  code: ({ inline, className, children, ...props }: CodeProps) => {
    if (inline) {
      return (
        <code
          className={cn(
            'font-mono text-xs bg-muted/50 text-foreground px-1.5 py-0.5 rounded',
            className
          )}
          {...props}
        >
          {children}
        </code>
      );
    }
    // block code is rendered inside <pre> — strip the default whitespace
    return (
      <code className={cn('font-mono text-xs', className)} {...props}>
        {children}
      </code>
    );
  },
  strong: (props: ComponentPropsWithoutRef<'strong'>) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
};

function StatusTile({
  icon,
  label,
  value,
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'default' | 'amber' | 'muted';
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 p-3 rounded-lg border border-border/50',
        tone === 'amber' && 'border-amber-500/30 bg-amber-500/5'
      )}
    >
      <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span
        className={cn(
          'text-sm font-mono break-all',
          tone === 'muted' ? 'text-muted-foreground italic' : 'text-foreground font-semibold'
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function N8nIntegrationSettings() {
  const { data, isLoading } = useN8nIntegrationData();
  const [copied, setCopied] = useState(false);

  const markdown = useMemo(() => renderN8nDoc(data), [data]);

  const handleDownload = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arasul-n8n-integration-${data.generatedAt}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard might be denied — fall back to a no-op; the download
      // button is the reliable path
    }
  };

  return (
    <div className="animate-in fade-in">
      <div className="mb-8 pb-6 border-b border-border">
        <h1 className="text-2xl font-bold text-foreground mb-2 flex items-center gap-2">
          <Zap className="size-6 text-primary" />
          n8n Integration
        </h1>
        <p className="text-sm text-muted-foreground">
          Live-Anleitung mit allen Endpoints und Credentials zum Einbinden in n8n. Alle Werte sind
          aus dem laufenden System gelesen — beim Re-Open des Tabs aktualisieren sie sich.
        </p>
      </div>

      {/* Live status tiles */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">Live-Stack</h3>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StatusTile
              icon={<Cpu className="size-3.5" />}
              label="Aktives Modell"
              value={data.activeModel || data.defaultModel || 'Kein Modell geladen'}
              tone={data.activeModel ? 'default' : 'muted'}
            />
            <StatusTile
              icon={<Globe className="size-3.5" />}
              label="OpenAI-Base-URL für n8n"
              value={`${data.internalBackendUrl}/v1`}
            />
            <StatusTile
              icon={<Key className="size-3.5" />}
              label="Aktiver API-Key"
              value={
                data.latestKeyPrefix
                  ? `${data.latestKeyPrefix}…`
                  : 'Noch kein Key — unter Sicherheit anlegen'
              }
              tone={data.latestKeyPrefix ? 'default' : 'amber'}
            />
            <StatusTile
              icon={<Cpu className="size-3.5" />}
              label="Embedding-Dimension"
              value={`BGE-M3 · ${data.embeddingDim}-dim`}
            />
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium transition-colors"
        >
          <Download className="size-4" />
          Markdown herunterladen
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-background hover:bg-muted text-foreground rounded-md text-sm font-medium transition-colors"
        >
          {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
          {copied ? 'Kopiert' : 'In Zwischenablage'}
        </button>
      </div>

      {/* Rendered markdown */}
      <div className="border border-border rounded-lg p-6 bg-background">
        <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
          {markdown}
        </ReactMarkdown>
      </div>
    </div>
  );
}

export default N8nIntegrationSettings;
