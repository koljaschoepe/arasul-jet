import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Send, MessageCircle, Activity, Settings, FileText } from 'lucide-react';
import useConfirm from '../../hooks/useConfirm';
import { useToast } from '../../contexts/ToastContext';
import BotSetupWizard from './BotSetupWizard';
import BotDetailsModal from './BotDetailsModal';
import { useApi } from '../../hooks/useApi';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/shadcn/tabs';
import { ScrollArea } from '@/components/ui/shadcn/scroll-area';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import BotsSection from './sections/BotsSection';
import StatusSection from './sections/StatusSection';
import SystemSection from './sections/SystemSection';
import LogsSection from './sections/LogsSection';
import type { Bot, AppStatus, SystemConfig, SystemMessage, AuditLog } from './sections/types';

export default function TelegramBotPage() {
  const { confirm, ConfirmDialog } = useConfirm();
  const toast = useToast();
  const api = useApi();
  const isMountedRef = useRef(true);

  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [selectedBot, setSelectedBot] = useState<Bot | null>(null);
  const [appStatus, setAppStatus] = useState<AppStatus | null>(null);
  const [togglingBot, setTogglingBot] = useState<string | null>(null);
  const [deletingBot, setDeletingBot] = useState<string | null>(null);

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

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (isMountedRef.current)
          setSystemMessage({ type: 'error', text: 'Fehler beim Laden der Konfiguration' });
      } finally {
        if (isMountedRef.current) setSystemLoading(false);
      }
    },
    [api]
  );

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
    const controller = new AbortController();
    fetchData();
    fetchSystemConfig(controller.signal);
    return () => controller.abort();
  }, [fetchData, fetchSystemConfig]);

  const handleBotCreated = (newBot: Bot) => {
    setBots(prev => [...prev, newBot]);
    setShowWizard(false);
    toast.success('Bot erfolgreich erstellt');
  };

  const handleToggleBot = async (botId: string, currentActive: boolean) => {
    setTogglingBot(botId);
    try {
      const endpoint = currentActive ? 'deactivate' : 'activate';
      const data = await api.post(`/telegram-bots/${botId}/${endpoint}`, undefined, {
        showError: false,
      });
      const newActive = data?.bot?.isActive ?? !currentActive;
      setBots(prev => prev.map(bot => (bot.id === botId ? { ...bot, isActive: newActive } : bot)));
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

  const handleSystemSave = async () => {
    setSystemSaving(true);
    setSystemMessage(null);
    try {
      const payload: Record<string, string | boolean> = {
        chat_id: systemConfig.chat_id,
        enabled: systemConfig.enabled,
      };
      if (systemConfig.bot_token) payload.bot_token = systemConfig.bot_token;
      const data = await api.post('/telegram/config', payload, { showError: false });
      if (!isMountedRef.current) return;
      setHasToken(data.has_token === true || (systemConfig.bot_token !== '' && data.success));
      setSystemConfig(prev => ({ ...prev, bot_token: '' }));
      setOriginalSystemConfig({
        bot_token: '',
        chat_id: systemConfig.chat_id,
        enabled: systemConfig.enabled,
      });
      setSystemMessage({ type: 'success', text: 'Konfiguration gespeichert' });
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const e = err as { message?: string };
      setSystemMessage({ type: 'error', text: e.message || 'Netzwerkfehler beim Speichern' });
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
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const e = err as { message?: string };
      setSystemMessage({ type: 'error', text: e.message || 'Netzwerkfehler' });
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
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const e = err as { message?: string };
      setSystemMessage({ type: 'error', text: e.message || 'Netzwerkfehler beim Test' });
    } finally {
      if (isMountedRef.current) setSystemTesting(false);
    }
  };

  const systemHasChanges =
    systemConfig.bot_token !== '' || systemConfig.chat_id !== originalSystemConfig?.chat_id;

  const activeBots = bots.filter(b => b.isActive).length;

  const handleTabChange = (value: string) => {
    if (value === 'logs' && auditLogs.length === 0) {
      fetchLogs();
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in">
      <div className="shrink-0 px-6 pt-6 pb-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center size-10 rounded-xl bg-primary/10">
            <Send className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground leading-tight">Telegram Bot</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Bots verwalten und konfigurieren</p>
          </div>
          {activeBots > 0 && (
            <span className="bg-primary/10 text-primary border border-primary/20 text-xs font-semibold px-2.5 py-1 rounded-full ml-auto">
              {activeBots} aktiv
            </span>
          )}
        </div>
      </div>

      <Tabs
        defaultValue="bots"
        onValueChange={handleTabChange}
        className="flex-1 flex flex-col min-h-0"
      >
        <div className="px-6 border-b border-border shrink-0">
          <TabsList variant="line" className="gap-2">
            <TabsTrigger value="bots" className="px-4 py-2.5 text-sm">
              <MessageCircle size={16} /> Bots
            </TabsTrigger>
            <TabsTrigger value="status" className="px-4 py-2.5 text-sm">
              <Activity size={16} /> Status
            </TabsTrigger>
            <TabsTrigger value="system" className="px-4 py-2.5 text-sm">
              <Settings size={16} /> System
            </TabsTrigger>
            <TabsTrigger value="logs" className="px-4 py-2.5 text-sm">
              <FileText size={16} /> Logs
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          <div className="max-w-[960px] px-6 py-6">
            <TabsContent value="bots">
              <ComponentErrorBoundary componentName="Bots">
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
              </ComponentErrorBoundary>
            </TabsContent>

            <TabsContent value="status">
              <ComponentErrorBoundary componentName="Status">
                <StatusSection appStatus={appStatus} bots={bots} loading={loading} />
              </ComponentErrorBoundary>
            </TabsContent>

            <TabsContent value="system">
              <ComponentErrorBoundary componentName="System">
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
              </ComponentErrorBoundary>
            </TabsContent>

            <TabsContent value="logs">
              <ComponentErrorBoundary componentName="Logs">
                <LogsSection logs={auditLogs} loading={logsLoading} onRefresh={fetchLogs} />
              </ComponentErrorBoundary>
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>

      {showWizard && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center animate-in fade-in duration-150"
          onClick={() => setShowWizard(false)}
        >
          <div
            className="w-[90vw] max-w-[700px] max-h-[85vh] bg-background border border-border rounded-[14px] flex flex-col overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-6 py-4 border-b border-border">
              <h3 className="m-0 text-lg text-foreground">Neuen Bot erstellen</h3>
              <button
                type="button"
                className="flex items-center justify-center size-9 border-none rounded-lg bg-transparent text-muted-foreground cursor-pointer transition-all text-lg hover:bg-card hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                onClick={() => setShowWizard(false)}
                aria-label="Schließen"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <BotSetupWizard onComplete={handleBotCreated} onCancel={() => setShowWizard(false)} />
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
  );
}
