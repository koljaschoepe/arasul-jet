/**
 * KiZugangDialog — der zentrale KI-Zugang für ALLE Sandboxes.
 *
 * Löst das leidige „in jeder Sandbox einzeln im Terminal anmelden" (mit dem
 * kaputten, nicht kopierbaren OAuth-Link) ab: Der Admin hinterlegt hier EINMAL
 * einen Zugang — entweder ein Abo-Langzeit-Token (`claude setup-token`, headless,
 * 1 Jahr) oder einen API-Key (Abrechnung pro Nutzung). Der Wert wird
 * verschlüsselt gespeichert und in JEDE Sandbox als Umgebungsvariable gebracht,
 * sodass `claude` im Terminal sofort angemeldet ist.
 *
 * Zusätzlich (für alle, die den interaktiven Weg bevorzugen): „Aktuellen Login
 * aus diesem Terminal speichern" fängt einen bereits erfolgten Terminal-Login ein
 * und spielt ihn künftig in jede Sandbox zurück.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Loader2, ShieldCheck, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { useApi } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';

type Mode = 'token' | 'apikey';

interface AuthStatus {
  configured: boolean;
  mode: Mode | null;
}

export default function KiZugangDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();

  const { data: status } = useQuery({
    queryKey: ['sandbox-claude-auth'],
    queryFn: () => api.get<AuthStatus>('/sandbox/claude-auth', { showError: false }),
  });

  const [mode, setMode] = useState<Mode>('token');
  const [value, setValue] = useState('');

  const speichern = useMutation({
    mutationFn: () =>
      api.put<{ applied_to: number }>('/sandbox/claude-auth', { mode, value: value.trim() }),
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['sandbox-claude-auth'] });
      setValue('');
      toast.success(
        `Zugang gespeichert — auf ${res.applied_to} laufende Sandbox(es) angewendet. Neue Terminals sind sofort angemeldet.`
      );
    },
    onError: () => toast.error('Speichern fehlgeschlagen'),
  });

  const entfernen = useMutation({
    mutationFn: () => api.del('/sandbox/claude-auth'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sandbox-claude-auth'] });
      toast.success('Zugang entfernt');
    },
  });

  const loginSpeichern = useMutation({
    mutationFn: () =>
      api.post<{ captured: boolean }>(
        `/sandbox/projects/${projectId}/claude-login/capture`,
        {},
        { showError: false }
      ),
    onSuccess: res => {
      if (res.captured) {
        toast.success('Terminal-Login gespeichert — er gilt jetzt in jeder Sandbox.');
      } else {
        toast.info('Kein aktiver Login im Terminal gefunden. Erst `claude` starten und anmelden.');
      }
    },
    onError: () => toast.error('Login konnte nicht gespeichert werden'),
  });

  const modeLabel = (m: Mode | null) =>
    m === 'apikey' ? 'API-Key' : m === 'token' ? 'Abo-Token' : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Klickbarer Backdrop als echter Button (a11y): schließt den Dialog. */}
      <button
        type="button"
        aria-label="Dialog schließen"
        className="absolute inset-0 cursor-default bg-black/50"
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="KI-Zugang"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="size-4 text-primary" /> KI-Zugang für alle Sandboxes
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          <p className="text-xs text-muted-foreground">
            Einmal hinterlegen — gilt in jeder Sandbox. Kein Anmelden im Terminal mehr nötig.
          </p>

          {status?.configured && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-success/30 bg-success/5 px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs text-foreground">
                <ShieldCheck className="size-3.5 text-success" />
                Hinterlegt: {modeLabel(status.mode)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={entfernen.isPending}
                onClick={() => entfernen.mutate()}
              >
                <Trash2 className="size-3.5" /> Entfernen
              </Button>
            </div>
          )}

          {/* Zugangsart */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-foreground">Zugangsart</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('token')}
                className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                  mode === 'token'
                    ? 'border-primary/50 bg-primary/5 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent/50'
                }`}
              >
                <div className="font-medium">Abo-Token</div>
                <div className="text-[11px] text-muted-foreground">
                  Claude Pro/Max — <code>claude setup-token</code>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMode('apikey')}
                className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                  mode === 'apikey'
                    ? 'border-primary/50 bg-primary/5 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent/50'
                }`}
              >
                <div className="font-medium">API-Key</div>
                <div className="text-[11px] text-muted-foreground">Abrechnung pro Nutzung</div>
              </button>
            </div>
          </div>

          {/* Wert */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ki-zugang-value" className="text-xs font-medium text-foreground">
              {mode === 'token'
                ? 'Abo-Token (CLAUDE_CODE_OAUTH_TOKEN)'
                : 'API-Key (ANTHROPIC_API_KEY)'}
            </label>
            <input
              id="ki-zugang-value"
              type="password"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={mode === 'token' ? 'claude-code-oauth-token-…' : 'sk-ant-…'}
              className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-[11px] text-muted-foreground">
              {mode === 'token'
                ? 'Auf einem Rechner mit Browser `claude setup-token` ausführen und das Token hier einfügen.'
                : 'API-Key aus der Anthropic-Console.'}
            </p>
          </div>

          <Button
            type="button"
            disabled={value.trim().length < 10 || speichern.isPending}
            onClick={() => speichern.mutate()}
          >
            {speichern.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <KeyRound className="size-4" />
            )}
            Speichern & auf alle Sandboxes anwenden
          </Button>

          {/* Interaktiver Weg */}
          <div className="border-t border-border pt-3">
            <p className="mb-2 text-[11px] text-muted-foreground">
              Alternativ: Du hast dich gerade in diesem Terminal per <code>claude</code> angemeldet?
              Dann kannst du diesen Login einfangen — er gilt danach in jeder Sandbox.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loginSpeichern.isPending}
              onClick={() => loginSpeichern.mutate()}
            >
              {loginSpeichern.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="size-3.5" />
              )}
              Aktuellen Login aus diesem Terminal speichern
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
