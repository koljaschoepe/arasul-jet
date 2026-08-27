import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Workspace-Store v10: offene Tabs, aktiver Tab, die Sidebar-Ansicht und die
 * Sichtbarkeit der beiden Seitenspalten. Persistiert in localStorage, der
 * aktive Tab wird zusätzlich in der URL gespiegelt (siehe WorkspaceShell).
 *
 * Tab-Identität: `tabId()` liefert den deterministischen Schlüssel, openTab
 * dedupliziert. Für die Singleton-Typen ist der Schlüssel der Typ selbst; eine
 * App trägt zusätzlich ihre Kennung und ihren Stand, weil zwei Apps
 * nebeneinander offen sein sollen — das ist der ganze Zweck der Mitte.
 *
 * Phase B2 (26.08.2026): Editor, Terminal, Agent-Chat und Sandbox sind aus der
 * Oberfläche gefallen, mit ihnen die Terminal-Session-Registry, der Chat-Scope,
 * das Dirty-Register, die Explorer-Anfragen und die Tab-Typen für Dokumente,
 * Projektdateien und Projekte. Phase B3: Flow-Editor, Erweiterungs-Store und
 * der Tab einer installierten Erweiterung sind weg. Phase B5: der
 * Automationen-Tab (n8n) ist weg.
 *
 * Phase D1 (27.08.2026) füllt das Raster nach dem Zielbild aus Beschluss 10:
 * links die Apps, in der Mitte das **Dashboard** oder eine **App**, rechts die
 * Notizen. Damit kommen die ersten Tab-Typen dazu, seit der B-Block welche
 * gestrichen hat — und der erste, der wieder eine Kennung trägt (`appId`).
 */

export type WorkspaceTabType = 'dashboard' | 'app' | 'settings' | 'modelle';

/** Der Stand einer App: der Livestand für alle, der Teststand für Tester. */
export type AppStand = 'live' | 'test';

export interface WorkspaceTabSpec {
  type: WorkspaceTabType;
  /** Nur bei `app`: welche App. Ohne sie ist der Tab keiner. */
  appId?: string;
  /** Nur bei `app`: welcher Stand. Fehlt er, gilt `live`. */
  stand?: AppStand;
  title?: string;
}

export interface WorkspaceTab {
  id: string;
  type: WorkspaceTabType;
  title: string;
  appId?: string;
  stand?: AppStand;
}

const DEFAULT_TITLES: Record<WorkspaceTabType, string> = {
  dashboard: 'Übersicht',
  app: 'App',
  settings: 'Einstellungen',
  modelle: 'Modelle',
};

export function tabId(spec: WorkspaceTabSpec): string {
  if (spec.type === 'app') {
    return `app:${spec.appId ?? ''}:${spec.stand ?? 'live'}`;
  }
  return spec.type;
}

/** Aktiver Tab → URL-Pfad unterhalb von /workspace. */
export function tabToPath(tab: WorkspaceTab): string {
  if (tab.type === 'app') {
    return `/workspace/app/${tab.appId}${tab.stand === 'test' ? '/test' : ''}`;
  }
  return `/workspace/${tab.type}`;
}

/**
 * Die Form einer App-Kennung, wie das Backend sie kennt (`schemas/apps.js`).
 *
 * Sie steht hier nicht als zweite Berechtigung — die Kennung kommt aus der
 * Adresszeile, und von dort kommt alles Mögliche. `/workspace/app/..` ergäbe
 * sonst einen Rahmen auf `/apps/../`, also auf Arasul selbst: die Oberfläche
 * in sich geschachtelt, was wie ein Fehler des Geräts aussieht und keiner ist.
 * Ein Muster ist die kürzere Antwort als eine Sonderbehandlung je Fall.
 */
const APP_KENNUNG = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Der Weg, unter dem eine App im Browser läuft — derselbe, den
 * `GET /api/apps/meine` als `pfad` liefert (Backend: `routes/appAusliefern.js`).
 *
 * Der Schrägstrich am Ende gehört dazu: ohne ihn zeigen relative Verweise in
 * der Seite (`./api/…`, `assets/…`) eine Ebene zu hoch, und das Backend
 * antwortet mit einem 301 auf genau diese Adresse. Ein Umzug im iframe ist
 * kein Fehler, aber eine Anfrage, die niemand braucht.
 */
