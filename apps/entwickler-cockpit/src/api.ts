/**
 * Der Weg des Cockpits zur Plattform-API (J44, M7).
 *
 * Das Cockpit ist eine mitgelieferte App ohne eigenes Backend. Es läuft im
 * Rahmen als iframe gleicher Herkunft und ruft die Plattform mit der Sitzung
 * des Menschen, der davor sitzt: das Cookie geht von selbst mit, für jeden
 * ändernden Aufruf der CSRF-Kopf aus dem Cookie `arasul_csrf`, wie in der
 * Shell. Jede Route prüft das Kennzeichen Entwickler selbst; was das Cockpit
 * darf, darf genau dieser Mensch. Einen Schlüssel oder eine Datenbank hat es
 * nicht (`apps/dashboard-backend/src/services/app/mitgeliefert.js`).
 *
 * Absolute Pfade (`/api/…`) mit Absicht: das ist die Plattform, nicht die
 * Schnittstelle einer App, und sie liegt für jeden Stand an derselben Stelle.
 */

export class ApiFehler extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiFehler';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function csrfToken(): string | null {
  const treffer = document.cookie.match(/(?:^|;\s*)arasul_csrf=([^;]*)/);
  return treffer?.[1] !== undefined ? decodeURIComponent(treffer[1]) : null;
}

async function frischesCsrfToken(): Promise<string | null> {
  const res = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  const daten = (await res.json().catch(() => null)) as { csrfToken?: string } | null;
  return typeof daten?.csrfToken === 'string' ? daten.csrfToken : csrfToken();
}

async function rufe<T>(
  methode: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  pfad: string,
  koerper?: unknown,
  zeitlimitMs = 30_000
): Promise<T> {
  const senden = (token: string | null) => {
    const koepfe: Record<string, string> = { Accept: 'application/json' };
    if (koerper !== undefined) koepfe['Content-Type'] = 'application/json';
    if (methode !== 'GET' && token) koepfe['X-CSRF-Token'] = token;
    return fetch(pfad, {
      method: methode,
      credentials: 'same-origin',
      headers: koepfe,
      body: koerper === undefined ? undefined : JSON.stringify(koerper),
      signal: AbortSignal.timeout(zeitlimitMs),
    });
  };

  let res = await senden(methode === 'GET' ? null : csrfToken());
  // Das CSRF-Cookie dreht sich; ein abgelaufenes heißt nicht, dass der
  // Mensch etwas falsch gemacht hat. Einmal frisch holen und wiederholen.
  if (res.status === 403 && methode !== 'GET') {
    const roh = (await res
      .clone()
      .json()
      .catch(() => null)) as {
      error?: { code?: string };
    } | null;
    if (roh?.error?.code === 'CSRF_INVALID') {
      res = await senden(await frischesCsrfToken());
    }
  }

  if (!res.ok) {
    const roh = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string; details?: unknown };
    } | null;
    if (res.status === 401) {
      throw new ApiFehler(
        'Ihre Anmeldung ist abgelaufen. Laden Sie Arasul neu und melden Sie sich an.',
        401,
        'UNAUTHORIZED'
      );
    }
    throw new ApiFehler(
      roh?.error?.message ??
        'Das Gerät hat die Anfrage nicht beantwortet. Versuchen Sie es gleich noch einmal.',
      res.status,
      roh?.error?.code,
      roh?.error?.details
    );
  }
  const daten = (await res.json()) as { data: T };
  return daten.data;
}

export const api = {
  meldungen: () => rufe<import('./typen').Meldung[]>('GET', '/api/rueckmeldungen'),
  apps: () => rufe<import('./typen').AppStand[]>('GET', '/api/entwickler/apps'),
  standSetzen: (id: number, standMeldung: string, grund?: string) =>
    rufe<import('./typen').Meldung>('PATCH', `/api/rueckmeldungen/${id}`, {
      stand_meldung: standMeldung,
      ...(grund ? { grund } : {}),
    }),
  entfernen: (id: number) => rufe<{ id: number }>('DELETE', `/api/rueckmeldungen/${id}`),
  /**
   * Derselbe Weg wie in der Verwaltung: sichern, schalten, zusehen, bei
   * Bedarf zurück (`liveSchalten.js`). Am Orin um zwei Minuten, deshalb das
   * lange Zeitlimit.
   */
  schalten: (appId: string, ziel: 'live' | 'zurueck') =>
    rufe<{ version: string; stand: string }>(
      'POST',
      `/api/apps/${encodeURIComponent(appId)}/schalten`,
      { ziel },
      10 * 60_000
    ),
};

export const bildAdresse = (id: number) => `/api/rueckmeldungen/${id}/bild`;
