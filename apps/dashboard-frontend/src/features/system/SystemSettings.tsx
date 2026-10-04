import { Activity, Server, Upload, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@marken';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { ServicesSettings } from './ServicesSettings';
import UpdatePage from './UpdatePage';
import SelfHealingEvents from './SelfHealingEvents';
import { SystemStatus } from './SystemStatus';

type SubId = 'status' | 'services' | 'updates' | 'selfhealing';

/**
 * Die Unterbereiche in der Reihenfolge, in der ein Administrator sie braucht:
 * erst was gerade ist (Auslastung), dann was läuft (Dienste), dann die zwei
 * Handgriffe des Betriebs (einspielen, heilen). Sicherung und Werksreset stehen
 * seit M5 im Bereich Daten (`../settings/DatenSettings.tsx`).
 */
const subSections: {
  id: SubId;
  label: string;
  icon: LucideIcon;
  Inhalt: ComponentType;
}[] = [
  { id: 'status', label: 'Auslastung', icon: Activity, Inhalt: SystemStatus },
  { id: 'services', label: 'Dienste', icon: Server, Inhalt: ServicesSettings },
  { id: 'updates', label: 'Aktualisierungen', icon: Upload, Inhalt: UpdatePage },
  { id: 'selfhealing', label: 'Selbstheilung', icon: Wrench, Inhalt: SelfHealingEvents },
];

interface SystemSettingsProps {
  /** Der Unterbereich, der aufgeklappt ankommt (aus der Adresse). */
  initial?: SubId;
}

/**
 * Der Bereich „System" der Verwaltung: die vier Unterbereiche untereinander,
 * jeder klappt auf (M5). Bis dahin waren sie eine Reiterleiste im Bereich —
 * die zweite Reiterstufe, die die Verwaltung nicht hat (`frontend.md`). Offen
 * kommt die Auslastung an, oder der Unterbereich aus der Adresse
 * (`/workspace/verwaltung/system/sicherung`). Nur was offen ist, ist
 * gemountet: die Unterbereiche fragen selbst in Abständen nach, und alle
 * davon gleichzeitig kosteten Strom auf dem Jetson, ohne dass jemand hinsieht.
 * Jeder hat seine eigene ComponentErrorBoundary.
 */
export function SystemSettings({ initial }: SystemSettingsProps = {}) {
  return (
    <Accordion type="multiple" defaultValue={[initial ?? 'status']}>
      {subSections.map(({ id, label, icon: Symbol, Inhalt }) => (
        <AccordionItem key={id} value={id} data-testid={`system-abschnitt-${id}`}>
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              <Symbol className="size-4 text-muted-foreground" aria-hidden="true" />
              {label}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <ComponentErrorBoundary componentName={label}>
              <Inhalt />
            </ComponentErrorBoundary>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
