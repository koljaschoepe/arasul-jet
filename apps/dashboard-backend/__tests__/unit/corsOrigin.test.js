/**
 * Unit tests for the CORS origin allow-list (utils/corsOrigin.js).
 *
 * These are security-boundary tests: the whole point is to prove the regexes
 * accept exactly the intended ranges (RFC-1918, *.local, Tailscale CGNAT
 * 100.64.0.0/10, *.ts.net) and reject everything just outside them — in
 * particular public 100.0.0.0/8 addresses that are NOT in the CGNAT range.
 */

const { isAllowedOrigin } = require('../../src/utils/corsOrigin');

describe('isAllowedOrigin', () => {
  describe('no origin / explicit allow-list', () => {
    it('allows undefined origin (same-origin, curl, server-to-server)', () => {
      expect(isAllowedOrigin(undefined)).toBe(true);
      expect(isAllowedOrigin('')).toBe(true);
    });

    it('allows an origin explicitly listed in ALLOWED_ORIGINS', () => {
      expect(
        isAllowedOrigin('https://arasul.example.com', ['https://arasul.example.com'])
      ).toBe(true);
    });

    it('does not allow an unrelated public origin', () => {
      expect(isAllowedOrigin('https://evil.example.com')).toBe(false);
      expect(isAllowedOrigin('https://arasul.example.com', [])).toBe(false);
    });
  });

  describe('local / RFC-1918 network', () => {
    it('allows localhost and 127.0.0.1 (any scheme/port)', () => {
      expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
      expect(isAllowedOrigin('https://127.0.0.1')).toBe(true);
    });

    it('allows the docker service hostname', () => {
      expect(isAllowedOrigin('http://dashboard-frontend')).toBe(true);
    });

    it('allows RFC-1918 private IPs', () => {
      expect(isAllowedOrigin('https://192.168.0.197')).toBe(true);
      expect(isAllowedOrigin('http://10.0.0.5:3000')).toBe(true);
      expect(isAllowedOrigin('https://172.16.4.4')).toBe(true);
      expect(isAllowedOrigin('https://172.31.255.255')).toBe(true);
    });

    it('rejects near-miss private ranges', () => {
      expect(isAllowedOrigin('https://172.15.0.1')).toBe(false); // below 172.16
      expect(isAllowedOrigin('https://172.32.0.1')).toBe(false); // above 172.31
      expect(isAllowedOrigin('https://192.169.0.1')).toBe(false);
      expect(isAllowedOrigin('https://11.0.0.1')).toBe(false);
    });
  });

  describe('*.local mDNS hostnames', () => {
    it('allows <name>.local', () => {
      expect(isAllowedOrigin('https://arasul.local')).toBe(true);
      expect(isAllowedOrigin('https://my-jetson.local:8080')).toBe(true);
    });

    it('does not allow a lookalike public domain', () => {
      expect(isAllowedOrigin('https://arasul.local.evil.com')).toBe(false);
    });
  });

  describe('Tailscale CGNAT range 100.64.0.0/10 (RFC 6598)', () => {
    it('allows addresses inside the range', () => {
      expect(isAllowedOrigin('https://100.64.0.0')).toBe(true); // lower bound
      expect(isAllowedOrigin('https://100.121.244.80')).toBe(true); // the user's device
      expect(isAllowedOrigin('https://100.127.255.255')).toBe(true); // upper bound
      expect(isAllowedOrigin('https://100.100.100.100:443')).toBe(true);
      expect(isAllowedOrigin('http://100.70.1.2')).toBe(true);
    });

    it('rejects public 100.0.0.0/8 addresses just OUTSIDE the CGNAT range', () => {
      // These are real, routable public IPs — must never be treated as tailnet.
      expect(isAllowedOrigin('https://100.63.255.255')).toBe(false); // just below 64
      expect(isAllowedOrigin('https://100.128.0.0')).toBe(false); // just above 127
      expect(isAllowedOrigin('https://100.0.0.1')).toBe(false);
      expect(isAllowedOrigin('https://100.200.0.1')).toBe(false);
    });

    it('rejects malformed octets', () => {
      expect(isAllowedOrigin('https://100.64.999.1')).toBe(false);
      expect(isAllowedOrigin('https://100.64.0')).toBe(false);
    });
  });

  describe('Tailscale MagicDNS *.ts.net hostnames', () => {
    it('allows <device>.<tailnet>.ts.net', () => {
      expect(isAllowedOrigin('https://arasul.tail1234.ts.net')).toBe(true);
      expect(isAllowedOrigin('https://jetson.example-tailnet.ts.net:443')).toBe(true);
    });

    it('does not allow a lookalike public domain', () => {
      expect(isAllowedOrigin('https://arasul.ts.net.evil.com')).toBe(false);
      expect(isAllowedOrigin('https://tsXnet.example.com')).toBe(false);
    });
  });
});
