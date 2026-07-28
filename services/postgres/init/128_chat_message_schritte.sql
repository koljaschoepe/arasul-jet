-- 128: Agent-Schritte an Chat-Nachrichten
--
-- Der Chat ist ab 2026-07-28 ein Agent mit Werkzeugschleife (Wissensraum-Suche,
-- Ablage lesen/schreiben, Web, Subagenten). Die kompakten Schritt-Zeilen einer
-- Antwort („Suche im Wissensraum …", „Schreibe kunden/angebot.html …") müssen
-- einen Reload überleben — sie werden als JSONB-Liste an der Assistenten-
-- Nachricht persistiert.
--
-- Form (Liste, gekürzte Ein-/Ausgaben):
--   [{ "id": 1, "kind": "werkzeug"|"subagent", "name": "rag_suche",
--      "input": {...}, "output": "…", "status": "fertig"|"fehler",
--      "parent_step_id": null|number }]

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS schritte JSONB DEFAULT NULL;

COMMENT ON COLUMN chat_messages.schritte IS
  'Agent-Werkzeugschritte der Antwort (Liste, gekürzt): kind, name, input, output, status, parent_step_id';
