import { useState } from 'react';
import { GitBranch, RefreshCw, Github, Unplug, AlertTriangle, Check, FileDiff } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/shadcn/popover';
import { useToast } from '@/contexts/ToastContext';
import { useActiveProject } from '@/features/workspace/useProjects';
import { useGitSync } from '@/hooks/useGitSync';
import type { GitSyncStatus } from '@/types/git';

/** Kurzlabel + Token-Farbe je Sync-Status (Statusleisten-Punkt). */
function statusAnzeige(
  status: GitSyncStatus | null,
  connected: boolean
): {
  label: string;
  color: string;
} {
  if (!connected) {
    return { label: 'Kein Repo', color: 'var(--status-neutral)' };
  }
  switch (status) {
    case 'synchronisiert':
      return { label: 'Synchron', color: 'var(--success)' };
    case 'konflikt':
      return { label: 'Konflikt', color: 'var(--warning)' };
    case 'fehler':
      return { label: 'Sync-Fehler', color: 'var(--destructive)' };
    default:
      return { label: 'Verbunden', color: 'var(--success)' };
  }
}

/** Repo-Kurzform „owner/repo" aus der HTTPS-URL. */
function repoKurz(url: string): string {
  const m = url.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/);
  return m?.[1] ?? url;
}

/**
 * Git-Sync-Steuerung in der Statusleiste (Plan 013, B9): zeigt für das AKTIVE
 * Projekt den Kopplungsstatus und öffnet ein Popover zum Verbinden (Repo/Branch/
 * Token), Synchronisieren und Trennen. „Der Chat ist die ausführende Ebene" gilt
 * für Flows — die Repo-Kopplung ist Projekt-Sache und lebt daher hier, direkt
 * neben dem aktiven Projekt.
 */
