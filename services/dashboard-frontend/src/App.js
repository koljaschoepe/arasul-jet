import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Route, Routes, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { FiCpu, FiHardDrive, FiActivity, FiThermometer, FiLogOut, FiHome, FiUpload, FiTool } from 'react-icons/fi';
import Login from './components/Login';
import UpdatePage from './components/UpdatePage';
import SelfHealingEvents from './components/SelfHealingEvents';
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

    const connectWebSocket = () => {
      try {
        websocket = new WebSocket(`${WS_BASE}/metrics/live-stream`);

        websocket.onopen = () => {
          console.log('WebSocket connected');
          reconnectAttempts = 0; // Reset attempts on successful connection
        };

        websocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            setMetrics(data);
          } catch (err) {
            console.error('WebSocket message error:', err);
          }
        };

        websocket.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

        websocket.onclose = (event) => {
          // Don't reconnect if closed intentionally
          if (isIntentionallyClosed) {
            console.log('WebSocket closed intentionally');
            return;
          }

          console.log(`WebSocket disconnected (code: ${event.code})`);

          // Check if we should retry
          if (reconnectAttempts >= maxReconnectAttempts) {
            console.error('Max reconnect attempts reached. Please refresh the page.');
            return;
          }

          reconnectAttempts++;
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
          const delay = calculateReconnectDelay(reconnectAttempts - 1);
          reconnectTimer = setTimeout(() => {
            connectWebSocket();
          }, delay);
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
          <Navigation handleLogout={handleLogout} systemStatus={systemStatus} getStatusColor={getStatusColor} />

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
            <Route path="/updates" element={<UpdatePage />} />
            <Route path="/self-healing" element={<SelfHealingEvents />} />
          </Routes>
        </div>
      </Router>
    </ErrorBoundary>
  );
}

