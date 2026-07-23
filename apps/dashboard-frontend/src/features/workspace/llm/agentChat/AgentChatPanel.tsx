/**
 * Kompakter Agent-Chat für das rechte Workspace-Panel — die einzige Chat-UI
 * im Workspace. Läuft ohne eigenen Router direkt auf dem globalen
 * ChatContext (SSE-Streaming, Modelle, RAG) und dem workspaceStore
 * (Ordner-Scope, Dokument-Tabs).
 *
 * Verhalten: RAG ist immer aktiv (außer bei Datei-Anhang — der nutzt die
 * eigene Analyse-Pipeline), Thinking folgt automatisch dem Modell. Statt
 * Schaltern zeigt der Verlauf transparent, was passiert ist (Schritte,
 * Quellen). Chats entstehen lazy beim ersten Senden.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Upload, X } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { useChatContext, type ChatMessage } from '@/contexts/ChatContext';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { usePins } from '../../useWorkspaceContext';
import { useSkills } from '@/hooks/useSkills';
import { useToast } from '@/contexts/ToastContext';
import { ComponentErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Mascot } from '@/components/mascot/Mascot';
import CompactMessage from './CompactMessage';
import ComposerCard from './ComposerCard';
import ConversationList from '../ConversationList';
import RunCard from '@/features/skills/RunCard';
import SkillDialog from '@/features/skills/SkillDialog';

const PANEL_CHAT_KEY = 'arasul_panel_chat_id';
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
const MAX_IMAGES = 4;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Drag-Payloads, die der Explorer setzt (Datei/Ordner → Chat-Kontext). */
export const DND_SCOPE_TYPE = 'application/x-arasul-scope';

