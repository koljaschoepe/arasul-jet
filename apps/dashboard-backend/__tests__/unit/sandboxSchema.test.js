/**
 * Sandbox Zod-Schema — network_mode enum (isolated | internal | infrastructure)
 *
 * Sichert das Zusammenspiel Schema ↔ DB-CHECK (Migration 100) ↔ sandboxService:
 * ein hier akzeptierter Wert muss auch vom Service und der DB getragen werden.
 */

const { CreateProjectBody, UpdateProjectBody } = require('../../src/schemas/sandbox');

describe('sandbox schemas — network_mode', () => {
  test.each(['isolated', 'internal', 'infrastructure'])(
    'CreateProjectBody accepts network_mode %s',
    mode => {
      const result = CreateProjectBody.safeParse({ name: 'demo', network_mode: mode });
      expect(result.success).toBe(true);
      expect(result.data.network_mode).toBe(mode);
    }
  );

  test('CreateProjectBody rejects unknown network_mode values', () => {
    const result = CreateProjectBody.safeParse({ name: 'demo', network_mode: 'host' });
    expect(result.success).toBe(false);
  });

  test('network_mode is optional (default handling lives in sandboxService)', () => {
    const result = CreateProjectBody.safeParse({ name: 'demo' });
    expect(result.success).toBe(true);
    expect(result.data.network_mode).toBeUndefined();
  });

  test('UpdateProjectBody accepts a bare network_mode switch to infrastructure', () => {
    const result = UpdateProjectBody.safeParse({ network_mode: 'infrastructure' });
    expect(result.success).toBe(true);
    expect(result.data.network_mode).toBe('infrastructure');
  });
});
