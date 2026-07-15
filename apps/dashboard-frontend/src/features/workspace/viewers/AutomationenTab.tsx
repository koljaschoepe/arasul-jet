import { useEffect, useState } from 'react';
import { Workflow, AlertTriangle } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/shadcn/button';

/**
 * Automationen-Tab (Plan 007): bettet den n8n-Editor als same-origin-iframe
 * ein (Traefik routet /n8n auf derselben Origin). Vor dem iframe holt der Tab
 * über GET /api/automations/session eine n8n-Session: das Backend meldet den
 * festen n8n-Owner an und reicht den n8n-Session-Cookie same-origin durch.
 * Dadurch lädt der iframe direkt den Editor — n8ns eigene Anmeldung erscheint
 * nie. Die Arasul-Anmeldung (forward-auth) bleibt die einzige Wand.
 */
export default function AutomationenTab() {
  const api = useApi();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;

    const establishSession = async () => {
      setStatus('loading');
      try {
        // Set-Cookie (n8n-auth) wird vom Browser gesetzt; Antwort-Body irrelevant.
        await api.get('/automations/session', { showError: false });
        if (cancelled) return;
        setStatus('ready');
      } catch {
        if (cancelled) return;
        setStatus('error');
      }
    };

    void establishSession();
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (status === 'loading') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background text-text-secondary">
        <LoadingSpinner />
        <p className="text-sm">Automationen werden vorbereitet …</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <AlertTriangle className="h-8 w-8 text-text-secondary" aria-hidden />
        <div className="max-w-md space-y-1">
          <p className="flex items-center justify-center gap-2 text-sm font-medium text-text-primary">
            <Workflow className="h-4 w-4" aria-hidden /> Automationen nicht verfügbar
          </p>
          <p className="text-sm text-text-secondary">
            Die Verbindung zum Automations-Dienst (n8n) konnte nicht hergestellt werden. Bitte in
            einem Moment erneut versuchen.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Erneut versuchen
        </Button>
      </div>
    );
  }

  return (
    <iframe
      src="/n8n/"
      title="Automationen (n8n)"
      className="h-full w-full border-0 bg-background"
      data-testid="n8n-frame"
    />
  );
}
