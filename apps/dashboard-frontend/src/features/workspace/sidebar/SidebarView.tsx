import type { ReactNode } from 'react';

/**
 * Einheitliche Kopfzeile aller Sidebar-Ansichten: schmale Leiste mit Titel
 * (+ optionalen Aktionen). Als eigene Komponente exportiert, damit auch der
 * Datei-Explorer (der seinen Baum selbst scrollt) exakt denselben Kopf nutzt —
 * so sieht jede Ansicht (Dateien · Modelle · Erweiterungen · Flows) gleich aus.
 */
export function SidebarViewHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="flex h-ui-header shrink-0 items-center justify-between gap-2 border-b border-border px-3">
      <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </span>
      {actions}
    </div>
  );
}

/**
 * Gemeinsame Hülle für die kontextabhängigen Sidebar-Ansichten (Plan 012
 * Phase B): eine schmale Kopfzeile mit Titel (+ optionalen Aktionen) und ein
 * scrollbarer Körper. Für Modelle/Erweiterungen/Flows. Der Datei-Explorer nutzt
 * `SidebarViewHeader` direkt, weil er seinen Baum selbst scrollt.
 */
export function SidebarView({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <SidebarViewHeader title={title} actions={actions} />
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
