import { describe, it, expect } from 'vitest';
import { appHinweise, lizenzHinweis, sicherungHinweis } from '../useAdminHinweise';
import type { SicherungStatus } from '@/features/system/sicherung/useSicherung';
import type { AppZeile } from '@/features/settings/personen/useAppFreigaben';
import type { LizenzInfo } from '@/features/settings/lizenz/useLizenz';

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
  it('Sicherung: gut ist still, fehlgeschlagen und älter als ein Tag melden sich', () => {
    expect(sicherungHinweis(sicherung({}))).toBeNull();
    expect(sicherungHinweis(undefined)).toBeNull();
    expect(sicherungHinweis(sicherung({ status: 'failed' }))?.text).toMatch(/fehlgeschlagen/);
    expect(sicherungHinweis(sicherung({ alterStunden: 25 }))?.text).toMatch(/älter als ein Tag/);
    expect(sicherungHinweis(sicherung({ status: 'fehlt', alterStunden: null }))?.text).toMatch(
      /noch nie/
    );
    expect(sicherungHinweis(sicherung({ status: 'failed' }))?.ziel).toEqual({
      bereich: 'system',
      abschnitt: 'sicherung',
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
  });
});
