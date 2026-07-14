/**
 * TerminalTabs — Kopfzeile des Terminals mit zwei Ebenen:
 *
 * 1. Projekt-Kopfzeile: „📁 <Projektname> ▾" (Projekt-Wechsler) zeigt klar, in
 *    welchem Ordner/Projekt man arbeitet. Das Dropdown wechselt zu einem anderen
 *    offenen Projekt oder öffnet ein weiteres. Rechts: „+ Sitzung" (zusätzliche,
 *    unabhängige Session im AKTIVEN Projekt) und „Liste" (alle Projekte).
 * 2. Session-Umschalter: Tabs für die offenen Sessions DESSELBEN Projekts —
 *    mehrere gleichzeitige Terminals im selben Ordner sind so erkenn- und
 *    umschaltbar. Jede Session lässt sich einzeln schließen.
 */

import { Plus, List, X, Terminal, FolderPlus, Folder, ChevronDown, Check } from 'lucide-react';
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

interface TerminalTabsProps {
  openSessions: OpenSession[];
  activeTabId: string | null;
  allProjects: SandboxProject[];
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onOpenProject: (project: SandboxProject) => void;
  onNewSession: (projectId: string) => void;
  onCreateProject: () => void;
  onShowAllProjects: () => void;
}

export default function TerminalTabs({
  openSessions,
  activeTabId,
  allProjects,
  onSelectTab,
  onCloseTab,
  onOpenProject,
  onNewSession,
  onCreateProject,
  onShowAllProjects,
}: TerminalTabsProps) {
  // Aktive Session + Projekt bestimmen
  const active = openSessions.find(({ session }) => session.id === activeTabId) ?? null;
  const activeProject = active?.project ?? null;

  // Offene Projekte (dedupliziert, in Reihenfolge des ersten Auftretens) für den Wechsler
  const openProjects: SandboxProject[] = [];
  const seen = new Set<string>();
  for (const { project } of openSessions) {
    if (!seen.has(project.id)) {
      seen.add(project.id);
      openProjects.push(project);
    }
  }

  // Projekte, die noch gar nicht offen sind — zum Öffnen im Wechsler
  const availableProjects = allProjects.filter(p => !seen.has(p.id) && p.status === 'active');

  // Sessions des AKTIVEN Projekts — der Session-Umschalter (Ebene 2)
  const sessionsOfActive = activeProject
    ? openSessions.filter(({ project }) => project.id === activeProject.id)
    : [];

  return (
    <div className="flex flex-col bg-background border-b border-border shrink-0">
      {/* Ebene 1: Projekt-Kopfzeile */}
      <div className="flex items-center gap-1 px-1.5 min-h-9 border-b border-border/60">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 max-w-60 text-ui-sm font-medium text-foreground"
              title="Projekt wechseln"
            >
              <Folder className="size-3.5 text-primary shrink-0" />
              <span className="truncate">
                {activeProject ? activeProject.name : 'Kein Projekt'}
              </span>
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

        <div className="ml-auto flex items-center gap-0.5">
          {activeProject && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNewSession(activeProject.id)}
              className="h-7 gap-1.5 px-2 text-ui-sm text-muted-foreground hover:text-foreground"
              title={`Neue Sitzung in „${activeProject.name}"`}
            >
              <Plus className="size-3.5" />
              Sitzung
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onShowAllProjects}
            className="text-muted-foreground hover:text-foreground"
            title="Alle Projekte"
          >
            <List className="size-4" />
          </Button>
        </div>
      </div>

      {/* Ebene 2: Session-Umschalter des aktiven Projekts */}
      {activeProject && (
        <div className="flex items-center min-h-8 overflow-x-auto scrollbar-none">
          {sessionsOfActive.map(({ session, project }, index) => (
            // role="tab": kein verschachteltes <button> im <button> (invalides
            // HTML); Keyboard-Semantik über tabIndex + Enter/Space.
            <div
              key={session.id}
              role="tab"
              tabIndex={0}
              aria-selected={session.id === activeTabId}
              onClick={() => onSelectTab(session.id)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectTab(session.id);
                }
              }}
              className={cn(
                'group flex items-center gap-1.5 px-2.5 py-1 text-ui-sm font-medium border-r border-border shrink-0 transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                session.id === activeTabId
                  ? 'bg-muted text-foreground border-b-2 border-b-primary'
                  : 'bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              <Terminal className="size-3 shrink-0 opacity-70" />
              <span className="truncate">Sitzung {index + 1}</span>
              {project.container_status === 'running' && (
                <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              )}
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onCloseTab(session.id);
                }}
                className="ml-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity duration-150 shrink-0"
                title="Sitzung schließen"
                aria-label={`Sitzung ${index + 1} schließen`}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}

          {/* Schnellzugriff: weitere Sitzung im aktiven Projekt */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onNewSession(activeProject.id)}
            className="text-muted-foreground hover:text-foreground shrink-0 ml-0.5"
            title="Neue Sitzung"
            aria-label="Neue Sitzung"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
