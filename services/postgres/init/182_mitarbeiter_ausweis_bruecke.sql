-- 182_mitarbeiter_ausweis_bruecke.sql — Der Ausweis eines Mitarbeiters
-- (Bruecke zwischen Firmenordner und Apps, 21.09.2026, J34)
--
-- WAS FEHLTE. Eine App am Geraet ist von aussen erreichbar, und davor steht
-- die Forward-Auth, die `app_members` prueft (C4). Hineingekommen ist bis
-- hierher nur ein BROWSER: mit dem Sitzungs-Cookie oder dem JWT aus der
-- Anmeldung, beide kurzlebig und an eine Sitzung gebunden. Ein Agent am
-- Rechner eines Mitarbeiters hat keine Sitzung -- er laeuft, wenn dieser
-- Mensch ihn startet, und er soll genau das duerfen, was dieser Mensch darf.
-- Der API-Schluessel daneben (`api_keys`) ist kein Ersatz: er gehoert einer
-- APP oder dem Kit, sein `created_by` ist der Administrator, der ihn angelegt
-- hat, und er traegt Bereiche der externen Schnittstelle -- nicht die
-- Freigaben eines Menschen.
--
-- EINE ZEILE JE RECHNER, NICHT JE MENSCH. Wer an drei Rechnern arbeitet, hat
-- drei Ausweise mit drei Namen, und wenn einer davon verloren geht, faellt
-- nur dieser weg. Ein Ausweis je Mensch waere bequemer und muesste bei jedem
-- Verlust alle Rechner neu ausstatten.
--
-- NUR DIE PRUEFSUMME, UND SIE IST SHA-256 UND NICHT BCRYPT. Der Klartext
-- entsteht einmal, wird einmal angezeigt und ist danach nirgends mehr am
-- Geraet -- wie beim API-Schluessel einer App (C4). Die Wahl des Verfahrens
-- ist hier aber eine andere als dort: dieser Wert wird bei JEDER Anfrage an
-- JEDE App geprueft, weil die Forward-Auth vor jedem Aufruf steht. Bcrypt mit
-- Kostenfaktor 10 kostet rund eine Zehntelsekunde je Pruefung; das waere eine
-- Zehntelsekunde auf jeden Aufruf eines Agenten. Sha-256 ist hier richtig und
-- nicht schwach, weil das Geheimnis kein Passwort ist: es sind 32 zufaellige
-- Bytes aus `crypto.randomBytes`, also nichts, was sich raten oder aus einer
-- Liste nachschlagen laesst. Genau darum steht die Pruefsumme auch UNIQUE --
-- sie ist der Schluessel, ueber den gesucht wird, ein Index und ein
-- Doppelausschluss in einem.
--
-- WIDERRUFEN HEISST LOESCHEN. Kein `is_active` daneben: „der Ausweis gilt
-- nicht mehr" und „den Ausweis gibt es nicht" sind dieselbe Auskunft, und
-- zwei Zustaende dafuer waeren zwei Stellen, an denen die Antwort spaeter
-- auseinanderlaeuft. Was geschah, steht im Audit-Log; was gilt, steht hier.
--
-- ON DELETE CASCADE: wer das Geraet verlaesst, nimmt seine Ausweise mit. Das
-- ist auch die Antwort der DSGVO-Loeschung, ohne dass sie diese Tabelle
-- kennen muss.
--
-- Rollback (down):
--   DROP TABLE IF EXISTS public.mitarbeiter_ausweise;

CREATE TABLE IF NOT EXISTS public.mitarbeiter_ausweise (
  id                  BIGSERIAL   PRIMARY KEY,
  user_id             BIGINT      NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  -- Der Name des Rechners, wie der Mensch ihn tippt. Er ist die einzige Art,
  -- einen Ausweis wiederzuerkennen -- den Wert sieht niemand wieder.
  name                TEXT        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  -- Die ersten Zeichen des Klartexts, damit ein Mensch zwei Zeilen
  -- auseinanderhalten kann, ohne den Wert zu kennen. Kein Geheimnis.
  praefix             TEXT        NOT NULL,
  -- sha256(Klartext), hex. Siehe oben, warum nicht bcrypt.
  pruefsumme          TEXT        NOT NULL UNIQUE,
  angelegt_am         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Wann er zuletzt etwas geoeffnet hat. NULL heisst „noch nie benutzt", und
  -- das ist eine Auskunft und kein fehlender Wert: ein Ausweis, der seit
  -- Wochen daliegt und nie gebraucht wurde, gehoert widerrufen.
  zuletzt_benutzt_am  TIMESTAMPTZ,
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_mitarbeiter_ausweise_user
  ON public.mitarbeiter_ausweise(user_id);

COMMENT ON TABLE public.mitarbeiter_ausweise IS
  'Der Ausweis eines Mitarbeiters ausserhalb des Browsers: je Mensch und Rechner eine Zeile, gesendet als Authorization: Bearer. Er oeffnet die Schnittstelle der Apps, die diesem Menschen freigegeben sind, und sonst nichts (Bruecke, 21.09.2026)';
COMMENT ON COLUMN public.mitarbeiter_ausweise.pruefsumme IS
  'sha256 des Klartexts, hex. Der Klartext entsteht einmal und wird einmal angezeigt; am Geraet liegt er nirgends';
COMMENT ON COLUMN public.mitarbeiter_ausweise.zuletzt_benutzt_am IS
  'Hoechstens einmal je Minute nachgefuehrt: die Forward-Auth steht vor JEDEM Aufruf, und ein Schreibvorgang je Aufruf waere ein Schreibvorgang je Aufruf';
