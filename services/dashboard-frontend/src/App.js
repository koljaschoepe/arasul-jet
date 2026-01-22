import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BrowserRouter as Router, Route, Routes, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { FiCpu, FiHardDrive, FiActivity, FiThermometer, FiLogOut, FiHome, FiSettings, FiMessageSquare, FiZap, FiDatabase, FiExternalLink, FiFileText, FiPackage, FiCode, FiGitBranch, FiBox, FiTerminal, FiChevronLeft, FiSend, FiDownload } from 'react-icons/fi';
import Login from './components/Login';
import Settings from './components/Settings';
import ChatMulti from './components/ChatMulti';
import DocumentManager from './components/DocumentManager';
import AppStore from './components/AppStore';
import ModelStore from './components/ModelStore';
import ClaudeCode from './components/ClaudeCode';
import TelegramBotApp from './components/TelegramBotApp';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingSpinner from './components/LoadingSpinner';
import { DownloadProvider, useDownloads } from './contexts/DownloadContext';
import { API_BASE } from './config/api';
import './index.css';
// WebSocket URL: use wss:// if page is https://, otherwise ws://
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE = process.env.REACT_APP_WS_URL || `${WS_PROTOCOL}//${window.location.host}/api`;

// Enable sending cookies with all requests (for LAN access support)
axios.defaults.withCredentials = true;

// Axios interceptor for authentication
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

// Track if we're already handling a 401 to prevent reload loops
let isHandling401 = false;

