import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  MessageSquare,
  FolderSearch,
  Workflow,
  Pencil,
  Plus,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import { useApi } from '@/hooks/useApi';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { TreeSpace } from './ExplorerPanel';
import { collectSubtreeIds } from './ExplorerPanel';

// Feature-Entry wie in TabContent.tsx — kein Import feature-interner Komponenten.
const ProjectModal = lazy(() =>
  import('@/features/projects').then(m => ({ default: m.ProjectModal }))
);

export interface WorkspaceProject {
  id: string;
  name: string;
  description?: string;
  system_prompt?: string;
  icon?: string;
  color?: string;
  knowledge_space_id?: string | null;
  is_default?: boolean;
  space_name?: string | null;
  conversation_count?: string | number;
}

interface ProjectsSectionProps {
  spaces: TreeSpace[];
}

/**
 * »PROJEKTE« im Explorer: listet die Chat-Projekte (GET /projects) mit
 * Schnellaktionen — Chat öffnen, KI-Panel auf den verknüpften Ordner scopen,
 * n8n öffnen (Automatisierungen). Anlegen/Bearbeiten über das bestehende
 * ProjectModal; die Menubar-Aktion »Neues Projekt…« landet ebenfalls hier
 * (workspaceStore.explorerRequest).
 */
export function ProjectsSection({ spaces }: ProjectsSectionProps) {
  const api = useApi();
  const openTab = useWorkspaceStore(s => s.openTab);
  const setChatScope = useWorkspaceStore(s => s.setChatScope);
  const explorerRequest = useWorkspaceStore(s => s.explorerRequest);
  const clearExplorerRequest = useWorkspaceStore(s => s.clearExplorerRequest);

  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [modal, setModal] = useState<{
    mode: 'create' | 'edit';
    project: WorkspaceProject | null;
  } | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const data = await api.get<{ projects: WorkspaceProject[] }>('/projects', {
        showError: false,
      });
      setProjects(data.projects);
    } catch {
      // Explorer bleibt nutzbar, auch wenn Projekte nicht laden (z. B. 401-Race)
      setProjects([]);
    }
  }, [api]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Menubar → »Neues Projekt…«
  useEffect(() => {
    if (explorerRequest === 'create-project') {
      setModal({ mode: 'create', project: null });
      clearExplorerRequest();
    }
  }, [explorerRequest, clearExplorerRequest]);

  const scopeToProjectFolder = (project: WorkspaceProject) => {
    if (!project.knowledge_space_id) return;
    const ids = collectSubtreeIds(spaces, project.knowledge_space_id);
    setChatScope({ spaceIds: ids, label: project.space_name ?? project.name });
  };

  return (
    <div className="shrink-0 border-b border-border">
      <div className="flex h-7 items-center gap-1 px-2">
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="flex min-w-0 flex-1 items-center gap-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase hover:text-foreground"
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          )}
          Projekte
        </button>
        <a
          href={`${window.location.origin}/n8n`}
          target="_blank"
          rel="noopener noreferrer"
          title="Automatisierungen (n8n) öffnen"
          aria-label="Automatisierungen (n8n) öffnen"
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Workflow className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        <button
          type="button"
          title="Neues Projekt"
          aria-label="Neues Projekt"
          onClick={() => setModal({ mode: 'create', project: null })}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {!collapsed && (
        <ul className="pb-1" data-testid="projects-list">
          {projects.map(project => (
            <li key={project.id} className="group flex items-center gap-1.5 px-2 py-0.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: project.color || 'var(--color-primary, currentColor)' }}
                aria-hidden="true"
              />
              <button
                type="button"
                onClick={() => openTab({ type: 'chat' })}
                title={project.description || project.name}
                className="min-w-0 flex-1 truncate text-left text-xs text-foreground hover:text-primary"
              >
                {project.name}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={`Aktionen für Projekt ${project.name}`}
                  className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100 hover:bg-accent hover:text-foreground"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem onClick={() => openTab({ type: 'chat' })}>
                    <MessageSquare className="h-4 w-4" aria-hidden="true" />
                    Chat öffnen
                  </DropdownMenuItem>
                  {project.knowledge_space_id && (
                    <DropdownMenuItem onClick={() => scopeToProjectFolder(project)}>
                      <FolderSearch className="h-4 w-4" aria-hidden="true" />
                      KI auf Projekt-Ordner scopen
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <a
                      href={`${window.location.origin}/n8n`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Workflow className="h-4 w-4" aria-hidden="true" />
                      Automatisierung (n8n)
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setModal({ mode: 'edit', project })}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    Bearbeiten…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
          {projects.length === 0 && (
            <li className="px-4 py-1 text-xs text-muted-foreground">Noch keine Projekte</li>
          )}
        </ul>
      )}

      {modal && (
        <Suspense fallback={null}>
          <ProjectModal
            isOpen
            mode={modal.mode}
            project={
              modal.project
                ? {
                    ...modal.project,
                    knowledge_space_id: modal.project.knowledge_space_id ?? undefined,
                  }
                : null
            }
            onClose={() => setModal(null)}
            onSave={() => {
              setModal(null);
              loadProjects();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
