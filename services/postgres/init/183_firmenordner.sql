-- 183_firmenordner.sql — Der Firmenordner am Geraet (22.09.2026, J33)
--
-- WAS ES IST. Ein Dateidienst auf dem Geraet (OpenCloud mit der Ablage
-- `posix`, gewaehlt am 21.09.2026 nach zwei Messungen), in dem die Firma ihre
-- Ordner haelt. Die Mitarbeiter gleichen ihn an ihrem Rechner ab; die Dateien
-- liegen dabei am Geraet als ECHTE Dateien, also lesbar fuer Flows und
-- mitgenommen von der naechtlichen Sicherung.
--
-- WARUM DREI TABELLEN UND NICHT NULL. Der Dienst weiss selbst, welche Raeume
-- es gibt und wer darin Mitglied ist -- man koennte ihn also jedes Mal fragen.
-- Dagegen sprechen drei Dinge, und jedes einzelne reicht:
--
--   1. DIE ZUORDNUNG ZUM MENSCHEN. Der Dienst kennt seinen eigenen Nutzer mit
--      seiner eigenen Kennung. Wer das ist, weiss nur das Geraet, und ohne
--      diese Zuordnung waere „welche Ordner hat Mia" eine Suche ueber Namen --
--      also eine Wette darauf, dass zwei Ablagen dieselbe Schreibweise haben.
--   2. DIE ANTWORT, WENN DER DIENST STEHT. `GET /api/firmenordner` soll auch
--      dann sagen koennen, was ein Mensch hat, wenn der Container gerade
--      neustartet. Eine Auskunft, die nur bei laufendem Dienst existiert, ist
--      als Grundlage einer Sicherung und eines Wegs zurueck unbrauchbar.
--   3. DER WEG ZURUECK. Nach einer Wiederherstellung steht die Ablage wieder
--      da, aber die Raeume und Einladungen des Dienstes sind sein eigener
--      Zustand. Was gelten SOLL, steht hier -- und laesst sich von hier aus
--      wieder herstellen.
--
-- Die Regel bleibt trotzdem: der DIENST entscheidet, wer hineinkommt. Diese
-- Tabellen sind das Soll, nicht die Tuer.
--
-- Rollback (down):
--   DROP TABLE IF EXISTS public.firmenordner_rechte;
--   DROP TABLE IF EXISTS public.firmenordner_ordner;
--   DROP TABLE IF EXISTS public.firmenordner_nutzer;

-- ---------------------------------------------------------------------------
-- 1. Die Spiegelung eines Menschen in den Dienst
-- ---------------------------------------------------------------------------
-- ZWEITE PASSWORTABLAGE, UND DAS STEHT HIER, WEIL ES HIER ANFAENGT. Der Dienst
-- hat seine eigene Anmeldung und nimmt die Kopfzeile der Forward-Auth nicht an
-- (am 21.09.2026 gemessen: 401). Arasul spiegelt deshalb Nutzer UND Passwort
-- ueber die Graph-API des Dienstes. Das Klartextpasswort kennt das Geraet
-- ohnehin in genau den zwei Augenblicken, in denen es gesetzt wird (der
-- Administrator setzt ein Startpasswort, der Mensch wechselt es) -- es kostet
-- also eine Anfrage mehr und keinen neuen Ort, an dem ein Geheimnis liegt.
-- HIER LIEGT KEIN PASSWORT. Was hier steht, ist die Kennung im Dienst und die
-- Auskunft, ob die Spiegelung durch ist.
--
-- `abgleich_offen` ist der ehrliche Teil: ein Dienst, der gerade nicht laeuft,
-- darf das Anlegen eines Mitarbeiters nicht aufhalten. Die Zeile merkt sich
-- dann, was noch fehlt, und der naechste Abgleich holt es nach.
CREATE TABLE IF NOT EXISTS public.firmenordner_nutzer (
  user_id             BIGINT      PRIMARY KEY REFERENCES public.admin_users(id) ON DELETE CASCADE,
  -- Die Kennung im Dienst (eine UUID). Sie ist der Schluessel fuer jede
  -- Einladung und jede Mitgliedschaft.
  dienst_id           TEXT        NOT NULL,
  -- Der Anmeldename im Dienst. Er ist derselbe wie `admin_users.username`, und
  -- er steht trotzdem hier: benennt jemand den Menschen am Geraet um, steht
  -- hier, unter welchem Namen er im Dienst noch bekannt ist.
  dienst_name         TEXT        NOT NULL,
  -- Ist das Passwort dieses Menschen im Dienst dasselbe wie am Geraet?
  -- `false` heisst: der Nutzer ist da, kommt aber nicht herein, bis jemand
  -- sein Passwort einmal setzt oder er es wechselt. Das ist der Zustand nach
  -- einem Abgleich, der einen Menschen nachtraegt, den es vor dem
  -- Firmenordner schon gab -- sein Passwort liegt am Geraet nur als Hash.
  passwort_gespiegelt BOOLEAN     NOT NULL DEFAULT false,
  -- Was der Dienst noch nicht erfahren hat: NULL, wenn nichts offen ist.
  abgleich_offen      TEXT,
  angelegt_am         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  abgeglichen_am      TIMESTAMPTZ,
  UNIQUE (dienst_id)
);

