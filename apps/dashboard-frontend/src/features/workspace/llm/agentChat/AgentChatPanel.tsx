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
import { useFlowEditorStore } from '@/stores/flowEditorStore';
import { usePins } from '../../useWorkspaceContext';
import { useActiveProject } from '../../useProjects';
import { useFlows } from '@/hooks/useFlows';
import { ComponentErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Mascot } from '@/components/mascot/Mascot';
import CompactMessage from './CompactMessage';
import ComposerCard from './ComposerCard';
import ConversationList from '../ConversationList';
import RunCard from '@/features/flows/RunCard';

const PANEL_CHAT_KEY = 'arasul_panel_chat_id';
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
const MAX_IMAGES = 4;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Drag-Payloads, die der Explorer setzt (Datei/Ordner → Chat-Kontext). */
export const DND_SCOPE_TYPE = 'application/x-arasul-scope';

/** Drag-Payload des Ablage-Baums (Projektablage): Ordner → Datei-Ziel. */
export const DND_ABLAGE_TYPE = 'application/x-arasul-ablage';

/**
 * Erkennung der Speicher-Absicht in der Nutzer-Eingabe: „speicher das als
 * Datei", „erstelle eine Datei", „leg das ab" … aktiviert den Datei-Modus für
 * diese eine Nachricht automatisch — kein Nachfragen, die Antwort landet
 * direkt in der Projektablage.
 */
const SPEICHER_ABSICHT =
  /(speicher|abspeicher|als datei|datei (anlegen|erstellen|ablegen)|\bin (der|die|den) ablage\b)/i;

