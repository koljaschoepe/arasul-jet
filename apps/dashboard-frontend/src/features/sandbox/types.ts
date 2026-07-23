/** Sandbox feature types */

/**
 * Netzwerk-/Berechtigungsmodus eines Sandbox-Projekts (Migration 100):
 * - isolated: Bridge, nur Internet — DSGVO-saubere Testumgebung
 * - internal: Backend-Netz (LLM, Qdrant, DB)
 * - infrastructure: wie internal + Plattform-Repo rw + Docker-Socket (nur Admin)
 */
export type SandboxNetworkMode = 'isolated' | 'internal' | 'infrastructure';

/**
 * Zweck einer Sandbox (Migration 115, Plan 012 Phase E · Schritt 13):
 * - standard: leerer Workspace-Ordner mit Terminal
 * - erweiterungs-werkstatt: beim Anlegen mit ANLEITUNG.md und
 *   Beispiel-Erweiterungen bestückt (Vorlage für den Erweiterungs-Bau)
 */
export type SandboxWorkspaceType = 'standard' | 'erweiterungs-werkstatt';

export interface SandboxProject {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  base_image: string;
  status: 'active' | 'archived';
  container_id: string | null;
  container_name: string | null;
  container_status: 'none' | 'creating' | 'running' | 'stopped' | 'error' | 'committing';
  committed_image: string | null;
  host_path: string;
  container_path: string;
  resource_limits: ResourceLimits;
  environment: Record<string, string> | null;
  installed_packages: string[] | null;
  last_accessed_at: string | null;
  network_mode: SandboxNetworkMode;
  total_terminal_seconds: number;
  created_at: string;
  updated_at: string;
  active_sessions?: string;
}

export interface ResourceLimits {
  memory: string;
  cpus: string;
  pids: number;
}

export interface SandboxStats {
  total_projects: number;
  active_projects: number;
  running_containers: number;
  stopped_containers: number;
  active_sessions: number;
}
