-- 155_chat_namen.sql — Plan 023 E5: der Chat heisst nach dem, was darin getan wurde.
--
-- Bis hierher war der Titel die erste Zeile der ersten Frage. Bei zehn Chats
-- aus zehn Auftraegen stehen dann zehn Fragen untereinander, und wer
-- zurueckspringen will, sucht nach dem, was herauskam, nicht nach dem, was er
-- gefragt hat.
--
-- Zwei Spalten, mehr braucht es nicht:
--
--   titel_bei_nachrichten  bei welchem Stand der Titel entstand. Daraus folgt,
--                          wann er veraltet ist, ohne eine Uhr und ohne eine
--                          zweite Tabelle. Umbenannt wird, wenn sich die Zahl
--                          der Nachrichten seitdem verdoppelt hat.
--   titel_quelle           'vorgabe' | 'frage' | 'lauf'. Ein von Hand
--                          vergebener Titel traegt NULL und wird nie
--                          ueberschrieben, das ist der Sinn dieser Spalte.
--
-- `chat_conversations` liegt in `public` (siehe services/postgres/CLAUDE.md).

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS titel_bei_nachrichten INTEGER;
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS titel_quelle VARCHAR(20);

COMMENT ON COLUMN public.chat_conversations.titel_bei_nachrichten IS
  'Zahl der Nachrichten, als der Titel entstand. Verdoppelt sie sich, ist der Titel faellig.';
COMMENT ON COLUMN public.chat_conversations.titel_quelle IS
  'vorgabe | frage | lauf. NULL bedeutet: von Hand vergeben, nie ueberschreiben.';

-- Bestandschats: ihr Titel kommt aus der ersten Frage, das ist der Stand vor
-- dieser Migration. Ohne diese Zeile hielte der Code sie fuer handvergeben und
-- wuerde sie nie verbessern.
UPDATE public.chat_conversations
   SET titel_quelle = CASE WHEN title IN ('Neuer Chat', 'New Chat') THEN 'vorgabe' ELSE 'frage' END,
       titel_bei_nachrichten = GREATEST(message_count, 1)
 WHERE titel_quelle IS NULL;
