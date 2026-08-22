/**
 * Plan 023 J5: „Trennen" kappt die Leitung, über die man gerade angemeldet ist.
 *
 * Der Knopf kappte bis zum 22.08.2026 sofort, ohne zu fragen. Wer über
 * Tailscale auf dem Gerät saß, kappte damit die Leitung unter sich selbst weg
 * und kam nur noch im lokalen Netz wieder heran.
 *
 * Entschieden wird an der Adresse im Browser. Der Server weiß es nicht besser:
 * hinter Traefik sieht er nur die interne Adresse.
 */
import { describe, it, expect } from 'vitest';
import { sitzungLaeuftUeberFernzugriff, trennFrage } from '../sitzungUeberFernzugriff';

const STATUS = { dnsName: 'arasul.taile1234.ts.net', ip: '100.101.102.103' };

describe('sitzungLaeuftUeberFernzugriff (Plan 023 J5)', () => {
  it('erkennt den MagicDNS-Namen', () => {
    expect(sitzungLaeuftUeberFernzugriff('arasul.taile1234.ts.net', STATUS)).toBe(true);
  });

  it('erkennt die Tailscale-IP', () => {
    expect(sitzungLaeuftUeberFernzugriff('100.101.102.103', STATUS)).toBe(true);
  });

  it('erkennt JEDEN Namen im Tailnet, nicht nur den gemeldeten', () => {
    // Der Nutzer kann ueber einen Alias oder ein zweites Geraet hereinkommen.
    expect(sitzungLaeuftUeberFernzugriff('anders.taile1234.ts.net', STATUS)).toBe(true);
    expect(sitzungLaeuftUeberFernzugriff('x.fremdes-tailnet.ts.net', null)).toBe(true);
  });

  it('erkennt den Adressbereich 100.64.0.0/10 auch ohne gemeldete IP', () => {
    expect(sitzungLaeuftUeberFernzugriff('100.64.0.1', null)).toBe(true);
    expect(sitzungLaeuftUeberFernzugriff('100.127.255.254', null)).toBe(true);
  });

  it('haelt die Raender des Bereichs ein', () => {
    // 100.63.x und 100.128.x gehoeren NICHT dazu. Wer /8 statt /10 rechnet,
    // warnt hier faelschlich und macht die Warnung wertlos.
    expect(sitzungLaeuftUeberFernzugriff('100.63.255.255', null)).toBe(false);
    expect(sitzungLaeuftUeberFernzugriff('100.128.0.1', null)).toBe(false);
  });

  it('sagt beim lokalen Zugriff nein', () => {
    expect(sitzungLaeuftUeberFernzugriff('arasul.local', STATUS)).toBe(false);
    expect(sitzungLaeuftUeberFernzugriff('192.168.1.50', STATUS)).toBe(false);
    expect(sitzungLaeuftUeberFernzugriff('localhost', STATUS)).toBe(false);
    expect(sitzungLaeuftUeberFernzugriff('127.0.0.1', STATUS)).toBe(false);
  });

  it('nimmt den kurzen Namen, den MagicDNS auch aufloest', () => {
    expect(sitzungLaeuftUeberFernzugriff('arasul', STATUS)).toBe(true);
  });

  it('ist unempfindlich gegen Gross- und Kleinschreibung und den Punkt am Ende', () => {
    expect(sitzungLaeuftUeberFernzugriff('ARASUL.TAILE1234.TS.NET', STATUS)).toBe(true);
    expect(
      sitzungLaeuftUeberFernzugriff('arasul.taile1234.ts.net', {
        dnsName: 'arasul.taile1234.ts.net.',
        ip: null,
      })
    ).toBe(true);
  });

  it('kommt mit fehlenden Angaben zurecht', () => {
    expect(sitzungLaeuftUeberFernzugriff('', STATUS)).toBe(false);
    expect(sitzungLaeuftUeberFernzugriff('arasul.local', null)).toBe(false);
    expect(sitzungLaeuftUeberFernzugriff('arasul.local', {})).toBe(false);
  });
});

describe('trennFrage', () => {
  it('warnt ausdruecklich, wenn die Sitzung darueber laeuft', () => {
    const f = trennFrage(true);
    expect(f.message).toMatch(/ÜBER diese Verbindung angemeldet/);
    expect(f.message).toMatch(/lokalen\s+Netz/);
    expect(f.confirmText).toBe('Trotzdem trennen');
  });

  it('nennt sonst nur die Folge, ohne zu dramatisieren', () => {
    const f = trennFrage(false);
    expect(f.message).toMatch(/von außen nicht mehr erreichbar/);
    expect(f.message).not.toMatch(/ÜBER diese Verbindung/);
    expect(f.confirmText).toBe('Trennen');
  });
});
