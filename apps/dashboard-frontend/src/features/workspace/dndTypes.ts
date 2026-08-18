/**
 * DnD-MIME-Typen des Workspace (Plan 022) — eine gemeinsame Quelle für Explorer,
 * Tab-Leiste und Chat, damit ein Tab in einen Ordner gezogen werden kann, ohne
 * dass die Tab-Leiste das schwere Explorer-Modul importieren muss.
 */

/** Chat-Scope („Mit Ordner chatten" / „Speichern in …"). */
export const DND_SCOPE_TYPE = 'application/x-arasul-scope';
/** Ablage-Eintrag (Datei/Ordner) — Verschieben im Baum bzw. Tab → Ordner. */
export const DND_ABLAGE_TYPE = 'application/x-arasul-ablage';
