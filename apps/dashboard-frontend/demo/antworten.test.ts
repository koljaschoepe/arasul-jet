/**
 * Die gespielten Antworten der Demo (J46, M7): der Weg der Website, ohne
 * Browser. Mitarbeiter meldet, Entwickler sieht die Meldung, schaltet live.
 */
import { describe, expect, it } from 'vitest';
import { antworte, type Anfrage } from './antworten';
import { anfangsZustand, type DemoZustand } from './daten';

const frage = (methode: string, pfad: string, koerper: unknown = null): Anfrage => ({
  methode,
  pfad,
  suche: new URLSearchParams(),
  koerper,
});

function daten<T>(z: DemoZustand, a: Anfrage, sprache: 'de' | 'en' = 'de') {
  const [antwort, nachher] = antworte(a, z, sprache);
  return { status: antwort.status, json: antwort.json as T, nachher, antwort };
}

describe('gespielte Antworten', () => {
  it('der Besucher ist angemeldet, als Mitarbeiter ohne Cockpit', () => {
    const z = anfangsZustand();
    const s = daten<{ authenticated: boolean; user: { entwickler: boolean; role: string } }>(
      z,
      frage('GET', '/api/auth/session')
    );
    expect(s.json.authenticated).toBe(true);
    expect(s.json.user.entwickler).toBe(false);
    expect(s.json.user.role).toBe('mitarbeiter');

    const apps = daten<{ data: Array<{ id: string; test: unknown }> }>(
      z,
      frage('GET', '/api/apps/meine')
    );
    expect(apps.json.data.map(a => a.id)).toEqual(['angebote', 'wartungsplan', 'urlaub']);
    expect(apps.json.data.every(a => a.test === null)).toBe(true);
    expect(daten(z, frage('GET', '/api/rueckmeldungen')).status).toBe(403);
  });

  it('eine Meldung kommt als Entwickler im Eingang an, mit Bild', () => {
    let z = anfangsZustand();
    const bild = 'data:image/png;base64,' + btoa('png');
    const neu = daten<{ data: { id: number } }>(
      z,
      frage('POST', '/api/rueckmeldungen', {
        app_id: 'angebote',
        stand: 'live',
        seite: '/apps/angebote/',
        text: 'Rabatt fehlt',
        bild,
        markierung: { x: 0.1, y: 0.1, breite: 0.2, hoehe: 0.2 },
      })
    );
    expect(neu.status).toBe(201);
    z = { ...neu.nachher, rolle: 'entwickler' };

    const liste = daten<{
      data: Array<{ id: number; text: string; hat_bild: boolean; bild?: string }>;
    }>(z, frage('GET', '/api/rueckmeldungen'));
    const meldung = liste.json.data[0];
    expect(meldung?.text).toBe('Rabatt fehlt');
    expect(meldung?.hat_bild).toBe(true);
    expect(meldung).not.toHaveProperty('bild');

    const roh = daten(z, frage('GET', `/api/rueckmeldungen/${neu.json.data.id}/bild`));
    expect(roh.status).toBe(200);
    expect(new TextDecoder().decode(roh.antwort.bytes)).toBe('png');
  });

  it('Test nach Live: Angebote 1.5.0 wird live, danach ist nichts mehr zu schalten', () => {
    let z: DemoZustand = { ...anfangsZustand(), rolle: 'entwickler' };
    const vorher = daten<{ data: Array<{ id: string; test_neuer: boolean }> }>(
      z,
      frage('GET', '/api/entwickler/apps')
    );
    expect(vorher.json.data.find(a => a.id === 'angebote')?.test_neuer).toBe(true);

    const schalten = daten<{ data: { version: string } }>(
      z,
      frage('POST', '/api/apps/angebote/schalten', { ziel: 'live' })
    );
    expect(schalten.json.data.version).toBe('1.5.0');
    z = schalten.nachher;

    const fassung = daten<{ data: { version: string } }>(
      z,
      frage('GET', '/apps/angebote/api/fassung')
    );
    expect(fassung.json.data.version).toBe('1.5.0');
    expect(daten(z, frage('POST', '/api/apps/angebote/schalten', { ziel: 'live' })).status).toBe(
      409
    );

    const zurueck = daten<{ data: { version: string } }>(
      z,
      frage('POST', '/api/apps/angebote/schalten', { ziel: 'zurueck' })
    );
    expect(zurueck.json.data.version).toBe('1.4.0');
  });

  it('der Mitarbeiter darf nicht schalten', () => {
    const z = anfangsZustand();
    expect(daten(z, frage('POST', '/api/apps/angebote/schalten', { ziel: 'live' })).status).toBe(
      403
    );
  });

  it('eine Ablehnung braucht einen Grund', () => {
    const z: DemoZustand = { ...anfangsZustand(), rolle: 'entwickler' };
    expect(
      daten(z, frage('PATCH', '/api/rueckmeldungen/102', { stand_meldung: 'abgelehnt' })).status
    ).toBe(400);
    const ok = daten<{ data: { stand_meldung: string } }>(
      z,
      frage('PATCH', '/api/rueckmeldungen/102', {
        stand_meldung: 'abgelehnt',
        grund: 'passt nicht',
      })
    );
    expect(ok.json.data.stand_meldung).toBe('abgelehnt');
  });

  it('was die Demo nicht kennt, beantwortet sie mit 404 und einem Satz in der Sprache', () => {
    const z = anfangsZustand();
    const de = daten<{ error: { message: string } }>(z, frage('GET', '/api/benutzer'));
    expect(de.status).toBe(404);
    expect(de.json.error.message).toMatch(/Demo/);
    const en = daten<{ error: { message: string } }>(z, frage('GET', '/api/benutzer'), 'en');
    expect(en.json.error.message).toMatch(/Not available in the demo/);
  });

  it('Namen der Apps in der Sprache des Besuchers', () => {
    const z = anfangsZustand();
    const en = daten<{ data: Array<{ name: string }> }>(z, frage('GET', '/api/apps/meine'), 'en');
    expect(en.json.data.map(a => a.name)).toEqual(['Quotes', 'Maintenance plan', 'Leave requests']);
  });
});
