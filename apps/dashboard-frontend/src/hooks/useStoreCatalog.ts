/**
 * Gemeinsame Datenbasis der Store-Ansicht: Modell-Katalog (+ geladenes/
 * Standard-Modell) und Container-Apps. Vom Kartenraster (StoreModelsGrid) UND
 * der Detailseite (StoreDetailPage) genutzt. React Query mit stabilen Keys
 * dedupliziert die Requests über beide Verbraucher hinweg — keine doppelte
 * Poll-Last auf dem Jetson.
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

/**
 * Zentrale „installiert/aktiv"-Prädikate (Plan 005 · Schritt 5). Achtung:
 * Der Katalog nutzt `install_status === 'available'` verwirrenderweise für
 * „installiert/heruntergeladen" (nicht „im Store verfügbar"). Damit die
 * Zwei-Spalten-Ansicht (links nur Installiertes, Mitte Browse) und die Badges
 * dieselbe Definition teilen, kapseln wir sie hier — statt die Bedeutung an
 * jedem Aufrufer neu zu raten.
 */
export function isModelInstalled(model: CatalogModel): boolean {
  return model.install_status === 'available';
}

export function isModelActive(model: CatalogModel, loadedModelId: string | null): boolean {
  return (
    loadedModelId != null &&
    (loadedModelId === model.id || loadedModelId === model.effective_ollama_name)
  );
}

/** Container-App ist installiert (läuft, gestoppt oder im Fehlerzustand) — nur
 *  `status === 'available'` bedeutet „noch nicht installiert". */
export function isAppInstalled(app: CatalogApp): boolean {
  return app.status === 'running' || app.status === 'installed' || app.status === 'error';
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
