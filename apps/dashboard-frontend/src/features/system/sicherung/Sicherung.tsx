/**
 * Sicherung: auslösen, nachsehen, den Weg zurück prüfen (Phase D5).
 *
 * Bis hierher war die Sicherung eine Sache für jemanden mit einer Konsole. Die
 * Wege gibt es seit C9 (`POST /api/backup/sicherung`, `GET /api/backup/status`,
 * `GET /api/backup/sicherungen`, `POST /api/backup/test`); was fehlte, ist der
 * Knopf. Fünf Jahre unbeaufsichtigter Betrieb heißt nicht, dass niemand
 * hinsieht — er heißt, dass das Hinsehen eine Minute dauert.
 *
 * WAS HIER NICHT STEHT: der Weg zurück. `POST /api/backup/wiederherstellung`
 * ersetzt die ganze Datenbank und verlangt deshalb eine ausdrückliche
 * Bestätigung im Rumpf; ein Knopf dafür zwischen zwei Kacheln wäre der
 * gefährlichste Knopf des Geräts an der beiläufigsten Stelle. Er bleibt beim
 * Handbuch (`docs/ops/DISASTER_RECOVERY.md`), und diese Seite sagt das.
 *
 * KEINE TABELLE, EINE LISTE. Die Sicherungen stehen als Zeilen, die umbrechen
 * dürfen — bei 390 px steht dieselbe Auskunft untereinander statt in vier
 * Spalten, die nicht nebeneinander passen (Fund der D4-Abnahme).
 */
import { useState } from 'react';
import { Archive, DatabaseBackup, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import EmptyState from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section, SectionList } from '@/components/ui/Section';
import { SkeletonText } from '@/components/ui/Skeleton';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { useToast } from '@/contexts/ToastContext';
import { formatBytes, formatDate } from '@/utils/formatting';
import { cn } from '@/lib/utils';
import {
  useJetztSichern,
  useSicherungen,
  useSicherungStatus,
  useWiederherstellungstest,
  type LaufErgebnis,
} from './useSicherung';

/** Was nach einem Lauf stehen bleibt, bis der nächste kommt. */
interface Meldung {
  gut: boolean;
  text: string;
  /** Die letzten Zeilen aus dem Container — die einzige Erklärung im Fehlerfall. */
  ausgabe?: string;
}

function fehlerText(fehler: unknown): string {
  const e = fehler as { name?: string; message?: string; status?: number };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
    return 'Das Gerät hat zu lange nicht geantwortet. Die Sicherung kann trotzdem weiterlaufen; die Liste unten sagt in ein paar Minuten, was daraus geworden ist.';
  }
  return e?.message || 'Unbekannter Fehler';
}

/** Eine Zeile, die stehen bleibt. Der Toast ist nach vier Sekunden weg. */
function MeldungsZeile({ meldung, testid }: { meldung: Meldung; testid: string }) {
  return (
    <div
      data-testid={testid}
      role="status"
      className={cn(
        'mt-4 rounded-md border-l-2 px-3 py-2 text-sm',
        meldung.gut
          ? 'border-primary bg-primary/5 text-foreground'
          : 'border-destructive bg-destructive/5 text-foreground'
      )}
    >
      {meldung.text}
      {meldung.ausgabe && (
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-ui-xs text-muted-foreground">
          {meldung.ausgabe}
        </pre>
      )}
    </div>
  );
}

