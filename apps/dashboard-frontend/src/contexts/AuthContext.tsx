/**
 * AuthContext - Centralized Authentication State Management
 *
 * PHASE 3: Extracts authentication logic from App.js for better separation of concerns.
 * Handles login, logout, session verification, and 401 interceptor.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { API_BASE, getAuthHeaders } from '../config/api';
import { getCsrfToken } from '../utils/csrf';
import { getTokenExpiration } from '../utils/token';
import { queryClient } from '../lib/queryClient';

interface User {
  id: number;
  username: string;
  /** `admin` oder `mitarbeiter` (Phase C1); das Backend liefert sie mit jeder Anmeldung. */
  role?: 'admin' | 'mitarbeiter';
  /**
   * Das aktuelle Passwort hat jemand anderes gesetzt (Phase D1,
   * `admin_users.passwort_vom_admin`). Steht in der Antwort von `/auth/login`,
   * `/auth/me` und `/auth/session`, damit ein Neuladen der Seite denselben
   * Schluss zieht wie die Anmeldung selbst.
   */
  passwortWechselNoetig?: boolean;
  /**
   * Die Darstellung der Oberflaeche fuer diesen Menschen (Phase H1,
   * `admin_users.theme`). Sie faehrt in derselben Antwort mit, die sagt, ob
   * eine Sitzung besteht -- die Shell kennt sie damit, bevor sie das erste Mal
   * malt, und braucht keine eigene Anfrage dafuer.
   */
  theme?: 'light' | 'dark';
  [key: string]: unknown;
}

interface LoginData {
  user: User;
  token?: string;
}

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (data: LoginData) => void;
  logout: () => Promise<void>;
  checkAuth: (signal?: AbortSignal) => Promise<boolean>;
  setLoadingComplete: () => void;
  /**
   * Eine Eigenschaft des Angemeldeten nachziehen, nachdem das GERAET sie
   * bestaetigt hat (heute: das Theme, `hooks/useTheme.ts`).
   *
   * Nicht `setUser`: eine offene Schreibstelle waere gross genug, um von
   * aussen eine Sitzung zu behaupten, die es gar nicht gibt. Wer hier
   * schreibt, aendert etwas an einem Menschen, der schon angemeldet IST --
   * ohne Sitzung passiert nichts.
   */
  benutzerAktualisieren: (teil: Partial<User>) => void;
}

// Context
const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Die Sitzungsprobe, mit zweitem und drittem Versuch — und mit Zeitgrenze.
 *
 * `GET /api/auth/session` antwortet in BEIDEN Fällen mit 200 und sagt im Rumpf,
 * welcher es ist. Eine Antwort, die nicht 200 ist, und erst recht eine, die gar
 * nicht kommt, ist deshalb KEINE Aussage über die Sitzung, sondern ein Ausfall
 * auf dem Weg dorthin — und trotzdem landete der Mensch danach auf der
 * Anmeldung, obwohl seine Sitzung getragen hätte.
 *
 * Der Fund kommt aus der Oberflächen-Abnahme am Orin (28.08.2026): einer von
 * vier Läufen fand die Seite „Neues Passwort" bei 1024 px nicht, die beiden
 * Breiten davor und danach schon. Dieselbe Klasse wie die nachgeladenen Bündel
 * aus D6 (`utils/lazyNachladen`) — eine einzelne Anfrage geht verloren, und was
 * danach dasteht, sieht aus wie eine Aussage über das Gerät.
 *
 * Zwei Dinge daher, die vorher fehlten:
 *  - eine ZEITGRENZE. Ohne sie blieb eine hängende Anfrage für immer hängen,
 *    und die Oberfläche zeigte dauerhaft „Prüfe Authentifizierung…".
 *  - ein ZWEITER VERSUCH. Er kostet auf einem gesunden Gerät nichts, weil der
 *    erste trägt.
 *
 * Ein 429 wird NICHT wiederholt: das ist eine Antwort, die der Server gegeben
 * hat, und sofort noch einmal anzuklopfen macht sie nur wahrer.
 */
const PROBE_VERSUCHE = 3;
const PROBE_GRENZE_MS = 6000;
const PROBE_PAUSE_MS = 250;

/**
 * Zwei Gründe zum Abbrechen, ein Signal: der Aufrufer (StrictMode, Unmount)
 * und die eigene Zeitgrenze. Von Hand zusammengeführt und nicht mit
 * `AbortSignal.any` — das gibt es erst seit Chrome 116 und Safari 17.4, und
 * fehlte es, würde die Probe hier werfen und JEDEN abmelden. Ein
 * `AbortController` gibt es überall.
 */
