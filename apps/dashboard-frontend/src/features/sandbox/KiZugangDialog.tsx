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
import { Copy, ExternalLink, KeyRound, Loader2, LogIn, ShieldCheck, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { useApi } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';

type Mode = 'oauth' | 'token' | 'apikey';
type StoredMode = 'oauth' | 'token' | 'apikey';

interface AuthStatus {
  configured: boolean;
  mode: StoredMode | null;
  expiresAt?: number | null;
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

  const [mode, setMode] = useState<Mode>('oauth');
  const [value, setValue] = useState('');

  // OAuth-Handshake-Zustand: Start liefert die kopierbare Authorize-URL + State;
  // der Nutzer meldet sich im Browser an und fügt den Rück-Code hier ein.
  const [oauthUrl, setOauthUrl] = useState('');
  const [oauthState, setOauthState] = useState('');
  const [oauthCode, setOauthCode] = useState('');

  // Kein eigener onError-Toast: useApi zeigt automatisch die echte Backend-
  // Meldung (Rate-Limit vs. falscher/abgelaufener Code) — informativer als eine
  // generische Fehlermeldung.
  const oauthStart = useMutation({
    mutationFn: () =>
      api.post<{ authorizeUrl: string; state: string }>('/sandbox/claude-auth/oauth/start', {}),
    onSuccess: res => {
      setOauthUrl(res.authorizeUrl);
      setOauthState(res.state);
      setOauthCode('');
    },
  });

  const oauthComplete = useMutation({
    mutationFn: () =>
      api.post<{ applied_to: number }>('/sandbox/claude-auth/oauth/complete', {
        code: oauthCode.trim(),
        state: oauthState,
      }),
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['sandbox-claude-auth'] });
      setOauthUrl('');
      setOauthState('');
      setOauthCode('');
      toast.success(
        `Angemeldet — auf ${res.applied_to} laufende Sandbox(es) angewendet. Neue Terminals sind sofort angemeldet.`
      );
    },
  });

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(oauthUrl);
      toast.success('Link kopiert');
    } catch {
      toast.error('Kopieren nicht möglich — Link manuell markieren');
    }
  };

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

  const modeLabel = (m: StoredMode | null) =>
    m === 'apikey' ? 'API-Key' : m === 'token' ? 'Abo-Token' : m === 'oauth' ? 'Claude-Login' : '';

  const expiryText = (ms?: number | null) => {
    if (!ms) return null;
    const d = new Date(ms);
    const days = Math.round((ms - Date.now()) / 86400000);
    return `gültig bis ${d.toLocaleDateString('de-DE')}${days >= 0 ? ` (${days} Tage)` : ''}`;
  };

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
                {status.mode === 'oauth' && expiryText(status.expiresAt) && (
                  <span className="text-muted-foreground">· {expiryText(status.expiresAt)}</span>
                )}
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
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMode('oauth')}
                className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                  mode === 'oauth'
                    ? 'border-primary/50 bg-primary/5 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent/50'
                }`}
              >
                <div className="font-medium">Mit Claude anmelden</div>
                <div className="text-[11px] text-muted-foreground">Empfohlen · ein Klick</div>
              </button>
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
                  <code>setup-token</code>
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
                <div className="text-[11px] text-muted-foreground">pro Nutzung</div>
              </button>
            </div>
          </div>

          {mode === 'oauth' ? (
            /* OAuth-Handshake: EINMAL im Browser anmelden, Code einfügen, fertig. */
            <div className="flex flex-col gap-3">
              {!oauthUrl ? (
                <>
                  <p className="text-[11px] text-muted-foreground">
                    Meldet dich einmal mit deinem Claude-Abo an — danach ist <code>claude</code> in
                    jeder Sandbox angemeldet, ohne kaputten Terminal-Link.
                  </p>
                  <Button
                    type="button"
                    disabled={oauthStart.isPending}
                    onClick={() => oauthStart.mutate()}
                  >
                    {oauthStart.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <LogIn className="size-4" />
                    )}
                    Anmeldung starten
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-foreground">
                      1. Diesen Link im Browser öffnen &amp; anmelden
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        readOnly
                        value={oauthUrl}
                        onFocus={e => e.currentTarget.select()}
                        className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[11px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Link kopieren"
                        onClick={copyUrl}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                      <Button type="button" variant="outline" size="icon" asChild>
                        <a
                          href={oauthUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Im Browser öffnen"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="oauth-code" className="text-xs font-medium text-foreground">
                      2. Angezeigten Code einfügen
                    </label>
                    <input
                      id="oauth-code"
                      value={oauthCode}
                      onChange={e => setOauthCode(e.target.value)}
                      placeholder="Code von der Anthropic-Seite (Form: code#state)"
                      className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      className="flex-1"
                      disabled={oauthCode.trim().length < 4 || oauthComplete.isPending}
                      onClick={() => oauthComplete.mutate()}
                    >
                      {oauthComplete.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="size-4" />
                      )}
                      Anmeldung abschließen
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setOauthUrl('');
                        setOauthCode('');
                      }}
                    >
                      Abbrechen
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Wert (Abo-Token / API-Key) */}
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
                Speichern &amp; auf alle Sandboxes anwenden
              </Button>
            </>
          )}

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
