import { create } from 'zustand';

/**
 * Workspace-Store: die EINE Ansicht, die im Hauptbereich offen ist (M5,
 * Karte rahmen-aktivitaetsleiste, 03.10.2026).
 *
 * Bis dahin stand hier eine Tab-Liste mit aktivem Tab, die Sidebar-Ansicht der
 * Aktivitätsleiste und die Sichtbarkeit zweier Seitenspalten (v11, im
 * localStorage). Das Zielbild (`frontend.md`, Abschnitt Rahmen) kennt nichts
 * davon: um die App steht nur die Aktivitätsleiste, offen ist genau eine
 * Ansicht. Was übrig bleibt, steht vollständig in der Adresse
 * (`/workspace/...`), deshalb wird nichts mehr gespeichert — die Shell
 * spiegelt Adresse und Store ineinander (`WorkspaceShell`).
 *
 * Die Modelle sind kein eigener Typ mehr, sondern ein Bereich der Verwaltung.
 */

/**
 * `settings` sind die persönlichen Einstellungen, für alle; `verwaltung` ist
 * alles Gerätebezogene und gehört dem Administrator.
 */
export type AnsichtTyp = 'dashboard' | 'app' | 'settings' | 'verwaltung';

/** Der Stand einer App: der Livestand für alle, der Teststand für Tester. */
export type AppStand = 'live' | 'test';

export interface Ansicht {
  type: AnsichtTyp;
  /** Nur bei `app`: welche App. Ohne sie ist die Ansicht keine. */
  appId?: string;
  /** Nur bei `app`: welcher Stand. Fehlt er, gilt `live`. */
  stand?: AppStand;
  /**
   * Nur bei `app`: der Vorgang, bei dem die App aufgehen soll (die Nummer einer
   * Freigabe, M5). Steht als `?freigabe=<nummer>` in der Adresse der App.
   */
  vorgang?: number;
  /**
   * Bei `verwaltung` und `settings`: welcher Bereich. Fehlt er, gilt der erste.
   * Die Einstellungen haben seit dem 07.10.2026 je Bereich eine Seite
   * (`/workspace/settings/<bereich>`: profil, passwort, rechner,
   * erscheinungsbild), wie die Verwaltung.
   */
  bereich?: string;
  /** Nur bei `verwaltung`: ein Abschnitt im Bereich, der aufgeklappt ankommt. */
  abschnitt?: string;
  /**
   * Nur bei `verwaltung/laeufe`: die Filter der Läufe als Abfrage der Adresse
   * (`app=…&status=…`, ohne `?`), damit ein Link genau diese Auswahl zeigt (M5).
   */
  filter?: string;
  /** Der Name, etwa der App. Fehlt er, gilt der des Typs. */
  title?: string;
}

const TITEL: Record<AnsichtTyp, string> = {
  dashboard: 'Startseite',
  app: 'App',
  settings: 'Einstellungen',
  verwaltung: 'Verwaltung',
};

/** Was über der Ansicht im Browser-Tab steht. */
export function ansichtTitel(a: Ansicht): string {
  return a.title ?? TITEL[a.type];
}

/**
 * Der Schlüssel, an dem die Aktivitätsleiste erkennt, welcher Knopf gemeint
 * ist: eine App mit Kennung und Stand, sonst der Typ — der Bereich der
 * Verwaltung gehört nicht dazu, die Leiste hat für sie einen Knopf.
 */
export function ansichtId(a: Ansicht): string {
  if (a.type === 'app') {
    return `app:${a.appId ?? ''}:${a.stand ?? 'live'}`;
  }
  return a.type;
}

/** Ansicht → Adresse unterhalb von /workspace (bei einer App mit dem Vorgang als Abfrage). */
export function ansichtZuPfad(a: Ansicht): string {
  if (a.type === 'app') {
    return (
      `/workspace/app/${a.appId}${a.stand === 'test' ? '/test' : ''}` +
      (a.vorgang ? `?freigabe=${a.vorgang}` : '')
    );
  }
  if (a.type === 'verwaltung' && a.bereich) {
    return (
      `/workspace/verwaltung/${a.bereich}${a.abschnitt ? `/${a.abschnitt}` : ''}` +
      (a.filter ? `?${a.filter}` : '')
    );
  }
  if (a.type === 'settings' && a.bereich) {
    return `/workspace/settings/${a.bereich}`;
  }
  return `/workspace/${a.type}`;
}

/**
 * Die Form einer App-Kennung, wie das Backend sie kennt (`schemas/apps.js`).
 *
 * Sie steht hier nicht als zweite Berechtigung — die Kennung kommt aus der
 * Adresszeile, und von dort kommt alles Mögliche. `/workspace/app/..` ergäbe
 * sonst einen Rahmen auf `/apps/../`, also auf Arasul selbst: die Oberfläche
 * in sich geschachtelt, was wie ein Fehler des Geräts aussieht und keiner ist.
 */
const APP_KENNUNG = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Bereich und Abschnitt der Verwaltung: Wörter, kein Pfad. */
const WORT = /^[a-z][a-z-]{0,39}$/;

/** Im Bereich Läufe ist der Abschnitt die Nummer eines Laufs (M5). */
const LAUF_NUMMER = /^[1-9][0-9]{0,11}$/;

/**
 * Die Filter der Läufe, die in der Adresse stehen dürfen, in fester Reihenfolge
 * (damit dieselbe Auswahl immer dieselbe Adresse ergibt und die Shell sie nicht
 * erst „berichtigt"). Alles andere wirft die Adresse weg.
 */