function probenSignal(signal: AbortSignal | undefined, grenzeMs: number) {
  const halt = new AbortController();
  const weiterreichen = () => halt.abort();
  if (signal?.aborted) halt.abort();
  else signal?.addEventListener('abort', weiterreichen);
  const uhr = setTimeout(() => halt.abort(), grenzeMs);
  return {
    signal: halt.signal,
    aufraeumen: () => {
      clearTimeout(uhr);
      signal?.removeEventListener('abort', weiterreichen);
    },
  };
}

async function sitzungProbe(signal?: AbortSignal): Promise<Response | null> {
  let letzte: Response | null = null;
  for (let versuch = 1; versuch <= PROBE_VERSUCHE; versuch += 1) {
    const halt = probenSignal(signal, PROBE_GRENZE_MS);
    try {
      const response = await fetch(`${API_BASE}/auth/session`, {
        headers: getAuthHeaders(),
        signal: halt.signal,
      });
      if (response.ok) return response;
      // Der Server hat geantwortet, nur nicht mit 200. Bei 429 ist das sein
      // letztes Wort; bei allem anderen darf ein zweiter Versuch fragen.
      letzte = response;
      if (response.status === 429) return response;
    } catch (err) {
      // Der Aufrufer hat abgebrochen — dann gehört der Zustand ihm, nicht uns.
      if (signal?.aborted) throw err;
      letzte = null;
    } finally {
      halt.aufraeumen();
    }
    if (versuch < PROBE_VERSUCHE) {
      await new Promise(weiter => setTimeout(weiter, PROBE_PAUSE_MS * versuch));
    }
  }
  return letzte;
}

/**
 * Abmelden am Gerät — und zwar so, dass das Sitzungscookie wirklich fällt.
 *
 * `POST /api/auth/logout` ist die EINZIGE Stelle, die das httpOnly-Cookie
 * `arasul_session` löschen kann: eine Seite sieht es nie und kann es nicht
 * selbst wegräumen. Geht dieser eine Ruf daneben, bleibt eine tote Sitzung im
 * Browser stehen, die der Mensch nicht mehr loswird — die Oberfläche zeigt die
 * Anmeldung, und der Browser trägt weiter ein Cookie.
 *
 * WARUM ZWEIMAL. Der Startpasswort-Wechsel ist selbst eine Mutation, und jede
 * angenommene Mutation DREHT das Cookie `arasul_csrf`
 * (`middleware/csrf.js`, „defense in depth"). Chromium führt `document.cookie`
 * im Renderer als Kopie und zieht sie erst kurz nach der Antwort nach; wer
 * unmittelbar danach liest — und genau das tut das Abmelden, das dem Wechsel
 * auf dem Fuß folgt — kann noch den alten Wert bekommen. Der Server sieht dann
 * Kopfzeile und Cookie auseinandergehen und antwortet mit 403 CSRF_INVALID,
 * BEVOR die Route läuft: `res.clearCookie` fällt aus, das Cookie bleibt.
 * Eine abgelehnte Anfrage dreht das Cookie NICHT — der zweite Versuch liest es
 * neu und trifft.
 *
 * Das ist der zweite Fund der Oberflächen-Abnahme am Orin (28.08.2026), einer
 * von vier Läufen. In D6 war schon einmal etwas anderes an derselben Stelle zu
 * (`requireAuth` → `optionalAuth`); dies hier ist nicht dessen Rückfall,
 * sondern die Schicht davor.
 *
 * Jeder ANDERE Mutationsweg hat diese Erholung längst: `useApi` holt bei
 * 403 CSRF_INVALID einen frischen Wert und wiederholt einmal. Das Abmelden
 * geht bewusst nicht durch `useApi` (Ringschluss, siehe `checkAuth`) — und war
 * damit der einzige Weg ohne. `GET /api/auth/csrf` hilft ihm nicht: der Weg
 * verlangt eine gültige Sitzung, und die ist nach dem Wechsel gerade tot.
 *
 * Ein `fetch` wirft nur beim Netzfehler; ein 403 oder 429 kommt als Antwort
 * zurück. Gefragt wird deshalb `res.ok` und nicht bloß, ob es eine Antwort gab.
 */
const ABMELDE_VERSUCHE = 2;
const ABMELDE_PAUSE_MS = 150;

