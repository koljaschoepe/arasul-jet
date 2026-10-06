import { describe, it, expect } from 'vitest';
import {
  appHinweise,
  kopieHinweis,
  lizenzHinweis,
  modellHinweise,
  sicherungHinweis,
} from '../useAdminHinweise';
import type { SicherungStatus } from '@/features/system/sicherung/useSicherung';
import type { AppZeile } from '@/features/settings/personen/useAppFreigaben';
import type { LizenzInfo } from '@/features/settings/geraet/useLizenz';

function sicherung(letzte: Partial<SicherungStatus['letzteSicherung']>): SicherungStatus {
  return {
    letzteSicherung: {
      status: 'completed',
      zeitpunkt: null,
      alterStunden: 3,
      veraltet: false,
      ...letzte,
    },
  } as SicherungStatus;
}

const stand = (version: string, lieferbar = true) => ({
  version,
  lieferbar,
  marken: null,
  dateien: { manifest: true, frontend: true },
});
const app = (live: ReturnType<typeof stand> | null, test: ReturnType<typeof stand> | null) =>
  [
    { id: 'rechnungen', name: 'Rechnungen', beschreibung: null, staende: { live, test } },
  ] as AppZeile[];

describe('Hinweise für den Administrator', () => {
  it('Modell je Schritt: ein fehlendes Modell zeigt auf die App, ohne Fund bleibt es still', () => {
    expect(modellHinweise(undefined)).toEqual([]);
    expect(modellHinweise([])).toEqual([]);
    expect(
      modellHinweise([
        {
          app_id: 'rechnungen',
          app_name: 'Rechnungen',
          flow: 'f',
          schritt: 's',
          text: 'Schritt „s": Das Modell „x" liegt nicht am Gerät.',
        },
      ])[0]
    ).toMatchObject({
      art: 'modell-fehlt',
      text: expect.stringContaining('Rechnungen: Schritt'),
      ziel: { bereich: 'apps', abschnitt: 'rechnungen' },
    });
  });

  it('Sicherung: gut ist still, fehlgeschlagen und älter als ein Tag melden sich', () => {
    expect(sicherungHinweis(sicherung({}))).toBeNull();
    expect(sicherungHinweis(undefined)).toBeNull();
    expect(sicherungHinweis(sicherung({ status: 'failed' }))?.text).toMatch(/fehlgeschlagen/);
    expect(sicherungHinweis(sicherung({ alterStunden: 25 }))?.text).toMatch(/älter als ein Tag/);
    expect(sicherungHinweis(sicherung({ status: 'fehlt', alterStunden: null }))?.text).toMatch(
      /noch nie/
    );
    expect(sicherungHinweis(sicherung({ status: 'failed' }))?.ziel).toEqual({
      bereich: 'daten',
    });
  });

  it('Apps: gestört und Fassung wartet auf Live', () => {
    expect(appHinweise(app(stand('1.0.0'), null))).toEqual([]);
    expect(appHinweise(app(stand('1.0.0'), stand('1.0.0')))).toEqual([]);
    expect(appHinweise(app(stand('1.0.0', false), null))[0]).toMatchObject({
      art: 'app-gestoert',
      text: 'Rechnungen ist gestört.',
      ziel: { bereich: 'apps', abschnitt: 'rechnungen' },
    });
    expect(appHinweise(app(stand('1.0.0'), stand('1.1.0')))[0]).toMatchObject({
      art: 'fassung-wartet',
      text: 'Fassung 1.1.0 von Rechnungen wartet auf Live.',
    });
    expect(appHinweise(app(null, stand('0.1.0')))[0]?.text).toMatch(/noch nicht live/);
  });

  it('Lizenz: knapp nach Tagen oder Belegung, sonst still', () => {
    const basis = {
      valid: true,
      tier: 'professional',
      hardwareFingerprint: 'x',
      nutzung: {
        stufe: 'professional',
        konten: { belegt: 3, grenze: 25 },
        apps: { belegt: 1, grenze: -1 },
      },
    } as LizenzInfo;
    expect(lizenzHinweis(basis)).toBeNull();
    expect(lizenzHinweis({ ...basis, daysRemaining: 400 })).toBeNull();
    expect(lizenzHinweis({ ...basis, daysRemaining: 12 })?.text).toMatch(/12 Tagen/);
    expect(lizenzHinweis({ ...basis, valid: false })?.text).toMatch(/abgelaufen/);
    expect(
      lizenzHinweis({ ...basis, nutzung: { ...basis.nutzung, konten: { belegt: 23, grenze: 25 } } })
        ?.text
    ).toMatch(/ausgeschöpft/);
    expect(lizenzHinweis({ ...basis, valid: false, tier: 'community' })).toBeNull();
    // Seit M5 führt der Hinweis in den Bereich Gerät, zum Abschnitt Lizenz.
    expect(lizenzHinweis({ ...basis, daysRemaining: 3 })?.ziel).toEqual({
      bereich: 'geraet',
      abschnitt: 'lizenz',
    });
  });
});

describe('kopieHinweis', () => {
  const jetzt = new Date('2026-10-06T12:00:00Z').getTime();
  const status = (zeitpunkt: string | null, angesteckt = false) =>
    ({
      ausserhalb: { vorhanden: zeitpunkt !== null, zeitpunkt, datentraeger: { angesteckt } },
    }) as unknown as Parameters<typeof kopieHinweis>[0];

  it('schweigt bei einer frischen Kopie und ohne Angabe', () => {
    expect(kopieHinweis(status('2026-10-05T12:00:00Z'), jetzt)).toBeNull();
    expect(kopieHinweis(undefined, jetzt)).toBeNull();
    expect(kopieHinweis(status(null), jetzt)).toBeNull();
  });

  it('meldet sich nach drei Tagen und nennt, ob der Datenträger fehlt', () => {
    expect(kopieHinweis(status('2026-10-02T12:00:00Z'), jetzt)?.text).toBe(
      'Die Sicherungs-SSD fehlt seit 4 Tagen.'
    );
    expect(kopieHinweis(status('2026-10-02T12:00:00Z', true), jetzt)?.text).toMatch(
      /Datenträger ist 4 Tage alt/
    );
    expect(kopieHinweis(status('2026-10-02T12:00:00Z'), jetzt)?.ziel).toEqual({ bereich: 'daten' });
  });
});
