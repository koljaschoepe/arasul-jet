import { useState, useRef, useEffect, useCallback, memo } from 'react';
import {
  FiSearch,
  FiCpu,
  FiBox,
  FiCheck,
  FiAlertCircle,
  FiArrowUp,
  FiX,
  FiChevronUp,
} from 'react-icons/fi';
import { useChatContext } from '../../contexts/ChatContext';
import { useApi } from '../../hooks/useApi';
import './chatinput.css';

function ChatInputArea({
  chatId,
  chatSettings,
  messagesRef,
  hasMessages,
  isLoading,
  error,
  onClearError,
  disabled,
}) {
  const api = useApi();
  const {
    sendMessage,
    cancelJob,
    activeJobIds,
    globalQueue,
    installedModels,
    defaultModel,
    selectedModel,
    setSelectedModel,
    setModelAsDefault,
    spaces,
  } = useChatContext();

  const [input, setInput] = useState('');
  const [useRAG, setUseRAG] = useState(false);
  const [useThinking, setUseThinking] = useState(true);
  const [selectedSpaceId, setSelectedSpaceId] = useState(null);

  const [showModelPopup, setShowModelPopup] = useState(false);
  const [showRAGPopup, setShowRAGPopup] = useState(false);

  const inputRef = useRef(null);
  const modelPopupRef = useRef(null);
  const ragPopupRef = useRef(null);

  const isStreaming = !!activeJobIds[chatId];

  // Initialize from chat settings when chat changes
  useEffect(() => {
    if (chatSettings) {
      setUseRAG(chatSettings.use_rag ?? false);
      setUseThinking(chatSettings.use_thinking ?? true);
      setSelectedSpaceId(chatSettings.preferred_space_id ?? null);
      if (chatSettings.preferred_model) setSelectedModel(chatSettings.preferred_model);
    } else {
      setUseRAG(false);
      setUseThinking(true);
      setSelectedSpaceId(null);
    }
  }, [chatId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close popups on outside click
  useEffect(() => {
    const handleClickOutside = e => {
      if (modelPopupRef.current && !modelPopupRef.current.contains(e.target)) {
        setShowModelPopup(false);
      }
      if (ragPopupRef.current && !ragPopupRef.current.contains(e.target)) {
        setShowRAGPopup(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when not loading
  useEffect(() => {
    if (!isLoading && !disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading, disabled, chatId]);

  // Save settings to backend
  const saveSettings = useCallback(
    updates => {
      if (!chatId) return;
      api.patch(`/chats/${chatId}/settings`, updates, { showError: false });
    },
    [chatId, api]
  );

  // Queue position for current chat
  const queuePosition = (() => {
    if (!activeJobIds[chatId]) return 0;
    const jobId = activeJobIds[chatId];
    const idx = globalQueue.queue?.findIndex(j => j.id === jobId);
    return idx >= 0 ? idx + 1 : 0;
  })();

  const handleInputChange = useCallback(e => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, []);

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading || disabled) return;
    const msg = input;
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    sendMessage(chatId, msg, {
      useRAG,
      useThinking,
      selectedSpaces: selectedSpaceId ? [selectedSpaceId] : [],
      matchedSpaces: [],
      messages: messagesRef?.current || [],
      model: selectedModel || undefined,
    });
  }, [
    input,
    isLoading,
    disabled,
    chatId,
    sendMessage,
    useRAG,
    useThinking,
    selectedSpaceId,
    messagesRef,
    selectedModel,
  ]);

  const handleKeyDown = useCallback(
    e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleCancel = useCallback(() => {
    cancelJob(chatId);
  }, [cancelJob, chatId]);

  // Think toggle
  const handleThinkToggle = useCallback(() => {
    setUseThinking(prev => {
      const next = !prev;
      saveSettings({ use_thinking: next });
      return next;
    });
  }, [saveSettings]);

  // RAG toggle: click when OFF → turn ON (no popup). Click when ON → show popup. Click again → turn OFF.
  const handleRAGClick = useCallback(() => {
    if (!useRAG) {
      setUseRAG(true);
      saveSettings({ use_rag: true });
    } else if (showRAGPopup) {
      // Clicking button while popup is open → turn off RAG
      setUseRAG(false);
      setShowRAGPopup(false);
      saveSettings({ use_rag: false });
    } else {
      // RAG is on, popup is closed → show popup
      setShowRAGPopup(true);
    }
  }, [useRAG, showRAGPopup, saveSettings]);

  // Space selection (single-select)
  const handleSelectSpace = useCallback(
    spaceId => {
      setSelectedSpaceId(spaceId);
      setShowRAGPopup(false);
      saveSettings({ preferred_space_id: spaceId });
    },
    [saveSettings]
  );

  // Model selection
  const handleSelectModel = useCallback(
    modelId => {
      setSelectedModel(modelId);
      setShowModelPopup(false);
      saveSettings({ preferred_model: modelId || null });
    },
    [setSelectedModel, saveSettings]
  );

  // Available models only
  const availableModels = installedModels.filter(
    m => m.install_status === 'available' || m.status === 'available'
  );

  // Model capability warnings
  const currentModel = selectedModel
    ? installedModels.find(m => m.id === selectedModel)
    : installedModels.find(m => m.id === defaultModel);
  const showThinkWarning = useThinking && currentModel && currentModel.supports_thinking === false;
  const showRagWarning = useRAG && currentModel && currentModel.rag_optimized === false;

  // Current model display name
  const modelDisplayName = selectedModel
    ? installedModels.find(m => m.id === selectedModel)?.name?.split(' ')[0] ||
      selectedModel.split(':')[0]
    : 'Standard';

  // Current space display name
  const selectedSpace = selectedSpaceId ? spaces.find(s => s.id === selectedSpaceId) : null;

  return (
    <div className={`chat-input-section ${!hasMessages ? 'centered' : ''}`}>
      {/* Error */}
      {error && (
        <div className="error-banner" role="alert">
          <FiAlertCircle aria-hidden="true" />
          <span>{error}</span>
          <button type="button" onClick={onClearError} aria-label="Fehlermeldung schließen">
            <FiX aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Capability warning */}
      {(showThinkWarning || showRagWarning) && (
        <div className="capability-warning" role="status">
          <FiAlertCircle style={{ color: 'var(--warning-color)', flexShrink: 0 }} />
          <span>
            {showThinkWarning && showRagWarning
              ? `"${currentModel.name}" ist weder für Think-Mode noch RAG optimiert.`
              : showThinkWarning
                ? `"${currentModel.name}" unterstützt Think-Mode möglicherweise nicht optimal.`
                : `"${currentModel.name}" ist nicht für RAG optimiert. Empfohlen: Qwen3-Modelle.`}
          </span>
        </div>
      )}

      {/* Input Card (Toolbar + Input Row) */}
      <div className="chat-input-card">
        {/* Toolbar */}
        <div className="chat-toolbar" role="toolbar" aria-label="Chat-Einstellungen">
          {/* Think Toggle */}
          <button
            type="button"
            className={`chat-toolbar-btn think-toggle ${useThinking ? 'active' : ''}`}
            onClick={handleThinkToggle}
            aria-pressed={useThinking}
            aria-label={useThinking ? 'Thinking deaktivieren' : 'Thinking aktivieren'}
          >
            <FiCpu aria-hidden="true" />
            <span className="toolbar-btn-label">Think</span>
          </button>

          <div className="chat-toolbar-divider" />

          {/* RAG Toggle + Popup */}
          <div className="toolbar-popup-container" ref={ragPopupRef}>
            <button
              type="button"
              className={`chat-toolbar-btn rag-toggle ${useRAG ? 'active' : ''}`}
              onClick={handleRAGClick}
              aria-pressed={useRAG}
              aria-label={useRAG ? 'RAG deaktivieren' : 'RAG aktivieren'}
            >
              <FiSearch aria-hidden="true" />
              <span className="toolbar-btn-label">
                {useRAG && selectedSpace ? selectedSpace.name : 'RAG'}
              </span>
              {useRAG && <FiChevronUp className={`popup-arrow ${showRAGPopup ? 'open' : ''}`} />}
            </button>
            {showRAGPopup && spaces.length > 0 && (
              <div className="toolbar-popup rag-popup" role="listbox">
                <div className="toolbar-popup-header">Bereich:</div>
                <div
                  className={`popup-option ${!selectedSpaceId ? 'selected' : ''}`}
                  onClick={() => handleSelectSpace(null)}
                  role="option"
                  aria-selected={!selectedSpaceId}
                >
                  <span className="popup-radio">{!selectedSpaceId ? '◉' : '○'}</span>
                  <span className="popup-option-name">Auto-Routing</span>
                </div>
                {spaces.map(space => (
                  <div
                    key={space.id}
                    className={`popup-option ${selectedSpaceId === space.id ? 'selected' : ''}`}
                    onClick={() => handleSelectSpace(space.id)}
                    role="option"
                    aria-selected={selectedSpaceId === space.id}
                  >
                    <span className="popup-radio">{selectedSpaceId === space.id ? '◉' : '○'}</span>
                    <span className="popup-option-name">{space.name}</span>
                    <span className="popup-option-count">{space.document_count || 0} Dok.</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Model Selector + Popup */}
          {availableModels.length > 0 && (
            <>
              <div className="chat-toolbar-divider" />
              <div className="toolbar-popup-container" ref={modelPopupRef}>
                <button
                  type="button"
                  className={`chat-toolbar-btn model-toggle ${selectedModel ? 'active' : ''}`}
                  onClick={() => setShowModelPopup(v => !v)}
                  aria-expanded={showModelPopup}
                  aria-haspopup="listbox"
                >
                  <FiBox aria-hidden="true" />
                  <span className="toolbar-btn-label model-name-short">{modelDisplayName}</span>
                  <FiChevronUp className={`popup-arrow ${showModelPopup ? 'open' : ''}`} />
                </button>
                {showModelPopup && (
                  <div className="toolbar-popup model-popup" role="listbox">
                    {availableModels.map(model => {
                      const isSelected = selectedModel === model.id;
                      const isDefault = model.id === defaultModel;
                      return (
                        <div
                          key={model.id}
                          className={`popup-option ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleSelectModel(model.id)}
                          role="option"
                          aria-selected={isSelected}
                        >
                          {isSelected && <FiCheck className="popup-check" />}
                          <span className="popup-option-name">
                            {model.name}
                            {isDefault && <span className="popup-default-badge">Standard</span>}
                          </span>
                        </div>
                      );
                    })}
                    {selectedModel && selectedModel !== defaultModel && (
                      <>
                        <div className="popup-divider" />
                        <div
                          className="popup-option popup-action"
                          onClick={() => {
                            setModelAsDefault(selectedModel);
                            setShowModelPopup(false);
                          }}
                        >
                          <span className="popup-option-name">Als Standard festlegen</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          <div className="chat-toolbar-spacer" />

          {/* Queue status pill */}
          {queuePosition > 0 && (
            <span className="chat-status-pill">
              <span className="queue-dot" />
              <span>#{queuePosition}</span>
              {globalQueue.pending_count > 1 && (
                <span className="queue-total">von {globalQueue.pending_count}</span>
              )}
            </span>
          )}
        </div>

        {/* Input Row */}
        <div className="chat-input-row">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={useRAG ? 'Frage zu Dokumenten stellen...' : 'Nachricht eingeben...'}
            rows={1}
            disabled={disabled}
          />

          {/* Send / Cancel */}
          {isStreaming ? (
            <button type="button" className="cancel-btn" onClick={handleCancel} title="Abbrechen">
              <FiX />
            </button>
          ) : (
            <button
              type="button"
              className="send-btn"
              onClick={handleSend}
              disabled={!input.trim() || disabled || isLoading}
              title="Senden"
            >
              <FiArrowUp />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(
  ChatInputArea,
  (prev, next) =>
    prev.chatId === next.chatId &&
    prev.chatSettings === next.chatSettings &&
    prev.isLoading === next.isLoading &&
    prev.error === next.error &&
    prev.disabled === next.disabled &&
    prev.hasMessages === next.hasMessages &&
    prev.messagesRef === next.messagesRef
);
