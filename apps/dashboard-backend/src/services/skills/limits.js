/**
 * Notbremsen eines Skill-Laufs (Plan 011, Schritt 11).
 *
 * Ein Skill mit Subagenten kann sich sonst selbst aufhängen: zwei Ebenen, jede
 * Rolle ruft Werkzeuge, die GPU arbeitet sequenziell. Drei harte Grenzen halten
 * das ein — ALLE geteilt über den ganzen Lauf, nicht pro Ebene:
 *
 *  - `maxAufrufe` — Gesamtzahl der Subagent-Aufrufe über alle Ebenen. Ein
 *    Pro-Ebene-Zähler wäre multiplikativ und damit wertlos als Bremse.
 *  - `deadline`   — ein Gesamt-Zeitlimit. Sobald es überschritten ist, wird kein
 *    weiterer Subagent mehr gestartet.
 *  - `maxTiefe`   — wie tief Rollen sich gegenseitig aufrufen dürfen. Der
 *    Orchestrator ist Ebene 0; erlaubt sind Rollen auf Ebene 1 und 2.
 *
 * Bewusst EINE gemeinsame Instanz je Lauf: Der Zähler und die Frist müssen über
 * alle Verschachtelungen hinweg dieselben sein, sonst zählt jede Ebene für sich
 * und die Grenze greift nie.
 */

class RunLimits {
  /**
   * @param {object} p
   * @param {number} p.maxAufrufe - Gesamtzahl erlaubter Subagent-Aufrufe.
   * @param {number} p.zeitlimitS - Gesamt-Zeitlimit in Sekunden.
   * @param {number} [p.maxTiefe=2] - Maximale Verschachtelungstiefe der Rollen.
   * @param {() => number} [p.now] - Zeitquelle (für Tests).
   */
  constructor({ maxAufrufe, zeitlimitS, maxTiefe = 2, now = () => Date.now() } = {}) {
    this.maxAufrufe = maxAufrufe;
    this.maxTiefe = maxTiefe;
    this.now = now;
    this.deadline = now() + zeitlimitS * 1000;
    this.aufrufe = 0;
  }

  /** Ist die Frist abgelaufen? */
  zeitAbgelaufen() {
    return this.now() >= this.deadline;
  }

  /** Verbleibende Sekunden bis zur Frist (mindestens 1). */
  restSekunden() {
    return Math.max(1, Math.ceil((this.deadline - this.now()) / 1000));
  }

  /**
   * Prüft, ob von der Tiefe `depth` aus noch ein Subagent gestartet werden darf,
   * und ZÄHLT ihn bei Erfolg. Gibt bei Erfolg null zurück, sonst einen kurzen
   * deutschen Grund (der als Werkzeug-Antwort ans Modell geht — kein Wurf).
   *
   * Die Reihenfolge der Prüfungen ist Absicht: erst Zeit (die härteste, von
   * außen kommende Grenze), dann Tiefe, dann Zahl. Gezählt wird NUR, wenn alle
   * drei bestehen — ein abgewiesener Aufruf verbraucht kein Kontingent.
   *
   * @param {number} depth - Tiefe des AUFRUFERS (Orchestrator = 0).
   * @returns {string|null}
   */
  subagentErlaubt(depth) {
    if (this.zeitAbgelaufen()) {
      return `Zeitlimit erreicht`;
    }
    if (depth >= this.maxTiefe) {
      return `Verschachtelung zu tief (höchstens ${this.maxTiefe} Ebenen)`;
    }
    if (this.aufrufe >= this.maxAufrufe) {
      return `Gesamtzahl der Subagent-Aufrufe erreicht (${this.maxAufrufe})`;
    }
    this.aufrufe += 1;
    return null;
  }
}

module.exports = { RunLimits };
