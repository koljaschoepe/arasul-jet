/**
 * Die gespielten Antworten der Demo (J46, J54, M7), ohne Browser: wer
 * angemeldet ist, die sechs Apps, Anlegen, Bearbeiten, Löschen, Stand,
 * Freigaben, Dateien, und die Werkstatt mit dem Schritt nach Live.
 */
import { describe, expect, it } from 'vitest';
import { antworte, type Anfrage } from './antworten';
import { anfangsZustand, type DemoZustand } from './daten';
import { FACH_APPS, type Eintrag } from './bestand';
import { AUFTRAEGE, KUNDEN, LIEFERANTEN, PERSONEN } from './firma';

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

describe('die Firma', () => {
  it('hat Personen, Kunden, Lieferanten und Aufträge im verlangten Umfang', () => {
    expect(PERSONEN.length).toBeGreaterThanOrEqual(15);
    expect(KUNDEN).toHaveLength(25);
    expect(LIEFERANTEN).toHaveLength(15);
    expect(AUFTRAEGE.length).toBeGreaterThan(8);
  });

  it('jede Fach-App fängt mit rund 40 Einträgen an, und die Nummern sind eindeutig', () => {
    const z = anfangsZustand();
    const ids = new Set<number>();
    for (const app of FACH_APPS) {
      const liste = z.bestand[app];
      expect(liste.length).toBeGreaterThanOrEqual(38);
      expect(new Set(liste.map(e => e.nr)).size).toBe(liste.length);
      for (const e of liste) ids.add(e.id);
    }
    expect(ids.size).toBe(FACH_APPS.reduce((s, a) => s + z.bestand[a].length, 0));
  });

  it('Aufträge aus Angeboten stehen auch im Wareneingang und in den Prüfprotokollen', () => {
    const z = anfangsZustand();
    const angenommen = new Set(z.bestand.angebote.map(e => e.felder.auftrag).filter(Boolean));
    const imWareneingang = z.bestand.wareneingang.map(e => e.felder.auftrag).filter(Boolean);
    const geprueft = z.bestand.pruefprotokolle.map(e => e.felder.auftrag);
    expect(imWareneingang.every(a => angenommen.has(a))).toBe(true);
    expect(geprueft.every(a => angenommen.has(a))).toBe(true);
  });
});

