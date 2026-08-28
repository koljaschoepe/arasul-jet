/**
 * Ein Flow einer App, so wie er im Paket steht (Phase D4).
 *
 * Die Frage, die diese Ansicht beantwortet, ist „was tut dieser Flow
 * eigentlich" — und sie ist ohne den Auftrag an das Modell nicht zu
 * beantworten. Deshalb steht der Prompt hier und nicht in der Liste: dass der
 * Partner ihn geschrieben hat, macht ihn nicht geheim. Er liegt als Datei auf
 * diesem Gerät, und wer das Gerät verwaltet, haftet für das, was darauf läuft.
 *
 * Daneben die eine Sache, die der Administrator hier ÄNDERT: das Modell.
 */
import { ArrowLeft, Cpu, Globe } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { SkeletonText } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import type { Stand } from '../mitarbeiter/useAppFreigaben';
import { useFlowDefinition, type FlowDefinition } from './useAppVerwaltung';

/** Womit der Flow läuft, in einer Zeile — geteilt mit der Flow-Liste. */
export function ModellZeile({
  modell,
  ueberschrieben,
  extern,
}: {
  modell: string | null;
  ueberschrieben: boolean;
  extern: FlowDefinition['extern'];
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-sm">
      {extern ? (
        <Globe className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
      ) : (
        <Cpu className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <span className="font-mono text-foreground">{modell ?? 'Standardmodell'}</span>
      {extern && (
        <span
          className="rounded bg-warning/15 px-1.5 py-0.5 text-ui-xs font-medium text-warning"
          title={`${extern.anbieter}, ${extern.basis_url}${
            extern.endet_auf ? `, Schlüssel endet auf ${extern.endet_auf}` : ', ohne Schlüssel'
          }`}
        >
          extern: {extern.anbieter}
        </span>
      )}
      {/* „Aus dem Paket" ist der Normalfall und bekommt kein Etikett. Ein
          Etikett an jeder Zeile sagt nichts; eines an den abweichenden schon. */}
      {!extern && ueberschrieben && (
        <span className="rounded bg-accent px-1.5 py-0.5 text-ui-xs text-muted-foreground">
          vom Administrator
        </span>
      )}
    </span>
  );
}

/** Ein Feld des Frontmatters, wenn es etwas enthält. */
function Feld({ name, wert }: { name: string; wert: React.ReactNode }) {
  if (!wert) return null;
  return (
    <>
      <dt className="text-muted-foreground">{name}</dt>
      <dd className="min-w-0 text-foreground">{wert}</dd>
    </>
  );
}

export function FlowAnsicht({
  appId,
  stand,
  name,
  onZurueck,
  onModellAendern,
}: {
  appId: string;
  stand: Stand;
  name: string;
  onZurueck: () => void;
  onModellAendern: (flow: FlowDefinition) => void;
}) {
  const { data: flow, isLoading, isError } = useFlowDefinition(appId, stand, name);

  return (
    <div className="flex flex-col gap-4" data-testid="flow-ansicht">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onZurueck} data-testid="flow-zurueck">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Zurück zur App
        </Button>
        {flow && (
          <Button size="sm" onClick={() => onModellAendern(flow)} data-testid="flow-modell-aendern">
            Modell umstellen
          </Button>
        )}
      </div>

      {isLoading && <SkeletonText lines={5} />}

      {isError && (
        <p className="text-sm text-muted-foreground" data-testid="flow-fehler">
          Die Flow-Datei ließ sich nicht laden.
        </p>
      )}

      {flow && (
        <>
          <div>
            <h3 className="text-lg font-semibold text-foreground">{flow.name}</h3>
            {flow.beschreibung && (
              <p className="mt-1 text-sm text-muted-foreground">{flow.beschreibung}</p>
            )}
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            <Feld
              name="Modell"
              wert={
                <span data-testid="flow-modell">
                  <ModellZeile
                    modell={flow.modell}
                    ueberschrieben={flow.modell_ueberschrieben}
                    extern={flow.extern}
                  />
                  {/* Wovon abgewichen wurde. Ohne diese Angabe sieht man nach
                      dem Umstellen nicht mehr, was das Paket wollte. */}
                  {flow.modell_ueberschrieben && flow.paket_modell && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      (Paket: {flow.paket_modell})
                    </span>
                  )}
                </span>
              }
            />
            <Feld name="Stand" wert={stand === 'live' ? 'Livestand' : 'Teststand'} />
            <Feld name="Fassung" wert={<span className="font-mono">{flow.version}</span>} />
            <Feld
              name="Werkzeuge"
              wert={
                flow.werkzeuge?.length ? (
                  <span className="font-mono text-ui-xs">{flow.werkzeuge.join(', ')}</span>
                ) : null
              }
            />
            <Feld
              name="Argumente"
              wert={
                flow.argumente?.length ? (
                  <ul className="flex flex-col gap-0.5">
                    {flow.argumente.map(a => (
                      <li key={a.name}>
                        <span className="font-mono text-ui-xs">{a.name}</span>
                        <span className="text-muted-foreground">
                          {' '}
                          — {a.typ}
                          {a.pflicht ? ', Pflicht' : ''}
                          {a.beschreibung ? `: ${a.beschreibung}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null
              }
            />
            <Feld
              name="Schritte"
              wert={
                flow.schritte?.length ? (
                  <ol className="flex flex-col gap-0.5">
                    {flow.schritte.map((s, i) => (
                      <li key={s.name}>
                        <span className="text-muted-foreground">{i + 1}.</span>{' '}
                        <span className="font-mono text-ui-xs">{s.name}</span>
                        <span className="text-muted-foreground">
                          {' '}
                          — {s.typ}
                          {s.werkzeug || s.rolle ? ` (${s.werkzeug ?? s.rolle})` : ''}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : null
              }
            />
          </dl>

          <div>
            <h4 className="mb-1.5 text-sm font-semibold text-foreground">Auftrag an das Modell</h4>
            <pre
              className={cn(
                'max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md',
                'border border-border bg-card p-ui-3 font-mono text-ui-xs text-foreground'
              )}
              data-testid="flow-prompt"
            >
              {flow.prompt || '(leer)'}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}
