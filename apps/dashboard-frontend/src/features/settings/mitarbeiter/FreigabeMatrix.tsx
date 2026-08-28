/**
 * Die Freigabe-Matrix: Menschen mal Apps (Phase D3).
 *
 * Eine Zeile je Mensch, eine Spalte je App, in der Zelle ein Häkchen. Das ist
 * die Form, in der die Frage tatsächlich gestellt wird („wer darf was?"), und
 * sie beantwortet zwei Richtungen auf einmal: eine Zeile sagt, was ein Mensch
 * sieht, eine Spalte, wer eine App benutzt. Eine Liste je App hätte nur die
 * eine Richtung.
 *
 * ALLE BENUTZER, nicht nur die Mitarbeiter. Eine Freigabe geht an jeden
 * Benutzer (Entscheidung aus C2: die Rolle sagt, wer verwaltet, nicht wer
 * arbeitet). Ein Administrator, der eine App benutzen will, braucht sie
 * genauso freigegeben, und `GET /api/apps/meine` zeigt auch ihm nur, was
 * freigegeben ist. Eine Matrix ohne die Administrator-Zeilen hätte genau diesen
 * Weg nicht.
 */
import { AppWindow } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import { Checkbox } from '@/components/ui/Checkbox';
import { SkeletonText } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import type { Benutzer } from './useMitarbeiter';
import { useAlleApps, useFreigaben, useFreigabeSetzen, freigabeVon } from './useAppFreigaben';

export function FreigabeMatrix({ benutzer }: { benutzer: Benutzer[] }) {
  const { data: apps, isLoading: appsLaden, isError: appsFehler } = useAlleApps();
  const { data: freigaben, isLoading: freigabenLaden, isError: freigabenFehler } = useFreigaben();
  const setzen = useFreigabeSetzen();

  if (appsLaden || freigabenLaden) {
    return <SkeletonText lines={4} />;
  }

  // Ein Fehler ist kein Leerzustand. „Keine App" und „ich konnte nicht fragen"
  // sehen sonst gleich aus, und im zweiten Fall würde der Administrator eine
  // App suchen, die längst da ist.
  if (appsFehler || freigabenFehler) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="matrix-fehler">
        Die Freigaben ließen sich nicht laden.
      </p>
    );
  }

  const alleApps = apps ?? [];
  const alleFreigaben = freigaben ?? [];

  if (alleApps.length === 0) {
    return (
      <EmptyState
        icon={<AppWindow />}
        title="Noch keine App am Gerät"
        description="Apps kommen vom Partner, der sie mit dem Ara-Kit gebaut und auf das Gerät gerollt hat. Sobald eine da ist, steht sie hier als Spalte."
      />
    );
  }

  return (
    <div className="overflow-x-auto" data-testid="freigabe-matrix">
      <table className="w-full min-w-fit border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="p-2 text-left font-medium text-muted-foreground">
              Mensch
            </th>
            {alleApps.map(app => (
              <th
                key={app.id}
                scope="col"
                className="p-2 text-center font-medium text-foreground"
                title={app.beschreibung || app.name}
              >
                {app.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {benutzer.map(b => (
            <tr key={String(b.id)} className="border-b border-border last:border-b-0">
              <th scope="row" className="p-2 text-left font-normal">
                <span className="text-foreground">{b.username}</span>
                {b.role === 'admin' && (
                  <span className="ml-2 text-ui-xs text-muted-foreground">Admin</span>
                )}
              </th>
              {alleApps.map(app => {
                const freigabe = freigabeVon(alleFreigaben, app.id, b.id);
                // Die Kennung der Zelle traegt den NAMEN und nicht die
                // Nummer: die Abnahme kennt den Namen, den sie gerade angelegt
                // hat, und die Nummer erst nach einer zweiten Abfrage. Beide
                // sind eindeutig (`admin_users.username` ist UNIQUE).
                const zelle = `${app.id}-${b.username}`;
                return (
                  <td key={app.id} className="p-2 text-center align-middle">
                    {/* Die Kennung sitzt am Wrapper und nicht am Häkchen:
                        `Checkbox` reicht keine losen Attribute durch. Der Klick
                        der Abnahme trifft den `input` darin. */}
                    <span
                      className="inline-flex flex-col items-center gap-1"
                      data-testid={`freigabe-${zelle}`}
                    >
                      <Checkbox
                        checked={Boolean(freigabe)}
                        disabled={setzen.isPending}
                        aria-label={`${app.name} für ${b.username} freigeben`}
                        onCheckedChange={an =>
                          setzen.mutate({
                            appId: app.id,
                            benutzerId: b.id,
                            stand: an ? 'live' : null,
                          })
                        }
                      />
                      {/* Der Teststand-Schalter erscheint erst, wenn überhaupt
                          freigegeben ist. Ohne ihn machte ein Klick auf ein
                          gesetztes Häkchen aus einem Tester still einen
                          gewöhnlichen Nutzer, weil der POST immer `live`
                          schickte. */}
                      {freigabe && (
                        <button
                          type="button"
                          disabled={setzen.isPending}
                          data-testid={`freigabe-stand-${zelle}`}
                          title={
                            freigabe.stand === 'test'
                              ? 'Tester: sieht zusätzlich den Teststand. Klicken für nur Livestand.'
                              : 'Sieht den Livestand. Klicken, um ihn zum Tester zu machen.'
                          }
                          onClick={() =>
                            setzen.mutate({
                              appId: app.id,
                              benutzerId: b.id,
                              stand: freigabe.stand === 'test' ? 'live' : 'test',
                            })
                          }
                          className={cn(
                            'rounded px-1.5 py-0.5 text-ui-xs transition-colors hover:bg-accent',
                            freigabe.stand === 'test'
                              ? 'bg-warning/15 font-medium text-warning'
                              : 'text-muted-foreground'
                          )}
                        >
                          {freigabe.stand === 'test' ? 'Test' : 'Live'}
                        </button>
                      )}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