// Axios interceptor for 401 responses
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    // Don't trigger logout for auth/me endpoint (that's expected when not logged in)
    const isAuthMeRequest = error.config?.url?.includes('/auth/me');
    const isAuthRequest = error.config?.url?.includes('/auth/');

    if (error.response?.status === 401 && !isAuthMeRequest && !isHandling401) {
      // Token expired or invalid for a protected endpoint
      isHandling401 = true;
      console.log('[Auth] 401 received, clearing token and redirecting to login');
      localStorage.removeItem('arasul_token');
      localStorage.removeItem('arasul_user');

      // Use a short delay to allow current request cycle to complete
      setTimeout(() => {
        // Only reload if we're not already on the login page
        if (window.location.pathname !== '/') {
          window.location.href = '/';
        }
        isHandling401 = false;
      }, 100);
    }
    return Promise.reject(error);
  }
);

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [systemStatus, setSystemStatus] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [metricsHistory, setMetricsHistory] = useState(null);
  const [services, setServices] = useState(null);
  const [workflows, setWorkflows] = useState(null);
  const [systemInfo, setSystemInfo] = useState(null);
  const [networkInfo, setNetworkInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ws, setWs] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsReconnecting, setWsReconnecting] = useState(false);
  const [runningApps, setRunningApps] = useState([]);
  const [thresholds, setThresholds] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(null);

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

  // Check for existing session on mount (supports both localStorage and cookie-based auth)
  useEffect(() => {
    const verifyAuth = async () => {
      try {
        // Try to verify with backend (works with both cookie and localStorage token)
        const response = await axios.get(`${API_BASE}/auth/me`);
        if (response.data.user) {
          setIsAuthenticated(true);
          setUser(response.data.user);
          // Sync localStorage for consistency
          localStorage.setItem('arasul_user', JSON.stringify(response.data.user));
        } else {
          setLoading(false);
        }
      } catch (err) {
        // Cookie/token invalid - check localStorage fallback
        const token = localStorage.getItem('arasul_token');
        const storedUser = localStorage.getItem('arasul_user');

        if (token && storedUser) {
          // Try with localStorage token (will be added by interceptor)
          try {
            const retryResponse = await axios.get(`${API_BASE}/auth/me`);
            if (retryResponse.data.user) {
              setIsAuthenticated(true);
              setUser(retryResponse.data.user);
            } else {
              localStorage.removeItem('arasul_token');
              localStorage.removeItem('arasul_user');
              setLoading(false);
            }
          } catch {
            localStorage.removeItem('arasul_token');
            localStorage.removeItem('arasul_user');
            setLoading(false);
          }
        } else {
          setLoading(false);
        }
      }
    };

    verifyAuth();
  }, []);

  // Handle login success
  const handleLoginSuccess = (data) => {
    setIsAuthenticated(true);
    setUser(data.user);
    setLoading(true);
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await axios.post(`${API_BASE}/auth/logout`);
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      localStorage.removeItem('arasul_token');
      localStorage.removeItem('arasul_user');
      setIsAuthenticated(false);
      setUser(null);
    }
  };

  // Fetch initial data
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
      setLoading(false);
      setError(null);

    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.message);
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Setup WebSocket for live metrics with robust reconnect logic
  useEffect(() => {
    if (!isAuthenticated) return;

    fetchData();

    let websocket = null;
    let reconnectTimer = null;
    let reconnectAttempts = 0;
    let maxReconnectAttempts = 10;
    let isIntentionallyClosed = false;

    const calculateReconnectDelay = (attempt) => {
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      // Add jitter ±25%
      const jitter = delay * 0.25 * (Math.random() * 2 - 1);
      return Math.floor(delay + jitter);
    };

    let httpPollingInterval = null;

    const startHttpPolling = () => {
      console.log('Starting HTTP polling fallback for metrics...');

      // Poll every 5 seconds (same as WebSocket)
      httpPollingInterval = setInterval(async () => {
        try {
          const metricsRes = await axios.get(`${API_BASE}/metrics/live`);
          setMetrics(metricsRes.data);
        } catch (err) {
          console.error('HTTP polling error:', err);
        }
      }, 5000);
    };

    const connectWebSocket = () => {
      try {
        websocket = new WebSocket(`${WS_BASE}/metrics/live-stream`);

        websocket.onopen = () => {
          console.log('WebSocket connected to live metrics stream');
          reconnectAttempts = 0; // Reset attempts on successful connection
          setWsConnected(true);
          setWsReconnecting(false);

          // Stop HTTP polling if it was running
          if (httpPollingInterval) {
            clearInterval(httpPollingInterval);
            httpPollingInterval = null;
          }
        };

        websocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            // Only update if data doesn't contain an error
            if (!data.error) {
              setMetrics(data);
            } else {
              console.warn('Metrics service temporarily unavailable:', data.error);
            }
          } catch (err) {
            console.error('WebSocket message error:', err);
          }
        };

        websocket.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

        websocket.onclose = (event) => {
          setWsConnected(false);

          // Don't reconnect if closed intentionally
          if (isIntentionallyClosed) {
            console.log('WebSocket closed intentionally');
            return;
          }

          console.log(`WebSocket disconnected (code: ${event.code})`);

          // Check if we should retry
          if (reconnectAttempts >= maxReconnectAttempts) {
            console.error('Max reconnect attempts reached. Falling back to HTTP polling.');
            setWsReconnecting(false);
            // Start HTTP polling fallback
            startHttpPolling();
            return;
          }

          reconnectAttempts++;
          setWsReconnecting(true);
          const delay = calculateReconnectDelay(reconnectAttempts - 1);

          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})...`);

          reconnectTimer = setTimeout(() => {
            connectWebSocket();
          }, delay);
        };

        setWs(websocket);

      } catch (error) {
        console.error('Failed to create WebSocket:', error);

        // Retry connection
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          setWsReconnecting(true);
          const delay = calculateReconnectDelay(reconnectAttempts - 1);
          reconnectTimer = setTimeout(() => {
            connectWebSocket();
          }, delay);
        } else {
          // Fallback to HTTP polling
          startHttpPolling();
        }
      }
    };

    // Initial connection
    connectWebSocket();

    // Refresh non-metric data every 30 seconds
    const interval = setInterval(() => {
      fetchData();
    }, 30000);

    return () => {
      isIntentionallyClosed = true;
      if (websocket) {
        websocket.close();
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (httpPollingInterval) {
        clearInterval(httpPollingInterval);
      }
      clearInterval(interval);
    };
  }, [fetchData, isAuthenticated]);

  const getStatusColor = (status) => {
    if (status === 'OK') return 'status-ok';
    if (status === 'WARNING') return 'status-warning';
    return 'status-critical';
  };

  const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

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

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  if (loading) {
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
    <ErrorBoundary>
      <DownloadProvider>
        <Router>
          <div className="app">
            <SidebarWithDownloads
              systemStatus={systemStatus}
              getStatusColor={getStatusColor}
              collapsed={sidebarCollapsed}
              onToggle={toggleSidebar}
            />

          <div className="container">
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
          </div>
        </div>
        </Router>
      </DownloadProvider>
    </ErrorBoundary>
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

function Sidebar({ systemStatus, getStatusColor, collapsed, onToggle, downloadCount = 0, activeDownloads = [] }) {
  const location = useLocation();

  const isActive = (path) => {
    return location.pathname === path ? 'nav-link active' : 'nav-link';
  };

  // Build className based on collapsed state
  const sidebarClassName = `sidebar ${collapsed ? 'collapsed' : 'expanded'}`;

  return (
    <div className={sidebarClassName}>
      <div className="sidebar-header">
        <h1 className="sidebar-title">{collapsed ? 'A' : 'Arasul'}</h1>
        <p className="sidebar-subtitle">Edge AI Platform</p>
        <button
          className="sidebar-toggle"
          onClick={onToggle}
          title={collapsed ? 'Sidebar erweitern (Ctrl+B)' : 'Sidebar minimieren (Ctrl+B)'}
        >
          <FiChevronLeft />
        </button>
      </div>

      <nav className="navigation">
        <div className="nav-bar">
          <Link to="/" className={isActive('/')} title="Dashboard">
            <FiHome /> <span>Dashboard</span>
          </Link>
          <Link to="/chat" className={isActive('/chat')} title="AI Chat">
            <FiMessageSquare /> <span>AI Chat</span>
          </Link>
          <Link to="/documents" className={isActive('/documents')} title="Dokumente">
            <FiFileText /> <span>Dokumente</span>
          </Link>
          <Link to="/appstore" className={isActive('/appstore')} title="Store">
            <FiPackage /> <span>Store</span>
          </Link>
          <Link to="/models" className={`${isActive('/models')} ${downloadCount > 0 ? 'has-downloads' : ''}`} title="KI-Modelle">
            <FiBox />
            <span>KI-Modelle</span>
            {downloadCount > 0 && (
              <span className="download-badge" title={`${downloadCount} Download(s) aktiv`}>
                <FiDownload className="download-badge-icon" />
                {!collapsed && downloadCount}
              </span>
            )}
          </Link>
        </div>
      </nav>

      {/* Active Downloads Indicator */}
      {downloadCount > 0 && !collapsed && (
        <div className="sidebar-downloads">
          <div className="sidebar-downloads-header">
            <FiDownload className="spin-slow" />
            <span>Downloads</span>
          </div>
          <div className="sidebar-downloads-list">
            {activeDownloads.slice(0, 3).map(dl => (
              <div key={dl.modelId} className="sidebar-download-item">
                <span className="sidebar-download-name">{dl.modelName || dl.modelId}</span>
                <div className="sidebar-download-progress">
                  <div
                    className="sidebar-download-bar"
                    style={{ width: `${dl.progress}%` }}
                  />
                </div>
                <span className="sidebar-download-percent">{dl.progress}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        {/* Einstellungen-Link */}
        <Link to="/settings" className={`nav-link ${isActive('/settings')}`} title="Einstellungen">
          <FiSettings /> <span>Einstellungen</span>
        </Link>
      </div>
    </div>
  );
}

function DashboardHome({
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
}

export default App;
