import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { SETTINGS_SECTIONS, type SettingsSectionId } from '@/features/settings/sections';
import { cn } from '@marken';
import { SidebarView } from './SidebarView';

/**
 * Sidebar-Ansicht »Einstellungen« (B4). Die Sektionen (Allgemein/KI/Sicherheit/
 * Datenschutz/System/Fernzugriff) stehen jetzt hier links — wie die Flow-Liste —
 * statt in einer zweiten Spalte innerhalb des Tabs. Ein Klick setzt die aktive
 * Sektion (settingsStore) und öffnet den Einstellungen-Mitte-Tab. Gleiches Muster
 * wie Flows/Store: erst Ziel setzen, dann `openTab`.
 */
export function SettingsPanel() {
  const openTab = useWorkspaceStore(s => s.openTab);
  const activeSection = useSettingsStore(s => s.activeSection);
  const setActiveSection = useSettingsStore(s => s.setActiveSection);

  const open = (id: SettingsSectionId) => {
    setActiveSection(id);
    openTab({ type: 'settings' });
  };

  return (
    <SidebarView title="Einstellungen">
      <ul className="flex flex-col py-1">
        {SETTINGS_SECTIONS.map(section => {
          const active = activeSection === section.id;
          return (
            <li key={section.id}>
              <button
                type="button"
                data-testid={`settings-open-${section.id}`}
                aria-current={active ? 'true' : undefined}
                onClick={() => open(section.id)}
                className={cn(
                  'flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-accent/50',
                  active && 'bg-accent/60'
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 shrink-0 [&_svg]:size-4',
                    active ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {section.icon}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span
                    className={cn(
                      'truncate text-sm text-foreground',
                      active ? 'font-semibold' : 'font-medium'
                    )}
                  >
                    {section.label}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {section.description}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </SidebarView>
  );
}
