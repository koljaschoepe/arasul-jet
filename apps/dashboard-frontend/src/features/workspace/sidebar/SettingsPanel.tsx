import { Liste, ListenEintrag } from '@marken';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { SETTINGS_SECTIONS, type SettingsSectionId } from '@/features/settings/sections';
import { SidebarView } from './SidebarView';

/**
 * Sidebar-Ansicht »Einstellungen« (B4). Die Sektionen (Allgemein/KI/Sicherheit/
 * Datenschutz/System/Fernzugriff) stehen jetzt hier links — wie die Flow-Liste —
 * statt in einer zweiten Spalte innerhalb des Tabs. Ein Klick setzt die aktive
 * Sektion (settingsStore) und öffnet den Einstellungen-Mitte-Tab. Gleiches Muster
 * wie Flows/Store: erst Ziel setzen, dann `openTab`.
 *
 * SEIT H5 AUS DER BIBLIOTHEK, wie die zwei Spalten daneben. Der Satz unter dem
 * Namen ist die `unterzeile` des Eintrags; der aktive hob sich bis dahin über
 * `text-primary` am Symbol ab — der Akzent ist die Farbe der Primäraktion, und
 * wenn er zugleich „hier bist du" bedeutet, bedeutet er beides nicht mehr.
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
      <div className="py-1">
        <Liste dicht>
          {SETTINGS_SECTIONS.map(section => (
            <ListenEintrag
              key={section.id}
              titel={section.label}
              symbol={section.icon}
              unterzeile={section.description}
              aktiv={activeSection === section.id}
              kennzeichen={`settings-open-${section.id}`}
              onKlick={() => open(section.id)}
            />
          ))}
        </Liste>
      </div>
    </SidebarView>
  );
}