export default function AgentChatPanel() {
  const api = useApi();
  const {
    sendMessage,
    cancelJob,
    loadMessages,
    checkActiveJobs,
    reconnectToJob,
    registerMessageCallback,
    unregisterMessageCallback,
    getBackgroundMessages,
    getBackgroundLoading,
    clearBackgroundState,
    hasActiveStream,
    getSkillRuns,
    registerSkillRun,
    setChatSkillRuns,
    installedModels,
    defaultModel,
    selectedModel,
    setSelectedModel,
  } = useChatContext();

  const chatScope = useWorkspaceStore(s => s.chatScope);
  const setChatScope = useWorkspaceStore(s => s.setChatScope);
  const { skills } = useSkills();
  const { pins, removePin } = usePins();
  const toast = useToast();

  const [chatId, setChatId] = useState<string | null>(
    () => localStorage.getItem(PANEL_CHAT_KEY) || null
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [input, setInput] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachedImages, setAttachedImages] = useState<{ file: File; base64: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  // Skill-Namen je Lauf-ID — nur als Kopfzeilen-Hinweis, bevor der Lauf-Strom
  // ihn ohnehin bestätigt (Plan 011, Schritt 15).
  const [runNames, setRunNames] = useState<Record<number, string>>({});

  // Anlege-/Bearbeiten-Dialog (Plan 011, Schritt 17). `null` geschlossen;
  // `{ editName: null }` = anlegen; `{ editName: 'name' }` = bearbeiten.
  const [skillDialog, setSkillDialog] = useState<{ editName: string | null } | null>(null);

  // Die Lauf-IDs dieses Chats (neueste zuerst) — die Karten stehen chronologisch
  // unter den Nachrichten, also älteste zuerst.
  const runIds = chatId ? getSkillRuns(chatId) : [];

  const messagesRef = useRef<ChatMessage[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  // Frisch angelegte Chats überspringen den Lade-Init (es gibt nichts zu laden
  // und der GET würde mit dem laufenden Stream um setMessages konkurrieren).
  const freshChatRef = useRef<string | null>(null);
  const wasLoadingRef = useRef(false);
  // Sperrt eine zweite Skill-Lauf-Auslösung, bis der Start-POST durch ist.
  const runStartRef = useRef(false);

  // --- Chat-Lebenszyklus ------------------------------------------------

  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      setTitle('');
      setError(null);
      return;
    }
    if (freshChatRef.current === chatId) {
      registerMessageCallback(chatId, { setMessages, setIsLoading, setError });
      return () => unregisterMessageCallback(chatId);
    }

    let cancelled = false;
    const bg = getBackgroundMessages(chatId);
    const bgLoading = getBackgroundLoading(chatId) || hasActiveStream(chatId);
    if (bg && bg.length > 0) {
      setMessages(bg);
    }
    setIsLoading(bgLoading);

    const init = async () => {
      try {
        const [chatData, msgResult, activeJob] = await Promise.all([
          api.get<{ chat?: { title?: string } | null }>(`/chats/${chatId}`, { showError: false }),
          loadMessages(chatId),
          checkActiveJobs(chatId),
        ]);
        if (cancelled) return;
        if (!chatData.chat) {
          localStorage.removeItem(PANEL_CHAT_KEY);
          setChatId(null);
          return;
        }
        setTitle(chatData.chat.title || '');

        const latestBg = getBackgroundMessages(chatId) || bg;
        const bgHasContent = latestBg?.some(
          m => m.role === 'assistant' && (m.content || m.thinking)
        );
        const dbHasContent = msgResult.messages.some(
          m => m.role === 'assistant' && (m.content || m.thinking)
        );
        if (latestBg && latestBg.length > 0 && bgHasContent && !dbHasContent) {
          setMessages(latestBg);
        } else {
          setMessages(msgResult.messages);
        }

        registerMessageCallback(chatId, { setMessages, setIsLoading, setError });
        clearBackgroundState(chatId);
        if (activeJob) {
          setIsLoading(true);
          reconnectToJob(activeJob.id, chatId);
        }
      } catch {
        if (!cancelled) {
          localStorage.removeItem(PANEL_CHAT_KEY);
          setChatId(null);
        }
      }
    };
    init();
    return () => {
      cancelled = true;
      unregisterMessageCallback(chatId);
    };
  }, [
    chatId,
    api,
    loadMessages,
    checkActiveJobs,
    reconnectToJob,
    registerMessageCallback,
    unregisterMessageCallback,
    getBackgroundMessages,
    getBackgroundLoading,
    clearBackgroundState,
    hasActiveStream,
  ]);

  // Auto-Titel nach Stream-Ende nachladen (Backend betitelt nach 1. Antwort)
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading && chatId) {
      api
        .get<{ chat?: { title?: string } | null }>(`/chats/${chatId}`, { showError: false })
        .then(d => d.chat?.title && setTitle(d.chat.title))
        .catch(() => undefined);
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading, chatId, api]);

  // Auto-Scroll, solange der Nutzer unten "klebt"
  useEffect(() => {
    if (stickToBottomRef.current) {
      endRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages, runIds.length]);

  const handleScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  // --- Senden -------------------------------------------------------------

  const ensureChat = useCallback(async (): Promise<string> => {
    if (chatId) return chatId;
    const data = await api.post<{ chat: { id: number } }>('/chats', {});
    const id = String(data.chat.id);
    freshChatRef.current = id;
    localStorage.setItem(PANEL_CHAT_KEY, id);
    setChatId(id);
    return id;
  }, [chatId, api]);

  const handleSend = useCallback(async () => {
    const hasInput = input.trim() || attachedFile || attachedImages.length > 0;
    if (!hasInput || isLoading) return;

    const msg =
      input.trim() ||
      (attachedFile
        ? `Dokument: ${attachedFile.name}`
        : `[${attachedImages.length} Bild${attachedImages.length > 1 ? 'er' : ''}]`);
    const file = attachedFile;
    const images = attachedImages.map(i => i.base64);
    setInput('');
    setAttachedFile(null);
    setAttachedImages([]);
    setError(null);

    const effectiveModelId = selectedModel || defaultModel;
    const model = installedModels.find(m => m.id === effectiveModelId);
    const scopeActive = !file && !!chatScope && chatScope.spaceIds.length > 0;

    try {
      const id = await ensureChat();
      sendMessage(id, msg, {
        // Immer-an-Orchestrierung: RAG standardmäßig aktiv; Datei-Anhang
        // nutzt die eigene Dokument-Pipeline, Thinking folgt dem Modell.
        useRAG: !file,
        useThinking: model?.supports_thinking === true,
        selectedSpaces: scopeActive && chatScope ? chatScope.spaceIds : [],
        matchedSpaces: [],
        messages: messagesRef.current,
        model: selectedModel || undefined,
        file: file || undefined,
        images: images.length > 0 ? images : undefined,
      });
      stickToBottomRef.current = true;
    } catch {
      setError('Chat konnte nicht erstellt werden');
    }
  }, [
    input,
    attachedFile,
    attachedImages,
    isLoading,
    chatScope,
    selectedModel,
    defaultModel,
    installedModels,
    ensureChat,
    sendMessage,
  ]);

  // Beim Öffnen eines Chats seine Skill-Läufe vom Server holen (Quelle der
  // Wahrheit); die Karten reihen sich unter die Nachrichten. Frisch gestartete
  // Läufe bleiben durch `setChatSkillRuns` erhalten.
  useEffect(() => {
    if (!chatId) return;
    let cancelled = false;
    api
      // Die Lauf-ID kommt aus einer BIGINT-Spalte und erreicht den Client als
      // String ("10"), während der Start-POST sie als Zahl (10) liefert. Beide
      // MÜSSEN zur selben Zahl normalisiert werden — sonst scheitert der
      // Dublettenschutz (10 !== "10") und derselbe Lauf erscheint doppelt.
      .get<{ data: { id: number | string; skill_name: string }[] }>(
        `/skills/laeufe?conversation_id=${chatId}`,
        { showError: false }
      )
      .then(d => {
        if (cancelled) return;
        setChatSkillRuns(
          chatId,
          d.data.map(r => Number(r.id))
        );
        setRunNames(prev => {
          const next = { ...prev };
          for (const r of d.data) next[Number(r.id)] = r.skill_name;
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [chatId, api, setChatSkillRuns]);

  const handleRunSkill = useCallback(
    async (skillName: string, args: Record<string, string>) => {
      // Doppel-Auslösung sperren: `isLoading` ist der Chat-Stream, nicht der Lauf —
      // ohne eigene Sperre startete ein schnelles Doppel-Enter zwei Läufe (zwei
      // teure GPU-Vorgänge, zwei Karten) für eine Aktion. Erst nach dem POST frei.
      if (isLoading || runStartRef.current) return;
      runStartRef.current = true;
      setInput('');
      setError(null);
      try {
        const id = await ensureChat();
        const res = await api.post<{ data: { runId: number | string } }>('/skills/laeufe', {
          skill: skillName,
          args,
          conversation_id: Number(id),
        });
        // Wie in der Liste: die BIGINT-ID kann als String kommen — zur Zahl
        // normalisieren, damit Registry-Schlüssel und Karten-ID konsistent sind.
        const runId = Number(res.data.runId);
        setRunNames(prev => ({ ...prev, [runId]: skillName }));
        registerSkillRun(id, runId);
        stickToBottomRef.current = true;
      } catch (err) {
        // useApi zeigt die Fehlermeldung bereits als Toast; hier die Zeile oben.
        setError((err as Error).message || 'Skill konnte nicht gestartet werden');
      } finally {
        runStartRef.current = false;
      }
    },
    [isLoading, ensureChat, api, registerSkillRun]
  );

  const handleCancel = useCallback(() => {
    if (chatId) cancelJob(chatId);
  }, [chatId, cancelJob]);

  const startNewChat = useCallback(() => {
    if (chatId) unregisterMessageCallback(chatId);
    localStorage.removeItem(PANEL_CHAT_KEY);
    freshChatRef.current = null;
    setChatId(null);
    setIsLoading(false);
  }, [chatId, unregisterMessageCallback]);

  const switchChat = useCallback((id: number) => {
    freshChatRef.current = null;
    localStorage.setItem(PANEL_CHAT_KEY, String(id));
    setChatId(String(id));
  }, []);

  // --- Anhänge / Drag & Drop ----------------------------------------------

  const pickFile = useCallback((file: File) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.type)) {
      if (file.size > MAX_IMAGE_SIZE) {
        setError(`Bild zu groß (max. 20 MB): ${file.name}`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedImages(prev =>
          prev.length >= MAX_IMAGES ? prev : [...prev, { file, base64: String(reader.result) }]
        );
      };
      reader.readAsDataURL(file);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(`Datei zu groß (max. 50 MB): ${file.name}`);
      return;
    }
    setAttachedFile(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const scopePayload = e.dataTransfer.getData(DND_SCOPE_TYPE);
      if (scopePayload) {
        try {
          const parsed = JSON.parse(scopePayload) as { spaceIds?: string[]; label?: string };
          if (parsed.spaceIds?.length && parsed.label) {
            setChatScope({ spaceIds: parsed.spaceIds, label: parsed.label });
            return;
          }
        } catch {
          /* fällt durch zu Datei-Handling */
        }
      }
      for (const file of Array.from(e.dataTransfer.files)) {
        pickFile(file);
      }
    },
    [pickFile, setChatScope]
  );

  const composerModels = installedModels
    .filter(
      m => (m.install_status ?? m.status ?? 'ready') === 'ready' || m.install_status === undefined
    )
    .map(m => ({ id: m.id, name: m.name }));

  const lastIndex = messages.length - 1;

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragOver={e => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={e => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={handleDrop}
      data-testid="agent-chat-panel"
    >
      {/* Kopfzeile: Maskottchen-Status · Titel · neuer Chat · Verlauf.
          Das Maskottchen „lebt" oben in der Statuszeile (wie im Terminal) und
          gibt ab dem Absenden sofort sichtbares Feedback („denkt nach …"). */}
      <div className="flex h-9 shrink-0 items-center gap-1.5 px-2">
        <Mascot state={isLoading ? 'thinking' : 'idle'} className="size-5" />
        <span
          className="min-w-0 flex-1 truncate text-xs font-medium text-foreground"
          aria-live="polite"
        >
          {isLoading ? 'Arasul denkt nach …' : title || 'Neuer Chat'}
        </span>
        <button
          type="button"
          onClick={startNewChat}
          aria-label="Neuer Chat"
          title="Neuer Chat"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3.5" />
        </button>
        <ConversationList onSelect={switchChat} />
      </div>

      {/* Verlauf */}
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto px-2.5"
        role="log"
        aria-label="Chat-Verlauf"
        aria-live="polite"
      >
        {messages.length === 0 && runIds.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 px-4 text-center">
            <Mascot state="idle" className="mb-1 size-16" />
            <p className="text-sm text-muted-foreground">Frag dein Unternehmenswissen.</p>
            <p className="text-xs text-muted-foreground/60">
              Antworten kommen mit Quellen aus deinen Dokumenten.
            </p>
            <p className="text-xs text-muted-foreground/60">
              Dateien oder Ordner einfach hierher ziehen.
            </p>
          </div>
        ) : (
          <div className="py-2">
            {messages.map((m, i) => (
              <ComponentErrorBoundary key={m.id || m.jobId || `msg-${i}`} componentName="Nachricht">
                <CompactMessage message={m} isStreaming={isLoading && i === lastIndex} />
              </ComponentErrorBoundary>
            ))}
            {/* Skill-Läufe chronologisch (älteste zuerst) unter den Nachrichten */}
            {[...runIds].reverse().map(id => (
              <ComponentErrorBoundary key={`run-${id}`} componentName="Skill-Lauf">
                <RunCard runId={id} skillName={runNames[id]} />
              </ComponentErrorBoundary>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Fehlerzeile */}
      {error && (
        <div className="mx-2.5 mb-1 flex items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
          <span className="truncate">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Fehler schließen">
            <X className="size-3" />
          </button>
        </div>
      )}

      {/* Composer */}
      <div className="shrink-0 p-2 pt-1">
        <ComposerCard
          value={input}
          onChange={setInput}
          onSend={handleSend}
          onCancel={handleCancel}
          isLoading={isLoading}
          attachedFile={attachedFile}
          onRemoveFile={() => setAttachedFile(null)}
          attachedImages={attachedImages}
          onRemoveImage={i => setAttachedImages(prev => prev.filter((_, idx) => idx !== i))}
          onPickFile={pickFile}
          models={composerModels}
          selectedModel={selectedModel}
          onSelectModel={setSelectedModel}
          pins={pins}
          onRemovePin={id => removePin.mutate(id)}
          skills={skills}
          // Anlegen/Bearbeiten öffnen den Skill-Dialog (Schritt 17). `/skills`
          // (Gesamt-Übersicht) ist bewusst noch nicht gebaut — sie steht nicht
          // in den Akzeptanzkriterien von Schritt 17; ein ehrlicher Hinweis
          // führt zu den vorhandenen Wegen.
          onOpenSkillOverview={() =>
            toast.info(
              'Skills legst du mit /neuer-skill an oder bearbeitest sie über das Stift-Symbol.'
            )
          }
          onCreateSkill={() => setSkillDialog({ editName: null })}
          onEditSkill={name => setSkillDialog({ editName: name })}
          onRunSkill={handleRunSkill}
        />
      </div>

      {/* Drop-Overlay — sichtbares Feedback beim Hineinziehen von Dateien/Ordnern */}
      {dragOver && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-background/85 backdrop-blur-[1px]"
          data-testid="chat-drop-overlay"
        >
          <div className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card px-5 py-4 text-center shadow-lg">
            <Upload className="size-6 text-primary" aria-hidden="true" />
            <span className="text-ui font-medium text-foreground">Dateien hier ablegen</span>
            <span className="text-ui-xs text-muted-foreground">
              Dokumente und Bilder als Kontext hinzufügen
            </span>
          </div>
        </div>
      )}

      {/* Anlege-/Bearbeiten-Dialog für Skills (Plan 011, Schritt 17) */}
      {skillDialog && (
        <SkillDialog open editName={skillDialog.editName} onClose={() => setSkillDialog(null)} />
      )}
    </div>
  );
}
