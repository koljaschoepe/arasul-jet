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
import { cn } from '@/lib/utils';
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
    } catch (err: any) {
      setError(err.data?.error || err.message || 'Fehler beim Erstellen');
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
    } catch (err: any) {
      setError(err.data?.error || err.message || 'Fehler beim Löschen');
    }
  };

  const handleSetDefault = async (workspace: Workspace) => {
    try {
      await api.post(`/workspaces/${workspace.id}/default`, {}, { showError: false });
      onSetDefault(workspace.id);
      toast.success('Standard-Workspace geändert');
    } catch (err: any) {
      setError(err.data?.error || err.message || 'Fehler beim Setzen des Standards');
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={
        <>
          <Folder className="w-5 h-5 inline-block mr-2" /> Workspace-Verwaltung
        </>
      }
      size="medium"
    >
      {error && (
        <div className="flex items-center gap-3 py-3 px-6 bg-[var(--danger-alpha-10)] border-b border-[var(--danger-alpha-30)] text-[var(--danger-color)] text-sm">
          <AlertCircle className="w-4 h-4" /> {error}
          <button
            type="button"
            className="ml-auto bg-transparent border-none text-inherit cursor-pointer p-1 flex rounded hover:bg-[var(--danger-alpha-20)]"
            onClick={() => setError(null)}
            aria-label="Fehlermeldung schließen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 px-6 flex flex-col gap-3">
        {workspaces.map(ws => (
          <div
            key={ws.id}
            className={cn(
              'flex justify-between items-start p-4 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg transition-all max-sm:flex-col max-sm:gap-3 max-sm:p-3',
              ws.is_default
                ? 'border-[var(--primary-color)] bg-[var(--primary-alpha-5)]'
                : 'hover:border-[var(--primary-alpha-30)]'
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)] mb-1">
                {ws.is_default && <Star className="w-4 h-4 text-[var(--warning-color)]" />}
                {ws.name}
                {ws.is_system && (
                  <span className="text-[0.65rem] py-0.5 px-2 bg-[var(--neutral-alpha-20)] text-[var(--text-muted)] rounded-full font-medium uppercase">
                    System
                  </span>
                )}
              </div>
              <div className="mb-1">
                <code className="text-xs text-[var(--text-secondary)] bg-[var(--primary-alpha-10)] py-0.5 px-2 rounded">
                  {ws.host_path}
                </code>
              </div>
              {ws.description && (
                <div className="text-xs text-[var(--text-muted)] mt-1">{ws.description}</div>
              )}
            </div>
            <div className="flex gap-2 shrink-0 max-sm:w-full max-sm:justify-end">
              {!ws.is_default && (
                <button
                  type="button"
                  className="bg-transparent border border-[var(--border-color)] text-[var(--text-muted)] cursor-pointer p-2 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--bg-card-hover)] hover:border-[var(--primary-color)] hover:text-[var(--primary-color)]"
                  onClick={() => handleSetDefault(ws)}
                  title="Als Standard setzen"
                  aria-label="Als Standard setzen"
                >
                  <Star className="w-4 h-4" />
                </button>
              )}
              {!ws.is_system && !ws.is_default && (
                <button
                  type="button"
                  className="bg-transparent border border-[var(--border-color)] text-[var(--text-muted)] cursor-pointer p-2 rounded-lg flex items-center justify-center transition-all hover:border-[var(--danger-color)] hover:text-[var(--danger-color)]"
                  onClick={() => handleDelete(ws)}
                  title="Löschen"
                  aria-label="Löschen"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {!showCreateForm ? (
        <button
          type="button"
          className="flex items-center justify-center gap-2 mx-6 mb-4 py-4 bg-transparent border-2 border-dashed border-[var(--border-color)] rounded-lg text-[var(--text-muted)] text-sm cursor-pointer transition-all hover:border-[var(--primary-color)] hover:text-[var(--primary-color)] hover:bg-[var(--primary-alpha-5)]"
          onClick={() => setShowCreateForm(true)}
        >
          <Plus className="w-4 h-4" /> Neuen Workspace erstellen
        </button>
      ) : (
        <form
          className="p-4 px-6 pb-6 border-t border-[var(--border-color)] animate-[slideDown_0.2s_ease]"
          onSubmit={handleCreate}
        >
          <h3 className="text-base font-semibold text-[var(--text-primary)] m-0 mb-4">
            Neuen Workspace erstellen
          </h3>

          <div className="mb-4">
            <label
              htmlFor="ws-name"
              className="block text-xs font-medium text-[var(--text-secondary)] mb-2"
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
              className="w-full py-3 px-4 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm transition-all focus:outline-none focus:border-[var(--primary-color)] focus:shadow-[0_0_0_3px_var(--primary-alpha-10)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          <div className="mb-4">
            <label
              htmlFor="ws-path"
              className="block text-xs font-medium text-[var(--text-secondary)] mb-2"
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
              className="w-full py-3 px-4 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm transition-all focus:outline-none focus:border-[var(--primary-color)] focus:shadow-[0_0_0_3px_var(--primary-alpha-10)] placeholder:text-[var(--text-muted)]"
            />
            <span className="block text-[0.7rem] text-[var(--text-muted)] mt-1">
              Absoluter Pfad auf dem Jetson (wird erstellt falls nicht vorhanden)
            </span>
          </div>

          <div className="mb-4">
            <label
              htmlFor="ws-desc"
              className="block text-xs font-medium text-[var(--text-secondary)] mb-2"
            >
              Beschreibung
            </label>
            <input
              id="ws-desc"
              type="text"
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              placeholder="Kurze Beschreibung des Projekts"
              className="w-full py-3 px-4 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm transition-all focus:outline-none focus:border-[var(--primary-color)] focus:shadow-[0_0_0_3px_var(--primary-alpha-10)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          <div className="flex justify-end gap-3 mt-5 pt-4 max-sm:flex-col">
            <button
              type="button"
              className="inline-flex items-center gap-2 py-2.5 px-5 bg-transparent border border-[var(--border-color)] rounded-lg text-[var(--text-muted)] text-sm font-medium cursor-pointer transition-all hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] max-sm:w-full max-sm:justify-center"
              onClick={() => setShowCreateForm(false)}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 py-2.5 px-5 bg-[var(--gradient-primary)] border-none rounded-lg text-white text-sm font-medium cursor-pointer transition-all hover:enabled:shadow-[var(--shadow-md)] disabled:opacity-60 disabled:cursor-not-allowed max-sm:w-full max-sm:justify-center"
              disabled={creating}
            >
              {creating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Erstellen...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" /> Erstellen
                </>
              )}
            </button>
          </div>
        </form>
      )}

      <div className="p-4 px-6 bg-[rgba(245,158,11,0.05)] border-t border-[var(--warning-alpha-20)]">
        <p className="flex items-start gap-2 text-xs text-[var(--warning-color)] m-0 leading-relaxed">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> Nach dem Erstellen eines neuen
          Workspace muss Claude Code neu gestartet werden, damit der Workspace verfügbar ist.
        </p>
      </div>
      <WorkspaceConfirmDialog />
    </Modal>
  );
}

// Setup Wizard Component
interface SetupWizardProps {
  config: any;
  setConfig: (config: any) => void;
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
    } catch (err: any) {
      console.error('Setup error:', err);
      setError(
        err.data?.error || err.message || 'Fehler bei der Einrichtung. Bitte versuche es erneut.'
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
      <div className="w-full max-w-[600px] bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-[var(--shadow-xl)]">
        {/* Progress Bar */}
        <div className="relative py-6 px-8 border-b border-[var(--border-color)]">
          <div
            className="absolute top-0 left-0 h-1 bg-[var(--primary-color)] transition-all duration-300"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
          <div className="flex justify-center gap-8">
            {[1, 2, 3].map(s => (
              <div
                key={s}
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border transition-all',
                  step >= s
                    ? 'bg-[var(--primary-color)] border-[var(--primary-color)] text-white'
                    : 'bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-muted)]',
                  step === s && 'shadow-[0_0_0_4px_var(--primary-alpha-20)]'
                )}
              >
                {step > s ? <Check className="w-4 h-4" /> : s}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="p-8">
          {step === 1 && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[var(--primary-alpha-10)] to-[var(--primary-alpha-5)] flex items-center justify-center mx-auto mb-6">
                <Zap className="w-8 h-8 text-[var(--primary-color)]" />
              </div>
              <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
                Willkommen bei Claude Code
              </h2>
              <p className="text-sm text-[var(--text-muted)] mb-6">
                Claude Code ist ein KI-Programmierassistent, der direkt in deinem Browser läuft. Um
                loszulegen, benötigst du einen Anthropic API-Key.
              </p>

              <div className="text-left">
                <label
                  htmlFor="setup-api-key"
                  className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] mb-2"
                >
                  <KeyRound className="w-4 h-4 text-[var(--primary-color)]" /> Anthropic API Key
                </label>
                <input
                  id="setup-api-key"
                  type="password"
                  value={apiKey}
                  onChange={handleApiKeyChange}
                  placeholder="sk-ant-api03-..."
                  className={cn(
                    'w-full py-3 px-4 bg-[var(--bg-dark)] border rounded-lg text-[var(--text-primary)] text-sm transition-all focus:outline-none focus:border-[var(--primary-color)] focus:shadow-[0_0_0_3px_var(--primary-alpha-10)] placeholder:text-[var(--text-muted)]',
                    error
                      ? 'border-[var(--danger-color)] shadow-[0_0_0_3px_var(--danger-alpha-10)]'
                      : 'border-[var(--border-color)]'
                  )}
                  autoFocus
                />
                {error && (
                  <span className="flex items-center gap-1.5 text-sm text-[var(--danger-color)] mt-2">
                    <AlertCircle className="w-4 h-4" /> {error}
                  </span>
                )}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-[var(--primary-color)] mt-3 no-underline hover:underline"
                >
                  <ExternalLink className="w-4 h-4" /> API-Key bei Anthropic erstellen
                </a>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[var(--primary-alpha-10)] to-[var(--primary-alpha-5)] flex items-center justify-center mx-auto mb-6">
                <Folder className="w-8 h-8 text-[var(--primary-color)]" />
              </div>
              <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
                Workspace auswählen
              </h2>
              <p className="text-sm text-[var(--text-muted)] mb-6">
                Wähle das Verzeichnis, in dem Claude Code arbeiten soll.
              </p>

              <div className="text-left flex flex-col gap-3">
                {workspaces.map(ws => (
                  <div
                    key={ws.id}
                    className={cn(
                      'flex items-center gap-4 p-4 bg-[var(--bg-dark)] border rounded-lg cursor-pointer transition-all hover:border-[var(--primary-color)] hover:bg-[rgba(69,173,255,0.04)]',
                      workspace === ws.container_path
                        ? 'border-[var(--primary-color)] bg-[rgba(69,173,255,0.08)]'
                        : 'border-[var(--border-color)]'
                    )}
                    onClick={() => setWorkspace(ws.container_path)}
                  >
                    <div className="w-10 h-10 rounded-lg bg-[rgba(69,173,255,0.1)] flex items-center justify-center shrink-0">
                      {ws.is_system ? (
                        <Cpu className="w-5 h-5 text-[var(--primary-color)]" />
                      ) : (
                        <Folder className="w-5 h-5 text-[var(--primary-color)]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="flex items-center gap-1 text-sm font-semibold text-[var(--text-primary)] m-0">
                        {ws.name}
                        {ws.is_default && (
                          <Star className="w-3.5 h-3.5 text-[var(--warning-color)]" />
                        )}
                      </h4>
                      <p className="text-xs text-[var(--text-muted)] m-0 mt-0.5">
                        {ws.description || 'Keine Beschreibung'}
                      </p>
                      <code className="text-xs text-[var(--text-secondary)] bg-[rgba(69,173,255,0.08)] py-0.5 px-2 rounded mt-1 inline-block">
                        {ws.container_path}
                      </code>
                    </div>
                    {workspace === ws.container_path && (
                      <Check className="w-5 h-5 text-[var(--primary-color)] shrink-0" />
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  className="flex items-center justify-center gap-2 w-full py-3 mt-2 bg-transparent border border-dashed border-[var(--border-color)] rounded-lg text-[var(--text-muted)] text-sm cursor-pointer transition-all hover:border-[var(--primary-color)] hover:text-[var(--primary-color)] hover:bg-[var(--primary-alpha-5)]"
                  onClick={onOpenWorkspaceManager}
                >
                  <Plus className="w-4 h-4" /> Neuen Workspace erstellen oder verwalten
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[var(--primary-alpha-10)] to-[var(--primary-alpha-5)] flex items-center justify-center mx-auto mb-6">
                <Check className="w-8 h-8 text-[var(--primary-color)]" />
              </div>
              <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
                Bereit zum Starten!
              </h2>
              <p className="text-sm text-[var(--text-muted)] mb-6">
                Deine Konfiguration ist vollständig. Claude Code wird jetzt eingerichtet und
                gestartet.
              </p>

              <div className="bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg p-4 text-left mb-4">
                <div className="flex justify-between items-center py-2 border-b border-[var(--border-subtle)]">
                  <span className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <KeyRound className="w-4 h-4 text-[var(--primary-color)]" /> API-Key:
                  </span>
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    ****{apiKey.slice(-8)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <Folder className="w-4 h-4 text-[var(--primary-color)]" /> Workspace:
                  </span>
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {getWorkspaceName(workspace)}
                  </span>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-[var(--danger-alpha-10)] border border-[var(--danger-alpha-30)] rounded-lg text-[var(--danger-color)] text-sm mb-4">
                  <AlertCircle className="w-4 h-4" /> {error}
                </div>
              )}

              <div className="flex items-center gap-2 p-3 bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.3)] rounded-lg text-[var(--warning-color)] text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Claude Code läuft im autonomen Modus für beste Performance.</span>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between p-6 border-t border-[var(--border-color)]">
          {step > 1 ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 py-2.5 px-4 bg-transparent border border-[var(--border-color)] rounded-lg text-[var(--text-muted)] text-sm font-medium cursor-pointer transition-all hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
              onClick={prevStep}
              disabled={saving}
            >
              <ChevronLeft className="w-4 h-4" /> Zurück
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3">
            {step === 1 && (
              <button
                type="button"
                className="py-2.5 px-4 bg-transparent border-none text-[var(--text-muted)] text-sm cursor-pointer transition-all hover:text-[var(--text-primary)]"
                onClick={onSkip}
              >
                Später einrichten
              </button>
            )}

            {step < totalSteps ? (
              <button
                type="button"
                className="inline-flex items-center gap-2 py-2.5 px-4 bg-[var(--gradient-primary)] border-transparent border rounded-lg text-white text-sm font-medium cursor-pointer transition-all hover:shadow-[var(--shadow-md)]"
                onClick={nextStep}
              >
                Weiter <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-2 py-2.5 px-5 bg-[var(--gradient-primary)] border-transparent border rounded-lg text-white text-sm font-medium cursor-pointer transition-all hover:shadow-[var(--shadow-md)] disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={completeSetup}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Einrichten...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" /> Claude Code starten
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
  const [appStatus, setAppStatus] = useState<any>(null);
  const [config, setConfig] = useState<any>({});
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
  const [authStatus, setAuthStatus] = useState<any>(null);
  const [authRefreshing, setAuthRefreshing] = useState(false);
  const setupPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadWorkspaces = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await api.get('/workspaces', { signal, showError: false });
        setWorkspaces(data.workspaces || []);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
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
      } catch (err: any) {
        if (err.name === 'AbortError') return;
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
    } catch (err: any) {
      console.error('Error refreshing auth:', err);
      setSaveMessage({
        type: 'error',
        text: err.data?.message || err.message || 'Token-Refresh fehlgeschlagen',
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
      } catch (err: any) {
        if (err.name === 'AbortError') return;
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
      if (setupPollRef.current) {
        clearInterval(setupPollRef.current);
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
      const interval = setInterval(() => loadAppData(controller.signal), 2000);
      return () => {
        controller.abort();
        clearInterval(interval);
      };
    }
  }, [actionLoading, loadAppData]);

  useEffect(() => {
    if (loading) {
      const timeout = setTimeout(() => setLoadingTimeout(true), 15000);
      return () => clearTimeout(timeout);
    }
    setLoadingTimeout(false);
  }, [loading]);

  const handleSetupComplete = () => {
    setShowSetupWizard(false);
    setActionLoading(true);

    if (setupPollRef.current) {
      clearInterval(setupPollRef.current);
    }

    setupPollRef.current = setInterval(async () => {
      try {
        const res = await api.get('/apps/claude-code', { showError: false });
        if (res.status === 'running' || res.app?.status === 'running') {
          clearInterval(setupPollRef.current!);
          setupPollRef.current = null;
          setActionLoading(false);
          loadAppData();
        }
      } catch {
        // Continue polling
      }
    }, 2000);

    setTimeout(() => {
      if (setupPollRef.current) {
        clearInterval(setupPollRef.current);
        setupPollRef.current = null;
        setActionLoading(false);
        setError('Setup dauert länger als erwartet. Bitte prüfe den Status manuell.');
        loadAppData();
      }
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
      } catch (configErr: any) {
        console.error('Config save error:', configErr);
        const errorMsg = configErr.data?.error || configErr.message || 'Unbekannter Fehler';
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
        } catch (restartErr: any) {
          console.error('Restart error:', restartErr);
          const restartErrorMsg = restartErr.message || 'Unbekannter Fehler';
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
    } catch (err: any) {
      console.error('Error saving config:', err);
      const errorMsg = err.message || 'Unbekannter Fehler';
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
        cls: 'bg-[var(--primary-alpha-20)] text-[var(--primary-color)] border-[var(--primary-alpha-30)]',
        text: 'Läuft',
      },
      stopped: {
        cls: 'bg-[var(--danger-alpha-20)] text-[var(--danger-color)] border-[var(--danger-alpha-30)]',
        text: 'Gestoppt',
      },
      installed: {
        cls: 'bg-[var(--primary-alpha-20)] text-[var(--primary-color)] border-[var(--primary-alpha-30)]',
        text: 'Installiert',
      },
      installing: {
        cls: 'bg-[var(--warning-alpha-20)] text-[var(--warning-color)] border-[var(--warning-alpha-30)]',
        text: 'Installiert...',
      },
      restarting: {
        cls: 'bg-[var(--warning-alpha-20)] text-[var(--warning-color)] border-[var(--warning-alpha-30)]',
        text: 'Neustart...',
      },
      error: {
        cls: 'bg-[var(--neutral-alpha-20)] text-[var(--text-muted)] border-[var(--neutral-alpha-30)]',
        text: 'Fehler',
      },
    };
    const info = statusMap[status] || {
      cls: 'bg-[var(--neutral-alpha-20)] text-[var(--text-muted)] border-[var(--neutral-alpha-30)]',
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

  // Button style constants
  const btnBase =
    'inline-flex items-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed';
  const btnPrimary = `${btnBase} bg-[var(--gradient-primary)] border-transparent border text-white hover:enabled:shadow-[var(--shadow-md)]`;
  const btnSecondary = `${btnBase} bg-transparent border border-[var(--border-color)] text-[var(--text-muted)] hover:enabled:bg-[var(--bg-card)] hover:enabled:text-[var(--text-primary)]`;
  const btnIcon = `${btnBase} p-2.5 min-w-[40px] justify-center bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:enabled:bg-[var(--bg-card-hover)] hover:enabled:border-[var(--primary-color)] hover:enabled:text-[var(--text-primary)]`;

  if (loading) {
    return (
      <div className="claude-code-page flex flex-col h-full max-w-[1600px] mx-auto bg-[var(--bg-dark)]">
        <LoadingSpinner message="Claude Code wird geladen..." />
        {loadingTimeout && (
          <div className="mt-4 text-center">
            <p className="text-[var(--warning-color)] mb-4">
              <AlertTriangle className="w-4 h-4 inline-block mr-2 align-middle" />
              Laden dauert länger als erwartet.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                className={btnPrimary}
                onClick={() => {
                  setLoading(true);
                  setLoadingTimeout(false);
                  loadAppData();
                }}
              >
                <RefreshCw className="w-4 h-4" /> Erneut versuchen
              </button>
              <button type="button" className={btnSecondary} onClick={() => navigate('/')}>
                Zurück zum Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (error && !appStatus) {
    return (
      <div className="claude-code-page flex flex-col h-full max-w-[1600px] mx-auto bg-[var(--bg-dark)]">
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
          <AlertCircle className="w-12 h-12 text-[var(--warning-color)] mb-4" />
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
            Claude Code nicht verfügbar
          </h2>
          <p className="text-sm text-[var(--text-muted)] mb-6">{error}</p>
          <div className="flex gap-3 flex-wrap justify-center">
            <button
              type="button"
              className={btnPrimary}
              onClick={() => {
                setError(null);
                setLoading(true);
                loadAppData();
              }}
            >
              <RefreshCw className="w-4 h-4" /> Erneut versuchen
            </button>
            <button type="button" className={btnSecondary} onClick={() => navigate('/')}>
              Zurück zum Dashboard
            </button>
            <button type="button" className={btnSecondary} onClick={() => navigate('/store')}>
              Zum Store
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showSetupWizard) {
    return (
      <div className="claude-code-page flex flex-col h-full max-w-[1600px] mx-auto bg-[var(--bg-dark)]">
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
        'claude-code-page flex flex-col h-full max-w-[1600px] mx-auto bg-[var(--bg-dark)]',
        isFullscreen && 'fixed inset-0 h-screen z-[var(--z-modal-backdrop)] p-0 max-w-none'
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex justify-between items-center pb-6 border-b border-[var(--border-color)] mb-4 shrink-0 max-md:flex-col max-md:gap-4 max-md:items-start',
          isFullscreen && 'py-3 px-4'
        )}
      >
        <div className="flex items-center gap-4">
          <Terminal className="text-[2rem] text-[var(--primary-color)]" />
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)] m-0 leading-tight">
              Claude Code
            </h1>
            <span className="text-sm text-[var(--text-muted)]">{getCurrentWorkspaceName()}</span>
          </div>
          {getStatusBadge(appStatus?.status)}
        </div>

        {/* Auth Status Badge */}
        {authStatus && appStatus?.status === 'running' && (
          <div className="ml-auto mr-4 max-md:mr-0 max-md:ml-0">
            {authStatus.oauth?.valid ? (
              <div
                className="auth-badge flex items-center gap-2 py-2 px-3 rounded-lg text-sm font-medium bg-[var(--primary-alpha-15)] border border-[var(--primary-alpha-30)] text-[var(--primary-color)]"
                title={`Token gültig für ${authStatus.oauth.expiresInHours}h`}
              >
                <User className="w-4 h-4" />
                <span>
                  {authStatus.oauth.account?.displayName ||
                    authStatus.oauth.account?.email ||
                    'Angemeldet'}
                </span>
                <span className="flex items-center gap-1 py-0.5 px-2 bg-[rgba(255,255,255,0.1)] rounded text-xs ml-1">
                  <Clock className="w-3 h-3" /> {authStatus.oauth.expiresInHours}h
                </span>
              </div>
            ) : (
              <div className="auth-badge flex items-center gap-2 py-2 px-3 rounded-lg text-sm font-medium bg-[var(--warning-alpha-15)] border border-[var(--warning-alpha-30)] text-[var(--warning-color)]">
                <AlertTriangle className="w-4 h-4" />
                <span>Session abgelaufen</span>
                <button
                  type="button"
                  className="flex items-center justify-center w-7 h-7 p-0 ml-2 bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.2)] rounded-md text-inherit cursor-pointer transition-all hover:enabled:bg-[rgba(255,255,255,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleAuthRefresh}
                  disabled={authRefreshing}
                  title="Token erneuern"
                >
                  {authRefreshing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <LogIn className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 items-center max-md:w-full max-md:justify-start max-md:flex-wrap">
          {appStatus?.status === 'running' && (
            <>
              <button
                type="button"
                className={btnIcon}
                onClick={restartApp}
                disabled={actionLoading}
                title="Neustarten"
              >
                <RefreshCw className={cn('w-4 h-4', actionLoading && 'animate-spin')} />
              </button>
              <button
                type="button"
                className={btnIcon}
                onClick={stopApp}
                disabled={actionLoading}
                title="Stoppen"
              >
                <Square className="w-4 h-4" />
              </button>
              <button
                type="button"
                className={btnIcon}
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Verkleinern' : 'Vollbild'}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
            </>
          )}
          <button
            type="button"
            className={cn(
              btnBase,
              'bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:enabled:bg-[var(--bg-card-hover)] hover:enabled:border-[var(--primary-color)] hover:enabled:text-[var(--text-primary)]',
              showSettings &&
                'bg-[var(--bg-card-hover)] border-[var(--primary-color)] text-[var(--primary-color)]'
            )}
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings className="w-4 h-4" /> Einstellungen
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-3 py-3 px-4 bg-[var(--danger-alpha-10)] border border-[var(--danger-alpha-30)] rounded-lg text-[var(--danger-color)] mb-4 shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            className="bg-transparent border-none text-inherit cursor-pointer p-1 flex items-center justify-center rounded hover:bg-[var(--danger-alpha-20)]"
            onClick={() => setError(null)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-6 mb-4 shrink-0 animate-[slideDown_0.2s_ease]">
          <h3 className="text-base font-semibold text-[var(--text-primary)] m-0 mb-5 pb-3 border-b border-[var(--border-subtle)]">
            Konfiguration
          </h3>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5 mb-5">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="cc-api-key"
                className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] [&>svg]:text-[var(--primary-color)]"
              >
                <KeyRound className="w-4 h-4" /> Anthropic API Key
                <span className="text-[var(--danger-color)] ml-1">*</span>
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
                className="py-3 px-4 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm transition-all focus:outline-none focus:border-[var(--primary-color)] focus:shadow-[0_0_0_3px_var(--primary-alpha-10)] placeholder:text-[var(--text-muted)]"
              />
              <span className="text-xs text-[var(--text-muted)]">
                {config.ANTHROPIC_API_KEY_set
                  ? 'API-Key ist gesetzt. Leer lassen um beizubehalten, neuen Wert eingeben zum Ändern.'
                  : 'Dein API-Key von anthropic.com'}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="cc-workspace"
                className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] [&>svg]:text-[var(--primary-color)]"
              >
                <Folder className="w-4 h-4" /> Workspace
              </label>
              <div className="flex gap-2">
                <select
                  id="cc-workspace"
                  value={config.CLAUDE_WORKSPACE || '/workspace/arasul'}
                  onChange={e => setConfig({ ...config, CLAUDE_WORKSPACE: e.target.value })}
                  className="flex-1 py-3 px-4 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm cursor-pointer transition-all focus:outline-none focus:border-[var(--primary-color)] focus:shadow-[0_0_0_3px_var(--primary-alpha-10)] [&>option]:bg-[var(--bg-card)] [&>option]:text-[var(--text-primary)]"
                >
                  {workspaces.map(ws => (
                    <option key={ws.id} value={ws.container_path}>
                      {ws.name} {ws.is_default ? '(Standard)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="py-3 px-3 bg-[var(--bg-dark)] border border-[var(--border-color)] text-[var(--text-muted)] cursor-pointer rounded-lg flex items-center justify-center transition-all hover:bg-[var(--bg-card-hover)] hover:border-[var(--primary-color)] hover:text-[var(--primary-color)]"
                  onClick={() => setShowWorkspaceManager(true)}
                  title="Workspaces verwalten"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
              <span className="text-xs text-[var(--text-muted)]">
                Arbeitsverzeichnis für Claude Code
              </span>
            </div>
          </div>

          <div className="text-xs text-[var(--text-muted)] mt-4 p-3 bg-[rgba(69,173,255,0.1)] rounded-lg">
            <strong>Hinweis:</strong> Claude Code läuft im autonomen Modus
            (--dangerously-skip-permissions). Das Terminal ist ohne Passwort zugänglich.
          </div>

          {saveMessage && (
            <div
              className={cn(
                'flex items-center gap-2 p-3 rounded-lg text-sm mb-4 mt-4',
                saveMessage.type === 'success' &&
                  'bg-[var(--primary-alpha-10)] border border-[var(--primary-alpha-30)] text-[var(--primary-color)]',
                saveMessage.type === 'error' &&
                  'bg-[var(--danger-alpha-10)] border border-[var(--danger-alpha-30)] text-[var(--danger-color)]',
                saveMessage.type === 'warning' &&
                  'bg-[var(--warning-alpha-10)] border border-[var(--warning-alpha-30)] text-[var(--warning-color)]'
              )}
            >
              {saveMessage.type === 'success' ? (
                <Check className="w-4 h-4" />
              ) : saveMessage.type === 'warning' ? (
                <AlertTriangle className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              {saveMessage.text}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-subtle)] mt-4 max-md:flex-col">
            <button
              type="button"
              className={cn(btnSecondary, 'max-md:w-full max-md:justify-center')}
              onClick={() => setShowSettings(false)}
            >
              Abbrechen
            </button>
            <button
              type="button"
              className={cn(btnPrimary, 'max-md:w-full max-md:justify-center')}
              onClick={saveConfig}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Speichern...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" /> Speichern
                </>
              )}
            </button>
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
          'flex-1 flex flex-col bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden min-h-[400px]',
          isFullscreen && 'rounded-none'
        )}
      >
        {!config.ANTHROPIC_API_KEY_set ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[var(--primary-alpha-10)] to-[var(--primary-alpha-5)] flex items-center justify-center mb-6">
              <KeyRound className="w-8 h-8 text-[var(--primary-color)]" />
            </div>
            <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
              API-Key erforderlich
            </h3>
            <p className="text-sm text-[var(--text-muted)] mb-6 max-w-[400px]">
              Bitte gib deinen Anthropic API-Key in den Einstellungen ein, um Claude Code zu nutzen.
            </p>
            <div className="flex gap-3 flex-wrap justify-center">
              <button type="button" className={btnPrimary} onClick={() => setShowSetupWizard(true)}>
                <Zap className="w-4 h-4" /> Einrichtung starten
              </button>
              <button type="button" className={btnSecondary} onClick={() => setShowSettings(true)}>
                <Settings className="w-4 h-4" /> Einstellungen öffnen
              </button>
            </div>
          </div>
        ) : appStatus?.status !== 'running' ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[var(--primary-alpha-10)] to-[var(--primary-alpha-5)] flex items-center justify-center mb-6">
              <Terminal className="w-8 h-8 text-[var(--primary-color)]" />
            </div>
            <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
              Claude Code ist nicht gestartet
            </h3>
            <p className="text-sm text-[var(--text-muted)] mb-6">
              Klicke auf Starten, um das Terminal zu öffnen.
            </p>
            <button
              type="button"
              className={btnPrimary}
              onClick={startApp}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Startet...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" /> Starten
                </>
              )}
            </button>
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
