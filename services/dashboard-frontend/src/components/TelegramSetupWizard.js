import React, { useState, useEffect, useRef } from 'react';
import {
  FiSend,
  FiKey,
  FiSmartphone,
  FiCheck,
  FiChevronRight,
  FiChevronLeft,
  FiExternalLink,
  FiRefreshCw,
  FiAlertCircle,
  FiCopy,
  FiCheckCircle
} from 'react-icons/fi';
import { API_BASE } from '../config/api';

/**
 * TelegramSetupWizard - Zero-Config Magic Setup
 * 4 Steps:
 * 1. Create bot via @BotFather
 * 2. Enter bot token
 * 3. Connect chat (QR code / link)
 * 4. Complete with test message
 */
function TelegramSetupWizard({ onComplete }) {
  const [step, setStep] = useState(1);
  const [setupToken, setSetupToken] = useState(null);
  const [botToken, setBotToken] = useState('');
  const [botInfo, setBotInfo] = useState(null);
  const [deepLink, setDeepLink] = useState(null);
  const [chatInfo, setChatInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const wsRef = useRef(null);
  const pollIntervalRef = useRef(null);

  // Initialize setup session on mount
  useEffect(() => {
    initSetup();

    return () => {
      // Cleanup WebSocket and polling on unmount
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Initialize setup session
  const initSetup = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/telegram-app/zero-config/init`, {
        method: 'POST',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Setup konnte nicht gestartet werden');
      }

      const data = await response.json();
      setSetupToken(data.setupToken);

    } catch (err) {
      console.error('Error initializing setup:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Validate bot token
  const validateToken = async () => {
    if (!botToken.trim()) {
      setError('Bitte Bot-Token eingeben');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/telegram-app/zero-config/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          setupToken,
          botToken: botToken.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Token ungültig');
      }

      setBotInfo(data.botInfo);
      setDeepLink(data.deepLink);
      setStep(3);

      // Start polling for chat detection
      startChatDetection();

    } catch (err) {
      console.error('Error validating token:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Start WebSocket/Polling for chat detection
  const startChatDetection = () => {
    // Try WebSocket first
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/api/telegram-app/ws`;

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        // WebSocket connected for chat detection');
        wsRef.current.send(JSON.stringify({
          type: 'subscribe',
          setupToken
        }));
      };

      wsRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.status === 'completed') {
          setChatInfo(data);
          setStep(4);
          wsRef.current.close();
        }
      };

      wsRef.current.onerror = () => {
        // WebSocket failed, falling back to polling');
        startPolling();
      };

    } catch (err) {
      // WebSocket not available, using polling');
      startPolling();
    }
  };

  // Fallback polling for chat detection
  const startPolling = () => {
    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(
          `${API_BASE}/telegram-app/zero-config/status/${setupToken}`,
          { credentials: 'include' }
        );

        if (response.ok) {
          const data = await response.json();

          if (data.status === 'completed') {
            setChatInfo({
              chatId: data.chatId,
              username: data.chatUsername,
              firstName: data.chatFirstName
            });
            setStep(4);
            clearInterval(pollIntervalRef.current);
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 3000); // Poll every 3 seconds
  };

  // Complete setup
  const completeSetup = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/telegram-app/zero-config/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ setupToken })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Setup konnte nicht abgeschlossen werden');
      }

      onComplete();

    } catch (err) {
      console.error('Error completing setup:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Progress indicator
  const ProgressBar = () => (
    <div className="setup-progress">
      {[1, 2, 3, 4].map(s => (
        <div
          key={s}
          className={`progress-step ${step >= s ? 'active' : ''} ${step === s ? 'current' : ''}`}
        >
          <div className="step-number">
            {step > s ? <FiCheck /> : s}
          </div>
          <span className="step-label">
            {s === 1 && 'Bot erstellen'}
            {s === 2 && 'Token'}
            {s === 3 && 'Verbinden'}
            {s === 4 && 'Fertig'}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="telegram-setup-wizard">
      <div className="setup-wizard-container">
        <header className="setup-header">
          <FiSend className="setup-icon" />
          <h1>Telegram Bot einrichten</h1>
          <p>Schnelle Einrichtung - In weniger als 60 Sekunden fertig</p>
        </header>

        <ProgressBar />

        {/* Error banner */}
        {error && (
          <div className="setup-error">
            <FiAlertCircle />
            <span>{error}</span>
            <button onClick={() => setError(null)}>&times;</button>
          </div>
        )}

        {/* Step 1: Create Bot */}
        {step === 1 && (
          <div className="setup-step">
            <div className="step-content">
              <div className="step-icon-large">
                <FiSend />
              </div>
              <h2>Bot erstellen</h2>
              <p>Erstelle einen neuen Telegram Bot bei @BotFather</p>

              <div className="step-instructions">
                <div className="instruction-item">
                  <span className="instruction-number">1</span>
                  <span>Öffne Telegram und suche nach <code>@BotFather</code></span>
                </div>
                <div className="instruction-item">
                  <span className="instruction-number">2</span>
                  <span>Sende den Befehl <code>/newbot</code></span>
                </div>
                <div className="instruction-item">
                  <span className="instruction-number">3</span>
                  <span>Folge den Anweisungen und kopiere den Bot-Token</span>
                </div>
              </div>

              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-large"
              >
                <FiExternalLink /> @BotFather öffnen
              </a>
            </div>

            <div className="step-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setStep(2)}
              >
                Ich habe einen Token <FiChevronRight />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Enter Token */}
        {step === 2 && (
          <div className="setup-step">
            <div className="step-content">
              <div className="step-icon-large">
                <FiKey />
              </div>
              <h2>Bot-Token eingeben</h2>
              <p>Füge das Token von @BotFather ein</p>

              <div className="token-input-container">
                <input
                  type="password"
                  placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz..."
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  className="token-input"
                  autoComplete="off"
                  disabled={loading}
                />
                <small>
                  Der Token sieht aus wie: <code>123456789:ABC-DEF...</code>
                </small>
              </div>
            </div>

            <div className="step-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setStep(1)}
              >
                <FiChevronLeft /> Zurück
              </button>
              <button
                className="btn btn-primary"
                onClick={validateToken}
                disabled={!botToken.trim() || loading}
              >
                {loading ? (
                  <><FiRefreshCw className="spin" /> Validiere...</>
                ) : (
                  <>Token prüfen <FiChevronRight /></>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Connect Chat */}
        {step === 3 && (
          <div className="setup-step">
            <div className="step-content">
              <div className="step-icon-large success">
                <FiSmartphone />
              </div>
              <h2>Bot verbinden</h2>
              <p>
                Öffne <strong>@{botInfo?.username}</strong> und sende <code>/start</code>
              </p>

              <div className="connect-options">
                {/* QR Code placeholder - would need a QR library */}
                <div className="qr-placeholder">
                  <div className="qr-code">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(deepLink)}`}
                      alt="QR Code"
                    />
                  </div>
                  <p>Scanne mit deinem Smartphone</p>
                </div>

                <div className="connect-divider">
                  <span>oder</span>
                </div>

                <div className="connect-link">
                  <a
                    href={deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-large"
                  >
                    <FiExternalLink /> Bot im Browser öffnen
                  </a>

                  <button
                    className="btn btn-icon"
                    onClick={() => copyToClipboard(deepLink)}
                    title="Link kopieren"
                  >
                    {copied ? <FiCheckCircle /> : <FiCopy />}
                  </button>
                </div>
              </div>

              <div className="waiting-indicator">
                <FiRefreshCw className="spin" />
                <span>Warte auf /start Befehl...</span>
              </div>
            </div>

            <div className="step-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setStep(2)}
              >
                <FiChevronLeft /> Zurück
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Complete */}
        {step === 4 && (
          <div className="setup-step">
            <div className="step-content">
              <div className="step-icon-large success">
                <FiCheckCircle />
              </div>
              <h2>Setup abgeschlossen!</h2>
              <p>Dein Telegram Bot ist jetzt einsatzbereit</p>

              <div className="completion-details">
                <div className="detail-item">
                  <span className="detail-label">Bot</span>
                  <span className="detail-value">@{botInfo?.username}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Chat-ID</span>
                  <span className="detail-value">{chatInfo?.chatId}</span>
                </div>
                {chatInfo?.username && (
                  <div className="detail-item">
                    <span className="detail-label">Benutzer</span>
                    <span className="detail-value">@{chatInfo.username}</span>
                  </div>
                )}
              </div>

              <div className="completion-message">
                <FiCheck />
                <span>Eine Test-Nachricht wurde an deinen Chat gesendet</span>
              </div>
            </div>

            <div className="step-actions">
              <button
                className="btn btn-primary btn-large"
                onClick={completeSetup}
                disabled={loading}
              >
                {loading ? (
                  <><FiRefreshCw className="spin" /> Finalisiere...</>
                ) : (
                  <>Zur Uebersicht <FiChevronRight /></>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TelegramSetupWizard;
