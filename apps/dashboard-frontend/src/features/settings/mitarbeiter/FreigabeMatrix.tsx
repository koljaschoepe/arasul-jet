/**
 * Die Freigabe-Matrix: Menschen mal Apps (Phase D3).
 *
 * Eine Zeile je Mensch, eine Spalte je App, in der Zelle ein Häkchen. Das ist
 * die Form, in der die Frage tatsächlich gestellt wird („wer darf was?"), und
 * sie beantwortet zwei Richtungen auf einmal: eine Zeile sagt, was ein Mensch
 * sieht, eine Spalte, wer eine App benutzt. Eine Liste je App hätte nur die
 * eine Richtung.
 *
 * BEI 390 PX IST EINE MATRIX KEINE (Phase D5, Fund der D4-Abnahme). Sechs
 * Spalten mal zehn Zeilen brauchen Breite, die ein Telefon nicht hat; was
 * blieb, war ein Kasten, in dem man waagerecht sucht. Unter 900 px steht
 * deshalb dieselbe Auskunft als Liste: eine Gruppe je App, darin die Menschen.
 * Die Richtung „wer darf was" bleibt lesbar, nur eben untereinander. Die
 * Grenze ist dieselbe, unter der die Shell ihre dritte Spalte einklappt
 * (`useSchmalesFenster`).
 *
 * Nur eine der beiden Formen steht im Dokument: die Kennungen
 * (`freigabe-<app>-<name>`) wären sonst doppelt da, und ein Klick träfe die
 * unsichtbare Hälfte.
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
import { Checkbox, cn } from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useSchmalesFenster } from '@/hooks/useSchmalesFenster';
import type { Benutzer } from './useMitarbeiter';
import {
  useAlleApps,
  useFreigaben,
  useFreigabeSetzen,
  freigabeVon,
  type AppZeile,
  type Freigabe,
  type Stand,
} from './useAppFreigaben';

/** Eine Zelle der Matrix: das Häkchen und, wenn freigegeben, der Stand. */
function Zelle({
  app,
  b,
  freigabe,
  laeuft,
  setzen,
}: {
  app: AppZeile;
  b: Benutzer;
  freigabe: Freigabe | undefined;
  laeuft: boolean;
  setzen: (stand: Stand | null) => void;
}) {
  const zelle = `${app.id}-${b.username}`;
  return (
    // Die Kennung sitzt am Wrapper und nicht am Häkchen: `Checkbox` reicht
    // keine losen Attribute durch. Der Klick der Abnahme trifft den `input`
    // darin.
    <span className="inline-flex items-center gap-2" data-testid={`freigabe-${zelle}`}>
      <Checkbox
        checked={Boolean(freigabe)}
        disabled={laeuft}
        aria-label={`${app.name} für ${b.username} freigeben`}
        onCheckedChange={an => setzen(an ? 'live' : null)}
      />
      {/* Der Teststand-Schalter erscheint erst, wenn überhaupt freigegeben
          ist. Ohne ihn machte ein Klick auf ein gesetztes Häkchen aus einem
          Tester still einen gewöhnlichen Nutzer, weil der POST immer `live`
          schickte. */}
      {freigabe && (
        <button
          type="button"
          disabled={laeuft}
          data-testid={`freigabe-stand-${zelle}`}
          title={
            freigabe.stand === 'test'
              ? 'Tester: sieht zusätzlich den Teststand. Klicken für nur Livestand.'
              : 'Sieht den Livestand. Klicken, um ihn zum Tester zu machen.'
          }
          onClick={() => setzen(freigabe.stand === 'test' ? 'live' : 'test')}
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
  );
}

export function FreigabeMatrix({ benutzer }: { benutzer: Benutzer[] }) {
  const schmal = useSchmalesFenster();
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

  const setze = (appId: string, benutzerId: Benutzer['id'], stand: Stand | null) =>
    setzen.mutate({ appId, benutzerId, stand });

  if (schmal) {
    return (
      <div className="flex flex-col gap-ui-3" data-testid="freigabe-matrix">
        {alleApps.map(app => (
          <section key={app.id} className="rounded-md border border-border">
            <h3 className="border-b border-border p-ui-3 text-sm font-semibold text-foreground">
              {app.name}
            </h3>
            <ul>
              {benutzer.map(b => (
                <li
                  key={String(b.id)}
                  className="flex flex-wrap items-center gap-3 border-b border-border p-ui-3 last:border-b-0"
                >
                  <Zelle
                    app={app}
                    b={b}
                    freigabe={freigabeVon(alleFreigaben, app.id, b.id)}
                    laeuft={setzen.isPending}
                    setzen={stand => setze(app.id, b.id, stand)}
                  />
                  <span className="min-w-0 flex-1 text-sm text-foreground">
                    {b.username}
                    {b.role === 'admin' && (
                      <span className="ml-2 text-ui-xs text-muted-foreground">Admin</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
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
              {alleApps.map(app => (
                // Die Kennung der Zelle traegt den NAMEN und nicht die Nummer:
                // die Abnahme kennt den Namen, den sie gerade angelegt hat, und
                // die Nummer erst nach einer zweiten Abfrage. Beide sind
                // eindeutig (`admin_users.username` ist UNIQUE).
                <td key={app.id} className="p-2 text-center align-middle">
                  <Zelle
                    app={app}
                    b={b}
                    freigabe={freigabeVon(alleFreigaben, app.id, b.id)}
                    laeuft={setzen.isPending}
                    setzen={stand => setze(app.id, b.id, stand)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