export function Sicherung() {
  const toast = useToast();
  const { data: status, isLoading } = useSicherungStatus();
  const { data: liste } = useSicherungen();
  const sichern = useJetztSichern();
  const test = useWiederherstellungstest();
  const [sicherungsMeldung, setSicherungsMeldung] = useState<Meldung | null>(null);
  const [testMeldung, setTestMeldung] = useState<Meldung | null>(null);

  // Einer nach dem anderen: das Backend lässt ohnehin nur einen Lauf zugleich
  // zu (`laeuftGerade`, 409). Zwei Knöpfe, die gleichzeitig gedrückt werden
  // können, würden diesen Konflikt nur in die Oberfläche holen.
  const laeuft = sichern.isPending || test.isPending || Boolean(status?.laeuftGerade);

  const jetztSichern = () => {
    setSicherungsMeldung(null);
    sichern.mutate(undefined, {
      onSuccess: (ergebnis: LaufErgebnis) => {
        const groesse = ergebnis.bericht?.total_size;
        const text = `Sicherung fertig${groesse ? `, ${groesse}` : ''}. Sie steht unten in der Liste.`;
        setSicherungsMeldung({ gut: true, text });
        toast.success('Sicherung fertig');
      },
      onError: fehler => {
        setSicherungsMeldung({
          gut: false,
          text: `Sicherung fehlgeschlagen: ${fehlerText(fehler)}`,
        });
        toast.error('Sicherung fehlgeschlagen');
      },
    });
  };

  const testLaufen = () => {
    setTestMeldung(null);
    test.mutate(undefined, {
      onSuccess: (ergebnis: LaufErgebnis) => {
        setTestMeldung({
          gut: ergebnis.erfolg,
          text: ergebnis.erfolg
            ? 'Der Wiederherstellungstest ist durchgelaufen: die neueste Sicherung lässt sich zurückspielen.'
            : 'Der Wiederherstellungstest ist gescheitert. Die Sicherungen dieses Geräts sind damit nicht belegt.',
          ausgabe: ergebnis.erfolg ? undefined : ergebnis.ausgabe,
        });
        (ergebnis.erfolg ? toast.success : toast.error)(
          ergebnis.erfolg
            ? 'Wiederherstellungstest bestanden'
            : 'Wiederherstellungstest gescheitert'
        );
      },
      onError: fehler => {
        setTestMeldung({
          gut: false,
          text: `Wiederherstellungstest gescheitert: ${fehlerText(fehler)}`,
        });
        toast.error('Wiederherstellungstest gescheitert');
      },
    });
  };

  const ausserhalb = status?.ausserhalb;
  const letzte = status?.letzteSicherung;
  const drill = status?.wiederherstellungstest;

  return (
    <div className="animate-in fade-in" data-testid="sicherung-seite">
      <PageHeader
        title="Sicherung"
        icon={<DatabaseBackup />}
        description="Was gesichert ist, wann zuletzt, und ob es sich zurückspielen lässt."
      />

      {isLoading ? (
        <SkeletonText lines={4} />
      ) : (
        <SectionList>
          <Section
            title="Zustand"
            icon={<ShieldCheck />}
            description={'Nicht „könnte sichern“, sondern „hat gesichert“.'}
            action={
              <Button onClick={jetztSichern} disabled={laeuft} data-testid="sicherung-ausloesen">
                {sichern.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Sichert …
                  </>
                ) : (
                  'Jetzt sichern'
                )}
              </Button>
            }
          >
            <StatGrid>
              <StatTile
                label="Gerät"
                value={status?.sichertWirklich ? 'sichert' : 'sichert nicht'}
                note={
                  status?.sichertWirklich
                    ? 'Die letzte Sicherung ist durchgelaufen und nicht veraltet.'
                    : 'Seit über 48 Stunden ist keine Sicherung durchgelaufen.'
                }
              />
              <StatTile
                label="Letzte Sicherung"
                value={letzte?.zeitpunkt ? formatDate(letzte.zeitpunkt) : 'keine'}
                note={
                  letzte?.alterStunden != null
                    ? `vor ${letzte.alterStunden} h${letzte.groesse ? `, ${letzte.groesse}` : ''}${
                        letzte.verschluesselt ? ', verschlüsselt' : ''
                      }`
                    : 'Dieses Gerät hat noch nie gesichert.'
                }
              />
              <StatTile
                label="Kopie außerhalb"
                value={
                  ausserhalb?.vorhanden && ausserhalb.zeitpunkt
                    ? formatDate(ausserhalb.zeitpunkt)
                    : 'noch nie'
                }
                note={
                  ausserhalb?.vorhanden
                    ? `${formatBytes(ausserhalb.bytes)}${ausserhalb.ziel ? ` auf ${ausserhalb.ziel}` : ''}`
                    : 'Eine Sicherung, die nur auf diesem Gerät liegt, überlebt das Gerät nicht.'
                }
              />
              <StatTile
                label="Wiederherstellungstest"
                value={
                  drill?.status === 'nie_gelaufen'
                    ? 'nie gelaufen'
                    : drill?.status === 'ok'
                      ? 'bestanden'
                      : (drill?.status ?? 'unbekannt')
                }
                note={
                  drill?.zeitpunkt
                    ? `${formatDate(drill.zeitpunkt)}${drill.tabellen ? `, ${drill.tabellen} Tabellen geprüft` : ''}`
                    : 'Ungeprüft ist eine Sicherung eine Vermutung.'
                }
              />
            </StatGrid>

            {status?.laeuftGerade && !sichern.isPending && !test.isPending && (
              <p className="mt-4 text-sm text-muted-foreground" data-testid="sicherung-laeuft">
                Auf dem Gerät läuft gerade: {status.laeuftGerade}. Solange geht nichts Zweites.
              </p>
            )}

            {sicherungsMeldung && (
              <MeldungsZeile meldung={sicherungsMeldung} testid="sicherung-meldung" />
            )}
          </Section>

          <Section
            title="Was da liegt"
            icon={<Archive />}
            description={
              liste
                ? `${liste.anzahl} Dateien, ${formatBytes(liste.bytes)} in ${liste.ordner}`
                : 'Gelesen wird die Platte, nicht der Bericht der letzten Nacht.'
            }
          >
            {!liste || liste.dateien.length === 0 ? (
              <EmptyState
                icon={<Archive />}
                title="Noch keine Sicherung"
                description="Der Knopf oben legt die erste an. Danach steht sie hier mit Datum und Größe."
              />
            ) : (
              <ul className="rounded-md border border-border" data-testid="sicherungsliste">
                {liste.dateien.slice(0, 40).map(datei => (
                  <li
                    key={`${datei.art}-${datei.name}`}
                    data-testid={`sicherung-${datei.name}`}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border p-ui-3 last:border-b-0"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {formatDate(datei.zeitpunkt)}
                    </span>
                    <span className="text-sm text-foreground">{formatBytes(datei.bytes)}</span>
                    <span className="text-xs text-muted-foreground">{datei.zweck}</span>
                    <span className="w-full truncate font-mono text-ui-xs text-muted-foreground">
                      {datei.name}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Der Weg zurück"
            icon={<RotateCcw />}
            description="Ob eine Sicherung etwas taugt, weiß man erst, wenn sie einmal zurückgespielt wurde."
            action={
              <Button
                variant="outline"
                onClick={testLaufen}
                disabled={laeuft}
                data-testid="wiederherstellungstest"
              >
                {test.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Prüft …
                  </>
                ) : (
                  'Wiederherstellungstest'
                )}
              </Button>
            }
          >
            <p className="text-sm text-muted-foreground">
              Der Test spielt die neueste Sicherung in eine Wegwerf-Datenbank und zählt nach. Er
              fasst den Betrieb nicht an und dauert wie eine Sicherung einige Minuten.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Das echte Zurückspielen ersetzt die ganze Datenbank und steht deshalb nicht als Knopf
              auf dieser Seite. Wie es geht, steht im Handbuch unter „Disaster Recovery“.
            </p>
            {status?.letzteWiederherstellung && (
              <p className="mt-2 text-sm text-muted-foreground">
                Zuletzt wiederhergestellt: {formatDate(status.letzteWiederherstellung.zeitpunkt)} (
                {status.letzteWiederherstellung.status}).
              </p>
            )}
            {testMeldung && <MeldungsZeile meldung={testMeldung} testid="test-meldung" />}
          </Section>
        </SectionList>
      )}
    </div>
  );
}
