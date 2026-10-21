/**
 * Das Terminal (Karte terminal-im-frontend, M5, 21.10.2026).
 *
 * Ein Entwickler öffnet hier eine Shell am Gerät, als SEIN eigener
 * Linux-Nutzer (`ara-<id>`) in seinem eigenen Ordner, und startet darin
 * Claude Code mit seinem eigenen Konto. Die Shell ist ttyd hinter
 * `/terminal/`, im iframe wie eine App (`features/apps/AppRahmen.tsx`), und aus
 * demselben Grund ohne `sandbox`: die Tür vor ttyd (Forward-Auth,
 * `GET /api/terminal/tor`) hängt am Sitzungscookie.
 *
 * WER DARF, ENTSCHEIDET DAS BACKEND. Die Shell zeigt den Knopf nur der Rolle
 * Entwickler, und diese Seite sagt einen Satz, wenn das Gerät kein Terminal
 * fährt. Wer beides umgeht, steht vor der Tür und bekommt 403.
 *
 * DAS TERMINAL BLEIBT OFFEN, AUCH WENN MAN WEGKLICKT. Ein neu geladener Rahmen
 * wäre eine neue ssh-Sitzung, und ein laufendes Claude Code wäre weg. Die
 * Shell hält den Rahmen deshalb verborgen am Leben (`AnsichtInhalt`), wie die
 * letzten Apps.
 */
import { SquareTerminal } from 'lucide-react';
import { Ladezustand, Leerzustand } from '@marken';
import { useTerminalLage } from './useTerminal';

/** Der Weg, unter dem ttyd hinter der Tür liegt (`compose/compose.terminal.yaml`). */
const TERMINAL_PFAD = '/terminal/';

export default function TerminalAnsicht() {
  const { data, isLoading, isError } = useTerminalLage();

  if (isLoading) {
    return <Ladezustand meldung="Das Terminal wird geöffnet …" />;
  }
  if (isError || !data) {
    return (
      <Leerzustand
        symbol={<SquareTerminal />}
        titel="Das Terminal ließ sich nicht öffnen"
        beschreibung="Laden Sie die Seite neu. Bleibt es so, sprechen Sie Ihren Betreuer an."
      />
    );
  }
  if (!data.entwickler) {
    return (
      <Leerzustand
        symbol={<SquareTerminal />}
        titel="Das Terminal ist für Entwickler"
        beschreibung="Die Verwaltung schaltet es je Person frei, unter Personen."
      />
    );
  }
  if (!data.an) {
    return (
      <Leerzustand
        symbol={<SquareTerminal />}
        titel="Auf diesem Gerät ist das Terminal nicht eingeschaltet"
        beschreibung="Ihr Betreuer schaltet es ein; danach steht hier Ihre Shell."
      />
    );
  }
  return (
    <iframe
      src={TERMINAL_PFAD}
      title={`Terminal (${data.linuxNutzer ?? ''})`}
      className="h-full w-full border-0 bg-background"
      data-testid="terminal-rahmen"
    />
  );
}
