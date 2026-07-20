/**
 * Unit-Tests des SSRF-URL-Guards (Plan 010, Schritt 3).
 * Direkte IP-Ziele werden ohne DNS geprüft; private/reservierte Bereiche und
 * der Cloud-Metadaten-Endpoint müssen abgelehnt werden.
 */

const { assertPublicHttpUrl, _internals } = require('../../src/utils/urlGuard');
const { ValidationError } = require('../../src/utils/errors');

describe('ipIsPrivate', () => {
  const priv = ['127.0.0.1', '10.1.2.3', '192.168.0.5', '172.16.0.1', '169.254.169.254', '::1', 'fd00::1', '100.64.0.1'];
  const pub = ['8.8.8.8', '1.1.1.1', '93.184.216.34'];
  test.each(priv)('%s ist privat/reserviert', ip => {
    expect(_internals.ipIsPrivate(ip)).toBe(true);
  });
  test.each(pub)('%s ist öffentlich', ip => {
    expect(_internals.ipIsPrivate(ip)).toBe(false);
  });
});

describe('assertPublicHttpUrl', () => {
  test('nicht-http Schema → ValidationError', async () => {
    await expect(assertPublicHttpUrl('ftp://example.com')).rejects.toThrow(ValidationError);
    await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toThrow(ValidationError);
  });

  test('ungültige URL → ValidationError', async () => {
    await expect(assertPublicHttpUrl('nicht-eine-url')).rejects.toThrow(ValidationError);
  });

  test('private Ziel-IP → ValidationError (kein DNS nötig)', async () => {
    await expect(assertPublicHttpUrl('http://127.0.0.1/x')).rejects.toThrow(ValidationError);
    await expect(assertPublicHttpUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(
      ValidationError
    );
    await expect(assertPublicHttpUrl('http://10.0.0.9:8080')).rejects.toThrow(ValidationError);
  });

  test('öffentliche Ziel-IP → erlaubt (liefert URL)', async () => {
    const url = await assertPublicHttpUrl('https://8.8.8.8/');
    expect(url.host).toBe('8.8.8.8');
  });
});
