# Frontend Bugfix & Optimierungsplan

Erstellt: 2026-01-23

## Executive Summary

Die Frontend-Analyse hat **50+ identifizierte Probleme** in folgenden Kategorien aufgedeckt:

| Kategorie | Anzahl | Schweregrad |
|-----------|--------|-------------|
| Memory Leaks & Cleanup | 4 | KRITISCH |
| Race Conditions | 4 | KRITISCH |
| State Management | 15 | HOCH |
| Performance (Re-renders, Bundle) | 10 | HOCH |
| Error Handling | 4 | MITTEL |
| Anti-Patterns | 7 | MITTEL |
| Accessibility | 5+ | KRITISCH |
| UX-Verbesserungen | 15 | MITTEL |

---

## PHASE 1: KRITISCHE BUGS (Sofort beheben)

### 1.1 Memory Leaks

#### ML-001: DocumentManager - Interval-Cleanup bei Dependencies
**Datei:** `components/DocumentManager.js:195-202`
**Problem:** `loadDocuments` im Dependency Array führt zu wiederholtem Erstellen/Löschen des Intervals.

```javascript
// VORHER (Fehlerhaft):
useEffect(() => {
  loadDocuments();
  const interval = setInterval(() => {
    loadDocuments();
    loadStatistics();
  }, 30000);
  return () => clearInterval(interval);
}, [loadDocuments]); // loadDocuments ändert sich bei Filter-Änderungen!

// NACHHER (Korrekt):
const loadDocumentsRef = useRef(loadDocuments);
useEffect(() => { loadDocumentsRef.current = loadDocuments; }, [loadDocuments]);

useEffect(() => {
  loadDocumentsRef.current();
  const interval = setInterval(() => {
    loadDocumentsRef.current();
    loadStatistics();
  }, 30000);
  return () => clearInterval(interval);
}, []); // Leeres Array - nur bei Mount
```

#### ML-002: ModelStore - Progress-Interval bei Doppelklick
**Datei:** `components/ModelStore.js:135-147`
**Problem:** Bei Doppelklick auf "Aktivieren" entstehen mehrere parallele Intervals.

```javascript
// FIX: Mutex-Pattern
const [isActivating, setIsActivating] = useState(false);

const handleActivate = async (model) => {
  if (isActivating) return; // Guard
  setIsActivating(true);

  let progressInterval;
  try {
    progressInterval = setInterval(...);
    await fetch(...);
  } finally {
    if (progressInterval) clearInterval(progressInterval);
    setIsActivating(false);
  }
};
```

#### ML-003: TelegramSettings - Fehlende AbortController
**Datei:** `components/TelegramSettings.js:61-104, 139-161`
**Problem:** setState auf unmounted Component möglich.

```javascript
// FIX: AbortController Pattern
useEffect(() => {
  const controller = new AbortController();

  const loadConfig = async () => {
    try {
      const response = await fetch('/api/telegram/config', {
        signal: controller.signal,
        credentials: 'include'
      });
      if (!controller.signal.aborted) {
        const data = await response.json();
        setConfig(data);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
    }
  };

  loadConfig();
  return () => controller.abort();
}, []);
```

#### ML-004: App.js - Global mutable State
**Datei:** `App.js:38-40`
**Problem:** `let isHandling401 = false` ist eine globale Variable außerhalb von React.

```javascript
// FIX: useRef innerhalb der Komponente
function App() {
  const isHandling401Ref = useRef(false);

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401 && !isHandling401Ref.current) {
          isHandling401Ref.current = true;
          // ... logout logic
          setTimeout(() => { isHandling401Ref.current = false; }, 100);
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, []);
}
```

---

### 1.2 Race Conditions

#### RC-001: ChatMulti - Token-Batch mit falschen Index
**Datei:** `components/ChatMulti.js:68-124`
**Problem:** `assistantMessageIndex` ist nicht stabil wenn Messages sich ändern.

