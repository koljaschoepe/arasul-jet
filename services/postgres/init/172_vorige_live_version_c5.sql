-- 172_vorige_live_version_c5.sql — Woher ein Stand kam
-- (Phase C5 des Ueberordner-Plans vom 26.08.2026)
--
-- C5 bringt den Schalter: der Deploy rollt eine Version in den Teststand, ein
-- Mensch schaltet sie live -- und wenn sie sich als falsch erweist, schaltet er
-- ZURUECK auf die Version, die vorher live war. Dafuer muss das Geraet wissen,
-- welche das war.
--
-- Eine Spalte und keine Tabelle mit Verlauf. Der Schalter kennt genau eine
-- Frage ("was war vorher"), und eine Liste aller je live gewesenen Versionen
-- waere eine zweite Antwort auf eine Frage, die niemand stellt: was AM GERAET
-- LIEGT, sagt `appManifest.listeVersionen` aus den Ordnern, und wer wann
-- geschaltet hat, steht im Sicherheitsprotokoll (`security_events`).
--
-- Sie haengt an `app_staende` und nicht an `apps`, obwohl praktisch nur der
-- Livestand sie braucht: `spieleEin` schreibt sie fuer JEDEN Stand mit
-- derselben Zeile, und eine Spalte, die nur fuer einen von zwei Werten von
-- `stand` gilt, waere eine Regel, an die sich der naechste Aufruf halten muss,
-- ohne dass die Tabelle sie durchsetzt.
--
-- NULL heisst: dieser Stand hatte noch keine andere Version. Zurueckschalten
-- ist dann kein Fehler des Aufrufers, sondern eine Antwort -- es gibt nichts,
-- wohin.
ALTER TABLE public.app_staende
  ADD COLUMN IF NOT EXISTS vorige_version TEXT;

COMMENT ON COLUMN public.app_staende.vorige_version IS
  'Die Version, die in diesem Stand vor der jetzigen lief; NULL, wenn es keine gab. Seit 172';
