import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Route, Routes, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { FiCpu, FiHardDrive, FiActivity, FiThermometer, FiLogOut, FiHome, FiSettings, FiMessageSquare, FiZap, FiDatabase, FiExternalLink, FiFileText } from 'react-icons/fi';
import Login from './components/Login';
import Settings from './components/Settings';
import ChatMulti from './components/ChatMulti';
import DocumentManager from './components/DocumentManager';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingSpinner from './components/LoadingSpinner';
import './index.css';

const API_BASE = process.env.REACT_APP_API_URL || '/api';
// WebSocket URL: use wss:// if page is https://, otherwise ws://
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE = process.env.REACT_APP_WS_URL || `${WS_PROTOCOL}//${window.location.host}/api`;

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

// Axios interceptor for 401 responses
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('arasul_token');
      localStorage.removeItem('arasul_user');
      window.location.reload();
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

  // Check for existing token on mount
  useEffect(() => {
    const token = localStorage.getItem('arasul_token');
    const storedUser = localStorage.getItem('arasul_user');

    if (token && storedUser) {
      setIsAuthenticated(true);
      setUser(JSON.parse(storedUser));
    } else {
      setLoading(false);
    }
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
      const [statusRes, metricsRes, historyRes, servicesRes, workflowsRes, infoRes, networkRes] = await Promise.all([
        axios.get(`${API_BASE}/system/status`),
        axios.get(`${API_BASE}/metrics/live`),
        axios.get(`${API_BASE}/metrics/history?range=24h`),
        axios.get(`${API_BASE}/services`),
        axios.get(`${API_BASE}/workflows/activity`),
        axios.get(`${API_BASE}/system/info`),
        axios.get(`${API_BASE}/system/network`)
      ]);

      setSystemStatus(statusRes.data);
      setMetrics(metricsRes.data);
      setMetricsHistory(historyRes.data);
      setServices(servicesRes.data);
      setWorkflows(workflowsRes.data);
      setSystemInfo(infoRes.data);
      setNetworkInfo(networkRes.data);
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

  const formatChartData = () => {
    if (!metricsHistory) return [];

    return metricsHistory.timestamps.map((timestamp, index) => ({
      time: new Date(timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      CPU: metricsHistory.cpu[index],
      RAM: metricsHistory.ram[index],
      GPU: metricsHistory.gpu[index],
      Temp: metricsHistory.temperature[index]
    }));
  };

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
      <Router>
        <div className="app">
          <Sidebar
            handleLogout={handleLogout}
            systemStatus={systemStatus}
            getStatusColor={getStatusColor}
          />

          <div className="container">
            <TopBar
              wsConnected={wsConnected}
              wsReconnecting={wsReconnecting}
              systemStatus={systemStatus}
              getStatusColor={getStatusColor}
            />

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
                    formatChartData={formatChartData}
                    formatUptime={formatUptime}
                    getStatusColor={getStatusColor}
                  />
                }
              />
              <Route path="/settings" element={<Settings />} />
              <Route path="/chat" element={<ChatMulti />} />
              <Route path="/documents" element={<DocumentManager />} />
            </Routes>
          </div>
        </div>
      </Router>
    </ErrorBoundary>
  );
}

function Sidebar({ handleLogout, systemStatus, getStatusColor }) {
  const location = useLocation();

  const isActive = (path) => {
    return location.pathname === path ? 'nav-link active' : 'nav-link';
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1 className="sidebar-title">Arasul</h1>
        <p className="sidebar-subtitle">Edge AI Platform</p>
      </div>

      <nav className="navigation">
        <div className="nav-bar">
          <Link to="/" className={isActive('/')}>
            <FiHome /> Dashboard
          </Link>
          <Link to="/chat" className={isActive('/chat')}>
            <FiMessageSquare /> AI Chat
          </Link>
          <Link to="/documents" className={isActive('/documents')}>
            <FiFileText /> Dokumente
          </Link>
          <Link to="/settings" className={isActive('/settings')}>
            <FiSettings /> Einstellungen
          </Link>
        </div>
      </nav>

      <div className="sidebar-footer">
        <button
          onClick={handleLogout}
          className="logout-button"
          style={{ width: '100%', justifyContent: 'center' }}
          title="Logout"
        >
          <FiLogOut /> Logout
        </button>
      </div>
    </div>
  );
}