export default function AgentChatPanel() {
  const api = useApi();
  const {
    sendMessage,
    speichereNachrichtAlsDatei,
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
    getFlowRuns,
    registerFlowRun,
    setChatFlowRuns,
    installedModels,
    defaultModel,
    selectedModel,
    setSelectedModel,
    globalQueue,
  } = useChatContext();

  const chatScope = useWorkspaceStore(s => s.chatScope);
  const setChatScope = useWorkspaceStore(s => s.setChatScope);
  const chatDateiZiel = useWorkspaceStore(s => s.chatDateiZiel);
  const setChatDateiZiel = useWorkspaceStore(s => s.setChatDateiZiel);
  const openTab = useWorkspaceStore(s => s.openTab);
  const setEditTarget = useFlowEditorStore(s => s.setEditTarget);
  const { flows } = useFlows();
  const { pins, removePin } = usePins();
  const { activeId: activeProjectId } = useActiveProject();

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
  // Datei-Modus: die nächste Antwort wird automatisch als Datei gespeichert.
  const [dateiModus, setDateiModus] = useState(false);
  // Agent-UX 2026-08-02: Eine während des Laufs abgeschickte Text-Nachricht
  // verpufft nicht mehr stumm, sondern wartet sichtbar und wird nach dem
  // Abschluss automatisch gesendet.
  const [wartendeNachricht, setWartendeNachricht] = useState<string | null>(null);
  // Sichtbares Feedback zwischen Stop-Klick und tatsächlichem Ende.
  const [stoppt, setStoppt] = useState(false);
  // Flow-Namen je Lauf-ID — nur als Kopfzeilen-Hinweis, bevor der Lauf-Strom
  // ihn ohnehin bestätigt (Plan 011, Schritt 15).
  const [runNames, setRunNames] = useState<Record<number, string>>({});

  // Flows öffnen jetzt den zentralen Editor-Tab statt eines Popups (Plan 012
  // Phase D): Ziel im `flowEditorStore` setzen, dann den `flow`-Tab öffnen.
  const oeffneFlowEditor = useCallback(
    (editName: string | null) => {
      setEditTarget(editName);
      openTab({ type: 'flow' });
    },
    [setEditTarget, openTab]
  );

  // Die Lauf-IDs dieses Chats (neueste zuerst) — die Karten stehen chronologisch
  // unter den Nachrichten, also älteste zuerst.
  const runIds = chatId ? getFlowRuns(chatId) : [];

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
  // Sperrt eine zweite Flow-Lauf-Auslösung, bis der Start-POST durch ist.
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

  /**
   * Reiner Text-Versand (ohne Anhänge) — der gemeinsame Weg für die wartende
   * Nachricht und den „Erneut versuchen"-Knopf der Fehlerzeile.
   */
  const sendeNurText = useCallback(
    async (msg: string) => {
      setError(null);
      const effectiveModelId = selectedModel || defaultModel;
      const model = installedModels.find(m => m.id === effectiveModelId);
      const scopeActive = !!chatScope && chatScope.spaceIds.length > 0;
      try {
        const id = await ensureChat();
        sendMessage(id, msg, {
          agent: true,
          useRAG: false,
          useThinking: model?.supports_thinking === true,
          selectedSpaces: scopeActive && chatScope ? chatScope.spaceIds : [],
          matchedSpaces: [],
          messages: messagesRef.current,
          model: selectedModel || undefined,
          alsDatei: dateiModus || SPEICHER_ABSICHT.test(msg),
          dateiZiel: chatDateiZiel
            ? { projectId: chatDateiZiel.projectId, pfad: chatDateiZiel.pfad }
            : null,
        });
        stickToBottomRef.current = true;
      } catch {
        setError('Chat konnte nicht erstellt werden');
      }
    },
    [
      selectedModel,
      defaultModel,
      installedModels,
      chatScope,
      chatDateiZiel,
      dateiModus,
      ensureChat,
      sendMessage,
    ]
  );

  // Lauf beendet (fertig, Fehler oder gestoppt): Stop-Feedback zurücksetzen
  // und eine wartende Nachricht automatisch nachschicken.
  useEffect(() => {
    if (isLoading) return;
    setStoppt(false);
    if (wartendeNachricht) {
      const msg = wartendeNachricht;
      setWartendeNachricht(null);
      void sendeNurText(msg);
    }
  }, [isLoading, wartendeNachricht, sendeNurText]);

  const handleSend = useCallback(async () => {
    const hasInput = input.trim() || attachedFile || attachedImages.length > 0;
    if (!hasInput) return;
    if (isLoading) {
      // Nicht mehr stumm verschlucken: reiner Text wartet sichtbar und geht
      // nach dem Abschluss automatisch raus; Anhänge brauchen den Nutzer.
      if (input.trim() && !attachedFile && attachedImages.length === 0) {
        setWartendeNachricht(input.trim());
        setInput('');
      } else {
        setError('Der Agent arbeitet noch — bitte warten oder den Lauf stoppen.');
      }
      return;
    }

    // Anhänge zeigt der Verlauf als Chip/Vorschau — kein Platzhaltertext mehr;
    // nur Bilder ohne Text brauchen weiter einen (die Pipeline will Inhalt).
    const msg =
      input.trim() ||
      (attachedFile
        ? `Sieh dir die Datei „${attachedFile.name}" an.`
        : `[${attachedImages.length} Bild${attachedImages.length > 1 ? 'er' : ''}]`);
    const file = attachedFile;
    const images = attachedImages.map(i => i.base64);
    // Datei-Modus: manuell umgeschaltet ODER aus der Eingabe erkannt
    // („speicher das als Datei …") — gilt für genau diese Nachricht.
    const alsDatei = !file && (dateiModus || SPEICHER_ABSICHT.test(input));
    setInput('');
    setAttachedFile(null);
    setAttachedImages([]);
    setDateiModus(false);
    setError(null);

    const effectiveModelId = selectedModel || defaultModel;
    const model = installedModels.find(m => m.id === effectiveModelId);

    // Ein-Ordner-Modell: ein Datei-Anhang landet ERST im Projektordner
    // (Ziel-Ordner aus dem Baum oder Wurzel), dann läuft die Nachricht als
    // normaler Agent-Auftrag mit bekanntem Datei-Pfad. Nur wenn kein Projekt
    // aktiv ist, bleibt die alte Dokument-Analyse-Pipeline.
    let anhang: { projectId: string; pfad: string; name: string; inhalt?: string } | undefined;
    const anhangProjektId = chatDateiZiel?.projectId || activeProjectId;
    if (file && anhangProjektId) {
      try {
        const form = new FormData();
        form.append('file', file);
        if (chatDateiZiel?.pfad) form.append('ordner', chatDateiZiel.pfad);
        const res = await api.post<{ data: { pfad: string } }>(
          `/projects/${anhangProjektId}/dateien/upload`,
          form,
          { showError: false }
        );
        anhang = { projectId: anhangProjektId, pfad: res.data.pfad, name: file.name };
        // Kleine Text-Dateien: Inhalt direkt in den Auftrag geben — kleine
        // Modelle überspringen sonst das Lesen und erfinden den Inhalt.
        const TEXT_ENDUNGEN = /\.(txt|md|markdown|csv|json|log|html|htm|xml|ya?ml)$/i;
        if (
          file.size <= 16 * 1024 &&
          (file.type.startsWith('text/') || TEXT_ENDUNGEN.test(file.name))
        ) {
          try {
            anhang.inhalt = await file.text();
          } catch {
            // Ohne Inhalt bleibt der Lese-Hinweis im Payload.
          }
        }
      } catch {
        setError(`„${file.name}" konnte nicht in den Projektordner gelegt werden`);
        return;
      }
    }

    const scopeActive = !!chatScope && chatScope.spaceIds.length > 0;

    try {
      const id = await ensureChat();
      sendMessage(id, msg, {
        // Agent-Modus (2026-07-28): das Backend führt die Werkzeugschleife —
        // Wissensraum-Suche, Ablage lesen/schreiben, Web, Subagenten. Der
        // frühere Client-RAG-Vorlauf (strikter Zitier-Modus, verweigerte
        // Erstell-Aufgaben) entfällt; Anhänge liegen als Projektdatei bereit.
        agent: !file || !!anhang,
        useRAG: false,
        useThinking: model?.supports_thinking === true,
        selectedSpaces: scopeActive && chatScope ? chatScope.spaceIds : [],
        matchedSpaces: [],
        messages: messagesRef.current,
        model: selectedModel || undefined,
        file: anhang ? undefined : file || undefined,
        anhang,
        images: images.length > 0 ? images : undefined,
        alsDatei,
        dateiZiel: chatDateiZiel
          ? { projectId: chatDateiZiel.projectId, pfad: chatDateiZiel.pfad }
          : null,
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
    chatDateiZiel,
    dateiModus,
    selectedModel,
    defaultModel,
    installedModels,
    activeProjectId,
    api,
    ensureChat,
    sendMessage,
  ]);

  // Beim Öffnen eines Chats seine Flow-Läufe vom Server holen (Quelle der
  // Wahrheit); die Karten reihen sich unter die Nachrichten. Frisch gestartete
  // Läufe bleiben durch `setChatFlowRuns` erhalten.
  useEffect(() => {
    if (!chatId) return;
    let cancelled = false;
    api
      // Die Lauf-ID kommt aus einer BIGINT-Spalte und erreicht den Client als
      // String ("10"), während der Start-POST sie als Zahl (10) liefert. Beide
      // MÜSSEN zur selben Zahl normalisiert werden — sonst scheitert der
      // Dublettenschutz (10 !== "10") und derselbe Lauf erscheint doppelt.
      .get<{ data: { id: number | string; flow_name: string }[] }>(
        `/flows/laeufe?conversation_id=${chatId}`,
        { showError: false }
      )
      .then(d => {
        if (cancelled) return;
        setChatFlowRuns(
          chatId,
          d.data.map(r => Number(r.id))
        );
        setRunNames(prev => {
          const next = { ...prev };
          for (const r of d.data) next[Number(r.id)] = r.flow_name;
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [chatId, api, setChatFlowRuns]);

  const handleRunFlow = useCallback(
    async (flowName: string, args: Record<string, string>) => {
      // Doppel-Auslösung sperren: `isLoading` ist der Chat-Stream, nicht der Lauf —
      // ohne eigene Sperre startete ein schnelles Doppel-Enter zwei Läufe (zwei
      // teure GPU-Vorgänge, zwei Karten) für eine Aktion. Erst nach dem POST frei.
      if (isLoading || runStartRef.current) return;
      runStartRef.current = true;
      setError(null);
      try {
        const id = await ensureChat();
        const res = await api.post<{ data: { runId: number | string } }>('/flows/laeufe', {
          flow: flowName,
          args,
          conversation_id: Number(id),
        });
        // Erst NACH dem erfolgreichen Start leeren — schlägt er fehl (z. B.
        // fehlendes Pflicht-Argument), bleibt der getippte Befehl zum
        // Korrigieren stehen, statt verloren zu gehen.
        setInput('');
        // Wie in der Liste: die BIGINT-ID kann als String kommen — zur Zahl
        // normalisieren, damit Registry-Schlüssel und Karten-ID konsistent sind.
        const runId = Number(res.data.runId);
        setRunNames(prev => ({ ...prev, [runId]: flowName }));
        registerFlowRun(id, runId);
        stickToBottomRef.current = true;
      } catch (err) {
        // useApi zeigt die Fehlermeldung bereits als Toast; hier die Zeile oben.
        setError((err as Error).message || 'Flow konnte nicht gestartet werden');
      } finally {
        runStartRef.current = false;
      }
    },
    [isLoading, ensureChat, api, registerFlowRun]
  );

  const handleCancel = useCallback(() => {
    if (chatId) {
      setStoppt(true);
      cancelJob(chatId);
    }
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
    // Deckungsgleich mit der Backend-Whitelist (documentAnalysis.js): lieber
    // sofort eine klare Meldung als ein Upload-Fehler nach dem Absenden.
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    const erlaubt = [
      '.pdf',
      '.docx',
      '.txt',
      '.md',
      '.markdown',
      '.yaml',
      '.yml',
      '.csv',
      '.json',
      '.html',
      '.htm',
      '.xml',
      '.log',
      '.png',
      '.jpg',
      '.jpeg',
      '.tiff',
      '.tif',
      '.bmp',
    ];
    if (!erlaubt.includes(ext)) {
      setError(`Dateityp ${ext} wird nicht unterstützt (z. B. PDF, DOCX, MD, HTML, CSV).`);
      return;
    }
    setAttachedFile(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      // Ablage-Ordner → Datei-Ziel: „gespeicherte Antworten landen hier".
      const ablagePayload = e.dataTransfer.getData(DND_ABLAGE_TYPE);
      if (ablagePayload) {
        try {
          const parsed = JSON.parse(ablagePayload) as {
            projectId?: string;
            pfad?: string;
            name?: string;
            typ?: string;
          };
          if (parsed.projectId && parsed.typ === 'ordner') {
            setChatDateiZiel({
              projectId: parsed.projectId,
              pfad: parsed.pfad ?? '',
              label: parsed.name || 'Projektordner',
            });
            // Ein-Ordner-Modell: derselbe Ordner ist auch Wissens-Scope.
            // Liefert der Explorer eine space_id-Payload mit, wird der Chat
            // gleich auf den Ordner eingegrenzt („Mit Ordner chatten").
            const scopeAuchPayload = e.dataTransfer.getData(DND_SCOPE_TYPE);
            if (scopeAuchPayload) {
              try {
                const scope = JSON.parse(scopeAuchPayload) as {
                  spaceIds?: string[];
                  label?: string;
                };
                if (scope.spaceIds?.length && scope.label) {
                  setChatScope({ spaceIds: scope.spaceIds, label: scope.label });
                }
              } catch {
                /* Scope-Payload defekt → nur das Datei-Ziel setzen */
              }
            }
            return;
          }
        } catch {
          /* fällt durch zu Scope-/Datei-Handling */
        }
      }
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
    [pickFile, setChatScope, setChatDateiZiel]
  );

  // Nachträgliche Aktion an einer fertigen Antwort: als Datei speichern.
  const handleAlsDateiSpeichern = useCallback(
    async (m: ChatMessage) => {
      if (!chatId) return;
      await speichereNachrichtAlsDatei(
        chatId,
        m,
        chatDateiZiel ? { projectId: chatDateiZiel.projectId, pfad: chatDateiZiel.pfad } : null
      );
    },
    [chatId, speichereNachrichtAlsDatei, chatDateiZiel]
  );

  const composerModels = installedModels
    .filter(
      m => (m.install_status ?? m.status ?? 'ready') === 'ready' || m.install_status === undefined
    )
    // Nur Modelle, die tatsächlich chatten können — Embedding-/OCR-Modelle
    // (z. B. nomic-embed-text) sind installiert, aber keine Gesprächspartner.
    .filter(m => m.model_type !== 'embedding' && m.model_type !== 'ocr')
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
        {/* Warteschlangen-Hinweis: erst ab >1 wartendem Auftrag interessant. */}
        {isLoading && (globalQueue?.pending_count ?? 0) > 1 && (
          <span className="shrink-0 text-xs text-muted-foreground" data-testid="queue-hinweis">
            Warteschlange: {globalQueue.pending_count} Aufträge
          </span>
        )}
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
                <CompactMessage
                  message={m}
                  isStreaming={isLoading && i === lastIndex}
                  onAlsDateiSpeichern={handleAlsDateiSpeichern}
                />
              </ComponentErrorBoundary>
            ))}
            {/* Flow-Läufe chronologisch (älteste zuerst) unter den Nachrichten */}
            {[...runIds].reverse().map(id => (
              <ComponentErrorBoundary key={`run-${id}`} componentName="Flow-Lauf">
                <RunCard runId={id} flowName={runNames[id]} />
              </ComponentErrorBoundary>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Fehlerzeile — mit direktem „Erneut versuchen" statt Neu-Tippen. */}
      {error && (
        <div className="mx-2.5 mb-1 flex items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
          <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{error}</span>
          <div className="flex shrink-0 items-center gap-2">
            {!isLoading &&
              (() => {
                const letzte = [...messages].reverse().find(m => m.role === 'user')?.content;
                return letzte ? (
                  <button
                    type="button"
                    onClick={() => void sendeNurText(letzte)}
                    className="rounded border border-destructive/40 px-1.5 py-0.5 font-medium hover:bg-destructive/15"
                    data-testid="fehler-erneut"
                  >
                    Erneut versuchen
                  </button>
                ) : null;
              })()}
            <button type="button" onClick={() => setError(null)} aria-label="Fehler schließen">
              <X className="size-3" />
            </button>
          </div>
        </div>
      )}

      {/* Wartende Nachricht: geht automatisch raus, sobald der Agent fertig ist. */}
      {wartendeNachricht && (
        <div
          className="mx-2.5 mb-1 flex items-center justify-between gap-2 rounded-md border border-border bg-muted px-2 py-1 text-xs text-muted-foreground"
          data-testid="wartende-nachricht"
        >
          <span className="min-w-0 flex-1 truncate">
            Wird gesendet, sobald der Agent fertig ist: „{wartendeNachricht}&ldquo;
          </span>
          <button
            type="button"
            onClick={() => {
              setInput(wartendeNachricht);
              setWartendeNachricht(null);
            }}
            aria-label="Wartende Nachricht zurückholen"
            className="shrink-0 hover:text-foreground"
          >
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
          stopping={stoppt}
          attachedFile={attachedFile}
          onRemoveFile={() => setAttachedFile(null)}
          attachedImages={attachedImages}
          onRemoveImage={i => setAttachedImages(prev => prev.filter((_, idx) => idx !== i))}
          onPickFile={pickFile}
          dateiModus={dateiModus}
          onToggleDateiModus={() => setDateiModus(v => !v)}
          dateiZiel={chatDateiZiel}
          onClearDateiZiel={() => setChatDateiZiel(null)}
          models={composerModels}
          selectedModel={selectedModel}
          onSelectModel={setSelectedModel}
          pins={pins}
          onRemovePin={id => removePin.mutate(id)}
          flows={flows}
          // Plan 012 Phase D: `/flows` öffnet die echte Übersicht (Sidebar-
          // Ansicht »Flows«), `/neuer-flow` einen leeren Editor-Tab, das
          // Stift-Symbol den Editor-Tab des jeweiligen Flows.
          onOpenFlowOverview={() =>
            useWorkspaceStore.setState({ activeView: 'flows', sidebarVisible: true })
          }
          onCreateFlow={() => oeffneFlowEditor(null)}
          onEditFlow={name => oeffneFlowEditor(name)}
          onRunFlow={handleRunFlow}
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
    </div>
  );
}
