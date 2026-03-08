import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Plus,
  Send,
  MessageCircle,
  Power,
  Trash2,
  Pencil,
  RefreshCw,
  Loader2,
  Activity,
  Settings,
  FileText,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  BookOpen,
  Cpu,
} from 'lucide-react';
import useConfirm from '../../hooks/useConfirm';
import { useToast } from '../../contexts/ToastContext';
import BotSetupWizard from './BotSetupWizard';
import BotDetailsModal from './BotDetailsModal';
import { useApi } from '../../hooks/useApi';
import { cn } from '@/lib/utils';

/* ============================================================================
   Types
   ============================================================================ */

interface TelegramAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Bot {
  id: string;
  name: string;
  username?: string;
  isActive: boolean;
  llmProvider?: string;
  llmModel?: string;
  chatCount?: number;
  messageCount?: number;
  ragEnabled?: boolean;
  ragSpaceIds?: string[];
}

interface AppStatus {
  isEnabled?: boolean;
}

interface SystemConfig {
  bot_token: string;
  chat_id: string;
  enabled: boolean;
}

interface SystemMessage {
  type: 'success' | 'error';
  text: string;
}

interface AuditLog {
  id: string;
  created_at: string;
  bot_name?: string;
  user_name?: string;
  chat_id?: string;
  command?: string;
  message_type?: string;
  success: boolean;
}

interface SidebarSection {
  id: string;
  label: string;
  icon: React.ReactNode;
}

/* ============================================================================
   TELEGRAM APP MODAL - Fullscreen with Sidebar Navigation
   Sections: Bots, Status, System, Logs
   ============================================================================ */