function TopBar({ wsConnected, wsReconnecting, systemStatus, getStatusColor }) {
  return (
    <div className="header">
      {/* System messages removed as requested */}
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
  formatChartData,
  formatUptime,
  getStatusColor
}) {
  const getProgressColor = (value) => {
    if (value >= 90) return '#ef4444';
    if (value >= 70) return '#f59e0b';
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
            <div className={`stat-change ${metrics?.cpu < 70 ? 'stat-change-positive' : 'stat-change-negative'}`}>
              {metrics?.cpu < 70 ? '↑' : '↓'} Normal
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
            <div className={`stat-change ${metrics?.ram < 70 ? 'stat-change-positive' : 'stat-change-negative'}`}>
              {metrics?.ram < 70 ? '↑' : '↓'} {metrics?.ram < 70 ? 'Normal' : 'High'}
            </div>
          </div>
        </div>

        <div className="stat-card-large">
          <div className="stat-icon-wrapper">
            <FiHardDrive className="stat-icon" />
          </div>
          <div className="stat-content">
            <div className="stat-label">STORAGE</div>
            <div className="stat-value-large">{formatBytes(usedDisk)}<span className="stat-unit">GB</span></div>
            <div className="stat-sublabel">{formatBytes(totalDisk)}GB Total</div>
          </div>
        </div>

        <div className="stat-card-large">
          <div className="stat-icon-wrapper">
            <FiThermometer className="stat-icon" />
          </div>
          <div className="stat-content">
            <div className="stat-label">TEMPERATURE</div>
            <div className="stat-value-large">{metrics?.temperature?.toFixed(0) || 0}<span className="stat-unit">°C</span></div>
            <div className={`stat-change ${metrics?.temperature < 70 ? 'stat-change-positive' : 'stat-change-negative'}`}>
              {metrics?.temperature < 70 ? '↑' : '↓'} {metrics?.temperature < 70 ? 'Normal' : 'High'}
            </div>
          </div>
        </div>
      </div>

      {/* Service Links */}
      <div className="service-links-modern">
        <a
          href={`http://${window.location.hostname}:5678`}
          target="_blank"
          rel="noopener noreferrer"
          className="service-link-card"
        >
          <div className="service-link-icon-wrapper">
            <FiZap className="service-link-icon" />
          </div>
          <div className="service-link-content">
            <div className="service-link-name">n8n Workflows</div>
            <div className="service-link-description">Automation & Integration</div>
          </div>
          <FiExternalLink className="service-link-arrow" />
        </a>

        <a
          href={`http://${window.location.hostname}:9001`}
          target="_blank"
          rel="noopener noreferrer"
          className="service-link-card"
        >
          <div className="service-link-icon-wrapper">
            <FiDatabase className="service-link-icon" />
          </div>
          <div className="service-link-content">
            <div className="service-link-name">MinIO Storage</div>
            <div className="service-link-description">Object Storage Console</div>
          </div>
          <FiExternalLink className="service-link-arrow" />
        </a>
      </div>

      {/* Main Content Grid */}
      <div className="dashboard-grid">
        {/* 24h Performance Chart */}
        <div className="dashboard-card dashboard-card-large">
          <h3 className="dashboard-card-title">24h Performance</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={formatChartData()}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(69, 173, 255, 0.1)" />
              <XAxis dataKey="time" stroke="#94a3b8" style={{ fontSize: '0.85rem' }} />
              <YAxis stroke="#94a3b8" style={{ fontSize: '0.85rem' }} />
              <Tooltip
                contentStyle={{
                  background: 'linear-gradient(135deg, #1a2330 0%, #1f2835 100%)',
                  border: '1px solid rgba(69, 173, 255, 0.3)',
                  borderRadius: '10px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)'
                }}
                labelStyle={{ color: '#45ADFF', fontWeight: 600 }}
              />
              <Legend />
              <Line type="monotone" dataKey="CPU" stroke="#45ADFF" strokeWidth={2.5} dot={false} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="RAM" stroke="#8b5cf6" strokeWidth={2.5} dot={false} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="GPU" stroke="#06b6d4" strokeWidth={2.5} dot={false} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="Temp" stroke="#f59e0b" strokeWidth={2.5} dot={false} activeDot={{ r: 6 }} />
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

      {/* Minimal System Overview - REMOVED */}
      <div className="metrics-overview" style={{ display: 'none' }}>
        {/* CPU Metric */}
        <div className="metric-card-minimal">
          <div className="metric-header-minimal">
            <span className="metric-label-minimal">CPU</span>
            <span className="metric-value-minimal">{metrics?.cpu?.toFixed(0) || 0}%</span>
          </div>
          <div className="progress-bar-container">
            <div
              className="progress-bar"
              style={{
                width: `${metrics?.cpu || 0}%`,
                background: getProgressColor(metrics?.cpu || 0)
              }}
            />
          </div>
        </div>

        {/* RAM Metric */}
        <div className="metric-card-minimal">
          <div className="metric-header-minimal">
            <span className="metric-label-minimal">RAM</span>
            <span className="metric-value-minimal">{metrics?.ram?.toFixed(0) || 0}%</span>
          </div>
          <div className="progress-bar-container">
            <div
              className="progress-bar"
              style={{
                width: `${metrics?.ram || 0}%`,
                background: getProgressColor(metrics?.ram || 0)
              }}
            />
          </div>
        </div>

        {/* GPU Metric */}
        <div className="metric-card-minimal">
          <div className="metric-header-minimal">
            <span className="metric-label-minimal">GPU</span>
            <span className="metric-value-minimal">{metrics?.gpu?.toFixed(0) || 0}%</span>
          </div>
          <div className="progress-bar-container">
            <div
              className="progress-bar"
              style={{
                width: `${metrics?.gpu || 0}%`,
                background: getProgressColor(metrics?.gpu || 0)
              }}
            />
          </div>
        </div>

        {/* Storage Metric */}
        <div className="metric-card-minimal">
          <div className="metric-header-minimal">
            <span className="metric-label-minimal">Speicher</span>
            <span className="metric-value-minimal">{metrics?.disk?.percent?.toFixed(0) || 0}%</span>
          </div>
          <div className="progress-bar-container">
            <div
              className="progress-bar"
              style={{
                width: `${metrics?.disk?.percent || 0}%`,
                background: getProgressColor(metrics?.disk?.percent || 0)
              }}
            />
          </div>
        </div>

        {/* Temperature Metric */}
        <div className="metric-card-minimal">
          <div className="metric-header-minimal">
            <span className="metric-label-minimal"><FiThermometer /> Temp</span>
            <span className="metric-value-minimal">{metrics?.temperature?.toFixed(0) || 0}°C</span>
          </div>
          <div className="temp-indicator" style={{
            background: metrics?.temperature > 80 ? '#ef4444' :
                       metrics?.temperature > 70 ? '#f59e0b' : '#45ADFF',
            height: '4px',
            borderRadius: '2px',
            marginTop: '0.5rem'
          }} />
        </div>

        {/* AI Services Status */}
        <div className="metric-card-minimal">
          <div className="metric-header-minimal">
            <span className="metric-label-minimal"><FiCpu /> AI Services</span>
          </div>
          <div className="services-status-minimal">
            <div className="service-status-item">
              <div className={`status-dot ${services?.llm?.status === 'healthy' ? 'status-dot-ok' : 'status-dot-error'}`} />
              <span>LLM</span>
            </div>
            <div className="service-status-item">
              <div className={`status-dot ${services?.embeddings?.status === 'healthy' ? 'status-dot-ok' : 'status-dot-error'}`} />
              <span>Embeddings</span>
            </div>
          </div>
        </div>

        {/* Internet Status */}
        <div className="metric-card-minimal">
          <div className="metric-header-minimal">
            <span className="metric-label-minimal">Konnektivität</span>
          </div>
          <div className="services-status-minimal">
            <div className="service-status-item">
              <div className={`status-dot ${networkInfo?.internet_reachable ? 'status-dot-ok' : 'status-dot-error'}`} />
              <span>Internet</span>
            </div>
            <div className="service-status-item">
              <div className="status-dot status-dot-ok" />
              <span>{networkInfo?.mdns || 'Local'}</span>
            </div>
          </div>
        </div>

        {/* System Info */}
        <div className="metric-card-minimal">
          <div className="metric-header-minimal">
            <span className="metric-label-minimal">System</span>
          </div>
          <div className="system-info-minimal">
            <div className="info-row-minimal">
              <span className="info-label-minimal">Uptime</span>
              <span className="info-value-minimal">
                {systemInfo?.uptime_seconds ? formatUptime(systemInfo.uptime_seconds) : 'N/A'}
              </span>
            </div>
            <div className="info-row-minimal">
              <span className="info-label-minimal">Version</span>
              <span className="info-value-minimal">{systemInfo?.version || '1.0.0'}</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

export default App;
