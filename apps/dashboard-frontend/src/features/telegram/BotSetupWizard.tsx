/**
 * BotSetupWizard - 3-step wizard for creating Telegram bots
 * Step 1: Token & Template (Arasul Assistent or Custom)
 * Step 2: Configuration (System Prompt, Model, Spaces)
 * Step 3: Connect (WebSocket + Polling fallback)
 */

import { useState, useEffect, useCallback, useRef, type ChangeEvent } from 'react';
import {
  Check,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  ExternalLink,
  RefreshCw,
  BookOpen,
  Star,
  Pencil,
} from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import { sanitizeUrl } from '../../utils/sanitizeUrl';
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
import type { LucideIcon } from 'lucide-react';

interface BotSetupWizardProps {
  onComplete: (bot: any) => void;
  onCancel: () => void;
}

interface Step {
  id: number;
  title: string;
  description: string;
}

interface BotTemplate {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  prompt: string;
  ragEnabled: boolean;
  ragSpaceIds: string[] | null;
}

interface FormData {
  name: string;
  token: string;
  llmModel: string;
  systemPrompt: string;
  template: string | null;
  ragEnabled: boolean;
  ragSpaceIds: string[] | null;
  ragShowSources: boolean;
}

interface BotInfo {
  first_name: string;
  username: string;
}

interface ChatInfo {
  chatId: string;
  username: string;
  firstName: string;
  type: string;
}

interface OllamaModel {
  name: string;
  [key: string]: any;
}

interface Space {
  id: string;
  name: string;
  [key: string]: any;
}

const STEPS: Step[] = [
  { id: 1, title: 'Token & Vorlage', description: 'Token eingeben und Vorlage wählen' },
  { id: 2, title: 'Konfiguration', description: 'Bot konfigurieren' },
  { id: 3, title: 'Verbinden', description: 'Bot mit Chat verknüpfen' },
];

const BOT_TEMPLATES: BotTemplate[] = [
  {
    id: 'master',
    name: 'Arasul Assistent',
    description: 'Dein persönlicher KI-Assistent mit Zugriff auf alle Daten',
    icon: Star,
    prompt:
      'Du bist der Arasul Assistent – ein intelligenter KI-Assistent mit Zugriff auf alle Dokumente und Wissens-Spaces. Du antwortest auf Deutsch, bist hilfsbereit und nutzt die verfügbaren Daten, um fundierte Antworten zu geben. Bei Bedarf gibst du auch die Quellen deiner Informationen an.',
    ragEnabled: true,
    ragSpaceIds: null, // null = all spaces
  },
  {
    id: 'custom',
    name: 'Custom Bot',
    description: 'Erstelle einen spezialisierten Bot mit eigener Konfiguration',
    icon: Pencil,
    prompt: 'Du bist ein hilfreicher Assistent. Du antwortest auf Deutsch.',
    ragEnabled: false,
    ragSpaceIds: [],
  },
];

