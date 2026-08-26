import { useState } from 'react';
import { Activity, RotateCcw, Server, Upload, Wrench } from 'lucide-react';
import { FilterBar, type FilterBarItem } from '@/components/ui/FilterBar';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { ServicesSettings } from './ServicesSettings';
import UpdatePage from './UpdatePage';
import SelfHealingEvents from './SelfHealingEvents';
import { SystemStatus } from './SystemStatus';
import { Werksreset } from './Werksreset';

type SubId = 'status' | 'services' | 'updates' | 'selfhealing' | 'werksreset';

const subSections: FilterBarItem<SubId>[] = [
  { id: 'status', label: 'System-Status', icon: Activity },
  { id: 'services', label: 'Dienste', icon: Server },
  { id: 'updates', label: 'Aktualisierungen', icon: Upload },
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
        <ComponentErrorBoundary componentName="System-Status">
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
