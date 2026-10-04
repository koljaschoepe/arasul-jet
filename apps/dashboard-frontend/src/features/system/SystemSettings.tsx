import { useQuery } from '@tanstack/react-query';
import { Server, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Kennzahl,
  Kennzahlen,
  Kopf,
} from '@marken';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useApi } from '@/hooks/useApi';
import { formatZahl } from '@/utils/formatting';
import { ServicesSettings } from './ServicesSettings';
import SelfHealingEvents from './SelfHealingEvents';

type SubId = 'services' | 'selfhealing';

const subSections: {
  id: SubId;
  label: string;
  icon: LucideIcon;
  Inhalt: ComponentType;
}[] = [
  { id: 'services', label: 'Dienste', icon: Server, Inhalt: ServicesSettings },
  { id: 'selfhealing', label: 'Selbstheilung', icon: Wrench, Inhalt: SelfHealingEvents },
];

/** Was `GET /api/ops/overview` dazu sagt; der Rest der Antwort bleibt ungelesen. */
export interface Lage {
  status: 'OK' | 'WARNING' | 'CRITICAL';
  warnings: string[];
  criticals: string[];
  metrics?: { cpu_percent?: number; ram_percent?: number; disk_percent?: number };
}

/**
 * Der eine Satz über das Gerät. Ist alles gut: „Alles läuft." Sonst, was
 * nicht stimmt, in den Sätzen des Geräts (`routes/admin/ops.js` schreibt sie
 * für einen Menschen, nicht für ein Log): erst das Gestörte, dann das, was
 * Aufmerksamkeit braucht.
 */
export function lageSatz(lage: Lage | undefined, fehler: boolean): string {
  if (fehler || !lage) return 'Der Zustand des Geräts ließ sich gerade nicht abfragen.';
  const punkte = [...(lage.criticals ?? []), ...(lage.warnings ?? [])];
  if (lage.status === 'OK' || punkte.length === 0) return 'Alles läuft.';
  return `${punkte.join('. ')}.`;
}

interface SystemSettingsProps {
  /** Der Unterbereich, der aufgeklappt ankommt (aus der Adresse). */
  initial?: SubId;
}

/**
 * Der Bereich „System" der Verwaltung (M5, `frontend.md`): ein Satz
 * („Alles läuft."), Prozessor, Speicher und Platte als drei Zahlen, darunter
 * Dienste und Selbstheilung, zugeklappt.
 *
 * Bis zum 04.10.2026 standen hier vier Unterbereiche: Auslastung (vier
 * Kacheln, ein Verlauf über 24 Stunden und eine Kachel „System-Gesundheit"),
 * Dienste, Aktualisierungen und Selbstheilung. Die Gesundheit ist jetzt der
 * Satz, die Auslastung die drei Zahlen, die Aktualisierung steht im Bereich
 * Gerät. Satz und Zahlen kommen aus EINER Antwort (`/api/ops/overview`), im
 * Takt von 30 Sekunden; nur was aufgeklappt ist, ist gemountet, denn Dienste
 * und Selbstheilung fragen selbst nach, und das kostet Strom auf dem Jetson,
 * ohne dass jemand hinsieht.
 */
export function SystemSettings({ initial }: SystemSettingsProps = {}) {
  const api = useApi();
  const { data: lage, isError } = useQuery({
    queryKey: ['ops', 'overview'],
    queryFn: () => api.get<Lage>('/ops/overview', { showError: false }),
    refetchInterval: 30_000,
    retry: false,
  });
  const m = lage?.metrics;

  return (
    <div className="animate-in fade-in flex flex-col gap-6" data-testid="system-seite">
      <Kopf titel="System" symbol={<Server />} />

      <p
        className={
          lage?.status === 'CRITICAL' ? 'text-sm text-destructive' : 'text-sm text-foreground'
        }
        data-testid="system-satz"
        data-zustand={lage?.status ?? 'unbekannt'}
        role="status"
      >
        {lage || isError ? lageSatz(lage, isError) : 'Wird geprüft …'}
      </p>

      <div data-testid="system-zahlen">
        <Kennzahlen className="lg:grid-cols-3">
          <Kennzahl beschriftung="Prozessor" wert={formatZahl(m?.cpu_percent)} einheit="%" />
          <Kennzahl beschriftung="Speicher" wert={formatZahl(m?.ram_percent)} einheit="%" />
          <Kennzahl beschriftung="Platte" wert={formatZahl(m?.disk_percent)} einheit="%" />
        </Kennzahlen>
      </div>

      <Accordion type="multiple" defaultValue={initial ? [initial] : []}>
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
    </div>
  );
}
