/**
 * Dokument-Text für ein `datei`-Argument (Plan 011, Schritt 18).
 *
 * Ein Skill-Argument vom Typ `datei` liefert bislang nur den DATEINAMEN an das
 * Modell (die bewusste Naht aus Schritt 14). Damit ein Skill wie
 * „dokument-zusammenfassen" die Datei auch tatsächlich zusammenfassen kann,
 * muss ihr Inhalt in den Kontext. Die Original-Datei liegt in MinIO und ist für
 * den Runner nicht als Datei erreichbar — der extrahierte Text steht aber in
 * `document_chunks` (der Indexer legt ihn beim Hochladen an). Diese Funktion
 * setzt die Bruchstücke in Reihenfolge wieder zusammen.
 *
 * Bewusst gedeckelt: der Text geht direkt ins Modell, ein sehr großes Dokument
 * würde sonst den Kontext eines kleinen lokalen Modells sprengen. Gekürzt wird
 * am Zeichen-Budget, und die Kürzung wird ehrlich benannt.
 *
 * Einzel-Admin-Annahme (siehe apps/dashboard-backend/CLAUDE.md): es gibt genau
 * einen Nutzer, jeder darf alles. Deshalb genügt die Suche nach dem Dateinamen
 * über die nicht gelöschten Dokumente; eine strenge Nutzer-Zuordnung (die
 * `documents.user_id` ist VARCHAR und passt nicht auf die numerische Lauf-ID)
 * ist hier nicht das Schutzziel.
 */

const db = require('../../database');
const logger = require('../../utils/logger');

/** Zeichen-Obergrenze für den eingespeisten Dokument-Text (≈ 4k Token). */
const MAX_ZEICHEN = 16000;

/**
 * Lädt den indexierten Text eines Dokuments über seinen Dateinamen.
 *
 * @param {object} p
 * @param {string} p.filename - Der Dateiname (der Wert des `datei`-Arguments).
 * @param {number} [p.maxZeichen] - Zeichen-Budget; darüber wird gekürzt.
 * @param {object} [deps] - Für Tests austauschbar (`query`).
 * @returns {Promise<{gefunden: boolean, titel: string|null, text: string, gekuerzt: boolean}>}
 */
async function ladeDokumentText({ filename, maxZeichen = MAX_ZEICHEN }, deps = {}) {
  const query = deps.query || db.query;
  const name = String(filename || '').trim();
  if (!name) {
    return { gefunden: false, titel: null, text: '', gekuerzt: false };
  }

  try {
    // Nicht gelöschtes Dokument mit diesem Dateinamen. `filename` UND
    // `original_filename` prüfen, weil der Datei-Picker den gespeicherten
    // `filename` (in der Regel eindeutig) zeigt, ein von Hand getippter Wert
    // aber der Originalname sein kann. Bei Mehrdeutigkeit gewinnt ein exakter
    // `filename`-Treffer vor dem `original_filename`-Treffer, erst danach das
    // jüngere Dokument — so wird nicht bei zwei gleich benannten Uploads still
    // der falsche Inhalt eingespeist.
    const doc = await query(
      `SELECT id, title
         FROM documents
        WHERE (filename = $1 OR original_filename = $1)
          AND deleted_at IS NULL
        ORDER BY (filename = $1) DESC, uploaded_at DESC
        LIMIT 1`,
      [name]
    );
    const row = doc.rows[0];
    if (!row) {
      return { gefunden: false, titel: null, text: '', gekuerzt: false };
    }

    // Bruchstücke in Reihenfolge zusammensetzen — bis das Budget erreicht ist.
    const chunks = await query(
      `SELECT chunk_text
         FROM document_chunks
        WHERE document_id = $1
        ORDER BY chunk_index ASC`,
      [row.id]
    );

    let text = chunks.rows
      .map(c => String(c.chunk_text || ''))
      .join('\n')
      .trim();

    // Kein indexierter Text (z. B. noch in Verarbeitung)? Auf die gespeicherte
    // Zusammenfassung ausweichen, damit der Skill wenigstens etwas hat.
    if (!text) {
      const meta = await query(`SELECT summary FROM documents WHERE id = $1`, [row.id]);
      text = String(meta.rows[0]?.summary || '').trim();
    }

    let gekuerzt = false;
    if (text.length > maxZeichen) {
      text = text.slice(0, maxZeichen);
      gekuerzt = true;
    }

    return { gefunden: text.length > 0, titel: row.title || null, text, gekuerzt };
  } catch (err) {
    // Ein Datenbankfehler darf den Lauf nicht kippen — das Modell bekommt dann
    // nur den Dateinamen und sagt ehrlich, dass es den Inhalt nicht lesen konnte.
    logger.warn(`Dokument-Text für "${name}" nicht ladbar: ${err.message}`);
    return { gefunden: false, titel: null, text: '', gekuerzt: false };
  }
}

module.exports = { ladeDokumentText, MAX_ZEICHEN };
