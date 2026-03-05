/**
 * BotSetupWizard - 3-step wizard for creating Telegram bots
 * Step 1: Token & Template (Arasul Assistent or Custom)
 * Step 2: Configuration (System Prompt, Model, Spaces)
 * Step 3: Connect (WebSocket + Polling fallback)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FiCheck,
  FiChevronRight,
  FiChevronLeft,
  FiAlertCircle,
  FiLoader,
  FiEye,
  FiEyeOff,
  FiSend,
  FiExternalLink,
  FiRefreshCw,
  FiCpu,
  FiBook,
  FiStar,
  FiEdit2,
} from 'react-icons/fi';
import { useApi } from '../../hooks/useApi';
import { sanitizeUrl } from '../../utils/sanitizeUrl';
import './TelegramBots.css';

const STEPS = [
  { id: 1, title: 'Token & Vorlage', description: 'Token eingeben und Vorlage wählen' },
  { id: 2, title: 'Konfiguration', description: 'Bot konfigurieren' },
  { id: 3, title: 'Verbinden', description: 'Bot mit Chat verknüpfen' },
];

const BOT_TEMPLATES = [
  {
    id: 'master',
    name: 'Arasul Assistent',
    description: 'Dein persönlicher KI-Assistent mit Zugriff auf alle Daten',
    icon: FiStar,
    prompt:
      'Du bist der Arasul Assistent – ein intelligenter KI-Assistent mit Zugriff auf alle Dokumente und Wissens-Spaces. Du antwortest auf Deutsch, bist hilfsbereit und nutzt die verfügbaren Daten, um fundierte Antworten zu geben. Bei Bedarf gibst du auch die Quellen deiner Informationen an.',
    ragEnabled: true,
    ragSpaceIds: null, // null = all spaces
  },
  {
    id: 'custom',
    name: 'Custom Bot',
    description: 'Erstelle einen spezialisierten Bot mit eigener Konfiguration',
    icon: FiEdit2,
    prompt: 'Du bist ein hilfreicher Assistent. Du antwortest auf Deutsch.',
    ragEnabled: false,
    ragSpaceIds: [],
  },
];

function BotSetupWizard({ onComplete, onCancel }) {
  const api = useApi();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
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
  const [botInfo, setBotInfo] = useState(null);
  const [error, setError] = useState(null);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [creating, setCreating] = useState(false);

  // Chat verification state
  const [setupToken, setSetupToken] = useState(null);
  const [deepLink, setDeepLink] = useState(null);
  const [chatDetected, setChatDetected] = useState(false);
  const [chatInfo, setChatInfo] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [waitingForChat, setWaitingForChat] = useState(false);
  const [verificationTimeout, setVerificationTimeout] = useState(null);

  // Refs
  const wsRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const timeoutRef = useRef(null);
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
  const connectWebSocket = useCallback(token => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/telegram-app/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      ws.send(JSON.stringify({ type: 'subscribe', setupToken: token }));
    };

    ws.onmessage = event => {
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
    token => {
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
      let data;
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
    } catch (err) {
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
  const selectTemplate = template => {
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
    } catch (err) {
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
        if (prev <= 0) {
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
        } catch {
          /* ignore activation errors */
        }
        onComplete(data.bot);
      }
    } catch (err) {
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

  const formatTime = seconds => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Toggle space selection
  const toggleSpace = spaceId => {
    setFormData(prev => {
      const ids = prev.ragSpaceIds || [];
      const next = ids.includes(spaceId) ? ids.filter(id => id !== spaceId) : [...ids, spaceId];
      return { ...prev, ragSpaceIds: next.length > 0 ? next : [] };
    });
  };

  return (
    <div className="wizard-container">
      {/* Step Indicator */}
      <div className="wizard-steps">
        {STEPS.map(step => (
          <div
            key={step.id}
            className={`wizard-step ${currentStep === step.id ? 'active' : ''} ${currentStep > step.id ? 'completed' : ''}`}
          >
            <div className="wizard-step-number">
              {currentStep > step.id ? <FiCheck /> : step.id}
            </div>
            <div className="wizard-step-info">
              <span className="wizard-step-title">{step.title}</span>
              <span className="wizard-step-desc">{step.description}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="wizard-error">
          <FiAlertCircle />
          <span>{error}</span>
        </div>
      )}

      {/* Step Content */}
      <div className="wizard-content">
        {/* ---- STEP 1: Token & Template ---- */}
        {currentStep === 1 && (
          <div className="wizard-step-content">
            <div className="wizard-form-group">
              <label htmlFor="wizard-token">Bot Token</label>
              <div className="wizard-input-wrapper">
                <input
                  id="wizard-token"
                  type={showToken ? 'text' : 'password'}
                  value={formData.token}
                  onChange={e => {
                    setFormData(prev => ({ ...prev, token: e.target.value }));
                    setValidated(false);
                    setBotInfo(null);
                  }}
                  placeholder="Token von @BotFather eingeben"
                  autoComplete="off"
                  disabled={validating}
                />
                <button
                  type="button"
                  className="wizard-visibility-btn"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
              {validated && botInfo && (
                <div className="wizard-token-valid">
                  <FiCheck /> Token gültig: <strong>{botInfo.first_name}</strong> (@
                  {botInfo.username})
                </div>
              )}
            </div>

            {validated && (
              <>
                <div className="wizard-form-group">
                  <label htmlFor="wizard-name">Bot Name</label>
                  <input
                    id="wizard-name"
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Name für deinen Bot"
                  />
                </div>

                <div className="wizard-form-group">
                  <label>Bot-Vorlage</label>
                  <div className="wizard-template-grid">
                    {BOT_TEMPLATES.map(tpl => {
                      const Icon = tpl.icon;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          className={`wizard-template-card ${formData.template === tpl.id ? 'selected' : ''}`}
                          onClick={() => selectTemplate(tpl.id)}
                        >
                          <Icon className="wizard-template-icon" />
                          <strong>{tpl.name}</strong>
                          <span>{tpl.description}</span>
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
          <div className="wizard-step-content">
            {formData.template === 'master' ? (
              <>
                <div className="wizard-summary-card">
                  <FiStar className="wizard-summary-icon" />
                  <div>
                    <strong>Arasul Assistent</strong>
                    <p>
                      Globaler RAG-Zugriff auf alle Spaces. Quellen werden in Antworten angezeigt.
                    </p>
                  </div>
                </div>

                <div className="wizard-form-group">
                  <label htmlFor="wizard-prompt">System-Prompt</label>
                  <textarea
                    id="wizard-prompt"
                    value={formData.systemPrompt}
                    onChange={e => setFormData(prev => ({ ...prev, systemPrompt: e.target.value }))}
                    rows={4}
                    placeholder="System-Prompt für den Bot..."
                  />
                </div>
              </>
            ) : (
              <>
                <div className="wizard-form-group">
                  <label htmlFor="wizard-prompt-custom">System-Prompt</label>
                  <textarea
                    id="wizard-prompt-custom"
                    value={formData.systemPrompt}
                    onChange={e => setFormData(prev => ({ ...prev, systemPrompt: e.target.value }))}
                    rows={4}
                    placeholder="Definiere die Persönlichkeit deines Bots..."
                  />
                </div>

                <div className="wizard-form-group">
                  <label className="wizard-checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.ragEnabled}
                      onChange={e =>
                        setFormData(prev => ({ ...prev, ragEnabled: e.target.checked }))
                      }
                    />
                    <FiBook /> RAG aktivieren (Dokument-Wissen nutzen)
                  </label>
                </div>

                {formData.ragEnabled && spaces.length > 0 && (
                  <div className="wizard-form-group">
                    <label>Space-Zuordnung</label>
                    <div className="wizard-space-list">
                      <button
                        type="button"
                        className={`wizard-space-tag ${formData.ragSpaceIds === null ? 'selected' : ''}`}
                        onClick={() => setFormData(prev => ({ ...prev, ragSpaceIds: null }))}
                      >
                        Alle Spaces
                      </button>
                      {spaces.map(space => (
                        <button
                          key={space.id}
                          type="button"
                          className={`wizard-space-tag ${formData.ragSpaceIds?.includes(space.id) ? 'selected' : ''}`}
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

            <div className="wizard-form-group">
              <label htmlFor="wizard-model">LLM-Modell</label>
              <select
                id="wizard-model"
                value={formData.llmModel}
                onChange={e => setFormData(prev => ({ ...prev, llmModel: e.target.value }))}
              >
                {ollamaModels.length === 0 && <option value="">Keine Modelle verfügbar</option>}
                {ollamaModels.map(model => {
                  const name = typeof model === 'string' ? model : model.name;
                  return (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  );
                })}
              </select>
              <small>Lokales Modell via Ollama</small>
            </div>
          </div>
        )}

        {/* ---- STEP 3: Connect ---- */}
        {currentStep === 3 && (
          <div className="wizard-step-content">
            {chatDetected ? (
              <div className="wizard-success">
                <div className="wizard-success-icon">
                  <FiCheck size={32} />
                </div>
                <h3>Chat verbunden!</h3>
                {chatInfo && (
                  <p>
                    {chatInfo.firstName || chatInfo.username || 'Chat'} (ID: {chatInfo.chatId})
                  </p>
                )}
                <button
                  type="button"
                  className="wizard-btn-primary"
                  onClick={handleCreate}
                  disabled={creating}
                >
                  {creating ? (
                    <>
                      <FiLoader className="spinning" /> Bot wird erstellt...
                    </>
                  ) : (
                    <>
                      <FiCheck /> Bot erstellen
                    </>
                  )}
                </button>
              </div>
            ) : waitingForChat ? (
              <div className="wizard-waiting">
                <div className="wizard-waiting-spinner">
                  <FiLoader className="spinning" size={24} />
                </div>
                <h3>Warte auf Nachricht...</h3>
                <p>
                  Öffne den Bot in Telegram und sende <code>/start</code>
                </p>

                {deepLink && (
                  <a
                    href={sanitizeUrl(deepLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="wizard-deep-link"
                  >
                    <FiExternalLink /> In Telegram öffnen
                  </a>
                )}

                <div className="wizard-connection-info">
                  <span className={`wizard-ws-status ${wsConnected ? 'connected' : ''}`}>
                    {wsConnected ? 'WebSocket verbunden' : 'Polling-Modus'}
                  </span>
                  {verificationTimeout !== null && verificationTimeout > 0 && (
                    <span className="wizard-timeout">
                      Timeout: {formatTime(verificationTimeout)}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="wizard-waiting">
                <p>Verbindung wird aufgebaut...</p>
                {error && (
                  <button
                    type="button"
                    className="wizard-btn-secondary"
                    onClick={retryChatVerification}
                  >
                    <FiRefreshCw /> Erneut versuchen
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="wizard-footer">
        <button
          type="button"
          className="wizard-btn-secondary"
          onClick={currentStep === 1 ? onCancel : prevStep}
        >
          {currentStep === 1 ? (
            'Abbrechen'
          ) : (
            <>
              <FiChevronLeft /> Zurück
            </>
          )}
        </button>

        {currentStep < 3 && (
          <button
            type="button"
            className="wizard-btn-primary"
            onClick={nextStep}
            disabled={
              validating ||
              (currentStep === 1 && !validated && !formData.token.trim()) ||
              (currentStep === 1 && validated && !formData.template)
            }
          >
            {validating ? (
              <>
                <FiLoader className="spinning" /> Validiere...
              </>
            ) : currentStep === 1 && !validated ? (
              <>
                Token prüfen <FiChevronRight />
              </>
            ) : (
              <>
                Weiter <FiChevronRight />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default BotSetupWizard;
