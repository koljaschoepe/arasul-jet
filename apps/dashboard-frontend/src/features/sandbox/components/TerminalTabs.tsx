/**
 * TerminalTabs - Tab bar for open terminal sessions
 *
 * Shows open project tabs, a [+] button to add new projects,
 * and a project list button to see all projects.
 */

import { Plus, List, X, Terminal, FolderPlus } from 'lucide-react';
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
import type { SandboxProject } from './types';

interface TerminalTabsProps {
  openTabs: SandboxProject[];
  activeTabId: string | null;
  allProjects: SandboxProject[];
  onSelectTab: (projectId: string) => void;
  onCloseTab: (projectId: string) => void;
  onOpenProject: (project: SandboxProject) => void;
  onCreateProject: () => void;
  onShowAllProjects: () => void;
}

export default function TerminalTabs({
  openTabs,
  activeTabId,
  allProjects,
  onSelectTab,
  onCloseTab,
  onOpenProject,
  onCreateProject,
  onShowAllProjects,
}: TerminalTabsProps) {
  // Projects not yet open as tabs
  const openIds = new Set(openTabs.map(t => t.id));
  const availableProjects = allProjects.filter(p => !openIds.has(p.id) && p.status === 'active');

  return (
    <div className="flex items-center bg-background border-b border-border shrink-0 min-h-[38px]">
      {/* Tabs */}
      <div className="flex items-center flex-1 min-w-0 overflow-x-auto scrollbar-none">
        {openTabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectTab(tab.id)}
            className={cn(
              'group flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-r border-border shrink-0 transition-all duration-150 max-w-[180px]',
              tab.id === activeTabId
                ? 'bg-muted text-foreground border-b-2 border-b-primary'
                : 'bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: tab.color || '#45ADFF' }}
            />
            <span className="truncate">{tab.name}</span>
            {tab.container_status === 'running' && (
              <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
            )}
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              className="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity duration-150 shrink-0"
              title="Tab schließen"
            >
              <X className="size-3" />
            </button>
          </button>
        ))}
      </div>

      {/* Add button — Radix DropdownMenu for portal-based rendering */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground h-[38px] w-[38px] rounded-none border-r border-border shrink-0"
            title="Projekt hinzufügen"
          >
            <Plus className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[220px]">
          {availableProjects.length > 0 && (
            <>
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Projekte
              </DropdownMenuLabel>
              {availableProjects.map(project => (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() => onOpenProject(project)}
                  className="gap-2.5"
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: project.color || '#45ADFF' }}
                  />
                  <span className="truncate">{project.name}</span>
                  {project.container_status === 'running' && (
                    <Terminal className="size-3 text-primary ml-auto shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={onCreateProject} className="gap-2.5">
            <FolderPlus className="size-3.5 text-primary shrink-0" />
            <span>Neues Projekt erstellen</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* All projects button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onShowAllProjects}
        className="text-muted-foreground hover:text-foreground h-[38px] px-3 rounded-none shrink-0"
        title="Alle Projekte"
      >
        <List className="size-4" />
      </Button>
    </div>
  );
}
