import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useConfirm from '../../hooks/useConfirm';
import {
  Terminal,
  Settings,
  Folder,
  Play,
  RefreshCw,
  KeyRound,
  AlertCircle,
  AlertTriangle,
  Check,
  X,
  Square,
  Maximize2,
  Minimize2,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  Cpu,
  Zap,
  Plus,
  Trash2,
  Star,
  Pencil,
  User,
  LogIn,
  Clock,
} from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../../components/ui/Modal';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import type { ClaudeCodeConfig, ClaudeAppStatus, ClaudeAuthStatus, ApiError } from '../../types';
import './claude.css';

interface Workspace {
  id: number;
  name: string;
  slug: string;
  description?: string;
  host_path: string;
  container_path: string;
  is_default: boolean;
  is_system: boolean;
}

interface WorkspaceManagerProps {
  workspaces: Workspace[];
  onClose: () => void;
  onWorkspaceCreated: (ws: Workspace) => void;
  onWorkspaceDeleted: (id: number) => void;
  onSetDefault: (id: number) => void;
}

// Workspace Manager Modal Component
function WorkspaceManager({
  workspaces,
  onClose,
  onWorkspaceCreated,
  onWorkspaceDeleted,
  onSetDefault,
}: WorkspaceManagerProps) {
  const api = useApi();
  const toast = useToast();
  const { confirm: showConfirm, ConfirmDialog: WorkspaceConfirmDialog } = useConfirm();
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPath.trim()) {
      setError('Name und Pfad sind erforderlich');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const data = await api.post(
        '/workspaces',
        {
          name: newName.trim(),
          hostPath: newPath.trim(),
          description: newDescription.trim(),
        },
        { showError: false }
      );

      onWorkspaceCreated(data.workspace);
      toast.success('Workspace erstellt');
      setNewName('');
      setNewPath('');
      setNewDescription('');
      setShowCreateForm(false);
    } catch (err: unknown) {
      const e = err as ApiError;
      setError((e.data?.error as string) || e.message || 'Fehler beim Erstellen');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (workspace: Workspace) => {
    if (!(await showConfirm({ message: `Workspace "${workspace.name}" wirklich löschen?` }))) {
      return;
    }

    try {
      await api.del(`/workspaces/${workspace.id}`, { showError: false });
      onWorkspaceDeleted(workspace.id);
      toast.success('Workspace gelöscht');
    } catch (err: unknown) {
      const e = err as ApiError;
      setError((e.data?.error as string) || e.message || 'Fehler beim Löschen');
    }
  };

  const handleSetDefault = async (workspace: Workspace) => {
    try {
      await api.post(`/workspaces/${workspace.id}/default`, {}, { showError: false });
      onSetDefault(workspace.id);
      toast.success('Standard-Workspace geändert');
    } catch (err: unknown) {
      const e = err as ApiError;
      setError((e.data?.error as string) || e.message || 'Fehler beim Setzen des Standards');
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={
        <>
          <Folder className="size-5 inline-block mr-2" /> Workspace-Verwaltung
        </>
      }
      size="medium"
    >
      {error && (
        <div className="flex items-center gap-3 py-3 px-6 bg-destructive/10 border-b border-destructive/30 text-destructive text-sm">
          <AlertCircle className="size-4" /> {error}
          <button
            type="button"
            className="ml-auto bg-transparent border-none text-inherit cursor-pointer p-1 flex rounded hover:bg-destructive/20"
            onClick={() => setError(null)}
            aria-label="Fehlermeldung schließen"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 px-6 flex flex-col gap-3">
        {workspaces.map(ws => (
          <div
            key={ws.id}
            className={cn(
              'flex justify-between items-start p-4 bg-background border border-border rounded-lg transition-all max-sm:flex-col max-sm:gap-3 max-sm:p-3',
              ws.is_default ? 'border-primary bg-primary/5' : 'hover:border-primary/30'
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1">
                {ws.is_default && <Star className="size-4 text-muted-foreground" />}
                {ws.name}
                {ws.is_system && (
                  <span className="text-[0.65rem] py-0.5 px-2 bg-[var(--neutral-alpha-20)] text-muted-foreground rounded-full font-medium uppercase">
                    System
                  </span>
                )}
              </div>
              <div className="mb-1">
                <code className="text-xs text-muted-foreground bg-primary/10 py-0.5 px-2 rounded">
                  {ws.host_path}
                </code>
              </div>
              {ws.description && (
                <div className="text-xs text-muted-foreground mt-1">{ws.description}</div>
              )}
            </div>
            <div className="flex gap-2 shrink-0 max-sm:w-full max-sm:justify-end">
              {!ws.is_default && (
                <button
                  type="button"
                  className="bg-transparent border border-border text-muted-foreground cursor-pointer p-2 rounded-lg flex items-center justify-center transition-all hover:bg-accent hover:border-primary hover:text-primary"
                  onClick={() => handleSetDefault(ws)}
                  title="Als Standard setzen"
                  aria-label="Als Standard setzen"
                >
                  <Star className="size-4" />
                </button>
              )}
              {!ws.is_system && !ws.is_default && (
                <button
                  type="button"
                  className="bg-transparent border border-border text-muted-foreground cursor-pointer p-2 rounded-lg flex items-center justify-center transition-all hover:border-destructive hover:text-destructive"
                  onClick={() => handleDelete(ws)}
                  title="Löschen"
                  aria-label="Löschen"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {!showCreateForm ? (
        <button
          type="button"
          className="flex items-center justify-center gap-2 mx-6 mb-4 py-4 bg-transparent border-2 border-dashed border-border rounded-lg text-muted-foreground text-sm cursor-pointer transition-all hover:border-primary hover:text-primary hover:bg-primary/5"
          onClick={() => setShowCreateForm(true)}
        >
          <Plus className="size-4" /> Neuen Workspace erstellen
        </button>
      ) : (
        <form
          className="p-4 px-6 pb-6 border-t border-border animate-[slideDown_0.2s_ease]"
          onSubmit={handleCreate}
        >
          <h3 className="text-base font-semibold text-foreground m-0 mb-4">
            Neuen Workspace erstellen
          </h3>

          <div className="mb-4">
            <label
              htmlFor="ws-name"
              className="block text-xs font-medium text-muted-foreground mb-2"
            >
              Name *
            </label>
            <input
              id="ws-name"
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Mein Projekt"
              required
              autoFocus
              className="w-full py-3 px-4 bg-background border border-border rounded-lg text-foreground text-sm transition-all focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 placeholder:text-muted-foreground"
            />
          </div>

          <div className="mb-4">
            <label
              htmlFor="ws-path"
              className="block text-xs font-medium text-muted-foreground mb-2"
            >
              Host-Pfad *
            </label>
            <input
              id="ws-path"
              type="text"
              value={newPath}
              onChange={e => setNewPath(e.target.value)}
              placeholder="/opt/arasul/mein-projekt"
              required
              className="w-full py-3 px-4 bg-background border border-border rounded-lg text-foreground text-sm transition-all focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 placeholder:text-muted-foreground"
            />
            <span className="block text-[0.7rem] text-muted-foreground mt-1">
              Absoluter Pfad auf dem Jetson (wird erstellt falls nicht vorhanden)
            </span>
          </div>

          <div className="mb-4">
            <label
              htmlFor="ws-desc"
              className="block text-xs font-medium text-muted-foreground mb-2"
            >
              Beschreibung
            </label>
            <input
              id="ws-desc"
              type="text"
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              placeholder="Kurze Beschreibung des Projekts"
              className="w-full py-3 px-4 bg-background border border-border rounded-lg text-foreground text-sm transition-all focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex justify-end gap-3 mt-5 pt-4 max-sm:flex-col">
            <button
              type="button"
              className="inline-flex items-center gap-2 py-2.5 px-5 bg-transparent border border-border rounded-lg text-muted-foreground text-sm font-medium cursor-pointer transition-all hover:bg-accent hover:text-foreground max-sm:w-full max-sm:justify-center"
              onClick={() => setShowCreateForm(false)}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 py-2.5 px-5 bg-primary border-transparent rounded-lg text-white text-sm font-medium cursor-pointer transition-all hover:enabled:bg-primary/85 disabled:opacity-60 disabled:cursor-not-allowed max-sm:w-full max-sm:justify-center"
              disabled={creating}
            >
              {creating ? (
                <>
                  <RefreshCw className="size-4 animate-spin" /> Erstellen...
                </>
              ) : (
                <>
                  <Plus className="size-4" /> Erstellen
                </>
              )}
            </button>
          </div>
        </form>
      )}

      <div className="p-4 px-6 bg-muted/50 border-t border-muted-foreground/20">
        <p className="flex items-start gap-2 text-xs text-muted-foreground m-0 leading-relaxed">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" /> Nach dem Erstellen eines neuen
          Workspace muss Claude Code neu gestartet werden, damit der Workspace verfügbar ist.
        </p>
      </div>
      <WorkspaceConfirmDialog />
    </Modal>
  );
}

// Setup Wizard Component
interface SetupWizardProps {
  config: ClaudeCodeConfig;
  setConfig: (config: ClaudeCodeConfig) => void;
  onComplete: () => void;
  onSkip: () => void;
  workspaces: Workspace[];
  onOpenWorkspaceManager: () => void;
}

function SetupWizard({
  config,
  setConfig,
  onComplete,
  onSkip,
  workspaces,
  onOpenWorkspaceManager,
}: SetupWizardProps) {
  const api = useApi();
  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalSteps = 3;

  useEffect(() => {
    if (workspaces.length > 0 && !workspace) {
      const defaultWs = workspaces.find(ws => ws.is_default);
      setWorkspace(defaultWs ? defaultWs.container_path : workspaces[0].container_path);
    }
  }, [workspaces, workspace]);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(e.target.value);
    setError(null);
  };

  const validateApiKey = () => {
    if (!apiKey || apiKey.trim() === '') {
      setError('Bitte gib deinen Anthropic API-Key ein.');
      return false;
    }
    if (!apiKey.startsWith('sk-ant-')) {
      setError('Ungültiges API-Key Format. Der Key sollte mit "sk-ant-" beginnen.');
      return false;
    }
    return true;
  };

  const nextStep = () => {
    if (step === 1 && !validateApiKey()) return;
    setError(null);
    setStep(step + 1);
  };

  const prevStep = () => {
    setError(null);
    setStep(step - 1);
  };

  const completeSetup = async () => {
    setSaving(true);
    setError(null);

    try {
      const newConfig = {
        ANTHROPIC_API_KEY: apiKey,
        CLAUDE_WORKSPACE: workspace,
      };

      await api.post('/apps/claude-code/config', { config: newConfig }, { showError: false });
      await api.post('/apps/claude-code/start', {}, { showError: false });

      const selectedWs = workspaces.find(ws => ws.container_path === workspace);
      if (selectedWs) {
        try {
          await api.post(`/workspaces/${selectedWs.id}/use`, {}, { showError: false });
        } catch {
          // Non-critical
        }
      }

      onComplete();
    } catch (err: unknown) {
      console.error('Setup error:', err);
      const e = err as ApiError;
      setError(
        (e.data?.error as string) ||
          e.message ||
          'Fehler bei der Einrichtung. Bitte versuche es erneut.'
      );
      setSaving(false);
    }
  };

  const getWorkspaceName = (containerPath: string) => {
    const ws = workspaces.find(w => w.container_path === containerPath);
    return ws ? ws.name : containerPath;
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <div className="w-full max-w-[600px] bg-card border border-border rounded-2xl overflow-hidden shadow-[var(--shadow-xl)]">
        {/* Progress Bar */}
        <div className="relative py-6 px-8 border-b border-border">
          <div
            className="absolute top-0 left-0 h-1 bg-primary transition-all duration-300"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
          <div className="flex justify-center gap-8">
            {[1, 2, 3].map(s => (
              <div
                key={s}
                className={cn(
                  'size-8 rounded-full flex items-center justify-center text-sm font-semibold border transition-all',
                  step >= s
                    ? 'bg-primary border-primary text-white'
                    : 'bg-background border-border text-muted-foreground',
                  step === s && 'ring-4 ring-primary/20'
                )}
              >
                {step > s ? <Check className="size-4" /> : s}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="p-8">
          {step === 1 && (
            <div className="text-center">
              <div className="size-16 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mx-auto mb-6">
                <Zap className="size-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                Willkommen bei Claude Code
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Claude Code ist ein KI-Programmierassistent, der direkt in deinem Browser läuft. Um
                loszulegen, benötigst du einen Anthropic API-Key.
              </p>

              <div className="text-left">
                <label
                  htmlFor="setup-api-key"
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2"
                >
                  <KeyRound className="size-4 text-primary" /> Anthropic API Key
                </label>
                <input
                  id="setup-api-key"
                  type="password"
                  value={apiKey}
                  onChange={handleApiKeyChange}
                  placeholder="sk-ant-api03-..."
                  className={cn(
                    'w-full py-3 px-4 bg-background border rounded-lg text-foreground text-sm transition-all focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 placeholder:text-muted-foreground',
                    error ? 'border-destructive ring-3 ring-destructive/10' : 'border-border'
                  )}
                  autoFocus
                />
                {error && (
                  <span className="flex items-center gap-1.5 text-sm text-destructive mt-2">
                    <AlertCircle className="size-4" /> {error}
                  </span>
                )}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-primary mt-3 no-underline hover:underline"
                >
                  <ExternalLink className="size-4" /> API-Key bei Anthropic erstellen
                </a>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="text-center">
              <div className="size-16 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mx-auto mb-6">
                <Folder className="size-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">Workspace auswählen</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Wähle das Verzeichnis, in dem Claude Code arbeiten soll.
              </p>

              <div className="text-left flex flex-col gap-3">
                {workspaces.map(ws => (
                  <div
                    key={ws.id}
                    className={cn(
                      'flex items-center gap-4 p-4 bg-background border rounded-lg cursor-pointer transition-all hover:border-primary hover:bg-primary/5',
                      workspace === ws.container_path
                        ? 'border-primary bg-primary/10'
                        : 'border-border'
                    )}
                    onClick={() => setWorkspace(ws.container_path)}
                  >
                    <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      {ws.is_system ? (
                        <Cpu className="size-5 text-primary" />
                      ) : (
                        <Folder className="size-5 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="flex items-center gap-1 text-sm font-semibold text-foreground m-0">
                        {ws.name}
                        {ws.is_default && <Star className="size-3.5 text-muted-foreground" />}
                      </h4>
                      <p className="text-xs text-muted-foreground m-0 mt-0.5">
                        {ws.description || 'Keine Beschreibung'}
                      </p>
                      <code className="text-xs text-muted-foreground bg-primary/10 py-0.5 px-2 rounded mt-1 inline-block">
                        {ws.container_path}
                      </code>
                    </div>
                    {workspace === ws.container_path && (
                      <Check className="size-5 text-primary shrink-0" />
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  className="flex items-center justify-center gap-2 w-full py-3 mt-2 bg-transparent border border-dashed border-border rounded-lg text-muted-foreground text-sm cursor-pointer transition-all hover:border-primary hover:text-primary hover:bg-primary/5"
                  onClick={onOpenWorkspaceManager}
                >
                  <Plus className="size-4" /> Neuen Workspace erstellen oder verwalten
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center">
              <div className="size-16 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mx-auto mb-6">
                <Check className="size-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">Bereit zum Starten!</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Deine Konfiguration ist vollständig. Claude Code wird jetzt eingerichtet und
                gestartet.
              </p>

              <div className="bg-background border border-border rounded-lg p-4 text-left mb-4">
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <KeyRound className="size-4 text-primary" /> API-Key:
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    ****{apiKey.slice(-8)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Folder className="size-4 text-primary" /> Workspace:
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {getWorkspaceName(workspace)}
                  </span>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm mb-4">
                  <AlertCircle className="size-4" /> {error}
                </div>
              )}

              <div className="flex items-center gap-2 p-3 bg-muted-foreground/10 border border-muted-foreground/30 rounded-lg text-muted-foreground text-sm">
                <AlertTriangle className="size-4 shrink-0" />
                <span>Claude Code läuft im autonomen Modus für beste Performance.</span>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between p-6 border-t border-border">
          {step > 1 ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 py-2.5 px-4 bg-transparent border border-border rounded-lg text-muted-foreground text-sm font-medium cursor-pointer transition-all hover:bg-card hover:text-foreground"
              onClick={prevStep}
              disabled={saving}
            >
              <ChevronLeft className="size-4" /> Zurück
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3">
            {step === 1 && (
              <button
                type="button"
                className="py-2.5 px-4 bg-transparent border-none text-muted-foreground text-sm cursor-pointer transition-all hover:text-foreground"
                onClick={onSkip}
              >
                Später einrichten
              </button>
            )}

            {step < totalSteps ? (
              <button
                type="button"
                className="inline-flex items-center gap-2 py-2.5 px-4 bg-primary border-transparent rounded-lg text-white text-sm font-medium cursor-pointer transition-all hover:bg-primary/85"
                onClick={nextStep}
              >
                Weiter <ChevronRight className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-2 py-2.5 px-5 bg-primary border-transparent rounded-lg text-white text-sm font-medium cursor-pointer transition-all hover:bg-primary/85 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={completeSetup}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" /> Einrichten...
                  </>
                ) : (
                  <>
                    <Play className="size-4" /> Claude Code starten
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClaudeCode() {
  const api = useApi();
  const navigate = useNavigate();
  const [appStatus, setAppStatus] = useState<ClaudeAppStatus | null>(null);
  const [config, setConfig] = useState<ClaudeCodeConfig>({});
  const { confirm: showConfirm, ConfirmDialog } = useConfirm();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [showWorkspaceManager, setShowWorkspaceManager] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [terminalUrl, setTerminalUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ type: string; text: string } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [authStatus, setAuthStatus] = useState<ClaudeAuthStatus | null>(null);
  const [authRefreshing, setAuthRefreshing] = useState(false);
  const setupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadWorkspaces = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await api.get('/workspaces', { signal, showError: false });
        setWorkspaces(data.workspaces || []);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('Error loading workspaces:', err);
        setWorkspaces([
          {
            id: 1,
            name: 'Arasul Projekt',
            slug: 'arasul',
            description: 'Das Hauptprojekt dieser Plattform',
            host_path: '/opt/arasul',
            container_path: '/workspace/arasul',
            is_default: true,
            is_system: true,
          },
          {
            id: 2,
            name: 'Eigener Workspace',
            slug: 'custom',
            description: 'Dein persönliches Verzeichnis',
            host_path: '/home/user/workspace',
            container_path: '/workspace/custom',
            is_default: false,
            is_system: false,
          },
        ]);
      }
    },
    [api]
  );

  const loadAuthStatus = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await api.get('/apps/claude-code/auth-status', { signal, showError: false });
        setAuthStatus(data);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('Error loading auth status:', err);
        setAuthStatus(null);
      }
    },
    [api]
  );

  const handleAuthRefresh = async () => {
    setAuthRefreshing(true);
    try {
      const data = await api.post('/apps/claude-code/auth-refresh', {}, { showError: false });
      setAuthStatus(data.status);
      if (data.success) {
        setSaveMessage({ type: 'success', text: data.message });
      } else {
        setSaveMessage({ type: 'error', text: data.message });
      }
    } catch (err: unknown) {
      console.error('Error refreshing auth:', err);
      const e = err as ApiError;
      setSaveMessage({
        type: 'error',
        text: (e.data?.message as string) || e.message || 'Token-Refresh fehlgeschlagen',
      });
    } finally {
      setAuthRefreshing(false);
      setTimeout(() => setSaveMessage(null), 5000);
    }
  };

  const loadAppData = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setError(null);
        const [statusRes, configRes] = await Promise.all([
          api.get('/apps/claude-code', { signal, showError: false }),
          api.get('/apps/claude-code/config', { signal, showError: false }),
        ]);

        const app = statusRes.app || statusRes;
        setAppStatus(app);
        const loadedConfig = configRes.config || {};
        setConfig(loadedConfig);

        if (!loadedConfig.ANTHROPIC_API_KEY_set && app.status !== 'running') {
          setShowSetupWizard(true);
        }

        if (app.status === 'running') {
          const protocol = window.location.protocol;
          setTerminalUrl(`${protocol}//${window.location.host}/claude-terminal/`);
        } else {
          setTerminalUrl('');
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('Error loading Claude Code:', err);
        setError('Fehler beim Laden der App-Daten.');
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadAppData(controller.signal);
    loadWorkspaces(controller.signal);
    loadAuthStatus(controller.signal);

    return () => {
      controller.abort();
      if (setupTimeoutRef.current) {
        clearTimeout(setupTimeoutRef.current);
      }
    };
  }, [loadAppData, loadWorkspaces, loadAuthStatus]);

  useEffect(() => {
    if (appStatus?.status === 'running') {
      const controller = new AbortController();
      const interval = setInterval(() => loadAuthStatus(controller.signal), 30000);
      return () => {
        controller.abort();
        clearInterval(interval);
      };
    }
  }, [appStatus?.status, loadAuthStatus]);

  useEffect(() => {
    if (actionLoading) {
      const controller = new AbortController();
      const interval = setInterval(async () => {
        try {
          const res = await api.get('/apps/claude-code', {
            signal: controller.signal,
            showError: false,
          });
          const app = res.app || res;
          setAppStatus(app);
          if (app.status === 'running') {
            setActionLoading(false);
            if (setupTimeoutRef.current) {
              clearTimeout(setupTimeoutRef.current);
              setupTimeoutRef.current = null;
            }
            loadAppData(controller.signal);
          }
        } catch {
          // Continue polling
        }
      }, 2000);
      return () => {
        controller.abort();
        clearInterval(interval);
      };
    }
  }, [actionLoading, api, loadAppData]);

  useEffect(() => {
    if (loading) {
      const timeout = setTimeout(() => setLoadingTimeout(true), 15000);
      return () => clearTimeout(timeout);
    }
    setLoadingTimeout(false);
  }, [loading]);

  const handleSetupComplete = () => {
    setShowSetupWizard(false);
    // actionLoading=true triggers the polling useEffect (line 821-830) which
    // already polls /apps/claude-code every 2s with proper AbortController cleanup
    setActionLoading(true);

    setupTimeoutRef.current = setTimeout(() => {
      setActionLoading(false);
      setError('Setup dauert länger als erwartet. Bitte prüfe den Status manuell.');
      loadAppData();
      setupTimeoutRef.current = null;
    }, 60000);
  };

  const handleSetupSkip = () => {
    setShowSetupWizard(false);
  };

  const handleWorkspaceCreated = (workspace: Workspace) => {
    setWorkspaces([...workspaces, workspace]);
  };

  const handleWorkspaceDeleted = (workspaceId: number) => {
    setWorkspaces(workspaces.filter(ws => ws.id !== workspaceId));
  };

  const handleSetDefault = (workspaceId: number) => {
    setWorkspaces(workspaces.map(ws => ({ ...ws, is_default: ws.id === workspaceId })));
  };

  const saveConfig = async () => {
    try {
      setActionLoading(true);
      setSaveMessage(null);

      try {
        await api.post('/apps/claude-code/config', { config }, { showError: false });
      } catch (configErr: unknown) {
        console.error('Config save error:', configErr);
        const e = configErr as ApiError;
        const errorMsg = (e.data?.error as string) || e.message || 'Unbekannter Fehler';
        setSaveMessage({ type: 'error', text: `Fehler beim Speichern: ${errorMsg}` });
        return;
      }

      const selectedWs = workspaces.find(ws => ws.container_path === config.CLAUDE_WORKSPACE);
      if (selectedWs) {
        try {
          await api.post(`/workspaces/${selectedWs.id}/use`, {}, { showError: false });
        } catch {
          // Non-critical
        }
      }

      if (appStatus?.status === 'running') {
        setSaveMessage({
          type: 'success',
          text: 'Konfiguration gespeichert. Container wird neu erstellt...',
        });
        try {
          const restartRes = await api.post(
            '/apps/claude-code/restart',
            { applyConfig: true },
            { showError: false }
          );

          if (restartRes.async) {
            setSaveMessage({
              type: 'success',
              text: 'Container wird im Hintergrund neu erstellt. Bitte warten...',
            });

            let attempts = 0;
            const maxAttempts = 15;
            const pollInterval = setInterval(async () => {
              attempts++;
              try {
                const statusRes = await api.get('/apps/claude-code', { showError: false });
                if (statusRes.status === 'running') {
                  clearInterval(pollInterval);
                  setSaveMessage({
                    type: 'success',
                    text: 'Container erfolgreich mit neuer Konfiguration neu erstellt!',
                  });
                  setTimeout(() => {
                    loadAppData();
                    setSaveMessage(null);
                    setShowSettings(false);
                  }, 2000);
                } else if (statusRes.status === 'error') {
                  clearInterval(pollInterval);
                  setSaveMessage({
                    type: 'error',
                    text: `Fehler: ${statusRes.last_error || 'Unbekannter Fehler'}`,
                  });
                }
              } catch {
                // Ignore poll errors during restart
              }

              if (attempts >= maxAttempts) {
                clearInterval(pollInterval);
                setSaveMessage({
                  type: 'warning',
                  text: 'Container-Neustart dauert länger als erwartet. Prüfe den Status manuell.',
                });
                setTimeout(() => {
                  loadAppData();
                  setSaveMessage(null);
                }, 3000);
              }
            }, 2000);
            return;
          } else {
            setSaveMessage({
              type: 'success',
              text: 'Container erfolgreich mit neuer Konfiguration neu erstellt!',
            });
          }
        } catch (restartErr: unknown) {
          console.error('Restart error:', restartErr);
          const restartErrorMsg =
            restartErr instanceof Error ? restartErr.message : 'Unbekannter Fehler';
          setSaveMessage({
            type: 'warning',
            text: `Konfiguration gespeichert, aber Neustart fehlgeschlagen: ${restartErrorMsg}`,
          });
          setTimeout(() => {
            loadAppData();
            setSaveMessage(null);
          }, 5000);
          return;
        }
      } else {
        setSaveMessage({
          type: 'success',
          text: 'Konfiguration gespeichert. Starte die App, um die Konfiguration anzuwenden.',
        });
      }

      setTimeout(() => {
        loadAppData();
        setSaveMessage(null);
        setShowSettings(false);
      }, 2000);
    } catch (err: unknown) {
      console.error('Error saving config:', err);
      const errorMsg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      setSaveMessage({
        type: 'error',
        text: `Fehler beim Speichern der Konfiguration: ${errorMsg}`,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const startApp = async () => {
    try {
      setActionLoading(true);
      setError(null);
      await api.post('/apps/claude-code/start', {}, { showError: false });
      setTimeout(() => {
        loadAppData();
        setActionLoading(false);
      }, 3000);
    } catch {
      setError('Fehler beim Starten der App.');
      setActionLoading(false);
    }
  };

  const stopApp = async () => {
    try {
      setActionLoading(true);
      setError(null);
      await api.post('/apps/claude-code/stop', {}, { showError: false });
      setTimeout(() => {
        loadAppData();
        setActionLoading(false);
      }, 2000);
    } catch {
      setError('Fehler beim Stoppen der App.');
      setActionLoading(false);
    }
  };

  const restartApp = async () => {
    try {
      setActionLoading(true);
      setError(null);
      await api.post('/apps/claude-code/restart', {}, { showError: false });
      setTimeout(() => {
        loadAppData();
        setActionLoading(false);
      }, 3000);
    } catch {
      setError('Fehler beim Neustarten der App.');
      setActionLoading(false);
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { cls: string; text: string }> = {
      running: {
        cls: 'bg-primary/20 text-primary border-primary/30',
        text: 'Läuft',
      },
      stopped: {
        cls: 'bg-destructive/20 text-destructive border-destructive/30',
        text: 'Gestoppt',
      },
      installed: {
        cls: 'bg-primary/20 text-primary border-primary/30',
        text: 'Installiert',
      },
      installing: {
        cls: 'bg-muted-foreground/20 text-muted-foreground border-muted-foreground/30',
        text: 'Installiert...',
      },
      restarting: {
        cls: 'bg-muted-foreground/20 text-muted-foreground border-muted-foreground/30',
        text: 'Neustart...',
      },
      error: {
        cls: 'bg-[var(--neutral-alpha-20)] text-muted-foreground border-[var(--neutral-alpha-30)]',
        text: 'Fehler',
      },
    };
    const info = statusMap[status] || {
      cls: 'bg-[var(--neutral-alpha-20)] text-muted-foreground border-[var(--neutral-alpha-30)]',
      text: status || 'Unbekannt',
    };
    return (
      <span
        className={cn(
          'claude-status-badge py-1 px-3 rounded-full text-xs font-semibold uppercase tracking-wide border',
          info.cls
        )}
      >
        {info.text}
      </span>
    );
  };

  const getCurrentWorkspaceName = () => {
    const currentPath = config.CLAUDE_WORKSPACE || '/workspace/arasul';
    const ws = workspaces.find((w: Workspace) => w.container_path === currentPath);
    return ws ? ws.name : currentPath;
  };

  if (loading) {
    return (
      <div className="claude-code-page flex flex-col h-full max-w-[1600px] mx-auto bg-background">
        <LoadingSpinner message="Claude Code wird geladen..." />
        {loadingTimeout && (
          <div className="mt-4 text-center">
            <p className="text-muted-foreground mb-4">
              <AlertTriangle className="size-4 inline-block mr-2 align-middle" />
              Laden dauert länger als erwartet.
            </p>
            <div className="flex gap-3 justify-center">
              <Button
                onClick={() => {
                  setLoading(true);
                  setLoadingTimeout(false);
                  loadAppData();
                }}
              >
                <RefreshCw className="size-4" /> Erneut versuchen
              </Button>
              <Button variant="outline" onClick={() => navigate('/')}>
                Zurück zum Dashboard
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (error && !appStatus) {
    return (
      <div className="claude-code-page flex flex-col h-full max-w-[1600px] mx-auto bg-background">
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
          <AlertCircle className="size-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Claude Code nicht verfügbar
          </h2>
          <p className="text-sm text-muted-foreground mb-6">{error}</p>
          <div className="flex gap-3 flex-wrap justify-center">
            <Button
              onClick={() => {
                setError(null);
                setLoading(true);
                loadAppData();
              }}
            >
              <RefreshCw className="size-4" /> Erneut versuchen
            </Button>
            <Button variant="outline" onClick={() => navigate('/')}>
              Zurück zum Dashboard
            </Button>
            <Button variant="outline" onClick={() => navigate('/store')}>
              Zum Store
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (showSetupWizard) {
    return (
      <div className="claude-code-page flex flex-col h-full max-w-[1600px] mx-auto bg-background">
        <SetupWizard
          config={config}
          setConfig={setConfig}
          onComplete={handleSetupComplete}
          onSkip={handleSetupSkip}
          workspaces={workspaces}
          onOpenWorkspaceManager={() => setShowWorkspaceManager(true)}
        />
        {showWorkspaceManager && (
          <WorkspaceManager
            workspaces={workspaces}
            onClose={() => setShowWorkspaceManager(false)}
            onWorkspaceCreated={handleWorkspaceCreated}
            onWorkspaceDeleted={handleWorkspaceDeleted}
            onSetDefault={handleSetDefault}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'claude-code-page flex flex-col h-full max-w-[1600px] mx-auto bg-background',
        isFullscreen && 'fixed inset-0 h-screen z-50 p-0 max-w-none'
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex justify-between items-center pb-6 border-b border-border mb-4 shrink-0 max-md:flex-col max-md:gap-4 max-md:items-start',
          isFullscreen && 'py-3 px-4'
        )}
      >
        <div className="flex items-center gap-4">
          <Terminal className="text-[2rem] text-primary" />
          <div>
            <h1 className="text-2xl font-semibold text-foreground m-0 leading-tight">
              Claude Code
            </h1>
            <span className="text-sm text-muted-foreground">{getCurrentWorkspaceName()}</span>
          </div>
          {getStatusBadge(appStatus?.status)}
        </div>

        {/* Auth Status Badge */}
        {authStatus && appStatus?.status === 'running' && (
          <div className="ml-auto mr-4 max-md:mr-0 max-md:ml-0">
            {authStatus.oauth?.valid ? (
              <div
                className="auth-badge flex items-center gap-2 py-2 px-3 rounded-lg text-sm font-medium bg-primary/15 border border-primary/30 text-primary"
                title={`Token gültig für ${authStatus.oauth.expiresInHours}h`}
              >
                <User className="size-4" />
                <span>
                  {authStatus.oauth.account?.displayName ||
                    authStatus.oauth.account?.email ||
                    'Angemeldet'}
                </span>
                <span className="flex items-center gap-1 py-0.5 px-2 bg-white/10 rounded text-xs ml-1">
                  <Clock className="size-3" /> {authStatus.oauth.expiresInHours}h
                </span>
              </div>
            ) : (
              <div className="auth-badge flex items-center gap-2 py-2 px-3 rounded-lg text-sm font-medium bg-muted-foreground/15 border border-muted-foreground/30 text-muted-foreground">
                <AlertTriangle className="size-4" />
                <span>Session abgelaufen</span>
                <button
                  type="button"
                  className="flex items-center justify-center size-7 p-0 ml-2 bg-white/10 border border-white/20 rounded-md text-inherit cursor-pointer transition-all hover:enabled:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleAuthRefresh}
                  disabled={authRefreshing}
                  title="Token erneuern"
                >
                  {authRefreshing ? (
                    <RefreshCw className="size-3.5 animate-spin" />
                  ) : (
                    <LogIn className="size-3.5" />
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 items-center max-md:w-full max-md:justify-start max-md:flex-wrap">
          {appStatus?.status === 'running' && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={restartApp}
                disabled={actionLoading}
                title="Neustarten"
              >
                <RefreshCw className={cn('size-4', actionLoading && 'animate-spin')} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={stopApp}
                disabled={actionLoading}
                title="Stoppen"
              >
                <Square className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Verkleinern' : 'Vollbild'}
              >
                {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              </Button>
            </>
          )}
          <Button
            variant={showSettings ? 'default' : 'outline'}
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings className="size-4" /> Einstellungen
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-3 py-3 px-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive mb-4 shrink-0">
          <AlertCircle className="size-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            className="bg-transparent border-none text-inherit cursor-pointer p-1 flex items-center justify-center rounded hover:bg-destructive/20"
            onClick={() => setError(null)}
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-card border border-border rounded-xl p-6 mb-4 shrink-0 animate-[slideDown_0.2s_ease]">
          <h3 className="text-base font-semibold text-foreground m-0 mb-5 pb-3 border-b border-border/50">
            Konfiguration
          </h3>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5 mb-5">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="cc-api-key"
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground [&>svg]:text-primary"
              >
                <KeyRound className="size-4" /> Anthropic API Key
                <span className="text-destructive ml-1">*</span>
              </label>
              <input
                id="cc-api-key"
                type="password"
                value={
                  config.ANTHROPIC_API_KEY?.startsWith('****') ? '' : config.ANTHROPIC_API_KEY || ''
                }
                onChange={e => setConfig({ ...config, ANTHROPIC_API_KEY: e.target.value })}
                placeholder={
                  config.ANTHROPIC_API_KEY_set
                    ? 'Aktuell gesetzt - zum Ändern neuen Wert eingeben'
                    : 'sk-ant-api03-...'
                }
                className="py-3 px-4 bg-background border border-border rounded-lg text-foreground text-sm transition-all focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 placeholder:text-muted-foreground"
              />
              <span className="text-xs text-muted-foreground">
                {config.ANTHROPIC_API_KEY_set
                  ? 'API-Key ist gesetzt. Leer lassen um beizubehalten, neuen Wert eingeben zum Ändern.'
                  : 'Dein API-Key von anthropic.com'}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="cc-workspace"
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground [&>svg]:text-primary"
              >
                <Folder className="size-4" /> Workspace
              </label>
              <div className="flex gap-2">
                <select
                  id="cc-workspace"
                  value={config.CLAUDE_WORKSPACE || '/workspace/arasul'}
                  onChange={e => setConfig({ ...config, CLAUDE_WORKSPACE: e.target.value })}
                  className="flex-1 py-3 px-4 bg-background border border-border rounded-lg text-foreground text-sm cursor-pointer transition-all focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>option]:bg-card [&>option]:text-foreground"
                >
                  {workspaces.map(ws => (
                    <option key={ws.id} value={ws.container_path}>
                      {ws.name} {ws.is_default ? '(Standard)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="py-3 px-3 bg-background border border-border text-muted-foreground cursor-pointer rounded-lg flex items-center justify-center transition-all hover:bg-accent hover:border-primary hover:text-primary"
                  onClick={() => setShowWorkspaceManager(true)}
                  title="Workspaces verwalten"
                >
                  <Pencil className="size-4" />
                </button>
              </div>
              <span className="text-xs text-muted-foreground">
                Arbeitsverzeichnis für Claude Code
              </span>
            </div>
          </div>

          <div className="text-xs text-muted-foreground mt-4 p-3 bg-primary/10 rounded-lg">
            <strong>Hinweis:</strong> Claude Code läuft im autonomen Modus
            (--dangerously-skip-permissions). Das Terminal ist ohne Passwort zugänglich.
          </div>

          {saveMessage && (
            <div
              className={cn(
                'flex items-center gap-2 p-3 rounded-lg text-sm mb-4 mt-4',
                saveMessage.type === 'success' &&
                  'bg-primary/10 border border-primary/30 text-primary',
                saveMessage.type === 'error' &&
                  'bg-destructive/10 border border-destructive/30 text-destructive',
                saveMessage.type === 'warning' &&
                  'bg-muted-foreground/10 border border-muted-foreground/30 text-muted-foreground'
              )}
            >
              {saveMessage.type === 'success' ? (
                <Check className="size-4" />
              ) : saveMessage.type === 'warning' ? (
                <AlertTriangle className="size-4" />
              ) : (
                <AlertCircle className="size-4" />
              )}
              {saveMessage.text}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-border/50 mt-4 max-md:flex-col">
            <Button
              variant="outline"
              className="max-md:w-full max-md:justify-center"
              onClick={() => setShowSettings(false)}
            >
              Abbrechen
            </Button>
            <Button
              className="max-md:w-full max-md:justify-center"
              onClick={saveConfig}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <>
                  <RefreshCw className="size-4 animate-spin" /> Speichern...
                </>
              ) : (
                <>
                  <Check className="size-4" /> Speichern
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Workspace Manager Modal */}
      {showWorkspaceManager && (
        <WorkspaceManager
          workspaces={workspaces}
          onClose={() => setShowWorkspaceManager(false)}
          onWorkspaceCreated={handleWorkspaceCreated}
          onWorkspaceDeleted={handleWorkspaceDeleted}
          onSetDefault={handleSetDefault}
        />
      )}

      {/* Terminal Area */}
      <div
        className={cn(
          'flex-1 flex flex-col bg-card border border-border rounded-xl overflow-hidden min-h-[400px]',
          isFullscreen && 'rounded-none'
        )}
      >
        {!config.ANTHROPIC_API_KEY_set ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="size-20 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mb-6">
              <KeyRound className="size-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">API-Key erforderlich</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-[400px]">
              Bitte gib deinen Anthropic API-Key in den Einstellungen ein, um Claude Code zu nutzen.
            </p>
            <div className="flex gap-3 flex-wrap justify-center">
              <Button onClick={() => setShowSetupWizard(true)}>
                <Zap className="size-4" /> Einrichtung starten
              </Button>
              <Button variant="outline" onClick={() => setShowSettings(true)}>
                <Settings className="size-4" /> Einstellungen öffnen
              </Button>
            </div>
          </div>
        ) : appStatus?.status !== 'running' ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="size-20 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mb-6">
              <Terminal className="size-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Claude Code ist nicht gestartet
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Klicke auf Starten, um das Terminal zu öffnen.
            </p>
            <Button onClick={startApp} disabled={actionLoading}>
              {actionLoading ? (
                <>
                  <RefreshCw className="size-4 animate-spin" /> Startet...
                </>
              ) : (
                <>
                  <Play className="size-4" /> Starten
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="flex-1 flex bg-[var(--bg-terminal)]">
            <iframe
              src={terminalUrl}
              title="Claude Code Terminal"
              className="flex-1 w-full h-full border-none bg-[var(--bg-terminal)]"
              allow="clipboard-read; clipboard-write"
            />
          </div>
        )}
      </div>
      {ConfirmDialog}
    </div>
  );
}

export default ClaudeCode;
