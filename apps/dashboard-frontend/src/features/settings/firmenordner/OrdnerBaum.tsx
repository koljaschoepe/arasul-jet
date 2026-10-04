/**
 * Der Ordnerbaum: die Wurzel, die Bereiche der Ebene 1, die Projekte der
 * Ebene 2 darunter (M5, Verwaltung Firmenordner; vorher Tabelle mit sieben
 * Spalten, Auftrag firmenordner-rechte-im-frontend, 22.09.2026).
 *
 * Eine Zeile je Ordner: Name, die Art als Wort und die Zahl der Personen. Ein
 * Klick klappt die Zeile auf (`Accordion`, mehrere zugleich, nur Offenes ist
 * gemountet) und zeigt die Stufen je Person; darunter, ebenfalls nur hier,
 * Größe mit Grenze, letzte Änderungen, Papierkorb und Wegwerfen. Zwei Ebenen
 * brauchen keine Verschachtelung: die Einrückung sagt, was worunter liegt.
 *
 * Eine Form für jede Breite. Der Weg des Ordners steht als Text, nie als
 * Adresse des Dateidienstes.
 *
 * DIE ART IST EIN WORT, KEINE FARBE: „Hauptordner" (alle lesen,
 * Administratoren schreiben), „geteilt" (Rechte je Person) und „am Gerät"
 * (nie abgeglichen, nur Flows und Apps lesen). Ein Stand ohne Raum im Dienst
 * (`raum_id` leer) steht als Hinweis daneben, der Abgleich holt ihn nach.
 *
 * DIE GRENZE (J33, 28.09.2026): je Hauptordner und Bereich belegt und Grenze,
 * ein Klick stellt sie ein. Bis dahin hatte jeder Bereich still 1 GB.
 */
import { FolderLock, FolderTree, Gauge, History, Trash, Trash2 } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  cn,
  Progress,
} from '@marken';
import { formatBytes } from '@/utils/formatting';
import type { Benutzer } from '../personen/usePersonen';
import { ordnerWeg } from './ordnerWeg';
import { RechteJeOrdner } from './RechteJeOrdner';
import { alsBaum, type Ordner, type PapierkorbStand, type PlatzStand } from './useFirmenordner';

/** Das Wort zur Art, an einer Stelle. */
function artWort(art: Ordner['art']): string {
  if (art === 'wurzel') return 'Hauptordner';
  if (art === 'am_geraet') return 'am Gerät';
  return 'geteilt';
}

