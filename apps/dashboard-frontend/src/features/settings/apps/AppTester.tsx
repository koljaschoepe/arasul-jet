/**
 * Wer diese App sieht — und wer davon Tester ist (Phase D4).
 *
 * DIESELBE ENTSCHEIDUNG WIE IN DER MATRIX AUS D3, aus der anderen Richtung
 * gelesen. Die Matrix beantwortet „wer darf was" für das ganze Gerät; hier
 * steht die Spalte EINER App, und die Frage lautet „wer probiert die neue
 * Fassung aus, bevor sie live geht". Beide schreiben über dieselben Wege
 * (`POST /api/freigaben`, `DELETE /api/freigaben/:appId/:benutzerId`) und über
 * dieselben Hooks — es gibt keine zweite Buchführung, nur eine zweite Sicht.
 *
 * Der Tester-Kreis ist `app_members.stand` aus C3: `live` sieht den Livestand,
 * `test` sieht zusätzlich den Teststand. Er ist keine Rolle: ein Administrator
 * kann Tester sein, ein Mitarbeiter auch. Deshalb steht hier jeder Mensch am
 * Gerät und nicht nur die Mitarbeiter.
 */
import { Checkbox, cn } from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useBenutzer } from '../mitarbeiter/useMitarbeiter';
import { freigabeVon, useFreigaben, useFreigabeSetzen } from '../mitarbeiter/useAppFreigaben';

export function AppTester({ appId, hatTeststand }: { appId: string; hatTeststand: boolean }) {
  const { data: benutzer, isLoading: menschenLaden, isError: menschenFehler } = useBenutzer();
  const { data: freigaben, isLoading: freigabenLaden, isError: freigabenFehler } = useFreigaben();
  const setzen = useFreigabeSetzen();

  if (menschenLaden || freigabenLaden) {
    return <SkeletonText lines={3} />;
  }
  // Ein Fehler ist kein Leerzustand: „niemand freigegeben" und „ich konnte
  // nicht fragen" sehen sonst gleich aus, und im zweiten Fall gäbe jemand eine
  // App frei, die längst freigegeben ist.
  if (menschenFehler || freigabenFehler) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="tester-fehler">
        Die Freigaben ließen sich nicht laden.
      </p>
    );
  }

  const liste = benutzer ?? [];
  const alle = freigaben ?? [];

  return (
    <ul className="flex flex-col rounded-md border border-border" data-testid="tester-liste">
      {liste.map(b => {
        const freigabe = freigabeVon(alle, appId, b.id);
        const zelle = `${appId}-${b.username}`;
        return (
          <li
            key={String(b.id)}
            className="flex flex-wrap items-center gap-3 border-b border-border p-ui-3 last:border-b-0"
          >
            <Checkbox
              checked={Boolean(freigabe)}
              disabled={setzen.isPending}
              aria-label={`${b.username} darf diese App benutzen`}
              data-testid={`tester-frei-${zelle}`}
              onCheckedChange={an =>
                setzen.mutate({ appId, benutzerId: b.id, stand: an ? 'live' : null })
              }
            />
            <span className="min-w-0 flex-1">
              <span className="text-sm text-foreground">{b.username}</span>
              {b.role === 'admin' && (
                <span className="ml-2 text-ui-xs text-muted-foreground">Admin</span>
              )}
              {!b.is_active && (
                <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-ui-xs text-warning">
                  stillgelegt
                </span>
              )}
            </span>

            {/* Der Tester-Schalter erscheint erst, WENN freigegeben ist —
                sonst machte ein Klick aus einem Nichtnutzer stillschweigend
                einen Tester. Ohne Teststand steht er nicht da, es gäbe nichts
                zu testen — es sei denn, jemand IST noch als Tester eingetragen
                (die App hatte einmal einen Teststand). Dann muss er zu sehen
                und zurückzunehmen sein; ein Zustand, den die Seite verbirgt,
                ist der, den niemand mehr aufräumt. */}
            {freigabe && (hatTeststand || freigabe.stand === 'test') && (
              <button
                type="button"
                disabled={setzen.isPending}
                data-testid={`tester-stand-${zelle}`}
                title={
                  freigabe.stand === 'test'
                    ? 'Tester: sieht zusätzlich den Teststand. Klicken für nur Livestand.'
                    : 'Sieht den Livestand. Klicken, um ihn zum Tester zu machen.'
                }
                onClick={() =>
                  setzen.mutate({
                    appId,
                    benutzerId: b.id,
                    stand: freigabe.stand === 'test' ? 'live' : 'test',
                  })
                }
                className={cn(
                  'rounded px-2 py-1 text-ui-xs transition-colors hover:bg-accent',
                  freigabe.stand === 'test'
                    ? 'bg-warning/15 font-medium text-warning'
                    : 'text-muted-foreground'
                )}
              >
                {freigabe.stand === 'test' ? 'Tester' : 'nur Livestand'}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
