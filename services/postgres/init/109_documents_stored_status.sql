-- 109_documents_stored_status.sql — „nur gespeichert"-Zustand (Plan 009)
--
-- Kontext: Plan 009 öffnet den Datei-Upload für BELIEBIGE Dateitypen (echtes
-- Dateisystem — auch Office, ZIP, Bilder, Binärdateien). Nicht-indexierbare
-- Typen sollen gespeichert + herunterladbar sein, aber NICHT als „failed"
-- (roter Punkt im Explorer) erscheinen. Dafür bekommt document_status einen
-- eigenen Wert 'stored': hochgeladen, abgelegt, bewusst nicht indexiert.
--
-- Der Indexer (run_indexing_pipeline) setzt diesen Status, wenn die Endung
-- nicht in PARSERS liegt; der Explorer rendert dafür ein neutrales Icon.
--
-- Forward-only + idempotent. ADD VALUE ist auf PostgreSQL 16 auch innerhalb
-- der Migrations-Transaktion zulässig, solange der neue Wert nicht in
-- derselben Transaktion verwendet wird (hier nur hinzugefügt).
--
-- Rollback (down): Enum-Werte lassen sich nicht ohne Typ-Neubau entfernen; im
-- Ernstfall bleibt der Wert einfach ungenutzt (keine Daten betroffen).

ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'stored';
