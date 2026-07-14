/**
 * Gemeinsame Datenbasis der Extensions-Ansicht: Modell-Katalog (+ geladenes/
 * Standard-Modell) und Container-Apps. Von ExtensionsSidebarList (Liste, im
 * Workspace-Sidebar-Baum) UND der StoreDetailPage (Mitte, im Store-Tab)
 * genutzt. React Query mit stabilen Keys dedupliziert die Requests über beide
 * Bäume hinweg — keine doppelte Poll-Last auf dem Jetson.
 *
 * Liegt bewusst in hooks/ (nicht features/store), damit die promotete
 * components/extensions/ExtensionsSidebarList es nutzen kann, ohne die
 * Feature-Isolationsregel zu verletzen.
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';

export interface CatalogModel {
  id: string;
  name: string;
  description: string;
  size_bytes: number;
  ram_required_gb: number;
  category: string;
  model_type?: string;
  capabilities?: string[];
  recommended_for?: string[];
  install_status: string;
  effective_ollama_name?: string;
  performance_tier?: number;
  speed_tier?: string;
  ollama_library_url?: string;
  /** Nutzbares Kontextfenster in Tokens (catalog-Spalte, für Gemma seeded in Migration 101). */
  context_window?: number;
}

export interface LoadedModel {
  model_id: string;
  ram_usage_mb?: number;
}

export interface CatalogApp {
  id: string;
  name: string;
  description: string;
  longDescription?: string;
  version: string;
  category: string;
  author?: string;
  icon?: string;
  status: string;
  appType?: string;
  featured?: boolean;
  hasCustomPage?: boolean;
  customPageRoute?: string;
  homepage?: string;
  builtin?: boolean;
  ports?: { external?: number; internal?: number };
  lastError?: string;
}

export const STORE_MODELS_KEY = ['store', 'models'] as const;
export const STORE_MODEL_STATUS_KEY = ['store', 'model-status'] as const;
export const STORE_MODEL_DEFAULT_KEY = ['store', 'model-default'] as const;
export const STORE_APPS_KEY = ['store', 'apps'] as const;

export function useStoreCatalog() {
  const api = useApi();
  const queryClient = useQueryClient();

  const modelsQuery = useQuery({
    queryKey: STORE_MODELS_KEY,
    queryFn: async () => {
      const res = await api.get<{ models?: CatalogModel[] }>('/models/catalog', {
        showError: false,
      });
      return res.models ?? [];
    },
    staleTime: 30_000,
  });

  const statusQuery = useQuery({
    queryKey: STORE_MODEL_STATUS_KEY,
    queryFn: async () => {
      const res = await api
        .get<{ loaded_model?: LoadedModel | null }>('/models/status', { showError: false })
        .catch(() => ({}) as { loaded_model?: LoadedModel | null });
      return res.loaded_model ?? null;
    },
    staleTime: 30_000,
  });

  const defaultQuery = useQuery({
    queryKey: STORE_MODEL_DEFAULT_KEY,
    queryFn: async () => {
      const res = await api
        .get<{ default_model?: string | null }>('/models/default', { showError: false })
        .catch(() => ({}) as { default_model?: string | null });
      return res.default_model ?? null;
    },
    staleTime: 30_000,
  });

  const appsQuery = useQuery({
    queryKey: STORE_APPS_KEY,
    queryFn: async () => {
      const res = await api.get<{ apps?: CatalogApp[] }>('/apps', { showError: false });
      return res.apps ?? [];
    },
    staleTime: 20_000,
  });

  const invalidateModels = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: STORE_MODELS_KEY });
    queryClient.invalidateQueries({ queryKey: STORE_MODEL_STATUS_KEY });
    queryClient.invalidateQueries({ queryKey: STORE_MODEL_DEFAULT_KEY });
  }, [queryClient]);

  const invalidateApps = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: STORE_APPS_KEY });
  }, [queryClient]);

  return {
    models: modelsQuery.data ?? [],
    loadedModel: statusQuery.data ?? null,
    defaultModel: defaultQuery.data ?? null,
    apps: appsQuery.data ?? [],
    isLoading:
      modelsQuery.isLoading ||
      appsQuery.isLoading ||
      statusQuery.isLoading ||
      defaultQuery.isLoading,
    invalidateModels,
    invalidateApps,
  };
}