interface Props {
  ordner: Ordner[];
  benutzer: Benutzer[];
  /** Wie viel in welchem Papierkorb liegt (J34); fehlt, solange es nicht geladen ist. */
  papierkorb?: PapierkorbStand[];
  /** Belegt und Grenze je Hauptordner und Bereich (J33); fehlt, solange es nicht geladen ist. */
  platz?: PlatzStand[];
  onGrenze: (o: Ordner) => void;
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

/**
 * Belegt und Grenze eines Hauptordners oder Bereichs, als Knopf zur Grenze
 * (J33, 28.09.2026). Ein Projekt teilt die Grenze seines Bereichs und hat
 * keinen; ein Ordner, den der Firmenordner noch nicht kennt, auch nicht.
 *
 * Die Stufe ist ein Wort und nur bei „voll" eine Farbe — eine Warnung ist
 * Grau mit Text, ein Fehler Rot (30.08.2026).
 */
function PlatzKnopf({
  o,
  platz,
  onGrenze,
}: {
  o: Ordner;
  platz?: PlatzStand[];
  onGrenze: (o: Ordner) => void;
}) {
  if (o.ebene === 2 || !o.raum_id) return null;
  const stand = platz?.find(p => String(p.ordner_id) === String(o.id));
  const anteil =
    stand?.grenze && stand.grenze > 0
      ? Math.min(100, Math.round((stand.belegt / stand.grenze) * 100))
      : null;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onGrenze(o)}
      data-testid={`ordner-platz-${o.kennung}`}
      data-belegt={stand?.belegt ?? ''}
      data-grenze={stand ? (stand.grenze ?? 'ohne') : ''}
      data-stufe={stand?.stufe ?? ''}
      title="Grenze einstellen"
      className="h-auto flex-col items-start gap-1 py-1 text-left"
    >
      <span className="inline-flex items-center gap-1.5 text-xs">
        <Gauge className="size-3.5 shrink-0" aria-hidden="true" />
        {!stand ? (
          <span className="text-muted-foreground">–</span>
        ) : (
          <span
            className={cn(
              'tabular-nums whitespace-nowrap',
              stand.stufe === 'voll' && 'text-destructive'
            )}
          >
            {formatBytes(stand.belegt)}
            {stand.grenze === null ? ' · ohne Grenze' : ` von ${formatBytes(stand.grenze)}`}
          </span>
        )}
        {stand?.stufe === 'knapp' && <span className="text-muted-foreground">· fast voll</span>}
        {stand?.stufe === 'voll' && <span className="text-destructive">· voll</span>}
        <span className="sr-only">, Grenze einstellen</span>
      </span>
      {anteil !== null && (
        <Progress value={anteil} className="h-1 w-full min-w-16" aria-label="belegt" />
      )}
      {stand?.revisionen && stand.revisionen.anzahl > 0 && (
        <span
          className="text-xs text-muted-foreground tabular-nums whitespace-nowrap"
          data-testid={`ordner-fassungen-${o.kennung}`}
        >
          + {formatBytes(stand.revisionen.bytes)} frühere Fassungen
        </span>
      )}
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

function Handgriffe({
  o,
  onAenderungen,
  onWegwerfen,
}: Pick<Props, 'onAenderungen' | 'onWegwerfen'> & { o: Ordner }) {
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

/** Die Zahl der Personen in einem Wort, wie die Zeile sie nennt. */
function personenWort(o: Ordner): string {
  if (o.art === 'wurzel') return 'alle';
  if (o.art === 'am_geraet') return 'nur Apps';
  return o.rechte_anzahl === 1 ? '1 Person' : `${o.rechte_anzahl.toLocaleString('de-DE')} Personen`;
}

export function OrdnerBaum({
  ordner,
  benutzer,
  papierkorb,
  platz,
  onGrenze,
  onAenderungen,
  onWegwerfen,
  onPapierkorb,
}: Props) {
  const baum = alsBaum(ordner);

  return (
    <Accordion type="multiple" data-testid="ordner-baum">
      {baum.map(o => (
        <AccordionItem key={String(o.id)} value={String(o.id)} data-testid={`ordner-${o.kennung}`}>
          <AccordionTrigger style={{ paddingLeft: `calc(var(--spacing) * ${o.ebene * 5})` }}>
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left">
              <FolderTree className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="font-medium wrap-anywhere">{o.name}</span>
              <span className="font-mono text-xs font-normal text-muted-foreground wrap-anywhere">
                {ordnerWeg(o)}
              </span>
              <ArtBadge o={o} />
              <span
                className="text-sm font-normal text-muted-foreground"
                data-testid={`ordner-personen-${o.kennung}`}
              >
                {personenWort(o)}
              </span>
              {!o.raum_id && (
                <span className="text-xs font-normal text-muted-foreground">
                  noch nicht angekommen
                </span>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div
              className="flex flex-col gap-ui-3"
              style={{ paddingLeft: `calc(var(--spacing) * ${o.ebene * 5})` }}
            >
              {o.art === 'wurzel' ? (
                <p className="text-sm text-muted-foreground">
                  Alle lesen diesen Ordner, Administratoren schreiben.
                </p>
              ) : o.art === 'am_geraet' ? (
                <p className="text-sm text-muted-foreground">
                  Dieser Ordner bleibt auf dem Gerät und erscheint bei keiner Person. Nur Flows und
                  Apps am Gerät lesen ihn.
                </p>
              ) : (
                <RechteJeOrdner o={o} benutzer={benutzer} />
              )}
              <div className="flex flex-wrap items-center gap-1">
                <PlatzKnopf o={o} platz={platz} onGrenze={onGrenze} />
                <PapierkorbKnopf o={o} papierkorb={papierkorb} onPapierkorb={onPapierkorb} />
                <span className="ml-auto">
                  <Handgriffe o={o} onAenderungen={onAenderungen} onWegwerfen={onWegwerfen} />
                </span>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
