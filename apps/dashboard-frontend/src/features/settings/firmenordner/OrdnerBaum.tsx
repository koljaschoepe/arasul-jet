/**
 * Der Ordnerbaum: die Wurzel, die Bereiche der Ebene 1, die Projekte der
 * Ebene 2 darunter — mit Kennung, Name und Art (Auftrag
 * firmenordner-rechte-im-frontend, 22.09.2026).
 *
 * EINE TABELLE UND KEIN AUFKLAPPBAUM. Zwei Ebenen brauchen kein Aufklappen;
 * die Einrückung der Kennung sagt, was worunter liegt, und jede Zeile bleibt
 * mit ihren Handgriffen lesbar. Unter 900 px steht dieselbe Auskunft als
 * Liste (`useSchmalesFenster`), eine Zeile je Ordner — nur eine der beiden
 * Formen steht im Dokument, sonst wären die Kennzeichen doppelt da.
 *
 * DIE ART IST EIN WORT, KEINE FARBE: „Wurzel" (alle lesen, Administratoren
 * schreiben), „geteilt" (Rechte je Person) und „am Gerät" (nie abgeglichen,
 * nur Flows und Apps lesen). Ein Stand ohne Raum im Dienst (`raum_id` leer)
 * steht als Hinweis daneben — der Abgleich holt ihn nach.
 */
import { FolderLock, FolderTree, History, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useSchmalesFenster,
} from '@marken';
import { alsBaum, type Ordner } from './useFirmenordner';

/** Das Wort zur Art, an einer Stelle. */
function artWort(art: Ordner['art']): string {
  if (art === 'wurzel') return 'Wurzel';
  if (art === 'am_geraet') return 'am Gerät';
  return 'geteilt';
}

/** Der Weg, wie ein Mensch ihn liest: die Wurzel als `/`, sonst `eltern/kennung`. */
export function ordnerWeg(o: Ordner): string {
  if (o.art === 'wurzel') return '/';
  return o.ebene === 2 && o.eltern_kennung ? `${o.eltern_kennung}/${o.kennung}` : o.kennung;
}

interface Props {
  ordner: Ordner[];
  onAenderungen: (o: Ordner) => void;
  onWegwerfen: (o: Ordner) => void;
}

function ArtBadge({ o }: { o: Ordner }) {
  return (
    <Badge
      variant={o.art === 'geteilt' ? 'outline' : 'default'}
      data-testid={`ordner-art-${o.kennung}`}
    >
      {o.art === 'am_geraet' && <FolderLock aria-hidden="true" />}
      {artWort(o.art)}
    </Badge>
  );
}

function Handgriffe({ o, onAenderungen, onWegwerfen }: Props & { o: Ordner }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onAenderungen(o)}
        data-testid={`ordner-aenderungen-${o.kennung}`}
        title="Wer hat zuletzt etwas geändert?"
      >
        <History className="size-4" aria-hidden="true" />
        <span className="sr-only">Letzte Änderungen</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onWegwerfen(o)}
        data-testid={`ordner-wegwerfen-${o.kennung}`}
        title="Wegwerfen, samt allem, was darin liegt"
      >
        <Trash2 className="size-4 text-destructive" aria-hidden="true" />
        <span className="sr-only">Wegwerfen</span>
      </Button>
    </span>
  );
}

export function OrdnerBaum({ ordner, onAenderungen, onWegwerfen }: Props) {
  const schmal = useSchmalesFenster();
  const baum = alsBaum(ordner);

  if (schmal) {
    return (
      <ul className="rounded-md border border-border" data-testid="ordner-baum">
        {baum.map(o => (
          <li
            key={String(o.id)}
            data-testid={`ordner-${o.kennung}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border p-ui-3 last:border-b-0"
            style={{ paddingLeft: `calc(var(--spacing) * ${3 + o.ebene * 4})` }}
          >
            <FolderTree className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="font-mono text-sm text-foreground">{ordnerWeg(o)}</span>
            <span className="text-sm text-muted-foreground">{o.name}</span>
            <ArtBadge o={o} />
            <span className="ml-auto">
              <Handgriffe
                o={o}
                ordner={ordner}
                onAenderungen={onAenderungen}
                onWegwerfen={onWegwerfen}
              />
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto" data-testid="ordner-baum">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kennung</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Art</TableHead>
            <TableHead>Rechte</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Handgriffe</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {baum.map(o => (
            <TableRow key={String(o.id)} data-testid={`ordner-${o.kennung}`}>
              <TableCell
                className="font-mono"
                style={{ paddingLeft: `calc(var(--spacing) * ${2 + o.ebene * 5})` }}
              >
                {ordnerWeg(o)}
                {!o.raum_id && (
                  <span
                    className="ml-2 text-ui-xs text-muted-foreground"
                    title="Der Dienst kennt diesen Ordner noch nicht; der Abgleich holt ihn nach."
                  >
                    noch nicht im Dienst
                  </span>
                )}
              </TableCell>
              <TableCell>{o.name}</TableCell>
              <TableCell>
                <ArtBadge o={o} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {o.art === 'wurzel'
                  ? 'alle lesen, Administratoren schreiben'
                  : o.art === 'am_geraet'
                    ? 'nur Flows und Apps am Gerät'
                    : o.rechte_anzahl === 1
                      ? '1 Mensch'
                      : `${o.rechte_anzahl} Menschen`}
              </TableCell>
              <TableCell className="text-right">
                <Handgriffe
                  o={o}
                  ordner={ordner}
                  onAenderungen={onAenderungen}
                  onWegwerfen={onWegwerfen}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
