import React, { type ErrorInfo, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button, Kopf } from '@marken';
import { SUPPORT_EMAIL } from '@/config/branding';

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
            className="error-boundary-compact rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 my-2"
            role="alert"
          >
            <div className="error-boundary-compact-content flex items-center gap-3">
              <TriangleAlert
                className="error-icon-small size-5 shrink-0 text-destructive"
                aria-hidden="true"
              />
              <span className="error-text flex-1 text-destructive text-sm">
                {this.props.message || 'Komponente konnte nicht geladen werden'}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={this.handleRetry}
                className="shrink-0"
                aria-label="Erneut versuchen"
              >
                Erneut
              </Button>
            </div>
          </div>
        );
      }

      return (
        <div
          className="error-boundary min-h-screen flex items-center justify-center bg-background p-8"
          role="alert"
        >
          <div className="error-boundary-content max-w-150 w-full rounded-lg border border-border bg-card px-8 py-12 text-center">
            {/* SEIT H5 DER `Kopf` AUS DER BIBLIOTHEK, mittig — bis dahin ein
                handgeschriebenes `h1`, das `bausteine.py` erst sah, als der
                Ausnahmeordner `components/ui/` fiel. Der Titel steht nicht
                mehr in `text-destructive`: dieser Bildschirm IST die
                Fehlermeldung, und eine rote Überschrift darin ist eine
                Farbe, die nichts mehr unterscheidet. Das Warnzeichen darüber
                sagt es schon. */}
            <TriangleAlert
              className="error-icon mx-auto mb-6 size-12 text-muted-foreground"
              aria-hidden="true"
            />
            <Kopf
              titel={this.props.title || 'Etwas ist schiefgelaufen'}
              beschreibung={
                this.props.message || 'Die Anwendung ist auf einen unerwarteten Fehler gestoßen.'
              }
              mittig
            />

            {(isDevelopment || this.props.showDetails) && this.state.error && (
              <details className="error-details my-8 text-left bg-background border border-border rounded-md p-4">
                <summary className="text-primary cursor-pointer font-medium select-none hover:underline">
                  Technik
                </summary>
                <pre className="error-stack mt-4 text-destructive text-sm overflow-x-auto whitespace-pre-wrap break-words bg-background p-4 rounded border border-border/50">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <div className="error-actions flex gap-4 justify-center my-8">
              <Button
                size="lg"
                onClick={this.handleRetry}
                aria-label="Erneut versuchen ohne Neuladen"
              >
                Erneut versuchen
              </Button>
              <Button
                variant="default"
                size="lg"
                onClick={this.handleReload}
                aria-label="Seite neu laden"
              >
                Seite neu laden
              </Button>
              {!this.props.hideBackButton && (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => {
                    if (window.history.length > 1) {
                      window.history.back();
                    } else {
                      window.location.href = '/';
                    }
                  }}
                  aria-label="Zurück zur vorherigen Seite"
                >
                  Zurück
                </Button>
              )}
            </div>

            <p className="error-hint text-muted-foreground/70 text-sm mt-8">
              {this.props.hint || (
                <>
                  Wenn das Problem weiterhin besteht, kontaktieren Sie{' '}
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
                    {SUPPORT_EMAIL}
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
  /** Fehlertext und Komponentenstapel zeigen — nur für den Admin. */
  showDetails?: boolean;
}

/**
 * Die Fehlerseite einer ganzen Route. Zwei Sätze für jeden; die Technik
 * (Fehlertext, Komponentenstapel) nur, wenn der Aufrufer sie freigibt — ein
 * Mitarbeiter kann mit einem Stapel nichts anfangen, und er verrät Interna.
 */
export function RouteErrorBoundary({ children, showDetails = false }: RouteErrorBoundaryProps) {
  return (
    <ErrorBoundary
      title="Diese Seite konnte nicht geladen werden"
      message="Ein unerwarteter Fehler ist aufgetreten."
      hint="Versuchen Sie es erneut oder laden Sie die Seite neu."
      showDetails={showDetails}
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
