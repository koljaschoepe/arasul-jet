/**
 * BotDetailsModal - Modal for viewing and editing bot details
 * Tabs: Übersicht & Einstellungen | Befehle | Chats | Erweitert
 */

import { useState, useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Save,
  MessageCircle,
  Settings,
  Terminal,
  Users,
  Eye,
  EyeOff,
  AlertCircle,
  Check,
  RefreshCw,
  SlidersHorizontal,
  ExternalLink,
  BookOpen,
  X,
  Mic,
  Wrench,
  Shield,
  Gauge,
  Zap,
} from 'lucide-react';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import Modal from '../../../components/ui/Modal';
import { SkeletonList } from '../../../components/ui/Skeleton';
import CommandsEditor from './CommandsEditor';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/shadcn/select';
import { Switch } from '@/components/ui/shadcn/switch';
import { cn } from '@/lib/utils';
import type {
  TelegramBot,
  TelegramCommand,
  TelegramChat,
  OllamaModel,
  DocumentSpace,
} from '../../../types';

interface BotDetailsModalProps {
  bot: TelegramBot;
  onClose: () => void;
  onUpdate: (bot: TelegramBot) => void;
}

interface Tab {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface FormData {
  name: string;
  llmModel: string;
  systemPrompt: string;
  ragEnabled: boolean;
  ragSpaceIds: string[] | null;
  ragShowSources: boolean;
  token: string;
  toolsEnabled: boolean;
  voiceEnabled: boolean;
  maxContextTokens: number;
  maxResponseTokens: number;
  rateLimitPerMinute: number;
  restrictUsers: boolean;
  allowedUsers: string;
}

interface Message {
  type: 'success' | 'error';
  text: string;
}

const TABS: Tab[] = [
  { id: 'settings', label: 'Übersicht', icon: Settings },
  { id: 'capabilities', label: 'Fähigkeiten', icon: Zap },
  { id: 'commands', label: 'Befehle', icon: Terminal },
  { id: 'chats', label: 'Chats', icon: Users },
  { id: 'advanced', label: 'Erweitert', icon: SlidersHorizontal },
];

function BotDetailsModal({ bot, onClose, onUpdate }: BotDetailsModalProps) {
  const api = useApi();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('settings');
  const [formData, setFormData] = useState<FormData>({
    name: bot.name || '',
    llmModel: bot.llmModel || bot.llm_model || '',
    systemPrompt: bot.systemPrompt || bot.system_prompt || '',
    ragEnabled: bot.ragEnabled || bot.rag_enabled || false,
    ragSpaceIds: bot.ragSpaceIds || bot.rag_space_ids || null,
    ragShowSources: bot.ragShowSources ?? bot.rag_show_sources ?? true,
    token: '',
    toolsEnabled: bot.toolsEnabled ?? bot.tools_enabled ?? true,
    voiceEnabled: bot.voiceEnabled ?? bot.voice_enabled ?? true,
    maxContextTokens: bot.maxContextTokens || bot.max_context_tokens || 4096,
    maxResponseTokens: bot.maxResponseTokens || bot.max_response_tokens || 1024,
    rateLimitPerMinute: bot.rateLimitPerMinute || bot.rate_limit_per_minute || 10,
    restrictUsers: bot.restrictUsers || bot.restrict_users || false,
    allowedUsers: (bot.allowedUsers || bot.allowed_users || []).join(', '),
  });
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [spaces, setSpaces] = useState<DocumentSpace[]>([]);
  const [commands, setCommands] = useState<TelegramCommand[]>([]);
  const [chats, setChats] = useState<TelegramChat[]>([]);
  const [loadingCommands, setLoadingCommands] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);

  const username = bot.username || bot.bot_username;

  // Fetch models and spaces
  useEffect(() => {
    const fetchData = async () => {
      const [modelsResult, spacesResult] = await Promise.allSettled([
        api.get('/telegram-bots/models/ollama', { showError: false }),
        api.get('/spaces', { showError: false }),
      ]);

      if (modelsResult.status === 'fulfilled') {
        setOllamaModels(modelsResult.value.models || []);
      }
      if (spacesResult.status === 'fulfilled') {
        setSpaces(spacesResult.value.spaces || spacesResult.value || []);
      }
    };
    fetchData();
  }, [api]);