COMMENT ON TABLE public.firmenordner_nutzer IS
  'Die Spiegelung eines Menschen aus admin_users in den Dateidienst: seine Kennung dort und ob die Spiegelung durch ist. Kein Passwort (J33, 22.09.2026)';
COMMENT ON COLUMN public.firmenordner_nutzer.passwort_gespiegelt IS
  'false heisst: der Nutzer ist angelegt, sein Passwort aber nicht bekannt -- er kommt erst herein, wenn es einmal gesetzt wird';
COMMENT ON COLUMN public.firmenordner_nutzer.abgleich_offen IS
  'Was der Dienst noch nicht erfahren hat, als Satz. NULL, wenn nichts offen ist';

-- ---------------------------------------------------------------------------
-- 2. Die Ordner
-- ---------------------------------------------------------------------------
-- ZWEI EBENEN UND NICHT MEHR, so hat der Ueberordner es am 21.09.2026
-- festgelegt. Ebene 1 ist ein Bereich, Ebene 2 ein Projekt darin.
--
-- IM DIENST SIND DIE BEIDEN VERSCHIEDENE DINGE, und das ist die Folge der
-- Messung: OpenCloud kann Rechte nur ERWEITERN, nie unterhalb entziehen. Wer
-- also einen Ordner nicht sehen soll, darf nicht Mitglied des Ordners darueber
-- sein. Daraus folgt zwingend:
--
--   Ebene 1  ist ein RAUM (ein eigener Ablagebereich). Wer ein Recht darauf
--            hat, ist Mitglied; wer keins hat, sieht den Raum nicht -- auch
--            seinen Namen nicht.
--   Ebene 2  ist ein ORDNER im Raum seiner Ebene 1, einzeln eingeladen. Wer
--            nur ihn bekommt, bekommt genau ihn.
--
-- DIE STUFE „AM GERAET" ist `art = 'am_geraet'` und damit ein eigener Raum
-- ohne jedes Mitglied. Als unsichtbarer Unterordner eines geteilten Raums
-- geht es nicht -- das waere Entziehen nach unten (am 21.09.2026 gemessen:
-- die Rolle „Denied" lehnt die Graph-API ab). Auf ihn kommt nur, wer am
-- Geraet in den Ordner sieht: Flows und Apps.
--
-- `raum_id` steht bei JEDEM Ordner, auch bei Ebene 2: dort ist es der Raum des
-- Elternordners. Ohne das braeuchte jede Einladung erst eine zweite Abfrage.
CREATE TABLE IF NOT EXISTS public.firmenordner_ordner (
  id                  BIGSERIAL   PRIMARY KEY,
  -- Der Name auf der Platte und im Dienst. Kleinbuchstaben, Ziffern,
  -- Bindestrich: er wird zum Ordnernamen im Dateisystem des Geraets und zum
  -- Pfad, den ein Klient anlegt -- ein Leerzeichen oder ein Umlaut darin waere
  -- auf jedem zweiten Rechner ein anderer Name.
  kennung             TEXT        NOT NULL CHECK (kennung ~ '^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$'),
  -- Wie er dem Menschen heisst. Darf alles sein.
  name                TEXT        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  ebene               SMALLINT    NOT NULL CHECK (ebene IN (1, 2)),
  -- NULL auf Ebene 1, der Elternordner auf Ebene 2. Die Zeile darunter haelt
  -- fest, dass beides zusammenpasst.
  eltern_id           BIGINT      REFERENCES public.firmenordner_ordner(id) ON DELETE CASCADE,
  art                 TEXT        NOT NULL DEFAULT 'geteilt'
                                  CHECK (art IN ('geteilt', 'am_geraet')),
  -- Die Kennung des Raums im Dienst. NULL, solange der Dienst ihn noch nicht
  -- kennt (angelegt, waehrend der Container stand).
  raum_id             TEXT,
  -- Der Weg im Raum, mit `/` getrennt, ohne fuehrenden Schraegstrich. Leer auf
  -- Ebene 1 (der Raum IST der Ordner), auf Ebene 2 die Kennung.
  pfad                TEXT        NOT NULL DEFAULT '',
  angelegt_am         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  angelegt_von        BIGINT      REFERENCES public.admin_users(id) ON DELETE SET NULL,
  -- Zwei Ordner gleichen Namens unter demselben Elternteil waeren zwei Ordner,
  -- die dasselbe Verzeichnis meinen. `eltern_id` ist auf Ebene 1 NULL, und
  -- NULL ist in einem UNIQUE nicht gleich NULL -- deshalb steht der
  -- Eindeutigkeitsindex fuer Ebene 1 getrennt darunter.
  UNIQUE (eltern_id, kennung),
  -- Ein Ordner der Ebene 1 hat keinen Elternteil, einer der Ebene 2 hat einen.
  -- Ohne diese Zeile waere ein Ordner der Ebene 2 ohne Elternteil moeglich --
  -- ein Ordner ohne Raum, also einer, den es im Dienst nicht geben kann.
  CHECK ((ebene = 1 AND eltern_id IS NULL) OR (ebene = 2 AND eltern_id IS NOT NULL)),
  -- „Am Geraet" ist eine Aussage ueber einen ganzen Raum, nicht ueber einen
  -- Ordner darin: ein Unterordner eines geteilten Raums laesst sich nicht
  -- verbergen (Messung vom 21.09.2026).
  CHECK (art = 'geteilt' OR ebene = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_firmenordner_ordner_wurzel
  ON public.firmenordner_ordner(kennung) WHERE eltern_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_firmenordner_ordner_eltern
  ON public.firmenordner_ordner(eltern_id);

COMMENT ON TABLE public.firmenordner_ordner IS
  'Die Ordner des Firmenordners auf zwei Ebenen. Ebene 1 ist im Dienst ein Raum, Ebene 2 ein Ordner darin; art=am_geraet ist ein Raum ohne Mitglieder, den nur Flows am Geraet lesen (J33)';
COMMENT ON COLUMN public.firmenordner_ordner.art IS
  'geteilt: Menschen bekommen Rechte darauf. am_geraet: nie abgeglichen, kein Mitglied, nur am Geraet lesbar';
COMMENT ON COLUMN public.firmenordner_ordner.raum_id IS
  'Die Kennung des Raums im Dienst; auf Ebene 2 die des Elternraums. NULL, solange der Dienst ihn nicht kennt';

-- ---------------------------------------------------------------------------
-- 3. Die Rechte
-- ---------------------------------------------------------------------------
-- ZWEI STUFEN, `lesen` und `schreiben`, und keine dritte namens „keine".
-- „Keine" ist die Abwesenheit einer Zeile. Eine Zeile, die ein Recht WEGNIMMT,
-- gibt es hier mit Absicht nicht: der Ueberordner hat am 21.09.2026 festgelegt,
-- dass Rechte nur vergeben und nie unterhalb entzogen werden -- und der
-- gewaehlte Dienst kann es ohnehin nicht (gemessen).
--
-- WAS DARAUS FOLGT, und die Schnittstelle setzt es durch: wer auf Ebene 1
-- `schreiben` hat, hat es auf allem darunter. Eine Zeile, die demselben
-- Menschen auf einem Kind WENIGER gibt, ist deshalb kein gueltiger Zustand,
-- sondern eine Bitte, die der Dienst nicht erfuellen kann; sie wird abgewiesen,
-- statt angenommen und stillschweigend ignoriert.
CREATE TABLE IF NOT EXISTS public.firmenordner_rechte (
  ordner_id           BIGINT      NOT NULL REFERENCES public.firmenordner_ordner(id) ON DELETE CASCADE,
  user_id             BIGINT      NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  recht               TEXT        NOT NULL CHECK (recht IN ('lesen', 'schreiben')),
  erteilt_am          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  erteilt_von         BIGINT      REFERENCES public.admin_users(id) ON DELETE SET NULL,
  -- Hat der Dienst die Einladung schon? Dieselbe Ehrlichkeit wie oben.
  abgleich_offen      TEXT,
  PRIMARY KEY (ordner_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_firmenordner_rechte_user
  ON public.firmenordner_rechte(user_id);

COMMENT ON TABLE public.firmenordner_rechte IS
  'Ein Recht je Ordner und Person: lesen oder schreiben. Keine Zeile heisst keine Rechte, und der Ordner ist dann fuer diesen Menschen unsichtbar (J33)';
COMMENT ON COLUMN public.firmenordner_rechte.abgleich_offen IS
  'Was der Dienst noch nicht erfahren hat, als Satz. NULL, wenn die Einladung steht';
