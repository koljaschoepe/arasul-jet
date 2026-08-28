import { X } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useSchmalesFenster } from '@/hooks/useSchmalesFenster';
import { ComponentErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Notizen } from '@/features/notizen/Notizen';

/**
 * Rechte Spalte der Shell: die Notizen (Zielbild aus Beschluss 10 vom
 * 26.08.2026, gefüllt in Phase D1). Sie stand seit B2 leer, weil Agent-Chat
 * und Terminal, die hier als eine Fläche mit zwei Modi lebten, aus der
 * Oberfläche gefallen sind.
 *
 * Die Shell versteckt die Spalte per `data-shell-hidden` am Panel, nie über
 * `aria-hidden` (Radix-Dialoge kippen das auf Nachbarn, Plan 003 · Bug b) —
 * und sie **unmountet sie nicht**. Für die Notizen ist das mehr als eine
 * Formsache: ein Zuklappen während der Schreibpause würde den Zeitgeber
 * abräumen, bevor er geschrieben hat.
 *
 * Unter 900 px ist dasselbe Panel seit D6 ein **Blatt** über der Mitte statt
 * einer Spalte daneben; der Schließen-Knopf hier legt es entsprechend zu
 * (`schliesseNotizenBlatt`) und nicht die Spalte, die es dort gar nicht gibt.
 */
export function RightPanel() {
  const toggleRightPanel = useWorkspaceStore(s => s.toggleRightPanel);
  const schliesseNotizenBlatt = useWorkspaceStore(s => s.schliesseNotizenBlatt);
  const schmal = useSchmalesFenster();

  return (
    <div className="flex h-full min-w-0 flex-col bg-background" data-testid="workspace-right-panel">
      <div className="flex h-8 shrink-0 items-center gap-2 px-2 select-none">
        <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Notizen
        </span>
        <button
          type="button"
          title="Panel ausblenden"
          aria-label="Panel ausblenden"
          onClick={schmal ? schliesseNotizenBlatt : toggleRightPanel}
          className="ml-auto flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <ComponentErrorBoundary componentName="Notizen">
          <Notizen />
        </ComponentErrorBoundary>
      </div>
    </div>
  );
}
