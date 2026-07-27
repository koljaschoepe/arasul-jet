/**
 * Zod-Schemas der Flow-Auslöser — Regressionstests.
 *
 * Live-Bug 2026-07-27: `UpdateScheduleBody.args` trug das `.default({})` der
 * Create-Form. Ein Teil-Update wie `{enabled:false}` bekam dadurch ein leeres
 * `args` injiziert, die Route validierte die (nun leeren) Argumente gegen den
 * Flow und der An/Aus-Schalter scheiterte bei jedem Flow mit Pflicht-Argument
 * mit 400 — bzw. hätte ohne Pflicht-Argumente die gespeicherten Argumente
 * still gelöscht.
 */
const { CreateScheduleBody, UpdateScheduleBody } = require('../../src/schemas/flowSchedules');

describe('UpdateScheduleBody', () => {
  test('ein reines enabled-Update injiziert KEIN leeres args', () => {
    const parsed = UpdateScheduleBody.parse({ enabled: false });
    expect(parsed).toEqual({ enabled: false });
    expect('args' in parsed).toBe(false);
  });

  test('explizit gesetzte args bleiben erhalten', () => {
    const parsed = UpdateScheduleBody.parse({ args: { thema: 'X' } });
    expect(parsed.args).toEqual({ thema: 'X' });
  });
});

describe('CreateScheduleBody', () => {
  test('args-Default {} gilt weiterhin beim Anlegen', () => {
    const parsed = CreateScheduleBody.parse({
      flow: 'newsletter',
      trigger_type: 'zeitplan',
      cron: '0 8 * * *',
    });
    expect(parsed.args).toEqual({});
    expect(parsed.enabled).toBe(true);
  });
});