  // Fetch commands on tab switch
  useEffect(() => {
    if (activeTab === 'commands') {
      setLoadingCommands(true);
      api
        .get(`/telegram-bots/${bot.id}/commands`, { showError: false })
        .then(data => setCommands((data as { commands?: TelegramCommand[] }).commands || []))
        .catch(() => toast.error('Fehler beim Laden der Befehle'))
        .finally(() => setLoadingCommands(false));
    }
  }, [activeTab, bot.id, api, toast]);

  // Fetch chats on tab switch
  useEffect(() => {
    if (activeTab === 'chats') {
      setLoadingChats(true);
      api
        .get(`/telegram-bots/${bot.id}/chats`, { showError: false })
        .then(data => setChats((data as { chats?: TelegramChat[] }).chats || []))
        .catch(() => toast.error('Fehler beim Laden der Chats'))
        .finally(() => setLoadingChats(false));
    }
  }, [activeTab, bot.id, api, toast]);

  // Save settings
  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const payload: Record<string, unknown> = {
        name: formData.name,
        llmProvider: 'ollama',
        llmModel: formData.llmModel,
        systemPrompt: formData.systemPrompt,
        ragEnabled: formData.ragEnabled,
        ragSpaceIds: formData.ragSpaceIds,
        ragShowSources: formData.ragShowSources,
        toolsEnabled: formData.toolsEnabled,
        voiceEnabled: formData.voiceEnabled,
        maxContextTokens: formData.maxContextTokens,
        maxResponseTokens: formData.maxResponseTokens,
        rateLimitPerMinute: formData.rateLimitPerMinute,
        restrictUsers: formData.restrictUsers,
        allowedUsers: formData.allowedUsers
          ? formData.allowedUsers
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
          : [],
      };

      if (formData.token) payload.token = formData.token;

