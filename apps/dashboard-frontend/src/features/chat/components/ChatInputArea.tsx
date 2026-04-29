import { useState, useRef, useEffect, useCallback, memo } from 'react';
import {
  Search,
  Cpu,
  Box,
  Check,
  AlertCircle,
  ArrowUp,
  X,
  ChevronUp,
  Paperclip,
  FileText,
  RotateCcw,
} from 'lucide-react';
import { useChatContext, type ChatMessage, type ChatSettings } from '../../../contexts/ChatContext';
import { useToast } from '../../../contexts/ToastContext';
import { useApi } from '../../../hooks/useApi';
import type { InstalledModel, DocumentSpace, QueueJob } from '../../../types';
import { cn } from '@/lib/utils';
import '../chat.css';

interface ChatInputAreaProps {
  chatId: number;
  chatSettings: ChatSettings | null;
  messagesRef: React.MutableRefObject<ChatMessage[]>;
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
  const toast = useToast();
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
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachedImages, setAttachedImages] = useState<{ file: File; base64: string }[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelPopupRef = useRef<HTMLDivElement>(null);
  const ragPopupRef = useRef<HTMLDivElement>(null);
  // Store last send params for retry on error
  const lastSendRef = useRef<{ msg: string; options: Parameters<typeof sendMessage>[2] } | null>(
    null
  );
  // Phase 4.2: while a cancel DELETE is in flight, gate both Send and Cancel
  // so a fast user-click doesn't fire DELETE+POST out of order. Without
  // this gate, hitting Cancel then immediately Enter would race the new
  // send against the still-pending old job and produce duplicate messages.
  const [isCancelling, setIsCancelling] = useState(false);

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
  }, [chatId, chatSettings, setSelectedModel]);

  // FH4: Only attach listener when a popup is open, ensuring proper cleanup on each toggle
  useEffect(() => {
    if (!showModelPopup && !showRAGPopup) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        showModelPopup &&
        modelPopupRef.current &&
        !modelPopupRef.current.contains(e.target as Node)
      ) {
        setShowModelPopup(false);
      }
      if (showRAGPopup && ragPopupRef.current && !ragPopupRef.current.contains(e.target as Node)) {
        setShowRAGPopup(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showModelPopup, showRAGPopup]);

  useEffect(() => {
    if (!isLoading && !disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading, disabled, chatId]);

  const saveSettings = useCallback(
    (updates: Record<string, unknown>) => {
      if (!chatId) return;
      api.patch(`/chats/${chatId}/settings`, updates, { showError: false });
    },
    [chatId, api]
  );

  const queuePosition = (() => {
    if (!activeJobIds[chatId]) return 0;
    const jobId = activeJobIds[chatId];
    const idx = globalQueue.queue?.findIndex((j: QueueJob) => j.id === jobId);
    return idx >= 0 ? idx + 1 : 0;
  })();

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, []);

  const ALLOWED_FILE_TYPES =
    '.pdf,.docx,.txt,.md,.markdown,.yaml,.yml,.png,.jpg,.jpeg,.tiff,.tif,.bmp';
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  const handleFileSelect = useCallback(
    (file: File) => {
      const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
      const allowedExts = ALLOWED_FILE_TYPES.split(',');
      if (!allowedExts.includes(ext)) {
        toast.warning(
          `Dateityp ${ext} nicht unterstützt. Erlaubt: PDF, DOCX, TXT, MD, YAML, Bilder`
        );
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.warning(`Datei zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: 50 MB`);
        return;
      }
      setAttachedFile(file);
      inputRef.current?.focus();
    },
    [toast]
  );

  const handleRemoveFile = useCallback(() => {
    setAttachedFile(null);
    inputRef.current?.focus();
  }, []);

  const handleImageSelect = useCallback(
    async (files: FileList | File[]) => {
      const MAX_IMAGES = 5;
      const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB per image
      const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

      const remaining = MAX_IMAGES - attachedImages.length;
      if (remaining <= 0) {
        toast.warning(`Maximal ${MAX_IMAGES} Bilder pro Nachricht`);
        return;
      }
      const filesToProcess = Array.from(files).slice(0, remaining);
      const rejected: string[] = [];

      for (const file of filesToProcess) {
        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
          rejected.push(`${file.name} (Typ nicht unterstützt)`);
          continue;
        }
        if (file.size > MAX_IMAGE_SIZE) {
          rejected.push(`${file.name} (zu groß, max. 20 MB)`);
          continue;
        }

        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
            reader.readAsDataURL(file);
          });
          setAttachedImages(prev => [...prev, { file, base64 }]);
        } catch {
          rejected.push(`${file.name} (Lesefehler)`);
        }
      }

      if (rejected.length > 0) {
        toast.warning(`Übersprungen: ${rejected.join(', ')}`);
      }
      inputRef.current?.focus();
    },
    [attachedImages.length, toast]
  );

  const handleRemoveImage = useCallback((index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Model state needed by handleDrop and render — must be declared before callbacks that reference it
  const availableModels = installedModels.filter(
    (m: InstalledModel) =>
      (m.install_status === 'available' || m.status === 'available') && m.model_type !== 'ocr'
  );

  const currentModel = selectedModel
    ? installedModels.find((m: InstalledModel) => m.id === selectedModel)
    : installedModels.find((m: InstalledModel) => m.id === defaultModel);

  // Vision: Check if selected model supports image input
  const supportsVision =
    currentModel?.supports_vision_input === true || currentModel?.model_type === 'vision';

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const files = e.dataTransfer.files;
      if (!files || files.length === 0) return;

      // If vision model is active and dropped file is an image, use image handler
      const firstFile = files[0];
      const isImage = firstFile.type.startsWith('image/');
      if (isImage && supportsVision) {
        handleImageSelect(files);
      } else {
        handleFileSelect(firstFile);
      }
    },
    [handleFileSelect, handleImageSelect, supportsVision]
  );

  const handleUnifiedFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const imageFiles: File[] = [];
      let docFile: File | null = null;

      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/') && supportsVision) {
          imageFiles.push(file);
        } else if (!docFile) {
          docFile = file;
        }
      }

      if (imageFiles.length > 0) handleImageSelect(imageFiles);
      if (docFile) handleFileSelect(docFile);

      e.target.value = '';
    },
    [supportsVision, handleImageSelect, handleFileSelect]
  );

  const hasAttachments = !!attachedFile || attachedImages.length > 0;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSend = useCallback(() => {
    const hasInput = input.trim() || attachedFile || attachedImages.length > 0;
    if (!hasInput || isLoading || disabled || isCancelling) return;

    const msg =
      input.trim() ||
      (attachedFile
        ? `Dokument: ${attachedFile.name}`
        : attachedImages.length > 0
          ? `[${attachedImages.length} Bild${attachedImages.length > 1 ? 'er' : ''}]`
          : '');
    const file = attachedFile;
    const imageBase64s = attachedImages.map(img => img.base64);
    setInput('');
    setAttachedFile(null);
    setAttachedImages([]);
    if (inputRef.current) inputRef.current.style.height = 'auto';

    const options = {
      useRAG: file ? false : useRAG, // file upload uses its own pipeline
      useThinking,
      selectedSpaces: selectedSpaceId ? [selectedSpaceId] : [],
      matchedSpaces: [],
      messages: messagesRef?.current || [],
      model: selectedModel || undefined,
      file: file || undefined,
      images: imageBase64s.length > 0 ? imageBase64s : undefined,
    };
    lastSendRef.current = { msg, options };
    sendMessage(chatId, msg, options);
  }, [
    input,
    attachedFile,
    attachedImages,
    isLoading,
    disabled,
    isCancelling,
    chatId,
    sendMessage,
    useRAG,
    useThinking,
    selectedSpaceId,
    messagesRef,
    selectedModel,
  ]);

  const handleRetry = useCallback(() => {
    if (!lastSendRef.current || isLoading || disabled) return;
    const { msg, options } = lastSendRef.current;
    onClearError();
    sendMessage(chatId, msg, { ...options, messages: messagesRef?.current || [] });
  }, [chatId, sendMessage, isLoading, disabled, onClearError, messagesRef]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleCancel = useCallback(async () => {
    // Reentrancy guard: if a cancel is already in flight, ignore additional
    // clicks. The button is also disabled in render, but state updates lag
    // user clicks by one frame so this is the authoritative check.
    if (isCancelling) return;
    setIsCancelling(true);
    try {
      await cancelJob(chatId);
    } finally {
      setIsCancelling(false);
    }
  }, [cancelJob, chatId, isCancelling]);

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

  const showThinkWarning = useThinking && currentModel && currentModel.supports_thinking === false;
  const showRagWarning = useRAG && currentModel && currentModel.rag_optimized === false;

  const selectedSpace = selectedSpaceId
    ? spaces.find((s: DocumentSpace) => s.id === selectedSpaceId)
    : null;

  return (
    <div
      className={cn(
        'chat-input-section flex flex-col items-center py-3 px-5 pb-5 w-full shrink-0',
        !hasMessages && 'centered justify-center flex-1'
      )}
    >
      {error && (
        <div
          className="error-banner flex items-center gap-3 w-full max-w-[960px] py-3 px-4 bg-destructive/10 border border-destructive/25 rounded-lg text-muted-foreground text-sm mb-4"
          role="alert"
        >
          <AlertCircle className="shrink-0 size-[18px] text-destructive" aria-hidden="true" />
          <span className="flex-1">{error}</span>
          {lastSendRef.current && (
            <button
              type="button"
              className="bg-transparent border-none text-muted-foreground cursor-pointer p-1.5 rounded flex items-center gap-1 text-xs hover:bg-primary/10 hover:text-primary whitespace-nowrap"
              onClick={handleRetry}
              aria-label="Erneut versuchen"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Erneut versuchen</span>
            </button>
          )}
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
          className="capability-warning flex items-center gap-2.5 w-full max-w-[960px] py-2.5 px-3.5 bg-muted/50 border border-border rounded-lg text-muted-foreground text-xs mb-3"
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

      <div className="chat-input-card w-full max-w-[960px] bg-card border border-white/[0.04] rounded-xl overflow-visible transition-all duration-200 relative focus-within:border-foreground/25">
        <div
          className="chat-toolbar flex items-center gap-2 py-2 px-4 border-b border-border bg-background rounded-t-xl"
          role="toolbar"
          aria-label="Chat-Einstellungen"
        >
          <button
            type="button"
            className={cn(
              'chat-toolbar-btn inline-flex items-center gap-1.5 py-1.5 px-2.5 bg-transparent border border-transparent rounded-md text-muted-foreground text-sm font-medium cursor-pointer transition-all duration-150 h-8 shrink-0 hover:bg-primary/5 hover:text-foreground',
              hasAttachments && 'active bg-primary/15 text-primary border-primary/20'
            )}
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isStreaming}
            aria-label="Datei oder Bild anhängen"
          >
            <Paperclip className="size-4 shrink-0" aria-hidden="true" />
            <span className="toolbar-btn-label uppercase tracking-wide text-xs">Anhang</span>
          </button>

          {availableModels.length > 0 && (
            <>
              <div className="chat-toolbar-divider w-px h-6 bg-border shrink-0" />
              <div className="toolbar-popup-container relative" ref={modelPopupRef}>
                <button
                  type="button"
                  className="chat-toolbar-btn model-toggle inline-flex items-center gap-1.5 py-1.5 px-2.5 bg-transparent border border-transparent rounded-md text-muted-foreground text-sm font-medium cursor-pointer transition-all duration-150 h-8 shrink-0 hover:bg-primary/5 hover:text-foreground"
                  onClick={() => !isStreaming && setShowModelPopup(v => !v)}
                  disabled={isStreaming}
                  title={isStreaming ? 'Warte auf Antwort...' : undefined}
                  aria-expanded={showModelPopup}
                  aria-haspopup="listbox"
                  aria-label="Modell auswählen"
                >
                  <Box className="size-4 shrink-0" aria-hidden="true" />
                  <span className="toolbar-btn-label uppercase tracking-wide text-xs">Model</span>
                  <ChevronUp
                    className={cn(
                      'size-3 transition-transform duration-200',
                      showModelPopup && 'rotate-180'
                    )}
                  />
                </button>
                {showModelPopup && (
                  <div
                    className="toolbar-popup model-popup absolute bottom-[calc(100%+4px)] left-0 min-w-[220px] max-w-[280px] max-h-[320px] overflow-y-auto bg-card rounded-xl shadow-lg z-10 animate-[slideUpFadeIn_200ms_ease-out]"
                    role="listbox"
                    aria-label="Modell auswählen"
                  >
                    {availableModels.map(model => {
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

          <div className="chat-toolbar-divider w-px h-6 bg-border shrink-0" />

          <button
            type="button"
            className={cn(
              'chat-toolbar-btn think-toggle inline-flex items-center gap-1.5 py-1.5 px-2.5 bg-transparent border border-transparent rounded-md text-muted-foreground text-sm font-medium cursor-pointer transition-all duration-150 h-8 shrink-0 hover:bg-primary/5 hover:text-foreground',
              useThinking && 'active bg-primary/15 text-primary border-primary/20'
            )}
            onClick={handleThinkToggle}
            disabled={isStreaming}
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
              disabled={isStreaming}
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
                className="toolbar-popup rag-popup absolute bottom-[calc(100%+4px)] left-0 min-w-[220px] max-w-[280px] max-h-[320px] overflow-y-auto bg-card rounded-xl shadow-lg z-10 animate-[slideUpFadeIn_200ms_ease-out]"
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
                {spaces.map(space => (
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

        {/* Unified hidden file/image input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={supportsVision ? `${ALLOWED_FILE_TYPES},.webp,.gif` : ALLOWED_FILE_TYPES}
          multiple={supportsVision}
          onChange={handleUnifiedFileChange}
          className="hidden"
          aria-hidden="true"
        />

        {/* Image preview thumbnails */}
        {attachedImages.length > 0 && (
          <div className="flex flex-wrap gap-2 mx-4 mt-3 mb-0">
            {attachedImages.map((img, index) => (
              <div
                key={index}
                className="relative group size-20 rounded-lg overflow-hidden border border-primary/20 bg-primary/5"
              >
                <img src={img.base64} alt={img.file.name} className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => handleRemoveImage(index)}
                  className="absolute top-0.5 right-0.5 size-5 bg-background/80 border-none rounded-full text-muted-foreground cursor-pointer flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive hover:bg-destructive/20"
                  aria-label="Bild entfernen"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
            {attachedImages.length < 5 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="size-20 rounded-lg border-2 border-dashed border-border bg-transparent text-muted-foreground cursor-pointer flex items-center justify-center hover:border-primary/40 hover:text-primary transition-colors"
                aria-label="Weiteres Bild hinzufügen"
              >
                <span className="text-xl">+</span>
              </button>
            )}
          </div>
        )}

        {/* File preview chip */}
        {attachedFile && (
          <div className="flex items-center gap-2 mx-4 mt-3 mb-0 py-2 px-3 bg-primary/5 border border-primary/15 rounded-lg text-sm">
            <FileText className="size-4 text-primary shrink-0" />
            <span className="flex-1 truncate text-foreground font-medium">{attachedFile.name}</span>
            <span className="text-muted-foreground text-xs shrink-0">
              {formatFileSize(attachedFile.size)}
            </span>
            <button
              type="button"
              onClick={handleRemoveFile}
              className="bg-transparent border-none text-muted-foreground cursor-pointer p-0.5 rounded hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label="Datei entfernen"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        <div
          className="chat-input-row flex items-end gap-3 py-3 px-4"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
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
              className="cancel-btn size-10 min-w-[40px] bg-destructive/15 border-none rounded-full text-destructive cursor-pointer flex items-center justify-center transition-all duration-150 shrink-0 hover:bg-destructive/20 hover:scale-105 disabled:opacity-50 disabled:cursor-wait"
              onClick={handleCancel}
              disabled={isCancelling}
              title={isCancelling ? 'Abbruch läuft…' : 'Abbrechen'}
              aria-label={isCancelling ? 'Abbruch läuft' : 'Abbrechen'}
            >
              <X className="size-5" />
            </button>
          ) : (
            <button
              type="button"
              className="send-btn size-10 min-w-[40px] bg-primary border-none rounded-full text-white cursor-pointer flex items-center justify-center transition-all duration-150 shrink-0 hover:bg-primary/80 hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-border"
              onClick={handleSend}
              disabled={
                (!input.trim() && !attachedFile && attachedImages.length === 0) ||
                disabled ||
                isLoading ||
                isCancelling
              }
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
