import { useState } from 'react';
import { X, Send, MessageCircle, Activity, Settings, FileText } from 'lucide-react';
import useConfirm from '../../hooks/useConfirm';
import { useToast } from '../../contexts/ToastContext';
import BotSetupWizard from './components/BotSetupWizard';
import BotDetailsModal from './components/BotDetailsModal';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/shadcn/tabs';
import { ScrollArea } from '@/components/ui/shadcn/scroll-area';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import BotsSection from './components/BotsSection';
import StatusSection from './components/StatusSection';
import SystemSection from './components/SystemSection';
import LogsSection from './components/LogsSection';
import type { Bot, SystemConfig, SystemMessage } from './components/types';
import {
  useBotsQuery,
  useAppStatusQuery,
  useSystemConfigQuery,
  useAuditLogsQuery,
} from './hooks/queries';
import {
  useToggleBotMutation,
  useDeleteBotMutation,
  useAddBotToCache,
  useUpdateBotInCache,
  useUpdateSystemConfigMutation,
  useTestSystemMutation,
} from './hooks/mutations';

export default function TelegramBotPage() {
  const { confirm, ConfirmDialog } = useConfirm();
  const toast = useToast();

  // Server state — useQuery (cached, dedup, retry)
  const botsQuery = useBotsQuery();
  const appStatusQuery = useAppStatusQuery();
  const systemConfigQuery = useSystemConfigQuery();

  const bots = botsQuery.data ?? [];
  const error = botsQuery.error ? 'Fehler beim Laden der Telegram-Daten' : null;
  const loading = botsQuery.isLoading || appStatusQuery.isLoading;

  const remoteSystemConfig = systemConfigQuery.data?.config;
  const hasToken = systemConfigQuery.data?.hasToken ?? false;
  const systemLoading = systemConfigQuery.isLoading;

  // Logs are deferred — only fetched once the user opens the Logs tab
  const [logsTabOpened, setLogsTabOpened] = useState(false);
  const auditLogsQuery = useAuditLogsQuery(logsTabOpened);
  const auditLogs = auditLogsQuery.data ?? [];
  const logsLoading = auditLogsQuery.isFetching;

  // Mutations
  const toggleBot = useToggleBotMutation();
  const deleteBot = useDeleteBotMutation();
  const addBotToCache = useAddBotToCache();
  const updateBotInCache = useUpdateBotInCache();
  const updateSystemConfig = useUpdateSystemConfigMutation();
  const testSystem = useTestSystemMutation();

  // Local UI state — pure form/modal toggles, not server data
  const [showWizard, setShowWizard] = useState(false);
  const [selectedBot, setSelectedBot] = useState<Bot | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [systemMessage, setSystemMessage] = useState<SystemMessage | null>(null);

  // Local form state for system config — initialized from server, edited freely.
  // Reset whenever the server fetch refreshes (e.g. after save).
  const [formConfig, setFormConfig] = useState<SystemConfig>({
    bot_token: '',
    chat_id: '',
    enabled: false,
  });
  const [lastServerConfigSnapshot, setLastServerConfigSnapshot] = useState<string>('');
  if (remoteSystemConfig) {
    const snapshot = JSON.stringify(remoteSystemConfig);
    if (snapshot !== lastServerConfigSnapshot) {
      // Server data changed (initial load or after mutation) — sync local form
      setFormConfig(remoteSystemConfig);
      setLastServerConfigSnapshot(snapshot);
    }
  }

  const systemHasChanges =
    formConfig.bot_token !== '' ||
    (remoteSystemConfig != null && formConfig.chat_id !== remoteSystemConfig.chat_id);

  const handleBotCreated = (newBot: Bot) => {
    addBotToCache(newBot);
    setShowWizard(false);
    toast.success('Bot erfolgreich erstellt');
  };

  const handleToggleBot = (botId: string, currentActive: boolean) => {
    toggleBot.mutate({ botId, currentActive });
  };

  const handleDeleteBot = async (botId: string) => {
    if (
      !(await confirm({
        message: 'Bot wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
      }))
    ) {
      return;
    }
    deleteBot.mutate(botId);
  };

  const handleSystemSave = () => {
    setSystemMessage(null);
    const payload: { chat_id: string; enabled: boolean; bot_token?: string } = {
      chat_id: formConfig.chat_id,
      enabled: formConfig.enabled,
    };
    if (formConfig.bot_token) payload.bot_token = formConfig.bot_token;

    updateSystemConfig.mutate(payload, {
      onSuccess: () => setSystemMessage({ type: 'success', text: 'Konfiguration gespeichert' }),
      onError: err => {
        const e = err as { message?: string };
        setSystemMessage({ type: 'error', text: e.message ?? 'Netzwerkfehler beim Speichern' });
      },
    });
  };

  const handleSystemToggle = () => {
    setSystemMessage(null);
    const newEnabled = !formConfig.enabled;
    updateSystemConfig.mutate(
      { enabled: newEnabled },
      {
        onSuccess: () =>
          setSystemMessage({
            type: 'success',
            text: newEnabled
              ? 'System-Benachrichtigungen aktiviert'
              : 'System-Benachrichtigungen deaktiviert',
          }),
        onError: err => {
          const e = err as { message?: string };
          setSystemMessage({ type: 'error', text: e.message ?? 'Netzwerkfehler' });
        },
      }
    );
  };

  const handleSystemTest = () => {
    setSystemMessage(null);
    testSystem.mutate(undefined, {
      onSuccess: () =>
        setSystemMessage({ type: 'success', text: 'Test-Nachricht erfolgreich gesendet!' }),
      onError: err => {
        const e = err as { message?: string };
        setSystemMessage({ type: 'error', text: e.message ?? 'Netzwerkfehler beim Test' });
      },
    });
  };

  const handleTabChange = (value: string) => {
    if (value === 'logs') setLogsTabOpened(true);
  };

  const activeBots = bots.filter(b => b.isActive).length;

  // Per-bot pending state derived from in-flight mutation variables
  const togglingBot = toggleBot.isPending ? (toggleBot.variables?.botId ?? null) : null;
  const deletingBot = deleteBot.isPending
    ? ((deleteBot.variables as string | undefined) ?? null)
    : null;
  const systemSaving = updateSystemConfig.isPending;
  const systemTesting = testSystem.isPending;

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
                  onRefresh={() => botsQuery.refetch()}
                  onCreateBot={() => setShowWizard(true)}
                  onEditBot={setSelectedBot}
                  onToggleBot={handleToggleBot}
                  onDeleteBot={handleDeleteBot}
                />
              </ComponentErrorBoundary>
            </TabsContent>

            <TabsContent value="status">
              <ComponentErrorBoundary componentName="Status">
                <StatusSection
                  appStatus={appStatusQuery.data ?? null}
                  bots={bots}
                  loading={loading}
                />
              </ComponentErrorBoundary>
            </TabsContent>

            <TabsContent value="system">
              <ComponentErrorBoundary componentName="System">
                <SystemSection
                  config={formConfig}
                  setConfig={setFormConfig}
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
                <LogsSection
                  logs={auditLogs}
                  loading={logsLoading}
                  onRefresh={() => auditLogsQuery.refetch()}
                />
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
          onUpdate={updatedBot => {
            updateBotInCache(updatedBot);
            setSelectedBot(null);
          }}
        />
      )}
      {ConfirmDialog}
    </div>
  );
}
