import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './SelfHealingEvents.css';

const SelfHealingEvents = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // all, INFO, WARNING, CRITICAL
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(null);

  useEffect(() => {
    fetchEvents();

    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchEvents(true); // Silent refresh
      }, 10000); // Refresh every 10 seconds

      setRefreshInterval(interval);

      return () => {
        if (interval) clearInterval(interval);
      };
    } else {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        setRefreshInterval(null);
      }
    }
  }, [autoRefresh]);

  const fetchEvents = async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');

    try {
      const response = await axios.get('/api/self-healing/events?limit=50');
      setEvents(response.data.events || []);
    } catch (err) {
      setError('Failed to load self-healing events');
      console.error('Failed to fetch events:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const getSeverityBadge = (severity) => {
    const severityMap = {
      INFO: { color: 'info', icon: 'ℹ️' },
      WARNING: { color: 'warning', icon: '⚠️' },
      CRITICAL: { color: 'critical', icon: '🔴' },
    };

    const config = severityMap[severity] || { color: 'default', icon: '📋' };

    return (
      <span className={`severity-badge severity-${config.color}`}>
        <span className="severity-icon">{config.icon}</span>
        {severity}
      </span>
    );
  };

  const getEventTypeIcon = (eventType) => {
    const icons = {
      service_restart: '🔄',
      service_down: '⬇️',
      recovery_action: '🔧',
      gpu_error: '🎮',
      disk_cleanup: '🗑️',
      memory_warning: '💾',
      temperature_warning: '🌡️',
      system_reboot: '🔌',
    };

    return icons[eventType] || '📊';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleString();
  };

  const filteredEvents = events.filter((event) => {
    if (filter === 'all') return true;
    return event.severity === filter;
  });

  const getEventStats = () => {
    const stats = {
      total: events.length,
      INFO: 0,
      WARNING: 0,
      CRITICAL: 0,
    };

    events.forEach((event) => {
      if (event.severity in stats) {
        stats[event.severity]++;
      }
    });

    return stats;
  };

  const stats = getEventStats();

  if (loading) {
    return (
      <div className="self-healing-events">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading events...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="self-healing-events">
      <div className="events-header">
        <div className="header-title">
          <h2>Self-Healing Events</h2>
          <p>System recovery and maintenance events</p>
        </div>

        <div className="header-controls">
          <label className="auto-refresh-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span>Auto-refresh (10s)</span>
          </label>

          <button onClick={() => fetchEvents()} className="btn-refresh">
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Statistics */}
      <div className="events-stats">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Events</div>
        </div>
        <div className="stat-card info">
          <div className="stat-value">{stats.INFO}</div>
          <div className="stat-label">Info</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-value">{stats.WARNING}</div>
          <div className="stat-label">Warnings</div>
        </div>
        <div className="stat-card critical">
          <div className="stat-value">{stats.CRITICAL}</div>
          <div className="stat-label">Critical</div>
        </div>
      </div>

      {/* Filters */}
      <div className="events-filters">
        <button
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All Events
        </button>
        <button
          className={`filter-btn ${filter === 'INFO' ? 'active' : ''}`}
          onClick={() => setFilter('INFO')}
        >
          Info
        </button>
        <button
          className={`filter-btn ${filter === 'WARNING' ? 'active' : ''}`}
          onClick={() => setFilter('WARNING')}
        >
          Warnings
        </button>
        <button
          className={`filter-btn ${filter === 'CRITICAL' ? 'active' : ''}`}
          onClick={() => setFilter('CRITICAL')}
        >
          Critical
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Events List */}
      {filteredEvents.length === 0 ? (
        <div className="no-events">
          <span className="no-events-icon">✓</span>
          <p>No events found</p>
          <p className="no-events-subtext">
            {filter === 'all'
              ? 'The system is running smoothly'
              : `No ${filter} events recorded`}
          </p>
        </div>
      ) : (
        <div className="events-list">
          {filteredEvents.map((event) => (
            <div
              key={event.id}
              className={`event-card severity-${event.severity?.toLowerCase()}`}
            >
              <div className="event-header">
                <div className="event-icon">
                  {getEventTypeIcon(event.event_type)}
                </div>
                <div className="event-title">
                  <h4>{event.event_type?.replace(/_/g, ' ').toUpperCase()}</h4>
                  <span className="event-time">{formatDate(event.timestamp)}</span>
                </div>
                <div className="event-severity">
                  {getSeverityBadge(event.severity)}
                </div>
              </div>

              <div className="event-body">
                <p className="event-description">{event.description}</p>

                {event.action_taken && (
                  <div className="event-action">
                    <span className="action-label">Action Taken:</span>
                    <span className="action-value">{event.action_taken}</span>
                  </div>
                )}

                {event.service_name && (
                  <div className="event-detail">
                    <span className="detail-label">Service:</span>
                    <span className="detail-value">{event.service_name}</span>
                  </div>
                )}

                {event.duration_ms && (
                  <div className="event-detail">
                    <span className="detail-label">Duration:</span>
                    <span className="detail-value">{event.duration_ms}ms</span>
                  </div>
                )}

                {event.error_message && (
                  <div className="event-error">
                    <span className="error-label">Error:</span>
                    <span className="error-value">{event.error_message}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SelfHealingEvents;
