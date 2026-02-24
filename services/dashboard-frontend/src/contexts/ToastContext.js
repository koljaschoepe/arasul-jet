/**
 * ToastContext - Global Toast Notification System
 *
 * PHASE 4: Provides a centralized toast notification system for the application.
 * Supports success, error, warning, and info notifications with auto-dismiss.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { FiCheckCircle, FiAlertCircle, FiAlertTriangle, FiInfo, FiX } from 'react-icons/fi';

// Context
const ToastContext = createContext(null);

// Toast type icons
const TOAST_ICONS = {
  success: FiCheckCircle,
  error: FiAlertCircle,
  warning: FiAlertTriangle,
  info: FiInfo,
};

// Default durations by type (ms)
const DEFAULT_DURATIONS = {
  success: 4000,
  error: 6000,
  warning: 5000,
  info: 4000,
};

/**
 * Toast Container Component - Renders all active toasts
 */
function ToastContainer({ toasts, onRemove }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="alert" aria-live="polite">
      {toasts.map(toast => {
        const Icon = TOAST_ICONS[toast.type] || FiInfo;
        return (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}`}
            role="alert"
            aria-atomic="true"
          >
            <Icon className="toast-icon" aria-hidden="true" />
            <span className="toast-message">{toast.message}</span>
            <button
              type="button"
              onClick={() => onRemove(toast.id)}
              className="toast-close"
              aria-label="Benachrichtigung schließen"
            >
              <FiX />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Toast Provider Component
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  // Add a new toast
  const addToast = useCallback((message, type = 'info', duration = null) => {
    const id = Date.now() + Math.random();
    const actualDuration = duration ?? DEFAULT_DURATIONS[type] ?? 4000;

    setToasts(prev => [...prev, { id, message, type }]);

    // Auto-dismiss if duration > 0
    if (actualDuration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, actualDuration);
    }

    return id;
  }, []);

  // Remove a specific toast
  const removeToast = useCallback(id => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Clear all toasts
  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  // Convenience methods
  const toast = {
    success: (msg, duration) => addToast(msg, 'success', duration),
    error: (msg, duration) => addToast(msg, 'error', duration),
    warning: (msg, duration) => addToast(msg, 'warning', duration),
    info: (msg, duration) => addToast(msg, 'info', duration),
    remove: removeToast,
    clear: clearToasts,
  };

  const value = {
    toasts,
    toast,
    addToast,
    removeToast,
    clearToasts,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

/**
 * Hook to use toast notifications
 * @returns {Object} Toast methods: success, error, warning, info, remove, clear
 */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context.toast;
}

export default ToastContext;
