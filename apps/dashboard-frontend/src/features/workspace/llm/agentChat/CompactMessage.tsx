/**
 * Eine Nachricht im kompakten Agent-Chat.
 *
 * Muster (Cursor/Claude-Code-Konsens): keine Bubbles, keine Avatare —
 * die User-Nachricht ist die einzige dezent geboxte Fläche, die Antwort
 * fließt flach über die volle Breite. Denk- und Retrieval-Schritte sind
 * einklappbare Ein-Zeilen-Rows, Quellen ein klickbarer Chip-Footer.
 */
import { memo, useState } from 'react';
import {
  ChevronRight,
  FilePlus2,
  FileText,
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
import type { AgentToolStep, ChatMessage, MessageDatei } from '@/contexts/ChatContext';
import type { DocumentSource } from '@/types';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { CompactMarkdown } from '@/components/ui/CompactMarkdown';

/** Einklappbare Ein-Zeilen-Row für Denk-/Tool-Schritte. */
function StepRow({
  icon,
  label,
  detail,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  detail?: string;
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
          children && 'hover:bg-accent hover:text-foreground'
        )}
        aria-expanded={children ? open : undefined}
      >
        <span className="shrink-0 opacity-70">{icon}</span>
        <span className="truncate">{label}</span>
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

/** Kompakte deutsche Beschriftung eines Werkzeug-Schritts aus Name + Parametern. */
function agentStepLabel(step: AgentToolStep): string {
  const p = step.params || {};
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  if (step.kind === 'plan') {
    return step.status === 'running' ? 'erstellt einen Plan' : 'Plan erstellt';
  }
  if (step.kind === 'subagent') {
    const auftrag = str(p.auftrag);
    return auftrag ? `Subagent ${step.tool}: ${auftrag}` : `Subagent ${step.tool}`;
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
  if (step.kind === 'plan') {
    return <ListTodo className="size-3" />;
  }
  if (step.kind === 'subagent') {
    return <Sparkles className="size-3" />;
  }
  switch (step.tool) {
    case 'dateien':
    case 'dateien_lesen':
    case 'dateien_schreiben':
    case 'dateien_suchen':
      return <FileText className="size-3" />;
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
 * Werkzeug-Schritte eines Agentenlaufs: während der Arbeit einzeln sichtbar
 * (Live-Statuszeilen), nach Abschluss zu EINER einklappbaren Zeile gefaltet.
 */
function AgentSteps({ steps, laufend }: { steps: AgentToolStep[]; laufend: boolean }) {
  const [offen, setOffen] = useState(false);
  const liste = (
    <div data-testid="agent-steps">
      {steps.map((step, i) => (
        <StepRow
          key={step.id ?? i}
          icon={agentStepIcon(step)}
          label={step.status === 'running' ? `${agentStepLabel(step)} …` : agentStepLabel(step)}
        >
          {step.result || undefined}
        </StepRow>
      ))}
    </div>
  );

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
        {steps.length} {steps.length === 1 ? 'Schritt' : 'Schritte'}
      </button>
      {offen && <div className="mt-0.5 pl-4">{liste}</div>}
    </div>
  );
}

/**
 * Klickbare Datei-Karte (wie Cursor): die gespeicherte Antwort als Datei —
 * Klick öffnet sie im Editor-Tab, statt den langen Text inline auszubreiten.
 */
function DateiKarte({ datei }: { datei: MessageDatei }) {
  const openTab = useWorkspaceStore(s => s.openTab);
  const klickbar = Boolean(datei.project_id && datei.pfad);
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
        <span className="block truncate text-[13px] font-medium text-foreground">{datei.name}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {datei.pfad || 'Projektablage'}
        </span>
      </span>
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

  const steps = message.steps || [];
  const gespeicherteDateien = dateiListe(message.datei).filter(d => d.art === 'projektdatei');

  return (
    <div className="group/nachricht my-2" data-testid="assistant-message">
      {steps.length > 0 && <AgentSteps steps={steps} laufend={isStreaming} />}
      {hasThinking && (
        <StepRow
          icon={<Sparkles className="size-3" />}
          label={isStreaming && !message.content ? 'Denkt nach …' : 'Gedankengang'}
        >
          {message.thinking}
        </StepRow>
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