async function abmeldenBeimGeraet(): Promise<void> {
  let letzter = 'kein Versuch';
  for (let versuch = 1; versuch <= ABMELDE_VERSUCHE; versuch += 1) {
    try {
      const headers: Record<string, string> = getAuthHeaders();
      // Frisch bei JEDEM Versuch aus dem Cookie gelesen — darin liegt die
      // ganze Erholung.
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }
      const response = await fetch(`${API_BASE}/auth/logout`, { method: 'POST', headers });
      if (response.ok) return;
      letzter = `HTTP ${response.status}`;
    } catch (err) {
      letzter = (err as Error)?.message || 'Netzfehler';
    }
    if (versuch < ABMELDE_VERSUCHE) {
      await new Promise(weiter => setTimeout(weiter, ABMELDE_PAUSE_MS));
    }
  }
  // Kein Grund, den Menschen aufzuhalten: die Oberfläche meldet ihn gleich
  // ohnehin ab. Aber es soll in der Konsole stehen, denn der Browser trägt
  // jetzt ein Cookie, das niemand mehr wegbekommt.
  console.warn(`Abmelden am Gerät fehlgeschlagen (${letzter}); Sitzungscookie bleibt womöglich.`);
}

interface AuthProviderProps {
  children: ReactNode;
}

