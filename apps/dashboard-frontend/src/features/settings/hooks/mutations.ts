import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useApi } from '../../../hooks/useApi';
import { settingsKeys } from './queryKeys';
import type { CompanyContext, TailscaleStatus } from './queries';

interface RestartServiceResponse {
  success?: boolean;
  duration_ms?: number;
  message?: string;
}

/**
 * useRestartServiceMutation — Restart a single service.
 *
 * On success: invalidates the services list after a 2s delay (gives the
 * service time to actually restart before re-querying status).
 *
 * Caller is expected to render success/error UI from the mutation state
 * (`mutation.isPending`, `mutation.error`, etc.) — we don't toast here so
 * each call site can decide on its own messaging.
 */
export function useRestartServiceMutation(): UseMutationResult<
  RestartServiceResponse,
  Error,
  string
> {
  const api = useApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (serviceName: string) =>
      api.post<RestartServiceResponse>(`/services/restart/${serviceName}`, null, {
        showError: false,
      }),
    onSuccess: data => {
      if (data.success) {
        // Give the service time to actually restart before re-checking
        setTimeout(() => {
          qc.invalidateQueries({ queryKey: settingsKeys.services() });
        }, 2000);
      }
    },
  });
}

// ---- Profile + Company Context ----

export interface UpdateProfilePayload {
  companyName: string;
  industry: string;
  teamSize: string;
  products: string[];
  preferences: { antwortlaenge: string; formalitaet: string };
}

/**
 * useUpdateProfileMutation — Save the KI-Profile (firma, branche, produkte,
 * präferenzen). Invalidates the profile query so the next read refetches
 * the canonical YAML representation from the server.
 */
export function useUpdateProfileMutation(): UseMutationResult<
  unknown,
  Error,
  UpdateProfilePayload
> {
  const api = useApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateProfilePayload) =>
      api.post('/memory/profile', payload as unknown as Record<string, unknown>, {
        showError: false,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.profile() });
    },
  });
}

interface UpdateCompanyContextResponse {
  updated_at?: string;
}

/**
 * useUpdateCompanyContextMutation — Save the free-form company context
 * markdown. Updates the cache directly with the server-confirmed
 * updated_at so the UI's "last updated" timestamp refreshes immediately.
 */
export function useUpdateCompanyContextMutation(): UseMutationResult<
  UpdateCompanyContextResponse,
  Error,
  string
> {
  const api = useApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (content: string) =>
      api.put<UpdateCompanyContextResponse>(
        '/settings/company-context',
        { content },
        { showError: false }
      ),
    onSuccess: (data, content) => {
      qc.setQueryData<CompanyContext>(settingsKeys.companyContext(), {
        content,
        updated_at: data.updated_at ?? new Date().toISOString(),
      });
    },
  });
}

// ---- Password change ----

export interface ChangePasswordPayload {
  service: 'dashboard' | 'minio';
  currentPassword: string;
  newPassword: string;
}

interface ChangePasswordResponse {
  message?: string;
}

/**
 * useChangePasswordMutation — Change the password for either Dashboard or
 * MinIO. The caller is responsible for post-success UX (clearing form,
 * forcing logout for dashboard) since both vary by context.
 */
export function useChangePasswordMutation(): UseMutationResult<
  ChangePasswordResponse,
  Error,
  ChangePasswordPayload
> {
  const api = useApi();

  return useMutation({
    mutationFn: ({ service, currentPassword, newPassword }: ChangePasswordPayload) =>
      api.post<ChangePasswordResponse>(
        `/settings/password/${service}`,
        { currentPassword, newPassword },
        { showError: false }
      ),
  });
}

// ---- Tailscale ----

/** useInstallTailscaleMutation — Run install script on the host (~2 min). */
export function useInstallTailscaleMutation(): UseMutationResult<unknown, Error, void> {
  const api = useApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.post('/tailscale/install', null, {
        showError: false,
        signal: AbortSignal.timeout(180_000),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.tailscaleStatus() });
    },
  });
}

/**
 * useConnectTailscaleMutation — Connect with auth-key. Updates the cache
 * directly with the server-confirmed status (avoids a follow-up refetch).
 */
export function useConnectTailscaleMutation(): UseMutationResult<TailscaleStatus, Error, string> {
  const api = useApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (authKey: string) =>
      api.post<TailscaleStatus>(
        '/tailscale/connect',
        { authKey },
        { showError: false, signal: AbortSignal.timeout(60_000) }
      ),
    onSuccess: data => {
      qc.setQueryData(settingsKeys.tailscaleStatus(), data);
    },
  });
}

/** useDisconnectTailscaleMutation — Drop the VPN connection. */
export function useDisconnectTailscaleMutation(): UseMutationResult<unknown, Error, void> {
  const api = useApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => api.post('/tailscale/disconnect', null, { showError: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.tailscaleStatus() });
    },
  });
}
