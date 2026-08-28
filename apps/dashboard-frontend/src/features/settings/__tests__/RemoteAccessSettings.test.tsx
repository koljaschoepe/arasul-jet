/**
 * Schrittlogik des Fernzugriff-Assistenten.
 *
 * Der Assistent hatte bis zum 28.08.2026 fünf Schritte: nach „verbunden" kamen
 * „HTTPS-Zertifikate im Tailnet freischalten" und „Sicheren Namen aktivieren"
 * (`tailscale serve`). Beide sind gefallen, und der Grund ist eine Messung am
 * Orin: mit aktivem `serve` bindet tailscaled `100.x.y.z:443`, danach bekommt
 * Traefik `0.0.0.0:443` nicht mehr, der reverse-proxy startet nicht — und das
 * Gerät ist im EIGENEN Firmennetz nicht mehr erreichbar.
 *
 * Geblieben sind drei Schritte: installieren, verbinden, fertig. Das vertraute
 * Schloss kommt seit Phase C10 für beide Netze aus der Geräte-CA.
 */

import { describe, it, expect } from 'vitest';
import { getStep, istErledigt, LETZTER_SCHRITT } from '../RemoteAccessSettings';
import type { TailscaleStatus } from '../RemoteAccessSettings';

function status(over: Partial<TailscaleStatus> = {}): TailscaleStatus {
  return {
    installed: true,
    running: true,
    connected: true,
    ip: '100.121.244.80',
    hostname: 'arasul',
    dnsName: 'arasul.tail746d9b.ts.net',
    tailnet: 'example',
    version: '1.0.0',
    peers: [],
    ...over,
  };
}

describe('getStep', () => {
  it('ohne Status → Installation', () => {
    expect(getStep(null)).toBe(1);
    expect(getStep(status({ installed: false }))).toBe(1);
  });

  it('installiert, aber nicht verbunden → Verbinden', () => {
    expect(getStep(status({ connected: false }))).toBe(2);
  });

  it('verbunden → fertig', () => {
    expect(getStep(status())).toBe(3);
  });
});

/**
 * F-26: Der Assistent zeigte den letzten Schritt „Fertig" als offen, waehrend
 * die Haken davor standen und die Verbindung nachweislich lief. Er widersprach
 * damit dem, was einen Absatz weiter unten auf demselben Bildschirm stand.
 */
describe('istErledigt', () => {
  it('hakt „Fertig" ab, sobald der Assistent dort angekommen ist', () => {
    expect(istErledigt(LETZTER_SCHRITT, LETZTER_SCHRITT)).toBe(true);
  });

  it('hakt alle Schritte davor ebenfalls ab', () => {
    for (let n = 1; n <= LETZTER_SCHRITT; n += 1) {
      expect(istErledigt(n, LETZTER_SCHRITT)).toBe(true);
    }
  });

  it('haelt den laufenden Schritt offen, solange er laeuft', () => {
    expect(istErledigt(2, 2)).toBe(false);
    expect(istErledigt(3, 2)).toBe(false);
    expect(istErledigt(1, 2)).toBe(true);
  });
});