export function appPfad(appId: string, stand: AppStand = 'live'): string {
  return stand === 'test' ? `/apps/${appId}/test/` : `/apps/${appId}/`;
}

/** URL-Pfad (nach /workspace) → Tab-Spec, oder null wenn unbekannt. */
export function pathToTabSpec(subPath: string): WorkspaceTabSpec | null {
  const parts = subPath.split('/').filter(Boolean);
  const head = parts[0];
  if (!head) return null;
  switch (head) {
    case 'dashboard':
      return { type: 'dashboard' };
    case 'app': {
      // `/workspace/app` ohne Kennung ist kein Tab, sondern ein halber Link —
      // und eine Kennung, die keine ist, erst recht keiner.
      const appId = parts[1];
      if (!appId || !APP_KENNUNG.test(appId)) return null;
      return { type: 'app', appId, stand: parts[2] === 'test' ? 'test' : 'live' };
    }
    case 'settings':
      return { type: 'settings' };
    case 'modelle':
      return { type: 'modelle' };
    // Alter Pfad aus der Zeit vor Plan 023 B7: /workspace/store zeigte je nach
    // Zustand Modelle oder Erweiterungen. Seit B3 gibt es nur noch die Modelle.
    case 'store':
      return { type: 'modelle' };
    default:
      return null;
  }
}

/**
 * Die Sidebar-Ansichten der Activity-Bar. `null` heißt: keine Ansicht gewählt,
 * die linke Spalte ist leer. Seit B2 gibt es die Ansicht „Dateien" nicht mehr,
 * seit B3 auch „Erweiterungen" und „Flows" nicht; alte Stände damit landen auf
 * null. Seit D1 gibt es „Apps", und sie ist die erste Ansicht der Leiste — die
 * linke Spalte des Zielbilds.
 */
export type ActivityView = 'apps' | 'models' | 'settings';
const ACTIVITY_VIEWS: ReadonlySet<ActivityView> = new Set<ActivityView>([
  'apps',
  'models',
  'settings',
]);

/**
 * Die Ansicht, mit der die Shell anfängt. Bis D1 war das `null` — eine leere
 * linke Spalte, weil es nach dem Rückbau des Explorers nichts gab, was
 * hineingehört hätte. Jetzt gibt es etwas, und das Zielbild sagt, was: die
 * Apps.
 */
const START_VIEW: ActivityView = 'apps';

/**
 * Welche Ansichten und Tab-Typen gehören dem Administrator?
 *
 * Die Liste steht hier und nicht dreimal in der Oberfläche, weil sie an drei
 * Stellen gebraucht wird: die Aktivitätsleiste zeigt den Knopf nicht, die
 * Shell öffnet den Tab nicht über die Adresse, und der Tab-Inhalt sagt es,
 * falls doch einer im localStorage liegt. Alle drei blenden nur aus — die
 * Berechtigung ist `requireRole` im Backend, und die Wege dahinter antworten
 * einem Mitarbeiter mit 403, ob die Oberfläche sie zeigt oder nicht.
 */
const NUR_ADMIN: ReadonlySet<string> = new Set(['models', 'modelle', 'settings']);

/** Gehört diese Ansicht bzw. dieser Tab-Typ dem Administrator? */
export function nurFuerAdmin(was: ActivityView | WorkspaceTabType): boolean {
  return NUR_ADMIN.has(was);
}

export interface WorkspaceState {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  activeView: ActivityView;
  sidebarVisible: boolean;
  rightPanelVisible: boolean;
  openTab: (spec: WorkspaceTabSpec) => void;
  closeTab: (id: string) => void;
  activateTab: (id: string) => void;
  moveTab: (fromIndex: number, toIndex: number) => void;
  updateTabTitle: (id: string, title: string) => void;
  toggleSidebar: () => void;
  /** Sidebar-Sichtbarkeit explizit setzen. */
  setSidebarVisible: (visible: boolean) => void;
  /**
   * Activity-Bar-Klick (VS-Code-Semantik): dieselbe Ansicht bei offener Sidebar
   * → einklappen; sonst die Ansicht wählen und das Panel aufziehen.
   */
  selectView: (view: ActivityView) => void;
  /**
   * Ansicht setzen OHNE Toggle-/Sichtbarkeits-Nebenwirkung. Für Sync-Fälle, in
   * denen etwas anderes die Auswahl treibt (z. B. der Store-Reiter in der Mitte
   * folgt dem Sidebar-Filter) — der bloße Klick auf einen Center-Reiter soll die
   * Sidebar nicht ein-/ausklappen, nur ihren Inhalt passend stellen.
   */
  setActiveView: (view: ActivityView) => void;
  /** Rechtes Panel ein-/ausblenden. */
  toggleRightPanel: () => void;
}

