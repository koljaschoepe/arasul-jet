/**
 * Das Symbol einer App in der Leiste (J51, M7, Karte palette-symbol-und-demo).
 *
 * Seit J51 verlangt der Standard beim Ausrollen `symbol` in `app.json`. Apps,
 * die schon laufen, bleiben unberührt, und viele davon nennen keines: die
 * Leiste zeichnete sie alle mit demselben Fenster. Hier gibt der
 * Administrator einer solchen App ein Symbol. Es gilt, bis die App selbst
 * eines mitbringt; bringt sie eines mit, steht hier nur, welches.
 *
 * Eine kleine Auswahl statt eines Suchfelds über tausend Namen: wer eine
 * Belege-App bebildert, sucht nicht nach `receipt`, er sieht es.
 */
import { Button, cn } from '@marken';
import { AppSymbol } from '@/components/AppSymbol';
import { useToast } from '@/contexts/ToastContext';
import { fehlertext } from '@/utils/fehlertext';
import { useSymbolErsatz } from './useAppVerwaltung';

/** Die Auswahl: Dinge, mit denen ein Betrieb arbeitet. Lucide-Namen. */
export const SYMBOL_AUSWAHL: ReadonlyArray<{ name: string; bedeutung: string }> = [
  { name: 'receipt', bedeutung: 'Beleg' },
  { name: 'file-text', bedeutung: 'Dokument' },
  { name: 'folder-check', bedeutung: 'Abschluss' },
  { name: 'calculator', bedeutung: 'Rechnen' },
  { name: 'wallet', bedeutung: 'Geld' },
  { name: 'calendar-days', bedeutung: 'Kalender' },
  { name: 'plane', bedeutung: 'Urlaub' },
  { name: 'wrench', bedeutung: 'Wartung' },
  { name: 'truck', bedeutung: 'Lieferung' },
  { name: 'package', bedeutung: 'Lager' },
  { name: 'clipboard-list', bedeutung: 'Liste' },
  { name: 'users', bedeutung: 'Personen' },
  { name: 'handshake', bedeutung: 'Kunden' },
  { name: 'mail', bedeutung: 'Post' },
  { name: 'chart-column', bedeutung: 'Auswertung' },
  { name: 'flask-conical', bedeutung: 'Probe' },
  { name: 'gauge', bedeutung: 'Messung' },
  { name: 'shield-check', bedeutung: 'Prüfung' },
];

export function AppSymbolWahl({
  appId,
  name,
  mitgebracht,
  ersatz,
}: {
  appId: string;
  name: string;
  /** Das Symbol aus `app.json` (Live, sonst Test), oder null. */
  mitgebracht: string | null;
  /** Das Symbol, das der Administrator gewählt hat, oder null. */
  ersatz: string | null;
}) {
  const toast = useToast();
  const setzen = useSymbolErsatz(appId);

  if (mitgebracht) {
    return (
      <p
        className="flex items-center gap-2 text-sm text-foreground"
        data-testid="symbol-mitgebracht"
      >
        <span className="flex size-8 items-center justify-center rounded-md bg-primary/14 text-primary dark:bg-primary/28 dark:text-foreground">
          <AppSymbol symbol={mitgebracht} />
        </span>
        Die App bringt ihr Symbol selbst mit.
      </p>
    );
  }

  const waehle = (symbol: string | null) => {
    setzen.mutate(symbol, {
      onSuccess: () =>
        toast.success(
          symbol
            ? `${name} trägt jetzt dieses Symbol in der Leiste.`
            : `${name} zeigt wieder das neutrale Fenster.`
        ),
      onError: fehler => toast.error(fehlertext(fehler)),
    });
  };

  return (
    <div className="flex flex-col gap-3" data-testid="symbol-wahl">
      <div
        role="radiogroup"
        aria-label={`Symbol für ${name}`}
        className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1.5 sm:max-w-[420px]"
      >
        {SYMBOL_AUSWAHL.map(s => {
          const gewaehlt = ersatz === s.name;
          return (
            <button
              key={s.name}
              type="button"
              role="radio"
              aria-checked={gewaehlt}
              aria-label={s.bedeutung}
              title={s.bedeutung}
              disabled={setzen.isPending}
              onClick={() => waehle(s.name)}
              data-testid={`symbol-${s.name}`}
              className={cn(
                'flex size-[44px] items-center justify-center rounded-md border transition-colors duration-120 ease-out motion-reduce:transition-none',
                gewaehlt
                  ? 'border-primary bg-primary/14 text-primary dark:bg-primary/28 dark:text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <AppSymbol symbol={s.name} />
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground" data-testid="symbol-satz">
        {ersatz
          ? 'Gilt in der Leiste, bis die App mit einer neuen Fassung ein eigenes Symbol mitbringt.'
          : 'Diese App nennt kein Symbol und erscheint in der Leiste als Fenster. Wählen Sie eines.'}
      </p>
      {ersatz && (
        <div>
          <Button
            variant="outline"
            size="sm"
            disabled={setzen.isPending}
            onClick={() => waehle(null)}
            data-testid="symbol-zuruecknehmen"
          >
            Symbol zurücknehmen
          </Button>
        </div>
      )}
    </div>
  );
}
