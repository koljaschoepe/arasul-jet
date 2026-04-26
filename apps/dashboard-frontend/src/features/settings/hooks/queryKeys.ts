/**
 * Centralized TanStack Query keys for the Settings feature.
 *
 * Hierarchical keys allow targeted invalidation:
 *   qc.invalidateQueries({ queryKey: settingsKeys.all })       // everything
 *   qc.invalidateQueries({ queryKey: settingsKeys.services() }) // only services
 */
export const settingsKeys = {
  all: ['settings'] as const,
  services: () => [...settingsKeys.all, 'services'] as const,
  profile: () => [...settingsKeys.all, 'profile'] as const,
  companyContext: () => [...settingsKeys.all, 'companyContext'] as const,
  passwordRequirements: () => [...settingsKeys.all, 'passwordRequirements'] as const,
  tailscaleStatus: () => [...settingsKeys.all, 'tailscale', 'status'] as const,
};
