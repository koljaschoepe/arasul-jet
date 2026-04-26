import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useApi } from '../../../hooks/useApi';
import { settingsKeys } from './queryKeys';

export interface Service {
  id: string;
  name: string;
  status: string;
  canRestart?: boolean;
}

interface ServicesResponse {
  services?: Service[];
}

/**
 * useServicesQuery — Status of all platform services.
 * Polled every 15s while mounted (status changes during restarts/recovery).
 */
export function useServicesQuery(): UseQueryResult<Service[]> {
  const api = useApi();
  return useQuery({
    queryKey: settingsKeys.services(),
    queryFn: async ({ signal }) => {
      const data = await api.get<ServicesResponse>('/services/all', {
        showError: false,
        signal,
      });
      return data.services ?? [];
    },
    refetchInterval: 15_000,
  });
}

// ---- Profile (KI-Profil) ----

interface ProfileResponse {
  profile?: string | null;
}

export interface ParsedProfile {
  firma: string;
  branche: string;
  produkte: string[];
  antwortlaenge: string;
  formalitaet: string;
}

const PROFILE_DEFAULTS: ParsedProfile = {
  firma: '',
  branche: '',
  produkte: [],
  antwortlaenge: 'mittel',
  formalitaet: 'normal',
};

/**
 * Minimal YAML parser for the profile shape we get from /memory/profile.
 * The backend returns a hand-formatted YAML string with top-level keys
 * (firma, branche), a `produkte:` list, and a `praeferenzen:` block with
 * antwortlaenge/formalitaet. This parser is intentionally narrow — it
 * matches only the shape we expect; anything else is ignored.
 */
