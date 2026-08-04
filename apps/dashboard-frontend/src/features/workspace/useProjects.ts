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
  /** Herkunfts-Vorlage (Plan 014): null = leer angelegt. */
  vorlage_id?: string | null;
  vorlage_version?: number | null;
}

/** Eine Standardprojekt-Vorlage aus `GET /projects/vorlagen` (Plan 014, Phase 1). */
export interface ProjektVorlage {
  id: string;
  name: string;
  beschreibung: string;
  icon: string;
  color: string;
  version: number;
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
    mutationFn: (body: { name: string; description?: string | null; vorlage?: string | null }) =>
      api.post<{ data: Project }>('/projects', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
      // Ein Vorlagen-Projekt bringt Projekt-Flows mit (Plan 014): die Flow-Liste
      // (Slash-Menü, Sidebar) sofort auffrischen statt bis zu 30 s zu cachen.
      qc.invalidateQueries({ queryKey: ['flows'], exact: true });
    },
  });

  const deleteProject = useMutation({
    mutationFn: (id: string) => api.del(`/projects/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ACTIVE_PROJECT_QUERY_KEY });
      // War das gelöschte Projekt aktiv, fällt das Backend auf Standard zurück —
      // der (projekt-gescopte) Explorer-Baum muss dann neu laden.
      qc.invalidateQueries({ queryKey: ['spaces-tree'] });
      qc.invalidateQueries({ queryKey: ['spaces'] });
    },
  });

  return {
    projects: query.data?.data ?? [],
    isLoading: query.isLoading,
    createProject,
    deleteProject,
  };
}

/** Die Vorlagen-Galerie fürs Anlegen (Plan 014, Phase 1). */
export function useProjectVorlagen(enabled = true) {
  const api = useApi();
  const query = useQuery({
    queryKey: ['projects', 'vorlagen'],
    queryFn: () => api.get<{ data: ProjektVorlage[] }>('/projects/vorlagen', { showError: false }),
    enabled,
    staleTime: 5 * 60_000,
  });
  return { vorlagen: query.data?.data ?? [], isLoading: query.isLoading };
}

/** Stand eines Vorlagen-Updates eines Projekts (Plan 014, Phase 6). */
export interface VorlagenUpdateStand {
  update: boolean;
  vorlage_id: string | null;
  projekt_version: number | null;
  neue_version: number | null;
  neuerungen: { pfad: string }[];
}

/**
 * Vorlagen-Update eines Projekts: Stand abfragen + Neuerungen übernehmen
 * (Plan 014, Phase 6). Der Banner-Check läuft je aktivem Projekt.
 */
export function useVorlagenUpdate(projectId: string | null) {
  const api = useApi();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['projekt-vorlagen-update', projectId],
    queryFn: () =>
      api.get<{ data: VorlagenUpdateStand }>(`/projects/${projectId}/vorlagen-update`, {
        showError: false,
      }),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const uebernehmen = useMutation({
    // showError: false — der Banner-Dialog toastet den Fehler selbst mit
    // Kontext; ohne dies käme der useApi-Auto-Toast als Dublette dazu.
    mutationFn: (pfade: string[]) =>
      api.post<{ data: { uebernommen: string[]; version: number } }>(
        `/projects/${projectId}/vorlagen-update`,
        { pfade },
        { showError: false }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projekt-vorlagen-update', projectId] });
      // Übernommene Flows/Dateien sollen sofort in Liste + Explorer auftauchen.
      qc.invalidateQueries({ queryKey: ['flows'], exact: true });
      qc.invalidateQueries({ queryKey: ['projekt-dateien', projectId] });
    },
  });

  return { stand: query.data?.data ?? null, isLoading: query.isLoading, uebernehmen };
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
