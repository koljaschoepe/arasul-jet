import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import useConfirm from '@/hooks/useConfirm';
import { useToast } from '@/contexts/ToastContext';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/shadcn/context-menu';

/**
 * Kompakte Tab-Leiste über der Arbeitsfläche (Cursor-Maß: 32px). Keine
 * Trennstriche zwischen Tabs — der aktive Tab teilt die eine Flächenfarbe
 * (bg-background) mit dem Editor-Inhalt darunter und hebt sich nur über
 * Schriftstärke/Textfarbe ab. Klick aktiviert, × oder Mittelklick schließt;
 * Rechtsklick bietet Sammel-Schließen (IDE-Konvention); Tabs lassen sich per
 * Ziehen umsortieren.
 *
 * Ungespeicherte Tabs tragen einen Punkt (statt des ×, bis man darüberfährt)
 * und lösen beim Schließen eine „Verwerfen?"-Rückfrage aus — kein stiller
 * Datenverlust (QA-Sweep-Befund).
 */
export function TabBar() {
  const tabs = useWorkspaceStore(s => s.tabs);
  const activeTabId = useWorkspaceStore(s => s.activeTabId);
  const activateTab = useWorkspaceStore(s => s.activateTab);
  const closeTab = useWorkspaceStore(s => s.closeTab);
  const moveTab = useWorkspaceStore(s => s.moveTab);
  const dirtyTabs = useWorkspaceStore(s => s.dirtyTabs);
  const { confirm, ConfirmDialog } = useConfirm();
  const toast = useToast();

  // Drag-Reorder: gezogener Index (Ref, kein Re-Render) + Drop-Ziel (State, für
  // den Einfüge-Indikator). Native HTML5-DnD — keine zusätzliche Bibliothek.
  const ziehIndex = useRef<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // Rückfrage, wenn zu schließende Tabs ungespeicherte Änderungen haben.
  const darfVerwerfen = (anzahl: number): Promise<boolean> => {
    if (anzahl === 0) return Promise.resolve(true);
    return confirm({
      title: 'Ungespeicherte Änderungen',
      message:
        anzahl > 1
          ? `${anzahl} Tabs haben ungespeicherte Änderungen. Trotzdem schließen und verwerfen?`
          : 'Dieser Tab hat ungespeicherte Änderungen. Trotzdem schließen und verwerfen?',
      confirmText: 'Verwerfen & schließen',
      cancelText: 'Abbrechen',
      confirmVariant: 'danger',
    });
  };

  const schliesseGeprueft = async (ids: string[]) => {
    const schmutzig = ids.filter(id => dirtyTabs.has(id)).length;
    if (!(await darfVerwerfen(schmutzig))) return;
    for (const id of ids) closeTab(id);
  };

  const schliesseEinen = (id: string) => void schliesseGeprueft([id]);
  const schliesseAndere = (behalteId: string) =>
    void schliesseGeprueft(tabs.filter(t => t.id !== behalteId).map(t => t.id));
  const schliesseLinks = (abId: string) => {
    const ab = tabs.findIndex(t => t.id === abId);
    if (ab <= 0) return;
    void schliesseGeprueft(tabs.slice(0, ab).map(t => t.id));
  };
  const schliesseRechts = (abId: string) => {
    const ab = tabs.findIndex(t => t.id === abId);
    if (ab < 0) return;
    void schliesseGeprueft(tabs.slice(ab + 1).map(t => t.id));
  };
  const schliesseAlle = () => void schliesseGeprueft(tabs.map(t => t.id));

  const pfadKopieren = async (pfad: string) => {
    try {
      await navigator.clipboard.writeText(pfad);
      toast.success('Pfad kopiert');
    } catch {
      toast.error('Kopieren nicht möglich');
    }
  };

  return (
    <>
      <div
        role="tablist"
        aria-label="Offene Tabs"
        className="flex h-8 shrink-0 items-end gap-px overflow-x-auto bg-background px-1 pt-1"
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const isDirty = dirtyTabs.has(tab.id);
          const istDropZiel = dropIndex === index && ziehIndex.current !== index;
          return (
            <ContextMenu key={tab.id}>
              <ContextMenuTrigger asChild>
                <div
                  role="tab"
                  aria-selected={isActive}
                  tabIndex={0}
                  draggable
                  data-dirty={isDirty || undefined}
                  title={isDirty ? `${tab.title} — ungespeichert` : undefined}
                  onClick={() => activateTab(tab.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      activateTab(tab.id);
                    }
                  }}
                  onAuxClick={e => {
                    // Mittelklick schließt den Tab (IDE-Konvention)
                    if (e.button === 1) {
                      e.preventDefault();
                      schliesseEinen(tab.id);
                    }
                  }}
                  onDragStart={e => {
                    ziehIndex.current = index;
                    e.dataTransfer.effectAllowed = 'move';
                    // Nutzlast setzen (Firefox startet den Drag sonst nicht).
                    e.dataTransfer.setData('text/x-arasul-tab', String(index));
                  }}
                  onDragOver={e => {
                    if (ziehIndex.current === null) return; // Fremd-Drag ignorieren
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dropIndex !== index) setDropIndex(index);
                  }}
                  onDrop={e => {
                    if (ziehIndex.current === null) return;
                    e.preventDefault();
                    const von = ziehIndex.current;
                    // Der Indikator sitzt am linken Rand des Ziel-Tabs = „davor
                    // einfügen". Bei einem Vorwärts-Zug rückt nach dem Entfernen
                    // alles um 1 nach links, daher index-1 als Einfügeziel — so
                    // entspricht das Ergebnis dem angezeigten Indikator.
                    if (von !== index) moveTab(von, von < index ? index - 1 : index);
                    ziehIndex.current = null;
                    setDropIndex(null);
                  }}
                  onDragEnd={() => {
                    ziehIndex.current = null;
                    setDropIndex(null);
                  }}
                  className={`group relative flex h-7 max-w-44 shrink-0 cursor-pointer items-center gap-1.5 rounded-t-md px-2.5 text-ui-sm select-none ${
                    isActive
                      ? 'bg-background font-medium text-foreground'
                      : 'text-muted-foreground/70 hover:bg-card/50 hover:text-foreground'
                  }`}
                >
                  {istDropZiel && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary"
                    />
                  )}
                  <span className="truncate">{tab.title}</span>
                  {/* Punkt (ungespeichert) ⇄ ×-Schließer teilen sich einen Platz:
                    der Punkt zeigt den Zustand, beim Überfahren erscheint das ×. */}
                  <span className="relative flex size-4 shrink-0 items-center justify-center">
                    {isDirty && (
                      <span
                        aria-hidden="true"
                        data-testid="tab-dirty-dot"
                        className={`size-2 rounded-full bg-current transition-opacity group-hover:opacity-0 ${
                          isActive ? 'opacity-80' : 'opacity-60'
                        }`}
                      />
                    )}
                    <button
                      type="button"
                      aria-label={`Tab ${tab.title} schließen`}
                      onClick={e => {
                        e.stopPropagation();
                        schliesseEinen(tab.id);
                      }}
                      className={`absolute inset-0 flex items-center justify-center rounded hover:bg-accent ${
                        isDirty
                          ? 'opacity-0 group-hover:opacity-100'
                          : isActive
                            ? 'opacity-70'
                            : 'opacity-0 group-hover:opacity-70'
                      }`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => schliesseEinen(tab.id)}>Schließen</ContextMenuItem>
                <ContextMenuItem
                  disabled={tabs.length < 2}
                  onSelect={() => schliesseAndere(tab.id)}
                >
                  Andere schließen
                </ContextMenuItem>
                <ContextMenuItem disabled={index <= 0} onSelect={() => schliesseLinks(tab.id)}>
                  Tabs links schließen
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={index >= tabs.length - 1}
                  onSelect={() => schliesseRechts(tab.id)}
                >
                  Tabs rechts schließen
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={schliesseAlle}>Alle schließen</ContextMenuItem>
                {tab.filePath && (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem onSelect={() => void pfadKopieren(tab.filePath as string)}>
                      Pfad kopieren
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
      {ConfirmDialog}
    </>
  );
}
