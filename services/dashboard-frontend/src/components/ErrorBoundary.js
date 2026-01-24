/**
 * ErrorBoundary - Enhanced Error Boundary Component
 *
 * PHASE 4: Provides granular error handling with:
 * - Custom fallback component support
 * - Retry without page reload
 * - Customizable title and message
 * - Development mode error details
 */

import React from 'react';
import './ErrorBoundary.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });

    // Optional: Call onError callback if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  // Retry without page reload - just reset the error state
  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  // Full page reload
  handleReload = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // If custom fallback is provided, use it
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          errorInfo: this.state.errorInfo,
          retry: this.handleRetry,
          reload: this.handleReload
        });
      }

      // Check if this is a compact/inline error boundary
      const isCompact = this.props.compact || this.props.inline;
      const isDevelopment = process.env.NODE_ENV === 'development';

      // Compact inline error display
      if (isCompact) {
        return (
          <div className="error-boundary-compact" role="alert">
            <div className="error-boundary-compact-content">
              <span className="error-icon-small">⚠️</span>
              <span className="error-text">
                {this.props.message || 'Komponente konnte nicht geladen werden'}
              </span>
              <button
                onClick={this.handleRetry}
                className="btn-retry-small"
                aria-label="Erneut versuchen"
              >
                Erneut
              </button>
            </div>
          </div>
        );
      }

      // Full error display
      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary-content">
            <div className="error-icon">⚠️</div>
            <h1>{this.props.title || 'Etwas ist schiefgelaufen'}</h1>
            <p className="error-message">
              {this.props.message || 'Die Anwendung ist auf einen unerwarteten Fehler gestoßen.'}
            </p>

            {/* Show error details in development mode or if showDetails prop is true */}
            {(isDevelopment || this.props.showDetails) && this.state.error && (
              <details className="error-details">
                <summary>Fehlerdetails anzeigen</summary>
                <pre className="error-stack">
                  {this.state.error.toString()}
                  {this.state.errorInfo && this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}

            <div className="error-actions">
              <button
                onClick={this.handleRetry}
                className="btn-retry"
                aria-label="Erneut versuchen ohne Neuladen"
              >
                Erneut versuchen
              </button>
              <button
                onClick={this.handleReload}
                className="btn-reload"
                aria-label="Seite neu laden"
              >
                Seite neu laden
              </button>
              {!this.props.hideBackButton && (
                <button
                  onClick={() => window.history.back()}
                  className="btn-back"
                  aria-label="Zurück zur vorherigen Seite"
                >
                  Zurück
                </button>
              )}
            </div>

            <p className="error-hint">
              {this.props.hint || 'Wenn das Problem weiterhin besteht, kontaktieren Sie bitte den Administrator.'}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * RouteErrorBoundary - Pre-configured boundary for route components
 */
export function RouteErrorBoundary({ children, routeName }) {
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

/**
 * ComponentErrorBoundary - Compact boundary for individual components
 */
export function ComponentErrorBoundary({ children, componentName }) {
  return (
    <ErrorBoundary
      compact
      message={`${componentName || 'Komponente'} konnte nicht geladen werden`}
    >
      {children}
    </ErrorBoundary>
  );
}

export default ErrorBoundary;