function TelegramAppModal({ isOpen, onClose }: TelegramAppModalProps) {
  const { confirm, ConfirmDialog } = useConfirm();
  const toast = useToast();
  const api = useApi();
  const isMountedRef = useRef(true);

  // Navigation
  const [activeSection, setActiveSection] = useState('bots');

  // Bots state
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [selectedBot, setSelectedBot] = useState<Bot | null>(null);
  const [appStatus, setAppStatus] = useState<AppStatus | null>(null);
  const [togglingBot, setTogglingBot] = useState<string | null>(null);
  const [deletingBot, setDeletingBot] = useState<string | null>(null);

  // System section state (migrated from TelegramSettings)
  const [systemConfig, setSystemConfig] = useState<SystemConfig>({
    bot_token: '',
    chat_id: '',
    enabled: false,
  });
  const [hasToken, setHasToken] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [systemLoading, setSystemLoading] = useState(true);
  const [systemSaving, setSystemSaving] = useState(false);
  const [systemTesting, setSystemTesting] = useState(false);
  const [systemMessage, setSystemMessage] = useState<SystemMessage | null>(null);
  const [originalSystemConfig, setOriginalSystemConfig] = useState<SystemConfig | null>(null);

  // Logs state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch bots & status
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [botsData, statusData] = await Promise.all([
        api.get('/telegram-bots', { showError: false }),
        api.get('/telegram-app/status', { showError: false }),
      ]);
      if (isMountedRef.current) {
        setBots(botsData.bots || []);
        setAppStatus(statusData);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError('Fehler beim Laden der Telegram-Daten');
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [api]);

  // Fetch system config
  const fetchSystemConfig = useCallback(
    async (signal: AbortSignal) => {
      try {
        const data = await api.get('/telegram/config', { showError: false, signal });
        if (isMountedRef.current) {
          setSystemConfig({
            bot_token: '',
            chat_id: data.chat_id || '',
            enabled: data.enabled || false,
          });
          setHasToken(data.configured || false);
          setOriginalSystemConfig({
            bot_token: '',
            chat_id: data.chat_id || '',
            enabled: data.enabled || false,
          });
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        if (isMountedRef.current)
          setSystemMessage({ type: 'error', text: 'Fehler beim Laden der Konfiguration' });
      } finally {
        if (isMountedRef.current) setSystemLoading(false);
      }
    },
    [api]
  );

  // Fetch audit logs
  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const data = await api.get('/telegram/audit-logs?limit=50', { showError: false });
      if (isMountedRef.current) setAuditLogs(data.logs || []);
    } catch {
      // silently fail
    } finally {
      if (isMountedRef.current) setLogsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    fetchData();
    fetchSystemConfig(controller.signal);
    return () => controller.abort();
  }, [isOpen, fetchData, fetchSystemConfig]);

  // Load logs on tab switch
  useEffect(() => {
    if (activeSection === 'logs' && auditLogs.length === 0) {
      fetchLogs();
    }
  }, [activeSection, auditLogs.length, fetchLogs]);

  // Bot actions
  const handleBotCreated = (newBot: Bot) => {
    setBots(prev => [...prev, newBot]);
    setShowWizard(false);
    toast.success('Bot erfolgreich erstellt');
  };

  const handleToggleBot = async (botId: string, currentActive: boolean) => {
    setTogglingBot(botId);
    try {
      const endpoint = currentActive ? 'deactivate' : 'activate';
      await api.post(`/telegram-bots/${botId}/${endpoint}`, undefined, { showError: false });
      setBots(prev =>
        prev.map(bot => (bot.id === botId ? { ...bot, isActive: !currentActive } : bot))
      );
      toast.success(currentActive ? 'Bot deaktiviert' : 'Bot aktiviert');
    } catch {
      toast.error('Fehler beim Umschalten des Bots');
    } finally {
      setTogglingBot(null);
    }
  };

  const handleDeleteBot = async (botId: string) => {
    if (
      !(await confirm({
        message: 'Bot wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
      }))
    )
      return;
    setDeletingBot(botId);
    try {
      await api.del(`/telegram-bots/${botId}`, { showError: false });
      setBots(prev => prev.filter(bot => bot.id !== botId));
      toast.success('Bot gelöscht');
    } catch {
      toast.error('Fehler beim Löschen des Bots');
    } finally {
      setDeletingBot(null);
    }
  };

  const handleBotUpdated = (updatedBot: Bot) => {
    setBots(prev => prev.map(b => (b.id === updatedBot.id ? updatedBot : b)));
    setSelectedBot(null);
  };

  // System section handlers
  const handleSystemSave = async () => {
    setSystemSaving(true);
    setSystemMessage(null);
    try {
      const payload: Record<string, any> = {
        chat_id: systemConfig.chat_id,
        enabled: systemConfig.enabled,
      };
      if (systemConfig.bot_token) payload.bot_token = systemConfig.bot_token;
      const data = await api.post('/telegram/config', payload, { showError: false });
      if (!isMountedRef.current) return;
      setHasToken(data.has_token || data.success || false);
      setSystemConfig(prev => ({ ...prev, bot_token: '' }));
      setOriginalSystemConfig({
        bot_token: '',
        chat_id: systemConfig.chat_id,
        enabled: systemConfig.enabled,
      });
      setSystemMessage({ type: 'success', text: 'Konfiguration gespeichert' });
    } catch (err: any) {
      if (!isMountedRef.current) return;
      setSystemMessage({ type: 'error', text: err.data?.error || 'Netzwerkfehler beim Speichern' });
    } finally {
      if (isMountedRef.current) setSystemSaving(false);
    }
  };

  const handleSystemToggle = async () => {
    setSystemSaving(true);
    setSystemMessage(null);
    const newEnabled = !systemConfig.enabled;
    try {
      await api.post('/telegram/config', { enabled: newEnabled }, { showError: false });
      if (!isMountedRef.current) return;
      setSystemConfig(prev => ({ ...prev, enabled: newEnabled }));
      setOriginalSystemConfig(prev => (prev ? { ...prev, enabled: newEnabled } : prev));
      setSystemMessage({
        type: 'success',
        text: newEnabled
          ? 'System-Benachrichtigungen aktiviert'
          : 'System-Benachrichtigungen deaktiviert',
      });
    } catch (err: any) {
      if (!isMountedRef.current) return;
      setSystemMessage({ type: 'error', text: err.data?.error || 'Netzwerkfehler' });
    } finally {
      if (isMountedRef.current) setSystemSaving(false);
    }
  };

  const handleSystemTest = async () => {
    setSystemTesting(true);
    setSystemMessage(null);
    try {
      await api.post('/telegram/test', undefined, { showError: false });
      if (!isMountedRef.current) return;
      setSystemMessage({ type: 'success', text: 'Test-Nachricht erfolgreich gesendet!' });
    } catch (err: any) {
      if (!isMountedRef.current) return;
      setSystemMessage({ type: 'error', text: err.data?.error || 'Netzwerkfehler beim Test' });
    } finally {
      if (isMountedRef.current) setSystemTesting(false);
    }
  };

  const systemHasChanges =
    systemConfig.bot_token !== '' || systemConfig.chat_id !== originalSystemConfig?.chat_id;

  if (!isOpen) return null;

  const sections: SidebarSection[] = [
    { id: 'bots', label: 'Bots', icon: <MessageCircle size={16} /> },
    { id: 'status', label: 'Status', icon: <Activity size={16} /> },
    { id: 'system', label: 'System', icon: <Settings size={16} /> },
    { id: 'logs', label: 'Logs', icon: <FileText size={16} /> },
  ];

  const activeBots = bots.filter(b => b.isActive).length;

  return (
    <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200">
      <div className="w-[92vw] h-[88vh] max-w-[1200px] bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-[0.96] duration-300 max-md:w-screen max-md:h-screen max-md:rounded-none">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-[var(--border-color)] shrink-0">
          <div className="flex items-center gap-3">
            <Send className="text-[var(--primary-color)] text-xl" size={20} />
            <h2 className="m-0 text-xl text-[var(--text-primary)]">Telegram Bot</h2>
            {activeBots > 0 && (
              <span className="bg-[var(--success-color)] text-white text-[0.7rem] font-semibold px-2 py-0.5 rounded-full">
                {activeBots} aktiv
              </span>
            )}
          </div>
          <button
            type="button"
            className="flex items-center justify-center w-9 h-9 border-none rounded-lg bg-transparent text-[var(--text-muted)] cursor-pointer transition-all text-lg hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--primary-color)] focus-visible:outline-offset-2"
            onClick={onClose}
            aria-label="Schließen"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden max-md:flex-col">
          {/* Sidebar */}
          <nav className="w-[180px] min-w-[180px] border-r border-[var(--border-color)] py-4 px-2 flex flex-col gap-1 bg-[var(--bg-card)] max-md:w-full max-md:min-w-full max-md:flex-row max-md:overflow-x-auto max-md:border-r-0 max-md:border-b max-md:border-[var(--border-color)] max-md:py-2 max-md:px-2 max-md:gap-1">
            {sections.map(section => (
              <button
                key={section.id}
                type="button"
                className={cn(
                  'flex items-center gap-2.5 py-2.5 px-3.5 border-none rounded-lg bg-transparent text-[var(--text-muted)] text-sm cursor-pointer transition-all text-left w-full hover:bg-[rgba(69,173,255,0.08)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--primary-color)] focus-visible:outline-offset-2 max-md:whitespace-nowrap max-md:py-2 max-md:px-3 max-md:text-xs',
                  activeSection === section.id &&
                    'bg-[rgba(69,173,255,0.15)] text-[var(--primary-color)] font-medium'
                )}
                onClick={() => setActiveSection(section.id)}
              >
                {section.icon}
                <span>{section.label}</span>
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 max-md:p-4">
            {activeSection === 'bots' && (
              <BotsSection
                bots={bots}
                loading={loading}
                error={error}
                togglingBot={togglingBot}
                deletingBot={deletingBot}
                onRefresh={fetchData}
                onCreateBot={() => setShowWizard(true)}
                onEditBot={setSelectedBot}
                onToggleBot={handleToggleBot}
                onDeleteBot={handleDeleteBot}
              />
            )}
            {activeSection === 'status' && (
              <StatusSection appStatus={appStatus} bots={bots} loading={loading} />
            )}
            {activeSection === 'system' && (
              <SystemSection
                config={systemConfig}
                setConfig={setSystemConfig}
                hasToken={hasToken}
                showToken={showToken}
                setShowToken={setShowToken}
                loading={systemLoading}
                saving={systemSaving}
                testing={systemTesting}
                message={systemMessage}
                hasChanges={systemHasChanges}
                onSave={handleSystemSave}
                onToggle={handleSystemToggle}
                onTest={handleSystemTest}
              />
            )}
            {activeSection === 'logs' && (
              <LogsSection logs={auditLogs} loading={logsLoading} onRefresh={fetchLogs} />
            )}
          </div>
        </div>

        {/* Sub-modals */}
        {showWizard && (
          <div
            className="fixed inset-0 z-[1001] bg-black/60 flex items-center justify-center animate-in fade-in duration-150"
            onClick={() => setShowWizard(false)}
          >
            <div
              className="w-[90vw] max-w-[700px] max-h-[85vh] bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-[14px] flex flex-col overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.4)]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center px-6 py-4 border-b border-[var(--border-color)]">
                <h3 className="m-0 text-lg text-[var(--text-primary)]">Neuen Bot erstellen</h3>
                <button
                  type="button"
                  className="flex items-center justify-center w-9 h-9 border-none rounded-lg bg-transparent text-[var(--text-muted)] cursor-pointer transition-all text-lg hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--primary-color)] focus-visible:outline-offset-2"
                  onClick={() => setShowWizard(false)}
                  aria-label="Schließen"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <BotSetupWizard
                  onComplete={handleBotCreated}
                  onCancel={() => setShowWizard(false)}
                />
              </div>
            </div>
          </div>
        )}

        {selectedBot && (
          <BotDetailsModal
            bot={selectedBot}
            onClose={() => setSelectedBot(null)}
            onUpdate={handleBotUpdated}
          />
        )}
        {ConfirmDialog}
      </div>
    </div>
  );
}

/* ============================================================================
   BOTS SECTION
   ============================================================================ */
interface BotsSectionProps {
  bots: Bot[];
  loading: boolean;
  error: string | null;
  togglingBot: string | null;
  deletingBot: string | null;
  onRefresh: () => void;
  onCreateBot: () => void;
  onEditBot: (bot: Bot) => void;
  onToggleBot: (botId: string, currentActive: boolean) => void;
  onDeleteBot: (botId: string) => void;
}

function BotsSection({
  bots,
  loading,
  error,
  togglingBot,
  deletingBot,
  onRefresh,
  onCreateBot,
  onEditBot,
  onToggleBot,
  onDeleteBot,
}: BotsSectionProps) {
  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h3 className="m-0 text-[var(--text-primary)] text-lg">
          {bots.length} Bot{bots.length !== 1 ? 's' : ''}
        </h3>
        <div className="flex gap-2 items-center">
          <button
            type="button"
            className="flex items-center justify-center w-9 h-9 border-none rounded-lg bg-[var(--bg-dark)] text-[var(--text-muted)] cursor-pointer transition-all hover:bg-[var(--primary-color)] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[var(--primary-color)] focus-visible:outline-offset-2"
            onClick={onRefresh}
            disabled={loading}
            title="Aktualisieren"
            aria-label="Aktualisieren"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 py-2 px-4 bg-[var(--primary-color)] text-white border-none rounded-lg text-sm font-medium cursor-pointer transition-all hover:opacity-90 hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-[var(--primary-color)] focus-visible:outline-offset-2"
            onClick={onCreateBot}
          >
            <Plus size={16} /> Neuer Bot
          </button>
        </div>
      </div>

      {error && (
        <div className="py-3 px-4 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] rounded-lg text-[var(--danger-color)] text-sm mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4 max-md:grid-cols-1">
          {[1, 2].map(i => (
            <div
              key={i}
              className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 pointer-events-none"
            >
              <div className="flex justify-between items-start mb-3.5">
                <div
                  className="rounded bg-[var(--border-color)] animate-pulse"
                  style={{ width: 120, height: 16 }}
                />
                <div className="w-[52px] h-[22px] rounded-full bg-[var(--border-color)] animate-pulse" />
              </div>
              <div
                className="rounded bg-[var(--border-color)] animate-pulse"
                style={{ width: '80%', height: 12 }}
              />
              <div className="flex flex-wrap gap-2.5 py-3 border-t border-b border-[var(--border-color)] mb-3.5 mt-3.5">
                <div
                  className="rounded bg-[var(--border-color)] animate-pulse"
                  style={{ width: 80, height: 12 }}
                />
                <div
                  className="rounded bg-[var(--border-color)] animate-pulse"
                  style={{ width: 60, height: 12 }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : bots.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center text-[var(--text-muted)] bg-[var(--bg-card)] border border-dashed border-[var(--border-color)] rounded-xl">
          <div className="flex items-center justify-center w-16 h-16 bg-[rgba(69,173,255,0.1)] rounded-full text-[var(--primary-color)] mb-4">
            <Send size={32} />
          </div>
          <h4 className="text-[var(--text-primary)] m-0 mb-2 text-lg">Noch keine Bots</h4>
          <p className="m-0 mb-5 max-w-[360px] leading-relaxed text-sm">
            Verbinde deinen ersten Telegram Bot mit einer KI und starte Gespräche direkt aus
            Telegram.
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-2 py-2 px-4 bg-[var(--primary-color)] text-white border-none rounded-lg text-sm font-medium cursor-pointer transition-all hover:opacity-90 hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-[var(--primary-color)] focus-visible:outline-offset-2"
            onClick={onCreateBot}
          >
            <Plus size={16} /> Bot erstellen
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4 max-md:grid-cols-1">
          {bots.map(bot => (
            <BotCard
              key={bot.id}
              bot={bot}
              toggling={togglingBot === bot.id}
              deleting={deletingBot === bot.id}
              onEdit={() => onEditBot(bot)}
              onToggle={() => onToggleBot(bot.id, bot.isActive)}
              onDelete={() => onDeleteBot(bot.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   BOT CARD
   ============================================================================ */
interface BotCardProps {
  bot: Bot;
  toggling: boolean;
  deleting: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

function BotCard({ bot, toggling, deleting, onEdit, onToggle, onDelete }: BotCardProps) {
  const isActive = bot.isActive;
  const model = bot.llmModel || '';
  const provider = bot.llmProvider || 'ollama';
  const username = bot.username;
  const chatCount = bot.chatCount || 0;
  const messageCount = bot.messageCount || 0;
  const ragEnabled = bot.ragEnabled || false;
  const ragSpaceIds = bot.ragSpaceIds;
  const isMaster = ragEnabled && !ragSpaceIds;

  return (
    <div
      className={cn(
        'bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 transition-all hover:border-[var(--primary-color)] hover:shadow-[0_4px_16px_rgba(69,173,255,0.1)] hover:-translate-y-0.5',
        isActive && 'border-[rgba(34,197,94,0.3)]'
      )}
    >
      <div className="flex justify-between items-start mb-3.5">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="m-0 mb-1 text-[var(--text-primary)] text-base">{bot.name}</h4>
            {isMaster && (
              <span className="bg-gradient-to-br from-[var(--primary-color)] to-[#6366f1] text-white text-[0.65rem] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide">
                Master
              </span>
            )}
          </div>
          <span className="text-sm text-[var(--text-muted)]">@{username || 'nicht verbunden'}</span>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium',
            isActive
              ? 'bg-[rgba(34,197,94,0.12)] text-[var(--success-color)]'
              : 'bg-[rgba(148,163,184,0.1)] text-[var(--text-muted)]'
          )}
        >
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full bg-current shrink-0',
              isActive && 'shadow-[0_0_6px_var(--success-color)] animate-pulse'
            )}
          />
          {isActive ? 'Aktiv' : 'Inaktiv'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2.5 py-3 border-t border-b border-[var(--border-color)] mb-3.5 max-[480px]:gap-1.5">
        {ragEnabled && (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] [&_svg]:text-sm [&_svg]:opacity-70">
            <BookOpen size={14} /> {ragSpaceIds ? `${ragSpaceIds.length} Spaces` : 'Alle Spaces'}
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] [&_svg]:text-sm [&_svg]:opacity-70">
          <MessageCircle size={14} /> {chatCount} Chats
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] [&_svg]:text-sm [&_svg]:opacity-70">
          <Cpu size={14} /> {model ? model.split(':')[0] : provider}
        </span>
        {messageCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] [&_svg]:text-sm [&_svg]:opacity-70">
            <Send size={14} /> {messageCount} Nachr.
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="flex items-center gap-1 flex-1 justify-center text-xs py-2 border-none rounded-lg bg-[var(--bg-dark)] text-[var(--text-muted)] cursor-pointer transition-all hover:bg-[var(--primary-color)] hover:text-white focus-visible:outline-2 focus-visible:outline-[var(--primary-color)] focus-visible:outline-offset-2"
          onClick={onEdit}
          title="Bearbeiten"
        >
          <Pencil size={14} /> <span>Bearbeiten</span>
        </button>
        <button
          type="button"
          className={cn(
            'flex items-center justify-center w-9 h-9 border-none rounded-lg bg-[var(--bg-dark)] cursor-pointer transition-all hover:bg-[var(--primary-color)] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[var(--primary-color)] focus-visible:outline-offset-2',
            isActive ? 'text-[var(--warning-color)]' : 'text-[var(--success-color)]'
          )}
          onClick={onToggle}
          disabled={toggling}
          title={isActive ? 'Deaktivieren' : 'Aktivieren'}
          aria-label={isActive ? 'Deaktivieren' : 'Aktivieren'}
        >
          <Power size={16} className={toggling ? 'animate-spin' : ''} />
        </button>
        <button
          type="button"
          className="flex items-center justify-center w-9 h-9 border-none rounded-lg bg-[var(--bg-dark)] text-[var(--text-muted)] cursor-pointer transition-all hover:bg-[var(--danger-color)] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[var(--primary-color)] focus-visible:outline-offset-2"
          onClick={onDelete}
          disabled={deleting}
          title="Löschen"
          aria-label="Löschen"
        >
          {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
   STATUS SECTION
   ============================================================================ */
interface StatusSectionProps {
  appStatus: AppStatus | null;
  bots: Bot[];
  loading: boolean;
}

function StatusSection({ appStatus, bots, loading }: StatusSectionProps) {
  const totalChats = bots.reduce((sum, b) => sum + (b.chatCount || 0), 0);
  const totalMessages = bots.reduce((sum, b) => sum + (b.messageCount || 0), 0);
  const activeBots = bots.filter(b => b.isActive).length;
  const ragBots = bots.filter(b => b.ragEnabled).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 p-12 text-[var(--text-muted)] text-sm">
        <RefreshCw size={16} className="animate-spin" /> Lade Status...
      </div>
    );
  }

  return (
    <div>
      <h3 className="m-0 mb-4 text-[var(--text-primary)] text-lg">Übersicht</h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 max-md:grid-cols-2 max-[480px]:grid-cols-2">
        <div className="flex flex-col gap-1.5 p-4 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl transition-colors hover:border-[rgba(69,173,255,0.3)]">
          <span className="text-[0.725rem] text-[var(--text-muted)] uppercase tracking-wider">
            Bots gesamt
          </span>
          <span className="text-2xl font-semibold text-[var(--text-primary)]">{bots.length}</span>
        </div>
        <div className="flex flex-col gap-1.5 p-4 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl transition-colors hover:border-[rgba(69,173,255,0.3)]">
          <span className="text-[0.725rem] text-[var(--text-muted)] uppercase tracking-wider">
            Aktive Bots
          </span>
          <span className="text-2xl font-semibold text-[var(--primary-color)]">{activeBots}</span>
        </div>
        <div className="flex flex-col gap-1.5 p-4 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl transition-colors hover:border-[rgba(69,173,255,0.3)]">
          <span className="text-[0.725rem] text-[var(--text-muted)] uppercase tracking-wider">
            Verbundene Chats
          </span>
          <span className="text-2xl font-semibold text-[var(--text-primary)]">{totalChats}</span>
        </div>
        <div className="flex flex-col gap-1.5 p-4 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl transition-colors hover:border-[rgba(69,173,255,0.3)]">
          <span className="text-[0.725rem] text-[var(--text-muted)] uppercase tracking-wider">
            Nachrichten
          </span>
          <span className="text-2xl font-semibold text-[var(--text-primary)]">{totalMessages}</span>
        </div>
        <div className="flex flex-col gap-1.5 p-4 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl transition-colors hover:border-[rgba(69,173,255,0.3)]">
          <span className="text-[0.725rem] text-[var(--text-muted)] uppercase tracking-wider">
            RAG-Bots
          </span>
          <span className="text-2xl font-semibold text-[var(--text-primary)]">{ragBots}</span>
        </div>
        <div className="flex flex-col gap-1.5 p-4 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl transition-colors hover:border-[rgba(69,173,255,0.3)]">
          <span className="text-[0.725rem] text-[var(--text-muted)] uppercase tracking-wider">
            System-Alerts
          </span>
          <span
            className={cn(
              'text-2xl font-semibold text-[var(--text-primary)]',
              appStatus?.isEnabled && 'text-[var(--primary-color)]'
            )}
          >
            {appStatus?.isEnabled ? 'Aktiv' : 'Inaktiv'}
          </span>
        </div>
      </div>

      {/* Bot Details Table */}
      {bots.length > 0 && (
        <>
          <h3 className="m-0 mb-4 text-[var(--text-primary)] text-lg mt-8">Bot-Details</h3>
          <div className="overflow-x-auto border border-[var(--border-color)] rounded-xl">
            <table className="w-full border-collapse max-[480px]:text-xs">
              <thead>
                <tr>
                  <th className="py-3 px-4 bg-[var(--bg-card)] text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wider text-left border-b border-[var(--border-color)]">
                    Bot
                  </th>
                  <th className="py-3 px-4 bg-[var(--bg-card)] text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wider text-left border-b border-[var(--border-color)]">
                    Status
                  </th>
                  <th className="py-3 px-4 bg-[var(--bg-card)] text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wider text-left border-b border-[var(--border-color)]">
                    Modell
                  </th>
                  <th className="py-3 px-4 bg-[var(--bg-card)] text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wider text-left border-b border-[var(--border-color)]">
                    Chats
                  </th>
                  <th className="py-3 px-4 bg-[var(--bg-card)] text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wider text-left border-b border-[var(--border-color)]">
                    RAG
                  </th>
                </tr>
              </thead>
              <tbody>
                {bots.map(bot => (
                  <tr key={bot.id} className="hover:bg-[rgba(69,173,255,0.04)]">
                    <td className="py-3 px-4 text-sm text-[var(--text-primary)] border-b border-[var(--border-color)] last:[&:is(tr:last-child_td)]:border-b-0">
                      <strong>{bot.name}</strong>
                      <br />
                      <span className="text-[var(--text-muted)] text-sm">
                        @{bot.username || '\u2014'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-[var(--text-primary)] border-b border-[var(--border-color)]">
                      <span
                        className={cn(
                          'text-xs font-medium px-2 py-0.5 rounded-full',
                          bot.isActive
                            ? 'bg-[rgba(34,197,94,0.12)] text-[var(--success-color)]'
                            : 'bg-[rgba(148,163,184,0.1)] text-[var(--text-muted)]'
                        )}
                      >
                        {bot.isActive ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-[var(--text-primary)] border-b border-[var(--border-color)]">
                      {bot.llmModel || '\u2014'}
                    </td>
                    <td className="py-3 px-4 text-sm text-[var(--text-primary)] border-b border-[var(--border-color)]">
                      {bot.chatCount || 0}
                    </td>
                    <td className="py-3 px-4 text-sm text-[var(--text-primary)] border-b border-[var(--border-color)]">
                      {bot.ragEnabled ? 'Ja' : 'Nein'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================================
   SYSTEM SECTION (migrated from TelegramSettings)
   ============================================================================ */
interface SystemSectionProps {
  config: SystemConfig;
  setConfig: React.Dispatch<React.SetStateAction<SystemConfig>>;
  hasToken: boolean;
  showToken: boolean;
  setShowToken: (show: boolean) => void;
  loading: boolean;
  saving: boolean;
  testing: boolean;
  message: SystemMessage | null;
  hasChanges: boolean;
  onSave: () => void;
  onToggle: () => void;
  onTest: () => void;
}

function SystemSection({
  config,
  setConfig,
  hasToken,
  showToken,
  setShowToken,
  loading,
  saving,
  testing,
  message,
  hasChanges,
  onSave,
  onToggle,
  onTest,
}: SystemSectionProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 p-12 text-[var(--text-muted)] text-sm">
        <RefreshCw size={16} className="animate-spin" /> Lade Konfiguration...
      </div>
    );
  }

  return (
    <div>
      <h3 className="m-0 mb-4 text-[var(--text-primary)] text-lg">System-Benachrichtigungen</h3>
      <p className="text-[var(--text-muted)] text-sm -mt-2 mb-6 leading-relaxed">
        Konfiguriere einen Bot für automatische System-Alerts (CPU, RAM, Disk, Temperatur).
      </p>

      {/* Status Toggle */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 mb-4">
        <div className="flex justify-between items-center">
          <div>
            <strong className="text-[var(--text-primary)] text-sm">System-Alerts</strong>
            <p className="text-[var(--text-muted)] text-sm mt-1 mb-0">
              Automatische Benachrichtigungen bei System-Warnungen
            </p>
          </div>
          <button
            type="button"
            className={cn(
              'relative w-12 h-[26px] bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-full cursor-pointer transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[var(--primary-color)] focus-visible:outline-offset-2',
              config.enabled && 'bg-[var(--success-color)] border-[var(--success-color)]'
            )}
            onClick={onToggle}
            disabled={saving || (!hasToken && !config.enabled)}
            title={!hasToken ? 'Zuerst Bot-Token eingeben' : ''}
            role="switch"
            aria-checked={config.enabled}
            aria-label="System-Alerts ein/ausschalten"
          >
            <span
              className={cn(
                'absolute top-[3px] left-[3px] w-[18px] h-[18px] bg-white rounded-full transition-transform',
                config.enabled && 'translate-x-[22px]'
              )}
            />
          </button>
        </div>
      </div>

      {/* Configuration */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 mb-4">
        <h4 className="m-0 mb-1 text-[var(--text-primary)] text-sm">Bot Konfiguration</h4>
        <p className="text-[var(--text-muted)] text-sm mb-4">
          Bot-Token von @BotFather und Chat-ID eingeben
        </p>

        {message && (
          <div
            className={cn(
              'flex items-center gap-2 py-2.5 px-3.5 rounded-lg text-sm mb-4',
              message.type === 'success'
                ? 'bg-[rgba(34,197,94,0.1)] text-[var(--success-color)] border border-[rgba(34,197,94,0.2)]'
                : 'bg-[rgba(239,68,68,0.1)] text-[var(--danger-color)] border border-[rgba(239,68,68,0.2)]'
            )}
          >
            {message.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
            <span>{message.text}</span>
          </div>
        )}

        <div className="mb-4">
          <label
            htmlFor="sys-bot-token"
            className="block mb-1.5 text-[var(--text-primary)] text-sm font-medium"
          >
            Bot Token
          </label>
          <div className="relative">
            <input
              id="sys-bot-token"
              type={showToken ? 'text' : 'password'}
              value={config.bot_token}
              onChange={e => setConfig(prev => ({ ...prev, bot_token: e.target.value }))}
              placeholder={
                hasToken ? '********** (Token gespeichert)' : 'Token von @BotFather eingeben'
              }
              autoComplete="off"
              className="w-full py-2.5 px-3.5 pr-10 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm transition-colors focus:outline-none focus:border-[var(--primary-color)] focus:ring-2 focus:ring-[rgba(69,173,255,0.2)]"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-1"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <small className="block mt-1.5 text-[var(--text-muted)] text-xs">
            Erstelle einen Bot bei <strong>@BotFather</strong> auf Telegram
          </small>
        </div>

        <div className="mb-4">
          <label
            htmlFor="sys-chat-id"
            className="block mb-1.5 text-[var(--text-primary)] text-sm font-medium"
          >
            Chat ID
          </label>
          <input
            id="sys-chat-id"
            type="text"
            value={config.chat_id}
            onChange={e => setConfig(prev => ({ ...prev, chat_id: e.target.value }))}
            placeholder="z.B. 123456789"
            className="w-full py-2.5 px-3.5 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm transition-colors focus:outline-none focus:border-[var(--primary-color)] focus:ring-2 focus:ring-[rgba(69,173,255,0.2)]"
          />
          <small className="block mt-1.5 text-[var(--text-muted)] text-xs">
            Nutze <strong>@userinfobot</strong> um deine Chat-ID zu erfahren
          </small>
        </div>

        <div className="flex gap-3 mt-5 max-md:flex-col">
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-2 py-2 px-4 bg-[var(--primary-color)] text-white border-none rounded-lg text-sm font-medium cursor-pointer transition-all hover:opacity-90 hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 focus-visible:outline-2 focus-visible:outline-[var(--primary-color)] focus-visible:outline-offset-2',
              hasChanges && 'shadow-[0_0_12px_rgba(69,173,255,0.3)]'
            )}
            onClick={onSave}
            disabled={saving || !hasChanges}
          >
            {saving ? (
              'Speichern...'
            ) : (
              <>
                <Check size={16} /> Speichern
              </>
            )}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 py-2 px-4 bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-lg text-sm cursor-pointer transition-all hover:bg-[var(--bg-dark)] hover:border-[var(--primary-color)] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[var(--primary-color)] focus-visible:outline-offset-2"
            onClick={onTest}
            disabled={testing || !hasToken || !config.chat_id}
          >
            {testing ? (
              <>
                <RefreshCw size={16} className="animate-spin" /> Senden...
              </>
            ) : (
              <>
                <Send size={16} /> Test senden
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   LOGS SECTION
   ============================================================================ */
interface LogsSectionProps {
  logs: AuditLog[];
  loading: boolean;
  onRefresh: () => void;
}

function LogsSection({ logs, loading, onRefresh }: LogsSectionProps) {
  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h3 className="m-0 text-[var(--text-primary)] text-lg">Aktivitäts-Log</h3>
        <button
          type="button"
          className="flex items-center justify-center w-9 h-9 border-none rounded-lg bg-[var(--bg-dark)] text-[var(--text-muted)] cursor-pointer transition-all hover:bg-[var(--primary-color)] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[var(--primary-color)] focus-visible:outline-offset-2"
          onClick={onRefresh}
          disabled={loading}
          title="Aktualisieren"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 p-12 text-[var(--text-muted)] text-sm">
          <RefreshCw size={16} className="animate-spin" /> Lade Logs...
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 text-center text-[var(--text-muted)] bg-[var(--bg-card)] border border-dashed border-[var(--border-color)] rounded-xl">
          <FileText size={24} />
          <p>Noch keine Aktivitäten</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-[var(--border-color)] rounded-xl">
          <table className="w-full border-collapse max-[480px]:text-xs">
            <thead>
              <tr>
                <th className="py-3 px-4 bg-[var(--bg-card)] text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wider text-left border-b border-[var(--border-color)]">
                  Zeitpunkt
                </th>
                <th className="py-3 px-4 bg-[var(--bg-card)] text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wider text-left border-b border-[var(--border-color)]">
                  Bot
                </th>
                <th className="py-3 px-4 bg-[var(--bg-card)] text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wider text-left border-b border-[var(--border-color)]">
                  Benutzer
                </th>
                <th className="py-3 px-4 bg-[var(--bg-card)] text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wider text-left border-b border-[var(--border-color)]">
                  Befehl
                </th>
                <th className="py-3 px-4 bg-[var(--bg-card)] text-[var(--text-muted)] text-xs font-semibold uppercase tracking-wider text-left border-b border-[var(--border-color)]">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-[rgba(69,173,255,0.04)]">
                  <td className="py-3 px-4 text-sm text-[var(--text-muted)] text-sm border-b border-[var(--border-color)]">
                    {new Date(log.created_at).toLocaleString('de-DE')}
                  </td>
                  <td className="py-3 px-4 text-sm text-[var(--text-primary)] border-b border-[var(--border-color)]">
                    {log.bot_name || '\u2014'}
                  </td>
                  <td className="py-3 px-4 text-sm text-[var(--text-primary)] border-b border-[var(--border-color)]">
                    {log.user_name || log.chat_id || '\u2014'}
                  </td>
                  <td className="py-3 px-4 text-sm text-[var(--text-primary)] border-b border-[var(--border-color)]">
                    <code>{log.command || log.message_type || '\u2014'}</code>
                  </td>
                  <td className="py-3 px-4 text-sm text-[var(--text-primary)] border-b border-[var(--border-color)]">
                    <span
                      className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        log.success
                          ? 'bg-[rgba(34,197,94,0.12)] text-[var(--success-color)]'
                          : 'bg-[rgba(239,68,68,0.12)] text-[var(--danger-color)]'
                      )}
                    >
                      {log.success ? 'OK' : 'Fehler'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default TelegramAppModal;
