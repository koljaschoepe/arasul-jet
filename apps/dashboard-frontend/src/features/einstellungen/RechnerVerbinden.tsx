/**
 * Die Anleitung, einen Rechner mit dem Firmenordner zu verbinden (M5,
 * Verwaltung Firmenordner). Sie steht im Gerät, in den Einstellungen unter
 * „Angemeldete Rechner", und nur dort: jede Person verbindet ihren eigenen
 * Rechner, auch der Administrator, und die Liste darunter zeigt das Ergebnis.
 *
 * Genau ein Befehl zum Kopieren: `node arasul.mjs login <Adresse> --user
 * <E-Mail>` (Brücke des Ara-Kits, `ara-kit/.ara/templates/root/arasul.mjs`).
 * Die Adresse ist die, unter der diese Seite das Gerät erreicht hat; das
 * Passwort fragt der Befehl selbst und zeigt es nie. Er stellt dem Rechner
 * einen Ausweis aus, der danach in der Liste steht.
 */
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@marken';
import { useAuth } from '@/contexts/AuthContext';

/** Der Befehl für diese Person an diesem Gerät. */
export function verbindenBefehl(adresse: string, person: string): string {
  return `node arasul.mjs login ${adresse} --user ${person}`;
}

export function RechnerVerbinden() {
  const { user } = useAuth();
  const [kopiert, setKopiert] = useState(false);
  const person =
    typeof user?.email === 'string' && user.email ? user.email : (user?.username ?? '');
  const befehl = verbindenBefehl(window.location.origin, person);

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(befehl);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    } catch {
      // Ohne Zugriff auf die Zwischenablage bleibt der Befehl markierbar.
    }
  };

  return (
    <div className="flex flex-col gap-ui-3 text-sm" data-testid="rechner-verbinden">
      <p className="text-muted-foreground">
        So verbinden Sie einen Rechner mit dem Firmenordner: Legen Sie die Datei „arasul.mjs“ in
        einen leeren Ordner, öffnen Sie dort ein Terminal und geben Sie diesen Befehl ein. Ihr
        Passwort fragt er selbst.
      </p>
      <div className="flex items-start gap-ui-3 rounded-md border border-border p-ui-3">
        <code
          className="min-w-0 flex-1 font-mono text-xs break-all select-all"
          data-testid="rechner-verbinden-befehl"
        >
          {befehl}
        </code>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void kopieren()}
          data-testid="rechner-verbinden-kopieren"
        >
          {kopiert ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
          {kopiert ? 'Kopiert' : 'Kopieren'}
        </Button>
      </div>
    </div>
  );
}