      const data = await api.put(`/telegram-bots/${bot.id}`, payload, { showError: false });
      setMessage({ type: 'success', text: 'Einstellungen gespeichert' });
      setFormData(prev => ({ ...prev, token: '' }));
      if (onUpdate) onUpdate(data.bot);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setMessage({ type: 'error', text: e.message || 'Fehler beim Speichern' });
    } finally {
      setSaving(false);
    }
  };

  const handleCommandsChange = (updatedCommands: TelegramCommand[]) => setCommands(updatedCommands);

  const handleRemoveChat = async (chatRowId: string) => {
    try {
      await api.del(`/telegram-bots/${bot.id}/chats/${chatRowId}`, { showError: false });
      setChats(prev => prev.filter(c => c.id !== chatRowId));
    } catch {
      toast.error('Fehler beim Entfernen des Chats');
    }
  };

  const toggleSpace = (spaceId: string) => {
    setFormData(prev => {
      const ids = prev.ragSpaceIds || [];
      const next = ids.includes(spaceId) ? ids.filter(id => id !== spaceId) : [...ids, spaceId];
      return { ...prev, ragSpaceIds: next.length > 0 ? next : [] };
    });
  };

  const isMaster = formData.ragEnabled && formData.ragSpaceIds === null;

  // Tab 1: Übersicht & Einstellungen
  const renderSettings = () => (
    <div>
      {message && activeTab === 'settings' && (
        <div
          className={cn(
            'flex items-center gap-2 py-2.5 px-3.5 rounded-lg text-sm mb-4',
            message.type === 'success' && 'bg-primary/10 text-primary border border-primary/20',
            message.type === 'error' &&
              'bg-foreground/5 text-foreground border border-foreground/20'
          )}
        >
          {message.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <div className="mb-4">
          <label className="block mb-1.5 text-foreground text-sm font-medium">Bot Name</label>
          <Input
            type="text"
            value={formData.name}
            onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
          />
        </div>

        <div className="mb-4">
          <label className="block mb-1.5 text-foreground text-sm font-medium">System-Prompt</label>
          <Textarea
            value={formData.systemPrompt}
            onChange={e => setFormData(prev => ({ ...prev, systemPrompt: e.target.value }))}
            rows={5}
            placeholder="Definiere die Persönlichkeit deines Bots..."
          />
        </div>

        <div className="mb-4">
          <label className="block mb-1.5 text-foreground text-sm font-medium">LLM-Modell</label>
          <Select
            value={formData.llmModel}
            onValueChange={val => setFormData(prev => ({ ...prev, llmModel: val }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={
                  ollamaModels.length === 0 ? 'Keine Modelle verfügbar' : 'Modell wählen'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {ollamaModels.length === 0 && (
                <SelectItem value="none" disabled>
                  Keine Modelle verfügbar
                </SelectItem>
              )}
              {ollamaModels.map(model => {
                const name = typeof model === 'string' ? model : model.name;
                return (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <small className="block mt-1.5 text-muted-foreground text-xs">
            Lokales Modell via Ollama
          </small>
        </div>

        {/* RAG Configuration */}
        <div className="my-4 p-4 bg-card border border-border rounded-xl">
          <h4 className="flex items-center gap-2 m-0 mb-3 text-foreground text-sm">
            <BookOpen size={16} /> RAG-Konfiguration
          </h4>

          <label className="flex items-center gap-2 cursor-pointer text-foreground text-sm mb-2">
            <input
              type="checkbox"
              checked={formData.ragEnabled}
              onChange={e => setFormData(prev => ({ ...prev, ragEnabled: e.target.checked }))}
              className="w-auto accent-primary"
            />
            RAG aktivieren (Dokument-Wissen nutzen)
          </label>

          {formData.ragEnabled && (
            <>
              <div className="mb-4" style={{ marginTop: '0.75rem' }}>
                <label className="block mb-1.5 text-foreground text-sm font-medium">
                  Space-Zuordnung
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={cn(
                      'py-1.5 px-3 bg-background border border-border rounded-full text-muted-foreground text-xs cursor-pointer transition-all hover:border-primary',
                      formData.ragSpaceIds === null && 'bg-primary/15 border-primary text-primary'
                    )}
                    onClick={() => setFormData(prev => ({ ...prev, ragSpaceIds: null }))}
                  >
                    Alle Spaces {isMaster && '(Master)'}
                  </button>
                  {spaces.map(space => (
                    <button
                      key={space.id}
                      type="button"
                      className={cn(
                        'py-1.5 px-3 bg-background border border-border rounded-full text-muted-foreground text-xs cursor-pointer transition-all hover:border-primary',
                        formData.ragSpaceIds?.includes(space.id) &&
                          'bg-primary/15 border-primary text-primary'
                      )}
                      onClick={() => {
                        if (formData.ragSpaceIds === null) {
                          setFormData(prev => ({ ...prev, ragSpaceIds: [space.id] }));
                        } else {
                          toggleSpace(space.id);
                        }
                      }}
                    >
                      {space.name}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-foreground text-sm mb-2">
                <input
                  type="checkbox"
                  checked={formData.ragShowSources}
                  onChange={e =>
                    setFormData(prev => ({ ...prev, ragShowSources: e.target.checked }))
                  }
                  className="w-auto accent-primary"
                />
                Quellen in Antworten anzeigen
              </label>
            </>
          )}
        </div>

        <div className="flex gap-3 mt-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <RefreshCw size={16} className="animate-spin" /> Speichern...
              </>
            ) : (
              <>
                <Save size={16} /> Speichern
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );

  // Tab 2: Befehle
  const renderCommands = () => (
    <div>
      {loadingCommands ? (
        <SkeletonList count={3} hasAvatar={false} />
      ) : (
        <CommandsEditor
          botId={Number(bot.id)}
          commands={commands}
          onChange={handleCommandsChange}
        />
      )}
    </div>
  );

  // Tab 3: Chats
  const renderChats = () => (
    <div>
      {loadingChats ? (
        <SkeletonList count={3} hasAvatar={false} />
      ) : chats.length === 0 ? (
        <div className="flex flex-col items-center p-10 text-center text-muted-foreground">
          <Users size={32} className="mb-3 text-muted-foreground/60" />
          <p className="m-0 mb-1 text-foreground text-sm">Noch keine Chats verbunden</p>
          <small className="text-muted-foreground text-sm">
            Öffne deinen Bot in Telegram und sende /start
          </small>
          {username && (
            <Button variant="outline" asChild className="mt-4">
              <a href={`https://t.me/${username}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={16} /> Bot in Telegram öffnen
              </a>
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {chats.map(chat => (
            <div
              key={chat.id}
              className="flex items-center gap-3 py-3 px-4 bg-background border border-border rounded-lg transition-colors hover:border-primary/30"
            >
              <div className="flex-1">
                <span className="block text-sm text-foreground font-medium">
                  {chat.firstName || chat.first_name || 'Unbekannt'}{' '}
                  {chat.lastName || chat.last_name || ''}
                </span>
                <span className="text-xs text-muted-foreground mr-2">
                  ID: {chat.chatId || chat.chat_id}
                </span>
                {chat.username && (
                  <span className="text-xs text-muted-foreground mr-2">@{chat.username}</span>
                )}
              </div>
              <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
                <span>{chat.messageCount || chat.message_count || 0} Nachrichten</span>
                <span>
                  {new Date(chat.lastMessageAt || chat.last_message_at || '').toLocaleDateString(
                    'de-DE'
                  )}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="hover:bg-destructive/10 hover:text-destructive"
                onClick={() => handleRemoveChat(chat.id)}
                title="Chat entfernen"
              >
                <X size={14} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Tab 4: Erweitert
  const renderAdvanced = () => (
    <div>
      {message && activeTab === 'advanced' && (
        <div
          className={cn(
            'flex items-center gap-2 py-2.5 px-3.5 rounded-lg text-sm mb-4',
            message.type === 'success' && 'bg-primary/10 text-primary border border-primary/20',
            message.type === 'error' &&
              'bg-foreground/5 text-foreground border border-foreground/20'
          )}
        >
          {message.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <div className="mb-4">
          <label className="block mb-1.5 text-foreground text-sm font-medium">
            Bot-Token ändern
          </label>
          <div className="relative">
            <Input
              type={showToken ? 'text' : 'password'}
              value={formData.token}
              onChange={e => setFormData(prev => ({ ...prev, token: e.target.value }))}
              placeholder="Neues Token eingeben..."
              className="pr-10"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none text-muted-foreground cursor-pointer p-1"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <small className="block mt-1.5 text-muted-foreground text-xs">
            Leer lassen um das aktuelle Token beizubehalten
          </small>
        </div>

        <div className="mt-6 pt-5 border-t border-border">
          <h4 className="m-0 mb-3 text-foreground text-sm">Bot-Informationen</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[0.725rem] text-muted-foreground uppercase tracking-wide">
                Bot-ID
              </span>
              <span className="text-sm text-foreground">{bot.id}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[0.725rem] text-muted-foreground uppercase tracking-wide">
                Username
              </span>
              <span className="text-sm text-foreground">@{username || '–'}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[0.725rem] text-muted-foreground uppercase tracking-wide">
                Erstellt
              </span>
              <span className="text-sm text-foreground">
                {bot.createdAt || bot.created_at
                  ? new Date((bot.createdAt || bot.created_at)!).toLocaleDateString('de-DE')
                  : '–'}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[0.725rem] text-muted-foreground uppercase tracking-wide">
                Letzte Nachricht
              </span>
              <span className="text-sm text-foreground">
                {bot.lastMessageAt || bot.last_message_at
                  ? new Date(bot.lastMessageAt || bot.last_message_at).toLocaleDateString('de-DE')
                  : '–'}
              </span>
            </div>
          </div>
        </div>

        {formData.token && (
          <div className="flex gap-3 mt-4">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <RefreshCw size={16} className="animate-spin" /> Speichern...
                </>
              ) : (
                <>
                  <Save size={16} /> Änderungen speichern
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  // Tab: Fähigkeiten (Capabilities)
  const renderCapabilities = () => (
    <div className="space-y-4">
      {message && activeTab === 'capabilities' && (
        <div
          className={cn(
            'flex items-center gap-2 py-2.5 px-3.5 rounded-lg text-sm',
            message.type === 'success' && 'bg-primary/10 text-primary border border-primary/20',
            message.type === 'error' &&
              'bg-destructive/10 text-destructive border border-destructive/20'
          )}
        >
          {message.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
          {message.text}
        </div>
      )}

      {/* Voice */}
      <div className="border border-border rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Mic size={18} className="text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Sprachnachrichten</p>
              <p className="text-xs text-muted-foreground">
                Empfange und transkribiere Voice-Nachrichten via Whisper
              </p>
            </div>
          </div>
          <Switch
            checked={formData.voiceEnabled}
            onCheckedChange={v => setFormData(prev => ({ ...prev, voiceEnabled: v }))}
          />
        </div>
      </div>

      {/* Tools */}
      <div className="border border-border rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wrench size={18} className="text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Tool-Zugriff</p>
              <p className="text-xs text-muted-foreground">
                Bot kann System-Status, Services, Logs und Workflows abfragen
              </p>
            </div>
          </div>
          <Switch
            checked={formData.toolsEnabled}
            onCheckedChange={v => setFormData(prev => ({ ...prev, toolsEnabled: v }))}
          />
        </div>
      </div>

      {/* User Access */}
      <div className="border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield size={18} className="text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Nutzerzugriff einschränken</p>
              <p className="text-xs text-muted-foreground">
                Nur bestimmte Telegram-Nutzer dürfen den Bot verwenden
              </p>
            </div>
          </div>
          <Switch
            checked={formData.restrictUsers}
            onCheckedChange={v => setFormData(prev => ({ ...prev, restrictUsers: v }))}
          />
        </div>
        {formData.restrictUsers && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">
              Erlaubte Telegram-User-IDs (komma-getrennt)
            </label>
            <Input
              value={formData.allowedUsers}
              onChange={e => setFormData(prev => ({ ...prev, allowedUsers: e.target.value }))}
              placeholder="123456789, 987654321"
              className="text-sm"
            />
          </div>
        )}
      </div>

      {/* Context Settings */}
      <div className="border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3 mb-1">
          <Gauge size={18} className="text-muted-foreground" />
          <p className="text-sm font-medium">Kontext & Limits</p>
        </div>
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">
              Kontext-Tokens (max)
            </label>
            <Input
              type="number"
              min={1024}
              max={8192}
              step={512}
              value={formData.maxContextTokens}
              onChange={e =>
                setFormData(prev => ({
                  ...prev,
                  maxContextTokens: parseInt(e.target.value) || 4096,
                }))
              }
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">
              Antwort-Tokens (max)
            </label>
            <Input
              type="number"
              min={256}
              max={4096}
              step={256}
              value={formData.maxResponseTokens}
              onChange={e =>
                setFormData(prev => ({
                  ...prev,
                  maxResponseTokens: parseInt(e.target.value) || 1024,
                }))
              }
              className="text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">
            Rate Limit (Anfragen/Minute)
          </label>
          <Input
            type="number"
            min={1}
            max={60}
            value={formData.rateLimitPerMinute}
            onChange={e =>
              setFormData(prev => ({ ...prev, rateLimitPerMinute: parseInt(e.target.value) || 10 }))
            }
            className="text-sm w-32"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <RefreshCw size={16} className="animate-spin" /> Speichern...
            </>
          ) : (
            <>
              <Save size={16} /> Fähigkeiten speichern
            </>
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <MessageCircle size={20} className="text-primary" />
          <div>
            <span>{bot.name}</span>
            <span className="block text-xs text-muted-foreground font-normal">
              @{username || 'nicht verbunden'}
            </span>
          </div>
        </div>
      }
      size="large"
    >
      <div className="flex gap-1 px-4 border-b border-border mb-5">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              type="button"
              key={tab.id}
              className={cn(
                'flex items-center gap-1.5 py-2.5 px-3.5 bg-transparent border-none text-muted-foreground text-sm cursor-pointer border-b-2 border-b-transparent transition-all hover:text-foreground',
                activeTab === tab.id && 'text-primary border-b-primary'
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} /> <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="px-4 pb-4 overflow-y-auto max-h-[60vh]">
        {activeTab === 'settings' && renderSettings()}
        {activeTab === 'capabilities' && renderCapabilities()}
        {activeTab === 'commands' && renderCommands()}
        {activeTab === 'chats' && renderChats()}
        {activeTab === 'advanced' && renderAdvanced()}
      </div>
    </Modal>
  );
}

export default BotDetailsModal;
