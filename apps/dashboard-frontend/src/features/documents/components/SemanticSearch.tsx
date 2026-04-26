import { Cpu, Search, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';

interface SearchResult {
  document_name?: string;
  chunk_text?: string;
  score?: number;
  [key: string]: unknown;
}

interface SearchResults {
  query?: string;
  results: SearchResult[];
}

interface SemanticSearchProps {
  query: string;
  setQuery: (q: string) => void;
  searching: boolean;
  results: SearchResults | null;
  onSearch: () => void;
  onClear: () => void;
}

/**
 * SemanticSearch — Search bar plus result panel for semantic-similarity
 * search across all documents. Stateless: receives state from
 * useDocumentActions via props.
 */
export default function SemanticSearch({
  query,
  setQuery,
  searching,
  results,
  onSearch,
  onClear,
}: SemanticSearchProps) {
  return (
    <section className="mb-6" aria-label="Semantische Suche">
      <div
        className="flex items-center bg-[var(--gradient-card)] border border-border rounded-md py-2 px-4 gap-3"
        role="search"
      >
        <Cpu className="text-primary text-xl shrink-0" aria-hidden="true" size={20} />
        <input
          type="search"
          className="flex-1 bg-transparent border-none text-foreground text-sm py-2 placeholder:text-muted-foreground focus:outline-none"
          placeholder="Semantische Suche in allen Dokumenten..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSearch()}
          aria-label="Semantische Suche in Dokumenten"
        />
        <Button
          onClick={onSearch}
          disabled={searching || !query.trim()}
          aria-label={searching ? 'Suche läuft...' : 'Suchen'}
        >
          {searching ? (
            <RefreshCw className="animate-spin" aria-hidden="true" size={16} />
          ) : (
            <Search aria-hidden="true" size={16} />
          )}
        </Button>
      </div>

      {results && (
        <div
          className="bg-[var(--gradient-card)] border border-border rounded-md mt-4 overflow-hidden"
          role="region"
          aria-label="Suchergebnisse"
          aria-live="polite"
        >
          <div className="flex justify-between items-center py-3 px-4 border-b border-[var(--border-table)]">
            <h4 id="search-results-title">Suchergebnisse für &quot;{results.query}&quot;</h4>
            <button
              type="button"
              onClick={onClear}
              aria-label="Suchergebnisse schließen"
              className="bg-transparent border-none text-muted-foreground cursor-pointer hover:text-foreground"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
          {results.results.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-muted-foreground">Keine Ergebnisse gefunden</p>
              <p className="text-muted-foreground/60 text-xs mt-1">Versuche andere Suchbegriffe</p>
            </div>
          ) : (
            <ul className="max-h-[300px] overflow-y-auto" aria-labelledby="search-results-title">
              {results.results.map((result, idx) => (
                <li key={idx} className="py-3 px-4 border-b border-border/50 last:border-b-0">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-primary font-medium">{result.document_name}</span>
                    <span
                      className="bg-primary/10 text-primary py-0.5 px-2 rounded-xs text-xs"
                      aria-label={`Relevanz: ${((result.score ?? 0) * 100).toFixed(0)} Prozent`}
                    >
                      {((result.score ?? 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-muted-foreground text-sm leading-snug m-0">
                    {result.chunk_text}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
