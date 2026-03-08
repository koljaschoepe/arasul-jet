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
              <button
                type="button"
                className="bg-transparent border border-[var(--border-subtle)] rounded-md p-2 text-[var(--text-muted)] cursor-pointer transition-all duration-200 flex items-center justify-center hover:bg-[var(--primary-alpha-10)] hover:border-[var(--primary-color)] hover:text-[var(--primary-color)]"
                onClick={checkStatus}
                title="Status aktualisieren"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
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
                  'flex items-center gap-2 py-2 px-4 border border-[var(--border-subtle)] rounded-md text-sm',
                  isAvailable
                    ? 'bg-[var(--status-neutral-bg)] border-[var(--status-neutral-border)] text-[var(--status-neutral)]'
                    : 'bg-[rgba(239,68,68,0.1)] border-[rgba(239,68,68,0.3)] text-[var(--error-color)]'
                )}
              >
                {isAvailable ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                <span>{isAvailable ? 'Online' : 'Offline'}</span>
              </div>
              {status?.config && (
                <>
                  <div className="flex items-center gap-2 py-2 px-4 bg-[var(--primary-alpha-5)] border border-[var(--border-subtle)] rounded-md text-sm text-[var(--text-secondary)] [&>svg]:text-[var(--primary-color)]">
                    <Clock className="w-4 h-4" />
                    <span>Timeout: {formatTime(status.config.defaultTimeout)}</span>
                  </div>
                  <div className="flex items-center gap-2 py-2 px-4 bg-[var(--primary-alpha-5)] border border-[var(--border-subtle)] rounded-md text-sm text-[var(--text-secondary)] [&>svg]:text-[var(--primary-color)]">
                    <Info className="w-4 h-4" />
                    <span>Rate: {status.config.rateLimit}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Main Terminal Card */}
        <div className="settings-card border-[var(--border-glow)]">
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
                  className="flex-1 p-4 bg-[var(--bg-elevated)] border-2 border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] font-mono text-sm leading-relaxed resize-none transition-all duration-300 min-h-[60px] focus:outline-none focus:border-[var(--primary-color)] focus:bg-[var(--bg-card)] focus:shadow-[0_0_0_3px_var(--primary-alpha-10)] placeholder:text-[var(--text-muted)] disabled:opacity-50 disabled:cursor-not-allowed"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="z.B. 'Wie ist der aktuelle Systemstatus?' oder 'Zeige mir die letzten Fehler in den Logs'"
                  disabled={actionLoading || !isAvailable}
                  rows={2}
                />
                <button
                  type="submit"
                  className="p-4 px-5 bg-[var(--gradient-primary)] border-none rounded-lg text-white cursor-pointer transition-all duration-300 flex items-center justify-center text-xl shadow-[var(--shadow-md)] shrink-0 min-h-[60px] hover:enabled:-translate-y-0.5 hover:enabled:shadow-[var(--shadow-lg)] disabled:opacity-50 disabled:cursor-not-allowed max-md:w-full max-md:min-h-[48px]"
                  disabled={!query.trim() || actionLoading || !isAvailable}
                >
                  {actionLoading ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
              <div className="flex items-center">
                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeContext}
                    onChange={e => setIncludeContext(e.target.checked)}
                    className="w-4 h-4 accent-[var(--primary-color)] cursor-pointer"
                  />
                  <span>System-Kontext einbeziehen (Metriken, Logs, Services)</span>
                </label>
              </div>
            </form>

            {error && (
              <div className="flex items-center gap-3 p-4 bg-[rgba(239,68,68,0.1)] border-2 border-[rgba(239,68,68,0.3)] rounded-lg text-[var(--error-color)] text-sm mt-4 animate-[slideInDown_0.3s_ease]">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {(response || actionLoading) && (
              <div className="mt-6 border border-[var(--border-subtle)] rounded-lg overflow-hidden animate-[fadeIn_0.3s_ease]">
                <div className="flex items-center justify-between py-3 px-4 bg-[var(--primary-alpha-5)] border-b border-[var(--border-subtle)]">
                  <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                    {actionLoading ? 'Generiere Antwort...' : 'Antwort'}
                  </span>
                  {response && !actionLoading && (
                    <button
                      type="button"
                      className="bg-transparent border border-[var(--border-subtle)] rounded py-1.5 px-2 text-[var(--text-muted)] cursor-pointer transition-all duration-200 flex items-center gap-1 text-xs hover:bg-[var(--primary-alpha-10)] hover:border-[var(--primary-color)] hover:text-[var(--primary-color)]"
                      onClick={copyResponse}
                      title="Antwort kopieren"
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
                <div
                  ref={responseRef}
                  className={cn(
                    'p-5 bg-[var(--bg-elevated)] text-[var(--text-primary)] font-mono text-sm leading-[1.7] whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto max-md:max-h-[300px] max-md:text-sm max-md:p-4',
                    actionLoading && 'min-h-[60px]'
                  )}
                >
                  {response ||
                    (actionLoading && (
                      <span className="animate-[blink_1s_infinite] text-[var(--primary-color)]">
                        ▊
                      </span>
                    ))}
                </div>
                {stats && (
                  <div className="flex items-center gap-3 py-3 px-4 bg-[rgba(69,173,255,0.03)] border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
                    <span>{stats.tokens} Tokens</span>
                    <span>&bull;</span>
                    <span>{formatTime(stats.time)}</span>
                  </div>
                )}
              </div>
            )}

            {!isAvailable && status && (
              <div className="flex items-start gap-4 p-6 bg-[rgba(245,158,11,0.1)] border-2 border-[rgba(245,158,11,0.3)] rounded-lg mt-4 max-sm:flex-col max-sm:p-5">
                <AlertCircle className="w-6 h-6 text-[var(--warning-color)] shrink-0 mt-1" />
                <div>
                  <strong className="block text-[var(--warning-color)] mb-2">
                    LLM Service nicht verfügbar
                  </strong>
                  <p className="text-[var(--text-secondary)] text-sm m-0 mb-4">
                    Der LLM Service startet möglicherweise gerade. Bitte versuchen Sie es in einigen
                    Momenten erneut.
                  </p>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 py-2 px-4 bg-[rgba(245,158,11,0.2)] border border-[rgba(245,158,11,0.4)] rounded-md text-[var(--warning-color)] text-sm cursor-pointer transition-all duration-200 hover:bg-[rgba(245,158,11,0.3)]"
                    onClick={checkStatus}
                  >
                    <RefreshCw className="w-4 h-4" />
                    Status erneut prüfen
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* History Card */}
        <div className="settings-card">
          <div
            className="settings-card-header cursor-pointer flex items-center justify-between hover:bg-[var(--primary-alpha-5)]"
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
                <button
                  className="bg-transparent border border-[var(--border-subtle)] rounded-md py-1.5 px-2 text-[var(--text-muted)] cursor-pointer transition-all duration-200 flex items-center hover:bg-[rgba(239,68,68,0.1)] hover:border-[rgba(239,68,68,0.3)] hover:text-[var(--error-color)]"
                  onClick={e => {
                    e.stopPropagation();
                    clearHistory();
                  }}
                  title="Verlauf löschen"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              {showHistory ? (
                <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
              )}
            </div>
          </div>
          {showHistory && (
            <div className="settings-card-body">
              {history.length === 0 ? (
                <div className="text-center p-4">
                  <p className="text-[var(--text-muted)] text-sm">Noch keine Anfragen gestellt</p>
                  <p className="text-[var(--text-disabled)] text-xs mt-1">
                    Versuche eine Anfrage wie &bdquo;Wie ist der aktuelle Systemstatus?&ldquo;
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {history.map(item => (
                    <div
                      key={item.id}
                      className="p-3.5 bg-[rgba(69,173,255,0.03)] border border-[var(--border-subtle)] rounded-lg cursor-pointer transition-all duration-200 hover:bg-[var(--primary-alpha-8)] hover:border-[var(--border-glow)] hover:translate-x-1 max-sm:p-3"
                      onClick={() => {
                        setQuery(item.query);
                        inputRef.current?.focus();
                      }}
                    >
                      <div className="font-mono text-sm text-[var(--text-primary)] mb-2 max-sm:text-xs">
                        {item.query.length > 80 ? item.query.substring(0, 80) + '...' : item.query}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-[var(--text-muted)] flex-wrap max-md:gap-2">
                        <span
                          className={cn(
                            'flex items-center gap-1 uppercase tracking-wide font-medium',
                            item.status === 'completed' && 'text-[var(--status-neutral)]',
                            item.status === 'error' && 'text-[var(--error-color)]',
                            item.status === 'timeout' && 'text-[var(--warning-color)]'
                          )}
                        >
                          {item.status === 'completed' && <CheckCircle className="w-3.5 h-3.5" />}
                          {item.status === 'error' && <AlertCircle className="w-3.5 h-3.5" />}
                          {item.status === 'timeout' && <Clock className="w-3.5 h-3.5" />}
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
                  className="py-2.5 px-4 bg-[var(--primary-alpha-5)] border border-[var(--primary-alpha-20)] rounded-full text-[var(--text-secondary)] text-sm cursor-pointer transition-all duration-200 hover:enabled:bg-[var(--primary-alpha-12)] hover:enabled:border-[var(--primary-color)] hover:enabled:text-[var(--primary-color)] hover:enabled:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed max-md:w-full max-md:text-center"
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
