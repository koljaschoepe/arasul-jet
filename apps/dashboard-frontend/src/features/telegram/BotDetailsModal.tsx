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
} from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../../components/ui/Modal';
import { SkeletonList } from '../../components/ui/Skeleton';
import CommandsEditor from './CommandsEditor';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/shadcn/select';
import { cn } from '@/lib/utils';

interface BotDetailsModalProps {
  bot: any;
  onClose: () => void;
  onUpdate: (bot: any) => void;
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
}

interface Message {
  type: 'success' | 'error';
  text: string;
}

const TABS: Tab[] = [
  { id: 'settings', label: 'Übersicht', icon: Settings },
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
  });
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [ollamaModels, setOllamaModels] = useState<any[]>([]);
  const [spaces, setSpaces] = useState<any[]>([]);
  const [commands, setCommands] = useState<any[]>([]);
  const [chats, setChats] = useState<any[]>([]);
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
        .then((data: any) => setCommands(data.commands || []))
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
        .then((data: any) => setChats(data.chats || []))
        .catch(() => toast.error('Fehler beim Laden der Chats'))
        .finally(() => setLoadingChats(false));
    }
  }, [activeTab, bot.id, api, toast]);

  // Save settings
  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const payload: Record<string, any> = {
        name: formData.name,
        llmProvider: 'ollama',
        llmModel: formData.llmModel,
        systemPrompt: formData.systemPrompt,
        ragEnabled: formData.ragEnabled,
        ragSpaceIds: formData.ragSpaceIds,
        ragShowSources: formData.ragShowSources,
      };

      if (formData.token) payload.token = formData.token;

      const data = await api.put(`/telegram-bots/${bot.id}`, payload, { showError: false });
      setMessage({ type: 'success', text: 'Einstellungen gespeichert' });
      setFormData(prev => ({ ...prev, token: '' }));
      if (onUpdate) onUpdate(data.bot);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.data?.error || 'Fehler beim Speichern' });
    } finally {
      setSaving(false);
    }
  };

  const handleCommandsChange = (updatedCommands: any[]) => setCommands(updatedCommands);

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
            message.type === 'success' &&
              'bg-[rgba(34,197,94,0.1)] text-[var(--success-color)] border border-[rgba(34,197,94,0.2)]',
            message.type === 'error' &&
              'bg-[rgba(239,68,68,0.1)] text-[var(--danger-color)] border border-[rgba(239,68,68,0.2)]'
          )}
        >
          {message.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <div className="mb-4">
          <label className="block mb-1.5 text-[var(--text-primary)] text-sm font-medium">
            Bot Name
          </label>
          <Input
            type="text"
            value={formData.name}
            onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
          />
        </div>

        <div className="mb-4">
          <label className="block mb-1.5 text-[var(--text-primary)] text-sm font-medium">
            System-Prompt
          </label>
          <Textarea
            value={formData.systemPrompt}
            onChange={e => setFormData(prev => ({ ...prev, systemPrompt: e.target.value }))}
            rows={5}
            placeholder="Definiere die Persönlichkeit deines Bots..."
          />
        </div>

        <div className="mb-4">
          <label className="block mb-1.5 text-[var(--text-primary)] text-sm font-medium">
            LLM-Modell
          </label>
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
          <small className="block mt-1.5 text-[var(--text-muted)] text-xs">
            Lokales Modell via Ollama
          </small>
        </div>

        {/* RAG Configuration */}
        <div className="my-4 p-4 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl">
          <h4 className="flex items-center gap-2 m-0 mb-3 text-[var(--text-primary)] text-sm">
            <BookOpen size={16} /> RAG-Konfiguration
          </h4>

          <label className="flex items-center gap-2 cursor-pointer text-[var(--text-primary)] text-sm mb-2">
            <input
              type="checkbox"
              checked={formData.ragEnabled}
              onChange={e => setFormData(prev => ({ ...prev, ragEnabled: e.target.checked }))}
              className="w-auto accent-[var(--primary-color)]"
            />
            RAG aktivieren (Dokument-Wissen nutzen)
          </label>

          {formData.ragEnabled && (
            <>
              <div className="mb-4" style={{ marginTop: '0.75rem' }}>
                <label className="block mb-1.5 text-[var(--text-primary)] text-sm font-medium">
                  Space-Zuordnung
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={cn(
                      'py-1.5 px-3 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-full text-[var(--text-muted)] text-xs cursor-pointer transition-all hover:border-[var(--primary-color)]',
                      formData.ragSpaceIds === null &&
                        'bg-[rgba(69,173,255,0.15)] border-[var(--primary-color)] text-[var(--primary-color)]'
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
                        'py-1.5 px-3 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-full text-[var(--text-muted)] text-xs cursor-pointer transition-all hover:border-[var(--primary-color)]',
                        formData.ragSpaceIds?.includes(space.id) &&
                          'bg-[rgba(69,173,255,0.15)] border-[var(--primary-color)] text-[var(--primary-color)]'
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

              <label className="flex items-center gap-2 cursor-pointer text-[var(--text-primary)] text-sm mb-2">
                <input
                  type="checkbox"
                  checked={formData.ragShowSources}
                  onChange={e =>
                    setFormData(prev => ({ ...prev, ragShowSources: e.target.checked }))
                  }
                  className="w-auto accent-[var(--primary-color)]"
                />
                Quellen in Antworten anzeigen
              </label>
            </>
          )}
        </div>

        <div className="flex gap-3 mt-4">
          <button
            type="button"
            className="inline-flex items-center gap-2 py-2 px-4 border-none rounded-lg text-sm cursor-pointer transition-all bg-[var(--primary-color)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <RefreshCw size={16} className="animate-spin" /> Speichern...
              </>
            ) : (
              <>
                <Save size={16} /> Speichern
              </>
            )}
          </button>
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
        <CommandsEditor botId={bot.id} commands={commands} onChange={handleCommandsChange} />
      )}
    </div>
  );

  // Tab 3: Chats
  const renderChats = () => (
    <div>
      {loadingChats ? (
        <SkeletonList count={3} hasAvatar={false} />
      ) : chats.length === 0 ? (
        <div className="flex flex-col items-center p-10 text-center text-[var(--text-muted)]">
          <Users size={32} className="mb-3 text-[var(--text-disabled)]" />
          <p className="m-0 mb-1 text-[var(--text-primary)] text-sm">Noch keine Chats verbunden</p>
          <small className="text-[var(--text-muted)] text-sm">
            Öffne deinen Bot in Telegram und sende /start
          </small>
          {username && (
            <a
              href={`https://t.me/${username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 py-2 px-4 rounded-lg text-sm cursor-pointer transition-all bg-[var(--bg-dark)] text-[var(--text-primary)] border border-[var(--border-color)] hover:border-[var(--primary-color)] no-underline mt-4"
            >
              <ExternalLink size={16} /> Bot in Telegram öffnen
            </a>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {chats.map(chat => (
            <div
              key={chat.id}
              className="flex items-center gap-3 py-3 px-4 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg transition-colors hover:border-[rgba(69,173,255,0.3)]"
            >
              <div className="flex-1">
                <span className="block text-sm text-[var(--text-primary)] font-medium">
                  {chat.firstName || chat.first_name || 'Unbekannt'}{' '}
                  {chat.lastName || chat.last_name || ''}
                </span>
                <span className="text-xs text-[var(--text-muted)] mr-2">
                  ID: {chat.chatId || chat.chat_id}
                </span>
                {chat.username && (
                  <span className="text-xs text-[var(--text-muted)] mr-2">@{chat.username}</span>
                )}
              </div>
              <div className="flex flex-col items-end gap-0.5 text-xs text-[var(--text-muted)]">
                <span>{chat.messageCount || chat.message_count || 0} Nachrichten</span>
                <span>
                  {new Date(chat.lastMessageAt || chat.last_message_at).toLocaleDateString('de-DE')}
                </span>
              </div>
              <button
                type="button"
                className="flex items-center justify-center w-7 h-7 border-none rounded-md bg-transparent text-[var(--text-muted)] cursor-pointer transition-colors hover:bg-[var(--danger-color)] hover:text-white"
                onClick={() => handleRemoveChat(chat.id)}
                title="Chat entfernen"
              >
                <X size={14} />
              </button>
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
            message.type === 'success' &&
              'bg-[rgba(34,197,94,0.1)] text-[var(--success-color)] border border-[rgba(34,197,94,0.2)]',
            message.type === 'error' &&
              'bg-[rgba(239,68,68,0.1)] text-[var(--danger-color)] border border-[rgba(239,68,68,0.2)]'
          )}
        >
          {message.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <div className="mb-4">
          <label className="block mb-1.5 text-[var(--text-primary)] text-sm font-medium">
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
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-1"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <small className="block mt-1.5 text-[var(--text-muted)] text-xs">
            Leer lassen um das aktuelle Token beizubehalten
          </small>
        </div>

        <div className="mt-6 pt-5 border-t border-[var(--border-color)]">
          <h4 className="m-0 mb-3 text-[var(--text-primary)] text-sm">Bot-Informationen</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[0.725rem] text-[var(--text-muted)] uppercase tracking-wide">
                Bot-ID
              </span>
              <span className="text-sm text-[var(--text-primary)]">{bot.id}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[0.725rem] text-[var(--text-muted)] uppercase tracking-wide">
                Username
              </span>
              <span className="text-sm text-[var(--text-primary)]">@{username || '–'}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[0.725rem] text-[var(--text-muted)] uppercase tracking-wide">
                Erstellt
              </span>
              <span className="text-sm text-[var(--text-primary)]">
                {bot.createdAt || bot.created_at
                  ? new Date(bot.createdAt || bot.created_at).toLocaleDateString('de-DE')
                  : '–'}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[0.725rem] text-[var(--text-muted)] uppercase tracking-wide">
                Letzte Nachricht
              </span>
              <span className="text-sm text-[var(--text-primary)]">
                {bot.lastMessageAt || bot.last_message_at
                  ? new Date(bot.lastMessageAt || bot.last_message_at).toLocaleDateString('de-DE')
                  : '–'}
              </span>
            </div>
          </div>
        </div>

        {formData.token && (
          <div className="flex gap-3 mt-4">
            <button
              type="button"
              className="inline-flex items-center gap-2 py-2 px-4 border-none rounded-lg text-sm cursor-pointer transition-all bg-[var(--primary-color)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <RefreshCw size={16} className="animate-spin" /> Speichern...
                </>
              ) : (
                <>
                  <Save size={16} /> Änderungen speichern
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <MessageCircle size={20} className="text-[var(--primary-color)]" />
          <div>
            <span>{bot.name}</span>
            <span className="block text-xs text-[var(--text-muted)] font-normal">
              @{username || 'nicht verbunden'}
            </span>
          </div>
        </div>
      }
      size="large"
    >
      <div className="flex gap-1 px-4 border-b border-[var(--border-color)] mb-5">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              type="button"
              key={tab.id}
              className={cn(
                'flex items-center gap-1.5 py-2.5 px-3.5 bg-transparent border-none text-[var(--text-muted)] text-sm cursor-pointer border-b-2 border-b-transparent transition-all hover:text-[var(--text-primary)]',
                activeTab === tab.id &&
                  'text-[var(--primary-color)] border-b-[var(--primary-color)]'
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
        {activeTab === 'commands' && renderCommands()}
        {activeTab === 'chats' && renderChats()}
        {activeTab === 'advanced' && renderAdvanced()}
      </div>
    </Modal>
  );
}

export default BotDetailsModal;
