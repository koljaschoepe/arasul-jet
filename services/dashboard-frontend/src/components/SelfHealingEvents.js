import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE } from '../config/api';
import {
  FiRefreshCw,
  FiInfo,
  FiAlertCircle,
  FiAlertTriangle,
  FiCheckCircle,
  FiActivity,
  FiCpu,
  FiHardDrive,
  FiThermometer,
  FiPower,
} from 'react-icons/fi';
import { formatRelativeDate } from '../utils/formatting';
import './SelfHealingEvents.css';

const SelfHealingEvents = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // all, INFO, WARNING, CRITICAL
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchEvents(false, controller.signal);

    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchEvents(true, controller.signal); // Silent refresh
      }, 15000); // Refresh every 15 seconds

      setRefreshInterval(interval);

      return () => {
        controller.abort();
        if (interval) clearInterval(interval);
      };
    } else {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        setRefreshInterval(null);
      }
      return () => controller.abort();
    }
  }, [autoRefresh]);

  const fetchEvents = async (silent = false, signal) => {
    if (!silent) setLoading(true);
    setError('');

    try {
      const response = await axios.get(`${API_BASE}/self-healing/events?limit=50`, { signal });
      setEvents(response.data.events || []);
    } catch (err) {
      if (signal?.aborted) return;
      setError('Failed to load self-healing events');
      console.error('Failed to fetch events:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const getSeverityBadge = severity => {
    const severityMap = {
      INFO: { color: 'info', Icon: FiInfo },
      WARNING: { color: 'warning', Icon: FiAlertTriangle },
      CRITICAL: { color: 'critical', Icon: FiAlertCircle },
    };

    const config = severityMap[severity] || { color: 'default', Icon: FiActivity };
    const IconComponent = config.Icon;

    return (
      <span className={`severity-badge severity-${config.color}`}>
        <IconComponent className="severity-icon" />
        {severity}
      </span>
    );
  };

  const getEventTypeIcon = eventType => {
    const icons = {
      service_restart: FiRefreshCw,
      service_down: FiAlertCircle,
      recovery_action: FiActivity,
      gpu_error: FiCpu,
      disk_cleanup: FiHardDrive,
      memory_warning: FiCpu,
      temperature_warning: FiThermometer,
      system_reboot: FiPower,
    };

    const IconComponent = icons[eventType] || FiActivity;
    return <IconComponent />;
  };

  // Using formatRelativeDate from utils/formatting

  const filteredEvents = events.filter(event => {
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

    events.forEach(event => {
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
              onChange={e => setAutoRefresh(e.target.checked)}
            />
            <span>Auto-refresh (10s)</span>
          </label>

          <button onClick={() => fetchEvents()} className="btn-refresh">
            <FiRefreshCw /> Refresh
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
          <FiAlertTriangle className="error-icon" />
          <span>{error}</span>
        </div>
      )}

      {/* Events List */}
      {filteredEvents.length === 0 ? (
        <div className="no-events">
          <FiCheckCircle className="no-events-icon" />
          <p>No events found</p>
          <p className="no-events-subtext">
            {filter === 'all' ? 'The system is running smoothly' : `No ${filter} events recorded`}
          </p>
        </div>
      ) : (
        <div className="events-list">
          {filteredEvents.map(event => (
            <div key={event.id} className={`event-card severity-${event.severity?.toLowerCase()}`}>
              <div className="event-header">
                <div className="event-icon">{getEventTypeIcon(event.event_type)}</div>
                <div className="event-title">
                  <h4>{event.event_type?.replace(/_/g, ' ').toUpperCase()}</h4>
                  <span className="event-time">{formatRelativeDate(event.timestamp)}</span>
                </div>
                <div className="event-severity">{getSeverityBadge(event.severity)}</div>
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
