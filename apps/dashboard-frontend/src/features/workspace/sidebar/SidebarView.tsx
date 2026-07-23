import type { ReactNode } from 'react';

/**
 * Gemeinsame Hülle für die kontextabhängigen Sidebar-Ansichten (Plan 012
 * Phase B): eine schmale Kopfzeile mit Titel (+ optionalen Aktionen) und ein
 * scrollbarer Körper. Der Datei-Explorer bringt seine eigene Kopfzeile mit und
 * nutzt diese Hülle daher NICHT — sie ist für Suche/Modelle/Erweiterungen/Skills.
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
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        {actions}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
