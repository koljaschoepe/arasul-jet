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
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <div className="error-icon">⚠️</div>
            <h1>Etwas ist schiefgelaufen</h1>
            <p className="error-message">
              Die Anwendung ist auf einen unerwarteten Fehler gestoßen.
            </p>

            {this.state.error && (
              <details className="error-details">
                <summary>Fehlerdetails anzeigen</summary>
                <pre className="error-stack">
                  {this.state.error.toString()}
                  {this.state.errorInfo && this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}

            <div className="error-actions">
              <button onClick={this.handleReset} className="btn-reload">
                Seite neu laden
              </button>
              <button
                onClick={() => window.history.back()}
                className="btn-back"
              >
                Zurück
              </button>
            </div>

            <p className="error-hint">
              Wenn das Problem weiterhin besteht, kontaktieren Sie bitte den Administrator.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
