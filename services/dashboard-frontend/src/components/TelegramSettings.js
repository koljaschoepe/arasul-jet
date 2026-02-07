import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FiSend,
  FiCheck,
  FiAlertCircle,
  FiEye,
  FiEyeOff,
  FiRefreshCw
} from 'react-icons/fi';

/**
 * TelegramSettings Component
 * Manages Telegram Bot configuration for system notifications
 */
function TelegramSettings() {
  const [config, setConfig] = useState({
    bot_token: '',
    chat_id: '',
    enabled: false
  });
  const [hasToken, setHasToken] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState(null);
  const [originalConfig, setOriginalConfig] = useState(null);

  // ML-003 FIX: Ref to track if component is mounted
  const isMountedRef = useRef(true);

  const fetchConfig = useCallback(async (signal) => {
    try {
      const response = await fetch('/api/telegram/config', {
        credentials: 'include',
        signal // ML-003: Pass abort signal
      });
      if (response.ok && isMountedRef.current) {
        const data = await response.json();
        setConfig({
          bot_token: '', // Never returned from backend
          chat_id: data.chat_id || '',
          enabled: data.enabled || false
        });
        // Backend returns 'configured' and 'token_masked' instead of 'has_token'
        setHasToken(data.configured || false);
        setOriginalConfig({
          bot_token: '',
          chat_id: data.chat_id || '',
          enabled: data.enabled || false
        });
      }
    } catch (error) {
      // ML-003: Ignore abort errors
      if (error.name === 'AbortError') return;
      console.error('Error fetching Telegram config:', error);
      if (isMountedRef.current) {
        setMessage({ type: 'error', text: 'Fehler beim Laden der Konfiguration' });
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // ML-003 FIX: Use AbortController and track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    const controller = new AbortController();

    fetchConfig(controller.signal);

    return () => {
      isMountedRef.current = false;
      controller.abort();
    };
  }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const payload = {
        chat_id: config.chat_id,
        enabled: config.enabled
      };

      // Only send token if it was changed (not empty)
      if (config.bot_token) {
        payload.bot_token = config.bot_token;
      }

      // Backend uses POST for both create and update (upsert)
      const response = await fetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      // ML-003: Check if still mounted before updating state
      if (!isMountedRef.current) return;

      if (response.ok) {
        const data = await response.json();
        // Backend returns has_token: true when token is configured
        setHasToken(data.has_token || data.success || false);
        setConfig(prev => ({ ...prev, bot_token: '' }));
        setOriginalConfig({
          bot_token: '',
          chat_id: config.chat_id,
          enabled: config.enabled
        });
        setMessage({ type: 'success', text: 'Konfiguration erfolgreich gespeichert' });
      } else {
        const data = await response.json();
        setMessage({ type: 'error', text: data.error || 'Fehler beim Speichern' });
      }
    } catch (error) {
      if (!isMountedRef.current) return;
      setMessage({ type: 'error', text: 'Netzwerkfehler beim Speichern' });
    } finally {
      if (isMountedRef.current) {
        setSaving(false);
      }
    }
  };

  const handleToggleEnabled = async () => {
    setSaving(true);
    setMessage(null);

    const newEnabled = !config.enabled;

    try {
      // Backend POST endpoint handles upsert with enabled field
      const response = await fetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: newEnabled })
      });

      // ML-003: Check if still mounted before updating state
      if (!isMountedRef.current) return;

      if (response.ok) {
        setConfig(prev => ({ ...prev, enabled: newEnabled }));
        setOriginalConfig(prev => ({ ...prev, enabled: newEnabled }));
        setMessage({
          type: 'success',
          text: newEnabled ? 'Telegram Bot aktiviert' : 'Telegram Bot deaktiviert'
        });
      } else {
        const data = await response.json();
        setMessage({ type: 'error', text: data.error || 'Fehler beim Umschalten' });
      }
    } catch (error) {
      if (!isMountedRef.current) return;
      setMessage({ type: 'error', text: 'Netzwerkfehler' });
    } finally {
      if (isMountedRef.current) {
        setSaving(false);
      }
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setMessage(null);

    try {
      const response = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      // ML-003: Check if still mounted before updating state
      if (!isMountedRef.current) return;

      if (response.ok) {
        setMessage({ type: 'success', text: 'Test-Nachricht erfolgreich gesendet!' });
      } else {
        const data = await response.json();
        setMessage({ type: 'error', text: data.error || 'Test fehlgeschlagen' });
      }
    } catch (error) {
      if (!isMountedRef.current) return;
      setMessage({ type: 'error', text: 'Netzwerkfehler beim Test' });
    } finally {
      if (isMountedRef.current) {
        setTesting(false);
      }
    }
  };

  const hasChanges = config.bot_token !== '' ||
    config.chat_id !== originalConfig?.chat_id;

  if (loading) {
    return (
      <div className="settings-section">
        <div className="settings-section-header">
          <h1 className="settings-section-title">Telegram Bot</h1>
          <p className="settings-section-description">Lade...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h1 className="settings-section-title">Telegram Bot</h1>
        <p className="settings-section-description">
          Konfigurieren Sie einen Telegram Bot für System-Benachrichtigungen
        </p>
      </div>

      <div className="settings-cards">
        {/* Status Card */}
        <div className="settings-card">
          <div className="settings-card-header">
            <h3 className="settings-card-title">
              <FiSend style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
              Bot Status
            </h3>
            <p className="settings-card-description">
              Aktivieren oder deaktivieren Sie den Telegram Bot
            </p>
          </div>
          <div className="settings-card-body">
            <div className="telegram-status-row">
              <div className="telegram-status-info">
                <span className="telegram-status-label">Bot Status</span>
                <span className={`telegram-status-value ${config.enabled ? 'active' : 'inactive'}`}>
                  {config.enabled ? 'Aktiv' : 'Inaktiv'}
                </span>
              </div>
              <button
                className={`telegram-toggle-btn ${config.enabled ? 'active' : ''}`}
                onClick={handleToggleEnabled}
                disabled={saving || (!hasToken && !config.enabled)}
                title={!hasToken ? 'Erst Bot-Token konfigurieren' : ''}
              >
                <span className="telegram-toggle-slider" />
              </button>
            </div>
            {!hasToken && (
              <p className="telegram-hint">
                Konfigurieren Sie zuerst einen Bot-Token, um den Bot zu aktivieren.
              </p>
            )}
          </div>
        </div>

        {/* Configuration Card */}
        <div className="settings-card telegram-config-card">
          <div className="settings-card-header">
            <h3 className="settings-card-title">Bot Konfiguration</h3>
            <p className="settings-card-description">
              Bot-Token von @BotFather und Chat-ID eingeben
            </p>
          </div>
          <div className="settings-card-body">
            {message && (
              <div className={`telegram-message ${message.type}`}>
                {message.type === 'success' ? <FiCheck /> : <FiAlertCircle />}
                <span>{message.text}</span>
              </div>
            )}

            <div className="telegram-form">
              {/* Bot Token */}
              <div className="telegram-form-group">
                <label htmlFor="bot-token">Bot Token</label>
                <div className="telegram-input-wrapper">
                  <input
                    id="bot-token"
                    type={showToken ? 'text' : 'password'}
                    value={config.bot_token}
                    onChange={(e) => setConfig(prev => ({ ...prev, bot_token: e.target.value }))}
                    placeholder={hasToken ? '********** (Token gespeichert)' : 'Token von @BotFather eingeben'}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="telegram-toggle-visibility"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? <FiEyeOff /> : <FiEye />}
                  </button>
                </div>
                <small>
                  Erstellen Sie einen Bot bei <strong>@BotFather</strong> auf Telegram
                </small>
              </div>

              {/* Chat ID */}
              <div className="telegram-form-group">
                <label htmlFor="chat-id">Chat ID</label>
                <input
                  id="chat-id"
                  type="text"
                  value={config.chat_id}
                  onChange={(e) => setConfig(prev => ({ ...prev, chat_id: e.target.value }))}
                  placeholder="z.B. 123456789 oder -100123456789"
                />
                <small>
                  Ihre Chat-ID oder Gruppen-ID. Nutzen Sie <strong>@userinfobot</strong> um Ihre ID zu erfahren.
                </small>
              </div>

              {/* Actions */}
              <div className="telegram-actions">
                <button
                  className={`telegram-save-btn ${hasChanges ? 'has-changes' : ''}`}
                  onClick={handleSave}
                  disabled={saving || !hasChanges}
                >
                  {saving ? (
                    <>Speichern...</>
                  ) : (
                    <>
                      <FiCheck />
                      Speichern
                    </>
                  )}
                </button>

                <button
                  className="telegram-test-btn"
                  onClick={handleTest}
                  disabled={testing || !hasToken || !config.chat_id}
                  title={!hasToken || !config.chat_id ? 'Token und Chat-ID erforderlich' : ''}
                >
                  {testing ? (
                    <>
                      <FiRefreshCw className="spinning" />
                      Senden...
                    </>
                  ) : (
                    <>
                      <FiSend />
                      Test senden
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Info Card */}
        <div className="settings-card">
          <div className="settings-card-header">
            <h3 className="settings-card-title">Einrichtung Telegram Bot</h3>
            <p className="settings-card-description">So richten Sie den Bot ein</p>
          </div>
          <div className="settings-card-body">
            <div className="settings-about-features">
              <div className="settings-feature-item">
                <div className="settings-feature-icon">1</div>
                <div className="settings-feature-text">
                  <strong>Bot erstellen</strong>
                  <span>Schreiben Sie @BotFather auf Telegram und nutzen Sie /newbot</span>
                </div>
              </div>
              <div className="settings-feature-item">
                <div className="settings-feature-icon">2</div>
                <div className="settings-feature-text">
                  <strong>Token kopieren</strong>
                  <span>Kopieren Sie den API Token und fuegen Sie ihn oben ein</span>
                </div>
              </div>
              <div className="settings-feature-item">
                <div className="settings-feature-icon">3</div>
                <div className="settings-feature-text">
                  <strong>Chat-ID ermitteln</strong>
                  <span>Schreiben Sie @userinfobot um Ihre Chat-ID zu erfahren</span>
                </div>
              </div>
              <div className="settings-feature-item">
                <div className="settings-feature-icon">4</div>
                <div className="settings-feature-text">
                  <strong>Bot starten</strong>
                  <span>Starten Sie einen Chat mit Ihrem Bot (/start) bevor Sie testen</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TelegramSettings;
