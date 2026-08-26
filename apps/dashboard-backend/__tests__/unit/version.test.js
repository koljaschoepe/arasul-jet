/**
 * F-19: „Platform Version 1.0.0" bei null geschlossenen Verkaufs-Gates.
 *
 * Der Rueckfallwert stand an zehn Stellen im Backend und behauptete ueberall
 * eine fertige 1.0.0. Ein Partner, der das in den Einstellungen liest, bekommt
 * eine Zusage, die niemand gemacht hat.
 */
const { versionFuerAnzeige, versionFuerVergleich } = require('../../src/utils/version');

describe('Version', () => {
  const vorher = process.env.SYSTEM_VERSION;
  afterEach(() => {
    if (vorher === undefined) delete process.env.SYSTEM_VERSION;
    else process.env.SYSTEM_VERSION = vorher;
  });

  it('sagt ohne gesetzte Version die Wahrheit ueber die Reife', () => {
    delete process.env.SYSTEM_VERSION;
    expect(versionFuerAnzeige()).toBe('Vorserie');
  });

  it('behauptet ohne gesetzte Version keine 1.0.0 mehr', () => {
    delete process.env.SYSTEM_VERSION;
    expect(versionFuerAnzeige()).not.toBe('1.0.0');
  });

  it('nimmt eine gesetzte Version, sobald es eine gibt', () => {
    process.env.SYSTEM_VERSION = '1.2.0';
    expect(versionFuerAnzeige()).toBe('1.2.0');
    expect(versionFuerVergleich()).toBe('1.2.0');
  });

  it('behandelt eine leere Variable wie keine', () => {
    process.env.SYSTEM_VERSION = '   ';
    expect(versionFuerAnzeige()).toBe('Vorserie');
  });

  // Seit Phase B7 (26.08.2026) ist auch die Vergleichszahl ehrlich: eine
  // Vorserie hat keine Fassung, jede ausgelieferte Fassung ist neuer. Sie
  // bleibt eine Zahl, weil `updateService.compareVersions` X.Y.Z verlangt.
  it('vergleicht ohne gesetzte Version als 0.0.0, damit jede Fassung neuer ist', () => {
    delete process.env.SYSTEM_VERSION;
    expect(versionFuerVergleich()).toBe('0.0.0');
    expect(versionFuerVergleich()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
