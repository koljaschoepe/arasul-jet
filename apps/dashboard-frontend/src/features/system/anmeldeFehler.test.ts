import { anmeldeFehlerText } from './anmeldeFehler';

// J34: „gesperrt" nur nach einem wirklich gesperrten Konto. Jeder technische
// Grund sagt, dass mit dem Konto alles in Ordnung ist.
describe('anmeldeFehlerText', () => {
  const gesperrt = /gesperrt/i;
  const kontoOk = /Mit dem Konto ist alles in Ordnung/;

  it('nennt ein gesperrtes Konto nur bei ACCOUNT_LOCKED', () => {
    expect(anmeldeFehlerText({ status: 403, code: 'ACCOUNT_LOCKED' })).toMatch(gesperrt);
  });

  it('nennt ein stillgelegtes Konto bei ACCOUNT_DISABLED', () => {
    const text = anmeldeFehlerText({ status: 403, code: 'ACCOUNT_DISABLED' });
    expect(text).toMatch(/stillgelegt/);
    expect(text).not.toMatch(gesperrt);
  });

  it.each([
    ['abgewiesene Herkunft', { status: 403, code: 'ORIGIN_NOT_ALLOWED' }],
    ['CSRF', { status: 403, code: 'CSRF_INVALID' }],
    ['403 ohne Code', { status: 403, code: 'FORBIDDEN' }],
    ['kein Netz / CORS im Browser', { name: 'TypeError' }],
    ['Zeitgrenze des Browsers', { name: 'TimeoutError' }],
    ['Zeitgrenze des Geräts', { status: 408, code: 'REQUEST_TIMEOUT' }],
    ['Gerät nicht bereit', { status: 502 }],
    ['anderer Status', { status: 400, code: 'VALIDATION_ERROR' }],
  ])('%s ist ein technischer Grund und kein gesperrtes Konto', (_name, fehler) => {
    const text = anmeldeFehlerText(fehler);
    expect(text).not.toMatch(gesperrt);
    expect(text).toMatch(kontoOk);
  });

  it('eigene Zeitgrenze der Anmeldeseite', () => {
    expect(anmeldeFehlerText({ name: 'AbortError' }, true)).toMatch(/nicht rechtzeitig/);
  });

  it('falsches Passwort und Drossel bleiben, wie sie waren', () => {
    expect(anmeldeFehlerText({ status: 401, code: 'UNAUTHORIZED' })).toMatch(/Passwort ist falsch/);
    expect(anmeldeFehlerText({ status: 429, code: 'RATE_LIMITED' })).toMatch(/Zu viele/);
  });
});
