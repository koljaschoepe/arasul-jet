import { describe, it, expect } from 'vitest';
import {
  applyExtensionFilters,
  deriveExtensionFacets,
  areaLabel,
  activeExtFilterCount,
  EMPTY_EXTENSION_FILTERS,
  type ExtensionFilterState,
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
});