```javascript
// FIX: Job-ID-basiertes Update statt Index
const flushTokenBatch = useCallback((jobId, forceFlush = false) => {
  const batch = tokenBatchRef.current;

  if (batch.pendingContent || batch.pendingThinking || forceFlush) {
    batch.content += batch.pendingContent;
    batch.pendingContent = '';

    setMessages(prevMessages => {
      const index = prevMessages.findIndex(m => m.jobId === jobId);
      if (index === -1) return prevMessages; // Job nicht mehr vorhanden

      const updated = [...prevMessages];
      updated[index] = {
        ...updated[index],
        content: batch.content,
        thinking: batch.thinking,
        hasThinking: batch.thinking.length > 0
      };
      return updated;
    });
  }
}, []);
```

#### RC-002: ChatMulti - Generation Check nach loadMessages
**Datei:** `components/ChatMulti.js:260-299`
**Problem:** `loadMessages` setzt State bevor Generation geprüft wird.

```javascript
// FIX: loadMessages muss Promise zurückgeben, ohne selbst setState aufzurufen
const loadMessages = async (chatId, abortSignal) => {
  const response = await axios.get(`${API_BASE}/chats/${chatId}/messages`, {
    signal: abortSignal
  });
  return response.data.messages || [];
};

const initializeChat = async (chatId) => {
  const currentGeneration = ++generationRef.current;
  const controller = new AbortController();
  abortControllersRef.current[chatId] = controller;

  try {
    const msgs = await loadMessages(chatId, controller.signal);

    // Generation Check VOR setState
    if (generationRef.current !== currentGeneration) {
      console.log('Chat changed, aborting');
      return;
    }

    setMessages(msgs);
  } catch (err) {
    if (err.name !== 'AbortError') {
      setError(err.message);
    }
  }
};
```

#### RC-003: DocumentManager - Semantic Search Race
**Datei:** `components/DocumentManager.js:341-357`
**Problem:** Mehrere schnelle Suchen können veraltete Ergebnisse zeigen.

```javascript
// FIX: Suche mit AbortController und Request-ID
const searchRequestIdRef = useRef(0);

const handleSemanticSearch = async () => {
  const currentRequestId = ++searchRequestIdRef.current;
  setSearching(true);

  try {
    const response = await axios.post(`${API_BASE}/documents/search`, {
      query: searchQuery
    });

    // Nur aktuellste Suche anzeigen
    if (searchRequestIdRef.current === currentRequestId) {
      setSearchResults(response.data);
    }
  } catch (err) {
    if (searchRequestIdRef.current === currentRequestId) {
      setError(err.message);
    }
  } finally {
    if (searchRequestIdRef.current === currentRequestId) {
      setSearching(false);
    }
  }
};
```

#### RC-004: DownloadContext - Poll Dependency Loop
**Datei:** `contexts/DownloadContext.js:85-146`
**Problem:** `activeDownloads` im Dependency Array erstellt Interval-Loop.

```javascript
// FIX: activeDownloads über Ref tracken
const activeDownloadsRef = useRef({});

useEffect(() => {
  activeDownloadsRef.current = activeDownloads;
}, [activeDownloads]);

useEffect(() => {
  const pollInterval = setInterval(async () => {
    const currentDownloads = Object.keys(activeDownloadsRef.current);
    if (currentDownloads.length === 0) return;

    // Poll logic...
  }, 3000);

  return () => clearInterval(pollInterval);
}, []); // Leeres Array - nur ein Interval
```

---

## PHASE 2: PERFORMANCE-OPTIMIERUNGEN (Woche 1)

### 2.1 Code-Splitting mit React.lazy()

**Datei:** `App.js`