const LAEUFE_FILTER = ['app', 'status', 'person', 'von', 'bis'] as const;

/** Die Abfrage der Läufe-Adresse säubern: nur bekannte Filter, nur sinnvolle Werte. */
export function laeufeFilterSaeubern(search: string): string {
  const q = new URLSearchParams(search);
  const ok = new URLSearchParams();
  for (const k of LAEUFE_FILTER) {
    const v = q.get(k);
    if (v && /^[A-Za-z0-9_-]{1,64}$/.test(v)) ok.set(k, v);
  }
  return ok.toString();
}

/**
 * Der Weg, unter dem eine App im Browser läuft — derselbe, den
 * `GET /api/apps/meine` als `pfad` liefert (Backend: `routes/appAusliefern.js`).
 *
 * Der Schrägstrich am Ende gehört dazu: ohne ihn zeigen relative Verweise in
 * der Seite (`./api/…`, `assets/…`) eine Ebene zu hoch, und das Backend
 * antwortet mit einem 301 auf genau diese Adresse.
 */
export function appPfad(appId: string, stand: AppStand = 'live'): string {
  return stand === 'test' ? `/apps/${appId}/test/` : `/apps/${appId}/`;
}

/** URL-Pfad (nach /workspace) → Ansicht, oder null wenn unbekannt. */
export function pfadZuAnsicht(subPath: string, search = ''): Ansicht | null {
  const parts = subPath.split('/').filter(Boolean);
  const head = parts[0];
  if (!head) return null;
  switch (head) {
    case 'dashboard':
      return { type: 'dashboard' };
    case 'app': {
      // `/workspace/app` ohne Kennung ist keine Ansicht, sondern ein halber
      // Link — und eine Kennung, die keine ist, erst recht keine.
      const appId = parts[1];
      if (!appId || !APP_KENNUNG.test(appId)) return null;
      const vorgang = Number(new URLSearchParams(search).get('freigabe'));
      return {
        type: 'app',
        appId,
        stand: parts[2] === 'test' ? 'test' : 'live',
        ...(Number.isInteger(vorgang) && vorgang > 0 ? { vorgang } : {}),
      };
    }
    case 'settings': {
      const bereich = parts[1] && WORT.test(parts[1]) ? parts[1] : undefined;
      return { type: 'settings', ...(bereich ? { bereich } : {}) };
    }
    case 'verwaltung': {
      const bereich = parts[1] && WORT.test(parts[1]) ? parts[1] : undefined;
      // Im Bereich Apps ist der Abschnitt eine App-Kennung (M5): jede App hat
      // in der Verwaltung eine Seite und damit eine Adresse,
      // `/workspace/verwaltung/apps/<kennung>`. Sonst bleibt es ein Wort.
      const abschnittMuster =
        bereich === 'apps' ? APP_KENNUNG : bereich === 'laeufe' ? LAUF_NUMMER : WORT;
      const abschnitt =
        bereich && parts[2] && abschnittMuster.test(parts[2]) ? parts[2] : undefined;
      const filter = bereich === 'laeufe' ? laeufeFilterSaeubern(search) : '';
      return {
        type: 'verwaltung',
        ...(bereich ? { bereich } : {}),
        ...(abschnitt ? { abschnitt } : {}),
        ...(filter ? { filter } : {}),
      };
    }
    // Die Modelle waren bis M5 eine eigene Ansicht der Aktivitätsleiste, davor
    // (bis Plan 023 B7) hieß ihr Pfad /workspace/store. Beide Lesezeichen
    // landen im Bereich der Verwaltung.
    case 'modelle':
    case 'store':
      return { type: 'verwaltung', bereich: 'modelle' };
    default:
      return null;
  }
}

/**
 * Gehört diese Ansicht dem Administrator?
 *
 * Gelesen an zwei Stellen: die Aktivitätsleiste zeigt den Knopf nicht, und die
 * Shell öffnet die Ansicht nicht über die Adresse. Beide blenden nur aus — die
 * Berechtigung ist `requireRole` im Backend, und die Wege dahinter antworten
 * einem Mitarbeiter mit 403, ob die Oberfläche sie zeigt oder nicht.
 */
export function nurFuerAdmin(typ: AnsichtTyp): boolean {
  return typ === 'verwaltung';
}

function gleich(a: Ansicht, b: Ansicht): boolean {
  return ansichtZuPfad(a) === ansichtZuPfad(b) && a.title === b.title;
}

export interface WorkspaceState {
  ansicht: Ansicht;
  /**
   * Eine Ansicht öffnen. Dieselbe noch einmal ist kein Wechsel; kommt eine
   * App ohne Namen (über die Adresse), behält sie den, den sie schon trug.
   */
  oeffne: (a: Ansicht) => void;
  /**
   * Den Namen einer App nachtragen, sobald `GET /api/apps/meine` ihn kennt —
   * nur wenn sie gerade offen ist.
   */
  setzeAppTitel: (appId: string, stand: AppStand, title: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  ansicht: { type: 'dashboard' },

  oeffne: a => {
    const jetzt = get().ansicht;
    const title = a.title ?? (ansichtId(a) === ansichtId(jetzt) ? jetzt.title : undefined);
    const neu: Ansicht = { ...a, ...(title ? { title } : {}) };
    if (!gleich(neu, jetzt)) set({ ansicht: neu });
  },

  setzeAppTitel: (appId, stand, title) =>
    set(state =>
      ansichtId(state.ansicht) === ansichtId({ type: 'app', appId, stand }) &&
      state.ansicht.title !== title
        ? { ansicht: { ...state.ansicht, title } }
        : state
    ),
}));
