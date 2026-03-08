import React, { type ErrorInfo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (props: {
    error: Error | null;
    errorInfo: ErrorInfo | null;
    retry: () => void;
    reload: () => void;
  }) => ReactNode;
  compact?: boolean;
  inline?: boolean;
  title?: string;
  message?: string;
  hint?: string;
  showDetails?: boolean;
  hideBackButton?: boolean;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(_error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ error, errorInfo });
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          errorInfo: this.state.errorInfo,
          retry: this.handleRetry,
          reload: this.handleReload,
        });
      }

      const isCompact = this.props.compact || this.props.inline;
      const isDevelopment = import.meta.env.DEV;

      if (isCompact) {
        return (
          <div
            className="error-boundary-compact rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 my-2"
            role="alert"
          >
            <div className="error-boundary-compact-content flex items-center gap-3">
              <span className="error-icon-small text-xl shrink-0">⚠️</span>
              <span className="error-text flex-1 text-red-400 text-sm">
                {this.props.message || 'Komponente konnte nicht geladen werden'}
              </span>
              <button
                type="button"
                onClick={this.handleRetry}
                className="btn-retry-small shrink-0 px-3 py-1.5 rounded-md text-sm font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                aria-label="Erneut versuchen"
              >
                Erneut
              </button>
            </div>
          </div>
        );
      }

      return (
        <div
          className="error-boundary min-h-screen flex items-center justify-center bg-[var(--bg-dark)] p-8"
          role="alert"
        >
          <div className="error-boundary-content max-w-[600px] w-full bg-card border border-border rounded-lg px-8 py-12 text-center">
            <div className="error-icon text-6xl mb-6">⚠️</div>
            <h1 className="text-destructive mb-4 text-3xl font-bold">
              {this.props.title || 'Etwas ist schiefgelaufen'}
            </h1>
            <p className="error-message text-muted-foreground mb-8 leading-relaxed">
              {this.props.message || 'Die Anwendung ist auf einen unerwarteten Fehler gestoßen.'}
            </p>

            {(isDevelopment || this.props.showDetails) && this.state.error && (
              <details className="error-details my-8 text-left bg-[var(--bg-dark)] border border-border rounded-md p-4">
                <summary className="text-primary cursor-pointer font-semibold select-none hover:underline">
                  Fehlerdetails anzeigen
                </summary>
                <pre className="error-stack mt-4 text-destructive text-sm overflow-x-auto whitespace-pre-wrap break-words bg-[var(--bg-dark)] p-4 rounded border border-border/50">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <div className="error-actions flex gap-4 justify-center my-8">
              <button
                type="button"
                onClick={this.handleRetry}
                className="btn-retry px-6 py-3 rounded-md font-semibold text-base bg-green-500 text-white hover:bg-green-400 hover:-translate-y-0.5 transition-all"
                aria-label="Erneut versuchen ohne Neuladen"
              >
                Erneut versuchen
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="btn-reload px-6 py-3 rounded-md font-semibold text-base bg-primary text-primary-foreground hover:bg-primary/90 hover:-translate-y-0.5 transition-all"
                aria-label="Seite neu laden"
              >
                Seite neu laden
              </button>
              {!this.props.hideBackButton && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.history.length > 1) {
                      window.history.back();
                    } else {
                      window.location.href = '/';
                    }
                  }}
                  className="btn-back px-6 py-3 rounded-md font-semibold text-base bg-transparent text-muted-foreground border border-border hover:bg-accent hover:border-primary hover:text-primary transition-all"
                  aria-label="Zurück zur vorherigen Seite"
                >
                  Zurück
                </button>
              )}
            </div>

            <p className="error-hint text-muted-foreground/70 text-sm mt-8">
              {this.props.hint || (
                <>
                  Wenn das Problem weiterhin besteht, kontaktieren Sie{' '}
                  <a href="mailto:info@arasul.de" className="text-primary hover:underline">
                    info@arasul.de
                  </a>
                </>
              )}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

interface RouteErrorBoundaryProps {
  children: ReactNode;
  routeName?: string;
}

export function RouteErrorBoundary({ children, routeName }: RouteErrorBoundaryProps) {
  return (
    <ErrorBoundary
      title={`${routeName || 'Seite'} Fehler`}
      message={`${routeName || 'Diese Seite'} konnte nicht geladen werden.`}
      hint="Versuchen Sie es erneut oder kehren Sie zum Dashboard zurück."
    >
      {children}
    </ErrorBoundary>
  );
}

interface ComponentErrorBoundaryProps {
  children: ReactNode;
  componentName?: string;
}

export function ComponentErrorBoundary({ children, componentName }: ComponentErrorBoundaryProps) {
  return (
    <ErrorBoundary compact message={`${componentName || 'Komponente'} konnte nicht geladen werden`}>
      {children}
    </ErrorBoundary>
  );
}

export default ErrorBoundary;
