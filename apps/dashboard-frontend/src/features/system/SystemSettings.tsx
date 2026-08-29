import { useState } from 'react';
import { Activity, DatabaseBackup, RotateCcw, Server, Upload, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@marken';
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
const subSections: { id: SubId; label: string; icon: LucideIcon }[] = [
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
    <Tabs value={active} onValueChange={wert => setActive(wert as SubId)}>
      <TabsList aria-label="System-Unterbereiche">
        {subSections.map(({ id, label, icon: Symbol }) => (
          <TabsTrigger key={id} value={id}>
            <Symbol />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="status" className="pt-6">
        <ComponentErrorBoundary componentName="Auslastung">
          <SystemStatus />
        </ComponentErrorBoundary>
      </TabsContent>
      <TabsContent value="services" className="pt-6">
        <ComponentErrorBoundary componentName="Dienste">
          <ServicesSettings />
        </ComponentErrorBoundary>
      </TabsContent>
      <TabsContent value="updates" className="pt-6">
        <ComponentErrorBoundary componentName="Aktualisierungen">
          <UpdatePage />
        </ComponentErrorBoundary>
      </TabsContent>
      <TabsContent value="sicherung" className="pt-6">
        <ComponentErrorBoundary componentName="Sicherung">
          <Sicherung />
        </ComponentErrorBoundary>
      </TabsContent>
      <TabsContent value="selfhealing" className="pt-6">
        <ComponentErrorBoundary componentName="Selbstheilung">
          <SelfHealingEvents />
        </ComponentErrorBoundary>
      </TabsContent>
      <TabsContent value="werksreset" className="pt-6">
        <ComponentErrorBoundary componentName="Werksreset">
          <Werksreset />
        </ComponentErrorBoundary>
      </TabsContent>
    </Tabs>
  );
}
