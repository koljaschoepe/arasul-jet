-- 127: Datei-Anbindung an Chat-Nachrichten
--
-- Chat-Antworten sollen nicht nur inline im Verlauf stehen, sondern als Datei
-- in der Projektablage landen können ("Newsletter-Fall", 2026-07-28). Die
-- Karte im Chat („Datei gespeichert → klick zum Öffnen") braucht einen
-- persistierten Verweis, der einen Reload überlebt. Gleiches Feld trägt bei
-- Nutzer-Nachrichten die Anhang-Info (bisher nur als „📎 name"-Textpräfix im
-- content — unstrukturiert und mit Emoji).
--
-- Formen:
--   { "art": "projektdatei", "project_id": "<uuid>", "pfad": "a/b.md", "name": "b.md" }
--   { "art": "anhang", "name": "bericht.pdf" }

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS datei JSONB DEFAULT NULL;

COMMENT ON COLUMN chat_messages.datei IS
  'Datei-Verweis der Nachricht: {art: projektdatei|anhang, project_id?, pfad?, name}';
