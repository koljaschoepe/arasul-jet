import { describe, it, expect } from 'vitest';
import { fehlertext } from '../fehlertext';

describe('fehlertext', () => {
  it('lässt einen deutschen Satz des Backends stehen', () => {
    expect(fehlertext('Diesen Ausweis gibt es nicht.', 404)).toBe('Diesen Ausweis gibt es nicht.');
    expect(fehlertext('Das eigene Konto kann nicht stillgelegt werden', 400)).toBe(
      'Das eigene Konto kann nicht stillgelegt werden'
    );
  });

  it('ersetzt „HTTP 500" durch einen Satz', () => {
    const t = fehlertext('HTTP 500', 500);
    expect(t).not.toMatch(/HTTP|500/);
    expect(t).toMatch(/versuchen Sie es noch einmal/);
  });

  it('ersetzt englische Backend-Texte nach Status', () => {
    expect(fehlertext('Resource not found', 404)).toBe('Das gibt es nicht mehr.');
    expect(fehlertext('Access denied', 403)).toBe('Dafür fehlt Ihnen die Berechtigung.');
    expect(fehlertext('Validation failed', 400)).toMatch(/Eingabe/);
  });

  it('kennt auch einen leeren Text', () => {
    expect(fehlertext('', 409)).toMatch(/geändert/);
    expect(fehlertext(undefined)).toMatch(/nicht geklappt/);
  });

  it('zeigt nie einen Statuscode, auch nicht mitten im Satz', () => {
    expect(fehlertext('Fehler 502 vom Dienst', 502)).not.toMatch(/502/);
  });

  it('lässt Technik auch in einem deutschen Satz nicht durch', () => {
    expect(
      fehlertext('Container app-x ist nicht erreichbar (ECONNREFUSED 172.18.0.5:3000)', 503)
    ).toMatch(/Gerät kann das gerade nicht/);
    expect(fehlertext('Spalte ohne_einreicher ist nicht gesetzt', 400)).toMatch(/Eingabe/);
    expect(fehlertext('Datei /arasul/apps/x/manifest.json ist kaputt')).toMatch(/nicht geklappt/);
  });

  it('nimmt die geworfene Ausnahme samt Status', () => {
    const e = Object.assign(new Error('Resource not found'), { status: 404 });
    expect(fehlertext(e)).toBe('Das gibt es nicht mehr.');
    expect(fehlertext(new Error('Bitte wählen Sie eine Bilddatei.'))).toBe(
      'Bitte wählen Sie eine Bilddatei.'
    );
    expect(
      fehlertext(new Error('Network error'), undefined, 'Das Recht ließ sich nicht setzen.')
    ).toBe('Das Recht ließ sich nicht setzen.');
    expect(fehlertext(null)).toMatch(/nicht geklappt/);
  });

  it('hält eine Uhrzeit und das Wort „null" nicht für Technik', () => {
    expect(fehlertext('Die Frist ist um 14:30 abgelaufen.', 400)).toBe(
      'Die Frist ist um 14:30 abgelaufen.'
    );
    expect(fehlertext('Die Grenze darf nicht null sein.', 400)).toBe(
      'Die Grenze darf nicht null sein.'
    );
  });
});
