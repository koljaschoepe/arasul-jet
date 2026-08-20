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

  // Bewusst getrennt: die Vergleichszahl bleibt, was sie war. Ein Wechsel auf
  // 0.0.0 wuerde auf jedem Geraet ohne gesetzte Version jede angebotene Fassung
  // als neuer gelten lassen, und das ist eine Aenderung am
  // Aktualisierungsverhalten, nicht an einer Beschriftung.
  it('laesst die Vergleichszahl unveraendert, damit die Aktualisierung gleich rechnet', () => {
    delete process.env.SYSTEM_VERSION;
    expect(versionFuerVergleich()).toBe('1.0.0');
  });
});
