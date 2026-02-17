/**
 * BotSetupWizard - Multi-step wizard for creating a new Telegram bot
 * With WebSocket integration for real-time chat detection
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
  FiCloud,
} from 'react-icons/fi';
import { API_BASE, getAuthHeaders } from '../../config/api';
import './TelegramBots.css';

// Debug flag - set to false in production
const DEBUG = process.env.NODE_ENV === 'development';

const STEPS = [
  { id: 1, title: 'Bot-Token', description: 'Token von @BotFather eingeben' },
  { id: 2, title: 'KI-Anbieter', description: 'KI-Anbieter auswählen' },
  { id: 3, title: 'Persönlichkeit', description: 'Bot-Persönlichkeit definieren' },
  { id: 4, title: 'Chat verbinden', description: 'Bot mit Chat verknüpfen' },
];

const PERSONALITY_TEMPLATES = [
  {
    id: 'assistant',
    name: 'Freundlicher Assistent',
    icon: FiCheck,
    prompt:
      'Du bist ein freundlicher und hilfreicher KI-Assistent. Du antwortest immer auf Deutsch, bist geduldig und erklärst Dinge verständlich. Du hilfst bei alltäglichen Fragen, Recherchen und Aufgaben.',
  },
  {
    id: 'support',
    name: 'Technischer Support',
    icon: FiCpu,
    prompt:
      'Du bist ein technischer Support-Assistent. Du hilfst bei IT-Problemen, Software-Fragen und technischen Anleitungen. Du gibst klare Schritt-für-Schritt-Anweisungen und fragst bei Bedarf nach Details.',
  },
  {
    id: 'creative',
    name: 'Kreativ-Schreiber',
    icon: FiSend,
    prompt:
      'Du bist ein kreativer Schreibassistent. Du hilfst beim Verfassen von Texten, E-Mails, Geschichten und anderen kreativen Inhalten. Du bist einfallsreich, achtest auf guten Stil und passt den Ton an den Kontext an.',
  },
  {
    id: 'admin',
    name: 'System-Administrator',
    icon: FiCloud,
    prompt:
      'Du bist ein System-Administrator-Assistent für einen Jetson AGX Orin. Du hilfst bei Linux-Befehlen, Docker-Container-Verwaltung, Netzwerk-Konfiguration und System-Monitoring. Du gibst präzise technische Antworten.',
  },
];

function BotSetupWizard({ onComplete, onCancel }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    token: '',
    llmProvider: 'ollama',
    llmModel: '',
    systemPrompt: 'Du bist ein hilfreicher Assistent.',
    claudeApiKey: '',
  });
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showToken, setShowToken] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [botInfo, setBotInfo] = useState(null);
  const [error, setError] = useState(null);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [claudeModels, setClaudeModels] = useState([]);
  const [creating, setCreating] = useState(false);

  // Chat verification state
  const [setupToken, setSetupToken] = useState(null);
  const [deepLink, setDeepLink] = useState(null);
  const [chatDetected, setChatDetected] = useState(false);
  const [chatInfo, setChatInfo] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [waitingForChat, setWaitingForChat] = useState(false);
  const [verificationTimeout, setVerificationTimeout] = useState(null);

  // Refs for WebSocket and polling
  const wsRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const timeoutRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Close WebSocket
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      // Clear polling interval
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      // Clear timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  // Connect to WebSocket for real-time chat detection
  const connectWebSocket = useCallback(token => {
    // Determine WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/telegram-app/ws`;

    DEBUG && console.log('[Wizard] Connecting to WebSocket:', wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      DEBUG && console.log('[Wizard] WebSocket connected');
      setWsConnected(true);

      // Subscribe to the setup token
      ws.send(
        JSON.stringify({
          type: 'subscribe',
          setupToken: token,
        })
      );
    };

    ws.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        DEBUG && console.log('[Wizard] WebSocket message:', data);

        if (data.type === 'setup_complete') {
          // Chat detected!
          DEBUG && console.log('[Wizard] Chat detected via WebSocket:', data);
          setChatDetected(true);
          setChatInfo({
            chatId: data.chatId,
            username: data.chatUsername,
            firstName: data.chatFirstName,
            type: data.chatType || 'private',
          });
          setWaitingForChat(false);

          // Stop polling
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        } else if (data.type === 'subscribed') {
          DEBUG && console.log('[Wizard] Subscribed to token:', data.setupToken);
        } else if (data.type === 'error') {
          console.error('[Wizard] WebSocket error:', data.message || data.error);
        }
      } catch (err) {
        console.error('[Wizard] Error parsing WebSocket message:', err);
      }
    };

    ws.onerror = error => {
      console.error('[Wizard] WebSocket error:', error);
      setWsConnected(false);
      // Start polling as fallback
      startPolling(token);
    };

    ws.onclose = () => {
      DEBUG && console.log('[Wizard] WebSocket closed');
      setWsConnected(false);
      wsRef.current = null;
    };

    return ws;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling fallback for chat detection
  const startPolling = useCallback(token => {
    if (pollingIntervalRef.current) return; // Already polling

    DEBUG && console.log('[Wizard] Starting polling fallback');

    const poll = async () => {
      try {
        const response = await fetch(`${API_BASE}/telegram-app/zero-config/status/${token}`, {
          headers: getAuthHeaders(),
        });

        if (response.ok) {
          const data = await response.json();
          DEBUG && console.log('[Wizard] Poll status:', data.status);

          if (data.status === 'completed' && data.chatId) {
            setChatDetected(true);
            setChatInfo({
              chatId: data.chatId,
              username: data.chatUsername,
              firstName: data.chatFirstName,
              type: 'private',
            });
            setWaitingForChat(false);

            // Stop polling
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
          }
        }
      } catch (err) {
        console.error('[Wizard] Polling error:', err);
      }
    };

    // Poll every 2 seconds
    pollingIntervalRef.current = setInterval(poll, 2000);

    // Initial poll
    poll();
  }, []);

  // Parse error response with user-friendly messages
  const parseErrorMessage = useCallback((error, context = '') => {
    const message = error?.message || String(error);

    // Network errors
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
      return 'Netzwerkfehler: Bitte prüfe deine Internetverbindung.';
    }

    // Rate limiting
    if (
      message.includes('429') ||
      message.includes('rate limit') ||
      message.includes('Too Many Requests')
    ) {
      return 'Zu viele Anfragen. Bitte warte einen Moment und versuche es erneut.';
    }

    // Auth errors
    if (
      message.includes('401') ||
      message.includes('Unauthorized') ||
      message.includes('nicht autorisiert')
    ) {
      return 'Sitzung abgelaufen. Bitte melde dich erneut an.';
    }

    // Token validation errors
    if (message.includes('Bot-Token ungültig') || message.includes('invalid token')) {
      return 'Bot-Token ungültig. Bitte überprüfe das Token von @BotFather.';
    }

    // Session errors
    if (message.includes('Session nicht gefunden') || message.includes('abgelaufen')) {
      return 'Setup-Session abgelaufen. Bitte starte den Vorgang neu.';
    }

    // Timeout
    if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
      return `Zeitüberschreitung bei ${context}. Bitte versuche es erneut.`;
    }

    // Default: return original message or generic error
    return message || 'Ein unerwarteter Fehler ist aufgetreten.';
  }, []);

  // Initialize chat verification (Step 4)
  const initChatVerification = useCallback(async () => {
    setWaitingForChat(true);
    setError(null);

    try {
      const headers = {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      };

      // Step 1: Create setup session with timeout
      DEBUG && console.log('[Wizard] Creating setup session...');
      const initController = new AbortController();
      const initTimeout = setTimeout(() => initController.abort(), 15000);

      let initResponse;
      try {
        initResponse = await fetch(`${API_BASE}/telegram-app/zero-config/init`, {
          method: 'POST',
          headers,
          signal: initController.signal,
        });
      } finally {
        clearTimeout(initTimeout);
      }

      if (!initResponse.ok) {
        const errorData = await initResponse.json().catch(() => ({}));
        throw new Error(errorData.error || `Server-Fehler (${initResponse.status})`);
      }

      const initData = await initResponse.json();
      const token = initData.setupToken;
      if (!token) {
        throw new Error('Setup-Token wurde nicht generiert');
      }
      setSetupToken(token);

      DEBUG && console.log('[Wizard] Setup session created:', token.substring(0, 8) + '...');

      // Step 2: Connect WebSocket and subscribe
      connectWebSocket(token);

      // Step 3: Validate token and get deep link with timeout
      DEBUG && console.log('[Wizard] Validating bot token...');
      const tokenController = new AbortController();
      const tokenTimeout = setTimeout(() => tokenController.abort(), 20000);

      let tokenResponse;
      try {
        tokenResponse = await fetch(`${API_BASE}/telegram-app/zero-config/token`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            setupToken: token,
            botToken: formData.token,
          }),
          signal: tokenController.signal,
        });
      } finally {
        clearTimeout(tokenTimeout);
      }

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json().catch(() => ({}));
        throw new Error(errorData.error || `Validierung fehlgeschlagen (${tokenResponse.status})`);
      }

      const tokenData = await tokenResponse.json();
      if (!tokenData.deepLink) {
        throw new Error('Deep-Link konnte nicht generiert werden');
      }
      setDeepLink(tokenData.deepLink);

      DEBUG && console.log('[Wizard] Deep link generated:', tokenData.deepLink);

      // Set timeout for verification (5 minutes)
      timeoutRef.current = setTimeout(
        () => {
          if (!chatDetected) {
            setError(
              'Zeitüberschreitung: Keine Nachricht vom Bot empfangen. Bitte versuche es erneut.'
            );
            setWaitingForChat(false);
          }
        },
        5 * 60 * 1000
      );

      setVerificationTimeout(5 * 60); // 5 minutes in seconds
    } catch (err) {
      console.error('[Wizard] Chat verification error:', err);

      // Handle abort errors specifically
      if (err.name === 'AbortError') {
        setError(
          'Verbindungs-Timeout. Bitte prüfe deine Internetverbindung und versuche es erneut.'
        );
      } else {
        setError(parseErrorMessage(err, 'Chat-Verifizierung'));
      }
      setWaitingForChat(false);
    }
  }, [formData.token, connectWebSocket, chatDetected, parseErrorMessage]);

  // Countdown timer for timeout display
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
    // Cleanup previous attempt
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

    setChatDetected(false);
    setChatInfo(null);
    setSetupToken(null);
    setDeepLink(null);
    setError(null);

    // Start new verification
    initChatVerification();
  }, [initChatVerification]);

  // Fetch available models
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const [ollamaRes, claudeRes] = await Promise.all([
          fetch(`${API_BASE}/telegram-bots/models/ollama`, { headers: getAuthHeaders() }),
          fetch(`${API_BASE}/telegram-bots/models/claude`, { headers: getAuthHeaders() }),
        ]);

        if (ollamaRes.ok) {
          const data = await ollamaRes.json();
          setOllamaModels(data.models || []);
          if (data.models?.length > 0 && !formData.llmModel) {
            setFormData(prev => ({ ...prev, llmModel: data.models[0].name || data.models[0] }));
          }
        }

        if (claudeRes.ok) {
          const data = await claudeRes.json();
          setClaudeModels(data.models || []);
        }
      } catch (err) {
        console.error('Error fetching models:', err);
      }
    };

    fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.llmModel]);

  // Validate bot token with retry logic
  const validateToken = async () => {
    const tokenTrimmed = formData.token?.trim();

    if (!tokenTrimmed) {
      setError('Bitte gib ein Bot-Token ein');
      return;
    }

    // Basic token format validation (botId:secretPart)
    const tokenRegex = /^\d+:[A-Za-z0-9_-]+$/;
    if (!tokenRegex.test(tokenTrimmed)) {
      setError('Ungültiges Token-Format. Das Token sollte das Format "123456789:ABCdef..." haben.');
      return;
    }

    setValidating(true);
    setError(null);

    const maxRetries = 2;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(`${API_BASE}/telegram-bots/validate-token`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ token: tokenTrimmed }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        const data = await response.json();

        if (data.valid) {
          setValidated(true);
          setBotInfo(data.botInfo);
          setFormData(prev => ({
            ...prev,
            name: data.botInfo.first_name || prev.name,
            token: tokenTrimmed, // Use trimmed token
          }));
          setValidating(false);
          return; // Success!
        } else {
          // Specific error messages for common issues
          let errorMessage = data.error || 'Token ist ungültig';

          if (errorMessage.includes('Unauthorized') || errorMessage.includes('401')) {
            errorMessage =
              'Token ist ungültig oder wurde widerrufen. Bitte erstelle ein neues Token bei @BotFather.';
          } else if (errorMessage.includes('bot was blocked')) {
            errorMessage = 'Dieser Bot wurde blockiert. Bitte kontaktiere den Telegram-Support.';
          }

          setError(errorMessage);
          setValidating(false);
          return;
        }
      } catch (err) {
        lastError = err;

        // Don't retry on abort
        if (err.name === 'AbortError') {
          setError('Zeitüberschreitung bei der Validierung. Bitte prüfe deine Internetverbindung.');
          setValidating(false);
          return;
        }

        // Retry on network errors
        if (attempt < maxRetries) {
          DEBUG &&
            console.log(`[Wizard] Token validation attempt ${attempt + 1} failed, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
      }
    }

    // All retries failed
    console.error('[Wizard] Token validation failed after retries:', lastError);
    setError(parseErrorMessage(lastError, 'Token-Validierung'));
    setValidating(false);
  };

  // Handle step navigation
  const nextStep = () => {
    if (currentStep === 1 && !validated) {
      validateToken();
      return;
    }
    if (currentStep < STEPS.length) {
      const newStep = currentStep + 1;
      setCurrentStep(newStep);

      // Initialize chat verification when entering step 4
      if (newStep === 4 && !chatDetected && !waitingForChat) {
        initChatVerification();
      }
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Create bot
  const handleCreate = async () => {
    setCreating(true);
    setError(null);

    try {
      const payload = {
        name: formData.name,
        token: formData.token,
        llmProvider: formData.llmProvider,
        llmModel: formData.llmModel,
        systemPrompt: formData.systemPrompt,
      };

      if (formData.llmProvider === 'claude' && formData.claudeApiKey) {
        payload.claudeApiKey = formData.claudeApiKey;
      }

      // Include chat info if available
      if (chatInfo) {
        payload.defaultChatId = chatInfo.chatId;
        payload.defaultChatUsername = chatInfo.username;
      }

      // Include setup token for completing zero-config flow
      if (setupToken) {
        payload.setupToken = setupToken;
      }

      const response = await fetch(`${API_BASE}/telegram-bots`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Fehler beim Erstellen');
      }

      const data = await response.json();

      // Complete zero-config flow if we have a setup token
      if (setupToken && chatInfo) {
        try {
          await fetch(`${API_BASE}/telegram-app/zero-config/complete`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ setupToken }),
          });
        } catch (completeErr) {
          console.warn('[Wizard] Could not complete zero-config flow:', completeErr);
        }
      }

      // Cleanup
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      onComplete(data.bot);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="wizard-step-content">
            <div className="wizard-info-box">
              <h4>Erstelle deinen Bot in Telegram</h4>
              <ol className="wizard-numbered-steps">
                <li>
                  Öffne Telegram und suche nach <strong>@BotFather</strong>
                </li>
                <li>
                  Sende <code>/newbot</code> und folge den Anweisungen
                </li>
                <li>
                  Kopiere das Token (sieht so aus: <code>123456789:ABCdef...</code>)
                </li>
              </ol>
            </div>

            <div className="wizard-form-group">
              <label>Bot-Token</label>
              <div className="wizard-input-wrapper">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={formData.token}
                  onChange={e => {
                    setFormData(prev => ({ ...prev, token: e.target.value }));
                    setValidated(false);
                    setBotInfo(null);
                  }}
                  placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                  disabled={validating}
                />
                <button
                  type="button"
                  className="wizard-toggle-visibility"
                  onClick={() => setShowToken(!showToken)}
                  aria-label={showToken ? 'Token verbergen' : 'Token anzeigen'}
                >
                  {showToken ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
              <small>
                Das Token erhältst du von <strong>@BotFather</strong> nach dem Erstellen eines Bots
              </small>
            </div>

            {validated && botInfo && (
              <div className="wizard-success-box">
                <FiCheck className="wizard-success-icon" />
                <div>
                  <strong>{botInfo.first_name}</strong>
                  <span className="wizard-bot-username">@{botInfo.username}</span>
                </div>
              </div>
            )}

            <div className="wizard-form-group">
              <label>Bot Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Mein Assistent"
              />
              <small>Wie soll dein Bot heißen? Kann später geändert werden.</small>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="wizard-step-content">
            <div className="wizard-form-group">
              <label>Wie soll dein Bot denken?</label>
              <div className="wizard-provider-options">
                <button
                  type="button"
                  className={`wizard-provider-option ${formData.llmProvider === 'ollama' ? 'selected' : ''}`}
                  onClick={() => {
                    setFormData(prev => ({
                      ...prev,
                      llmProvider: 'ollama',
                      llmModel: ollamaModels[0]?.name || ollamaModels[0] || '',
                    }));
                  }}
                >
                  <div className="provider-option-header">
                    <FiCpu className="provider-option-icon" />
                    <span className="provider-option-name">Lokale KI</span>
                    <span className="provider-option-badge local">Empfohlen</span>
                  </div>
                  <span className="provider-option-desc">
                    Läuft direkt auf deinem Jetson (Ollama)
                  </span>
                  <ul className="provider-option-pros">
                    <li>Kostenlos nutzbar</li>
                    <li>Daten bleiben privat</li>
                    <li>Funktioniert offline</li>
                  </ul>
                </button>
                <button
                  type="button"
                  className={`wizard-provider-option ${formData.llmProvider === 'claude' ? 'selected' : ''}`}
                  onClick={() => {
                    setFormData(prev => ({
                      ...prev,
                      llmProvider: 'claude',
                      llmModel:
                        claudeModels[0]?.id || claudeModels[0] || 'claude-3-sonnet-20240229',
                    }));
                  }}
                >
                  <div className="provider-option-header">
                    <FiCloud className="provider-option-icon" />
                    <span className="provider-option-name">Cloud KI</span>
                    <span className="provider-option-badge cloud">Cloud</span>
                  </div>
                  <span className="provider-option-desc">Anthropic Claude über das Internet</span>
                  <ul className="provider-option-pros">
                    <li>Leistungsstärker</li>
                    <li>Schnellere Antworten</li>
                    <li className="provider-option-con">API-Key nötig</li>
                  </ul>
                </button>
              </div>
            </div>

            <div className="wizard-form-group">
              <label>Modell</label>
              <select
                value={formData.llmModel}
                onChange={e => setFormData(prev => ({ ...prev, llmModel: e.target.value }))}
              >
                {formData.llmProvider === 'ollama' ? (
                  ollamaModels.length > 0 ? (
                    ollamaModels.map(model => (
                      <option key={model.name || model} value={model.name || model}>
                        {model.name || model}
                      </option>
                    ))
                  ) : (
                    <option value="">Keine Modelle verfügbar</option>
                  )
                ) : (
                  claudeModels.map(model => (
                    <option key={model.id || model} value={model.id || model}>
                      {model.name || model.id || model}
                    </option>
                  ))
                )}
              </select>
              <small>Welches Modell soll die Antworten generieren?</small>
            </div>

            {formData.llmProvider === 'claude' && (
              <div className="wizard-form-group">
                <label>Claude API Key</label>
                <div className="wizard-input-wrapper">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={formData.claudeApiKey}
                    onChange={e => setFormData(prev => ({ ...prev, claudeApiKey: e.target.value }))}
                    placeholder="sk-ant-api03-..."
                  />
                  <button
                    type="button"
                    className="wizard-toggle-visibility"
                    onClick={() => setShowApiKey(!showApiKey)}
                    aria-label={showApiKey ? 'API Key verbergen' : 'API Key anzeigen'}
                  >
                    {showApiKey ? <FiEyeOff /> : <FiEye />}
                  </button>
                </div>
                <small>
                  API Key von <strong>console.anthropic.com</strong>
                </small>
              </div>
            )}
          </div>
        );

      case 3:
        return (
          <div className="wizard-step-content">
            <div className="wizard-form-group">
              <label>Wähle eine Vorlage</label>
              <div className="wizard-template-grid">
                {PERSONALITY_TEMPLATES.map(template => {
                  const Icon = template.icon;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      className={`wizard-template-card ${selectedTemplate === template.id ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedTemplate(template.id);
                        setFormData(prev => ({ ...prev, systemPrompt: template.prompt }));
                      }}
                    >
                      <Icon className="wizard-template-icon" />
                      <span className="wizard-template-name">{template.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="wizard-form-group">
              <label>Basis-Kontext</label>
              <textarea
                value={formData.systemPrompt}
                onChange={e => {
                  setFormData(prev => ({ ...prev, systemPrompt: e.target.value }));
                  // Deselect template when user edits manually
                  const matchingTemplate = PERSONALITY_TEMPLATES.find(
                    t => t.prompt === e.target.value
                  );
                  setSelectedTemplate(matchingTemplate ? matchingTemplate.id : null);
                }}
                placeholder="Beschreibe wer dein Bot ist und wie er antworten soll..."
                rows={6}
              />
              <small>
                Dieser Text wird bei jedem Gespräch geladen und definiert, wie dein Bot antwortet.
                Du kannst die Vorlage oben anpassen oder deinen eigenen Text schreiben.
              </small>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="wizard-step-content">
            {chatDetected && chatInfo ? (
              // Chat erfolgreich erkannt
              <div className="wizard-chat-success">
                <div className="wizard-success-box large">
                  <FiCheck className="wizard-success-icon" />
                  <div>
                    <strong>Chat verbunden!</strong>
                    <p className="wizard-chat-info">
                      {chatInfo.firstName && <span>{chatInfo.firstName}</span>}
                      {chatInfo.username && (
                        <span className="wizard-chat-username">@{chatInfo.username}</span>
                      )}
                      <span className="wizard-chat-id">ID: {chatInfo.chatId}</span>
                    </p>
                  </div>
                </div>

                <div className="wizard-summary">
                  <h4>Zusammenfassung</h4>
                  <div className="wizard-summary-item">
                    <span className="wizard-summary-label">Bot:</span>
                    <span className="wizard-summary-value">{formData.name}</span>
                  </div>
                  <div className="wizard-summary-item">
                    <span className="wizard-summary-label">Username:</span>
                    <span className="wizard-summary-value">@{botInfo?.username}</span>
                  </div>
                  <div className="wizard-summary-item">
                    <span className="wizard-summary-label">KI-Anbieter:</span>
                    <span className="wizard-summary-value">
                      {formData.llmProvider === 'ollama'
                        ? 'Lokale KI (Ollama)'
                        : 'Cloud KI (Claude)'}
                    </span>
                  </div>
                  <div className="wizard-summary-item">
                    <span className="wizard-summary-label">Modell:</span>
                    <span className="wizard-summary-value">{formData.llmModel}</span>
                  </div>
                  <div className="wizard-summary-item">
                    <span className="wizard-summary-label">Chat:</span>
                    <span className="wizard-summary-value">{chatInfo.chatId}</span>
                  </div>
                </div>
              </div>
            ) : waitingForChat ? (
              // Warte auf Chat
              <div className="wizard-waiting-chat">
                <div className="wizard-waiting-icon">
                  <FiSend size={48} />
                </div>
                <h4>Warte auf Verbindung...</h4>
                <p>
                  Öffne Telegram und sende <strong>/start</strong> an deinen Bot:
                </p>

                {deepLink && (
                  <div className="wizard-deeplink-box">
                    <a
                      href={deepLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="wizard-deeplink-btn"
                    >
                      <FiExternalLink />@{botInfo?.username} öffnen
                    </a>
                    <span className="wizard-deeplink-hint">
                      oder suche nach @{botInfo?.username} in Telegram
                    </span>
                  </div>
                )}

                <div className="wizard-status-bar">
                  <div className="wizard-status-indicator">
                    <FiLoader className="spinning" />
                    <span>{wsConnected ? 'WebSocket verbunden' : 'Verbinde...'}</span>
                  </div>
                  {verificationTimeout !== null && verificationTimeout > 0 && (
                    <span className="wizard-timeout">
                      {Math.floor(verificationTimeout / 60)}:
                      {(verificationTimeout % 60).toString().padStart(2, '0')}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  className="wizard-btn secondary small"
                  onClick={retryChatVerification}
                >
                  <FiRefreshCw />
                  Neu versuchen
                </button>
              </div>
            ) : (
              // Bereit zum Starten
              <div className="wizard-ready-verify">
                <div className="wizard-info-box">
                  <h4>Chat-Verbindung herstellen</h4>
                  <p>
                    Im nächsten Schritt wirst du gebeten, <strong>/start</strong> an deinen Bot zu
                    senden. Dadurch wird der Bot mit deinem Chat verknüpft und kann dir Nachrichten
                    senden.
                  </p>
                </div>
                <button type="button" className="wizard-btn primary" onClick={initChatVerification}>
                  <FiSend />
                  Verbindung starten
                </button>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="bot-setup-wizard">
      {/* Progress Steps */}
      <div className="wizard-progress">
        {STEPS.map((step, index) => (
          <div
            key={step.id}
            className={`wizard-progress-step ${currentStep === step.id ? 'active' : ''} ${currentStep > step.id ? 'completed' : ''}`}
          >
            <div className="wizard-progress-number">
              {currentStep > step.id ? <FiCheck /> : step.id}
            </div>
            <div className="wizard-progress-info">
              <span className="wizard-progress-title">{step.title}</span>
              <span className="wizard-progress-desc">{step.description}</span>
            </div>
            {index < STEPS.length - 1 && <div className="wizard-progress-connector" />}
          </div>
        ))}
      </div>

      {/* Step Content */}
      {renderStepContent()}

      {/* Error Message */}
      {error && (
        <div className="wizard-error">
          <FiAlertCircle />
          <span>{error}</span>
        </div>
      )}

      {/* Actions */}
      <div className="wizard-actions">
        <button type="button" className="wizard-btn secondary" onClick={onCancel}>
          Abbrechen
        </button>
        <div className="wizard-actions-right">
          {currentStep > 1 && (
            <button
              type="button"
              className="wizard-btn secondary"
              onClick={prevStep}
              disabled={waitingForChat}
            >
              <FiChevronLeft />
              Zurück
            </button>
          )}
          {currentStep < STEPS.length ? (
            <button
              type="button"
              className="wizard-btn primary"
              onClick={nextStep}
              disabled={validating || (currentStep === 1 && !formData.token)}
            >
              {validating ? (
                <>
                  <FiLoader className="spinning" />
                  Validiere...
                </>
              ) : currentStep === 1 && !validated ? (
                'Token prüfen'
              ) : (
                <>
                  Weiter
                  <FiChevronRight />
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              className="wizard-btn primary"
              onClick={handleCreate}
              disabled={creating || (currentStep === 4 && !chatDetected)}
            >
              {creating ? (
                <>
                  <FiLoader className="spinning" />
                  Erstelle...
                </>
              ) : (
                <>
                  <FiCheck />
                  Bot erstellen
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default BotSetupWizard;
