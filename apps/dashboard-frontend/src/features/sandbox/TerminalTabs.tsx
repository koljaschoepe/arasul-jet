/**
 * TerminalTabs — EINE kompakte Kopfzeile (Plan 017 Schritt 6):
 * Projekt-Dropdown links · Sitzungs-Tabs · „+" · Überlauf-Liste rechts.
 *
 * Sitzungen tragen serverseitige Titel (geräteweit gleich); Doppelklick auf
 * einen Tab benennt um. Ein Anwesenheits-Punkt an der Kopfzeile zeigt, wenn
 * außer einem selbst noch jemand im Projekt verbunden ist. Die frühere
 * zweizeilige Kopfzeile (große Projektzeile + separater Umschalter) entfällt;
 * Netz-Modus/Verbindungsstatus leben in der Terminal-Statusleiste.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Plus,
  List,
  X,
  Terminal,
  FolderPlus,
  Folder,
  ChevronDown,
  Check,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/shadcn/dropdown-menu';
import { cn } from '@/lib/utils';
import { DEFAULT_PROJECT_COLOR } from '@/lib/themeColors';
import type { SandboxProject } from './types';
import type { OpenSession } from './sessionModel';

/** Anwesenheit je tmux-Session: welche Nutzer sind verbunden. */
export interface SessionPresence {
  connections: number;
  users: string[];
  sessions?: Record<string, { connections: number; users: string[] }>;
}

interface TerminalTabsProps {
  openSessions: OpenSession[];
  activeTabId: string | null;
  allProjects: SandboxProject[];
  /** Serverseitige Titel je tmux-Name des AKTIVEN Projekts. */
  sessionTitles?: Record<string, string>;
  /** Anwesenheit im AKTIVEN Projekt (aus /sessions). */
  presence?: SessionPresence | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onOpenProject: (project: SandboxProject) => void;
  onNewSession: (projectId: string) => void;
  onCreateProject: () => void;
  onShowAllProjects: () => void;
  /** Sitzung umbenennen (tmux-Name + neuer Titel). */
  onRenameSession?: (tmuxName: string, title: string) => void;
}

export default function TerminalTabs({
  openSessions,
  activeTabId,
  allProjects,
  sessionTitles = {},
  presence = null,
  onSelectTab,
  onCloseTab,
  onOpenProject,
  onNewSession,
  onCreateProject,
  onShowAllProjects,
  onRenameSession,
}: TerminalTabsProps) {
  const active = openSessions.find(({ session }) => session.id === activeTabId) ?? null;
  const activeProject = active?.project ?? null;

  // Offene Projekte (dedupliziert) für den Wechsler
  const openProjects: SandboxProject[] = [];
  const seen = new Set<string>();
  for (const { project } of openSessions) {
    if (!seen.has(project.id)) {
      seen.add(project.id);
      openProjects.push(project);
    }
  }
  const availableProjects = allProjects.filter(p => !seen.has(p.id) && p.status === 'active');
  const sessionsOfActive = activeProject
    ? openSessions.filter(({ project }) => project.id === activeProject.id)
    : [];

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
  // Tab ein fremdes Rename-Feld erben (Review Plan 017 Schritt 6).
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

  // Anwesenheit anderer (der eigene Verbindungspunkt zählt nicht als „andere").
  const otherPresent = (presence?.connections ?? 0) > sessionsOfActive.length;

  return (
    <div
      className="flex items-center gap-1 px-1.5 min-h-9 bg-background border-b border-border shrink-0 overflow-x-auto scrollbar-none"
      data-testid="terminal-kopf"
    >
      {/* Projekt-Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 max-w-52 text-ui-sm font-medium text-foreground shrink-0"
            title="Projekt wechseln"
          >
            <Folder className="size-3.5 text-primary shrink-0" />
            <span className="truncate">{activeProject ? activeProject.name : 'Kein Projekt'}</span>
            <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-60">
          {openProjects.length > 0 && (
            <>
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Offen
              </DropdownMenuLabel>
              {openProjects.map(project => (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() => onOpenProject(project)}
                  className="gap-2.5"
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: project.color || DEFAULT_PROJECT_COLOR }}
                  />
                  <span className="truncate">{project.name}</span>
                  {project.id === activeProject?.id && (
                    <Check className="size-3.5 text-primary ml-auto shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}
            </>
          )}
          {availableProjects.length > 0 && (
            <>
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Öffnen
              </DropdownMenuLabel>
              {availableProjects.map(project => (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() => onOpenProject(project)}
                  className="gap-2.5"
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: project.color || DEFAULT_PROJECT_COLOR }}
                  />
                  <span className="truncate">{project.name}</span>
                  {project.container_status === 'running' && (
                    <Terminal className="size-3 text-primary ml-auto shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onCreateProject} className="gap-2.5">
            <FolderPlus className="size-3.5 text-primary shrink-0" />
            <span>Neues Projekt erstellen</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Trenner */}
      {activeProject && <div className="h-4 w-px bg-border shrink-0" />}

      {/* Sitzungs-Tabs (inline, gleiche Zeile) */}
      {sessionsOfActive.map(({ session }, index) => {
        const tmux = session.terminalName || 'main';
        const isEditing = editing === session.id;
        const perSession = presence?.sessions?.[tmux];
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
            {perSession && perSession.users.length > 0 && (
              <span
                className="flex items-center gap-0.5 text-[10px] text-primary"
                title={`Verbunden: ${perSession.users.join(', ')}`}
              >
                <Users className="size-3" />
                {perSession.connections}
              </span>
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

      {activeProject && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onNewSession(activeProject.id)}
          className="text-muted-foreground hover:text-foreground shrink-0"
          title={`Neue Sitzung in „${activeProject.name}"`}
          aria-label="Neue Sitzung"
        >
          <Plus className="size-3.5" />
        </Button>
      )}

      {/* Rechts: Anwesenheits-Hinweis + Alle-Projekte-Liste */}
      <div className="ml-auto flex items-center gap-1 shrink-0">
        {otherPresent && (
          <span
            className="flex items-center gap-0.5 text-ui-xs text-primary"
            title={presence?.users?.length ? `Verbunden: ${presence.users.join(', ')}` : undefined}
          >
            <Users className="size-3.5" />
            {presence?.connections}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onShowAllProjects}
          className="text-muted-foreground hover:text-foreground"
          title="Alle Projekte"
          aria-label="Alle Projekte"
        >
          <List className="size-4" />
        </Button>
      </div>
    </div>
  );
}
