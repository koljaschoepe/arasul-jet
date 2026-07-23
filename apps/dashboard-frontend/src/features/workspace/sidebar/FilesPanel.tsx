import { ExplorerPanel } from '../explorer/ExplorerPanel';

/**
 * Sidebar-Ansicht »Dateien« (Plan 012 Phase B): der Datei-Explorer-Baum.
 * Der ExplorerPanel bringt seine eigene Kopf-/Suchzeile mit, daher keine
 * zusätzliche SidebarView-Hülle — das erhält das bisherige Erscheinungsbild.
 */
export function FilesPanel() {
  return <ExplorerPanel />;
}
