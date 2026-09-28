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
import { FolderLock, FolderTree, History, Trash, Trash2 } from 'lucide-react';
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
import { alsBaum, type Ordner, type PapierkorbStand } from './useFirmenordner';

/** Das Wort zur Art, an einer Stelle. */
function artWort(art: Ordner['art']): string {
  if (art === 'wurzel') return 'Hauptordner';
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
  /** Wie viel in welchem Papierkorb liegt (J34); fehlt, solange es nicht geladen ist. */
  papierkorb?: PapierkorbStand[];
  onAenderungen: (o: Ordner) => void;
  onWegwerfen: (o: Ordner) => void;
  onPapierkorb: (o: Ordner) => void;
}

/**
 * Der Knopf zum Papierkorb eines Hauptordners oder Bereichs, mit der Zahl
 * darin (J34, 27.09.2026). Ein Projekt hat keinen eigenen — was darin
 * gelöscht wird, liegt im Papierkorb seines Bereichs —, und ein Ordner, den
 * der Firmenordner noch nicht kennt, auch nicht.
 */
function PapierkorbKnopf({
  o,
  papierkorb,
  onPapierkorb,
}: {
  o: Ordner;
  papierkorb?: PapierkorbStand[];
  onPapierkorb: (o: Ordner) => void;
}) {
  if (o.ebene === 2 || !o.raum_id) return null;
  const stand = papierkorb?.find(p => String(p.ordner_id) === String(o.id));
  const anzahl = stand?.anzahl ?? null;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onPapierkorb(o)}
      data-testid={`ordner-papierkorb-${o.kennung}`}
      data-anzahl={anzahl ?? ''}
      title="Papierkorb öffnen"
    >
      <Trash className="size-4" aria-hidden="true" />
      <span className={anzahl ? 'tabular-nums' : 'tabular-nums text-muted-foreground'}>
        {anzahl === null ? '–' : anzahl.toLocaleString('de-DE')}
      </span>
      <span className="sr-only">
        {anzahl === null
          ? 'Papierkorb'
          : anzahl === 1
            ? 'Eintrag im Papierkorb'
            : 'Einträge im Papierkorb'}
      </span>
    </Button>
  );
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

export function OrdnerBaum({
  ordner,
  papierkorb,
  onAenderungen,
  onWegwerfen,
  onPapierkorb,
}: Props) {
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
            <span className="ml-auto inline-flex items-center gap-1">
              <PapierkorbKnopf o={o} papierkorb={papierkorb} onPapierkorb={onPapierkorb} />
              <Handgriffe
                o={o}
                ordner={ordner}
                onAenderungen={onAenderungen}
                onWegwerfen={onWegwerfen}
                onPapierkorb={onPapierkorb}
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
            <TableHead>Papierkorb</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Handgriffe</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {baum.map(o => (
            <TableRow key={String(o.id)} data-testid={`ordner-${o.kennung}`}>
              {/* Kennung und Name brechen um, auch mitten im Wort (J34, 28.09.2026):
                  mit acht Bereichen und langen Kennungen schob die Tabelle sonst
                  Papierkorb und Handgriffe aus dem Kasten, und rollen soll auf
                  dieser Seite nur die Rechte-Matrix. */}
              <TableCell
                className="font-mono whitespace-normal wrap-anywhere"
                style={{ paddingLeft: `calc(var(--spacing) * ${2 + o.ebene * 5})` }}
              >
                {ordnerWeg(o)}
                {!o.raum_id && (
                  <span
                    className="ml-2 text-ui-xs text-muted-foreground"
                    title="Noch nicht bei den Mitarbeitern angekommen. Oben auf „Jetzt nachholen“ tippen."
                  >
                    noch nicht angekommen
                  </span>
                )}
              </TableCell>
              <TableCell className="whitespace-normal wrap-anywhere">{o.name}</TableCell>
              <TableCell>
                <ArtBadge o={o} />
              </TableCell>
              {/* Der Satz darf umbrechen: mit der Spalte Papierkorb (J34) schob er bei
                  1440 px mit offener Notizspalte die Handgriffe aus dem Kasten. */}
              <TableCell className="whitespace-normal text-muted-foreground">
                {o.art === 'wurzel'
                  ? 'alle lesen, Administratoren schreiben'
                  : o.art === 'am_geraet'
                    ? 'nur die Apps am Gerät'
                    : o.rechte_anzahl === 1
                      ? '1 Person'
                      : `${o.rechte_anzahl.toLocaleString('de-DE')} Personen`}
              </TableCell>
              <TableCell>
                <PapierkorbKnopf o={o} papierkorb={papierkorb} onPapierkorb={onPapierkorb} />
              </TableCell>
              <TableCell className="text-right">
                <Handgriffe
                  o={o}
                  ordner={ordner}
                  onAenderungen={onAenderungen}
                  onWegwerfen={onWegwerfen}
                  onPapierkorb={onPapierkorb}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
