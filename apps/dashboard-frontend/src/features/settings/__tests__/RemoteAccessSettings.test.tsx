/**
 * Schrittlogik des Fernzugriff-Assistenten.
 *
 * Der Assistent endete bis 2026-08-18 bei „verbunden" — also genau dort, wo der
 * interessante Teil anfängt. Ohne HTTPS-Zertifikate im Tailnet und ohne
 * `tailscale serve` erreicht man das Gerät nur über die nackte 100.x-IP, mit
 * Zertifikatswarnung im Browser. Diese Tests halten die beiden neuen Schritte
 * fest — und vor allem die Regel, dass ein fehlgeschlagener Nebenabruf niemanden
 * zurückstuft.
 */

import { describe, it, expect } from 'vitest';
import { getStep, istErledigt, LETZTER_SCHRITT } from '../RemoteAccessSettings';
import type { TailscaleStatus, ServeInfo } from '../RemoteAccessSettings';

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

const serve = (over: Partial<ServeInfo> = {}): ServeInfo => ({
  enabled: true,
  httpsAvailable: true,
  ...over,
});

describe('getStep', () => {
  it('ohne Status → Installation', () => {
    expect(getStep(null, null, false)).toBe(1);
    expect(getStep(status({ installed: false }), null, false)).toBe(1);
  });

  it('installiert, aber nicht verbunden → Verbinden', () => {
    expect(getStep(status({ connected: false }), null, false)).toBe(2);
  });

  it('verbunden ohne Tailnet-Zertifikate → Zertifikat-Schritt', () => {
    expect(getStep(status(), serve({ httpsAvailable: false, enabled: false }), false)).toBe(3);
  });

  it('Zertifikate da, aber serve aus → Sicherer Name', () => {
    expect(getStep(status(), serve({ httpsAvailable: true, enabled: false }), false)).toBe(4);
  });

  it('beides erledigt → fertig', () => {
    expect(getStep(status(), serve(), false)).toBe(5);
  });

  it('„Später" überspringt den Zertifikat-Schritt', () => {
    expect(getStep(status(), serve({ httpsAvailable: false, enabled: false }), true)).toBe(5);
  });

  it('unbekannter serve-Zustand stuft NIEMALS zurück', () => {
    // Der /tailscale/serve-Abruf ist beratend und scheitert stillschweigend.
    // Wäre das ein Rückfall auf Schritt 3, würde ein fertig eingerichteter
    // Nutzer bei jedem Netzhänger wieder in den Assistenten geworfen.
    expect(getStep(status(), null, false)).toBe(5);
  });

  it('unbekannter serve-Zustand hebt eine fehlende Verbindung nicht auf', () => {
    expect(getStep(status({ connected: false }), null, false)).toBe(2);
    expect(getStep(status({ installed: false }), null, false)).toBe(1);
  });
});

/**
 * F-26: Der Assistent zeigte Schritt 5 „Fertig" als offen, waehrend vier Haken
 * davor standen und die Verbindung nachweislich lief. Er widersprach damit dem,
 * was einen Absatz weiter unten auf demselben Bildschirm zu lesen war.
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
    expect(istErledigt(3, 3)).toBe(false);
    expect(istErledigt(4, 3)).toBe(false);
    expect(istErledigt(2, 3)).toBe(true);
  });
});