describe('gespielte Antworten', () => {
  it('angemeldet ist Miriam Kerschner mit dem Recht in der Werkstatt, ohne Rollenwechsel', () => {
    const z = anfangsZustand();
    const s = daten<{
      authenticated: boolean;
      user: { entwickler: boolean; vorname: string; anzeigeName: string };
    }>(z, frage('GET', '/api/auth/session'));
    expect(s.json.authenticated).toBe(true);
    expect(s.json.user.vorname).toBe('Miriam');
    expect(s.json.user.anzeigeName).not.toMatch(/Beispiel|Sample/);
    expect(s.json.user.entwickler).toBe(true);
    const marke = daten<{ firmenname: string; logo: string }>(
      z,
      frage('GET', '/api/auth/needs-setup')
    );
    expect(marke.json.firmenname).toBe('Kerschner Metallbau GmbH');
    expect(daten(z, frage('GET', '/api/darstellung/logo')).antwort.typ).toBe('image/svg+xml');

    const apps = daten<{ data: Array<{ id: string; symbol: string }> }>(
      z,
      frage('GET', '/api/apps/meine')
    );
    expect(apps.json.data.map(a => a.id)).toEqual([...FACH_APPS, 'werkstatt']);
    expect(new Set(apps.json.data.map(a => a.symbol)).size).toBe(6);
  });

  it('anlegen, bearbeiten, Stand ändern, löschen bleibt im Zustand', () => {
    let z = anfangsZustand();
    const vorher = z.bestand.angebote.length;
    const neu = daten<{ data: Eintrag }>(
      z,
      frage('POST', '/apps/angebote/api/eintraege', {
        felder: {
          kunde: 3,
          betreff: 'Geländer Rathaus',
          betrag: 8400,
          bearbeiter: 3,
          datum: '2026-11-22',
          gueltig: '2026-12-22',
        },
        stand: 'entwurf',
      })
    );
    expect(neu.status).toBe(201);
    expect(neu.json.data.nr).toMatch(/^AN-26-\d{3}$/);
    expect(neu.json.data.dateien.map(d => d.vorlage)).toContain('angebot');
    z = neu.nachher;
    expect(z.bestand.angebote).toHaveLength(vorher + 1);
    const id = neu.json.data.id;

    const geaendert = daten<{ data: Eintrag }>(
      z,
      frage('PATCH', `/apps/angebote/api/eintraege/${id}`, {
        felder: { betrag: 9100 },
        stand: 'versendet',
      })
    );
    expect(geaendert.json.data.felder.betrag).toBe(9100);
    expect(geaendert.json.data.stand).toBe('versendet');
    expect(geaendert.json.data.verlauf.length).toBe(3);
    z = geaendert.nachher;

    const pdf = daten(z, frage('GET', `/apps/angebote/api/eintraege/${id}/dateien/angebot`));
    expect(pdf.antwort.typ).toBe('application/pdf');
    expect(new TextDecoder().decode(pdf.antwort.bytes!.slice(0, 5))).toBe('%PDF-');

    const weg = daten(z, frage('DELETE', `/apps/angebote/api/eintraege/${id}`));
    expect(weg.status).toBe(200);
    expect(weg.nachher.bestand.angebote).toHaveLength(vorher);
  });

  it('Freigaben stehen in „Für Sie" und lassen sich entscheiden, Ablehnen nur mit Grund', () => {
    const z = anfangsZustand();
    const offen = daten<{
      data: Array<{ id: number; app_id: string; app_zeigt_freigaben: boolean }>;
    }>(z, frage('GET', '/api/freigabe-anfragen'));
    expect(offen.json.data.length).toBeGreaterThanOrEqual(5);
    expect(offen.json.data.length).toBeLessThanOrEqual(9);
    expect(new Set(offen.json.data.map(f => f.app_id))).toEqual(
      new Set(['angebote', 'pruefprotokolle', 'urlaub'])
    );
    const eine = offen.json.data[0]!;
    expect(daten(z, frage('POST', `/api/freigabe-anfragen/${eine.id}/ablehnen`, {})).status).toBe(
      400
    );
    const ja = daten(z, frage('POST', `/api/freigabe-anfragen/${eine.id}/bestaetigen`, {}));
    expect(ja.status).toBe(200);
    const danach = daten<{ data: unknown[] }>(ja.nachher, frage('GET', '/api/freigabe-anfragen'));
    expect(danach.json.data).toHaveLength(offen.json.data.length - 1);
  });

  it('eine hochgeladene Datei kommt so zurück, wie sie kam', () => {
    const z = anfangsZustand();
    const e = z.bestand.wareneingang[0]!;
    const data = 'data:image/png;base64,' + btoa('bild');
    const r = daten<{ data: Eintrag }>(
      z,
      frage('POST', `/apps/wareneingang/api/eintraege/${e.id}/dateien`, { name: 'foto.png', data })
    );
    expect(r.status).toBe(201);
    const datei = r.json.data.dateien[0]!;
    const zurueck = daten(
      r.nachher,
      frage('GET', `/apps/wareneingang/api/eintraege/${e.id}/dateien/${datei.id}`)
    );
    expect(zurueck.antwort.typ).toBe('image/png');
    expect(new TextDecoder().decode(zurueck.antwort.bytes)).toBe('bild');
  });

  it('jede Vorlage ergibt eine Datei', () => {
    const z = anfangsZustand();
    for (const app of FACH_APPS) {
      for (const e of z.bestand[app].slice(0, 12)) {
        for (const d of e.dateien) {
          const r = daten(
            z,
            frage('GET', `/apps/${app}/api/eintraege/${e.id}/dateien/${d.id}`),
            'en'
          );
          expect(r.status, `${app} ${e.nr} ${d.id}`).toBe(200);
          expect(r.antwort.bytes!.length).toBeGreaterThan(300);
        }
      }
    }
  });

  it('die Werkstatt sieht alle Meldungen und schaltet Angebote 1.5.0 live', () => {
    let z = anfangsZustand();
    const alle = daten<{ data: unknown[] }>(z, frage('GET', '/api/rueckmeldungen'));
    expect(alle.json.data.length).toBe(z.meldungen.length);
    const gesendet = daten(
      z,
      frage('POST', '/api/rueckmeldungen', {
        app_id: 'angebote',
        text: 'Bitte Rabatt auch im PDF.',
      })
    );
    z = gesendet.nachher;
    expect(z.meldungen.at(-1)?.person?.anzeigeName).toBe('Miriam Kerschner');
    const live = daten(z, frage('POST', '/api/apps/angebote/schalten', { ziel: 'live' }));
    expect(live.status).toBe(200);
    expect(live.nachher.apps.find(a => a.id === 'angebote')?.live.version).toBe('1.5.0');
    const fassung = daten<{ data: { version: string } }>(
      live.nachher,
      frage('GET', '/apps/angebote/api/fassung')
    );
    expect(fassung.json.data.version).toBe('1.5.0');
  });

  it('unbekannte Wege antworten mit 404 und einem Satz', () => {
    const z = anfangsZustand();
    const r = daten<{ error: { message: string } }>(z, frage('GET', '/api/verwaltung/personen'));
    expect(r.status).toBe(404);
    expect(r.json.error.message).toMatch(/Demo/);
  });
});