function Navigation({ handleLogout, systemStatus, getStatusColor }) {
  const location = useLocation();

  const isActive = (path) => {
    return location.pathname === path ? 'nav-link active' : 'nav-link';
  };

  return (
    <div className="navigation">
      <header className="header">
        <div>
          <h1 className="header-title">Arasul Platform</h1>
          <p className="header-subtitle">Edge AI Management System</p>
        </div>
        <div className="header-status">
          <div className={`status-badge ${getStatusColor(systemStatus?.status)}`}>
            {systemStatus?.status || 'UNKNOWN'}
          </div>
          {systemStatus?.self_healing_active && (
            <div className="status-badge status-ok">
              Self-Healing Active
            </div>
          )}
          <button
            onClick={handleLogout}
            className="logout-button"
            title="Logout"
          >
            <FiLogOut />
          </button>
        </div>
      </header>

      <nav className="nav-bar">
        <Link to="/" className={isActive('/')}>
          <FiHome /> Dashboard
        </Link>
        <Link to="/updates" className={isActive('/updates')}>
          <FiUpload /> Updates
        </Link>
        <Link to="/self-healing" className={isActive('/self-healing')}>
          <FiTool /> Self-Healing
        </Link>
      </nav>
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
  return (
    <div className="container">
      {/* System Cards */}
      <div className="cards-grid">
        {/* System Performance Card */}
        <div className="card">
          <h3 className="card-title">
            <FiActivity /> System Performance
          </h3>
          <div className="card-row">
            <span className="metric-label">CPU</span>
            <span className="metric-value">{metrics?.cpu?.toFixed(1) || 0}%</span>
          </div>
          <div className="card-row">
            <span className="metric-label">RAM</span>
            <span className="metric-value">{metrics?.ram?.toFixed(1) || 0}%</span>
          </div>
          <div className="card-row">
            <span className="metric-label">GPU</span>
            <span className="metric-value">{metrics?.gpu?.toFixed(1) || 0}%</span>
          </div>
          <div className="card-row">
            <span className="metric-label">
              <FiThermometer /> Temperatur
            </span>
            <span className="metric-value">{metrics?.temperature?.toFixed(1) || 0}°C</span>
          </div>
        </div>

        {/* Storage Card */}
        <div className="card">
          <h3 className="card-title">
            <FiHardDrive /> Speicher
          </h3>
          <div className="card-value">{metrics?.disk?.percent?.toFixed(1) || 0}%</div>
          <div className="card-label">Belegt</div>
          <div className="card-row" style={{ marginTop: '1rem' }}>
            <span className="metric-label">Frei</span>
            <span className="metric-value">
              {((metrics?.disk?.free || 0) / 1024 / 1024 / 1024).toFixed(1)} GB
            </span>
          </div>
          <div className="card-row">
            <span className="metric-label">Gesamt</span>
            <span className="metric-value">
              {(((metrics?.disk?.used || 0) + (metrics?.disk?.free || 0)) / 1024 / 1024 / 1024).toFixed(1)} GB
            </span>
          </div>
        </div>

        {/* AI Services Card */}
        <div className="card">
          <h3 className="card-title">
            <FiCpu /> AI Services
          </h3>
          <div className="card-row">
            <span className="metric-label">LLM</span>
            <span className={`metric-value ${services?.llm?.status === 'healthy' ? 'status-ok' : 'status-critical'}`}>
              {services?.llm?.status || 'unknown'}
            </span>
          </div>
          <div className="card-row">
            <span className="metric-label">Embeddings</span>
            <span className={`metric-value ${services?.embeddings?.status === 'healthy' ? 'status-ok' : 'status-critical'}`}>
              {services?.embeddings?.status || 'unknown'}
            </span>
          </div>
          {services?.llm?.gpu_load !== undefined && (
            <div className="card-row">
              <span className="metric-label">GPU Load</span>
              <span className="metric-value">{(services.llm.gpu_load * 100).toFixed(0)}%</span>
            </div>
          )}
        </div>

        {/* Network Card */}
        <div className="card">
          <h3 className="card-title">Netzwerk</h3>
          <div className="card-row">
            <span className="metric-label">mDNS</span>
            <span className="metric-value" style={{ fontSize: '1rem' }}>{networkInfo?.mdns || 'N/A'}</span>
          </div>
          <div className="card-row">
            <span className="metric-label">IP</span>
            <span className="metric-value" style={{ fontSize: '1rem' }}>
              {networkInfo?.ip_addresses?.[0] || 'N/A'}
            </span>
          </div>
          <div className="card-row">
            <span className="metric-label">Internet</span>
            <span className={`metric-value ${networkInfo?.internet_reachable ? 'status-ok' : 'status-critical'}`}>
              {networkInfo?.internet_reachable ? 'Verbunden' : 'Offline'}
            </span>
          </div>
        </div>
      </div>

      {/* Performance Chart */}
      <div className="chart-section">
        <h2 className="chart-title">24h Performance</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={formatChartData()}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="time" stroke="#808080" />
            <YAxis stroke="#808080" />
            <Tooltip
              contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }}
              labelStyle={{ color: '#00ff88' }}
            />
            <Legend />
            <Line type="monotone" dataKey="CPU" stroke="#00ff88" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="RAM" stroke="#0066ff" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="GPU" stroke="#ff3366" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Temp" stroke="#ffaa00" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Workflow Activity */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3 className="card-title">Workflow-Aktivität</h3>
        <div className="card-row">
          <span className="metric-label">Aktive Workflows</span>
          <span className="metric-value">{workflows?.active || 0}</span>
        </div>
        <div className="card-row">
          <span className="metric-label">Heute ausgeführt</span>
          <span className="metric-value">{workflows?.executed_today || 0}</span>
        </div>
        {workflows?.last_error && (
          <div className="card-row">
            <span className="metric-label">Letzter Fehler</span>
            <span className="metric-value status-critical" style={{ fontSize: '0.9rem' }}>
              {workflows.last_error}
            </span>
          </div>
        )}
      </div>

      {/* Service Quick Links */}
      <div className="service-links">
        <a href="/n8n" className="service-link" target="_blank" rel="noopener noreferrer">
          n8n Workflows
        </a>
        <a href="/minio" className="service-link" target="_blank" rel="noopener noreferrer">
          MinIO Storage
        </a>
        <a href="/api/system/status" className="service-link" target="_blank" rel="noopener noreferrer">
          System API
        </a>
      </div>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-info">
          <strong>Version:</strong> {systemInfo?.version || '1.0.0'}
        </div>
        <div className="footer-info">
          <strong>Build:</strong> {systemInfo?.build_hash || 'dev'}
        </div>
        <div className="footer-info">
          <strong>JetPack:</strong> {systemInfo?.jetpack_version || 'N/A'}
        </div>
        <div className="footer-info">
          <strong>Uptime:</strong> {systemInfo?.uptime_seconds ? formatUptime(systemInfo.uptime_seconds) : 'N/A'}
        </div>
        <div className="footer-info">
          <strong>Hostname:</strong> {systemInfo?.hostname || 'arasul'}
        </div>
      </footer>
    </div>
  );
}

export default App;
