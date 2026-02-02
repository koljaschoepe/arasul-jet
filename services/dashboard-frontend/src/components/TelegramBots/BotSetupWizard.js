/**
 * BotSetupWizard - Multi-step wizard for creating a new Telegram bot
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  FiCheck,
  FiChevronRight,
  FiChevronLeft,
  FiAlertCircle,
  FiLoader,
  FiEye,
  FiEyeOff,
} from 'react-icons/fi';
import { API_BASE } from '../../config/api';

const STEPS = [
  { id: 1, title: 'Bot Token', description: 'Token von @BotFather eingeben' },
  { id: 2, title: 'LLM Provider', description: 'KI-Anbieter auswaehlen' },
  { id: 3, title: 'System Prompt', description: 'Bot-Persoenlichkeit definieren' },
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
  const [showToken, setShowToken] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [botInfo, setBotInfo] = useState(null);
  const [error, setError] = useState(null);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [claudeModels, setClaudeModels] = useState([]);
  const [creating, setCreating] = useState(false);

  // Auth headers
  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('arasul_token');
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }, []);

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
  }, [getAuthHeaders, formData.llmModel]);

  // Validate bot token
  const validateToken = async () => {
    if (!formData.token) {
      setError('Bitte gib ein Token ein');
      return;
    }

    setValidating(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/telegram-bots/validate-token`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ token: formData.token }),
      });

      const data = await response.json();

      if (data.valid) {
        setValidated(true);
        setBotInfo(data.botInfo);
        setFormData(prev => ({
          ...prev,
          name: data.botInfo.first_name || prev.name,
        }));
      } else {
        setError(data.error || 'Token ist ungueltig');
      }
    } catch (err) {
      setError('Verbindungsfehler bei der Validierung');
    } finally {
      setValidating(false);
    }
  };

  // Handle step navigation
  const nextStep = () => {
    if (currentStep === 1 && !validated) {
      validateToken();
      return;
    }
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
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
            <div className="wizard-form-group">
              <label>Bot Token</label>
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
                >
                  {showToken ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
              <small>
                Erstelle einen Bot bei <strong>@BotFather</strong> auf Telegram und kopiere das
                Token
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
              <label>Bot Name (anpassbar)</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Mein Assistent"
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="wizard-step-content">
            <div className="wizard-form-group">
              <label>LLM Provider</label>
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
                    <span className="provider-option-name">Ollama</span>
                    <span className="provider-option-badge local">Lokal</span>
                  </div>
                  <span className="provider-option-desc">Lokale KI-Modelle auf dem Jetson</span>
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
                    <span className="provider-option-name">Claude</span>
                    <span className="provider-option-badge cloud">Cloud</span>
                  </div>
                  <span className="provider-option-desc">Anthropic Claude API</span>
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
                    <option value="">Keine Modelle verfuegbar</option>
                  )
                ) : (
                  claudeModels.map(model => (
                    <option key={model.id || model} value={model.id || model}>
                      {model.name || model.id || model}
                    </option>
                  ))
                )}
              </select>
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
              <label>System Prompt</label>
              <textarea
                value={formData.systemPrompt}
                onChange={e => setFormData(prev => ({ ...prev, systemPrompt: e.target.value }))}
                placeholder="Du bist ein hilfreicher Assistent..."
                rows={8}
              />
              <small>Definiert die Persoenlichkeit und das Verhalten des Bots</small>
            </div>

            <div className="wizard-summary">
              <h4>Zusammenfassung</h4>
              <div className="wizard-summary-item">
                <span className="wizard-summary-label">Bot:</span>
                <span className="wizard-summary-value">{formData.name}</span>
              </div>
              <div className="wizard-summary-item">
                <span className="wizard-summary-label">Provider:</span>
                <span className="wizard-summary-value">{formData.llmProvider.toUpperCase()}</span>
              </div>
              <div className="wizard-summary-item">
                <span className="wizard-summary-label">Modell:</span>
                <span className="wizard-summary-value">{formData.llmModel}</span>
              </div>
            </div>
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
            <button type="button" className="wizard-btn secondary" onClick={prevStep}>
              <FiChevronLeft />
              Zurueck
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
                'Token pruefen'
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
              disabled={creating}
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