function parseProfileYaml(yamlStr: string): ParsedProfile {
  const result: ParsedProfile = { ...PROFILE_DEFAULTS, produkte: [] };
  const lines = yamlStr.split('\n');

  // Top-level scalars (firma, branche)
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('- ')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx <= 0) continue;
    const key = trimmed.substring(0, colonIdx).trim();
    const val = trimmed
      .substring(colonIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (key === 'firma') result.firma = val;
    else if (key === 'branche') result.branche = val;
  }

  // produkte: list
  const produkteIdx = lines.findIndex(l => l.trim() === 'produkte:');
  if (produkteIdx >= 0) {
    for (let i = produkteIdx + 1; i < lines.length; i++) {
      const l = lines[i]?.trim() ?? '';
      if (l.startsWith('- ')) {
        result.produkte.push(l.substring(2).trim());
      } else if (l && !l.startsWith('#')) {
        break;
      }
    }
  }

  // praeferenzen: block
  const praefIdx = lines.findIndex(l => l.trim() === 'praeferenzen:');
  if (praefIdx >= 0) {
    for (let i = praefIdx + 1; i < lines.length; i++) {
      const l = lines[i]?.trim() ?? '';
      if (l.startsWith('antwortlaenge:')) {
        result.antwortlaenge = (l.split(':')[1] ?? '').trim().replace(/^["']|["']$/g, '');
      } else if (l.startsWith('formalitaet:')) {
        result.formalitaet = (l.split(':')[1] ?? '').trim().replace(/^["']|["']$/g, '');
      } else if (l && !l.startsWith('#') && !l.startsWith('-')) {
        if (l.indexOf(':') > 0 && !l.startsWith(' ')) break;
      }
    }
  }

  return result;
}

/**
 * useProfileQuery — KI-Profile (firma, branche, produkte, präferenzen).
 * Backend returns a YAML string; we parse it into a structured object
 * here so consumers can work with typed fields. Returns defaults when
 * no profile is set.
 */
export function useProfileQuery(): UseQueryResult<ParsedProfile> {
  const api = useApi();
  return useQuery({
    queryKey: settingsKeys.profile(),
    queryFn: async ({ signal }) => {
      const data = await api
        .get<ProfileResponse>('/memory/profile', { showError: false, signal })
        .catch(() => ({ profile: null }) as ProfileResponse);
      if (!data.profile) return { ...PROFILE_DEFAULTS, produkte: [] };
      return parseProfileYaml(data.profile);
    },
  });
}

// ---- Company Context ----

export interface CompanyContext {
  content: string;
  updated_at: string | null;
}

/** useCompanyContextQuery — Free-form markdown company context. */
export function useCompanyContextQuery(): UseQueryResult<CompanyContext> {
  const api = useApi();
  return useQuery({
    queryKey: settingsKeys.companyContext(),
    queryFn: async ({ signal }) => {
      const data = await api
        .get<CompanyContext>('/settings/company-context', { showError: false, signal })
        .catch(() => ({ content: '', updated_at: null }) as CompanyContext);
      return { content: data.content ?? '', updated_at: data.updated_at ?? null };
    },
  });
}

// ---- Password Requirements ----

export interface PasswordRequirements {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}

interface PasswordRequirementsResponse {
  requirements: PasswordRequirements;
}

/**
 * usePasswordRequirementsQuery — Server-defined password complexity rules.
 * Long staleTime: requirements change rarely (admin-only config).
 */
export function usePasswordRequirementsQuery(): UseQueryResult<PasswordRequirements | null> {
  const api = useApi();
  return useQuery({
    queryKey: settingsKeys.passwordRequirements(),
    queryFn: async ({ signal }) => {
      const data = await api.get<PasswordRequirementsResponse>('/settings/password-requirements', {
        showError: false,
        signal,
      });
      return data.requirements ?? null;
    },
    staleTime: 5 * 60_000,
  });
}

// ---- Tailscale Status ----

export interface TailscalePeer {
  id: string;
  hostname: string;
  dnsName: string;
  ip: string;
  os: string;
  online: boolean;
  lastSeen: string | null;
}

export interface TailscaleStatus {
  installed: boolean;
  running: boolean;
  connected: boolean;
  ip: string | null;
  hostname: string | null;
  dnsName: string | null;
  tailnet: string | null;
  version: string | null;
  peers: TailscalePeer[];
}

const EMPTY_TAILSCALE_STATUS: TailscaleStatus = {
  installed: false,
  running: false,
  connected: false,
  ip: null,
  hostname: null,
  dnsName: null,
  tailnet: null,
  version: null,
  peers: [],
};

const TAILSCALE_SS_KEY = 'arasul_tailscale_status';

function readTailscaleSessionCache(): TailscaleStatus | null {
  try {
    const raw = sessionStorage.getItem(TAILSCALE_SS_KEY);
    return raw ? (JSON.parse(raw) as TailscaleStatus) : null;
  } catch {
    return null;
  }
}

function writeTailscaleSessionCache(data: TailscaleStatus) {
  try {
    sessionStorage.setItem(TAILSCALE_SS_KEY, JSON.stringify(data));
  } catch {
    /* sessionStorage unavailable — non-fatal */
  }
}

/**
 * useTailscaleStatusQuery — VPN connection status. Polled every 30s.
 *
 * Bootstrap UX: reads sessionStorage as `initialData` so a tab switch back
 * to RemoteAccessSettings shows the previous status instantly while the
 * fresh status loads in the background. The session cache is updated on
 * every successful fetch via the queryFn.
 */
export function useTailscaleStatusQuery(): UseQueryResult<TailscaleStatus> {
  const api = useApi();
  return useQuery({
    queryKey: settingsKeys.tailscaleStatus(),
    queryFn: async ({ signal }) => {
      try {
        const data = await api.get<TailscaleStatus>('/tailscale/status', {
          showError: false,
          signal,
        });
        writeTailscaleSessionCache(data);
        return data;
      } catch {
        // Bootstrap-only fallback so first load doesn't show "loading" forever
        // when the endpoint is briefly unavailable. Subsequent fetches surface
        // the error normally via useQuery's error state.
        return readTailscaleSessionCache() ?? EMPTY_TAILSCALE_STATUS;
      }
    },
    initialData: () => readTailscaleSessionCache() ?? undefined,
    refetchInterval: 30_000,
  });
}
