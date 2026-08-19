-- Migration 146: Geraetezustand, ein Merker ueber den Werksreset hinweg
--
-- In der Live-Abnahme des Werksresets am 19.08.2026 auf dem Pruefstand:
-- nach "Auslieferungszustand" war admin_users leer, nach dem naechsten Start
-- stand wieder ein Administrator darin, mit dem alten Passwort.
--
-- Ursache: bootstrap.js legt einen Administrator an, sobald keiner existiert
-- und ein ADMIN_PASSWORD erreichbar ist. Der Werksreset entwertet es in der
-- .env, aber die zweite Tuer stand offen: compose reicht es zusaetzlich als
-- Docker-Secret durch (ADMIN_PASSWORD_FILE, /run/secrets/admin_password), und
-- resolveSecrets setzt process.env daraus. Die Datei liegt read-only im
-- Container, der Werksreset kann sie nicht anfassen.
--
-- Ein Geraet, das zurueckgesetzt und weitergegeben wird, haette sich also mit
-- dem alten Passwort weiter oeffnen lassen. Genau das soll die Stufe
-- verhindern.
--
-- Statt einer dritten Tuer zu suchen: ein Merker, den der Werksreset setzt und
-- die Ersteinrichtung wieder loescht. Solange er steht, legt bootstrap.js
-- keinen Administrator an. Die Tabelle steht in der Klassifikation des
-- Werksresets unter BLEIBT, sie muss ihn ja gerade ueberleben.

CREATE TABLE IF NOT EXISTS arasul.geraet (
    id              integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    werksreset_am   timestamptz,
    werksreset_stufe text
);

INSERT INTO arasul.geraet (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE arasul.geraet IS
    'Zustand des Geraets ueber einen Werksreset hinweg. Eine Zeile, id = 1.';
COMMENT ON COLUMN arasul.geraet.werksreset_am IS
    'Gesetzt vom Werksreset, geloescht von der Ersteinrichtung. Solange gesetzt, legt bootstrap.js keinen Administrator aus ADMIN_PASSWORD an.';
