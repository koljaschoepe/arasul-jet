/**
 * Ersatz fuer src/middleware/rateLimit in Tests.
 *
 * Sieben Testdateien haben die Limiter vorher einzeln aufgezaehlt. jest.mock
 * ersetzt das GANZE Modul, also bekam jeder Aufrufer eines nicht aufgezaehlten
 * Limiters undefined, und Express wirft beim Registrieren der Route
 * "Route.get() requires a callback function but got a [object Undefined]".
 * Plan 023 C3 hat das mit sessionProbeLimiter ausgeloest, fuenf Suiten auf
 * einen Schlag, und dieselbe Falle vorher schon mit optionalAuth in neun
 * Mocks der Auth-Middleware.
 *
 * Statt die Liste zu pflegen, antwortet dieser Ersatz auf JEDEN Namen mit einer
 * Middleware, die durchlaesst. Der naechste Limiter braucht hier nichts.
 *
 * Benutzung:
 *   jest.mock('../../src/middleware/rateLimit', () => require('../helpers/rateLimitMock'));
 *
 * ACHTUNG: hier laesst JEDER Limiter durch. Wer pruefen will, dass eine Route
 * wirklich mit 429 antwortet, darf diesen Ersatz nicht einsetzen, sonst geht
 * die Erwartung still ins Leere. Fuer so einen Test entweder gar nicht mocken
 * und die echten Limiter laufen lassen, oder in dieser einen Datei einen
 * eigenen Ersatz schreiben, der fuer den fraglichen Namen 429 antwortet.
 */

const durchlassen = (req, res, next) => next();

// Namen, die das Modulsystem selbst abfragt. Fuer die darf hier keine Funktion
// herauskommen, sonst haelt der CommonJS-Interop das Modul fuer ein ES-Modul.
const NICHT_BEANTWORTEN = new Set(['__esModule', 'default', 'then']);

module.exports = new Proxy(
  { createUserRateLimiter: () => durchlassen },
  {
    get(ziel, name) {
      if (name in ziel) return ziel[name];
      if (typeof name === 'symbol' || NICHT_BEANTWORTEN.has(name)) return undefined;
      return durchlassen;
    },
  }
);
