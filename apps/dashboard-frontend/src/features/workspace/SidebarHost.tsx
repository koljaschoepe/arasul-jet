import { useEffect } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { WorkspaceTabType } from '@/stores/workspaceStore';
import { FilesPanel } from './sidebar/FilesPanel';
import { ModelsPanel } from './sidebar/ModelsPanel';
import { ExtensionsPanel } from './sidebar/ExtensionsPanel';
import { SkillsPanel } from './sidebar/SkillsPanel';

/**
 * SidebarHost — Inhalt der linken Sidebar nach der aktiven Activity-Bar-Ansicht
 * (Plan 012 Phase B, Schritt 6). Die Activity-Bar selbst ist keine Zeile mehr
 * IN dieser Sidebar, sondern eine eigene, immer sichtbare Spalte in der
 * WorkspaceShell; das Einstellungen-Zahnrad sitzt dort unten.
 *
 *   files       → Datei-Explorer (Baum)
 *   models      → Modell-Filter
 *   extensions  → Erweiterungs-Filter
 *   skills      → Skill-Liste
 *
 * Der Datei-Explorer bleibt beim Ansichtswechsel gemountet (nur per `hidden`
 * versteckt), damit sein Baum-/Aufklapp-Zustand erhalten bleibt; die übrigen
 * (zustandslosen) Ansichten werden bedarfsweise gerendert.
 *
 * Auto-Collapse für App-Tabs: `syncSidebarForTab` klappt die Sidebar beim
 * Betreten eines App-Tabs ein und stellt die Präferenz beim Verlassen wieder
 * her (die Zustandsmaschine inkl. persistiertem `sidebarRestore` lebt im Store).
 * `APP_TAB_TYPES` ist derzeit leer — n8n läuft als Mitte-Tab, der Explorer
 * bleibt stehen (Plan 005 · Schritt 1) — der Mechanismus bleibt aber verdrahtet.
 */

const APP_TAB_TYPES: ReadonlySet<WorkspaceTabType> = new Set([]);

export function SidebarHost() {
  const activeView = useWorkspaceStore(s => s.activeView);
  const tabs = useWorkspaceStore(s => s.tabs);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);
  const syncSidebarForTab = useWorkspaceStore(s => s.syncSidebarForTab);

  const activeType = tabs.find(t => t.id === activeTabId)?.type ?? null;
  const isAppTab = activeType != null && APP_TAB_TYPES.has(activeType);

  useEffect(() => {
    syncSidebarForTab(isAppTab);
  }, [isAppTab, syncSidebarForTab]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Explorer bleibt gemountet (Baum-Zustand), nur versteckt wenn inaktiv.
          Er ist zugleich der Fallback: jede Ansicht außer models/extensions/skills
          (inkl. alter, entfernter Werte wie 'search') zeigt den Explorer. */}
      <div
        className={
          activeView === 'models' || activeView === 'extensions' || activeView === 'skills'
            ? 'hidden'
            : 'flex min-h-0 flex-1 flex-col'
        }
      >
        <FilesPanel />
      </div>
      {activeView === 'models' && <ModelsPanel />}
      {activeView === 'extensions' && <ExtensionsPanel />}
      {activeView === 'skills' && <SkillsPanel />}
    </div>
  );
}
