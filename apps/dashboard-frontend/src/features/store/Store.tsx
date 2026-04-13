/**
 * Store Component
 * Unified store for AI models, apps and extensions
 * Combines the former ModelStore and AppStore into a single interface
 *
 * Migrated to TypeScript + shadcn + Tailwind
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import { Package, Search, X, Cpu, LayoutGrid, Home } from 'lucide-react';
import { Input } from '@/components/ui/shadcn/input';
import { cn } from '@/lib/utils';
import { useDownloads } from '../../contexts/DownloadContext';
import StoreHome from './StoreHome';
import StoreModels from './StoreModels';
import StoreApps from './StoreApps';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import { useDebouncedSearch } from '../../hooks/useDebouncedSearch';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';

interface SearchResultItem {
  id: string;
  name: string;
  category: string;
}

interface SearchResults {
  models: SearchResultItem[];
  apps: SearchResultItem[];
}

interface SystemInfo {
  llmRamGB: number;
  totalRamGB: number;
  availableDiskGB: number;
}

const EMPTY_SEARCH: SearchResults = { models: [], apps: [] };

function Store() {
  const api = useApi();
  const toast = useToast();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [systemInfo, setSystemInfo] = useState<SystemInfo>({
    llmRamGB: 32,
    totalRamGB: 64,
    availableDiskGB: 100,
  });

  // Load system info for RAM-based recommendations
  useEffect(() => {
    const loadSystemInfo = async () => {
      try {
        const data = await api.get('/store/info', { showError: false });
        setSystemInfo(data);
      } catch (err) {
        toast.error('Systeminfo konnte nicht geladen werden');
      }
    };
    loadSystemInfo();
  }, [api, toast]);

  // Debounced search with AbortController for race condition prevention (STORE-003)
  const storeSearcher = useCallback(
    async (q: string, signal: AbortSignal) => {
      try {
        return await api.get<SearchResults>(`/store/search?q=${encodeURIComponent(q)}`, {
          signal,
          showError: false,
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          toast.error('Suche fehlgeschlagen');
        }
        throw err;
      }
    },
    [api, toast]
  );

  const { results: searchResults, searching: isSearching } = useDebouncedSearch(
    searchQuery,
    storeSearcher,
    { initialResults: EMPTY_SEARCH }
  );

  // Determine active tab from URL
  const activeTab = useMemo(() => {
    if (location.pathname === '/store' || location.pathname === '/store/') return 'home';
    if (location.pathname.startsWith('/store/models')) return 'models';
    if (location.pathname.startsWith('/store/apps')) return 'apps';
    return 'home';
  }, [location.pathname]);

  // Clear search when navigating
  const handleTabClick = () => {
    if (searchQuery) {
      setSearchQuery('');
    }
  };

  return (
    <div className="store p-4 md:p-6 max-w-[1600px] mx-auto animate-in fade-in">
      {/* Header */}
      <div className="store-header mb-6">
        <div className="store-header-top flex items-center justify-between gap-6 mb-4 flex-wrap relative">
          <div className="store-title flex items-center gap-3">
            <Package className="size-7 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Store</h1>
          </div>

          {/* Global Search */}
          <div className="store-search relative flex-1 max-w-[400px] min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Modelle und Apps durchsuchen..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              aria-label="Store durchsuchen"
              className="pl-10 pr-10"
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors rounded"
                onClick={() => setSearchQuery('')}
                aria-label="Suche leeren"
              >
                <X className="size-4" />
              </button>
            )}

            {/* Search Results Overlay */}
            {searchQuery && (
              <div className="store-search-results absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-lg shadow-lg z-50 max-h-[400px] overflow-y-auto">
                {isSearching ? (
                  <div className="p-6 text-center text-muted-foreground">Suche...</div>
                ) : (
                  <>
                    {searchResults.models.length > 0 && (
                      <div className="search-section p-4 border-b border-border last:border-b-0">
                        <h3 className="search-section-heading flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                          <Cpu className="size-3.5" /> Modelle ({searchResults.models.length})
                        </h3>
                        <div className="flex flex-col gap-1">
                          {searchResults.models.slice(0, 5).map(model => (
                            <NavLink
                              key={model.id}
                              to={`/store/models?highlight=${model.id}`}
                              className="search-item flex justify-between items-center px-3 py-2.5 rounded-md no-underline transition-colors hover:bg-muted"
                              onClick={() => setSearchQuery('')}
                            >
                              <span className="search-item-name text-foreground font-medium">
                                {model.name}
                              </span>
                              <span className="search-item-meta text-muted-foreground text-xs">
                                {model.category}
                              </span>
                            </NavLink>
                          ))}
                          {searchResults.models.length > 5 && (
                            <NavLink
                              to="/store/models"
                              className="search-item flex items-center justify-center px-3 py-2 rounded-md no-underline text-primary text-sm font-medium hover:bg-primary/5 transition-colors"
                              onClick={() => setSearchQuery('')}
                            >
                              und {searchResults.models.length - 5} weitere Modelle
                            </NavLink>
                          )}
                        </div>
                      </div>
                    )}
                    {searchResults.apps.length > 0 && (
                      <div className="search-section p-4 border-b border-border last:border-b-0">
                        <h3 className="search-section-heading flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                          <LayoutGrid className="size-3.5" /> Apps ({searchResults.apps.length})
                        </h3>
                        <div className="flex flex-col gap-1">
                          {searchResults.apps.slice(0, 5).map(app => (
                            <NavLink
                              key={app.id}
                              to={`/store/apps?highlight=${app.id}`}
                              className="search-item flex justify-between items-center px-3 py-2.5 rounded-md no-underline transition-colors hover:bg-muted"
                              onClick={() => setSearchQuery('')}
                            >
                              <span className="search-item-name text-foreground font-medium">
                                {app.name}
                              </span>
                              <span className="search-item-meta text-muted-foreground text-xs">
                                {app.category}
                              </span>
                            </NavLink>
                          ))}
                          {searchResults.apps.length > 5 && (
                            <NavLink
                              to="/store/apps"
                              className="search-item flex items-center justify-center px-3 py-2 rounded-md no-underline text-primary text-sm font-medium hover:bg-primary/5 transition-colors"
                              onClick={() => setSearchQuery('')}
                            >
                              und {searchResults.apps.length - 5} weitere Apps
                            </NavLink>
                          )}
                        </div>
                      </div>
                    )}
                    {searchResults.models.length === 0 && searchResults.apps.length === 0 && (
                      <div className="p-8 text-center text-muted-foreground">
                        <p className="font-medium mb-1">Keine Ergebnisse für „{searchQuery}"</p>
                        <p className="text-sm">
                          Versuche andere Suchbegriffe oder durchsuche die Kategorien.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="store-tabs flex gap-1 border-b border-border" role="tablist">
          <NavLink
            to="/store"
            end
            className={({ isActive }) =>
              cn(
                'store-tab flex items-center gap-2 px-5 py-3 text-sm font-medium text-muted-foreground border-b-2 border-transparent -mb-px transition-colors',
                'hover:text-foreground hover:bg-card rounded-t-lg',
                isActive && 'active text-primary border-primary'
              )
            }
            onClick={handleTabClick}
            role="tab"
            aria-selected={activeTab === 'home'}
          >
            <Home className="size-4" />
            <span>Start</span>
          </NavLink>
          <NavLink
            to="/store/models"
            className={({ isActive }) =>
              cn(
                'store-tab flex items-center gap-2 px-5 py-3 text-sm font-medium text-muted-foreground border-b-2 border-transparent -mb-px transition-colors',
                'hover:text-foreground hover:bg-card rounded-t-lg',
                isActive && 'active text-primary border-primary'
              )
            }
            onClick={handleTabClick}
            role="tab"
            aria-selected={activeTab === 'models'}
          >
            <Cpu className="size-4" />
            <span>Modelle</span>
          </NavLink>
          <NavLink
            to="/store/apps"
            className={({ isActive }) =>
              cn(
                'store-tab flex items-center gap-2 px-5 py-3 text-sm font-medium text-muted-foreground border-b-2 border-transparent -mb-px transition-colors',
                'hover:text-foreground hover:bg-card rounded-t-lg',
                isActive && 'active text-primary border-primary'
              )
            }
            onClick={handleTabClick}
            role="tab"
            aria-selected={activeTab === 'apps'}
          >
            <LayoutGrid className="size-4" />
            <span>Apps</span>
          </NavLink>
        </nav>
      </div>

      {/* Content */}
      <div className="store-content mt-6">
        <Routes>
          <Route
            index
            element={
              <ComponentErrorBoundary componentName="Store-Start">
                <StoreHome systemInfo={systemInfo} />
              </ComponentErrorBoundary>
            }
          />
          <Route
            path="models"
            element={
              <ComponentErrorBoundary componentName="Store-Modelle">
                <StoreModels />
              </ComponentErrorBoundary>
            }
          />
          <Route
            path="apps"
            element={
              <ComponentErrorBoundary componentName="Store-Apps">
                <StoreApps />
              </ComponentErrorBoundary>
            }
          />
          <Route path="*" element={<Navigate to="/store" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default Store;
