import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Route, Routes, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { FiCpu, FiHardDrive, FiActivity, FiThermometer, FiHome, FiSettings, FiMessageSquare, FiZap, FiDatabase, FiExternalLink, FiFileText, FiPackage, FiCode, FiGitBranch, FiBox, FiTerminal, FiChevronLeft, FiSend, FiDownload } from 'react-icons/fi';

// PHASE 2: Code-Splitting - Synchronous imports for critical components
import Login from './components/Login';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingSpinner from './components/LoadingSpinner';

// PHASE 3: State Management - Contexts and Hooks
import { DownloadProvider, useDownloads } from './contexts/DownloadContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { useWebSocketMetrics } from './hooks/useWebSocketMetrics';

import { API_BASE } from './config/api';
import './index.css';

// PHASE 2: Code-Splitting - Lazy imports for route components
// These components are loaded on-demand when the user navigates to them
const Settings = lazy(() => import('./components/Settings'));
const ChatMulti = lazy(() => import('./components/ChatMulti'));
const DocumentManager = lazy(() => import('./components/DocumentManager'));
const AppStore = lazy(() => import('./components/AppStore'));
const ModelStore = lazy(() => import('./components/ModelStore'));
const ClaudeCode = lazy(() => import('./components/ClaudeCode'));
const TelegramBotApp = lazy(() => import('./components/TelegramBotApp'));

// Enable sending cookies with all requests (for LAN access support)
axios.defaults.withCredentials = true;

