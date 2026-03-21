import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Terminal,
  Send,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  Trash2,
  Info,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from 'lucide-react';
import { formatDate } from '../../utils/formatting';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';

interface HistoryItem {
  id: number;
  query: string;
  status: 'completed' | 'error' | 'timeout';
  created_at: string;
  response_time_ms?: number;
}

interface Stats {
  tokens: number;
  time: number;
}

function ClaudeTerminal() {
  const api = useApi();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [includeContext, setIncludeContext] = useState(true);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const responseRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    checkStatus();
    loadHistory();
  }, []);

  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [response]);

  const checkStatus = async () => {
    try {
      const data = await api.get('/claude-terminal/status', { showError: false });
      setStatus(data);
    } catch {
      setStatus({ available: false, error: 'Could not check service status' });
    }
  };

  const loadHistory = async () => {
    try {
      const data = await api.get('/claude-terminal/history?limit=10', { showError: false });
      setHistory(data.queries || []);
    } catch {
      toast.error('Verlauf konnte nicht geladen werden');
    }
  };

  const clearHistory = async () => {
    try {
      await api.del('/claude-terminal/history', { showError: false });
      setHistory([]);
      toast.success('Verlauf gelöscht');
    } catch {
      toast.error('Verlauf konnte nicht gelöscht werden');
    }
  };

  const copyResponse = useCallback(async () => {
    if (!response) return;
    try {
      await navigator.clipboard.writeText(response);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (insecure context)
    }
  }, [response]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || actionLoading) return;

    setActionLoading(true);
    setResponse('');
    setError(null);
    setStats(null);

    try {
      const res = await api.post(
        '/claude-terminal/query',
        {
          query: query.trim(),
          includeContext,
        },
        { raw: true, showError: false }
      );

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'content') {
                setResponse(prev => prev + data.content);
              } else if (data.type === 'complete') {
                setStats({ tokens: data.totalTokens, time: data.responseTimeMs });
              } else if (data.type === 'error') {
                setError(data.message || data.error);
              } else if (data.done) {
                setActionLoading(false);
                loadHistory();
              }
            } catch {
              // Skip non-JSON lines
            }
          }
        }
      }
    } catch (err: any) {
      setError(err.data?.error || err.message || 'Network error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const isAvailable = status?.available;

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h1 className="settings-section-title">Claude Terminal</h1>
        <p className="settings-section-description">
          Freie Textanfragen an das lokale LLM mit automatischem System-Kontext
        </p>
      </div>

      <div className="settings-cards">
        {/* Status Card */}
        <div className="settings-card">
          <div className="settings-card-header">
            <div className="flex items-center justify-between">
              <h3 className="settings-card-title">
                <Terminal style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                Service Status
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={checkStatus}
                title="Status aktualisieren"
              >
                <RefreshCw className="size-4" />
              </Button>
            </div>
            <p className="settings-card-description">
              {status?.llm?.available
                ? `LLM verfügbar (${status.config?.defaultModel || 'unknown'})`
                : 'LLM Service prüfen...'}
            </p>
          </div>
          <div className="settings-card-body">
            <div className="flex flex-wrap gap-4 max-md:flex-col">
              <div
                className={cn(
                  'flex items-center gap-2 py-2 px-4 border border-border/50 rounded-md text-sm',
                  isAvailable
                    ? 'bg-[var(--status-neutral-bg)] border-[var(--status-neutral-border)] text-[var(--status-neutral)]'
                    : 'bg-destructive/10 border-destructive/30 text-destructive'
                )}
              >
                {isAvailable ? (
                  <CheckCircle className="size-4" />
                ) : (
                  <AlertCircle className="size-4" />
                )}
                <span>{isAvailable ? 'Online' : 'Offline'}</span>
              </div>
              {status?.config && (
                <>
                  <div className="flex items-center gap-2 py-2 px-4 bg-primary/5 border border-border/50 rounded-md text-sm text-muted-foreground [&>svg]:text-primary">
                    <Clock className="size-4" />
                    <span>Timeout: {formatTime(status.config.defaultTimeout)}</span>
                  </div>
                  <div className="flex items-center gap-2 py-2 px-4 bg-primary/5 border border-border/50 rounded-md text-sm text-muted-foreground [&>svg]:text-primary">
                    <Info className="size-4" />
                    <span>Rate: {status.config.rateLimit}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Main Terminal Card */}
        <div className="settings-card border-primary/30">
          <div className="settings-card-header">
            <h3 className="settings-card-title">Terminal</h3>
            <p className="settings-card-description">
              Stelle Fragen zum System, analysiere Logs oder lass dir bei Problemen helfen
            </p>
          </div>
          <div className="settings-card-body">
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex gap-3 items-end max-md:flex-col">
                <textarea
                  ref={inputRef}
                  className="flex-1 p-4 bg-muted border-2 border-border/50 rounded-lg text-foreground font-mono text-sm leading-relaxed resize-none transition-all duration-300 min-h-[60px] focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus:bg-card placeholder:text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="z.B. 'Wie ist der aktuelle Systemstatus?' oder 'Zeige mir die letzten Fehler in den Logs'"
                  disabled={actionLoading || !isAvailable}
                  rows={2}
                />
                <Button
                  type="submit"
                  size="lg"
                  className="shrink-0 min-h-[60px] px-5 max-md:w-full max-md:min-h-[48px]"
                  disabled={!query.trim() || actionLoading || !isAvailable}
                >
                  {actionLoading ? (
                    <RefreshCw className="size-5 animate-spin" />
                  ) : (
                    <Send className="size-5" />
                  )}
                </Button>
              </div>
              <div className="flex items-center">
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeContext}
                    onChange={e => setIncludeContext(e.target.checked)}
                    className="size-4 accent-primary cursor-pointer"
                  />
                  <span>System-Kontext einbeziehen (Metriken, Logs, Services)</span>
                </label>
              </div>
            </form>

            {error && (
              <div className="flex items-center gap-3 p-4 bg-destructive/10 border-2 border-destructive/30 rounded-lg text-destructive text-sm mt-4 animate-[slideInDown_0.3s_ease]">
                <AlertCircle className="size-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {(response || actionLoading) && (
              <div className="mt-6 border border-border/50 rounded-lg overflow-hidden animate-[fadeIn_0.3s_ease]">
                <div className="flex items-center justify-between py-3 px-4 bg-primary/5 border-b border-border/50">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {actionLoading ? 'Generiere Antwort...' : 'Antwort'}
                  </span>
                  {response && !actionLoading && (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={copyResponse}
                      title="Antwort kopieren"
                    >
                      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    </Button>
                  )}
                </div>
                <div
                  ref={responseRef}
                  className={cn(
                    'p-5 bg-muted text-foreground font-mono text-sm leading-[1.7] whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto max-md:max-h-[300px] max-md:text-sm max-md:p-4',
                    actionLoading && 'min-h-[60px]'
                  )}
                >
                  {response ||
                    (actionLoading && (
                      <span className="animate-[blink_1s_infinite] text-primary">▊</span>
                    ))}
                </div>
                {stats && (
                  <div className="flex items-center gap-3 py-3 px-4 bg-primary/5 border-t border-border/50 text-xs text-muted-foreground">
                    <span>{stats.tokens} Tokens</span>
                    <span>&bull;</span>
                    <span>{formatTime(stats.time)}</span>
                  </div>
                )}
              </div>
            )}

            {!isAvailable && status && (
              <div className="flex items-start gap-4 p-6 bg-amber-500/10 border-2 border-amber-500/30 rounded-lg mt-4 max-sm:flex-col max-sm:p-5">
                <AlertCircle className="size-6 text-amber-500 shrink-0 mt-1" />
                <div>
                  <strong className="block text-amber-500 mb-2">LLM Service nicht verfügbar</strong>
                  <p className="text-muted-foreground text-sm m-0 mb-4">
                    Der LLM Service startet möglicherweise gerade. Bitte versuchen Sie es in einigen
                    Momenten erneut.
                  </p>
                  <Button variant="outline" size="sm" onClick={checkStatus}>
                    <RefreshCw className="size-4" />
                    Status erneut prüfen
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* History Card */}
        <div className="settings-card">
          <div
            className="settings-card-header cursor-pointer flex items-center justify-between hover:bg-primary/5"
            onClick={() => setShowHistory(!showHistory)}
          >
            <div>
              <h3 className="settings-card-title">Verlauf</h3>
              <p className="settings-card-description">
                {history.length} {history.length === 1 ? 'Anfrage' : 'Anfragen'} gespeichert
              </p>
            </div>
            <div className="flex items-center gap-3">
              {history.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={e => {
                    e.stopPropagation();
                    clearHistory();
                  }}
                  title="Verlauf löschen"
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
              {showHistory ? (
                <ChevronUp className="size-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-4 text-muted-foreground" />
              )}
            </div>
          </div>
          {showHistory && (
            <div className="settings-card-body">
              {history.length === 0 ? (
                <div className="text-center p-4">
                  <p className="text-muted-foreground text-sm">Noch keine Anfragen gestellt</p>
                  <p className="text-muted-foreground/60 text-xs mt-1">
                    Versuche eine Anfrage wie &bdquo;Wie ist der aktuelle Systemstatus?&ldquo;
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {history.map(item => (
                    <div
                      key={item.id}
                      className="p-3.5 bg-primary/5 border border-border/50 rounded-lg cursor-pointer transition-all duration-200 hover:bg-primary/[0.08] hover:border-primary/30 hover:translate-x-1 max-sm:p-3"
                      onClick={() => {
                        setQuery(item.query);
                        inputRef.current?.focus();
                      }}
                    >
                      <div className="font-mono text-sm text-foreground mb-2 max-sm:text-xs">
                        {item.query.length > 80 ? item.query.substring(0, 80) + '...' : item.query}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap max-md:gap-2">
                        <span
                          className={cn(
                            'flex items-center gap-1 uppercase tracking-wide font-medium',
                            item.status === 'completed' && 'text-[var(--status-neutral)]',
                            item.status === 'error' && 'text-destructive',
                            item.status === 'timeout' && 'text-amber-500'
                          )}
                        >
                          {item.status === 'completed' && <CheckCircle className="size-3.5" />}
                          {item.status === 'error' && <AlertCircle className="size-3.5" />}
                          {item.status === 'timeout' && <Clock className="size-3.5" />}
                          {item.status}
                        </span>
                        <span>{formatDate(item.created_at)}</span>
                        {item.response_time_ms && <span>{formatTime(item.response_time_ms)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tips Card */}
        <div className="settings-card">
          <div className="settings-card-header">
            <h3 className="settings-card-title">Beispiel-Anfragen</h3>
            <p className="settings-card-description">Probieren Sie diese Anfragen aus</p>
          </div>
          <div className="settings-card-body">
            <div className="flex flex-wrap gap-3 max-md:flex-col">
              {[
                'Wie ist der aktuelle Systemstatus?',
                'Gibt es kritische Fehler in den Logs?',
                'Welche Services sind offline?',
                'Analysiere die CPU- und RAM-Auslastung',
              ].map((example, index) => (
                <button
                  key={index}
                  type="button"
                  className="py-2.5 px-4 bg-primary/5 border border-primary/20 rounded-full text-muted-foreground text-sm cursor-pointer transition-all duration-200 hover:enabled:bg-primary/[0.12] hover:enabled:border-primary hover:enabled:text-primary hover:enabled:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed max-md:w-full max-md:text-center"
                  onClick={() => {
                    setQuery(example);
                    inputRef.current?.focus();
                  }}
                  disabled={actionLoading}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ClaudeTerminal;