/** Persistierte Felder (partialize) — Basis für die migrate-Signatur. */
interface PersistedWorkspaceState {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  activeView: ActivityView;
  sidebarVisible: boolean;
  rightPanelVisible: boolean;
}

/** Roh-Shape älterer persistierter Stände (v≤8). */
interface PersistedLegacyState {
  tabs?: Array<{ id: string; type: string; title: string; appId?: string; stand?: string }>;
  activeTabId?: string | null;
  activeView?: string;
  sidebarVisible?: boolean;
  // v≤2
  explorerVisible?: boolean;
  llmVisible?: boolean;
  // v3 (zwei unabhängige Flächen)
  chatVisible?: boolean;
  terminalVisible?: boolean;
  // v4 bis v8
  rightPanelVisible?: boolean;
}

/**
 * Migration auf v10. Ältere Stände kannten ein rechtes Panel mit Modus (Chat
 * oder Terminal), Terminal-Sessions, Tabs für Dokumente, Projektdateien und
 * Projekte (bis v6), die Tabs `erweiterungen`, `flow` und `extension` (v7)
 * und den Tab `automationen` (v8, n8n). Davon bleibt nur, was es noch gibt: die Tabs der verbliebenen Typen,
 * die Sidebar-Ansicht (ohne 'files'/'search'/'extensions'/'flows') und die
 * Sichtbarkeit der beiden Spalten. Ein Tab, der beim Aktualisieren
 * verschwindet, sieht aus wie ein Fehler; deshalb wird der alte `store`-Tab
 * weiter umgeschrieben, jetzt auf `modelle`, statt verworfen.
 *
 * v10 (Phase D1) fügt `dashboard` und `app` hinzu und nimmt nichts weg — ein
 * Stand aus v9 kann diese Typen gar nicht enthalten. Was der Filter unten
 * trotzdem prüft: ein `app`-Tab OHNE Kennung fällt. Er kann nur aus einem von
 * Hand veränderten localStorage kommen, und ohne Kennung zeigt er auf nichts.
 */
