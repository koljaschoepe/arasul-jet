/**
 * Die Übersicht eines Ordners: wer hat zuletzt wann etwas geändert (Auftrag
 * firmenordner-rechte-im-frontend, 22.09.2026).
 *
 * GELESEN AUS DEM DIENST, nicht aus dem Gerät. Auf der Platte gehört jede
 * Datei dem Konto des Geräts; wer sie hochgeladen hat, weiß allein der
 * Dateidienst (sein Protokoll, `GET /api/firmenordner/ordner/:id/aenderungen`).
 * Steht er gerade nicht, ist die Liste leer — und das steht dann so da.
 */
import { History } from 'lucide-react';
import { Button, Dialogform, Leerzustand } from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { formatDate } from '@/utils/formatting';
import { useAenderungen, type Ordner } from './useFirmenordner';
import { ordnerWeg } from './OrdnerBaum';

interface Props {
  fuer: Ordner | null;
  onSchliessen: () => void;
}

export function AenderungenDialog({ fuer, onSchliessen }: Props) {
  const { data, isLoading, isError } = useAenderungen(fuer ? fuer.id : null);
  const liste = data ?? [];

  return (
    <Dialogform
      offen={fuer !== null}
      beiSchliessen={onSchliessen}
      titel={fuer ? `Letzte Änderungen in ${ordnerWeg(fuer)}` : 'Letzte Änderungen'}
      groesse="mittel"
      fuss={
        <Button variant="secondary" onClick={onSchliessen}>
          Schließen
        </Button>
      }
    >
      <div data-testid="ordner-aenderungen">
        {isLoading ? (
          <SkeletonText lines={4} />
        ) : isError ? (
          <p className="text-sm text-muted-foreground" data-testid="aenderungen-fehler">
            Das Protokoll ließ sich nicht lesen. Läuft der Dateidienst?
          </p>
        ) : liste.length === 0 ? (
          <Leerzustand
            symbol={<History />}
            titel="Noch nichts geändert"
            beschreibung="Sobald jemand hier etwas ablegt, steht es mit Name und Zeit in dieser Liste."
          />
        ) : (
          <ul className="rounded-md border border-border">
            {liste.map((a, i) => (
              <li
                key={`${a.wann}-${i}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border p-ui-3 last:border-b-0"
                data-testid="aenderung"
              >
                <span className="shrink-0 text-ui-xs text-muted-foreground">
                  {formatDate(a.wann)}
                </span>
                <span className="text-sm font-medium text-foreground">{a.wer ?? 'unbekannt'}</span>
                <span className="min-w-0 text-sm text-muted-foreground">{a.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialogform>
  );
}
