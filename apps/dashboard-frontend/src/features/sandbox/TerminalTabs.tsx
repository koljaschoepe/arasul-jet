/**
 * TerminalTabs — EINE kompakte Kopfzeile für das Terminal des AKTIVEN Projekts
 * (Plan 018: Projekt-Vereinheitlichung). Das Terminal folgt dem oben gewählten
 * Workspace-Projekt; es hat KEINEN eigenen Projekt-Umschalter mehr und man kann
 * von hier aus kein Projekt „öffnen". Die Zeile zeigt:
 *   Projektname (nur Anzeige) · Sitzungs-Tabs · „+" (neue Sitzung).
 *
 * Sitzungen tragen serverseitige Titel (geräteweit gleich); Doppelklick (oder
 * F2) auf einen Tab benennt um. Projektname und Sitzungs-Tabs teilen sich
 * bewusst dieselbe Schriftgröße (text-ui-sm) — sie sind gleichwertig.
 */

import { useEffect, useRef, useState } from 'react';
import { Plus, X, Terminal, Folder } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import type { OpenSession } from './sessionModel';

interface TerminalTabsProps {
  /** Name des aktiven Projekts (nur Anzeige — die Wahl passiert oben). */
  projectName: string | null;
  /** Sitzungen des gekoppelten Containers. */
  sessions: OpenSession[];
  activeTabId: string | null;
  /** Serverseitige Titel je tmux-Name des aktiven Projekts. */
  sessionTitles?: Record<string, string>;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  /** Zusätzliche, unabhängige Sitzung im aktiven Projekt öffnen. */
  onNewSession: () => void;
  /** Sitzung umbenennen (tmux-Name + neuer Titel). */
  onRenameSession?: (tmuxName: string, title: string) => void;
}

export default function TerminalTabs({
  projectName,
  sessions,
  activeTabId,
  sessionTitles = {},
  onSelectTab,
  onCloseTab,
  onNewSession,
  onRenameSession,
}: TerminalTabsProps) {
  // Inline-Umbenennen
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const titleFor = (tmuxName: string | undefined, index: number): string => {
    const key = tmuxName || 'main';
    return sessionTitles[key] || `Sitzung ${index + 1}`;
  };

  // Editier-Zustand ist an die SESSION-Id gebunden (nicht den tmux-Namen, der
  // sich Projekte teilt) — sonst könnte ein extern geschlossener/neu belegter
  // Tab ein fremdes Rename-Feld erben.
  const beginRename = (sessionId: string, tmuxName: string | undefined, index: number) => {
    if (!onRenameSession) return;
    setEditing(sessionId);
    setDraft(titleFor(tmuxName, index));
  };
  const commitRename = (tmuxName: string | undefined) => {
    if (editing && onRenameSession) {
      const clean = draft.trim();
      if (clean) onRenameSession(tmuxName || 'main', clean);
    }
    setEditing(null);
  };

  return (
    <div
      className="flex items-center gap-1 px-1.5 min-h-9 bg-background border-b border-border shrink-0 overflow-x-auto scrollbar-none"
      data-testid="terminal-kopf"
    >
      {/* Projektname (nur Anzeige — gleiche Schriftgröße wie die Sitzungs-Tabs) */}
      <div
        className="flex items-center gap-1.5 px-2 h-7 max-w-52 shrink-0 text-ui-sm font-medium text-foreground"
        title={projectName ? `Projekt „${projectName}"` : undefined}
      >
        <Folder className="size-3.5 text-primary shrink-0" />
        <span className="truncate">{projectName ?? 'Kein Projekt'}</span>
      </div>

      {/* Trenner */}
      {projectName && sessions.length > 0 && <div className="h-4 w-px bg-border shrink-0" />}

      {/* Sitzungs-Tabs (inline, gleiche Zeile, gleiche Schriftgröße) */}
      {sessions.map(({ session }, index) => {
        const isEditing = editing === session.id;
        return (
          <div
            key={session.id}
            role="tab"
            tabIndex={0}
            aria-selected={session.id === activeTabId}
            onClick={() => onSelectTab(session.id)}
            onDoubleClick={() => beginRename(session.id, session.terminalName, index)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectTab(session.id);
              }
              if (e.key === 'F2') {
                e.preventDefault();
                beginRename(session.id, session.terminalName, index);
              }
            }}
            className={cn(
              'group flex items-center gap-1.5 px-2.5 h-7 rounded text-ui-sm font-medium shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              session.id === activeTabId
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
            title="Doppelklick zum Umbenennen"
          >
            <Terminal className="size-3 shrink-0 opacity-70" />
            {isEditing ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onClick={e => e.stopPropagation()}
                onBlur={() => commitRename(session.terminalName)}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === 'Enter') commitRename(session.terminalName);
                  if (e.key === 'Escape') setEditing(null);
                }}
                className="w-24 bg-transparent border-b border-primary outline-none text-ui-sm"
                aria-label="Sitzung umbenennen"
              />
            ) : (
              <span className="truncate max-w-40">{titleFor(session.terminalName, index)}</span>
            )}
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onCloseTab(session.id);
              }}
              className="ml-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity shrink-0"
              title="Sitzung schließen"
              aria-label={`${titleFor(session.terminalName, index)} schließen`}
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}

      {projectName && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onNewSession}
          className="text-muted-foreground hover:text-foreground shrink-0"
          title="Neue Sitzung"
          aria-label="Neue Sitzung"
        >
          <Plus className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