```javascript
// VORHER: Alles synchron geladen
import ChatMulti from './components/ChatMulti';
import DocumentManager from './components/DocumentManager';
import AppStore from './components/AppStore';
// ... 8+ weitere

// NACHHER: Lazy Loading
import { lazy, Suspense } from 'react';
import LoadingSpinner from './components/LoadingSpinner';

const ChatMulti = lazy(() => import('./components/ChatMulti'));
const DocumentManager = lazy(() => import('./components/DocumentManager'));
const AppStore = lazy(() => import('./components/AppStore'));
const ModelStore = lazy(() => import('./components/ModelStore'));
const ClaudeCode = lazy(() => import('./components/ClaudeCode'));
const TelegramBotApp = lazy(() => import('./components/TelegramBotApp'));
const Settings = lazy(() => import('./components/Settings'));
const UpdatePage = lazy(() => import('./components/UpdatePage'));

// In Routes:
<Suspense fallback={<LoadingSpinner fullscreen={true} message="Lade..." />}>
  <Routes>
    <Route path="/chat" element={<ChatMulti />} />
    {/* ... */}
  </Routes>
</Suspense>
```

**Erwartete Verbesserung:** Initial Bundle von ~830KB auf ~200KB reduziert.

### 2.2 Memoization für Komponenten

**Datei:** `App.js`

```javascript
// VORHER: Re-render bei jedem Parent-Update
function SidebarWithDownloads(props) {
  const { activeDownloadCount, activeDownloadsList } = useDownloads();
  return <Sidebar {...props} ... />;
}

// NACHHER: Memoized
const SidebarWithDownloads = React.memo(function SidebarWithDownloads(props) {
  const { activeDownloadCount, activeDownloadsList } = useDownloads();
  return <Sidebar {...props} ... />;
});

// DashboardHome memoizen
const DashboardHome = React.memo(function DashboardHome({
  metrics,
  formatChartData,
  // ...
}) {
  // ...
});
```

### 2.3 Utility Functions memoizen

