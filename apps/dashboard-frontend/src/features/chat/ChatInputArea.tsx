import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Search, Cpu, Box, Check, AlertCircle, ArrowUp, X, ChevronUp } from 'lucide-react';
import { useChatContext } from '../../contexts/ChatContext';
import { useApi } from '../../hooks/useApi';
import { cn } from '@/lib/utils';
import './chat.css';

interface ChatInputAreaProps {
  chatId: number;
  chatSettings: any;
  messagesRef: React.MutableRefObject<any[]>;
  hasMessages: boolean;
  isLoading: boolean;
  error: string | null;
  onClearError: () => void;
  disabled: boolean;
}

function ChatInputArea({
  chatId,
  chatSettings,
  messagesRef,
  hasMessages,
  isLoading,
  error,
  onClearError,
  disabled,
}: ChatInputAreaProps) {
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
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [showModelPopup, setShowModelPopup] = useState(false);
  const [showRAGPopup, setShowRAGPopup] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modelPopupRef = useRef<HTMLDivElement>(null);
  const ragPopupRef = useRef<HTMLDivElement>(null);

  const isStreaming = !!activeJobIds[chatId];

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
  }, [chatId, chatSettings]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelPopupRef.current && !modelPopupRef.current.contains(e.target as Node)) {
        setShowModelPopup(false);
      }
      if (ragPopupRef.current && !ragPopupRef.current.contains(e.target as Node)) {
        setShowRAGPopup(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isLoading && !disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading, disabled, chatId]);

  const saveSettings = useCallback(
    (updates: Record<string, any>) => {
      if (!chatId) return;
      api.patch(`/chats/${chatId}/settings`, updates, { showError: false });
    },
    [chatId, api]
  );

  const queuePosition = (() => {
    if (!activeJobIds[chatId]) return 0;
    const jobId = activeJobIds[chatId];
    const idx = globalQueue.queue?.findIndex((j: any) => j.id === jobId);
    return idx >= 0 ? idx + 1 : 0;
  })();

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
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
    (e: React.KeyboardEvent) => {
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

  const handleThinkToggle = useCallback(() => {
    setUseThinking(prev => {
      const next = !prev;
      saveSettings({ use_thinking: next });
      return next;
    });
  }, [saveSettings]);

  const handleRAGClick = useCallback(() => {
    if (!useRAG) {
      setUseRAG(true);
      saveSettings({ use_rag: true });
    } else if (showRAGPopup) {
      setUseRAG(false);
      setShowRAGPopup(false);
      saveSettings({ use_rag: false });
    } else {
      setShowRAGPopup(true);
    }
  }, [useRAG, showRAGPopup, saveSettings]);

  const handleSelectSpace = useCallback(
    (spaceId: string | null) => {
      setSelectedSpaceId(spaceId);
      setShowRAGPopup(false);
      saveSettings({ preferred_space_id: spaceId });
    },
    [saveSettings]
  );

  const handleSelectModel = useCallback(
    (modelId: string) => {
      setSelectedModel(modelId);
      setShowModelPopup(false);
      saveSettings({ preferred_model: modelId || null });
    },
    [setSelectedModel, saveSettings]
  );

  const availableModels = installedModels.filter(
    (m: any) => m.install_status === 'available' || m.status === 'available'
  );

  const currentModel = selectedModel
    ? installedModels.find((m: any) => m.id === selectedModel)
    : installedModels.find((m: any) => m.id === defaultModel);
  const showThinkWarning = useThinking && currentModel && currentModel.supports_thinking === false;
  const showRagWarning = useRAG && currentModel && currentModel.rag_optimized === false;

  const modelDisplayName = selectedModel
    ? installedModels.find((m: any) => m.id === selectedModel)?.name?.split(' ')[0] ||
      selectedModel.split(':')[0]
    : 'Standard';

  const selectedSpace = selectedSpaceId ? spaces.find((s: any) => s.id === selectedSpaceId) : null;

  return (
    <div
      className={cn(
        'chat-input-section flex flex-col items-center py-5 px-8 pb-7 w-full shrink-0',
        !hasMessages && 'centered justify-center flex-1'
      )}
    >
      {error && (
        <div
          className="error-banner flex items-center gap-3 w-full max-w-[800px] py-3 px-4 bg-destructive/10 border border-destructive/25 rounded-lg text-muted-foreground text-sm mb-4"
          role="alert"
        >
          <AlertCircle className="shrink-0 size-[18px] text-destructive" aria-hidden="true" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            className="bg-transparent border-none text-muted-foreground cursor-pointer p-1 rounded flex hover:bg-destructive/20 hover:text-destructive"
            onClick={onClearError}
            aria-label="Fehlermeldung schließen"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {(showThinkWarning || showRagWarning) && (
        <div
          className="capability-warning flex items-center gap-2.5 w-full max-w-[800px] py-2.5 px-3.5 bg-muted/50 border border-border rounded-lg text-muted-foreground text-xs mb-3"
          role="status"
        >
          <AlertCircle className="size-4 text-muted-foreground shrink-0" />
          <span className="flex-1">
            {showThinkWarning && showRagWarning
              ? `"${currentModel.name}" ist weder für Think-Mode noch RAG optimiert.`
              : showThinkWarning
                ? `"${currentModel.name}" unterstützt Think-Mode möglicherweise nicht optimal.`
                : `"${currentModel.name}" ist nicht für RAG optimiert. Empfohlen: Qwen3-Modelle.`}
          </span>
        </div>
      )}

      <div className="chat-input-card w-full max-w-[800px] bg-card border border-border rounded-xl overflow-visible transition-all duration-200 relative focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
        <div
          className="chat-toolbar flex items-center gap-2 py-2 px-4 border-b border-border bg-background rounded-t-[var(--radius-lg)]"
          role="toolbar"
          aria-label="Chat-Einstellungen"
        >
          <button
            type="button"
            className={cn(
              'chat-toolbar-btn think-toggle inline-flex items-center gap-1.5 py-1.5 px-2.5 bg-transparent border border-transparent rounded-md text-muted-foreground text-sm font-medium cursor-pointer transition-all duration-150 h-8 shrink-0 hover:bg-primary/5 hover:text-foreground',
              useThinking && 'active bg-primary/15 text-primary border-primary/20'
            )}
            onClick={handleThinkToggle}
            aria-pressed={useThinking}
            aria-label={useThinking ? 'Thinking deaktivieren' : 'Thinking aktivieren'}
          >
            <Cpu className="size-4 shrink-0" aria-hidden="true" />
            <span className="toolbar-btn-label uppercase tracking-wide text-xs">Think</span>
          </button>

          <div className="chat-toolbar-divider w-px h-6 bg-border shrink-0" />

          <div className="toolbar-popup-container relative" ref={ragPopupRef}>
            <button
              type="button"
              className={cn(
                'chat-toolbar-btn rag-toggle inline-flex items-center gap-1.5 py-1.5 px-2.5 bg-transparent border border-transparent rounded-md text-muted-foreground text-sm font-medium cursor-pointer transition-all duration-150 h-8 shrink-0 hover:bg-primary/5 hover:text-foreground',
                useRAG && 'active bg-primary/15 text-primary border-primary/20'
              )}
              onClick={handleRAGClick}
              aria-pressed={useRAG}
              aria-label={useRAG ? 'RAG deaktivieren' : 'RAG aktivieren'}
            >
              <Search className="size-4 shrink-0" aria-hidden="true" />
              <span
                className={cn(
                  'toolbar-btn-label text-xs',
                  useRAG &&
                    'max-w-[100px] overflow-hidden text-ellipsis whitespace-nowrap !normal-case !tracking-normal'
                )}
              >
                {useRAG && selectedSpace ? selectedSpace.name : 'RAG'}
              </span>
              {useRAG && (
                <ChevronUp
                  className={cn(
                    'size-3 transition-transform duration-200',
                    showRAGPopup && 'rotate-180'
                  )}
                />
              )}
            </button>
            {showRAGPopup && spaces.length > 0 && (
              <div
                className="toolbar-popup rag-popup absolute bottom-[calc(100%+4px)] left-0 min-w-[220px] max-w-[280px] max-h-[320px] overflow-y-auto bg-card border border-border rounded-xl shadow-lg z-10 animate-[slideUpFadeIn_200ms_ease-out]"
                role="listbox"
                aria-label="RAG-Bereich auswählen"
              >
                <div className="toolbar-popup-header py-2.5 px-3.5 pb-1.5 text-[0.7rem] font-semibold text-muted-foreground uppercase tracking-wide">
                  Bereich:
                </div>
                <div
                  className={cn(
                    'popup-option flex items-center gap-2 py-2.5 px-3.5 cursor-pointer transition-colors duration-150 text-sm text-foreground hover:bg-accent',
                    !selectedSpaceId && 'selected bg-primary/10'
                  )}
                  onClick={() => handleSelectSpace(null)}
                  role="option"
                  aria-selected={!selectedSpaceId}
                >
                  <span className="w-4 text-center text-muted-foreground shrink-0 text-sm">
                    {!selectedSpaceId ? '◉' : '○'}
                  </span>
                  <span
                    className={cn(
                      'popup-option-name flex-1 font-medium',
                      !selectedSpaceId && 'text-primary'
                    )}
                  >
                    Auto-Routing
                  </span>
                </div>
                {spaces.map((space: any) => (
                  <div
                    key={space.id}
                    className={cn(
                      'popup-option flex items-center gap-2 py-2.5 px-3.5 cursor-pointer transition-colors duration-150 text-sm text-foreground hover:bg-accent',
                      selectedSpaceId === space.id && 'selected bg-primary/10'
                    )}
                    onClick={() => handleSelectSpace(space.id)}
                    role="option"
                    aria-selected={selectedSpaceId === space.id}
                  >
                    <span
                      className={cn(
                        'w-4 text-center shrink-0 text-sm',
                        selectedSpaceId === space.id ? 'text-primary' : 'text-muted-foreground'
                      )}
                    >
                      {selectedSpaceId === space.id ? '◉' : '○'}
                    </span>
                    <span
                      className={cn(
                        'popup-option-name flex-1 font-medium flex items-center gap-1.5',
                        selectedSpaceId === space.id && 'text-primary'
                      )}
                    >
                      {space.name}
                    </span>
                    <span className="popup-option-count text-xs text-muted-foreground bg-primary/10 py-0.5 px-1.5 rounded shrink-0">
                      {space.document_count || 0} Dok.
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {availableModels.length > 0 && (
            <>
              <div className="chat-toolbar-divider w-px h-6 bg-border shrink-0" />
              <div className="toolbar-popup-container relative" ref={modelPopupRef}>
                <button
                  type="button"
                  className={cn(
                    'chat-toolbar-btn model-toggle inline-flex items-center gap-1.5 py-1.5 px-2.5 bg-transparent border border-transparent rounded-md text-muted-foreground text-sm font-medium cursor-pointer transition-all duration-150 h-8 shrink-0 max-w-[160px] hover:bg-primary/5 hover:text-foreground',
                    selectedModel && 'active bg-primary/15 text-primary border-primary/20'
                  )}
                  onClick={() => setShowModelPopup(v => !v)}
                  aria-expanded={showModelPopup}
                  aria-haspopup="listbox"
                  aria-label="Modell auswählen"
                >
                  <Box className="size-4 shrink-0" aria-hidden="true" />
                  <span className="model-name-short max-w-[80px] overflow-hidden text-ellipsis whitespace-nowrap text-xs normal-case tracking-normal">
                    {modelDisplayName}
                  </span>
                  <ChevronUp
                    className={cn(
                      'size-3 transition-transform duration-200',
                      showModelPopup && 'rotate-180'
                    )}
                  />
                </button>
                {showModelPopup && (
                  <div
                    className="toolbar-popup model-popup absolute bottom-[calc(100%+4px)] left-0 min-w-[220px] max-w-[280px] max-h-[320px] overflow-y-auto bg-card border border-border rounded-xl shadow-lg z-10 animate-[slideUpFadeIn_200ms_ease-out]"
                    role="listbox"
                    aria-label="Modell auswählen"
                  >
                    {availableModels.map((model: any) => {
                      const isSelected = selectedModel === model.id;
                      const isDefault = model.id === defaultModel;
                      return (
                        <div
                          key={model.id}
                          className={cn(
                            'popup-option flex items-center gap-2 py-2.5 px-3.5 cursor-pointer transition-colors duration-150 text-sm text-foreground hover:bg-accent',
                            isSelected && 'selected bg-primary/10'
                          )}
                          onClick={() => handleSelectModel(model.id)}
                          role="option"
                          aria-selected={isSelected}
                        >
                          {isSelected && <Check className="size-3.5 text-primary shrink-0" />}
                          <span
                            className={cn(
                              'popup-option-name flex-1 font-medium flex items-center gap-1.5',
                              isSelected && 'text-primary'
                            )}
                          >
                            {model.name}
                            {isDefault && (
                              <span className="text-[0.65rem] bg-primary/10 text-primary py-px px-1.5 rounded font-normal">
                                Standard
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                    {selectedModel && selectedModel !== defaultModel && (
                      <>
                        <div className="h-px bg-border my-1" />
                        <div
                          className="popup-option popup-action flex items-center gap-2 py-2.5 px-3.5 cursor-pointer transition-colors duration-150 text-sm text-muted-foreground hover:text-primary hover:bg-accent"
                          onClick={() => {
                            setModelAsDefault(selectedModel);
                            setShowModelPopup(false);
                          }}
                        >
                          <span className="popup-option-name flex-1 font-medium">
                            Als Standard festlegen
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex-1" />

          {queuePosition > 0 && (
            <span className="chat-status-pill inline-flex items-center gap-1.5 text-xs py-1 px-2.5 rounded-full bg-primary/5 text-muted-foreground shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-[queue-pulse_1.5s_ease-in-out_infinite] shrink-0" />
              <span>#{queuePosition}</span>
              {globalQueue.pending_count > 1 && (
                <span className="text-muted-foreground/60 text-[0.65rem]">
                  von {globalQueue.pending_count}
                </span>
              )}
            </span>
          )}
        </div>

        <div className="chat-input-row flex items-end gap-3 py-3 px-4">
          <textarea
            ref={inputRef}
            className="flex-1 bg-transparent border-none py-2 px-1 text-foreground text-[1.05rem] font-[inherit] leading-relaxed min-w-0 min-h-[40px] max-h-[200px] resize-none overflow-y-auto focus:outline-none placeholder:text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={useRAG ? 'Frage zu Dokumenten stellen...' : 'Nachricht eingeben...'}
            rows={1}
            disabled={disabled}
            aria-label="Nachricht eingeben"
          />

          {isStreaming ? (
            <button
              type="button"
              className="cancel-btn size-10 min-w-[40px] bg-destructive/15 border-none rounded-full text-destructive cursor-pointer flex items-center justify-center transition-all duration-150 shrink-0 hover:bg-destructive/20 hover:scale-105"
              onClick={handleCancel}
              title="Abbrechen"
              aria-label="Abbrechen"
            >
              <X className="size-5" />
            </button>
          ) : (
            <button
              type="button"
              className="send-btn size-10 min-w-[40px] bg-primary border-none rounded-full text-white cursor-pointer flex items-center justify-center transition-all duration-150 shrink-0 hover:bg-primary/80 hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-border"
              onClick={handleSend}
              disabled={!input.trim() || disabled || isLoading}
              title="Senden"
              aria-label="Senden"
            >
              <ArrowUp className="size-5" />
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
