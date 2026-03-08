import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastMethods {
  success: (msg: string, duration?: number) => number;
  error: (msg: string, duration?: number) => number;
  warning: (msg: string, duration?: number) => number;
  info: (msg: string, duration?: number) => number;
  remove: (id: number) => void;
  clear: () => void;
}

interface ToastContextValue {
  toast: ToastMethods;
  addToast: (message: string, type?: ToastType, duration?: number | null) => number;
  removeToast: (id: number) => void;
  clearToasts: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_ICONS: Record<ToastType, React.FC<{ className?: string }>> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 4000,
  error: 6000,
  warning: 5000,
  info: 4000,
};

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="alert" aria-live="polite">
      {toasts.map(toast => {
        const Icon = TOAST_ICONS[toast.type] || Info;
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
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (message: string, type: ToastType = 'info', duration: number | null = null) => {
      const id = Date.now() + Math.random();
      const actualDuration = duration ?? DEFAULT_DURATIONS[type] ?? 4000;

      setToasts(prev => [...prev, { id, message, type }]);

      if (actualDuration > 0) {
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== id));
        }, actualDuration);
      }

      return id;
    },
    []
  );

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const toast = useMemo<ToastMethods>(
    () => ({
      success: (msg, duration) => addToast(msg, 'success', duration),
      error: (msg, duration) => addToast(msg, 'error', duration),
      warning: (msg, duration) => addToast(msg, 'warning', duration),
      info: (msg, duration) => addToast(msg, 'info', duration),
      remove: removeToast,
      clear: clearToasts,
    }),
    [addToast, removeToast, clearToasts]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      addToast,
      removeToast,
      clearToasts,
    }),
    [toast, addToast, removeToast, clearToasts]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastMethods {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context.toast;
}

export default ToastContext;
