-- 196_flow_art_m5.sql -- Die Art eines Flows, vom Admin geschaltet
-- (04.10.2026, M5, Auftrag flow-arten-autonom)
--
-- WARUM. Der Flow-Kopf nennt, welche Arten ein Flow kann (`arten`, Kontrakt 8):
-- `autonom` und `ergebnis_bestaetigen`. Welche gilt, entscheidet der Admin je
-- Flow, sobald er der KI traut. Die Wahl steht wie das Modell in
-- `flow_settings` und nicht in der Datei: sie ueberlebt ein App-Update.
--
-- NULL = es gilt, was das Paket nennt (die erste Art in `arten`, ohne Angabe
-- `autonom`). Gilt ab dem naechsten Lauf; ein laufender Lauf behaelt seine.
--
-- Rollback (down):
--   ALTER TABLE public.flow_settings DROP COLUMN IF EXISTS art;

ALTER TABLE public.flow_settings
  ADD COLUMN IF NOT EXISTS art TEXT
    CHECK (art IN ('autonom', 'ergebnis_bestaetigen'));

COMMENT ON COLUMN public.flow_settings.art IS
  'Vom Admin gewaehlte Art des Flows (autonom | ergebnis_bestaetigen); NULL = Vorgabe des Pakets. Migration 196.';