function BotSetupWizard({ onComplete, onCancel }: BotSetupWizardProps) {
  const api = useApi();
  const toast = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    token: '',
    llmModel: '',
    systemPrompt: '',
    template: null, // 'master' or 'custom'
    ragEnabled: false,
    ragSpaceIds: null,
    ragShowSources: true,
  });
  const [showToken, setShowToken] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [creating, setCreating] = useState(false);

  // Chat verification state
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [chatDetected, setChatDetected] = useState(false);
  const [chatInfo, setChatInfo] = useState<ChatInfo | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [waitingForChat, setWaitingForChat] = useState(false);
  const [verificationTimeout, setVerificationTimeout] = useState<number | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatDetectedRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  // Fetch models and spaces
  useEffect(() => {
    const fetchData = async () => {
      const [modelsResult, spacesResult] = await Promise.allSettled([
        api.get('/telegram-bots/models/ollama', { showError: false }),
        api.get('/spaces', { showError: false }),
      ]);

      if (modelsResult.status === 'fulfilled') {
        const models = modelsResult.value.models || [];
        setOllamaModels(models);
        if (models.length > 0 && !formData.llmModel) {
          setFormData(prev => ({ ...prev, llmModel: models[0].name || models[0] }));
        }
      }

      if (spacesResult.status === 'fulfilled') {
        setSpaces(spacesResult.value.spaces || spacesResult.value || []);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WebSocket connection for chat detection
  const connectWebSocket = useCallback((token: string) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/telegram-app/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      ws.send(JSON.stringify({ type: 'subscribe', setupToken: token }));
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'setup_complete') {
          chatDetectedRef.current = true;
          setChatDetected(true);
          setChatInfo({
            chatId: data.chatId,
            username: data.chatUsername,
            firstName: data.chatFirstName,
            type: data.chatType || 'private',
          });
          setWaitingForChat(false);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        }
      } catch (err) {
        console.error('[Wizard] Error parsing WebSocket message:', err);
      }
    };

    ws.onerror = () => {
      setWsConnected(false);
      startPolling(token);
    };

    ws.onclose = () => {
      setWsConnected(false);
      wsRef.current = null;
      // Start polling fallback if chat not yet detected
      if (!chatDetectedRef.current) {
        startPolling(token);
      }
    };

    return ws;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling fallback
  const startPolling = useCallback(
    (token: string) => {
      if (pollingIntervalRef.current) return;

      const poll = async () => {
        try {
          const data = await api.get(`/telegram-app/zero-config/status/${token}`, {
            showError: false,
          });
          if (data.status === 'completed' && data.chatId) {
            chatDetectedRef.current = true;
            setChatDetected(true);
            setChatInfo({
              chatId: data.chatId,
              username: data.chatUsername,
              firstName: data.chatFirstName,
              type: 'private',
            });
            setWaitingForChat(false);
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
          }
        } catch (err) {
          console.error('[Wizard] Polling error:', err);
        }
      };

      pollingIntervalRef.current = setInterval(poll, 2000);
      poll();
    },
    [api]
  );

  // Validate bot token
  const validateToken = async () => {
    const tokenTrimmed = formData.token?.trim();
    if (!tokenTrimmed) {
      setError('Bitte gib ein Bot-Token ein');
      return;
    }

    const tokenRegex = /^\d+:[A-Za-z0-9_-]+$/;
    if (!tokenRegex.test(tokenTrimmed)) {
      setError('Ungültiges Token-Format. Das Token sollte das Format "123456789:ABCdef..." haben.');
      return;
    }

    setValidating(true);
    setError(null);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let data: any;
      try {
        data = await api.post(
          '/telegram-bots/validate-token',
          { token: tokenTrimmed },
          { showError: false, signal: controller.signal }
        );
      } finally {
        clearTimeout(timeout);
      }

      if (data.valid) {
        setValidated(true);
        setBotInfo(data.botInfo);
        setFormData(prev => ({
          ...prev,
          name: data.botInfo.first_name || prev.name,
          token: tokenTrimmed,
        }));
      } else {
        setError(data.error || 'Token konnte nicht validiert werden');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Zeitüberschreitung bei der Token-Validierung');
      } else {
        setError(err.data?.error || err.message || 'Fehler bei der Token-Validierung');
      }
    } finally {
      setValidating(false);
    }
  };

  // Select template
  const selectTemplate = (template: string) => {
    const tpl = BOT_TEMPLATES.find(t => t.id === template);
    if (!tpl) return;
    setFormData(prev => ({
      ...prev,
      template,
      systemPrompt: tpl.prompt,
      ragEnabled: tpl.ragEnabled,
      ragSpaceIds: tpl.ragSpaceIds,
    }));
  };

  // Initialize chat verification (Step 3)
  const initChatVerification = useCallback(async () => {
    setWaitingForChat(true);
    setError(null);

    try {
      const initData = await api.post('/telegram-app/zero-config/init', undefined, {
        showError: false,
      });
      const token = initData.setupToken;
      if (!token) throw new Error('Setup-Token wurde nicht generiert');
      setSetupToken(token);

      connectWebSocket(token);

      const tokenData = await api.post(
        '/telegram-app/zero-config/token',
        {
          setupToken: token,
          botToken: formData.token,
        },
        { showError: false }
      );

      if (!tokenData.deepLink) throw new Error('Deep-Link konnte nicht generiert werden');
      setDeepLink(tokenData.deepLink);

      // Always start polling as backup alongside WebSocket
      // This ensures detection even if WebSocket drops silently
      startPolling(token);

      timeoutRef.current = setTimeout(
        () => {
          if (!chatDetectedRef.current) {
            setError('Zeitüberschreitung: Keine Nachricht vom Bot empfangen.');
            setWaitingForChat(false);
          }
        },
        5 * 60 * 1000
      );

      setVerificationTimeout(5 * 60);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Verbindungs-Timeout. Bitte prüfe deine Internetverbindung.');
      } else {
        setError(err.data?.error || err.message || 'Fehler bei der Chat-Verifizierung');
      }
      setWaitingForChat(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, formData.token, connectWebSocket]);

  // Countdown timer
  useEffect(() => {
    if (!waitingForChat || verificationTimeout === null) return;
    const interval = setInterval(() => {
      setVerificationTimeout(prev => {
        if (prev === null || prev <= 0) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingForChat]);

  // Retry chat verification
  const retryChatVerification = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    chatDetectedRef.current = false;
    setChatDetected(false);
    setChatInfo(null);
    setSetupToken(null);
    setDeepLink(null);
    setError(null);
    initChatVerification();
  }, [initChatVerification]);

  // Create bot
  const handleCreate = async () => {
    setCreating(true);
    setError(null);

    try {
      // Complete zero-config
      if (setupToken) {
        await api.post(
          '/telegram-app/zero-config/complete',
          {
            setupToken,
            botToken: formData.token,
          },
          { showError: false }
        );
      }

      // Create bot
      const data = await api.post(
        '/telegram-bots',
        {
          name: formData.name,
          token: formData.token,
          llmProvider: 'ollama',
          llmModel: formData.llmModel,
          systemPrompt: formData.systemPrompt,
          setupToken: setupToken || undefined,
          ragEnabled: formData.ragEnabled,
          ragSpaceIds: formData.ragSpaceIds,
          ragShowSources: formData.ragShowSources,
        },
        { showError: false }
      );

      if (data.bot) {
        // Activate
        try {
          await api.post(`/telegram-bots/${data.bot.id}/activate`, undefined, { showError: false });
          data.bot.isActive = true;
        } catch (activationErr: any) {
          console.error('Bot activation failed:', activationErr);
          toast.warning('Bot erstellt, aber Aktivierung fehlgeschlagen. Bitte manuell aktivieren.');
        }
        onComplete(data.bot);
      }
    } catch (err: any) {
      setError(err.data?.error || err.message || 'Fehler beim Erstellen des Bots');
    } finally {
      setCreating(false);
    }
  };

  // Navigation
  const nextStep = () => {
    if (currentStep === 1 && !validated) {
      validateToken();
      return;
    }
    if (currentStep === 1 && !formData.template) {
      setError('Bitte wähle eine Vorlage');
      return;
    }
    if (currentStep === 2 && !formData.systemPrompt.trim()) {
      setError('Bitte gib einen System-Prompt ein');
      return;
    }
    if (currentStep === 3 && !chatDetected) return;

    setError(null);
    if (currentStep < 3) {
      const next = currentStep + 1;
      setCurrentStep(next);
      if (next === 3) initChatVerification();
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setError(null);
      setCurrentStep(currentStep - 1);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Toggle space selection
  const toggleSpace = (spaceId: string) => {
    setFormData(prev => {
      const ids = prev.ragSpaceIds || [];
      const next = ids.includes(spaceId) ? ids.filter(id => id !== spaceId) : [...ids, spaceId];
      return { ...prev, ragSpaceIds: next.length > 0 ? next : [] };
    });
  };

  return (
    <div className="flex flex-col min-h-[420px]">
      {/* Step Indicator */}
      <div className="flex gap-2 px-2 pb-6 border-b border-[var(--border-color)] mb-6 max-md:flex-col max-md:gap-1.5">
        {STEPS.map(step => (
          <div
            key={step.id}
            className={cn(
              'flex items-center gap-2.5 flex-1 opacity-50 transition-opacity',
              (currentStep === step.id || currentStep > step.id) && 'opacity-100'
            )}
          >
            <div
              className={cn(
                'flex items-center justify-center w-7 h-7 rounded-full bg-[var(--bg-dark)] border-2 border-[var(--border-color)] text-[var(--text-muted)] text-xs font-semibold shrink-0 transition-all',
                currentStep === step.id &&
                  'bg-[var(--primary-color)] border-[var(--primary-color)] text-white',
                currentStep > step.id &&
                  'bg-[var(--success-color)] border-[var(--success-color)] text-white'
              )}
            >
              {currentStep > step.id ? <Check className="w-3.5 h-3.5" /> : step.id}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-[var(--text-primary)]">{step.title}</span>
              <span className="text-[0.7rem] text-[var(--text-muted)]">{step.description}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 py-2.5 px-3.5 mx-1 mb-4 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] rounded-lg text-[var(--danger-color)] text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Step Content */}
      <div className="flex-1 px-1">
        {/* ---- STEP 1: Token & Template ---- */}
        {currentStep === 1 && (
          <div>
            <div className="mb-5">
              <label
                htmlFor="wizard-token"
                className="block mb-1.5 text-[var(--text-primary)] text-sm font-medium"
              >
                Bot Token
              </label>
              <div className="relative">
                <Input
                  id="wizard-token"
                  type={showToken ? 'text' : 'password'}
                  value={formData.token}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    setFormData(prev => ({ ...prev, token: e.target.value }));
                    setValidated(false);
                    setBotInfo(null);
                  }}
                  placeholder="Token von @BotFather eingeben"
                  autoComplete="off"
                  disabled={validating}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-1"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {validated && botInfo && (
                <div className="flex items-center gap-1.5 mt-2 text-sm text-[var(--success-color)]">
                  <Check className="w-4 h-4" /> Token gültig: <strong>{botInfo.first_name}</strong>{' '}
                  (@
                  {botInfo.username})
                </div>
              )}
            </div>

            {validated && (
              <>
                <div className="mb-5">
                  <label
                    htmlFor="wizard-name"
                    className="block mb-1.5 text-[var(--text-primary)] text-sm font-medium"
                  >
                    Bot Name
                  </label>
                  <Input
                    id="wizard-name"
                    type="text"
                    value={formData.name}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setFormData(prev => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="Name für deinen Bot"
                  />
                </div>

                <div className="mb-5">
                  <label className="block mb-1.5 text-[var(--text-primary)] text-sm font-medium">
                    Bot-Vorlage
                  </label>
                  <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
                    {BOT_TEMPLATES.map(tpl => {
                      const Icon = tpl.icon;
                      const isSelected = formData.template === tpl.id;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          className={cn(
                            'flex flex-col items-center gap-2 py-5 px-4 bg-[var(--bg-card)] border-2 border-[var(--border-color)] rounded-xl cursor-pointer transition-all text-center text-[var(--text-muted)] hover:border-[var(--primary-color)] hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(69,173,255,0.1)] focus-visible:outline-2 focus-visible:outline-[var(--primary-color)] focus-visible:outline-offset-2',
                            isSelected && 'border-[var(--primary-color)] bg-[rgba(69,173,255,0.08)]'
                          )}
                          onClick={() => selectTemplate(tpl.id)}
                        >
                          <Icon
                            className={cn(
                              'w-6 h-6 text-[var(--text-muted)] transition-colors',
                              isSelected && 'text-[var(--primary-color)]'
                            )}
                          />
                          <strong className="text-sm text-[var(--text-primary)]">{tpl.name}</strong>
                          <span className="text-xs leading-[1.4]">{tpl.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ---- STEP 2: Configuration ---- */}
        {currentStep === 2 && (
          <div>
            {formData.template === 'master' ? (
              <>
                <div className="flex items-start gap-3.5 p-4 bg-[rgba(69,173,255,0.08)] border border-[rgba(69,173,255,0.2)] rounded-xl mb-5">
                  <Star className="w-6 h-6 text-[var(--primary-color)] shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-[var(--text-primary)] text-sm mb-1">
                      Arasul Assistent
                    </strong>
                    <p className="m-0 text-[var(--text-muted)] text-sm leading-[1.4]">
                      Globaler RAG-Zugriff auf alle Spaces. Quellen werden in Antworten angezeigt.
                    </p>
                  </div>
                </div>

                <div className="mb-5">
                  <label
                    htmlFor="wizard-prompt"
                    className="block mb-1.5 text-[var(--text-primary)] text-sm font-medium"
                  >
                    System-Prompt
                  </label>
                  <Textarea
                    id="wizard-prompt"
                    value={formData.systemPrompt}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                      setFormData(prev => ({ ...prev, systemPrompt: e.target.value }))
                    }
                    rows={4}
                    placeholder="System-Prompt für den Bot..."
                  />
                </div>
              </>
            ) : (
              <>
                <div className="mb-5">
                  <label
                    htmlFor="wizard-prompt-custom"
                    className="block mb-1.5 text-[var(--text-primary)] text-sm font-medium"
                  >
                    System-Prompt
                  </label>
                  <Textarea
                    id="wizard-prompt-custom"
                    value={formData.systemPrompt}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                      setFormData(prev => ({ ...prev, systemPrompt: e.target.value }))
                    }
                    rows={4}
                    placeholder="Definiere die Persönlichkeit deines Bots..."
                  />
                </div>

                <div className="mb-5">
                  <label className="flex items-center gap-2 cursor-pointer text-[var(--text-primary)] text-sm">
                    <input
                      type="checkbox"
                      checked={formData.ragEnabled}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setFormData(prev => ({ ...prev, ragEnabled: e.target.checked }))
                      }
                      className="w-auto accent-[var(--primary-color)]"
                    />
                    <BookOpen className="w-4 h-4" /> RAG aktivieren (Dokument-Wissen nutzen)
                  </label>
                </div>

                {formData.ragEnabled && spaces.length > 0 && (
                  <div className="mb-5">
                    <label className="block mb-1.5 text-[var(--text-primary)] text-sm font-medium">
                      Space-Zuordnung
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={cn(
                          'py-1.5 px-3 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-full text-[var(--text-muted)] text-xs cursor-pointer transition-all hover:border-[var(--primary-color)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--primary-color)] focus-visible:outline-offset-2',
                          formData.ragSpaceIds === null &&
                            'bg-[rgba(69,173,255,0.15)] border-[var(--primary-color)] text-[var(--primary-color)]'
                        )}
                        onClick={() => setFormData(prev => ({ ...prev, ragSpaceIds: null }))}
                      >
                        Alle Spaces
                      </button>
                      {spaces.map(space => (
                        <button
                          key={space.id}
                          type="button"
                          className={cn(
                            'py-1.5 px-3 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-full text-[var(--text-muted)] text-xs cursor-pointer transition-all hover:border-[var(--primary-color)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--primary-color)] focus-visible:outline-offset-2',
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
                )}
              </>
            )}

            <div className="mb-5">
              <label
                htmlFor="wizard-model"
                className="block mb-1.5 text-[var(--text-primary)] text-sm font-medium"
              >
                LLM-Modell
              </label>
              <Select
                value={formData.llmModel}
                onValueChange={val => setFormData(prev => ({ ...prev, llmModel: val }))}
              >
                <SelectTrigger id="wizard-model" className="w-full">
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
          </div>
        )}

        {/* ---- STEP 3: Connect ---- */}
        {currentStep === 3 && (
          <div>
            {chatDetected ? (
              <div className="flex flex-col items-center text-center p-8">
                <div className="w-16 h-16 flex items-center justify-center bg-[rgba(34,197,94,0.15)] rounded-full text-[var(--success-color)] mb-4">
                  <Check size={32} />
                </div>
                <h3 className="text-[var(--text-primary)] m-0 mb-2">Chat verbunden!</h3>
                {chatInfo && (
                  <p className="text-[var(--text-muted)] text-sm m-0 mb-6">
                    {chatInfo.firstName || chatInfo.username || 'Chat'} (ID: {chatInfo.chatId})
                  </p>
                )}
                <button
                  type="button"
                  className="inline-flex items-center gap-2 py-2 px-5 bg-[var(--primary-color)] text-white border-none rounded-lg text-sm font-medium cursor-pointer transition-all hover:opacity-90 hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 focus-visible:outline-2 focus-visible:outline-[var(--primary-color)] focus-visible:outline-offset-2"
                  onClick={handleCreate}
                  disabled={creating}
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Bot wird erstellt...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" /> Bot erstellen
                    </>
                  )}
                </button>
              </div>
            ) : waitingForChat ? (
              <div className="flex flex-col items-center text-center p-8">
                <div className="text-[var(--primary-color)] mb-4">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
                <h3 className="text-[var(--text-primary)] m-0 mb-2">Warte auf Nachricht...</h3>
                <p className="text-[var(--text-muted)] text-sm m-0 mb-5">
                  Öffne den Bot in Telegram und sende{' '}
                  <code className="bg-[var(--bg-card)] py-0.5 px-2 rounded text-sm">/start</code>
                </p>

                {deepLink && (
                  <a
                    href={sanitizeUrl(deepLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 py-2.5 px-5 bg-[var(--primary-color)] text-white rounded-lg no-underline text-sm font-medium transition-all mb-5 hover:opacity-90 hover:-translate-y-px"
                  >
                    <ExternalLink className="w-4 h-4" /> In Telegram öffnen
                  </a>
                )}

                <div className="flex gap-4 text-xs text-[var(--text-muted)]">
                  <span
                    className={cn(
                      'text-[var(--warning-color)]',
                      wsConnected && 'text-[var(--success-color)]'
                    )}
                  >
                    {wsConnected ? 'WebSocket verbunden' : 'Polling-Modus'}
                  </span>
                  {verificationTimeout !== null && verificationTimeout > 0 && (
                    <span className="text-[var(--text-muted)]">
                      Timeout: {formatTime(verificationTimeout)}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center p-8">
                <p className="text-[var(--text-muted)] text-sm m-0 mb-5">
                  Verbindung wird aufgebaut...
                </p>
                {error && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 py-2 px-4 bg-transparent text-[var(--text-muted)] border border-[var(--border-color)] rounded-lg text-sm cursor-pointer transition-all hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] focus-visible:outline-2 focus-visible:outline-[var(--primary-color)] focus-visible:outline-offset-2"
                    onClick={retryChatVerification}
                  >
                    <RefreshCw className="w-4 h-4" /> Erneut versuchen
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center pt-4 border-t border-[var(--border-color)] mt-6 max-[480px]:flex-col-reverse max-[480px]:gap-2 [&_button]:max-[480px]:w-full [&_button]:max-[480px]:justify-center">
        <button
          type="button"
          className="inline-flex items-center gap-2 py-2 px-4 bg-transparent text-[var(--text-muted)] border border-[var(--border-color)] rounded-lg text-sm cursor-pointer transition-all hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] focus-visible:outline-2 focus-visible:outline-[var(--primary-color)] focus-visible:outline-offset-2"
          onClick={currentStep === 1 ? onCancel : prevStep}
        >
          {currentStep === 1 ? (
            'Abbrechen'
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" /> Zurück
            </>
          )}
        </button>

        {currentStep < 3 && (
          <button
            type="button"
            className="inline-flex items-center gap-2 py-2 px-5 bg-[var(--primary-color)] text-white border-none rounded-lg text-sm font-medium cursor-pointer transition-all hover:opacity-90 hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 focus-visible:outline-2 focus-visible:outline-[var(--primary-color)] focus-visible:outline-offset-2"
            onClick={nextStep}
            disabled={
              validating ||
              (currentStep === 1 && !validated && !formData.token.trim()) ||
              (currentStep === 1 && validated && !formData.template)
            }
          >
            {validating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Validiere...
              </>
            ) : currentStep === 1 && !validated ? (
              <>
                Token prüfen <ChevronRight className="w-4 h-4" />
              </>
            ) : (
              <>
                Weiter <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default BotSetupWizard;
