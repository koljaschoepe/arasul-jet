# Frontend Chat & LLM — Findings

## Umfang

- 3.838 LOC (ChatContext 1210, ChatInputArea 847, ChatLanding 464, ChatMessage 374, ChatView 382)
- 224 Test-Cases in 6 Test-Files — sehr gute Coverage
- Hoch komplex, aber sauber strukturiert

## FEHLENDE FEATURES (Frontend-UI)

### C-01: Kein System-Prompt-Editor pro Chat

- System-Prompt nur auf Project-Level (ProjectCard.system_prompt)
- Chat-Settings speichern preferred_model, use_rag, use_thinking — kein system_prompt
- Einzelner Chat kann nicht abweichen
- Fix: Settings-Section im Chat für System-Prompt-Override

### C-02: Kein Tool-Use / Function-Calling UI

- ChatMessage-Type hat keine tools/tool_calls/tool_results
- SSE-Events: job_started/status/thinking/response/done/sources — KEIN tool-Event
- Backend-Support unklar; Frontend zero UI
- Fix: Wenn Backend folgen soll → MessageBlock für Tool-Pending/Result

### C-03: Code-Copy-Button fehlt

- react-markdown ohne custom Code-Renderer mit Copy-Button

### C-04: Kein Syntax-Highlighting

- Weder Prism noch highlight.js aktiv
- Rohe `<code>`-Elemente mit Fallback-Styling

### C-05: Kein Regenerate-Button

- User kann Message nicht "erneut generieren"

### C-06: Audio-Input/Output fehlt

- Keine WebAudio-Integration, kein TTS/STT

## MINORS

### C-07: Rerank-Score-Threshold hardcoded (0.1)

- ChatMessage rendert Orange-Warning bei <0.1 — sollte konfigurierbar sein

### C-08: Focus-Management bei Popup-Open fehlt

- Model-Popup, Attachment-Popup — kein Focus-Trap

### C-09: Accessibility — keine aria-describedby für Error-Banner

### C-10: Keine Keyboard-Shortcut-Hilfe (F1 / ?)

### C-11: Landscape-Mode nicht explizit gestylt

## OK / SEHR GUT (Beibehalten)

- Streaming mit Token-Batching (16er-Blöcke, 94% weniger Re-Renders)
- SSE-Parsing: token/thinking/response/done events
- Timeout-Strategie: 660s initial, 120s Heartbeat-Reset
- Race-Conditions gelöst: sendLockRef (Set), reconnectMutexRef
- AbortController pro Session, Cleanup bei Unmount/Logout
- Background-Message-Accumulation (LRU 10 Chats) — Streaming läuft weiter bei Unmount
- Cancel-Button während Stream
- Conversation-Persistenz: DB + localStorage last_chat_id + Reconnect
- Pagination-Button "Ältere Messages"
- RAG: Space-Auswahl + Auto-Routing + Source-Citations mit Ranking
- Markdown via react-markdown + remark-gfm, Tables, Blockquotes, Lists, Mermaid
- Error-Banner + Retry mit lastSendRef
- Queue-Position-Indicator (Polling /llm/queue alle 2s)
- Mobile-Breakpoints (768, 576, 375px)
- Keyboard: Enter/Shift+Enter/Escape
- ARIA: role=log, aria-live, aria-expanded, role=toolbar

## Priorität

1. C-01 (System-Prompt pro Chat) — oft gewünscht
2. C-04 + C-03 (Syntax-Highlighting + Copy) — QoL
3. C-02 (Tools) — wenn Backend folgt
4. C-05 (Regenerate) — einfach zu bauen
