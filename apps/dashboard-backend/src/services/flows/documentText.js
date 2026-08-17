/**
 * Dokument-Text für ein `datei`-Argument (Plan 011, Schritt 18).
 *
 * Ein Flow-Argument vom Typ `datei` liefert bislang nur den DATEINAMEN an das
 * Modell (die bewusste Naht aus Schritt 14). Damit ein Flow wie
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
 * @param {string[]|null} [p.spaceIds] - Optionaler Wissensraum-Zuschnitt. Ist
 *   eine nicht-leere Liste gesetzt, wird die Suche auf diese Räume (plus
 *   nicht zugeordnete Dokumente) beschränkt — spiegelt die Qdrant-Filter-Logik
 *   in `ragCore.buildSpaceFilter` und verhindert, dass bei gleich benannten
 *   Dateien in mehreren Projekten still der Inhalt eines fremden Projekts
 *   eingespeist wird (F-07). Ohne Liste (null/[]) wird projektübergreifend
 *   gesucht — das bisherige Flow-Verhalten.
 * @param {object} [deps] - Für Tests austauschbar (`query`).
 * @returns {Promise<{gefunden: boolean, titel: string|null, text: string, gekuerzt: boolean}>}
 */
async function ladeDokumentText(
  { filename, maxZeichen = MAX_ZEICHEN, spaceIds = null },
  deps = {}
) {
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
    const scopeIds = Array.isArray(spaceIds) && spaceIds.length > 0 ? spaceIds : null;

    // Ein Dokument über seinen Dateinamen suchen — optional auf Räume zugeschnitten.
    // Space-Zuschnitt: die genannten Räume ODER nicht zugeordnete Dokumente
    // (space_id IS NULL). `documents.space_id` ist eine UUID-Spalte — sie ist
    // nie der Leerstring (anders als der Qdrant-Payload in buildSpaceFilter, der
    // untypisiert ist); ein `= ''`-Zweig ließe die Query am UUID-Typ-Coercion
    // scheitern. Array-Cast `::uuid[]` wie das etablierte Muster in routes/rag.js.
    const sucheDoc = async withScope => {
      const scopeKlausel = withScope ? ` AND (space_id = ANY($2::uuid[]) OR space_id IS NULL)` : '';
      const r = await query(
        `SELECT id, title
           FROM documents
          WHERE (filename = $1 OR original_filename = $1)
            AND deleted_at IS NULL${scopeKlausel}
          ORDER BY (filename = $1) DESC, uploaded_at DESC
          LIMIT 1`,
        withScope ? [name, scopeIds] : [name]
      );
      return r.rows[0];
    };

    let row = await sucheDoc(!!scopeIds);
    // Fallback (Plan 021, live gefunden): Der Nutzer hat die Datei EXPLIZIT beim
    // Namen genannt. Findet der Space-Zuschnitt sie nicht (das Dokument liegt in
    // einem anderen Raum/Projekt-Unterordner), ist für den Einzel-Admin (keine
    // Mandanten, jeder darf alles) „die benannte Datei lesen" besser als
    // „nicht gefunden" — sonst spekuliert das Modell aus dem Dateinamen. Der
    // Zuschnitt bleibt die BEVORZUGTE Quelle (verhindert weiter die
    // Fehl-Zuordnung bei gleich benannten Dateien, F-07); nur wenn er leer
    // ausgeht, wird raumübergreifend gesucht.
    if (!row && scopeIds) {
      row = await sucheDoc(false);
      if (row) {
        logger.debug(`ladeDokumentText: "${name}" nur raumübergreifend (Fallback) gefunden`);
      }
    }
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
    // Zusammenfassung ausweichen, damit der Flow wenigstens etwas hat.
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