```javascript
// VORHER: Neue Funktion bei jedem Render
const getStatusColor = (status) => { ... };

// NACHHER: useCallback
const getStatusColor = useCallback((status) => {
  switch (status) {
    case 'running': return 'var(--success-color)';
    case 'stopped': return 'var(--error-color)';
    default: return 'var(--text-muted)';
  }
}, []);

const formatUptime = useCallback((seconds) => {
  if (!seconds) return 'N/A';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${mins}m`;
}, []);
```

### 2.4 CSS-Optimierung

**Problem:** 19,374 Zeilen CSS in 18 Dateien

| Datei | Zeilen | Aktion |
|-------|--------|--------|
| index.css | 3,595 | Aufteilen in Module |
| settings.css | 2,315 | Beibehalten |
| claudecode.css | 2,264 | Beibehalten |
| appstore.css | 1,839 | Beibehalten |
| chatmulti.css | 1,810 | `chat.css` mergen |
| chat.css | 464 | In chatmulti.css mergen |

**Schritt 1:** `chat.css` in `chatmulti.css` mergen (Duplikate entfernen)
**Schritt 2:** `index.css` aufteilen:
- `base.css` - Reset, Variablen
- `layout.css` - Grid, Container
- `components.css` - Buttons, Inputs, Cards
- `utilities.css` - Helper Classes

---

## PHASE 3: STATE MANAGEMENT (Woche 2)

### 3.1 AuthContext einführen

**Neue Datei:** `contexts/AuthContext.js`

```javascript
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const token = localStorage.getItem('arasul_token');
      if (!token) {
        setIsAuthenticated(false);
        return;
      }
      const response = await axios.get('/api/auth/me');
      setUser(response.data.user);
      setIsAuthenticated(true);
    } catch {
      localStorage.removeItem('arasul_token');
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (username, password) => {
    const response = await axios.post('/api/auth/login', { username, password });
    localStorage.setItem('arasul_token', response.data.token);
    setUser(response.data.user);
    setIsAuthenticated(true);
    return response.data;
  }, []);

  const logout = useCallback(async () => {
    await axios.post('/api/auth/logout');
    localStorage.removeItem('arasul_token');
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  return (
    <AuthContext.Provider value={{
      user, isAuthenticated, loading, login, logout, checkAuth
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
```

### 3.2 WebSocket in Custom Hook extrahieren

**Neue Datei:** `hooks/useWebSocketMetrics.js`

```javascript
import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

export function useWebSocketMetrics(isAuthenticated) {
  const [metrics, setMetrics] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsReconnecting, setWsReconnecting] = useState(false);

  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const isIntentionallyClosedRef = useRef(false);
  const httpPollingRef = useRef(null);

  const startHttpPolling = useCallback(() => {
    if (httpPollingRef.current) return;

    httpPollingRef.current = setInterval(async () => {
      try {
        const res = await axios.get('/api/metrics/live');
        setMetrics(res.data);
      } catch (err) {
        console.error('HTTP polling error:', err);
      }
    }, 5000);
  }, []);

  const stopHttpPolling = useCallback(() => {
    if (httpPollingRef.current) {
      clearInterval(httpPollingRef.current);
      httpPollingRef.current = null;
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!isAuthenticated) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/metrics/live-stream`);

    ws.onopen = () => {
      setWsConnected(true);
      setWsReconnecting(false);
      reconnectAttemptsRef.current = 0;
      stopHttpPolling();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'metrics') {
          setMetrics(data.metrics);
        }
      } catch (err) {
        console.error('WS parse error:', err);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);

      if (isIntentionallyClosedRef.current) return;

      setWsReconnecting(true);
      startHttpPolling();

      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
      reconnectTimerRef.current = setTimeout(() => {
        reconnectAttemptsRef.current++;
        connectWebSocket();
      }, delay);
    };

    wsRef.current = ws;
  }, [isAuthenticated, startHttpPolling, stopHttpPolling]);

  useEffect(() => {
    if (!isAuthenticated) return;

    isIntentionallyClosedRef.current = false;
    connectWebSocket();

    return () => {
      isIntentionallyClosedRef.current = true;
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      stopHttpPolling();
    };
  }, [isAuthenticated, connectWebSocket, stopHttpPolling]);

  return { metrics, wsConnected, wsReconnecting };
}
```

---

## PHASE 4: ERROR HANDLING & UX (Woche 2-3)

### 4.1 Toast Notification System

**Neue Datei:** `contexts/ToastContext.js`

```javascript
import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 5000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = {
    success: (msg, duration) => addToast(msg, 'success', duration),
    error: (msg, duration) => addToast(msg, 'error', duration),
    warning: (msg, duration) => addToast(msg, 'warning', duration),
    info: (msg, duration) => addToast(msg, 'info', duration),
  };

  return (
    <ToastContext.Provider value={{ toasts, toast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, onRemove }) {
  return (
    <div className="toast-container" role="alert" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span>{t.message}</span>
          <button onClick={() => onRemove(t.id)} aria-label="Schließen">×</button>
        </div>
      ))}
    </div>
  );
}

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context.toast;
};
```

### 4.2 Granulare Error Boundaries

**Erweitern:** `components/ErrorBoundary.js`

```javascript
import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });

    // Optional: Error Reporting
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      // Custom Fallback oder Default
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          retry: this.handleRetry
        });
      }

      return (
        <div className="error-boundary-fallback">
          <h2>{this.props.title || 'Etwas ist schiefgelaufen'}</h2>
          <p>{this.props.message || 'Diese Komponente konnte nicht geladen werden.'}</p>
          <button onClick={this.handleRetry} className="btn btn-primary">
            Erneut versuchen
          </button>
          {process.env.NODE_ENV === 'development' && (
            <details>
              <summary>Fehlerdetails</summary>
              <pre>{this.state.error?.toString()}</pre>
              <pre>{this.state.errorInfo?.componentStack}</pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
```

**Verwendung in App.js:**

```javascript
// Granulare Boundaries pro Route
<Route path="/chat" element={
  <ErrorBoundary title="Chat Fehler" message="Der Chat konnte nicht geladen werden.">
    <ChatMulti />
  </ErrorBoundary>
} />

<Route path="/documents" element={
  <ErrorBoundary title="Dokumente Fehler">
    <DocumentManager />
  </ErrorBoundary>
} />
```

### 4.3 Skeleton Loading Screens

**Neue Datei:** `components/Skeleton.js`

```javascript
import './Skeleton.css';

export function SkeletonText({ lines = 3, width = '100%' }) {
  return (
    <div className="skeleton-text" style={{ width }}>
      {Array(lines).fill(0).map((_, i) => (
        <div
          key={i}
          className="skeleton-line"
          style={{ width: i === lines - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-header">
        <div className="skeleton-avatar" />
        <div className="skeleton-title" />
      </div>
      <SkeletonText lines={2} />
    </div>
  );
}

export function SkeletonList({ count = 5 }) {
  return (
    <div className="skeleton-list">
      {Array(count).fill(0).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
```

---

## PHASE 5: ACCESSIBILITY (Woche 3)

### 5.1 ARIA-Labels hinzufügen

**Checkliste für alle Komponenten:**

```javascript
// Icons müssen Labels haben
<button onClick={onDelete} aria-label="Dokument löschen">
  <FiTrash2 aria-hidden="true" />
</button>

// Modals brauchen Dialog-Rolle
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
>
  <h2 id="modal-title">Bestätigung</h2>
</div>

// Loading States ankündigen
<div aria-live="polite" aria-busy={loading}>
  {loading ? <LoadingSpinner /> : <Content />}
</div>

// Dropdowns
<button
  aria-haspopup="listbox"
  aria-expanded={isOpen}
  aria-controls="dropdown-list"
>
  Auswählen
</button>
<ul id="dropdown-list" role="listbox">
  {options.map(opt => (
    <li key={opt.id} role="option" aria-selected={selected === opt.id}>
      {opt.label}
    </li>
  ))}
</ul>
```

### 5.2 Keyboard Navigation

**Focus Management für Modals:**

```javascript
function Modal({ isOpen, onClose, children }) {
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      modalRef.current?.focus();
    } else {
      previousFocusRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      className="modal-overlay"
    >
      {children}
    </div>
  );
}
```

---

## ZUSAMMENFASSUNG: IMPLEMENTIERUNGSREIHENFOLGE

### Woche 1 (Kritisch)
- [ ] Memory Leaks beheben (ML-001 bis ML-004)
- [ ] Race Conditions beheben (RC-001 bis RC-004)
- [ ] Code-Splitting mit React.lazy() einführen
- [ ] Sidebar/DashboardHome memoizen

### Woche 2 (Hoch)
- [ ] AuthContext einführen
- [ ] WebSocket-Hook extrahieren
- [ ] Toast-System implementieren
- [ ] Granulare Error Boundaries
- [ ] CSS-Dateien konsolidieren (chat.css + chatmulti.css)

### Woche 3 (Mittel)
- [ ] Skeleton Screens
- [ ] ARIA-Labels (alle Komponenten)
- [ ] Keyboard Navigation
- [ ] Empty States mit Aktionen
- [ ] Inline Styles zu CSS migrieren

### Woche 4 (Nice-to-Have)
- [ ] index.css aufteilen
- [ ] API-Request Gruppierung
- [ ] Progress Indicators mit ETA
- [ ] Error Telemetry

---

## TESTING-STRATEGIE

Nach jeder Phase:

```bash
# Unit Tests
npm test -- --coverage

# Type Check (falls TypeScript)
npm run typecheck

# Bundle Analyse
npm run build
npx source-map-explorer build/static/js/*.js

# Accessibility Audit
npx axe-core build/index.html

# Performance
npx lighthouse http://localhost:3000 --view
```

---

## METRIKEN (Vor/Nach)

| Metrik | Vorher | Ziel |
|--------|--------|------|
| Initial Bundle | ~830KB | <250KB |
| TTI (Time to Interactive) | ~4s | <2s |
| Re-renders pro Minute | ~120 | <30 |
| Error Boundaries | 1 global | 8+ granular |
| ARIA Coverage | <1% | >90% |
| Memory Leaks | 4 bekannt | 0 |
| Race Conditions | 4 bekannt | 0 |

---

## REFERENZEN

- React Performance: https://react.dev/learn/render-and-commit
- WCAG 2.1: https://www.w3.org/WAI/WCAG21/quickref/
- Project Design System: [docs/DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)
