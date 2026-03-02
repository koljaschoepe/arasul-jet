import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import {
  FiAlertCircle,
  FiChevronDown,
  FiX,
  FiArrowDown,
  FiSearch,
  FiCpu,
  FiArrowUp,
  FiBox,
  FiFolder,
  FiCheck,
  FiStar,
  FiEdit2,
} from 'react-icons/fi';
const ProjectModal = lazy(() => import('../projects/ProjectModal'));
import ChatMessage from './ChatMessage';
import ChatTabsBar from './ChatTabsBar';
import useChatActions from './useChatActions';
import useChatStreaming from './useChatStreaming';
import { useApi } from '../../hooks/useApi';
import './chatmulti.css';

function ChatMulti() {
  const api = useApi();

  // Chat list state
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [loadingChats, setLoadingChats] = useState(true);

  // Current chat state
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [useRAG, setUseRAG] = useState(true);
  const [useThinking, setUseThinking] = useState(true);

  // Model selection
  const [selectedModel, setSelectedModel] = useState(''); // '' = default
  const [installedModels, setInstalledModels] = useState([]);
  const [defaultModel, setDefaultModel] = useState('');
  const [loadedModel, setLoadedModel] = useState(null); // Currently loaded in RAM
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const modelDropdownRef = useRef(null);
  // P4-003: Favorite models (persisted in localStorage)
  const [favoriteModels, setFavoriteModels] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('arasul_favorite_models') || '[]');
    } catch {
      return [];
    }
  });

  // Knowledge Spaces (RAG 2.0)
  const [spaces, setSpaces] = useState([]);
  const [selectedSpaces, setSelectedSpaces] = useState([]); // empty = auto-routing
  const [showSpacesDropdown, setShowSpacesDropdown] = useState(false);
  const [matchedSpaces, setMatchedSpaces] = useState([]); // Spaces matched by auto-routing
  const spacesDropdownRef = useRef(null);

  // Project context
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [currentProject, setCurrentProject] = useState(null);
  const [showProjectModal, setShowProjectModal] = useState(false);

  // Background job tracking - enables tab-switch resilience
  const [activeJobIds, setActiveJobIds] = useState({}); // chatId -> jobId

  // Queue tracking - shows position in queue for pending jobs
  const [globalQueue, setGlobalQueue] = useState({ pending_count: 0, processing: null, queue: [] });

  // UI state
  const [editingChatId, setEditingChatId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Scroll control state
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Refs
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const tabsContainerRef = useRef(null);
  const currentChatIdRef = useRef(currentChatId); // Track current chat for streaming callbacks
  const abortControllersRef = useRef({}); // Track abort controllers per chat
  const generationRef = useRef(0); // RACE-001: Generation counter to detect chat switches during async operations

  // Keep ref in sync with state + abort previous chat's streams (RC-003)
  useEffect(() => {
    const previousChatId = currentChatIdRef.current;
    currentChatIdRef.current = currentChatId;

    // RC-003: Abort previous chat's active stream to prevent resource leaks
    if (
      previousChatId &&
      previousChatId !== currentChatId &&
      abortControllersRef.current[previousChatId]
    ) {
      abortControllersRef.current[previousChatId].abort();
      delete abortControllersRef.current[previousChatId];
    }
  }, [currentChatId]);

  // Chat actions hook
  const {
    createNewChat,
    selectChat,
    deleteChat,
    startEditingTitle,
    saveTitle,
    cancelEditingTitle,
    handleTitleKeyDown,
    exportChat,
  } = useChatActions({
    chats,
    setChats,
    currentChatId,
    setCurrentChatId,
    setMessages,
    setInput,
    setError,
    setLoadingChats,
    editingTitle,
    setEditingChatId,
    setEditingTitle,
    currentProjectId,
  });

  // Streaming deps ref - updated each render to break circular dependency
  const streamingDepsRef = useRef({});

  // Streaming hook (also provides resetTokenBatch for cleanup)
  const {
    reconnectToJob,
    handleSend: streamSend,
    resetTokenBatch,
  } = useChatStreaming({
    depsRef: streamingDepsRef,
    currentChatIdRef,
    abortControllersRef,
    setMessages,
    setIsLoading,
    setError,
    setActiveJobIds,
    setMatchedSpaces,
    selectedModel,
    setSelectedModel,
  });

  // CLEANUP-001: Cleanup all abort controllers and timers on unmount
  useEffect(() => {
    return () => {
      Object.values(abortControllersRef.current).forEach(controller => {
        if (controller && typeof controller.abort === 'function') {
          controller.abort();
        }
      });
      abortControllersRef.current = {};
      resetTokenBatch();
    };
  }, [resetTokenBatch]);

  // Load project info when project changes
  useEffect(() => {
    if (!currentProjectId) {
      setCurrentProject(null);
      return;
    }
    const controller = new AbortController();
    api
      .get(`/projects/${currentProjectId}`, { signal: controller.signal, showError: false })
      .then(data => {
        setCurrentProject(data.project || null);
        // Auto-select knowledge space if project has one
        if (data.project?.knowledge_space_id) {
          setSelectedSpaces([data.project.knowledge_space_id]);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [currentProjectId, api]);

  // Load all chats on mount
  useEffect(() => {
    loadChats();
  }, []);

  // Load installed models on mount
  useEffect(() => {
    loadInstalledModels();
  }, []);

  // Close model dropdown when clicking outside
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

  // Load installed models from API
  const loadInstalledModels = async () => {
    try {
      const [installedRes, defaultRes, loadedRes] = await Promise.all([
        api.get('/models/installed', { showError: false }),
        api.get('/models/default', { showError: false }),
        api.get('/models/loaded', { showError: false }).catch(() => null),
      ]);

      const models = installedRes.models || [];
      setInstalledModels(models);

      // API returns { default_model: "model-id" }
      if (defaultRes.default_model) {
        setDefaultModel(defaultRes.default_model);
      }

      // Track currently loaded model in RAM
      if (loadedRes?.model_id) {
        setLoadedModel(loadedRes.model_id);
      }
    } catch (err) {
      console.error('Error loading models:', err);
      // Non-blocking error - models will just show default
    }
  };

  // Set a model as the new default
  const setModelAsDefault = async modelId => {
    try {
      await api.post('/models/default', { model_id: modelId }, { showError: false });
      setDefaultModel(modelId);
      // If "Standard" was selected, keep it as default but update the actual default model
    } catch (err) {
      console.error('Error setting default model:', err);
    }
  };

  // Load Knowledge Spaces for RAG 2.0
  const loadSpaces = async () => {
    try {
      const data = await api.get('/spaces', { showError: false });
      setSpaces(data.spaces || []);
    } catch (err) {
      console.error('Error loading spaces:', err);
    }
  };

  // Load spaces on mount (for RAG filtering)
  useEffect(() => {
    loadSpaces();
  }, []);

  // Toggle space selection
  const toggleSpaceSelection = spaceId => {
    setSelectedSpaces(prev => {
      if (prev.includes(spaceId)) {
        return prev.filter(id => id !== spaceId);
      } else {
        return [...prev, spaceId];
      }
    });
  };

  // Clear all space selections (use auto-routing)
  const clearSpaceSelection = () => {
    setSelectedSpaces([]);
    setShowSpacesDropdown(false);
  };

  // Load messages when chat changes and check for active jobs
  // IMPORTANT: Sequential execution to avoid race conditions
  useEffect(() => {
    if (currentChatId) {
      initializeChat(currentChatId);
    }
  }, [currentChatId]);

  // Sequential chat initialization to fix race condition
  // RACE-001: Uses generation counter to prevent stale updates from previous chats
  // RC-002 FIX: setMessages is called AFTER generation check, not inside loadMessages
  const initializeChat = async chatId => {
    // Increment generation counter - any ongoing async operations for previous chat will be ignored
    const currentGeneration = ++generationRef.current;

    // RC-003: Abort of previous chat's stream is handled by the ref-syncing effect,
    // which fires before this effect and captures previousChatId before updating the ref.

    // Reset UI state
    setIsLoading(false);
    setError(null);
    setIsUserScrolling(false);

    // 1. FIRST: Load messages (now includes live content from llm_jobs)
    const msgs = await loadMessages(chatId);

    // RC-002 FIX: Check if chat changed BEFORE setting messages
    if (generationRef.current !== currentGeneration) {
      // [ChatMulti] initializeChat: chat changed during loadMessages, aborting (gen ${currentGeneration} vs ${generationRef.current})
      return;
    }

    // RC-002 FIX: Now safe to set messages - generation is still current
    setMessages(msgs);

    // 2. THEN: Check for active jobs
    const activeJob = await checkActiveJobsAsync(chatId);

    // RACE-001: Check again after async operation
    if (generationRef.current !== currentGeneration) {
      // [ChatMulti] initializeChat: chat changed during checkActiveJobs, aborting
      return;
    }

    // 3. If active job exists: reconnect to stream
    if (activeJob) {
      setIsLoading(true);
      reconnectToJob(activeJob.id, chatId);
    }
  };

  // Async version of checkActiveJobs that returns the active job
  const checkActiveJobsAsync = async chatId => {
    try {
      const data = await api.get(`/chats/${chatId}/jobs`, { showError: false });
      const jobs = data.jobs || [];

      // Find first active job (streaming or pending)
      const activeJob = jobs.find(j => j.status === 'streaming' || j.status === 'pending');

      if (activeJob) {
        setActiveJobIds(prev => ({ ...prev, [chatId]: activeJob.id }));
        return activeJob;
      }
      return null;
    } catch (err) {
      console.error('Error checking active jobs:', err);
      return null;
    }
  };

  // Smart auto-scroll
  useEffect(() => {
    if (!isUserScrolling && messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, isUserScrolling]);

  // Queue polling - updates queue status when there are active jobs
  useEffect(() => {
    if (Object.keys(activeJobIds).length === 0) {
      // No active jobs, clear queue state
      setGlobalQueue({ pending_count: 0, processing: null, queue: [] });
      return;
    }

    const pollQueue = async () => {
      try {
        const queueData = await api.get('/llm/queue', { showError: false });
        setGlobalQueue(queueData);
      } catch (err) {
        console.error('Error polling queue:', err);
      }
    };

    // Initial poll
    pollQueue();

    // Poll every 2 seconds while there are active jobs
    const interval = setInterval(pollQueue, 2000);
    return () => clearInterval(interval);
  }, [activeJobIds]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleScroll = useCallback(
    e => {
      const { scrollTop, scrollHeight, clientHeight } = e.target;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const isAtBottom = distanceFromBottom < 100;

      setIsUserScrolling(!isAtBottom);
      setShowScrollButton(!isAtBottom && messages.length > 0);
    },
    [messages.length]
  );

  const loadChats = async () => {
    try {
      setLoadingChats(true);
      const data = await api.get('/chats', { showError: false });
      const chatList = data.chats || [];
      setChats(chatList);

      // Check if sidebar selected a specific chat
      const sidebarSelectedChat = localStorage.getItem('arasul_selected_chat');
      if (sidebarSelectedChat) {
        localStorage.removeItem('arasul_selected_chat');
        const chatId = parseInt(sidebarSelectedChat, 10);
        const chat = chatList.find(c => c.id === chatId);
        if (chat) {
          setCurrentChatId(chat.id);
          if (chat.project_id) setCurrentProjectId(chat.project_id);
          return;
        }
      }

      if (!currentChatId && chatList.length > 0) {
        setCurrentChatId(chatList[0].id);
        if (chatList[0].project_id) setCurrentProjectId(chatList[0].project_id);
      } else if (chatList.length === 0) {
        await createNewChat();
        return;
      }
    } catch (err) {
      console.error('Error loading chats:', err);
    } finally {
      setLoadingChats(false);
    }
  };

  // RC-002 FIX: loadMessages no longer calls setMessages directly
  // This allows the caller to check generation counter before updating state
  const loadMessages = async chatId => {
    try {
      const data = await api.get(`/chats/${chatId}/messages`, { showError: false });
      const msgs = data.messages || [];

      const formattedMessages = msgs.map(msg => ({
        role: msg.role,
        content: msg.content || '',
        thinking: msg.thinking || '',
        hasThinking: !!(msg.thinking && msg.thinking.length > 0),
        thinkingCollapsed: true,
        sources: msg.sources || [],
        sourcesCollapsed: true,
        status: msg.status || 'completed',
        jobId: msg.job_id, // Important: track job_id for reconnection
        jobStatus: msg.job_status, // Track job status for UI
      }));

      // RC-002: Return messages without setting state - caller will set state after generation check
      return formattedMessages;
    } catch (err) {
      console.error('Error loading messages:', err);
      return [];
    }
  };

  const saveMessage = async (chatId, role, content, thinking = null) => {
    try {
      await api.post(
        `/chats/${chatId}/messages`,
        { role, content, thinking },
        { showError: false }
      );
      loadChats();
    } catch (err) {
      console.error('Error saving message:', err);
    }
  };

  // MEDIUM-PRIORITY-FIX 3.5: Memoized toggle functions to prevent unnecessary re-renders
  const toggleThinking = useCallback(index => {
    setMessages(prevMessages => {
      const updated = [...prevMessages];
      updated[index] = {
        ...updated[index],
        thinkingCollapsed: !updated[index].thinkingCollapsed,
      };
      return updated;
    });
  }, []);

  // P4-003: Toggle favorite model
  const toggleFavorite = useCallback(modelId => {
    setFavoriteModels(prev => {
      const newFavorites = prev.includes(modelId)
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId];
      localStorage.setItem('arasul_favorite_models', JSON.stringify(newFavorites));
      return newFavorites;
    });
  }, []);

  const toggleSources = useCallback(index => {
    setMessages(prevMessages => {
      const updated = [...prevMessages];
      updated[index] = {
        ...updated[index],
        sourcesCollapsed: !updated[index].sourcesCollapsed,
      };
      return updated;
    });
  }, []);

  const toggleQueryOpt = useCallback(index => {
    setMessages(prevMessages => {
      const updated = [...prevMessages];
      updated[index] = {
        ...updated[index],
        queryOptCollapsed: !updated[index].queryOptCollapsed,
      };
      return updated;
    });
  }, []);

  const toggleContext = useCallback(index => {
    setMessages(prevMessages => {
      const updated = [...prevMessages];
      updated[index] = {
        ...updated[index],
        contextCollapsed: !updated[index].contextCollapsed,
      };
      return updated;
    });
  }, []);

  // Update streaming deps ref each render
  streamingDepsRef.current = { loadMessages, loadChats, loadInstalledModels, saveMessage };

  // Wrapper: captures current state for streamSend
  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    if (!currentChatId) {
      setError('Chat nicht bereit. Bitte warte einen Moment...');
      return;
    }
    setInput('');
    setError(null);
    setIsUserScrolling(false);
    streamSend({
      input,
      messages,
      currentChatId,
      useRAG,
      useThinking,
      selectedSpaces,
      matchedSpaces,
    });
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyboardShortcuts = e => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 't') {
          e.preventDefault();
          createNewChat();
        }
      }
    };

    window.addEventListener('keydown', handleKeyboardShortcuts);
    return () => window.removeEventListener('keydown', handleKeyboardShortcuts);
  }, [chats]);

  const hasMessages = messages.length > 0;

  return (
    <main
      className={`chat-container ${hasMessages ? 'has-messages' : 'empty-state'} ${loadingChats ? 'is-loading' : 'is-ready'}`}
      role="main"
      aria-label="AI Chat"
      aria-busy={loadingChats}
    >
      <ChatTabsBar
        chats={chats}
        currentChatId={currentChatId}
        activeJobIds={activeJobIds}
        globalQueue={globalQueue}
        editingChatId={editingChatId}
        editingTitle={editingTitle}
        tabsContainerRef={tabsContainerRef}
        onCreateNewChat={createNewChat}
        onSelectChat={chatId => {
          selectChat(chatId);
          const chat = chats.find(c => c.id === chatId);
          setCurrentProjectId(chat?.project_id || null);
        }}
        onStartEditingTitle={startEditingTitle}
        onEditingTitleChange={setEditingTitle}
        onTitleKeyDown={handleTitleKeyDown}
        onSaveTitle={saveTitle}
        onExportChat={exportChat}
        onDeleteChat={deleteChat}
        currentProject={currentProject}
      />

      {/* Project Banner */}
      {currentProject && (
        <div
          className="project-banner"
          style={{ borderColor: currentProject.color || 'var(--primary-color)' }}
        >
          <span
            className="project-banner-dot"
            style={{ backgroundColor: currentProject.color || 'var(--primary-color)' }}
          />
          <span className="project-banner-name">{currentProject.name}</span>
          {currentProject.system_prompt && (
            <span className="project-banner-prompt" title={currentProject.system_prompt}>
              System-Prompt aktiv
            </span>
          )}
          {currentProject.space_name && (
            <span className="project-banner-space">
              <FiFolder style={{ fontSize: '0.7rem' }} /> {currentProject.space_name}
            </span>
          )}
          <button
            type="button"
            className="project-banner-edit"
            onClick={() => setShowProjectModal(true)}
            title="Projekt bearbeiten"
          >
            <FiEdit2 />
          </button>
        </div>
      )}

      {/* Messages Area */}
      {hasMessages && (
        <div
          className="chat-messages"
          ref={messagesContainerRef}
          onScroll={handleScroll}
          role="log"
          aria-label="Chat-Nachrichten"
          aria-live="polite"
          aria-relevant="additions"
        >
          <div className="messages-wrapper">
            {messages.map((message, index) => (
              <ChatMessage
                key={message.id || message.jobId || `${currentChatId}-msg-${index}`}
                message={message}
                index={index}
                chatId={currentChatId}
                isLoading={isLoading}
                onToggleThinking={toggleThinking}
                onToggleSources={toggleSources}
                onToggleQueryOpt={toggleQueryOpt}
                onToggleContext={toggleContext}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Scroll to bottom button */}
          {showScrollButton && (
            <button
              type="button"
              className="scroll-bottom-btn"
              onClick={() => {
                setIsUserScrolling(false);
                scrollToBottom();
              }}
              aria-label="Zum Ende scrollen"
            >
              <FiArrowDown aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* Centered Input Section */}
      <div className={`chat-input-section ${hasMessages ? 'bottom' : 'centered'}`}>
        {/* Welcome text - only when empty */}
        {!hasMessages && <div className="welcome-text">Wie kann ich dir heute helfen?</div>}

        {/* Error Display */}
        {error && (
          <div className="error-banner" role="alert">
            <FiAlertCircle aria-hidden="true" />
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Fehlermeldung schließen"
            >
              <FiX aria-hidden="true" />
            </button>
          </div>
        )}

        {/* P2-001/P2-003: Model Capability Warnings */}
        {(() => {
          const currentModel = selectedModel
            ? installedModels.find(m => m.id === selectedModel)
            : installedModels.find(m => m.id === defaultModel);

          const showThinkWarning =
            useThinking && currentModel && currentModel.supports_thinking === false;
          const showRagWarning = useRAG && currentModel && currentModel.rag_optimized === false;

          if (showThinkWarning || showRagWarning) {
            return (
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
            );
          }
          return null;
        })()}

        {/* Main Input Box - Single Row */}
        <div className="input-box" role="toolbar" aria-label="Chat-Eingabe Optionen">
          {/* RAG Toggle Button */}
          <button
            type="button"
            className={`input-toggle rag-toggle ${useRAG ? 'active' : ''}`}
            onClick={() => setUseRAG(!useRAG)}
            aria-pressed={useRAG}
            aria-label={
              useRAG ? 'RAG deaktivieren (Dokumentensuche)' : 'RAG aktivieren (Dokumentensuche)'
            }
          >
            <FiSearch aria-hidden="true" />
            {useRAG && <span>RAG</span>}
          </button>

          {/* Space Filter (RAG 2.0) - Only shown when RAG is active */}
          {useRAG && spaces.length > 0 && (
            <div className="space-selector" ref={spacesDropdownRef}>
              <button
                type="button"
                className={`input-toggle space-toggle ${selectedSpaces.length > 0 ? 'active' : ''}`}
                onClick={() => setShowSpacesDropdown(!showSpacesDropdown)}
                aria-expanded={showSpacesDropdown}
                aria-haspopup="listbox"
                aria-label={
                  selectedSpaces.length > 0
                    ? `${selectedSpaces.length} Bereiche ausgewählt`
                    : 'Alle Bereiche (Auto-Routing)'
                }
              >
                <FiFolder />
                <span className="space-toggle-label">
                  {selectedSpaces.length > 0 ? `${selectedSpaces.length} Bereiche` : 'Auto'}
                </span>
                <FiChevronDown className={`dropdown-arrow ${showSpacesDropdown ? 'open' : ''}`} />
              </button>
              {showSpacesDropdown && (
                <div className="space-dropdown" role="listbox" aria-label="Bereiche auswählen">
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

          {/* Thinking Toggle Button */}
          <button
            type="button"
            className={`input-toggle think-toggle ${useThinking ? 'active' : ''}`}
            onClick={() => setUseThinking(!useThinking)}
            aria-pressed={useThinking}
            aria-label={useThinking ? 'Thinking-Modus deaktivieren' : 'Thinking-Modus aktivieren'}
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
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                aria-expanded={showModelDropdown}
                aria-haspopup="listbox"
                aria-label="Modell auswählen"
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
                <div className="model-dropdown" role="listbox" aria-label="Modell auswählen">
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
                  {/* P4-003: Sort models - favorites first, then by category */}
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
                      // Check if this model is currently loaded in RAM (compare by ollama_name or id)
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
                            {/* P4-003: Favorite toggle button */}
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
                                    title="Unterstützt Think-Mode"
                                  >
                                    💭
                                  </span>
                                )}
                                {model.rag_optimized && (
                                  <span
                                    style={{ color: 'var(--success-color)', marginLeft: '4px' }}
                                    title="RAG-optimiert"
                                  >
                                    📚
                                  </span>
                                )}
                                {isLoaded && (
                                  <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
                                    • Aktiv
                                  </span>
                                )}
                                {!isDefault && isAvailable && (
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
                              </>
                            )}
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* Text Input */}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={useRAG ? 'Frage zu Dokumenten stellen...' : 'Nachricht eingeben...'}
            disabled={isLoading || loadingChats || !currentChatId}
            aria-label={useRAG ? 'Frage zu Dokumenten eingeben' : 'Chat-Nachricht eingeben'}
            aria-describedby={isLoading ? 'chat-loading-status' : undefined}
          />
          {isLoading && (
            <span id="chat-loading-status" className="sr-only">
              Antwort wird generiert...
            </span>
          )}

          {/* Send Button */}
          <button
            type="button"
            className="send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isLoading || loadingChats || !currentChatId}
            aria-label="Nachricht senden"
          >
            <FiArrowUp aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Project Modal */}
      {showProjectModal && (
        <Suspense fallback={null}>
          <ProjectModal
            isOpen={showProjectModal}
            onClose={() => setShowProjectModal(false)}
            onSave={project => {
              if (project) {
                setCurrentProject(project);
                setCurrentProjectId(project.id);
              } else {
                // Project deleted
                setCurrentProject(null);
                setCurrentProjectId(null);
              }
              setShowProjectModal(false);
            }}
            project={currentProject}
            mode={currentProject ? 'edit' : 'create'}
          />
        </Suspense>
      )}
    </main>
  );
}

export default ChatMulti;
