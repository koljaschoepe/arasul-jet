import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../hooks/useApi';
import type { InstalledModel } from './types';

const FAVORITES_STORAGE_KEY = 'arasul_favorite_models';

// Query keys are flat strings (not feature-prefixed) so other parts of the
// app (e.g. Store) reading the same endpoints share the cache automatically.
const KEYS = {
  installed: ['models', 'installed'] as const,
  default: ['models', 'default'] as const,
  loaded: ['models', 'loaded'] as const,
};

interface InstalledModelsResponse {
  models?: InstalledModel[];
}

interface DefaultModelResponse {
  default_model?: string | null;
}

interface LoadedModelResponse {
  model_id?: string;
}

interface UseChatModelsParams {
  isAuthenticated: boolean;
}

export interface UseChatModelsReturn {
  selectedModel: string;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
  /** Live ref-mirror of selectedModel so callers can keep their callbacks stable. */
  selectedModelRef: React.MutableRefObject<string>;
  installedModels: InstalledModel[];
  defaultModel: string;
  loadedModel: string | null;
  favoriteModels: string[];
  loadModels: () => Promise<void>;
  setModelAsDefault: (modelId: string) => Promise<void>;
  toggleFavorite: (modelId: string) => void;
}

/**
 * useChatModels — LLM model state via TanStack Query: installed models,
 * default, currently loaded, plus per-user favorites (localStorage).
 *
 * Query keys (`['models', 'installed' | 'default' | 'loaded']`) are shared
 * with Store's hooks so changes propagate automatically (e.g. setting a
 * new default in Store updates ChatContext via cache invalidation).
 *
 * Queries are gated on `isAuthenticated` to avoid fetching before login.
 */
export default function useChatModels({
  isAuthenticated,
}: UseChatModelsParams): UseChatModelsReturn {
  const api = useApi();
  const qc = useQueryClient();

  const installedQuery = useQuery({
    queryKey: KEYS.installed,
    enabled: isAuthenticated,
    queryFn: async ({ signal }) => {
      const data = await api.get<InstalledModelsResponse>('/models/installed', {
        showError: false,
        signal,
      });
      return data.models ?? [];
    },
  });

  const defaultQuery = useQuery({
    queryKey: KEYS.default,
    enabled: isAuthenticated,
    queryFn: async ({ signal }) => {
      const data = await api.get<DefaultModelResponse>('/models/default', {
        showError: false,
        signal,
      });
      return data.default_model ?? '';
    },
  });

  const loadedQuery = useQuery({
    queryKey: KEYS.loaded,
    enabled: isAuthenticated,
    queryFn: async ({ signal }) => {
      try {
        const data = await api.get<LoadedModelResponse>('/models/loaded', {
          showError: false,
          signal,
        });
        return data.model_id ?? null;
      } catch {
        // Endpoint may not exist in older configurations
        return null;
      }
    },
  });

  // Selection + favorites are pure client state
  const [selectedModel, setSelectedModel] = useState('');
  const [favoriteModels, setFavoriteModels] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  });

  // Ref-mirror to keep streaming sendMessage stable
  const selectedModelRef = useRef(selectedModel);
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  // Set-default mutation
  const setDefaultMutation = useMutation({
    mutationFn: (modelId: string) =>
      api.post('/models/default', { model_id: modelId }, { showError: false }),
    onSuccess: (_data, modelId) => {
      // Update the cache directly so consumers see the change instantly
      qc.setQueryData(KEYS.default, modelId);
    },
  });

  const setModelAsDefault = useCallback(
    async (modelId: string) => {
      try {
        await setDefaultMutation.mutateAsync(modelId);
      } catch (err) {
        console.error('Error setting default model:', err);
      }
    },
    [setDefaultMutation]
  );

  const toggleFavorite = useCallback((modelId: string) => {
    setFavoriteModels(prev => {
      const next = prev.includes(modelId) ? prev.filter(id => id !== modelId) : [...prev, modelId];
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Manual reload (kept for API parity — invalidates all three queries)
  const loadModels = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: KEYS.installed }),
      qc.invalidateQueries({ queryKey: KEYS.default }),
      qc.invalidateQueries({ queryKey: KEYS.loaded }),
    ]);
  }, [qc]);

  return {
    selectedModel,
    setSelectedModel,
    selectedModelRef,
    installedModels: installedQuery.data ?? [],
    defaultModel: defaultQuery.data ?? '',
    loadedModel: loadedQuery.data ?? null,
    favoriteModels,
    loadModels,
    setModelAsDefault,
    toggleFavorite,
  };
}
