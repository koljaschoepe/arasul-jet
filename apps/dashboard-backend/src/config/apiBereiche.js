/**
 * Was ein API-Schluessel duerfen kann.
 *
 * Eine Liste, ein Ort. Sie stand bis zum 27.08.2026 ausgeschrieben in
 * `routes/external/externalApi.js`, dann in `middleware/apiKeyAuth.js` (C4) --
 * und seit C5 hier, weil sie von drei Seiten gebraucht wird, die einander
 * nichts angehen: die Pruefung (`middleware/apiKeyAuth.js`), das Schema, gegen
 * das ein Administrator einen Schluessel anlegt (`schemas/externalApi.js`), und
 * der Kontrakt, den das Kit liest (`services/app/appKontrakt.js`).
 *
 * Ein SCHEMA, das eine MIDDLEWARE einbindet, war dabei die eigentliche
 * Schieflage: `schemas/` ist nach der Ordnung dieses Backends reines Zod, und
 * jede Pruefung, die die Middleware in einem Test ersetzt, riss dem Schema die
 * Liste unter den Fuessen weg. Am 27.08.2026 fielen dadurch zwei Testreihen
 * um, die mit Schluesseln gar nichts zu tun hatten.
 *
 * Kein `*`. Migration 085 hat die Wildcard-Schluessel stillgelegt, und die
 * Pruefung honoriert sie seit dem 29.04.2026 ohnehin nicht mehr.
 */

/**
 * Was ein Schluessel darf, wenn niemand etwas anderes sagt.
 *
 * Das bekommt auch der Schluessel, den das GERAET beim Einspielen je App und
 * Stand anlegt (C4). Deshalb steht `app:deploy` nicht darin: sonst koennte
 * jede App jede andere ersetzen -- und sich selbst durch etwas anderes.
 */
const VORGABE_ENDPUNKTE = Object.freeze([
  'llm:chat',
  'llm:status',
  'document:extract',
  'document:analyze',
  'flow:run',
]);

/**
 * Alles, was ein Schluessel duerfen KANN.
 *
 * Bis Phase C5 dieselbe Liste wie die Vorgabe. Dann kam `app:deploy` dazu und
 * damit der erste Bereich, den ein Schluessel NICHT automatisch bekommt: er
 * erlaubt, eine App auf das Geraet zu rollen, den Livestand zu schalten und
 * eine App mitsamt ihren Volumes zu entfernen. Das ist die „Rolle admin" aus
 * der Entscheidung vom 27.08.2026 -- ausgedrueckt in der Spalte, die schon da
 * war (`api_keys.allowed_endpoints`), statt in einer zweiten daneben.
 */
const ALLE_ENDPUNKTE = Object.freeze([...VORGABE_ENDPUNKTE, 'app:deploy']);

module.exports = { VORGABE_ENDPUNKTE, ALLE_ENDPUNKTE };
