/**
 * Rechnungsnummernkreis (Plan 014, Phase 5) — lückenlos per Transaktion.
 *
 * `mitNaechsterNummer` zieht die nächste Nummer je (Projekt, Jahr) und führt
 * die übergebene Arbeit (PDF/XML erzeugen, Datei schreiben) INNERHALB
 * derselben Transaktion aus (db.transaction):
 *
 *   BEGIN
 *     Zähler hochzählen (Zeilen-Lock serialisiert Parallelläufe)
 *     Rechnung registrieren (Nummer, Pfad, Code-Summen)
 *     arbeit(nummer) — wirft sie, wird ALLES zurückgerollt: keine Lücke
 *   COMMIT
 *
 * Das Nummernformat ist RE-<jahr>-<lfd. 5-stellig> (z. B. RE-2026-00001).
 */

const database = require('../../../database');

function formatNummer(jahr, laufnummer) {
  return `RE-${jahr}-${String(laufnummer).padStart(5, '0')}`;
}

/**
 * @param {object} p
 * @param {string} p.projektId
 * @param {number} p.jahr
 * @param {string} p.pfad - Ablage-relativer Ziel-Pfad der PDF ({{nummer}}-Platzhalter erlaubt).
 * @param {object} p.summen - Die Code-berechneten Summen (api-Form).
 * @param {(nummer:string, laufnummer:number) => Promise<{pfad?:string}|void>} p.arbeit -
 *   erzeugt die Dateien; darf den endgültigen Pfad zurückgeben (mit eingesetzter Nummer).
 * @returns {Promise<{nummer:string, laufnummer:number, pfad:string}>}
 */
async function mitNaechsterNummer({ projektId, jahr, pfad, summen, arbeit }, deps = {}) {
  const { db = database } = deps;
  return db.transaction(async client => {
    // Zähler anlegen (falls erstes Mal) und hochzählen — das UPDATE hält das
    // Zeilen-Lock bis zum COMMIT und serialisiert damit Parallelläufe.
    await client.query(
      `INSERT INTO rechnungsnummern_zaehler (projekt_id, jahr, stand)
       VALUES ($1, $2, 0)
       ON CONFLICT (projekt_id, jahr) DO NOTHING`,
      [projektId, jahr]
    );
    const { rows } = await client.query(
      `UPDATE rechnungsnummern_zaehler
          SET stand = stand + 1
        WHERE projekt_id = $1 AND jahr = $2
        RETURNING stand`,
      [projektId, jahr]
    );
    const laufnummer = rows[0].stand;
    const nummer = formatNummer(jahr, laufnummer);
    const endgueltigerPfad = String(pfad).split('{{nummer}}').join(nummer);

    await client.query(
      `INSERT INTO rechnungsnummern (projekt_id, jahr, laufnummer, nummer, pfad, summen)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [projektId, jahr, laufnummer, nummer, endgueltigerPfad, JSON.stringify(summen)]
    );

    // Die eigentliche Erzeugung — wirft sie, rollt alles zurück (keine Lücke).
    const ergebnis = await arbeit(nummer, laufnummer);
    const finalerPfad = ergebnis?.pfad || endgueltigerPfad;
    if (finalerPfad !== endgueltigerPfad) {
      await client.query(
        `UPDATE rechnungsnummern SET pfad = $1 WHERE projekt_id = $2 AND nummer = $3`,
        [finalerPfad, projektId, nummer]
      );
    }
    return { nummer, laufnummer, pfad: finalerPfad };
  });
}

/** Ist dieser Ablage-Pfad eine registrierte (= schreibgeschützte) Rechnung? */
async function istRegistrierteRechnung(projektId, pfad, deps = {}) {
  const { db = database } = deps;
  const { rows } = await db.query(
    `SELECT 1 FROM rechnungsnummern WHERE projekt_id = $1 AND pfad = $2 LIMIT 1`,
    [projektId, pfad]
  );
  return rows.length > 0;
}

module.exports = { mitNaechsterNummer, istRegistrierteRechnung, formatNummer };