function migrateWorkspaceState(persisted: unknown, version: number): PersistedWorkspaceState {
  const old = (persisted ?? {}) as PersistedLegacyState;
  const valid = new Set(Object.keys(DEFAULT_TITLES));
  const umbenannt: Record<string, WorkspaceTabType> = { store: 'modelle' };
  const neueId: Record<string, string> = {};
  const tabs = (Array.isArray(old.tabs) ? old.tabs : [])
    .map(t => {
      const neuerTyp = umbenannt[t.type];
      if (!neuerTyp) return t;
      const id = tabId({ type: neuerTyp });
      neueId[t.id] = id;
      return { ...t, type: neuerTyp, id, title: DEFAULT_TITLES[neuerTyp] };
    })
    .filter(t => valid.has(t.type))
    .filter(t => t.type !== 'app' || Boolean(t.appId))
    // Zwei alte Tabs können auf denselben neuen Typ fallen (`store` und
    // `modelle` nebeneinander); der Schlüssel bleibt eindeutig.
    .filter((t, i, alle) => alle.findIndex(a => a.id === t.id) === i)
    .map(t => ({
      id: t.id,
      type: t.type as WorkspaceTabType,
      title: t.title,
      ...(t.appId ? { appId: t.appId, stand: t.stand === 'test' ? 'test' : 'live' } : {}),
    })) as WorkspaceTab[];
  const alterAktiver = old.activeTabId ? (neueId[old.activeTabId] ?? old.activeTabId) : null;
  const activeTabId =
    alterAktiver && tabs.some(t => t.id === alterAktiver) ? alterAktiver : (tabs[0]?.id ?? null);

  let sidebarVisible: boolean;
  let rightPanelVisible: boolean;
  if (version >= 4) {
    sidebarVisible = old.sidebarVisible ?? true;
    rightPanelVisible = old.rightPanelVisible ?? true;
  } else if (version >= 3) {
    sidebarVisible = old.sidebarVisible ?? true;
    rightPanelVisible = (old.chatVisible ?? true) || (old.terminalVisible ?? false);
  } else {
    sidebarVisible = old.explorerVisible ?? true;
    rightPanelVisible = old.llmVisible ?? true;
  }

  // Alte Werte ('files', 'search', 'extensions', 'flows') und ein Stand ohne
  // Ansicht landen auf den Apps statt auf einer leeren Spalte.
  const activeView = ACTIVITY_VIEWS.has(old.activeView as ActivityView)
    ? (old.activeView as ActivityView)
    : START_VIEW;

  return { tabs, activeTabId, activeView, sidebarVisible, rightPanelVisible };
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      activeView: START_VIEW,
      sidebarVisible: true,
      rightPanelVisible: true,

      openTab: spec => {
        const id = tabId(spec);
        const { tabs } = get();
        const existing = tabs.find(t => t.id === id);
        if (existing) {
          // Ein Titel, der mitkommt, gewinnt: der App-Name steht in
          // `GET /api/apps/meine` und kann sich mit einem App-Update ändern.
          // Ohne diese Zeile trüge ein einmal geöffneter Tab den alten Namen,
          // bis jemand ihn schließt.
          const title = spec.title && spec.title !== existing.title ? spec.title : null;
          set({
            activeTabId: id,
            ...(title ? { tabs: tabs.map(t => (t.id === id ? { ...t, title } : t)) } : {}),
          });
          return;
        }
        const tab: WorkspaceTab = {
          id,
          type: spec.type,
          title: spec.title ?? DEFAULT_TITLES[spec.type],
          ...(spec.type === 'app'
            ? { appId: spec.appId, stand: spec.stand ?? ('live' as AppStand) }
            : {}),
        };
        set({ tabs: [...tabs, tab], activeTabId: id });
      },

      closeTab: id => {
        const { tabs, activeTabId } = get();
        const index = tabs.findIndex(t => t.id === id);
        if (index === -1) return;
        const nextTabs = tabs.filter(t => t.id !== id);
        let nextActive = activeTabId;
        if (activeTabId === id) {
          const neighbor = nextTabs[index] ?? nextTabs[index - 1] ?? null;
          nextActive = neighbor ? neighbor.id : null;
        }
        set({ tabs: nextTabs, activeTabId: nextActive });
      },

      activateTab: id => {
        if (get().tabs.some(t => t.id === id)) {
          set({ activeTabId: id });
        }
      },

      moveTab: (fromIndex, toIndex) => {
        const { tabs } = get();
        if (
          fromIndex < 0 ||
          fromIndex >= tabs.length ||
          toIndex < 0 ||
          toIndex >= tabs.length ||
          fromIndex === toIndex
        ) {
          return;
        }
        const next = [...tabs];
        const moved = next.splice(fromIndex, 1)[0];
        if (!moved) return;
        next.splice(toIndex, 0, moved);
        set({ tabs: next });
      },

      updateTabTitle: (id, title) => {
        set(state => ({
          tabs: state.tabs.map(t => (t.id === id ? { ...t, title } : t)),
        }));
      },

      toggleSidebar: () => set(state => ({ sidebarVisible: !state.sidebarVisible })),
      setSidebarVisible: visible => set({ sidebarVisible: visible }),
      selectView: view =>
        set(state =>
          state.sidebarVisible && state.activeView === view
            ? { sidebarVisible: false }
            : { activeView: view, sidebarVisible: true }
        ),
      setActiveView: view => set({ activeView: view }),
      toggleRightPanel: () => set(state => ({ rightPanelVisible: !state.rightPanelVisible })),
    }),
    {
      name: 'arasul_workspace',
      version: 10,
      migrate: (persisted, version) => migrateWorkspaceState(persisted, version) as WorkspaceState,
      partialize: state => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        activeView: state.activeView,
        sidebarVisible: state.sidebarVisible,
        rightPanelVisible: state.rightPanelVisible,
      }),
    }
  )
);
