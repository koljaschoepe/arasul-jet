-- 191_ausgang_zaehler.sql — Wohin Apps und Plattform ins Internet wollten,
-- gezaehlt (02.10.2026, J38, Auftrag ausgang-proxy-und-verbindungsseite)
--
-- WARUM. Apps haengen im Netz `arasul-apps` ohne Internet; was hinaus muss, geht
-- durch den Ausgangs-Proxy (`services/egress-proxy`), der nur die Hostnamen aus
-- `verbindungen` im Manifest durchlaesst. Der Administrator soll je App sehen,
-- was eingetragen ist, was genutzt wurde und was abgewiesen wurde -- und das
-- muss einen Neustart ueberleben. Dazu kommen die Aufrufe der PLATTFORM an
-- externe Modelle (Flows), die nicht durch den Proxy gehen, aber dieselbe
-- Frage beantworten: wohin schickt dieses Geraet Daten?
--
-- WAS DRINSTEHT: je Quelle, App, Stand, Hostname und Ergebnis eine ZEILE mit
-- Anzahl und letztem Zeitpunkt. Kein Pfad, keine Nutzlast, keine Adresse des
-- Menschen. Der Proxy sieht bei https nur den Hostnamen, mehr gibt es nicht
-- zu speichern.
--
-- KEIN FREMDSCHLUESSEL auf `apps`: ein Nachweis ueberlebt die App (wie 187).
--
-- Rollback (down):
--   DROP TABLE IF EXISTS public.ausgang_zaehler;

CREATE TABLE IF NOT EXISTS public.ausgang_zaehler (
  -- `app` (ueber den Proxy) oder `plattform` (das Backend selbst)
  quelle    TEXT NOT NULL CHECK (quelle IN ('app', 'plattform')),
  -- Leer bei `plattform`.
  app_id    TEXT NOT NULL DEFAULT '',
  stand     TEXT NOT NULL DEFAULT '' CHECK (stand IN ('', 'live', 'test')),
  host      TEXT NOT NULL,
  ergebnis  TEXT NOT NULL CHECK (ergebnis IN ('erlaubt', 'abgewiesen')),
  anzahl    BIGINT NOT NULL DEFAULT 0,
  erstmals  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  zuletzt   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (quelle, app_id, stand, host, ergebnis)
);

COMMENT ON TABLE public.ausgang_zaehler IS
  'Wie oft eine App (ueber den Ausgangs-Proxy) oder die Plattform einen Hostnamen angefragt hat, je Ergebnis.';
