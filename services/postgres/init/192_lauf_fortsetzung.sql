-- 192_lauf_fortsetzung.sql -- Ein wartender Lauf ueberlebt Neustart und Update
-- (03.10.2026, M5, Auftrag warten-ueberlebt-neustart)
--
-- WARUM. Ein Flow-Lauf, der auf eine Freigabe wartet, hing bis hierher an einem
-- Zeitgeber und einem Versprechen im Speicher des Backends. Ein Neustart oder
-- ein Update setzte ihn auf `fehler` und schloss seine Anfrage als `verfallen`;
-- der Mensch, der am naechsten Morgen bestaetigen wollte, kam zu spaet. Eine
-- Frist von sieben Tagen ueberlebt keinen einzigen Update-Lauf, wenn der Lauf
-- nur im Speicher steht.
--
-- WAS DRINSTEHT.
--   flow_runs.fortsetzung   WO ein wartender Lauf weitergeht: `{ schritt, name,
--                           schritt_id }` -- der Index in der deklarierten
--                           Schritt-Kette, ihr Name (gegen eine inzwischen
--                           geaenderte Flow-Datei) und der offene Protokoll-
--                           Schritt. NULL = der Lauf laesst sich nach einem
--                           Neustart nicht fortsetzen (modellgetriebene
--                           Werkzeug-Schleife, Freigabe aus einer Rolle, Schritt
--                           in einer Wiederholung).
--   approvals.stufe         die benannte Freigabestufe (`stufen` im Flow-Kopf,
--                           Kontrakt 8), nach der die Frist gewaehlt wurde.
--
-- Die Schrittausgaben stehen schon in `flow_run_steps`; mehr Zustand braucht
-- die deklarierte Kette nicht.
--
-- Rollback (down):
--   ALTER TABLE public.approvals DROP COLUMN IF EXISTS stufe;
--   ALTER TABLE public.flow_runs DROP COLUMN IF EXISTS fortsetzung;

ALTER TABLE public.flow_runs ADD COLUMN IF NOT EXISTS fortsetzung JSONB;
ALTER TABLE public.approvals ADD COLUMN IF NOT EXISTS stufe TEXT;

COMMENT ON COLUMN public.flow_runs.fortsetzung IS
  'Wo ein wartender Lauf nach einem Neustart weitergeht: {schritt, name, schritt_id}. NULL = nicht fortsetzbar. Migration 192.';
COMMENT ON COLUMN public.approvals.stufe IS
  'Benannte Freigabestufe aus dem Flow-Kopf, nach der die Frist gewaehlt wurde. Migration 192.';
