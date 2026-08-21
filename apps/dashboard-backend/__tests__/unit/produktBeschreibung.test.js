/**
 * Das Geraet sagt, was es ist (Plan 023 D8).
 *
 * Am 21.08.2026 gemessen, mit qwen3-coder:30b und derselben
 * Prompt-Zusammensetzung wie im Produkt. Auf die Frage "Was kann Arasul?"
 * antwortete der Chat auf einem Geraet im Auslieferungszustand:
 *
 *   "ein deutscher Anbieter von Softwareloesungen fuer die
 *    Lebensmittelindustrie ... ERP-Systeme ... HACCP"
 *
 * und auf einem Geraet mit dem Profil eines Bauunternehmens:
 *
 *   "ein deutscher Hersteller spezialisiert auf Klebetechnik und
 *    Oberflaechenbehandlung"
 *
 * Beides frei erfunden. Der Grund: nichts im Prompt beschrieb das Produkt.
 *
 * Diese Tests halten fest, dass die Beschreibung im ausgelieferten Teil steht
 * und was sie NICHT verspricht. Ob das Modell danach richtig antwortet, kann
 * kein Testlauf zeigen, das steht in der Abnahme am Geraet.
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/database', () => ({ query: jest.fn() }));

const {
  GLOBAL_BASE_PROMPT,
  PRODUKT_BESCHREIBUNG,
} = require('../../src/services/llm/systemPromptBuilder');

describe('Produktbeschreibung im Basisprompt', () => {
  test('steht im ausgelieferten Teil, nicht im Unternehmenskontext', () => {
    // Der Unternehmenskontext gehoert dem Kunden. Waere die Beschreibung dort,
    // waere sie beim ersten Bearbeiten weg.
    expect(GLOBAL_BASE_PROMPT).toContain(PRODUKT_BESCHREIBUNG);
  });

  test('nennt das Geraet, seine Herkunft und die vier Flaechen', () => {
    for (const wort of ['Arasul-Gerät', 'NVIDIA-Jetson', 'Chat', 'Terminal', 'Abläufe', 'Sprachmodellen']) {
      expect(PRODUKT_BESCHREIBUNG).toContain(wort);
    }
  });

  test('verbietet ausdruecklich das Erfinden', () => {
    expect(PRODUKT_BESCHREIBUNG).toContain('Erfinde nichts dazu');
  });

  /**
   * Phase A hat gerade fuenf unerfuellte Zusagen von der Website genommen.
   * Eine sechste im Systemprompt waere der falsche Ort, und sie waere falsch:
   * die Websuche geht ins Internet.
   */
  test('verspricht nicht, dass keine Daten das Geraet verlassen', () => {
    expect(PRODUKT_BESCHREIBUNG).not.toMatch(/keine Daten|nichts verl|niemals.*Internet/i);
    expect(PRODUKT_BESCHREIBUNG).toContain('gehen ins Internet');
  });

  test('bleibt kurz genug, um in jeder Anfrage mitzugehen', () => {
    // Rund 130 Token, gemessen. Der Grundvorlauf liegt bei 4502; mehr als ein
    // paar Prozent darf eine Erklaerung nicht kosten, die immer mitfaehrt.
    expect(PRODUKT_BESCHREIBUNG.length).toBeLessThan(700);
  });

  test('keine Emojis, keine Gedankenstriche als Trenner', () => {
    expect(PRODUKT_BESCHREIBUNG).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(PRODUKT_BESCHREIBUNG).not.toMatch(/ [—–] /);
  });
});
