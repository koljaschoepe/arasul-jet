/**
 * Mein Firmenordner: die Adresse des Dateidienstes und meine Ordner mit
 * ihrer Stufe (Auftrag firmenordner-rechte-im-frontend, 22.09.2026, J33).
 *
 * WARUM EIN DIALOG IM BENUTZERMENÜ und keine Einstellungs-Sektion: dieselbe
 * Begründung wie bei den Ausweisen (J34). Die Einstellungen sind eine
 * Admin-Seite, und der Mitarbeiter ist gerade der, für den diese Auskunft
 * gebaut ist — „welche Ordner habe ich, und wo melde ich mein CLI an". Was
 * jedem gehört, gehört nicht in die Verwaltung.
 *
 * ER ZEIGT, WAS DAS GERÄT ZEIGT, UND NICHTS SONST: die Liste kommt aus
 * `GET /api/firmenordner`, die keinen fremden Ordner nennt. Ein Ordner ohne
 * Recht steht hier nicht, auch sein Name nicht — das ist die Messung der
 * Abnahme mit dem zweiten Konto.
 */
import { FolderTree } from 'lucide-react';
import { Button, Dialogform, Leerzustand } from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { keinFirmenordner, useMeinFirmenordner, type MeinOrdner } from './useMeinFirmenordner';

interface Props {
  offen: boolean;
  beiSchliessen: () => void;
}

function weg(o: MeinOrdner): string {
  return o.art === 'wurzel' ? `/ (Wurzel „${o.kennung}“)` : `${o.pfad}/`;
}

export function MeinFirmenordnerDialog({ offen, beiSchliessen }: Props) {
  const { data, error, isLoading, isError } = useMeinFirmenordner(offen);
  const ordner = data?.ordner ?? [];

  return (
    <Dialogform
      offen={offen}
      beiSchliessen={beiSchliessen}
      titel="Mein Firmenordner"
      groesse="mittel"
      fuss={
        <Button
          variant="secondary"
          onClick={beiSchliessen}
          data-testid="mein-firmenordner-schliessen"
        >
          Schließen
        </Button>
      }
    >
      <div className="space-y-4" data-testid="mein-firmenordner">
        {isLoading ? (
          <SkeletonText lines={4} />
        ) : isError && keinFirmenordner(error) ? (
          <Leerzustand
            symbol={<FolderTree />}
            titel="Auf diesem Gerät läuft kein Firmenordner"
            beschreibung="Fragen Sie den Administrator, ob er eingeschaltet werden soll."
          />
        ) : isError || !data ? (
          <p className="text-sm text-muted-foreground" data-testid="mein-firmenordner-fehler">
            Die Auskunft ließ sich nicht laden.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Der Dateidienst liegt unter{' '}
              <code className="font-mono text-foreground" data-testid="mein-firmenordner-adresse">
                {data.adresse ?? 'unbekannt'}
              </code>
              . Angemeldet wird dort mit demselben Namen und Passwort wie hier; das CLI der Wurzel
              legt die Ordner unten an ihre Stelle im Baum.
            </p>
            {ordner.length === 0 ? (
              <Leerzustand
                symbol={<FolderTree />}
                titel="Noch kein Ordner für Sie"
                beschreibung="Ein Administrator gibt Ihnen ein Recht auf einen Bereich oder ein Projekt. Was hier nicht steht, gibt es für Sie nicht."
              />
            ) : (
              <ul className="rounded-md border border-border" data-testid="mein-firmenordner-liste">
                {ordner.map(o => (
                  <li
                    key={`${o.art}-${o.pfad}`}
                    data-testid={`mein-ordner-${o.kennung}`}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border p-ui-3 last:border-b-0"
                  >
                    <span className="font-mono text-sm text-foreground">{weg(o)}</span>
                    <span className="text-sm text-muted-foreground">{o.name}</span>
                    <span className="ml-auto text-ui-xs font-medium text-foreground">
                      {o.recht}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Dialogform>
  );
}
