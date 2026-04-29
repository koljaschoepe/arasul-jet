/**
 * HardwareCompatibilityBadge / HardwareCompatibilityWarning
 *
 * Two visual surfaces, one source of truth (`useHardwareCompatibility`):
 *
 *   <HardwareCompatibilityBadge />     → tiny chip for model cards. Renders
 *                                        nothing in the happy path so cards
 *                                        don't get cluttered.
 *   <HardwareCompatibilityWarning />   → full info box for the detail modal,
 *                                        with the actual numbers and a
 *                                        suggestion.
 *
 * Phase 2.1 of LLM_RAG_N8N_HARDENING.
 *
 * fit states:
 *   tight    → amber  — required ≤ totalBudget but ≤20% headroom
 *   too_big  → red    — required > totalBudget (won't fit at all)
 */
import { AlertTriangle, AlertOctagon } from 'lucide-react';
import { Badge } from '@/components/ui/shadcn/badge';
import { cn } from '@/lib/utils';
import {
  useHardwareCompatibility,
  formatMb,
} from '../../../hooks/queries/useHardwareCompatibility';

interface Props {
  ram_required_gb?: number | null;
}

export default function HardwareCompatibilityBadge({ ram_required_gb }: Props) {
  const compat = useHardwareCompatibility({ ram_required_gb });

  if (compat.fit === 'fits' || compat.fit === 'unknown') return null;

  if (compat.fit === 'tight') {
    return (
      <Badge
        variant="outline"
        className="bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-400"
        title={`Benötigt ${formatMb(compat.requiredMb)} von ${formatMb(compat.totalMb)} verfügbar — wenig Reserve.`}
      >
        <AlertTriangle className="size-3" /> Knapp
      </Badge>
    );
  }

  // too_big
  return (
    <Badge
      variant="outline"
      className="bg-destructive/10 border-destructive/40 text-destructive"
      title={`Benötigt ${formatMb(compat.requiredMb)} — diese Hardware bietet nur ${formatMb(compat.totalMb)} für LLMs.`}
    >
      <AlertOctagon className="size-3" /> Passt nicht
    </Badge>
  );
}

/**
 * Warning panel for the model detail modal. Renders a colored card with
 * the actual numbers when fit is tight or too_big; renders nothing
 * otherwise.
 */
export function HardwareCompatibilityWarning({ ram_required_gb }: Props) {
  const compat = useHardwareCompatibility({ ram_required_gb });
  if (compat.fit === 'fits' || compat.fit === 'unknown') return null;

  const isTooBig = compat.fit === 'too_big';
  const Icon = isTooBig ? AlertOctagon : AlertTriangle;

  return (
    <div
      className={cn(
        'mt-6 rounded-lg border p-4',
        isTooBig
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <Icon className="size-5 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold mb-1">
            {isTooBig ? 'Passt nicht auf diese Hardware' : 'Knapper RAM-Bedarf'}
          </div>
          <p className="text-sm leading-relaxed">
            {isTooBig
              ? `Dieses Modell benötigt ${formatMb(compat.requiredMb)} RAM — dieser Jetson stellt nur ${formatMb(compat.totalMb)} für LLMs bereit. Ein Laden wird vermutlich fehlschlagen.`
              : `Benötigt ${formatMb(compat.requiredMb)} von ${formatMb(compat.totalMb)} (≥80%). Funktioniert wahrscheinlich, aber es bleibt wenig Reserve für gleichzeitig geladene andere Modelle.`}
          </p>
          {compat.wouldEvict && !isTooBig && (
            <p className="text-sm mt-2 opacity-80">
              Aktuell sind {formatMb(compat.totalMb - compat.availableMb)} belegt. Beim Laden würde
              ein anderes Modell automatisch entladen.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
