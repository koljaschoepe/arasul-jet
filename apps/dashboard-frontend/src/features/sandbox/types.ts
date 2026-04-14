/** Sandbox feature types */

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

export interface TerminalSession {
  id: string;
  project_id: string;
  session_type: 'interactive' | 'command' | 'claude_code';
  command: string | null;
  status: 'active' | 'closed' | 'error';
  container_exec_id: string | null;
  started_at: string;
  ended_at: string | null;
  metadata: Record<string, unknown> | null;
}

export interface SandboxStats {
  total_projects: number;
  active_projects: number;
  running_containers: number;
  total_sessions: number;
  total_terminal_hours: number;
}

export interface ProjectListResponse {
  projects: SandboxProject[];
  total: number;
  limit: number;
  offset: number;
  timestamp: string;
}
