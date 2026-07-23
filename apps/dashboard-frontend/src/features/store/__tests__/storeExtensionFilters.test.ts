import { describe, it, expect } from 'vitest';
import {
  applyExtensionFilters,
  deriveExtensionFacets,
  areaLabel,
  activeExtFilterCount,
  EMPTY_EXTENSION_FILTERS,
  type ExtensionFilterState,
  type FilterableExtension,
} from '../storeExtensionFilters';
import type { WorkspaceApp } from '@/hooks/useWorkspaceApps';
import type { WorkspaceTabType } from '@/stores/workspaceStore';

// Der Bereich (`tab`) ist für die Filter-Logik ein offener String (App-Kategorie,
// inkl. Alt-Kategorien wie „database" mit eigenem Label) — die Fixtures dürfen
// daher jede Kategorie setzen, auch eine, die kein aktiver Tab-Typ (mehr) ist.
function app(p: Partial<Omit<WorkspaceApp, 'tab'>> & { tab?: string }): WorkspaceApp {
  return {
    id: p.id ?? 'x',
    name: p.name ?? 'App',
    description: p.description ?? '',
    tab: (p.tab ?? 'automationen') as WorkspaceTabType,
    enabled: p.enabled ?? true,
  };
}

const APPS: WorkspaceApp[] = [
  app({ id: 'n8n', tab: 'automationen', enabled: true }),
  app({ id: 'db', tab: 'database', enabled: false }),
];

describe('areaLabel', () => {
  it('gibt klare Bereichs-Labels', () => {
    expect(areaLabel('automationen')).toBe('Automation');
    expect(areaLabel('database')).toBe('Datenbank');
    expect(areaLabel('sonstiges')).toBe('Sonstiges');
  });
});

describe('applyExtensionFilters', () => {
  it('leerer Filter → alle', () => {
    expect(applyExtensionFilters(APPS, EMPTY_EXTENSION_FILTERS)).toHaveLength(2);
  });
  it('Bereich grenzt ein', () => {
    const f: ExtensionFilterState = { ...EMPTY_EXTENSION_FILTERS, areas: ['database'] };
    expect(applyExtensionFilters(APPS, f).map(a => a.id)).toEqual(['db']);
  });
  it('Status grenzt ein (aktiv = enabled)', () => {
    const f: ExtensionFilterState = { ...EMPTY_EXTENSION_FILTERS, status: ['active'] };
    expect(applyExtensionFilters(APPS, f).map(a => a.id)).toEqual(['n8n']);
  });
  it('Gruppen kombinieren mit UND', () => {
    const f: ExtensionFilterState = { areas: ['automationen'], status: ['available'] };
    expect(applyExtensionFilters(APPS, f)).toHaveLength(0);
  });
});

describe('deriveExtensionFacets', () => {
  it('zählt Bereiche und Status', () => {
    const f = deriveExtensionFacets(APPS);
    expect(f.areas.map(a => a.value).sort()).toEqual(['automationen', 'database']);
    expect(f.areas.find(a => a.value === 'automationen')?.label).toBe('Automation');
    expect(f.status.find(s => s.value === 'active')?.count).toBe(1);
    expect(f.status.find(s => s.value === 'available')?.count).toBe(1);
  });
});

describe('activeExtFilterCount', () => {
  it('zählt über beide Gruppen', () => {
    expect(activeExtFilterCount({ areas: ['automationen'], status: ['active'] })).toBe(2);
  });

  it('zählt die Baukasten-Facetten mit', () => {
    expect(
      activeExtFilterCount({ areas: [], status: [], types: ['app'], tiers: ['full', 'internet'] })
    ).toBe(3);
  });
});

// --- Plan 012 Phase E: Typ + Zugriffs-Stufe über beide Quellen ---

/** Ein installiertes Paket trägt Typ/Stufe, aber keinen Bereich (`tab`). */
const PAKETE: FilterableExtension[] = [
  { id: 'mein-tool', enabled: true, type: 'tool', accessTier: 'internet' },
  { id: 'meine-app', enabled: false, type: 'app', accessTier: 'full' },
];

/** Die Kern-App n8n trägt seit Phase E ebenfalls Typ + Stufe. */
const KERN: FilterableExtension = {
  id: 'n8n',
  enabled: true,
  tab: 'automationen',
  type: 'flow',
  accessTier: 'internal',
};

describe('Typ- und Zugriffs-Stufen-Filter', () => {
  const alle: FilterableExtension[] = [KERN, ...PAKETE];

  it('grenzt auf einen Typ ein', () => {
    const f: ExtensionFilterState = { ...EMPTY_EXTENSION_FILTERS, types: ['tool'] };
    expect(applyExtensionFilters(alle, f).map(a => a.id)).toEqual(['mein-tool']);
  });

  it('grenzt auf eine Zugriffs-Stufe ein', () => {
    const f: ExtensionFilterState = { ...EMPTY_EXTENSION_FILTERS, tiers: ['full'] };
    expect(applyExtensionFilters(alle, f).map(a => a.id)).toEqual(['meine-app']);
  });

  it('kombiniert Typ und Stufe mit UND', () => {
    const f: ExtensionFilterState = {
      ...EMPTY_EXTENSION_FILTERS,
      types: ['app'],
      tiers: ['internet'],
    };
    expect(applyExtensionFilters(alle, f)).toHaveLength(0);
  });

  it('schließt Einträge ohne das gefilterte Attribut aus', () => {
    // Ein Bereichs-Filter darf die tab-losen Pakete nicht durchwinken.
    const f: ExtensionFilterState = { ...EMPTY_EXTENSION_FILTERS, areas: ['automationen'] };
    expect(applyExtensionFilters(alle, f).map(a => a.id)).toEqual(['n8n']);
  });

  it('leitet Typ- und Stufen-Facetten über beide Quellen ab', () => {
    const facets = deriveExtensionFacets(alle);
    expect(facets.types.map(t => t.value)).toEqual(['app', 'flow', 'tool']);
    expect(facets.tiers.map(t => t.value)).toEqual(['internet', 'internal', 'full']);
    expect(facets.types.find(t => t.value === 'flow')?.label).toBe('Automation');
    expect(facets.tiers.find(t => t.value === 'full')?.label).toBe('Voller Zugriff');
    // Nur die Kern-App hat einen Bereich.
    expect(facets.areas.map(a => a.value)).toEqual(['automationen']);
  });
});
