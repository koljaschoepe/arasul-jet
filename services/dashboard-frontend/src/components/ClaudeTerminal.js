import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FiTerminal,
  FiSend,
  FiRefreshCw,
  FiAlertCircle,
  FiCheckCircle,
  FiClock,
  FiTrash2,
  FiInfo,
  FiChevronDown,
  FiChevronUp,
  FiCopy,
  FiCheck,
} from 'react-icons/fi';
import { formatDate } from '../utils/formatting';
import { API_BASE, getAuthHeaders } from '../config/api';
import './ClaudeTerminal.css';

function ClaudeTerminal() {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [includeContext, setIncludeContext] = useState(true);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState(null);
  const responseRef = useRef(null);
  const inputRef = useRef(null);

  // Check terminal status on mount
  useEffect(() => {
    checkStatus();
    loadHistory();
  }, []);

  // Auto-scroll response
  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [response]);

  const checkStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/claude-terminal/status`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      setStatus({ available: false, error: 'Could not check service status' });
    }
  };

  const loadHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/claude-terminal/history?limit=10`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.queries || []);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  const clearHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/claude-terminal/history`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setHistory([]);
      }
    } catch (err) {
      console.error('Failed to clear history:', err);
    }
  };

  const copyResponse = useCallback(async () => {
    if (!response) return;
    try {
      await navigator.clipboard.writeText(response);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (insecure context) - silently fail
    }
  }, [response]);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    setResponse('');
    setError(null);
    setStats(null);

    try {
      const res = await fetch(`${API_BASE}/claude-terminal/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          query: query.trim(),
          includeContext,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        setError(errorData.error || 'Request failed');
        setIsLoading(false);
        return;
      }

      // Handle SSE stream
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
                setStats({
                  tokens: data.totalTokens,
                  time: data.responseTimeMs,
                });
              } else if (data.type === 'error') {
                setError(data.message || data.error);
              } else if (data.done) {
                setIsLoading(false);
                loadHistory();
              }
            } catch (parseErr) {
              // Skip non-JSON lines
            }
          }
        }
      }
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const formatTime = ms => {
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
        <div className="settings-card claude-terminal-status-card">
          <div className="settings-card-header">
            <div className="claude-terminal-status-header">
              <h3 className="settings-card-title">
                <FiTerminal style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                Service Status
              </h3>
              <button
                className="claude-terminal-refresh-btn"
                onClick={checkStatus}
                title="Status aktualisieren"
              >
                <FiRefreshCw />
              </button>
            </div>
            <p className="settings-card-description">
              {status?.llm?.available
                ? `LLM verfügbar (${status.config?.defaultModel || 'unknown'})`
                : 'LLM Service prüfen...'}
            </p>
          </div>
          <div className="settings-card-body">
            <div className="claude-terminal-status-grid">
              <div className={`claude-terminal-status-item ${isAvailable ? 'online' : 'offline'}`}>
                {isAvailable ? <FiCheckCircle /> : <FiAlertCircle />}
                <span>{isAvailable ? 'Online' : 'Offline'}</span>
              </div>
              {status?.config && (
                <>
                  <div className="claude-terminal-status-item info">
                    <FiClock />
                    <span>Timeout: {formatTime(status.config.defaultTimeout)}</span>
                  </div>
                  <div className="claude-terminal-status-item info">
                    <FiInfo />
                    <span>Rate: {status.config.rateLimit}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Main Terminal Card */}
        <div className="settings-card claude-terminal-main-card">
          <div className="settings-card-header">
            <h3 className="settings-card-title">Terminal</h3>
            <p className="settings-card-description">
              Stelle Fragen zum System, analysiere Logs oder lass dir bei Problemen helfen
            </p>
          </div>
          <div className="settings-card-body">
            {/* Input Form */}
            <form onSubmit={handleSubmit} className="claude-terminal-form">
              <div className="claude-terminal-input-wrapper">
                <textarea
                  ref={inputRef}
                  className="claude-terminal-input"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="z.B. 'Wie ist der aktuelle Systemstatus?' oder 'Zeige mir die letzten Fehler in den Logs'"
                  disabled={isLoading || !isAvailable}
                  rows={2}
                />
                <button
                  type="submit"
                  className="claude-terminal-send-btn"
                  disabled={!query.trim() || isLoading || !isAvailable}
                >
                  {isLoading ? <FiRefreshCw className="spinning" /> : <FiSend />}
                </button>
              </div>
              <div className="claude-terminal-options">
                <label className="claude-terminal-checkbox">
                  <input
                    type="checkbox"
                    checked={includeContext}
                    onChange={e => setIncludeContext(e.target.checked)}
                  />
                  <span>System-Kontext einbeziehen (Metriken, Logs, Services)</span>
                </label>
              </div>
            </form>

            {/* Error Display */}
            {error && (
              <div className="claude-terminal-error">
                <FiAlertCircle />
                <span>{error}</span>
              </div>
            )}

            {/* Response Display */}
            {(response || isLoading) && (
              <div className="claude-terminal-response-container">
                <div className="claude-terminal-response-header">
                  <span className="claude-terminal-response-label">
                    {isLoading ? 'Generiere Antwort...' : 'Antwort'}
                  </span>
                  {response && !isLoading && (
                    <button
                      className="claude-terminal-copy-btn"
                      onClick={copyResponse}
                      title="Antwort kopieren"
                    >
                      {copied ? <FiCheck /> : <FiCopy />}
                    </button>
                  )}
                </div>
                <div
                  ref={responseRef}
                  className={`claude-terminal-response ${isLoading ? 'loading' : ''}`}
                >
                  {response || (isLoading && <span className="claude-terminal-cursor">▊</span>)}
                </div>
                {stats && (
                  <div className="claude-terminal-stats">
                    <span>{stats.tokens} Tokens</span>
                    <span>•</span>
                    <span>{formatTime(stats.time)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Unavailable Message */}
            {!isAvailable && status && (
              <div className="claude-terminal-unavailable">
                <FiAlertCircle />
                <div>
                  <strong>LLM Service nicht verfügbar</strong>
                  <p>
                    Der LLM Service startet möglicherweise gerade. Bitte versuchen Sie es in einigen
                    Momenten erneut.
                  </p>
                  <button className="claude-terminal-retry-btn" onClick={checkStatus}>
                    <FiRefreshCw />
                    Status erneut prüfen
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* History Card */}
        <div className="settings-card claude-terminal-history-card">
          <div
            className="settings-card-header claude-terminal-history-header"
            onClick={() => setShowHistory(!showHistory)}
          >
            <div>
              <h3 className="settings-card-title">Verlauf</h3>
              <p className="settings-card-description">
                {history.length} {history.length === 1 ? 'Anfrage' : 'Anfragen'} gespeichert
              </p>
            </div>
            <div className="claude-terminal-history-actions">
              {history.length > 0 && (
                <button
                  className="claude-terminal-clear-btn"
                  onClick={e => {
                    e.stopPropagation();
                    clearHistory();
                  }}
                  title="Verlauf löschen"
                >
                  <FiTrash2 />
                </button>
              )}
              {showHistory ? <FiChevronUp /> : <FiChevronDown />}
            </div>
          </div>
          {showHistory && (
            <div className="settings-card-body">
              {history.length === 0 ? (
                <p className="claude-terminal-empty-history">Noch keine Anfragen gestellt</p>
              ) : (
                <div className="claude-terminal-history-list">
                  {history.map(item => (
                    <div
                      key={item.id}
                      className={`claude-terminal-history-item ${item.status}`}
                      onClick={() => {
                        setQuery(item.query);
                        inputRef.current?.focus();
                      }}
                    >
                      <div className="claude-terminal-history-query">
                        {item.query.length > 80 ? item.query.substring(0, 80) + '...' : item.query}
                      </div>
                      <div className="claude-terminal-history-meta">
                        <span className={`claude-terminal-history-status ${item.status}`}>
                          {item.status === 'completed' && <FiCheckCircle />}
                          {item.status === 'error' && <FiAlertCircle />}
                          {item.status === 'timeout' && <FiClock />}
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
            <div className="claude-terminal-examples">
              {[
                'Wie ist der aktuelle Systemstatus?',
                'Gibt es kritische Fehler in den Logs?',
                'Welche Services sind offline?',
                'Analysiere die CPU- und RAM-Auslastung',
              ].map((example, index) => (
                <button
                  key={index}
                  className="claude-terminal-example-btn"
                  onClick={() => {
                    setQuery(example);
                    inputRef.current?.focus();
                  }}
                  disabled={isLoading}
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
