/**
 * Modell je Schritt auf der Seite einer App (M5).
 *
 * Der Entwickler nennt im Kopf des Flows, welches Modell ein Schritt braucht
 * (als „Original“ markiert) und was es können muss (Text, Bild, Werkzeuge,
 * Mindestkontext). Hier steht daneben, womit der Schritt auf diesem Gerät
 * läuft. Der Administrator stellt nur auf Modelle um, die am Gerät liegen und
 * alle Fähigkeiten erfüllen — andere bietet die Auswahl nicht an, und das
 * Backend weist sie ab. Den Auftrag an das Modell ändert er nicht, und Laden
 * und Entladen regelt das Gerät nach Nutzung selbst.
 *
 * Fehlt das genannte Modell, läuft der Schritt mit dem Standardmodell; der
 * Hinweis steht hier und bei den Hinweisen der Startseite.
 */
import {
  Button,
  Meldung,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useToast } from '@/contexts/ToastContext';
import {
  useSchrittModelle,
  useSchrittModellSetzen,
  type SchrittModell,
  type SchrittModellInfo,
} from './useAppVerwaltung';

const ZURUECK = '__original__';

/** Was der Schritt braucht, in einem Satz: „Bild, Werkzeuge, Kontext ab 8192". */
export function braucht(f: SchrittModell['faehigkeiten']): string {
  const teile = [
    f.text ? 'Text' : null,
    f.bild ? 'Bild' : null,
    f.werkzeuge ? 'Werkzeuge' : null,
    f.mindestkontext ? `Kontext ab ${f.mindestkontext}` : null,
  ].filter((t): t is string => t !== null);
  return teile.length > 0 ? teile.join(', ') : 'nichts Besonderes';
}

function SchrittZeile({
  flow,
  s,
  modelle,
  laeuft,
  onWaehlen,
}: {
  flow: string;
  s: SchrittModell;
  modelle: SchrittModellInfo[];
  laeuft: boolean;
  onWaehlen: (modell: string | null) => void;
}) {
  const name = (id: string | null) =>
    modelle.find(m => m.id === id)?.name ?? id ?? 'Standardmodell';
  const kennzeichen = `${flow}-${s.name}`;
  const wert = s.gilt ?? ZURUECK;
  const giltInListe = s.gilt !== null && s.moegliche.includes(s.gilt);
  return (
    <li
      className="flex flex-col gap-2 border-b border-border p-ui-3 last:border-b-0"
      data-testid={`schritt-modell-${kennzeichen}`}
      data-herkunft={s.herkunft}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-[1_1_14rem]">
          <span className="block text-sm font-medium text-foreground">
            {s.name}
            {s.rolle && <span className="ml-2 text-xs text-muted-foreground">Rolle {s.rolle}</span>}
          </span>
          <span
            className="block text-xs text-muted-foreground"
            data-testid={`schritt-original-${kennzeichen}`}
          >
            Original: {s.original ?? 'keines genannt, es gilt das Modell des Flows'}
          </span>
          <span className="block text-xs text-muted-foreground">
            Braucht: {braucht(s.faehigkeiten)}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">Läuft mit</span>
        <Select
          value={wert}
          disabled={laeuft}
          onValueChange={w => onWaehlen(w === ZURUECK ? null : w)}
        >
          <SelectTrigger
            size="sm"
            className="w-56"
            aria-label={`Modell des Schritts ${s.name}`}
            data-testid={`schritt-modell-wahl-${kennzeichen}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {s.gilt === null && <SelectItem value={ZURUECK}>Modell des Flows</SelectItem>}
            {s.gilt !== null && !giltInListe && (
              <SelectItem value={s.gilt} disabled>
                {name(s.gilt)} (erfüllt nicht alle Fähigkeiten)
              </SelectItem>
            )}
            {s.moegliche.map(id => (
              <SelectItem key={id} value={id} data-testid={`schritt-modell-${kennzeichen}-${id}`}>
                {name(id)}
                {id === s.original ? ' (Original)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {s.gewaehlt && (
          <Button
            variant="ghost"
            size="sm"
            disabled={laeuft}
            onClick={() => onWaehlen(null)}
            data-testid={`schritt-modell-zurueck-${kennzeichen}`}
          >
            zurück zum Original
          </Button>
        )}
      </div>
      {s.hinweis && (
        <Meldung art="warnung" kennzeichen={`schritt-hinweis-${kennzeichen}`}>
          {s.hinweis}
        </Meldung>
      )}
    </li>
  );
}

export function AppSchrittModelle({ appId }: { appId: string }) {
  const { isLoading } = useSchrittModelle(appId);
  return (
    <section className="mt-4 flex flex-col gap-2" data-testid="schritt-modelle-bereich">
      <h3 className="text-sm font-medium text-foreground">Modell je Schritt</h3>
      <p className="text-xs text-muted-foreground">
        Womit jeder Schritt rechnet. Zur Wahl stehen nur Modelle am Gerät, die alles können, was der
        Schritt braucht. Den Auftrag an das Modell ändert hier niemand.
      </p>
      {isLoading ? <SkeletonText lines={2} /> : <SchrittModelleInhalt appId={appId} />}
    </section>
  );
}

function SchrittModelleInhalt({ appId }: { appId: string }) {
  const toast = useToast();
  const { data, isError } = useSchrittModelle(appId);
  const setzen = useSchrittModellSetzen(appId);

  if (isError || !data) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="schritt-modelle-fehler">
        Die Modelle der Schritte ließen sich nicht laden.
      </p>
    );
  }
  if (data.flows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="schritt-modelle-leer">
        Kein Flow dieser App hat einen Schritt, der ein Modell ruft.
      </p>
    );
  }

  const waehlen = (flow: string, s: SchrittModell, modell: string | null) =>
    setzen.mutate(
      { flow, schritt: s.name, modell },
      {
        onSuccess: () =>
          toast.success(
            modell
              ? `Schritt „${s.name}“ läuft ab dem nächsten Lauf mit ${
                  data.modelle.find(m => m.id === modell)?.name ?? modell
                }.`
              : `Schritt „${s.name}“ läuft wieder mit dem Modell des Entwicklers.`
          ),
      }
    );

  return (
    <div className="flex flex-col gap-4" data-testid="schritt-modelle">
      {data.flows.map(f => (
        <section
          key={f.name}
          className="flex flex-col gap-1"
          data-testid={`schritt-flow-${f.name}`}
        >
          <h3 className="text-sm font-medium text-foreground">{f.name}</h3>
          <ul className="flex flex-col rounded-md border border-border">
            {f.schritte.map(s => (
              <SchrittZeile
                key={s.name}
                flow={f.name}
                s={s}
                modelle={data.modelle}
                laeuft={setzen.isPending}
                onWaehlen={modell => waehlen(f.name, s, modell)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
