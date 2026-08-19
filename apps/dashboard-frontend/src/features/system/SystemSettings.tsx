import { useState } from 'react';
import { Activity, RotateCcw, Server, Upload, Wrench, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { ServicesSettings } from './ServicesSettings';
import UpdatePage from './UpdatePage';
import SelfHealingEvents from './SelfHealingEvents';
import { SystemStatus } from './SystemStatus';
import { Werksreset } from './Werksreset';

type SubId = 'status' | 'services' | 'updates' | 'selfhealing' | 'werksreset';

interface SubSection {
  id: SubId;
  label: string;
  icon: LucideIcon;
}

const subSections: SubSection[] = [
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
    <div className="flex flex-col gap-6">
      <nav className="flex gap-1 border-b border-border" aria-label="System-Unterbereiche">
        {subSections.map(section => {
          const Icon = section.icon;
          const isActive = active === section.id;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => setActive(section.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 -mb-px text-sm border-b-2 transition-colors',
                isActive
                  ? 'border-primary text-foreground font-semibold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className={cn('size-4 shrink-0', isActive && 'text-primary')} />
              <span>{section.label}</span>
            </button>
          );
        })}
      </nav>

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
    </div>
  );
}

export default SystemSettings;
