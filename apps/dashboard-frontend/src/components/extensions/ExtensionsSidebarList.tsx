/**
 * Extensions-Verwaltung (promoted) — die LINKE Spalte der Zwei-Spalten-Ansicht
 * (Plan 005 · Schritt 5). Zeigt bewusst NUR das schon Installierte/Aktive:
 * Plattform-Apps (Sichtbarkeits-Toggles), installierte Container-Apps und
 * heruntergeladene/aktive Modelle. Oben ein Kategorie-Filter
 * (Alle · Sprachmodelle · Apps) und ein Suchfeld. Zum Stöbern/Installieren dient
 * die Mitte (StoreDetailPage-Browse). Die Auswahl läuft über den ephemeren
 * Extension-Store; die Detailseite in der Mitte reagiert darauf.
 *
 * Liegt in components/extensions/, weil sie von ≥2 Features gebraucht wird
 * (Workspace-Shell + Store) — Feature-Isolationsregel: keine Imports aus
 * features/*. Datenbasis daher über hooks/ (useStoreCatalog, useWorkspaceApps).
 */
import { useMemo, useState } from 'react';
import { Blocks, Cpu, Package, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/shadcn/input';
import { Badge } from '@/components/ui/shadcn/badge';
import { Switch } from '@/components/ui/shadcn/switch';
import { cn } from '@/lib/utils';
import { useToast } from '@/contexts/ToastContext';
import { useWorkspaceApps } from '@/hooks/useWorkspaceApps';
import {
  useStoreCatalog,
  isModelInstalled,
  isModelActive,
  isAppInstalled,
} from '@/hooks/useStoreCatalog';
import type { CatalogApp, CatalogModel } from '@/hooks/useStoreCatalog';
import { useExtensionStore } from '@/stores/extensionStore';
import type { ExtensionKind } from '@/stores/extensionStore';

/** Kategorie-Filter der Verwaltungsspalte (spiegelt die Browse-Tabs der Mitte). */
type CategoryFilter = 'all' | 'models' | 'apps';

const CATEGORY_FILTERS: ReadonlyArray<{ value: CategoryFilter; label: string }> = [
  { value: 'all', label: 'Alle' },
  { value: 'models', label: 'Sprachmodelle' },
  { value: 'apps', label: 'Apps' },
];

interface RowBadge {
  label: string;
  tone: 'active' | 'muted' | 'error';
}

function modelBadge(model: CatalogModel, loadedId: string | null): RowBadge {
  if (loadedId && (loadedId === model.id || loadedId === model.effective_ollama_name)) {
    return { label: 'Aktiv', tone: 'active' };
  }
  if (model.install_status === 'available') return { label: 'Installiert', tone: 'muted' };
  return { label: 'Verfügbar', tone: 'muted' };
}

function appBadge(app: CatalogApp): RowBadge {
  switch (app.status) {
    case 'running':
      return { label: 'Aktiv', tone: 'active' };
    case 'installed':
      return { label: 'Gestoppt', tone: 'muted' };
    case 'error':
      return { label: 'Fehler', tone: 'error' };
    default:
      return { label: 'Verfügbar', tone: 'muted' };
  }
}

function badgeClass(tone: RowBadge['tone']): string {
  switch (tone) {
    case 'active':
      return 'border-primary/30 bg-primary/10 text-primary';
    case 'error':
      return 'border-destructive/30 bg-destructive/10 text-destructive';
    default:
      return 'border-border bg-muted text-muted-foreground';
  }
}

interface ExtensionRowProps {
  icon: React.ReactNode;
  name: string;
  description: string;
  badge: RowBadge;
  selected: boolean;
  onSelect: () => void;
  testId: string;
}

function ExtensionRow({
  icon,
  name,
  description,
  badge,
  selected,
  onSelect,
  testId,
}: ExtensionRowProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors',
        selected ? 'bg-accent text-foreground' : 'hover:bg-accent/50'
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center text-primary [&_svg]:size-3.5">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{name}</span>
        <span className="block truncate text-xs text-muted-foreground">{description}</span>
      </span>
      <Badge
        variant="outline"
        className={cn('h-4.5 shrink-0 px-1.5 text-ui-xs', badgeClass(badge.tone))}
      >
        {badge.label}
      </Badge>
    </button>
  );
}

function SectionHeading({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-1.5 px-2.5 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {icon}
      {children}
    </h2>
  );
}

const APP_ICON = <Package aria-hidden="true" />;
const MODEL_ICON = <Cpu aria-hidden="true" />;

