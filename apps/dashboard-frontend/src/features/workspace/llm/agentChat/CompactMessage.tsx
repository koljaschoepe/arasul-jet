/**
 * Eine Nachricht im kompakten Agent-Chat.
 *
 * Muster (Cursor/Claude-Code-Konsens): keine Bubbles, keine Avatare —
 * die User-Nachricht ist die einzige dezent geboxte Fläche, die Antwort
 * fließt flach über die volle Breite. Denk- und Retrieval-Schritte sind
 * einklappbare Ein-Zeilen-Rows, Quellen ein klickbarer Chip-Footer.
 */
import { memo, useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  FilePlus2,
  FileText,
  Gauge,
  Globe,
  ListTodo,
  Paperclip,
  Search,
  Sparkles,
  TerminalSquare,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { dateiListe } from '@/contexts/ChatContext';
import type { AgentToolStep, ChatMessage, MessageDatei, TodoEintrag } from '@/contexts/ChatContext';
import type { DocumentSource } from '@/types';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { CompactMarkdown } from '@/components/ui/CompactMarkdown';

/** Einklappbare Ein-Zeilen-Row für Denk-/Tool-Schritte. */
function StepRow({
  icon,
  label,
  detail,
  running,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  detail?: string;
  /** Läuft dieser Schritt gerade? → pulsierender Punkt + Akzentfarbe (Plan 019). */
  running?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-0.5">
      <button
        type="button"
        onClick={() => children && setOpen(o => !o)}
        className={cn(
          'flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs text-muted-foreground',
          running && 'text-primary',
          children && 'hover:bg-accent hover:text-foreground'
        )}
        aria-expanded={children ? open : undefined}
      >
        <span className={cn('shrink-0 opacity-70', running && 'animate-pulse opacity-100')}>
          {icon}
        </span>
        <span className={cn('truncate', running && 'animate-pulse')}>{label}</span>
        {detail && <span className="truncate opacity-60">· {detail}</span>}
        {children && (
          <ChevronRight
            className={cn('ml-auto size-3 shrink-0 transition-transform', open && 'rotate-90')}
          />
        )}
      </button>
      {open && children && (
        <div className="ml-5 mt-0.5 rounded border border-border bg-card px-2 py-1.5 text-xs text-muted-foreground whitespace-pre-wrap [overflow-wrap:anywhere]">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Denk-Ticker (Plan 022): der Gedankengang als EINE Zeile — während des
 * Denkens ein Live-Ticker (pulsierend, zeigt die letzte Denk-Zeile), nach
 * Abschluss ein „Nachgedacht · Ns"-Chip. Immer per Klick voll aufklappbar,
 * damit man jederzeit sieht, dass etwas passiert, ohne den Verlauf zuzumüllen.
 * Optional zeigt die Zeile am Ende die Tokens/Sekunde des Laufs.
 */
function DenkTicker({
  thinking,
  live,
  seconds,
  tokensPerSecond,
}: {
  thinking: string;
  /** Läuft die Denkphase gerade (Tokens kommen noch)? */
  live: boolean;
  /** Gemessene Denkdauer in Sekunden (nach Abschluss). */
  seconds?: number;
  /** Tokens/Sekunde des Laufs (nach Abschluss). */
  tokensPerSecond?: number;
}) {
  const [open, setOpen] = useState(false);
  const letzteZeile = useMemo(() => {
    const zeilen = thinking
      .trimEnd()
      .split('\n')
      .map(z => z.trim())
      .filter(Boolean);
    return zeilen[zeilen.length - 1] || '';
  }, [thinking]);

  const label = live
    ? 'Denkt nach'
    : seconds != null && seconds > 0
      ? `Nachgedacht · ${seconds}s`
      : 'Gedankengang';

  return (
    <div className="my-0.5">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground',
          live && 'text-primary'
        )}
        aria-expanded={open}
        data-testid="denk-ticker"
      >
        <Sparkles
          className={cn('size-3 shrink-0 opacity-70', live && 'animate-pulse opacity-100')}
        />
        <span className={cn('shrink-0 font-medium', live && 'animate-pulse')}>{label}</span>
        {live && letzteZeile ? (
          <span className="min-w-0 flex-1 truncate opacity-60" data-testid="denk-ticker-live">
            · {letzteZeile}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        {tokensPerSecond != null && tokensPerSecond > 0 && (
          <span
            className="flex shrink-0 items-center gap-1 opacity-70"
            data-testid="tokens-pro-sekunde"
          >
            <Gauge className="size-3" />
            {tokensPerSecond} tok/s
          </span>
        )}
        <ChevronRight className={cn('size-3 shrink-0 transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="ml-5 mt-0.5 rounded border border-border bg-card px-2 py-1.5 text-xs text-muted-foreground whitespace-pre-wrap [overflow-wrap:anywhere]">
          {thinking}
        </div>
      )}
    </div>
  );
}

/** Kleiner Lauf-Metrik-Chip: Tokens/Sekunde ohne Denkphase (Plan 022). */
function LaufMetrik({ tokensPerSecond }: { tokensPerSecond?: number }) {
  if (tokensPerSecond == null || tokensPerSecond <= 0) return null;
  return (
    <div
      className="mt-0.5 flex items-center gap-1 px-1 text-[11px] text-muted-foreground"
      data-testid="tokens-pro-sekunde"
    >
      <Gauge className="size-3" />
      {tokensPerSecond} tok/s
    </div>
  );
}

/** Quellen-Footer: kollabierte Zeile → vertikale, klickbare Chip-Liste. */
function SourcesFooter({ sources }: { sources: DocumentSource[] }) {
  const [open, setOpen] = useState(false);
  const openTab = useWorkspaceStore(s => s.openTab);

  // Nach Dokument deduplizieren (mehrere Chunks derselben Datei = 1 Chip)
  const byDoc = new Map<string, DocumentSource>();
  for (const s of sources) {
    const key = s.document_id || s.document_name;
    if (!byDoc.has(key)) byDoc.set(key, s);
  }
  const docs = [...byDoc.values()];
  if (docs.length === 0) return null;

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-expanded={open}
      >
        <ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} />
        {docs.length} {docs.length === 1 ? 'Quelle' : 'Quellen'}
      </button>
      {open && (
        <ul className="mt-0.5 flex flex-col gap-0.5 pl-5" data-testid="sources-list">
          {docs.map((s, i) => (
            <li key={s.document_id || `${s.document_name}-${i}`}>
              <button
                type="button"
                disabled={!s.document_id}
                onClick={() =>
                  s.document_id &&
                  openTab({ type: 'document', documentId: s.document_id, title: s.document_name })
                }
                className={cn(
                  'flex w-full items-start gap-1.5 rounded px-1.5 py-1 text-left text-xs',
                  s.document_id
                    ? 'text-foreground hover:bg-accent'
                    : 'cursor-default text-muted-foreground'
                )}
                title={s.space_name ? `${s.document_name} · ${s.space_name}` : s.document_name}
              >
                {/* Dateiname vollständig lesbar — umbrechen statt abschneiden
                    (Plan 005 · Schritt 4). */}
                <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                  {s.document_name}
                </span>
                {s.space_name && (
                  <span className="mt-0.5 shrink-0 text-[10px] text-muted-foreground">
                    {s.space_name}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Persistierte Aufgabenliste (Schritt kind='todos', output = Markdown-
 * Checkboxen) → strukturierte Einträge. Spiegelt `parseTodos` im Backend:
 * "- [ ]" offen, "- [~]" läuft, "- [x]" fertig.
 */
function parseTodoSchritt(output: string | undefined): TodoEintrag[] {
  const todos: TodoEintrag[] = [];
  for (const zeile of (output || '').split('\n')) {
    const m = zeile.match(/^\s*[-*]\s*\[([ xX~])\]\s*(.+)$/);
    if (m && m[2]) {
      todos.push({
        text: m[2].trim(),
        status: m[1] === ' ' ? 'offen' : m[1] === '~' ? 'laeuft' : 'fertig',
      });
    }
  }
  return todos;
}

/**
 * Status-Marker einer Aufgabe (Plan 022): fertig = Haken im Accent-Blau,
 * läuft = pulsierender Akzent-Punkt, offen = leerer Ring. Ersetzt das frühere
 * grün-durchgestrichene „fertig" (Nutzer-Wunsch: ruhiges Blau, kein Streichen).
 */
function TodoMarker({ status }: { status: TodoEintrag['status'] }) {
  if (status === 'fertig') {
    return <Check className="mt-0.5 size-3 shrink-0 text-primary" aria-label="erledigt" />;
  }
  if (status === 'laeuft') {
    return (
      <span className="mt-1 inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
    );
  }
  return (
    <span className="mt-1 inline-block size-1.5 shrink-0 rounded-full border border-muted-foreground/50" />
  );
}

/**
 * Feste Aufgaben-Leiste (Plan 019, Cursor-Stil): eine Zeile je Aufgabe, Status
 * als Marker + Farbe (fertig = Haken/Accent-Blau, läuft = Akzent + Puls, offen =
 * gedämpft) — kein Durchstreichen mehr (Plan 022). Wird sowohl inline (Verlauf)
 * als auch in der unten fest verankerten Leiste des Panels (`AgentChatPanel`)
 * benutzt.
 */
export function TodoLeiste({
  todos,
  className,
  testid = 'todo-liste',
  collapsible = false,
}: {
  todos: TodoEintrag[];
  className?: string;
  testid?: string;
  /** Kopfzeile wird zum Auf/Zu-Schalter (feste Leiste unten im Panel). */
  collapsible?: boolean;
}) {
  const [offen, setOffen] = useState(true);
  if (todos.length === 0) return null;
  const fertig = todos.filter(t => t.status === 'fertig').length;
  const kopf = (
    <span className="flex items-center gap-1.5">
      {collapsible ? (
        <ChevronRight
          className={cn('size-3 shrink-0 transition-transform', offen && 'rotate-90')}
        />
      ) : (
        <ListTodo className="size-3 shrink-0 opacity-70" />
      )}
      <span>
        Aufgaben · {fertig}/{todos.length} erledigt
      </span>
    </span>
  );
  return (
    <div className={cn('rounded border border-border px-2 py-1.5', className)} data-testid={testid}>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOffen(o => !o)}
          className="mb-0.5 flex w-full items-center text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={offen}
        >
          {kopf}
        </button>
      ) : (
        <div className="mb-0.5 flex items-center text-xs text-muted-foreground">{kopf}</div>
      )}
      {offen && (
        <ul className="flex flex-col gap-0.5">
          {todos.map((t, i) => (
            <li
              key={`${t.text}-${i}`}
              className={cn(
                'flex items-start gap-1.5 text-xs leading-snug [overflow-wrap:anywhere]',
                t.status === 'fertig' && 'text-primary',
                t.status === 'laeuft' && 'text-primary',
                t.status === 'offen' && 'text-muted-foreground'
              )}
            >
              <TodoMarker status={t.status} />
              <span className={cn('min-w-0 flex-1', t.status === 'laeuft' && 'animate-pulse')}>
                {t.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Eltern→Kinder-Karte aus den Schritten (Subagenten hängen unter ihrem Schritt). */
function buildKinderVon(steps: AgentToolStep[]): Map<number, AgentToolStep[]> {
  const kinderVon = new Map<number, AgentToolStep[]>();
  for (const step of steps) {
    if (step.parentStepId != null) {
      const liste = kinderVon.get(step.parentStepId) ?? [];
      liste.push(step);
      kinderVon.set(step.parentStepId, liste);
    }
  }
  return kinderVon;
}

/** Rekursive Schritt-Zeilen (mit eingerückten Subagent-Kindern). */
function renderStepTree(
  stufe: AgentToolStep[],
  kinderVon: Map<number, AgentToolStep[]>
): React.ReactNode {
  return stufe.map((step, i) => {
    const kinder = step.id != null ? (kinderVon.get(step.id) ?? []) : [];
    const auftrag =
      step.kind === 'subagent' && typeof step.params?.auftrag === 'string'
        ? step.params.auftrag
        : undefined;
    return (
      <div key={step.id ?? i}>
        <StepRow
          icon={agentStepIcon(step)}
          label={step.status === 'running' ? `${agentStepLabel(step)} …` : agentStepLabel(step)}
          detail={auftrag}
          running={step.status === 'running'}
        >
          {step.result || undefined}
        </StepRow>
        {kinder.length > 0 && (
          <div className="ml-3.5 border-l border-border/60 pl-1.5" data-testid="agent-substeps">
            {renderStepTree(kinder, kinderVon)}
          </div>
        )}
      </div>
    );
  });
}

/**
 * Flacher Schritt-Baum — für einfache (einschrittige) Aufgaben ohne
 * Aufgabenliste: während der Arbeit live sichtbar, danach zu EINER
 * einklappbaren „N Schritte"-Zeile gefaltet.
 */
function AgentSteps({
  steps,
  kinderVon,
  laufend,
}: {
  steps: AgentToolStep[];
  kinderVon: Map<number, AgentToolStep[]>;
  laufend: boolean;
}) {
  const [offen, setOffen] = useState(false);
  const wurzeln = steps.filter(s => s.parentStepId == null);
  const liste = <div data-testid="agent-steps">{renderStepTree(wurzeln, kinderVon)}</div>;

  if (laufend) {
    return <div className="mb-1">{liste}</div>;
  }
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setOffen(o => !o)}
        className="flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-expanded={offen}
        data-testid="agent-steps-toggle"
      >
        <ChevronRight className={cn('size-3 transition-transform', offen && 'rotate-90')} />
        {wurzeln.length} {wurzeln.length === 1 ? 'Schritt' : 'Schritte'}
      </button>
      {offen && <div className="mt-0.5 pl-4">{liste}</div>}
    </div>
  );
}

/**
 * Eine Aufgabe (Todo) mit den darunter gruppierten Schritten (Plan 019).
 * Läuft die Aufgabe, ist sie offen und pulsiert; ist sie fertig, klappt sie
 * automatisch zu einer Ergebniszeile ein (jederzeit wieder aufklappbar).
 */
function TaskGroup({
  todo,
  wurzeln,
  kinderVon,
}: {
  todo: TodoEintrag;
  wurzeln: AgentToolStep[];
  kinderVon: Map<number, AgentToolStep[]>;
}) {
  const fertig = todo.status === 'fertig';
  const aktiv = todo.status === 'laeuft';
  // Auto: fertige Aufgaben eingeklappt, laufende/offene aufgeklappt. Ein Klick
  // überschreibt das dauerhaft (override).
  const [override, setOverride] = useState<boolean | null>(null);
  const offen = override ?? !fertig;
  const hatSchritte = wurzeln.length > 0;

  return (
    <div data-testid="task-group">
      <button
        type="button"
        onClick={() => hatSchritte && setOverride(() => !offen)}
        className={cn(
          'flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs',
          hatSchritte && 'hover:bg-accent'
        )}
        aria-expanded={hatSchritte ? offen : undefined}
      >
        {hatSchritte ? (
          <ChevronRight
            className={cn('size-3 shrink-0 transition-transform', offen && 'rotate-90')}
          />
        ) : (
          <span className="size-3 shrink-0" />
        )}
        <span
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1.5 leading-snug',
            fertig && 'text-primary',
            aktiv && 'animate-pulse text-primary',
            todo.status === 'offen' && 'text-muted-foreground'
          )}
        >
          {fertig && <Check className="size-3 shrink-0" aria-label="erledigt" />}
          <span className="min-w-0 flex-1 truncate">{todo.text}</span>
        </span>
        {hatSchritte && !offen && (
          <span className="shrink-0 opacity-60">
            {wurzeln.length} {wurzeln.length === 1 ? 'Schritt' : 'Schritte'}
          </span>
        )}
      </button>
      {offen && hatSchritte && (
        <div className="ml-3.5 border-l border-border/60 pl-1.5">
          {renderStepTree(wurzeln, kinderVon)}
        </div>
      )}
    </div>
  );
}

/**
 * Agent-Aktivität einer Nachricht: bei mehrschrittigen Aufgaben (Todos
 * vorhanden) sind die Schritte GRUPPIERT unter ihrer Aufgabe; sonst ein
 * schlichter flacher Baum. So folgt man Cursor-artig dem Ablauf statt einem
 * flachen „listet/liest/sucht"-Strom (Plan 019).
 */
function AgentActivity({
  steps,
  todos,
  laufend,
}: {
  steps: AgentToolStep[];
  todos: TodoEintrag[];
  laufend: boolean;
}) {
  // Die Todo-Zeilen selbst sind kein Schritt in der Gruppierung.
  const echte = steps.filter(s => s.kind !== 'todos');
  const kinderVon = buildKinderVon(echte);

  if (todos.length === 0) {
    return <AgentSteps steps={echte} kinderVon={kinderVon} laufend={laufend} />;
  }

  // Schritte der obersten Ebene in EINEM Durchgang nach Aufgabe gruppieren.
  // Schritte ohne gültigen task_index (z. B. der Plan-Schritt, Schritte vor der
  // ersten Aufgabe, oder ein veralteter Index nach Umschreiben der Liste) landen
  // in der „Vorbereitung" — sie werden NIE stillschweigend verschluckt.
  const wurzeln = echte.filter(s => s.parentStepId == null);
  const proTask = new Map<number, AgentToolStep[]>();
  const vorbereitung: AgentToolStep[] = [];
  for (const s of wurzeln) {
    const idx = s.taskIndex;
    if (typeof idx === 'number' && idx >= 0 && idx < todos.length) {
      const liste = proTask.get(idx) ?? [];
      liste.push(s);
      proTask.set(idx, liste);
    } else {
      vorbereitung.push(s);
    }
  }

  const fertig = todos.filter(t => t.status === 'fertig').length;

  return (
    <div className="my-1 flex flex-col gap-0.5" data-testid="agent-activity">
      {/* Kurz-Zusammenfassung für den Verlauf (im laufenden Lauf lebt die
          Checkliste zusätzlich fest unten im Panel). */}
      <div
        className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground"
        data-testid="todo-liste"
      >
        <ListTodo className="size-3 shrink-0 opacity-70" />
        <span>
          Aufgaben · {fertig}/{todos.length} erledigt
        </span>
      </div>
      {/* Vorbereitungs-/nicht zugeordnete Schritte falten (wie der flache Pfad)
          zu „N Schritte", damit sie den Verlauf nicht dauerhaft zumüllen. */}
      {vorbereitung.length > 0 && (
        <AgentSteps steps={vorbereitung} kinderVon={kinderVon} laufend={laufend} />
      )}
      {todos.map((todo, i) => (
        <TaskGroup
          key={`${todo.text}-${i}`}
          todo={todo}
          wurzeln={proTask.get(i) ?? []}
          kinderVon={kinderVon}
        />
      ))}
    </div>
  );
}

/** Kompakte deutsche Beschriftung eines Werkzeug-Schritts aus Name + Parametern. */
function agentStepLabel(step: AgentToolStep): string {
  const p = step.params || {};
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  if (step.kind === 'plan') {
    return step.status === 'running' ? 'erstellt einen Plan' : 'Plan erstellt';
  }
  if (step.kind === 'todos') {
    return 'aktualisiert die Aufgabenliste';
  }
  if (step.kind === 'subagent') {
    return step.status === 'running' ? `Helfer „${step.tool}" arbeitet` : `Helfer „${step.tool}"`;
  }
  switch (step.tool) {
    case 'dateien':
    case 'dateien_lesen': {
      const aktion = str(p.aktion).toLowerCase();
      const pfad = str(p.pfad) || '/';
      if (aktion === 'read') return `liest ${pfad}`;
      if (aktion === 'write') return `schreibt ${pfad}`;
      if (aktion === 'list') return `listet ${pfad}`;
      return `Dateien: ${pfad}`;
    }
    case 'dateien_schreiben':
      return `schreibt ${str(p.pfad) || 'Datei'}`;
    case 'dateien_bearbeiten':
      return `ändert ${str(p.pfad) || 'Datei'}`;
    case 'dateien_anhaengen':
      return `ergänzt ${str(p.pfad) || 'Datei'}`;
    case 'todo_liste':
      return 'aktualisiert die Aufgabenliste';
    case 'dateien_suchen': {
      const muster = str(p.muster) || str(p.text) || str(p.suchbegriff) || str(p.query);
      return muster ? `sucht Dateien: ${muster}` : 'durchsucht Dateien';
    }
    case 'rag':
    case 'rag_suche': {
      const q = str(p.frage) || str(p.query);
      return q ? `sucht im Wissen: ${q}` : 'durchsucht das Wissen';
    }
    case 'web_suche': {
      const q = str(p.frage) || str(p.query) || str(p.suchbegriff);
      return q ? `sucht im Web: ${q}` : 'sucht im Web';
    }
    case 'web_lesen':
      return `liest ${str(p.adresse) || str(p.url) || 'eine Webseite'}`;
    case 'terminal': {
      const cmd = str(p.befehl) || str(p.command);
      return cmd ? `führt aus: ${cmd}` : 'führt einen Befehl aus';
    }
    default:
      return `nutzt ${step.tool || 'Werkzeug'}`;
  }
}

function agentStepIcon(step: AgentToolStep): React.ReactNode {
  if (step.kind === 'plan' || step.kind === 'todos') {
    return <ListTodo className="size-3" />;
  }
  if (step.kind === 'subagent') {
    return <Sparkles className="size-3" />;
  }
  switch (step.tool) {
    case 'dateien':
    case 'dateien_lesen':
    case 'dateien_schreiben':
    case 'dateien_bearbeiten':
    case 'dateien_anhaengen':
    case 'dateien_suchen':
      return <FileText className="size-3" />;
    case 'todo_liste':
      return <ListTodo className="size-3" />;
    case 'rag':
    case 'rag_suche':
    case 'web_suche':
      return <Search className="size-3" />;
    case 'web_lesen':
      return <Globe className="size-3" />;
    case 'terminal':
      return <TerminalSquare className="size-3" />;
    default:
      return <Wrench className="size-3" />;
  }
}

/**
 * Klickbare Datei-Karte (wie Cursor): die gespeicherte Antwort als Datei —
 * Klick öffnet sie im Editor-Tab, statt den langen Text inline auszubreiten.
 */
const AENDERUNG_BADGE: Record<
  NonNullable<MessageDatei['aenderung']>,
  { label: string; cls: string }
> = {
  neu: { label: 'Neu', cls: 'text-success border-success/40 bg-success/10' },
  geaendert: { label: 'Geändert', cls: 'text-primary border-primary/40 bg-primary/10' },
  geloescht: {
    label: 'Gelöscht',
    cls: 'text-destructive border-destructive/40 bg-destructive/10',
  },
};

function DateiKarte({ datei }: { datei: MessageDatei }) {
  const openTab = useWorkspaceStore(s => s.openTab);
  // Eine gelöschte Datei kann man nicht mehr öffnen — die Karte bleibt als
  // ehrlicher Beleg der Änderung, aber ohne toten Klickpfad.
  const klickbar = Boolean(datei.project_id && datei.pfad) && datei.aenderung !== 'geloescht';
  const badge = datei.aenderung ? AENDERUNG_BADGE[datei.aenderung] : null;
  return (
    <button
      type="button"
      disabled={!klickbar}
      onClick={() =>
        klickbar &&
        openTab({
          type: 'projektdatei',
          projectId: datei.project_id!,
          filePath: datei.pfad!,
          title: datei.name,
        })
      }
      className={cn(
        'group my-1 flex w-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-left',
        klickbar && 'hover:border-primary/40 hover:bg-accent'
      )}
      data-testid="datei-karte"
      title={datei.pfad}
    >
      <FileText className="size-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-[13px] font-medium text-foreground',
            datei.aenderung === 'geloescht' && 'line-through opacity-70'
          )}
        >
          {datei.name}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {datei.pfad || 'Projektablage'}
        </span>
      </span>
      {badge && (
        <span
          className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium', badge.cls)}
          data-testid="datei-badge"
        >
          {badge.label}
        </span>
      )}
      {klickbar && (
        <span className="shrink-0 text-[11px] text-muted-foreground group-hover:text-foreground">
          Öffnen
        </span>
      )}
    </button>
  );
}

interface CompactMessageProps {
  message: ChatMessage;
  isStreaming: boolean;
  /** Nachträgliche Aktion „Als Datei speichern" an einer fertigen Antwort. */
  onAlsDateiSpeichern?: (m: ChatMessage) => Promise<void> | void;
}

function CompactMessageInner({ message, isStreaming, onAlsDateiSpeichern }: CompactMessageProps) {
  // Bei gespeicherter Datei ist die Karte die Hauptdarstellung; der volle
  // Antwort-Text bleibt auf Klick erreichbar.
  const [textOffen, setTextOffen] = useState(false);
  const [speichert, setSpeichert] = useState(false);

  if (message.role === 'user') {
    const anhang = dateiListe(message.datei).find(d => d.art === 'anhang');
    // Ein-Ordner-Modell: ein Anhang, der bereits im Projektordner liegt,
    // erscheint als klickbare Datei-Karte (öffnet den Editor-Tab).
    const projektAnhaenge = dateiListe(message.datei).filter(d => d.art === 'projektdatei');
    return (
      <div className="my-2 rounded-lg border border-border bg-card px-2.5 py-2 text-[13px] leading-relaxed text-foreground">
        {anhang && (
          <span
            className="mb-1 inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs"
            data-testid="anhang-chip"
          >
            <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{anhang.name}</span>
          </span>
        )}
        {projektAnhaenge.map((d, i) => (
          <DateiKarte key={`${d.pfad}-${i}`} datei={d} />
        ))}
        {message.images && message.images.length > 0 && (
          <span className="mb-1 flex flex-wrap gap-1.5">
            {message.images.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`Angehängtes Bild ${i + 1}`}
                className="h-16 w-16 rounded-md border border-border object-cover"
              />
            ))}
          </span>
        )}
        {message.content && (
          <span className="block whitespace-pre-wrap [overflow-wrap:anywhere]">
            {message.content}
          </span>
        )}
      </div>
    );
  }

  const hasThinking = Boolean(message.thinking && message.thinking.trim());
  const matched = message.matchedSpaces || [];

  const alleSteps = message.steps || [];
  // Aufgabenliste: live aus dem Stream (message.todos) oder aus dem
  // persistierten Schritt kind='todos' (letzter Stand). Der Schritt selbst
  // erscheint dann NICHT mehr als normale Schritt-Zeile (sonst doppelt).
  const todoSchritt = [...alleSteps].reverse().find(s => s.kind === 'todos');
  const todos =
    message.todos && message.todos.length > 0
      ? message.todos
      : todoSchritt
        ? parseTodoSchritt(todoSchritt.result)
        : [];
  const gespeicherteDateien = dateiListe(message.datei).filter(d => d.art === 'projektdatei');

  return (
    <div className="group/nachricht my-2" data-testid="assistant-message">
      {(alleSteps.length > 0 || todos.length > 0) && (
        <AgentActivity steps={alleSteps} todos={todos} laufend={isStreaming} />
      )}
      {hasThinking && (
        <DenkTicker
          thinking={message.thinking || ''}
          live={isStreaming && !message.thinkingCollapsed}
          seconds={message.thinkingSeconds}
          tokensPerSecond={isStreaming ? undefined : message.tokensPerSecond}
        />
      )}
      {matched.length > 0 && (
        <StepRow
          icon={<Search className="size-3" />}
          label="Dokumente durchsucht"
          detail={matched.map(m => m.name).join(', ')}
        />
      )}
      {message.streamStatus && !message.content && (
        <StepRow
          icon={<Search className="size-3" />}
          label={message.statusMessage || 'Arbeitet …'}
        />
      )}

      {gespeicherteDateien.length > 0 && !isStreaming ? (
        <>
          {/* Kurzer Begleittext (Agent: „Datei gespeichert …") steht ÜBER den
              Karten; lange Texte (Alt-Verhalten: kompletter Dokumentinhalt)
              bleiben hinter dem Auf/Zu, damit nichts doppelt ausgebreitet wird. */}
          {message.content && message.content.length <= 600 && (
            <CompactMarkdown content={message.content} />
          )}
          {gespeicherteDateien.length > 1 && (
            <div
              className="mt-1 text-xs font-medium text-muted-foreground"
              data-testid="aenderungen-titel"
            >
              Änderungen · {gespeicherteDateien.length} Dateien
            </div>
          )}
          {gespeicherteDateien.map((d, i) => (
            <DateiKarte key={`${d.pfad}-${i}`} datei={d} />
          ))}
          {message.content && message.content.length > 600 && (
            <>
              <button
                type="button"
                onClick={() => setTextOffen(o => !o)}
                className="flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-expanded={textOffen}
              >
                <ChevronRight
                  className={cn('size-3 transition-transform', textOffen && 'rotate-90')}
                />
                {textOffen ? 'Antwort ausblenden' : 'Antwort anzeigen'}
              </button>
              {textOffen && <CompactMarkdown content={message.content} />}
            </>
          )}
        </>
      ) : message.content ? (
        <CompactMarkdown content={message.content} />
      ) : isStreaming && !hasThinking ? (
        <div className="my-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block size-1.5 animate-pulse rounded-full bg-primary" />
          Antwortet …
        </div>
      ) : null}

      {isStreaming && message.content && (
        <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-primary align-text-bottom" />
      )}

      {/* Tokens/Sekunde am Ende — ohne Denkphase steht die Metrik eigenständig
          (mit Denkphase trägt sie der „Nachgedacht"-Chip). */}
      {!isStreaming && !hasThinking && <LaufMetrik tokensPerSecond={message.tokensPerSecond} />}

      {message.sources && message.sources.length > 0 && <SourcesFooter sources={message.sources} />}

      {/* Nachträglich als Datei speichern — dezent, erscheint beim Überfahren. */}
      {!isStreaming &&
        gespeicherteDateien.length === 0 &&
        message.content &&
        onAlsDateiSpeichern && (
          <div className="mt-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/nachricht:opacity-100">
            <button
              type="button"
              disabled={speichert}
              onClick={async () => {
                setSpeichert(true);
                try {
                  await onAlsDateiSpeichern(message);
                } finally {
                  setSpeichert(false);
                }
              }}
              className="flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
              data-testid="als-datei-speichern"
            >
              <FilePlus2 className="size-3" />
              {speichert ? 'Speichert …' : 'Als Datei speichern'}
            </button>
          </div>
        )}
    </div>
  );
}

const CompactMessage = memo(CompactMessageInner);
export default CompactMessage;
