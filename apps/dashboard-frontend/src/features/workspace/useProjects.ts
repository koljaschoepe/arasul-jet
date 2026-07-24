import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';

/**
 * Server-State der Projekt-Ebene (Workspace-Neuausrichtung Batch 2).
 *
 * Ein Projekt ist die oberste Ebene über den Ordnern; das AKTIVE Projekt
 * (app-weite Singleton-Einstellung, Einzel-Admin) bestimmt, welche Ordner der
 * Explorer zeigt und worüber Suche/Agenten laufen. Alles Server-State (React
 * Query), kein persistenter Client-State.
 */

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  is_default: boolean;
  sort_order: number;
  folder_count: number;
}

interface ProjectsResponse {
  data: Project[];
}

interface ActiveProjectResponse {
  data: { project: Project | null; space_ids: string[] };
}

export const PROJECTS_QUERY_KEY = ['projects'] as const;
export const ACTIVE_PROJECT_QUERY_KEY = ['projects', 'active'] as const;

/** Alle Projekte + Anlegen. */
export function useProjects() {
  const api = useApi();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: () => api.get<ProjectsResponse>('/projects', { showError: false }),
    staleTime: 30_000,
  });

  const createProject = useMutation({
    mutationFn: (body: { name: string; description?: string | null }) =>
      api.post<{ data: Project }>('/projects', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY }),
  });

  const deleteProject = useMutation({
    mutationFn: (id: string) => api.del(`/projects/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ACTIVE_PROJECT_QUERY_KEY });
    },
  });

  return {
    projects: query.data?.data ?? [],
    isLoading: query.isLoading,
    createProject,
    deleteProject,
  };
}

/**
 * Aktives Projekt + Setter. Beim Wechsel werden zusätzlich die (projekt-
 * gescopten) Explorer-/Ordner-Daten invalidiert, damit der Baum sofort das neue
 * Projekt zeigt.
 */
export function useActiveProject() {
  const api = useApi();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ACTIVE_PROJECT_QUERY_KEY,
    queryFn: () => api.get<ActiveProjectResponse>('/projects/active', { showError: false }),
    staleTime: 30_000,
  });

  const setActive = useMutation({
    mutationFn: (projectId: string) =>
      api.put<{ data: { active_project_id: string } }>('/projects/active', {
        project_id: projectId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ACTIVE_PROJECT_QUERY_KEY });
      // Der Explorer-Baum + die Ordner-Liste sind auf das aktive Projekt gescopt.
      qc.invalidateQueries({ queryKey: ['spaces-tree'] });
      qc.invalidateQueries({ queryKey: ['spaces'] });
    },
  });

  return {
    activeProject: query.data?.data?.project ?? null,
    activeId: query.data?.data?.project?.id ?? null,
    spaceIds: query.data?.data?.space_ids ?? [],
    isLoading: query.isLoading,
    setActive,
  };
}
