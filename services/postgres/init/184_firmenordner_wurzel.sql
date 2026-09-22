-- 184_firmenordner_wurzel.sql — Die Wurzel des Firmenordners (22.09.2026, J33,
-- Auftrag firmenordner-rechte-im-frontend)
--
-- WAS ES IST. Das Zielbild (company/plattform.md) hat eine Ebene 0 ueber den
-- zwei Ebenen aus Migration 183: `firma/`, die Wurzel -- alle lesen sie, nur
-- der Administrator schreibt. Darin liegen die Regeln, Skills und Agents der
-- Firma, die Liste der fremden Orte und die je Mitarbeiter erzeugte
-- `sicht.md`. Im Dateidienst hat die Ebene 0 keinen Platz: OpenCloud kennt
-- nur Raeume, und ueber einem Raum liegt nichts. Die Wurzel ist deshalb ein
-- EIGENER Raum mit der Art `wurzel`, den das CLI der Wurzel am Rechner des
-- Menschen OBEN in den lokalen Baum legt und nicht in einen Unterordner.
--
-- GENAU EINE JE GERAET. Zwei Wurzeln waeren zwei Orte, an denen „die Regeln
-- der Firma" liegen, und das CLI muesste raten. Der partielle Eindeutigkeits-
-- index unten haelt das fest, nicht die Anwendung allein.
--
-- KEINE RECHTE-ZEILE. Wer die Wurzel liest, steht nicht in
-- `firmenordner_rechte`: jeder aktive Mensch am Geraet liest sie, jeder
-- Administrator schreibt sie -- das folgt aus `admin_users.role`, und eine
-- zweite Tabelle dafuer waere eine Kopie, die auseinanderlaeuft. Die Rolle im
-- Dienst setzt das Geraet beim Spiegeln eines Menschen und beim Abgleich.
--
-- WARUM DIE CHECKS NEU GESCHRIEBEN WERDEN. Migration 183 hat `ebene IN (1, 2)`
-- und `art IN ('geteilt', 'am_geraet')` als namenlose CHECKs angelegt;
-- Postgres hat ihnen Namen gegeben (`firmenordner_ordner_ebene_check`,
-- `_art_check`, `_check`, `_check1` -- am Orin am 22.09.2026 nachgesehen).
-- Sie fallen hier ueber ihren Namen und kommen BENANNT zurueck, damit die
-- naechste Migration, die daran etwas aendert, nicht wieder raten muss.
--
-- Rollback (down):
--   DROP INDEX IF EXISTS public.idx_firmenordner_ordner_wurzel;
--   DELETE FROM public.firmenordner_ordner WHERE art = 'wurzel';
--   ALTER TABLE public.firmenordner_ordner
--     DROP CONSTRAINT IF EXISTS firmenordner_ordner_ebene_chk,
--     DROP CONSTRAINT IF EXISTS firmenordner_ordner_art_chk,
--     DROP CONSTRAINT IF EXISTS firmenordner_ordner_ebene_eltern_chk,
--     ADD CONSTRAINT firmenordner_ordner_ebene_check CHECK (ebene IN (1, 2)),
--     ADD CONSTRAINT firmenordner_ordner_art_check CHECK (art IN ('geteilt', 'am_geraet')),
--     ADD CONSTRAINT firmenordner_ordner_check
--       CHECK ((ebene = 1 AND eltern_id IS NULL) OR (ebene = 2 AND eltern_id IS NOT NULL)),
--     ADD CONSTRAINT firmenordner_ordner_check1 CHECK (art = 'geteilt' OR ebene = 1);

-- 1. Die alten, namenlos angelegten CHECKs fallen -- ueber die Namen, die
--    Postgres ihnen gegeben hat. `IF EXISTS`, damit die Migration auf einem
--    Geraet, das sie schon hat, nichts wirft.
ALTER TABLE public.firmenordner_ordner
  DROP CONSTRAINT IF EXISTS firmenordner_ordner_ebene_check,
  DROP CONSTRAINT IF EXISTS firmenordner_ordner_art_check,
  DROP CONSTRAINT IF EXISTS firmenordner_ordner_check,
  DROP CONSTRAINT IF EXISTS firmenordner_ordner_check1;

-- 2. Die neuen, benannt. `ADD CONSTRAINT` kennt kein `IF NOT EXISTS`, also
--    fragt ein Block vorher nach.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.firmenordner_ordner'::regclass
       AND conname = 'firmenordner_ordner_ebene_chk'
  ) THEN
    ALTER TABLE public.firmenordner_ordner
      ADD CONSTRAINT firmenordner_ordner_ebene_chk CHECK (ebene IN (0, 1, 2));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.firmenordner_ordner'::regclass
       AND conname = 'firmenordner_ordner_art_chk'
  ) THEN
    ALTER TABLE public.firmenordner_ordner
      ADD CONSTRAINT firmenordner_ordner_art_chk
      CHECK (art IN ('wurzel', 'geteilt', 'am_geraet'));
  END IF;

  -- Ebene, Elternteil und Art passen zusammen, und zwar in genau drei Formen:
  --   Ebene 0  kein Elternteil  art = wurzel      (der eine Raum ueber allem)
  --   Ebene 1  kein Elternteil  geteilt|am_geraet (ein Raum)
  --   Ebene 2  ein Elternteil   geteilt           (ein Ordner in einem Raum)
  -- „Am Geraet" bleibt eine Aussage ueber einen ganzen Raum (183), und eine
  -- Wurzel mit Elternteil oder ein Kind unter der Wurzel gibt es nicht: unter
  -- der Wurzel liegen die Raeume der Ebene 1, und die stehen fuer sich.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.firmenordner_ordner'::regclass
       AND conname = 'firmenordner_ordner_ebene_eltern_chk'
  ) THEN
    ALTER TABLE public.firmenordner_ordner
      ADD CONSTRAINT firmenordner_ordner_ebene_eltern_chk CHECK (
        (ebene = 0 AND eltern_id IS NULL AND art = 'wurzel')
        OR (ebene = 1 AND eltern_id IS NULL AND art IN ('geteilt', 'am_geraet'))
        OR (ebene = 2 AND eltern_id IS NOT NULL AND art = 'geteilt')
      );
  END IF;
END $$;

-- 3. Genau eine Wurzel. Ein Index ueber einer Konstanten, eingeschraenkt auf
--    die Art: die zweite Zeile mit `art = 'wurzel'` scheitert an ihm.
CREATE UNIQUE INDEX IF NOT EXISTS idx_firmenordner_ordner_wurzel
  ON public.firmenordner_ordner ((true)) WHERE art = 'wurzel';

COMMENT ON COLUMN public.firmenordner_ordner.art IS
  'wurzel: die eine Ebene 0, jeder aktive Mensch liest, Administratoren schreiben, keine Rechte-Zeile. geteilt: Menschen bekommen Rechte darauf. am_geraet: nie abgeglichen, kein Mitglied, nur am Geraet lesbar';
COMMENT ON COLUMN public.firmenordner_ordner.ebene IS
  '0 ist die Wurzel (genau eine), 1 ein Bereich (ein Raum im Dienst), 2 ein Projekt darin (ein Ordner im Raum)';
