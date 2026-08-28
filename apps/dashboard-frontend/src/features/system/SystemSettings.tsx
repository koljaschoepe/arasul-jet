import { useState } from 'react';
import { Activity, DatabaseBackup, RotateCcw, Server, Upload, Wrench } from 'lucide-react';
import { FilterBar, type FilterBarItem } from '@/components/ui/FilterBar';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { ServicesSettings } from './ServicesSettings';
import UpdatePage from './UpdatePage';
import SelfHealingEvents from './SelfHealingEvents';
import { SystemStatus } from './SystemStatus';
import { Sicherung } from './sicherung/Sicherung';
import { Werksreset } from './Werksreset';

type SubId = 'status' | 'services' | 'updates' | 'sicherung' | 'selfhealing' | 'werksreset';

/**
 * Die Unterbereiche in der Reihenfolge, in der ein Administrator sie braucht:
 * erst was gerade ist (Auslastung), dann was läuft (Dienste), dann die drei
 * Handgriffe des Betriebs (einspielen, sichern, heilen) und ganz hinten der
 * Werksreset, der alles wegnimmt.
 *
 * „Sicherung" kommt mit Phase D5 dazu. Die Wege dahinter stehen seit C9; bis
 * dahin gab es sie nur für jemanden mit einer Konsole.
 */
const subSections: FilterBarItem<SubId>[] = [
  { id: 'status', label: 'Auslastung', icon: Activity },
  { id: 'services', label: 'Dienste', icon: Server },
  { id: 'updates', label: 'Aktualisierungen', icon: Upload },
  { id: 'sicherung', label: 'Sicherung', icon: DatabaseBackup },
  { id: 'selfhealing', label: 'Selbstheilung', icon: Wrench },
  { id: 'werksreset', label: 'Werksreset', icon: RotateCcw },
];

interface SystemSettingsProps {
  /** Optional initial sub-section (e.g. from a `?sub=` deep link). */
  initial?: SubId;
}

/**
 * "System" settings tab — bundles Services, Updates and Self-Healing into one
 * tab with an internal sub-navigation. Each sub-section keeps its own
 * ComponentErrorBoundary so one failing area doesn't crash the whole tab.
 * Only the active sub-section is mounted (these are read-mostly, self-polling
 * views — no unsaved state to preserve across switches).
 */
export function SystemSettings({ initial }: SystemSettingsProps = {}) {
  const [active, setActive] = useState<SubId>(initial ?? 'status');

  return (
    <FilterBar
      items={subSections}
      active={active}
      onChange={setActive}
      label="System-Unterbereiche"
      panelClassName="pt-6"
    >
      {active === 'status' && (
        <ComponentErrorBoundary componentName="Auslastung">
          <SystemStatus />
        </ComponentErrorBoundary>
      )}
      {active === 'services' && (
        <ComponentErrorBoundary componentName="Dienste">
          <ServicesSettings />
        </ComponentErrorBoundary>
      )}
      {active === 'updates' && (
        <ComponentErrorBoundary componentName="Aktualisierungen">
          <UpdatePage />
        </ComponentErrorBoundary>
      )}
      {active === 'sicherung' && (
        <ComponentErrorBoundary componentName="Sicherung">
          <Sicherung />
        </ComponentErrorBoundary>
      )}
      {active === 'selfhealing' && (
        <ComponentErrorBoundary componentName="Selbstheilung">
          <SelfHealingEvents />
        </ComponentErrorBoundary>
      )}
      {active === 'werksreset' && (
        <ComponentErrorBoundary componentName="Werksreset">
          <Werksreset />
        </ComponentErrorBoundary>
      )}
    </FilterBar>
  );
}
