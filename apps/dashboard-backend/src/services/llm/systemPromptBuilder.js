/**
 * System Prompt Builder
 *
 * Bis Phase B4 (26.08.2026) lagen hier drei Schichten: die Basis, das
 * KI-Profil (Memory) und der Unternehmenskontext (company_context). Die
 * beiden hinteren sind mit Memory und Wissensraeumen gefallen; geblieben ist
 * die Basis, die der Betreiber ueber system_settings.llm_base_system_prompt
 * ueberschreiben kann.
 */

const systemSettings = require('../system-settings/systemSettingsService');

/**
 * Was das Gerät ist (Plan 023 D8).
 *
 * Am 21.08.2026 gemessen, mit `qwen3-coder:30b` und derselben
 * Prompt-Zusammensetzung wie im Produkt. Auf die Frage „Was kann Arasul?"
 * antwortete der Chat:
 *
 *   Auslieferungszustand   „ein deutscher Anbieter von Softwarelösungen für
 *   (Platzhalter-Profil)    die Lebensmittelindustrie … ERP-Systeme … HACCP"
 *
 *   Kundengerät            „ein deutscher Hersteller spezialisiert auf
 *   (fremdes Profil)        Klebetechnik und Oberflächenbehandlung"
 *
 * Beides frei erfunden, beides überzeugend und passend zur Branche des
 * Kunden. Der Grund: nichts im Prompt beschreibt das Produkt. Der Basisprompt
 * waren zwei Sätze über Höflichkeit, der Unternehmenskontext gehört dem
 * Kunden, und in ihm steht der einzige Eigenname weit und breit.
 *
 * Der Plan nennt das „korrektes Verhalten bei falschem Inhalt". Das trifft nur
 * das Entwicklungsgerät, wo im Kontext tatsächlich Arasul als Firma steht. Auf
 * einem ausgelieferten Gerät ist es eine Halluzination über das Produkt, das
 * der Kunde gerade gekauft hat, und zwar im ersten Gespräch.
 *
 * Die Beschreibung steht deshalb HIER und nicht im Unternehmenskontext: der
 * gehört dem Kunden, dieser Teil wird mit dem Gerät ausgeliefert.
 *
 * Sie kostet rund 130 Token in jeder Anfrage, gemessen, also drei Prozent des
 * Grundvorlaufs. Plan 023 D7 kürzt an anderer Stelle deutlich mehr; ein
 * erfundenes Produkt ist der teurere Posten.
 *
 * Jeder Satz ist geprüft. Insbesondere steht hier NICHT „keine Daten nach
 * draußen": die Websuche geht ins Internet, und Phase A hat gerade fünf
 * unerfüllte Zusagen von der Website genommen. Eine sechste im Systemprompt
 * wäre der falsche Ort.
 */
const PRODUKT_BESCHREIBUNG =
  'Du läufst auf einem Arasul-Gerät: einem Rechner mit NVIDIA-Jetson-Prozessor, der beim Nutzer vor Ort steht. ' +
  'Deine Antworten entstehen auf diesem Gerät, nicht in einer Cloud. ' +
  'Das Gerät bietet Abläufe zum Automatisieren und einen Katalog von Sprachmodellen, die der Nutzer selbst herunterlädt. ' +
  'Einzelne Werkzeuge gehen ins Internet, etwa die Websuche; das tun sie nur, wenn du sie benutzt. ' +
  'Wenn jemand fragt, was Arasul ist oder kann, ist das gemeint. Erfinde nichts dazu.';

// Layer 1: built-in global base. Operators can override it via
// system_settings.llm_base_system_prompt (096) without a redeploy.
const GLOBAL_BASE_PROMPT =
  'Du bist ein hilfreicher KI-Assistent. Antworte präzise und strukturiert auf Deutsch, es sei denn der Benutzer schreibt in einer anderen Sprache. ' +
  'Verwende keine Emojis, es sei denn der Benutzer bittet ausdrücklich darum. ' +
  PRODUKT_BESCHREIBUNG;

/** Layer-1 prompt: DB override if set and non-empty, else the built-in default. */
function getBasePrompt() {
  const dbPrompt = systemSettings.get('llm_base_system_prompt', null);
  return typeof dbPrompt === 'string' && dbPrompt.trim() ? dbPrompt.trim() : GLOBAL_BASE_PROMPT;
}

/**
 * Der Systemprompt fuer den Chat-Pfad.
 *
 * Hier stand bis zum 23.08.2026 eine `## Tools`-Schicht, sechs Systemwerkzeuge
 * im Format `[TOOL: name param=wert]`, die niemand ausfuehrte; der Marker
 * stand woertlich in der Antwort. Einem Modell Faehigkeiten zu versprechen,
 * die niemand ausfuehrt, ist schlimmer als keine Faehigkeiten.
 *
 * @returns {Promise<string>}
 */
async function buildSystemPrompt() {
  return getBasePrompt();
}

module.exports = {
  buildSystemPrompt,
  GLOBAL_BASE_PROMPT,
  PRODUKT_BESCHREIBUNG,
  getBasePrompt,
};
