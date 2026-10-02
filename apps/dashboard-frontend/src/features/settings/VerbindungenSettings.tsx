/**
 * Verbindungen: wohin die Apps und die Plattform ins Internet wollen (J38).
 *
 * Apps laufen in einem Netz ohne Internet. Was eine App braucht, nennt sie im
 * Manifest (`verbindungen`), und ein Ausgangs-Proxy lässt genau diese Namen
 * durch. Die Seite zeigt je App drei Dinge nebeneinander, damit ein
 * Administrator sie vergleichen kann:
 *
 *   - EINGETRAGEN: was die App fordert (und damit darf),
 *   - GENUTZT: was sie tatsächlich gerufen hat, mit Anzahl und letztem Mal,
 *   - ABGEWIESEN: was sie gerufen hat, ohne dass es eingetragen war — in Rot,
 *     denn dort versucht eine App etwas, das niemand erlaubt hat.
 *
 * Darunter die Plattform selbst: Flows mit einem externen Modell rufen den
 * Anbieter vom Backend aus, nicht durch den Proxy. Sie stehen trotzdem hier,
 * weil die Frage dieselbe ist: wohin schickt dieses Gerät Daten?
 */
import { Globe } from 'lucide-react';
import { Kopf } from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useVerbindungen, type AppVerbindungen, type Ziel } from './verbindungen/useVerbindungen';

function zeitpunkt(iso: string | null): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Zielliste({
  ziele,
  testid,
  rot = false,
}: {
  ziele: Ziel[];
  testid: string;
  rot?: boolean;
}) {
  if (ziele.length === 0) {
    return (
      <p className="text-ui-xs text-muted-foreground" data-testid={`${testid}-leer`}>
        keine
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1" data-testid={testid}>
      {ziele.map(z => (
        <li
          key={z.host}
          className={`flex flex-wrap items-baseline gap-x-2 text-sm ${rot ? 'text-destructive' : 'text-foreground'}`}
          data-testid={`${testid}-${z.host}`}
        >
          <span className="font-mono">{z.host}</span>
          <span className={rot ? '' : 'text-muted-foreground'}>
            {z.anzahl.toLocaleString('de-DE')}×, zuletzt {zeitpunkt(z.zuletzt)}
            {z.staende.length === 1 && z.staende[0] === 'test' ? ' (Test)' : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

function AppKarte({ app }: { app: AppVerbindungen }) {
  return (
    <section
      className="rounded-md border border-border p-ui-3"
      data-testid={`verbindungen-app-${app.id}`}
    >
      <h2 className="mb-2 text-base font-semibold text-foreground">
        {app.name} <span className="font-mono text-ui-xs text-muted-foreground">{app.id}</span>
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <h3 className="mb-1 text-ui-xs font-medium uppercase text-muted-foreground">
            Eingetragen
          </h3>
          {app.eingetragen.length === 0 ? (
            <p
              className="text-ui-xs text-muted-foreground"
              data-testid={`eingetragen-${app.id}-leer`}
            >
              keine, die App erreicht nur ihre Datenbank und die Plattform
            </p>
          ) : (
            <ul className="flex flex-col gap-1" data-testid={`eingetragen-${app.id}`}>
              {app.eingetragen.map(e => (
                <li key={e.host} className="font-mono text-sm text-foreground">
                  {e.host}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="mb-1 text-ui-xs font-medium uppercase text-muted-foreground">Genutzt</h3>
          <Zielliste ziele={app.genutzt} testid={`genutzt-${app.id}`} />
        </div>
        <div>
          <h3 className="mb-1 text-ui-xs font-medium uppercase text-destructive">Abgewiesen</h3>
          <Zielliste ziele={app.abgewiesen} testid={`abgewiesen-${app.id}`} rot />
        </div>
      </div>
    </section>
  );
}

export function VerbindungenSettings() {
  const { data, isLoading, isError } = useVerbindungen();

  return (
    <div className="animate-in fade-in" data-testid="verbindungen-seite">
      <Kopf
        titel="Verbindungen"
        symbol={<Globe />}
        beschreibung="Apps laufen ohne Internet. Hier steht, was jede App ins Netz darf, was sie genutzt hat und was abgewiesen wurde."
      />
      {isLoading ? (
        <SkeletonText lines={5} />
      ) : isError || !data ? (
        <p className="text-sm text-muted-foreground" data-testid="verbindungen-fehler">
          Die Verbindungen ließen sich nicht laden.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {data.apps.length === 0 && (
            <p className="text-sm text-muted-foreground" data-testid="verbindungen-keine-apps">
              Noch keine App auf dem Gerät.
            </p>
          )}
          {data.apps.map(app => (
            <AppKarte key={app.id} app={app} />
          ))}
          <section
            className="rounded-md border border-border p-ui-3"
            data-testid="verbindungen-plattform"
          >
            <h2 className="mb-1 text-base font-semibold text-foreground">Das Gerät selbst</h2>
            <p className="mb-2 text-ui-xs text-muted-foreground">
              Aufrufe externer Modelle, zum Beispiel aus Flows. Sie gehen vom Gerät aus direkt zum
              Anbieter.
            </p>
            <Zielliste ziele={data.plattform.genutzt} testid="genutzt-plattform" />
          </section>
        </div>
      )}
    </div>
  );
}
