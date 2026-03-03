import { useState, useRef, useEffect, useCallback, memo } from 'react';
import {
  FiSearch,
  FiCpu,
  FiBox,
  FiFolder,
  FiChevronDown,
  FiCheck,
  FiStar,
  FiAlertCircle,
  FiArrowUp,
  FiX,
} from 'react-icons/fi';
import { useChatContext } from '../../contexts/ChatContext';
import './chatinput.css';

function ChatInputArea({
  chatId,
  messagesRef,
  hasMessages,
  isLoading,
  error,
  onClearError,
  disabled,
}) {
  const {
    sendMessage,
    cancelJob,
    activeJobIds,
    globalQueue,
    installedModels,
    defaultModel,
    loadedModel,
    selectedModel,
    setSelectedModel,
    favoriteModels,
    toggleFavorite,
    setModelAsDefault,
    spaces,
  } = useChatContext();

  const [input, setInput] = useState('');
  const [useRAG, setUseRAG] = useState(true);
  const [useThinking, setUseThinking] = useState(true);
  const [selectedSpaces, setSelectedSpaces] = useState([]);
  const [matchedSpaces, setMatchedSpaces] = useState([]);

  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showSpacesDropdown, setShowSpacesDropdown] = useState(false);

  const inputRef = useRef(null);
  const modelDropdownRef = useRef(null);
  const spacesDropdownRef = useRef(null);

  const isStreaming = !!activeJobIds[chatId];

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = e => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target)) {
        setShowModelDropdown(false);
      }
      if (spacesDropdownRef.current && !spacesDropdownRef.current.contains(e.target)) {
        setShowSpacesDropdown(false);
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
      selectedSpaces,
      matchedSpaces,
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
    selectedSpaces,
    matchedSpaces,
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

  const toggleSpaceSelection = useCallback(spaceId => {
    setSelectedSpaces(prev =>
      prev.includes(spaceId) ? prev.filter(id => id !== spaceId) : [...prev, spaceId]
    );
  }, []);

  const clearSpaceSelection = useCallback(() => {
    setSelectedSpaces([]);
    setShowSpacesDropdown(false);
  }, []);

  // Model capability warnings
  const currentModel = selectedModel
    ? installedModels.find(m => m.id === selectedModel)
    : installedModels.find(m => m.id === defaultModel);
  const showThinkWarning = useThinking && currentModel && currentModel.supports_thinking === false;
  const showRagWarning = useRAG && currentModel && currentModel.rag_optimized === false;

  return (
    <div className={`chat-input-section ${!hasMessages ? 'centered' : ''}`}>
      {/* Queue indicator */}
      {queuePosition > 0 && (
        <div className="queue-indicator">
          <span className="queue-dot" />
          <span>#{queuePosition}</span>
          {globalQueue.pending_count > 1 && (
            <span className="queue-total">von {globalQueue.pending_count}</span>
          )}
        </div>
      )}

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

      {/* Input box */}
      <div className="input-box" role="toolbar" aria-label="Chat-Eingabe">
        <div className="input-toggles">
          {/* RAG Toggle */}
          <button
            type="button"
            className={`input-toggle rag-toggle ${useRAG ? 'active' : ''}`}
            onClick={() => setUseRAG(v => !v)}
            aria-pressed={useRAG}
            aria-label={useRAG ? 'RAG deaktivieren' : 'RAG aktivieren'}
          >
            <FiSearch aria-hidden="true" />
            {useRAG && <span>RAG</span>}
          </button>

          {/* Space selector */}
          {useRAG && spaces.length > 0 && (
            <div className="space-selector" ref={spacesDropdownRef}>
              <button
                type="button"
                className={`input-toggle space-toggle ${selectedSpaces.length > 0 ? 'active' : ''}`}
                onClick={() => setShowSpacesDropdown(v => !v)}
                aria-expanded={showSpacesDropdown}
                aria-haspopup="listbox"
              >
                <FiFolder />
                <span className="space-toggle-label">
                  {selectedSpaces.length > 0 ? `${selectedSpaces.length} Bereiche` : 'Auto'}
                </span>
                <FiChevronDown className={`dropdown-arrow ${showSpacesDropdown ? 'open' : ''}`} />
              </button>
              {showSpacesDropdown && (
                <div className="space-dropdown" role="listbox">
                  <div
                    className={`space-option auto-option ${selectedSpaces.length === 0 ? 'selected' : ''}`}
                    onClick={clearSpaceSelection}
                  >
                    <FiCheck className="check-icon" />
                    <span className="space-option-name">Auto-Routing</span>
                    <span className="space-option-desc">KI wählt relevante Bereiche</span>
                  </div>
                  <div className="space-dropdown-divider" />
                  {spaces.map(space => (
                    <div
                      key={space.id}
                      className={`space-option ${selectedSpaces.includes(space.id) ? 'selected' : ''}`}
                      onClick={() => toggleSpaceSelection(space.id)}
                    >
                      <FiCheck className="check-icon" />
                      <FiFolder style={{ color: space.color }} className="space-icon" />
                      <span className="space-option-name">{space.name}</span>
                      <span className="space-option-count">{space.document_count || 0} Dok.</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Think Toggle */}
          <button
            type="button"
            className={`input-toggle think-toggle ${useThinking ? 'active' : ''}`}
            onClick={() => setUseThinking(v => !v)}
            aria-pressed={useThinking}
            aria-label={useThinking ? 'Thinking deaktivieren' : 'Thinking aktivieren'}
          >
            <FiCpu aria-hidden="true" />
            {useThinking && <span>Think</span>}
          </button>

          {/* Model Selector */}
          {installedModels.length > 0 && (
            <div className="model-selector" ref={modelDropdownRef}>
              <button
                type="button"
                className={`input-toggle model-toggle ${selectedModel ? 'active' : ''}`}
                onClick={() => setShowModelDropdown(v => !v)}
                aria-expanded={showModelDropdown}
                aria-haspopup="listbox"
              >
                <FiBox />
                <span className="model-name-short">
                  {selectedModel
                    ? installedModels.find(m => m.id === selectedModel)?.name?.split(' ')[0] ||
                      selectedModel.split(':')[0]
                    : 'Standard'}
                </span>
                <FiChevronDown className={`dropdown-arrow ${showModelDropdown ? 'open' : ''}`} />
              </button>
              {showModelDropdown && (
                <div className="model-dropdown" role="listbox">
                  <div
                    className={`model-option ${!selectedModel ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedModel('');
                      setShowModelDropdown(false);
                    }}
                  >
                    <span className="model-option-name">
                      <FiStar style={{ color: 'var(--primary-color)', marginRight: '4px' }} />
                      Standard
                    </span>
                    <span className="model-option-desc">
                      {defaultModel ? defaultModel.split(':')[0] : 'Automatisch'}
                    </span>
                  </div>
                  {[...installedModels]
                    .sort((a, b) => {
                      const aFav = favoriteModels.includes(a.id) ? 0 : 1;
                      const bFav = favoriteModels.includes(b.id) ? 0 : 1;
                      if (aFav !== bFav) return aFav - bFav;
                      return (a.performance_tier || 1) - (b.performance_tier || 1);
                    })
                    .map(model => {
                      const isAvailable =
                        model.install_status === 'available' || model.status === 'available';
                      const isDefault = model.id === defaultModel;
                      const isFavorite = favoriteModels.includes(model.id);
                      const isLoaded =
                        loadedModel &&
                        (model.effective_ollama_name === loadedModel ||
                          model.id === loadedModel ||
                          loadedModel.startsWith(model.id.split(':')[0]));
                      return (
                        <div
                          key={model.id}
                          className={`model-option ${selectedModel === model.id ? 'selected' : ''} ${!isAvailable ? 'unavailable' : ''} ${isFavorite ? 'favorite' : ''}`}
                          onClick={() => {
                            if (isAvailable) {
                              setSelectedModel(model.id);
                              setShowModelDropdown(false);
                            }
                          }}
                          title={
                            !isAvailable ? model.install_error || 'Modell nicht verfügbar' : ''
                          }
                        >
                          <span className="model-option-name">
                            <button
                              type="button"
                              className={`favorite-btn ${isFavorite ? 'active' : ''}`}
                              onClick={e => {
                                e.stopPropagation();
                                toggleFavorite(model.id);
                              }}
                              title={
                                isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'
                              }
                            >
                              <FiStar
                                style={{
                                  color: isFavorite
                                    ? 'var(--warning-color)'
                                    : 'var(--text-disabled)',
                                }}
                              />
                            </button>
                            {model.name}
                            {isLoaded && (
                              <FiCpu
                                style={{ marginLeft: '6px', color: 'var(--text-muted)' }}
                                title="Im RAM geladen"
                              />
                            )}
                            {!isAvailable && (
                              <FiAlertCircle
                                className="model-warning-icon"
                                style={{ marginLeft: '6px', color: 'var(--danger-color)' }}
                              />
                            )}
                          </span>
                          <span className="model-option-desc">
                            {!isAvailable ? (
                              model.install_error || 'Nicht verfügbar'
                            ) : (
                              <>
                                {`${model.category} • ${model.ram_required_gb}GB RAM`}
                                {model.supports_thinking && (
                                  <span
                                    style={{ color: 'var(--primary-color)', marginLeft: '6px' }}
                                    title="Think-Mode"
                                  >
                                    💭
                                  </span>
                                )}
                                {model.rag_optimized && (
                                  <span
                                    style={{ color: 'var(--success-color)', marginLeft: '6px' }}
                                    title="RAG-optimiert"
                                  >
                                    📚
                                  </span>
                                )}
                              </>
                            )}
                            {isAvailable && !isDefault && (
                              <button
                                type="button"
                                className="set-default-btn"
                                onClick={e => {
                                  e.stopPropagation();
                                  setModelAsDefault(model.id);
                                }}
                                title="Als Standard setzen"
                              >
                                <FiStar /> Standard
                              </button>
                            )}
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Textarea */}
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
  );
}

export default memo(
  ChatInputArea,
  (prev, next) =>
    prev.chatId === next.chatId &&
    prev.isLoading === next.isLoading &&
    prev.error === next.error &&
    prev.disabled === next.disabled &&
    prev.hasMessages === next.hasMessages &&
    prev.messagesRef === next.messagesRef
);