// Axios interceptor for authentication (request interceptor - adds token)
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('arasul_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Main App Component
 * PHASE 3: Wraps the application with providers (AuthProvider, DownloadProvider)
 */
function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

/**
 * App Content - Uses auth context and contains main app logic
 * PHASE 3: Separated from App to use hooks inside AuthProvider
 */
function AppContent() {
  const { isAuthenticated, loading: authLoading, login, logout } = useAuth();

  // Dashboard state
  const [systemStatus, setSystemStatus] = useState(null);
  const [metricsHistory, setMetricsHistory] = useState(null);
  const [services, setServices] = useState(null);
  const [workflows, setWorkflows] = useState(null);
  const [systemInfo, setSystemInfo] = useState(null);
  const [networkInfo, setNetworkInfo] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState(null);
  const [runningApps, setRunningApps] = useState([]);
  const [thresholds, setThresholds] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(null);

  // PHASE 3: Use WebSocket hook for real-time metrics
  const { metrics: wsMetrics } = useWebSocketMetrics(isAuthenticated);

  // Local metrics state (updated by WebSocket or initial fetch)
  const [metrics, setMetrics] = useState(null);

  // Update metrics from WebSocket
  useEffect(() => {
    if (wsMetrics) {
      setMetrics(wsMetrics);
    }
  }, [wsMetrics]);

  // Sidebar collapsed state - persisted in localStorage
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('arasul_sidebar_collapsed');
    return saved ? JSON.parse(saved) : false;
  });

  // Theme state - persisted in localStorage (default: dark)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('arasul_theme');
    return saved || 'dark';
  });

  // Toggle sidebar collapsed state
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const newState = !prev;
      localStorage.setItem('arasul_sidebar_collapsed', JSON.stringify(newState));
      return newState;
    });
  }, []);

  // Toggle theme between dark and light
  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const newTheme = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('arasul_theme', newTheme);
      return newTheme;
    });
  }, []);

  // Apply theme class to body
  useEffect(() => {
    document.body.classList.remove('light-mode', 'dark-mode');
    document.body.classList.add(`${theme}-mode`);
  }, [theme]);

  // Apply sidebar state class to body (for components like markdown editor overlay)
  useEffect(() => {
    document.body.classList.remove('sidebar-expanded', 'sidebar-collapsed');
    document.body.classList.add(sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded');
  }, [sidebarCollapsed]);

  // Keyboard shortcut: Cmd/Ctrl + B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

  // Fetch initial dashboard data
  const fetchData = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const [statusRes, metricsRes, historyRes, servicesRes, workflowsRes, infoRes, networkRes, appsRes, thresholdsRes] = await Promise.all([
        axios.get(`${API_BASE}/system/status`),
        axios.get(`${API_BASE}/metrics/live`),
        axios.get(`${API_BASE}/metrics/history?range=24h`),
        axios.get(`${API_BASE}/services`),
        axios.get(`${API_BASE}/workflows/activity`),
        axios.get(`${API_BASE}/system/info`),
        axios.get(`${API_BASE}/system/network`),
        axios.get(`${API_BASE}/apps?status=running,installed`),
        axios.get(`${API_BASE}/system/thresholds`)
      ]);

      setSystemStatus(statusRes.data);
      setMetrics(metricsRes.data);
      setMetricsHistory(historyRes.data);
      setServices(servicesRes.data);
      setWorkflows(workflowsRes.data);
      setSystemInfo(infoRes.data);
      setNetworkInfo(networkRes.data);
      setRunningApps(appsRes.data.apps || []);
      setThresholds(thresholdsRes.data.thresholds);
      setDeviceInfo(thresholdsRes.data.device);
      setDataLoading(false);
      setError(null);

    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.message);
      setDataLoading(false);
    }
  }, [isAuthenticated]);

  // Fetch data on auth change and setup refresh interval
  useEffect(() => {
    if (!isAuthenticated) return;

    fetchData();

    // Refresh non-metric data every 30 seconds
    const interval = setInterval(() => {
      fetchData();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchData, isAuthenticated]);

  // PHASE 2: Memoize utility functions with useCallback
  const getStatusColor = useCallback((status) => {
    if (status === 'OK') return 'status-ok';
    if (status === 'WARNING') return 'status-warning';
    return 'status-critical';
  }, []);

  const formatUptime = useCallback((seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  }, []);

  const formatChartData = useCallback(() => {
    if (!metricsHistory) return [];

    return metricsHistory.timestamps.map((timestamp, index) => ({
      timestamp: new Date(timestamp).getTime(),
      time: new Date(timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      hour: new Date(timestamp).getHours(),
      CPU: metricsHistory.cpu[index],
      RAM: metricsHistory.ram[index],
      GPU: metricsHistory.gpu[index],
      Temp: metricsHistory.temperature[index]
    }));
  }, [metricsHistory]);

  // Handle login success - called from Login component
  const handleLoginSuccess = useCallback((data) => {
    login(data);
    setDataLoading(true);
  }, [login]);

  // Handle logout
  const handleLogout = useCallback(async () => {
    await logout();
  }, [logout]);

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    if (authLoading) {
      return <LoadingSpinner message="Prüfe Authentifizierung..." fullscreen={true} />;
    }
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  if (dataLoading) {
    return <LoadingSpinner message="Lade Dashboard..." fullscreen={true} />;
  }

  if (error) {
    return (
      <div className="app">
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <h2>Fehler beim Laden</h2>
          <p className="error-text">{error}</p>
          <button onClick={() => window.location.reload()} className="btn-retry">
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  return (
    <DownloadProvider>
      <Router>
        <div className="app">
          {/* PHASE 5: Skip-to-content link for keyboard navigation */}
          <a href="#main-content" className="skip-to-content">
            Zum Hauptinhalt springen
          </a>

          <SidebarWithDownloads
            systemStatus={systemStatus}
            getStatusColor={getStatusColor}
            collapsed={sidebarCollapsed}
            onToggle={toggleSidebar}
          />

          <div className="container" id="main-content" role="main" tabIndex={-1}>
            {/* PHASE 2: Suspense wrapper for lazy-loaded route components */}
            <Suspense fallback={<LoadingSpinner message="Lade..." />}>
              <Routes>
                <Route
                  path="/"
                  element={
                    <DashboardHome
                      metrics={metrics}
                      metricsHistory={metricsHistory}
                      services={services}
                      workflows={workflows}
                      systemInfo={systemInfo}
                      networkInfo={networkInfo}
                      runningApps={runningApps}
                      formatChartData={formatChartData}
                      formatUptime={formatUptime}
                      getStatusColor={getStatusColor}
                      thresholds={thresholds}
                      deviceInfo={deviceInfo}
                    />
                  }
                />
                <Route path="/settings" element={<Settings handleLogout={handleLogout} theme={theme} onToggleTheme={toggleTheme} />} />
                <Route path="/chat" element={<ChatMulti />} />
                <Route path="/documents" element={<DocumentManager />} />
                <Route path="/appstore" element={<AppStore />} />
                <Route path="/models" element={<ModelStore />} />
                <Route path="/claude-code" element={<ClaudeCode />} />
                <Route path="/telegram-bot" element={<TelegramBotApp />} />
              </Routes>
            </Suspense>
          </div>
        </div>
      </Router>
    </DownloadProvider>
  );
}

// Wrapper to inject download state into Sidebar
function SidebarWithDownloads(props) {
  const { activeDownloadCount, activeDownloadsList } = useDownloads();
  return (
    <Sidebar
      {...props}
      downloadCount={activeDownloadCount}
      activeDownloads={activeDownloadsList}
    />
  );
}

// PHASE 2 & 5: Memoize Sidebar with ARIA accessibility
const Sidebar = React.memo(function Sidebar({ systemStatus, getStatusColor, collapsed, onToggle, downloadCount = 0, activeDownloads = [] }) {
  const location = useLocation();

  const isActive = (path) => {
    return location.pathname === path ? 'nav-link active' : 'nav-link';
  };

  // PHASE 5: Check if link is current page for aria-current
  const isCurrent = (path) => location.pathname === path;

  // Build className based on collapsed state
  const sidebarClassName = `sidebar ${collapsed ? 'collapsed' : 'expanded'}`;

  return (
    <aside
      className={sidebarClassName}
      aria-label="Hauptnavigation"
    >
      <div className="sidebar-header">
        <h1 className="sidebar-title">{collapsed ? 'A' : 'Arasul'}</h1>
        <p className="sidebar-subtitle">Edge AI Platform</p>
        <button
          className="sidebar-toggle"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls="sidebar-nav"
          aria-label={collapsed ? 'Sidebar erweitern' : 'Sidebar minimieren'}
          title={collapsed ? 'Sidebar erweitern (Ctrl+B)' : 'Sidebar minimieren (Ctrl+B)'}
        >
          <FiChevronLeft aria-hidden="true" />
        </button>
      </div>

      <nav id="sidebar-nav" className="navigation" aria-label="Hauptmenü">
        <ul className="nav-bar" role="menubar">
          <li role="none">
            <Link
              to="/"
              className={isActive('/')}
              role="menuitem"
              aria-current={isCurrent('/') ? 'page' : undefined}
            >
              <FiHome aria-hidden="true" /> <span>Dashboard</span>
            </Link>
          </li>
          <li role="none">
            <Link
              to="/chat"
              className={isActive('/chat')}
              role="menuitem"
              aria-current={isCurrent('/chat') ? 'page' : undefined}
            >
              <FiMessageSquare aria-hidden="true" /> <span>AI Chat</span>
            </Link>
          </li>
          <li role="none">
            <Link
              to="/documents"
              className={isActive('/documents')}
              role="menuitem"
              aria-current={isCurrent('/documents') ? 'page' : undefined}
            >
              <FiFileText aria-hidden="true" /> <span>Dokumente</span>
            </Link>
          </li>
          <li role="none">
            <Link
              to="/appstore"
              className={isActive('/appstore')}
              role="menuitem"
              aria-current={isCurrent('/appstore') ? 'page' : undefined}
            >
              <FiPackage aria-hidden="true" /> <span>Store</span>
            </Link>
          </li>
          <li role="none">
            <Link
              to="/models"
              className={`${isActive('/models')} ${downloadCount > 0 ? 'has-downloads' : ''}`}
              role="menuitem"
              aria-current={isCurrent('/models') ? 'page' : undefined}
              aria-label={downloadCount > 0 ? `KI-Modelle, ${downloadCount} Downloads aktiv` : 'KI-Modelle'}
            >
              <FiBox aria-hidden="true" />
              <span>KI-Modelle</span>
              {downloadCount > 0 && (
                <span className="download-badge" aria-hidden="true">
                  <FiDownload className="download-badge-icon" />
                  {!collapsed && downloadCount}
                </span>
              )}
            </Link>
          </li>
        </ul>
      </nav>

      {/* Active Downloads Indicator */}
      {downloadCount > 0 && !collapsed && (
        <section className="sidebar-downloads" aria-label="Aktive Downloads">
          <div className="sidebar-downloads-header">
            <FiDownload className="spin-slow" aria-hidden="true" />
            <span>Downloads</span>
          </div>
          <ul className="sidebar-downloads-list">
            {activeDownloads.slice(0, 3).map(dl => (
              <li key={dl.modelId} className="sidebar-download-item">
                <span className="sidebar-download-name">{dl.modelName || dl.modelId}</span>
                <div
                  className="sidebar-download-progress"
                  role="progressbar"
                  aria-valuenow={dl.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${dl.modelName || dl.modelId} Download`}
                >
                  <div
                    className="sidebar-download-bar"
                    style={{ width: `${dl.progress}%` }}
                  />
                </div>
                <span className="sidebar-download-percent" aria-hidden="true">{dl.progress}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="sidebar-footer">
        <Link
          to="/settings"
          className={`nav-link ${isActive('/settings')}`}
          aria-current={isCurrent('/settings') ? 'page' : undefined}
        >
          <FiSettings aria-hidden="true" /> <span>Einstellungen</span>
        </Link>
      </div>
    </aside>
  );
});

// PHASE 2: Memoize DashboardHome to prevent re-renders when props haven't changed
const DashboardHome = React.memo(function DashboardHome({
  metrics,
  metricsHistory,
  services,
  workflows,
  systemInfo,
  networkInfo,
  runningApps,
  formatChartData,
  formatUptime,
  getStatusColor,
  thresholds,
  deviceInfo
}) {
  // Default thresholds if not loaded yet
  const defaultThresholds = {
    cpu: { warning: 70, critical: 90 },
    ram: { warning: 70, critical: 90 },
    gpu: { warning: 80, critical: 95 },
    storage: { warning: 70, critical: 85 },
    temperature: { warning: 65, critical: 80 }
  };

  const t = thresholds || defaultThresholds;

  // Helper function to get status info based on value and metric thresholds
  const getStatusInfo = (value, metric) => {
    const threshold = t[metric];
    if (!threshold) return { status: 'Normal', className: 'stat-change-positive' };

    if (value >= threshold.critical) {
      return { status: 'Critical', className: 'stat-change-negative' };
    }
    if (value >= threshold.warning) {
      return { status: 'Warning', className: 'stat-change-warning' };
    }
    return { status: 'Normal', className: 'stat-change-positive' };
  };

  // Temperature-specific status labels
  const getTempStatusInfo = (value) => {
    const threshold = t.temperature;
    if (value >= threshold.critical) {
      return { status: 'Hot', className: 'stat-change-negative' };
    }
    if (value >= threshold.warning) {
      return { status: 'Warm', className: 'stat-change-warning' };
    }
    return { status: 'Normal', className: 'stat-change-positive' };
  };

  // Chart zoom state
  const [chartTimeRange, setChartTimeRange] = useState(24); // hours
  const timeRangeOptions = [1, 6, 12, 24];

  // Memoized chart data - only recalculate when data or timeRange changes
  const chartData = useMemo(() => {
    const allData = formatChartData();
    if (!allData.length) return [];

    const now = Date.now();
    const cutoff = now - (chartTimeRange * 60 * 60 * 1000);
    return allData.filter(d => d.timestamp >= cutoff);
  }, [formatChartData, chartTimeRange]);

  // Icon mapping for apps
  const getAppIcon = (iconName) => {
    const icons = {
      'FiZap': FiZap,
      'FiDatabase': FiDatabase,
      'FiCode': FiCode,
      'FiGitBranch': FiGitBranch,
      'FiBox': FiBox,
      'FiTerminal': FiTerminal,
      'FiSend': FiSend
    };
    const IconComponent = icons[iconName] || FiBox;
    return <IconComponent className="service-link-icon" />;
  };

  // Get app URL based on port or traefik route
  const getAppUrl = (app) => {
    // Apps with custom pages should link internally
    if (app.hasCustomPage && app.customPageRoute) {
      return app.customPageRoute;
    }
    // Apps routed through Traefik path (use same origin, no port)
    const traefikPaths = {
      'n8n': '/n8n'
    };
    if (traefikPaths[app.id]) {
      return `${window.location.origin}${traefikPaths[app.id]}`;
    }
    // Use external port if available
    if (app.ports?.external) {
      return `http://${window.location.hostname}:${app.ports.external}`;
    }
    // Fallback to known ports for direct access
    const knownPorts = {
      'minio': 9001,
      'code-server': 8443,
      'gitea': 3002
    };
    if (knownPorts[app.id]) {
      return `http://${window.location.hostname}:${knownPorts[app.id]}`;
    }
    return '#';
  };

  // Check if app link should be internal (React Router) or external
  const isInternalLink = (app) => {
    return app.hasCustomPage && app.customPageRoute;
  };
  // Dynamic progress color based on thresholds
  const getProgressColor = (value, metric = 'cpu') => {
    const threshold = t[metric] || { warning: 70, critical: 90 };
    if (value >= threshold.critical) return '#ef4444';
    if (value >= threshold.warning) return '#f59e0b';
    return '#45ADFF';
  };

  const formatBytes = (bytes) => {
    return (bytes / 1024 / 1024 / 1024).toFixed(0);
  };

  const totalDisk = ((metrics?.disk?.used || 0) + (metrics?.disk?.free || 0));
  const usedDisk = metrics?.disk?.used || 0;

  return (
    <div className="container">
      {/* Top Stats Row */}
      <div className="stats-top-row">
        <div className="stat-card-large">
          <div className="stat-icon-wrapper">
            <FiCpu className="stat-icon" />
          </div>
          <div className="stat-content">
            <div className="stat-label">CPU USAGE</div>
            <div className="stat-value-large">{metrics?.cpu?.toFixed(1) || 0}<span className="stat-unit">%</span></div>
            <div className={`stat-change ${getStatusInfo(metrics?.cpu || 0, 'cpu').className}`}>
              {getStatusInfo(metrics?.cpu || 0, 'cpu').status}
            </div>
          </div>
        </div>

        <div className="stat-card-large">
          <div className="stat-icon-wrapper">
            <FiActivity className="stat-icon" />
          </div>
          <div className="stat-content">
            <div className="stat-label">RAM USAGE</div>
            <div className="stat-value-large">{metrics?.ram?.toFixed(1) || 0}<span className="stat-unit">%</span></div>
            <div className={`stat-change ${getStatusInfo(metrics?.ram || 0, 'ram').className}`}>
              {getStatusInfo(metrics?.ram || 0, 'ram').status}
            </div>
          </div>
        </div>

        <div className="stat-card-large">
          <div className="stat-icon-wrapper">
            <FiHardDrive className="stat-icon" />
          </div>
          <div className="stat-content">
            <div className="stat-label">STORAGE</div>
            <div className="stat-value-large">{metrics?.disk?.percent?.toFixed(0) || 0}<span className="stat-unit">%</span></div>
            <div className="storage-bar-container">
              <div
                className="storage-bar-fill"
                style={{
                  width: `${metrics?.disk?.percent || 0}%`,
                  background: getProgressColor(metrics?.disk?.percent || 0, 'storage')
                }}
              />
            </div>
            <div className="stat-sublabel">{formatBytes(usedDisk)} / {formatBytes(totalDisk)} GB</div>
          </div>
        </div>

        <div className="stat-card-large">
          <div className="stat-icon-wrapper">
            <FiThermometer className="stat-icon" />
          </div>
          <div className="stat-content">
            <div className="stat-label">TEMPERATURE</div>
            <div className="stat-value-large">{metrics?.temperature?.toFixed(0) || 0}<span className="stat-unit">°C</span></div>
            <div className={`stat-change ${getTempStatusInfo(metrics?.temperature || 0).className}`}>
              {getTempStatusInfo(metrics?.temperature || 0).status}
            </div>
          </div>
        </div>
      </div>

      {/* Installed Apps - Dynamic */}
      {runningApps && runningApps.length > 0 && (
        <div className="service-links-modern">
          {runningApps.filter(app => app.status === 'running').map(app => (
            isInternalLink(app) ? (
              <Link
                key={app.id}
                to={getAppUrl(app)}
                className="service-link-card"
              >
                <div className="service-link-icon-wrapper">
                  {getAppIcon(app.icon)}
                </div>
                <div className="service-link-content">
                  <div className="service-link-name">{app.name}</div>
                  <div className="service-link-description">{app.description}</div>
                </div>
                <FiExternalLink className="service-link-arrow" />
              </Link>
            ) : (
              <a
                key={app.id}
                href={getAppUrl(app)}
                target="_blank"
                rel="noopener noreferrer"
                className="service-link-card"
              >
                <div className="service-link-icon-wrapper">
                  {getAppIcon(app.icon)}
                </div>
                <div className="service-link-content">
                  <div className="service-link-name">{app.name}</div>
                  <div className="service-link-description">{app.description}</div>
                </div>
                <FiExternalLink className="service-link-arrow" />
              </a>
            )
          ))}
        </div>
      )}

      {/* Main Content Grid */}
      <div className="dashboard-grid">
        {/* 24h Performance Chart */}
        <div className="dashboard-card dashboard-card-large">
          <div className="chart-header">
            <h3 className="dashboard-card-title">Performance</h3>
            <div className="chart-zoom-controls">
              {timeRangeOptions.map(hours => (
                <button
                  key={hours}
                  className={`chart-zoom-btn ${chartTimeRange === hours ? 'active' : ''}`}
                  onClick={() => setChartTimeRange(hours)}
                >
                  {hours}h
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(69, 173, 255, 0.1)" />
              <XAxis
                dataKey="time"
                stroke="#94a3b8"
                tick={{ fill: '#94a3b8', fontSize: '0.75rem' }}
                axisLine={{ stroke: '#94a3b8' }}
                tickLine={{ stroke: '#94a3b8' }}
                interval="preserveStartEnd"
                minTickGap={60}
              />
              <YAxis
                stroke="#94a3b8"
                tick={{ fill: '#94a3b8', fontSize: '0.75rem' }}
                axisLine={{ stroke: '#94a3b8' }}
                tickLine={{ stroke: '#94a3b8' }}
                domain={[0, 100]}
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip
                contentStyle={{
                  background: 'linear-gradient(135deg, #1a2330 0%, #1f2835 100%)',
                  border: '1px solid rgba(69, 173, 255, 0.3)',
                  borderRadius: '10px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)'
                }}
                labelStyle={{ color: '#45ADFF', fontWeight: 600 }}
                formatter={(value, name) => {
                  const unit = name === 'Temp' ? '°C' : '%';
                  return [`${value?.toFixed(1)}${unit}`, name];
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="CPU" stroke="#45ADFF" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="RAM" stroke="#8b5cf6" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="GPU" stroke="#06b6d4" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="Temp" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* AI Services Status */}
        <div className="dashboard-card">
          <h3 className="dashboard-card-title">AI Services</h3>
          <div className="services-list">
            <div className="service-item-modern">
              <div className={`service-indicator ${services?.llm?.status === 'healthy' ? 'service-healthy' : 'service-error'}`} />
              <div className="service-info">
                <div className="service-name">LLM Service</div>
                <div className="service-status">{services?.llm?.status || 'unknown'}</div>
              </div>
            </div>
            <div className="service-item-modern">
              <div className={`service-indicator ${services?.embeddings?.status === 'healthy' ? 'service-healthy' : 'service-error'}`} />
              <div className="service-info">
                <div className="service-name">Embeddings</div>
                <div className="service-status">{services?.embeddings?.status || 'unknown'}</div>
              </div>
            </div>
            <div className="service-item-modern">
              <div className={`service-indicator ${networkInfo?.internet_reachable ? 'service-healthy' : 'service-error'}`} />
              <div className="service-info">
                <div className="service-name">Internet</div>
                <div className="service-status">{networkInfo?.internet_reachable ? 'Connected' : 'Offline'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* System Info */}
        <div className="dashboard-card">
          <h3 className="dashboard-card-title">System Info</h3>
          <div className="info-list-modern">
            <div className="info-item-modern">
              <span className="info-label-modern">Device</span>
              <span className="info-value-modern">{deviceInfo?.name || 'Detecting...'}</span>
            </div>
            <div className="info-item-modern">
              <span className="info-label-modern">Uptime</span>
              <span className="info-value-modern">{systemInfo?.uptime_seconds ? formatUptime(systemInfo.uptime_seconds) : 'N/A'}</span>
            </div>
            <div className="info-item-modern">
              <span className="info-label-modern">Version</span>
              <span className="info-value-modern">{systemInfo?.version || '1.0.0'}</span>
            </div>
            <div className="info-item-modern">
              <span className="info-label-modern">Hostname</span>
              <span className="info-value-modern">{systemInfo?.hostname || 'arasul'}</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
});

export default App;