// Provider Component
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount.
  // P2.1.1: Do NOT revive auth from localStorage cache on network error —
  // the server may have revoked the token. Better to surface "checking…" and
  // let the user retry than to silently reanimate a revoked session.
  // P2.1.4: AbortController so that StrictMode double-invokes and rapid
  // logout-during-checkAuth do not race.
  // Kein Urteil ueber die Sitzung: die Oberflaeche zeigt "nicht angemeldet",
  // aber der Token bleibt liegen. P2.1.1: aus dem localStorage wird NICHTS
  // wiederbelebt, der Server koennte ihn widerrufen haben. Der naechste
  // Versuch, etwa ein Neuladen, fragt erneut.
  const keineAussage = useCallback((grund: string) => {
    console.warn(grund);
    setIsAuthenticated(false);
    setUser(null);
    setLoading(false);
    return false;
  }, []);

  const checkAuth = useCallback(
    async (signal?: AbortSignal) => {
      try {
        // useApi-exception: AuthContext is the auth *primitive* useApi builds on
        // (useApi calls useAuth().logout). Routing these calls through useApi
        // would create a circular dependency + render loops (see useApi.ts:122)
        // and a 401 here would trigger logout mid-check. Raw fetch is deliberate.
        // F-02: /auth/session statt /auth/me. Der Pruefpunkt antwortet in beiden
        // Faellen mit 200 und sagt im Rumpf, welcher es ist. /auth/me antwortet
        // ohne Sitzung mit 401, und fuer eine 401 schreibt der BROWSER selbst
        // eine rote Zeile in die Konsole. Kein try/catch auf der Seite kann das
        // abfangen, weil es in JS gar keine Ausnahme ist. Am 20.08.2026 auf dem
        // Geraet gemessen: genau eine Konsolenzeile je Aufruf, diese.
        //
        // Nicht zu fragen waere der falsche Ausweg gewesen: das Sitzungscookie
        // ist httpOnly, eine Seite sieht es nie, und ein Browser, der den
        // localStorage ohne die httpOnly-Cookies raeumt, haette eine Sitzung
        // verloren, die der Server noch anerkannt haette. Ein Pruefpunkt, der
        // nie 401 antwortet, hat diesen Handel nicht noetig. Der Server
        // entscheidet weiter allein.
        // `sitzungProbe` und nicht ein blosses `fetch`: mit Zeitgrenze und
        // zweitem Versuch, damit eine EINZELNE verlorene Anfrage keinen
        // angemeldeten Menschen auf die Anmeldung wirft. Begruendung dort.
        const response = await sitzungProbe(signal);

        // Der Pruefpunkt antwortet auf beide Faelle mit 200. Alles andere, 429
        // aus dem Rate-Limiter, 5xx, ein Proxy dazwischen, ist KEINE Aussage
        // ueber die Sitzung. Nur eine Antwort, die der Server wirklich gegeben
        // hat, darf den Token wegwerfen; sonst meldet ein Serverschluckauf einen
        // angemeldeten Nutzer ab. Vor C3 war das nicht zu unterscheiden, weil
        // /auth/me auf "nicht angemeldet" mit 401 antwortete, also selbst nicht
        // ok war.
        if (!response || !response.ok) {
          return keineAussage(
            `Auth check failed (${response ? `HTTP ${response.status}` : 'server unreachable'})`
          );
        }

        const data = await response.json();
        if (data.authenticated && data.user) {
          setIsAuthenticated(true);
          setUser(data.user);
          localStorage.setItem('arasul_user', JSON.stringify(data.user));
          setLoading(false);
          return true;
        }

        // Der Server hat geantwortet und sagt: keine Sitzung. Erst jetzt raeumen.
        localStorage.removeItem('arasul_token');
        localStorage.removeItem('arasul_user');
        setIsAuthenticated(false);
        setUser(null);
        setLoading(false);
        return false;
      } catch (err) {
        // Aborted because the component unmounted or a fresh check was queued.
        // Do not mutate state here — the next caller owns it.
        if ((err as Error)?.name === 'AbortError') {
          return false;
        }
        return keineAussage('Auth check failed (network error)');
      }
    },
    [keineAussage]
  );

  // Verify auth on mount with AbortController so StrictMode double-mount /
  // rapid unmount don't write stale auth state.
  useEffect(() => {
    const controller = new AbortController();
    checkAuth(controller.signal);
    return () => controller.abort();
  }, [checkAuth]);

  // Handle login success
  const login = useCallback((data: LoginData) => {
    // Token is already stored by Login component
    // Sync user data and mark as authenticated
    setIsAuthenticated(true);
    setUser(data.user);
    // Note: Loading state is managed by App.js dataLoading, not here
  }, []);

  // P2.1.3: Cross-user data leak — logout() must clear the React Query cache
  // BEFORE flipping isAuthenticated. Otherwise the next user's mount sees the
  // previous user's chats/documents until each query refetches.
  const logout = useCallback(async () => {
    try {
      // useApi-exception: see checkAuth above — auth primitive, raw fetch by
      // design. `abmeldenBeimGeraet` prüft den Ausgang und wiederholt einmal;
      // warum, steht dort.
      await abmeldenBeimGeraet();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      // Wipe all client-side state that could leak across users.
      queryClient.clear();
      localStorage.removeItem('arasul_token');
      localStorage.removeItem('arasul_user');
      // arasul_csrf is a cookie, not localStorage — clear it explicitly.
      document.cookie = 'arasul_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      setIsAuthenticated(false);
      setUser(null);
    }
  }, []);

  // Eine Eigenschaft des Angemeldeten nachziehen. Begruendung an der
  // Schnittstelle oben.
  //
  // Der `localStorage`-Eintrag `arasul_user` geht mit: er ist der Abklatsch
  // derselben Antwort, und zwei Staende desselben Menschen im Browser waeren
  // genau die Doppelung, die hier nicht sein soll.
  const benutzerAktualisieren = useCallback((teil: Partial<User>) => {
    setUser(vorher => {
      if (!vorher) return vorher;
      const naechster = { ...vorher, ...teil };
      localStorage.setItem('arasul_user', JSON.stringify(naechster));
      return naechster;
    });
  }, []);

  // Mark loading as complete (called by App.js after data fetch)
  const setLoadingComplete = useCallback(() => {
    setLoading(false);
  }, []);

  // Token expiration warning — check every 60s, warn 5 min before expiry
  useEffect(() => {
    if (!isAuthenticated) return;

    let warningShown = false;
    const checkExpiration = () => {
      const exp = getTokenExpiration();
      if (!exp) return;

      const remaining = exp.getTime() - Date.now();
      const fiveMinutes = 5 * 60 * 1000;

      if (remaining <= 0) {
        logout();
      } else if (remaining < fiveMinutes && !warningShown) {
        warningShown = true;
        // Dispatch custom event — ToastContext picks it up without circular import
        window.dispatchEvent(
          new CustomEvent('arasul:token-expiring', {
            detail: { minutesLeft: Math.ceil(remaining / 60000) },
          })
        );
      }
    };

    checkExpiration();
    const interval = setInterval(checkExpiration, 60000);
    return () => clearInterval(interval);
  }, [isAuthenticated, logout]);

  // P2.1.7: Cross-tab logout sync. If another tab clears the token (logout
  // there, password change, etc.), this tab should follow immediately
  // instead of waiting for its next API call to 401.
  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key === 'arasul_token' && !event.newValue && isAuthenticated) {
        // Clear local state without an extra logout API call (the other tab
        // already invalidated server-side).
        queryClient.clear();
        localStorage.removeItem('arasul_user');
        setIsAuthenticated(false);
        setUser(null);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [isAuthenticated]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated,
      loading,
      login,
      logout,
      checkAuth,
      setLoadingComplete,
      benutzerAktualisieren,
    }),
    [
      user,
      isAuthenticated,
      loading,
      login,
      logout,
      checkAuth,
      setLoadingComplete,
      benutzerAktualisieren,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook to use auth context
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