export function GitSyncControl() {
  const toast = useToast();
  const { activeId, activeProject } = useActiveProject();
  const [open, setOpen] = useState(false);
  // `open` steuert die Änderungsabfrage: sie lässt `git status` laufen und
  // gehört nicht in den Hintergrund, solange niemand hinsieht.
  const { link, aenderungen, aenderungenLaedt, connect, sync, disconnect } = useGitSync(
    activeId,
    open
  );
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [pat, setPat] = useState('');
  // Zweigwechsel (Plan 023 G3): null = geschlossen, sonst der getippte Zweig.
  const [neuerZweig, setNeuerZweig] = useState<string | null>(null);

  // Ohne aktives Projekt gibt es nichts zu koppeln (Standard ist immer aktiv,
  // dies ist nur der Sicherheitsgurt während des ersten Ladens).
  if (!activeId) {
    return null;
  }

  const connected = !!link;
  // Der Server kann sich ändern; eine fehlende Liste darf die Statusleiste
  // nicht mitreißen (sie hängt in JEDER Ansicht).
  const geaendert = aenderungen?.dateien ?? [];
  const { label, color } = statusAnzeige(link?.last_status ?? null, connected);

  const handleConnect = async () => {
    try {
      await connect.mutateAsync({
        repo_url: repoUrl.trim(),
        branch: branch.trim() || 'main',
        ...(pat.trim() ? { pat: pat.trim() } : {}),
      });
      setPat('');
      toast.success('Repository verbunden');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verbinden fehlgeschlagen');
    }
  };

  const handleSync = async () => {
    try {
      const res = await sync.mutateAsync();
      toast.success(`Synchronisiert${res.data.commit ? ` · ${res.data.commit}` : ''}`);
    } catch (err) {
      // Merge-Konflikt trägt die Dateiliste in details.conflicts.
      const e = err as { code?: string; details?: { conflicts?: string[] }; message?: string };
      if (e.code === 'CONFLICT') {
        const n = e.details?.conflicts?.length ?? 0;
        toast.error(`Merge-Konflikt in ${n} Datei(en), bitte im Repository auflösen`);
      } else {
        toast.error(e.message ?? 'Synchronisieren fehlgeschlagen');
      }
    }
  };

  /**
   * Zweig wechseln (Plan 023 G3).
   *
   * Keine eigene Route: koppeln mit demselben Repository und einem anderen
   * Zweig IST der Wechsel. Der gespeicherte Token bleibt, weil `pat` weggelassen
   * wird. Der anschliessende Sync richtet den Arbeitsbaum auf den neuen Zweig
   * ein, ohne Dateien zu loeschen (siehe `setzeArbeitsbaumAuf` im Backend).
   */
  const handleZweigWechsel = async () => {
    const ziel = (neuerZweig ?? '').trim();
    if (!link || !ziel || ziel === link.branch) {
      setNeuerZweig(null);
      return;
    }
    try {
      await connect.mutateAsync({ repo_url: link.repo_url, branch: ziel });
      setNeuerZweig(null);
      await sync.mutateAsync();
      toast.success(`Auf Zweig „${ziel}" gewechselt`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Zweigwechsel fehlgeschlagen');
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect.mutateAsync();
      toast.success('Repository getrennt');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Trennen fehlgeschlagen');
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex min-w-0 items-center gap-1.5 rounded px-1 hover:bg-accent hover:text-foreground"
        title="GitHub-Synchronisierung"
        data-testid="workspace-statusbar-git"
      >
        <Github className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        <span className="truncate">{connected ? repoKurz(link.repo_url) : label}</span>
      </PopoverTrigger>

      <PopoverContent side="top" align="end" className="w-80 text-xs">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Github className="h-4 w-4" aria-hidden="true" />
          GitHub-Sync
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {activeProject?.name}
          </span>
        </div>

        {connected ? (
          <div className="flex flex-col gap-2">
            <dl className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Repository</dt>
                <dd className="truncate text-foreground">{repoKurz(link.repo_url)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Zweig</dt>
                <dd className="flex min-w-0 items-center gap-1 text-foreground">
                  <GitBranch className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {neuerZweig === null ? (
                    <>
                      <span className="truncate">{link.branch}</span>
                      <button
                        type="button"
                        onClick={() => setNeuerZweig(link.branch)}
                        className="shrink-0 rounded px-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        data-testid="git-zweig-wechseln"
                      >
                        wechseln
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        // Kein `autoFocus`-Attribut (jsx-a11y verbietet es, und
                        // zu Recht): hier ist der Sprung richtig, weil der
                        // Nutzer gerade „wechseln" GEDRUECKT hat und sonst ein
                        // zweites Mal klicken muesste.
                        ref={el => el?.focus()}
                        value={neuerZweig}
                        onChange={e => setNeuerZweig(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') void handleZweigWechsel();
                          if (e.key === 'Escape') setNeuerZweig(null);
                        }}
                        aria-label="Zweig"
                        data-testid="git-zweig-eingabe"
                        className="w-28 min-w-0 rounded border border-border bg-background px-1.5 py-0.5 text-foreground outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={() => void handleZweigWechsel()}
                        disabled={connect.isPending || sync.isPending}
                        className="shrink-0 rounded px-1 text-primary hover:bg-accent disabled:opacity-60"
                        data-testid="git-zweig-uebernehmen"
                      >
                        ok
                      </button>
                    </>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="flex items-center gap-1.5 text-foreground">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  {label}
                  {link.last_commit && (
                    <span className="text-muted-foreground">· {link.last_commit}</span>
                  )}
                </dd>
              </div>
              {link.pat_last4 && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Token</dt>
                  <dd className="text-foreground">••••{link.pat_last4}</dd>
                </div>
              )}
            </dl>

            {link.last_status === 'fehler' && link.last_error && (
              <p className="flex items-start gap-1.5 rounded bg-destructive/10 px-2 py-1.5 text-destructive">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">{link.last_error}</span>
              </p>
            )}
            {link.last_status === 'konflikt' && (
              <p className="flex items-start gap-1.5 rounded bg-warning/10 px-2 py-1.5 text-warning">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">
                  Merge-Konflikt offen, im Repository auflösen, dann erneut synchronisieren.
                </span>
              </p>
            )}

            {/* Was ist hier anders als auf GitHub (Plan 023 G3)? Ohne Netz:
                verglichen wird mit dem zuletzt geholten Stand, und darunter
                steht, wann das war. */}
            <div className="flex flex-col gap-1" data-testid="git-aenderungen">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <FileDiff className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>Änderungen gegenüber GitHub</span>
                {aenderungenLaedt && <span className="ml-auto">liest …</span>}
              </div>
              {aenderungen?.nieSynchronisiert ? (
                <p className="text-muted-foreground">
                  Noch nie synchronisiert, es gibt nichts zu vergleichen.
                </p>
              ) : aenderungen &&
                geaendert.length === 0 &&
                !aenderungen.voraus &&
                !aenderungen.zurueck ? (
                <p className="text-muted-foreground">Keine Unterschiede.</p>
              ) : aenderungen ? (
                <>
                  {(aenderungen.voraus > 0 || aenderungen.zurueck > 0) && (
                    <p className="text-foreground">
                      {aenderungen.voraus > 0 &&
                        `${aenderungen.voraus} eigene Änderung(en) noch nicht übertragen`}
                      {aenderungen.voraus > 0 && aenderungen.zurueck > 0 && ', '}
                      {aenderungen.zurueck > 0 &&
                        `${aenderungen.zurueck} von GitHub noch nicht geholt`}
                    </p>
                  )}
                  {geaendert.length > 0 && (
                    <ul className="max-h-32 overflow-y-auto">
                      {geaendert.map(d => (
                        <li key={d.pfad} className="flex items-baseline gap-1.5">
                          <span className="w-16 shrink-0 text-muted-foreground">{d.art}</span>
                          <span className="min-w-0 truncate text-foreground" title={d.pfad}>
                            {d.pfad}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(aenderungen.mehr ?? 0) > 0 && (
                    <p className="text-muted-foreground">und {aenderungen.mehr} weitere</p>
                  )}
                  {aenderungen.stand && (
                    <p className="text-muted-foreground">
                      Verglichen mit dem Stand vom{' '}
                      {new Date(aenderungen.stand).toLocaleString('de-DE')}
                    </p>
                  )}
                </>
              ) : null}
            </div>

            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={handleSync}
                disabled={sync.isPending}
                className="flex flex-1 items-center justify-center gap-1.5 rounded bg-primary px-2 py-1.5 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                data-testid="git-sync-button"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${sync.isPending ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                {sync.isPending ? 'Synchronisiere…' : 'Synchronisieren'}
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnect.isPending}
                title="Repository trennen"
                className="flex items-center justify-center gap-1.5 rounded border border-border px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
              >
                <Unplug className="h-3.5 w-3.5" aria-hidden="true" />
                Trennen
              </button>
            </div>
            {link.last_synced_at && (
              <p className="text-muted-foreground">
                Zuletzt synchronisiert: {new Date(link.last_synced_at).toLocaleString('de-DE')}
              </p>
            )}
          </div>
        ) : (
          <form
            className="flex flex-col gap-2"
            onSubmit={e => {
              e.preventDefault();
              void handleConnect();
            }}
          >
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Repository (HTTPS)</span>
              <input
                type="url"
                required
                value={repoUrl}
                onChange={e => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="rounded border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-primary"
                data-testid="git-repo-input"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Branch</span>
              <input
                type="text"
                value={branch}
                onChange={e => setBranch(e.target.value)}
                placeholder="main"
                className="rounded border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-primary"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Personal Access Token</span>
              <input
                type="password"
                value={pat}
                onChange={e => setPat(e.target.value)}
                placeholder="ghp_… (verschlüsselt gespeichert)"
                className="rounded border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-primary"
                data-testid="git-pat-input"
              />
            </label>
            <button
              type="submit"
              disabled={connect.isPending || !repoUrl.trim()}
              className="mt-1 flex items-center justify-center gap-1.5 rounded bg-primary px-2 py-1.5 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              data-testid="git-connect-button"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              {connect.isPending ? 'Verbinde…' : 'Verbinden'}
            </button>
            <p className="text-muted-foreground">
              Der Token wird AES-256-verschlüsselt gespeichert und verlässt das Gerät nie.
            </p>
          </form>
        )}
      </PopoverContent>
    </Popover>
  );
}
