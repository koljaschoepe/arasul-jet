import { useCallback, useEffect, useRef, useState } from 'react';
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
 *
 * Robustheit (2026-07-28): n8n braucht nach einem (Neu-)Start einige Sekunden,
 * bis /rest/login antwortet — der erste Session-Versuch scheiterte dann und
 * der Tab blieb auf der Fehlermeldung stehen. Jetzt: bis zu 4 Versuche mit
 * wachsendem Abstand, und „Erneut versuchen" wiederholt nur die Session statt
 * die ganze Seite neu zu laden.
 */
const VERSUCHE = 4;
const BACKOFF_MS = [0, 2000, 4000, 8000];

export default function AutomationenTab() {
  const api = useApi();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const cancelledRef = useRef(false);

  const establishSession = useCallback(async () => {
    setStatus('loading');
    for (let versuch = 0; versuch < VERSUCHE; versuch++) {
      if (cancelledRef.current) return;
      if (versuch > 0) {
        await new Promise(r => setTimeout(r, BACKOFF_MS[versuch]));
        if (cancelledRef.current) return;
      }
      try {
        // Set-Cookie (n8n-auth) wird vom Browser gesetzt; Antwort-Body irrelevant.
        await api.get('/automations/session', { showError: false });
        if (cancelledRef.current) return;
        setStatus('ready');
        return;
      } catch {
        /* nächster Versuch nach Backoff */
      }
    }
    if (!cancelledRef.current) setStatus('error');
  }, [api]);

  useEffect(() => {
    cancelledRef.current = false;
    void establishSession();
    return () => {
      cancelledRef.current = true;
    };
  }, [establishSession]);

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
        <Button variant="outline" size="sm" onClick={() => void establishSession()}>
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