export function ExtensionsSidebarList() {
  const toast = useToast();
  const { models, apps, loadedModel } = useStoreCatalog();
  const { apps: platformApps, setAppEnabled } = useWorkspaceApps();
  const selected = useExtensionStore(s => s.selected);
  const selectExtension = useExtensionStore(s => s.selectExtension);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');

  const isSelected = (kind: ExtensionKind, id: string) =>
    selected?.kind === kind && selected.id === id;

  const q = query.trim().toLowerCase();
  const matches = (name: string, description: string) =>
    q === '' || name.toLowerCase().includes(q) || description.toLowerCase().includes(q);

  const loadedId = loadedModel?.model_id ?? null;
  const showApps = category !== 'models';
  const showModels = category !== 'apps';

  // Nur Installiertes/Aktives: Plattform-Apps immer (Built-in-Toggles),
  // Container-Apps nur wenn installiert, Modelle nur wenn heruntergeladen/aktiv.
  const filteredPlatformApps = useMemo(
    () => (showApps ? platformApps.filter(a => matches(a.name, a.description)) : []),
    [platformApps, q, showApps]
  );
  const filteredApps = useMemo(
    () => (showApps ? apps.filter(a => isAppInstalled(a) && matches(a.name, a.description)) : []),
    [apps, q, showApps]
  );
  const filteredModels = useMemo(
    () =>
      showModels
        ? models.filter(
            m =>
              (isModelInstalled(m) || isModelActive(m, loadedId)) && matches(m.name, m.description)
          )
        : [],
    [models, q, showModels, loadedId]
  );

  const nothingVisible =
    filteredPlatformApps.length === 0 && filteredApps.length === 0 && filteredModels.length === 0;

  return (
    <div
      className="flex h-full flex-col bg-background"
      data-testid="extensions-sidebar"
      aria-label="Extensions"
    >
      <div className="relative shrink-0 p-2 pb-1">
        <Search className="pointer-events-none absolute left-4 top-[calc(0.5rem+1rem)] size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Installierte durchsuchen..."
          aria-label="Extensions durchsuchen"
          className="h-8 pl-8 pr-8"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Suche leeren"
            className="absolute right-4 top-[calc(0.5rem+1rem)] -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Kategorie-Filter (spiegelt die Browse-Tabs der Mitte) */}
      <div
        className="flex shrink-0 flex-wrap gap-1 px-2 pb-2"
        role="group"
        aria-label="Extensions filtern"
      >
        {CATEGORY_FILTERS.map(f => (
          <button
            key={f.value}
            type="button"
            data-testid={`ext-filter-${f.value}`}
            aria-pressed={category === f.value}
            onClick={() => setCategory(f.value)}
            className={cn(
              'rounded-md px-2 py-0.5 text-xs font-medium transition-colors',
              category === f.value
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        {/* Plattform-Apps: Sichtbarkeits-Toggles (Dienste laufen weiter) */}
        {filteredPlatformApps.length > 0 && (
          <>
            <SectionHeading icon={<Blocks className="size-3.5" aria-hidden="true" />}>
              Plattform
            </SectionHeading>
            <ul>
              {filteredPlatformApps.map(app => (
                <li
                  key={app.id}
                  className="flex items-center gap-2 px-2.5 py-1.5"
                  data-testid={`platform-row-${app.id}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {app.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      Sichtbarkeit im Workspace
                    </span>
                  </span>
                  <Switch
                    checked={app.enabled}
                    aria-label={`${app.name} ${app.enabled ? 'deaktivieren' : 'aktivieren'}`}
                    onCheckedChange={async checked => {
                      try {
                        await setAppEnabled(app.id, checked);
                        toast.success(
                          checked
                            ? `${app.name} aktiviert`
                            : `${app.name} im Workspace ausgeblendet`
                        );
                      } catch {
                        toast.error('Änderung konnte nicht gespeichert werden');
                      }
                    }}
                  />
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Container-Apps */}
        {filteredApps.length > 0 && (
          <>
            <SectionHeading icon={<Package className="size-3.5" aria-hidden="true" />}>
              Apps
            </SectionHeading>
            <ul>
              {filteredApps.map(app => (
                <li key={app.id}>
                  <ExtensionRow
                    testId={`ext-app-${app.id}`}
                    icon={APP_ICON}
                    name={app.name}
                    description={app.description}
                    badge={appBadge(app)}
                    selected={isSelected('app', app.id)}
                    onSelect={() => selectExtension({ kind: 'app', id: app.id })}
                  />
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Modelle */}
        {filteredModels.length > 0 && (
          <>
            <SectionHeading icon={<Cpu className="size-3.5" aria-hidden="true" />}>
              Modelle
            </SectionHeading>
            <ul>
              {filteredModels.map(model => (
                <li key={model.id}>
                  <ExtensionRow
                    testId={`ext-model-${model.id}`}
                    icon={MODEL_ICON}
                    name={model.name}
                    description={model.description}
                    badge={modelBadge(model, loadedModel?.model_id ?? null)}
                    selected={isSelected('model', model.id)}
                    onSelect={() => selectExtension({ kind: 'model', id: model.id })}
                  />
                </li>
              ))}
            </ul>
          </>
        )}

        {nothingVisible &&
          (q !== '' ? (
            <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">
              Keine Treffer für „{query}“
            </p>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {category === 'models'
                ? 'Noch kein Modell heruntergeladen.'
                : category === 'apps'
                  ? 'Noch keine App installiert.'
                  : 'Noch nichts installiert.'}
              <br />
              <span className="text-xs">Im Katalog rechts stöbern und installieren.</span>
            </p>
          ))}
      </div>
    </div>
  );
}
