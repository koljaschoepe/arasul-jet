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
});
