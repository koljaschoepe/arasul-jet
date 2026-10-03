/**
 * Sicherung: auslösen, nachsehen, den Weg zurück prüfen (Phase D5).
 *
 * Bis hierher war die Sicherung eine Sache für jemanden mit einer Konsole. Die
 * Wege gibt es seit C9 (`POST /api/backup/sicherung`, `GET /api/backup/status`,
 * `GET /api/backup/sicherungen`, `POST /api/backup/test`); was fehlte, ist der
 * Knopf. Fünf Jahre unbeaufsichtigter Betrieb heißt nicht, dass niemand
 * hinsieht — er heißt, dass das Hinsehen eine Minute dauert.
 *
 * DER WEG ZURÜCK steht in `Zurueckholen.tsx` (J37, neu gefasst im Auftrag
 * sicherung-zurueckholen, M5): eine App, ein Bereich des Firmenordners oder das
 * ganze Gerät, auf einen Stand, der nach Datum und Uhrzeit in Worten gewählt
 * wird, bestätigt mit dem Passwort, und vorher sichert das Gerät den jetzigen
 * Stand.
 *
 * DIE STÄNDE stehen ebenso in Worten da („Gestern, 2:00 Uhr“). Kennungen,
 * Größen und die Dateien von vor M5 nur unter „Technische Angaben“.
 *
 * DER DATENTRÄGER wird mit Namen und freiem Platz genannt, nie mit einem Pfad:
 * für den, der ihn ansteckt, ist er „die SSD“, nicht ein Ordner im Container.
 *
 * KEINE TABELLE, EINE LISTE. Die Sicherungen stehen als Zeilen, die umbrechen
 * dürfen — bei 390 px steht dieselbe Auskunft untereinander statt in vier
 * Spalten, die nicht nebeneinander passen (Fund der D4-Abnahme).
 */
import { useMemo, useState } from 'react';
import {
  Archive,
  ChevronDown,
  DatabaseBackup,
  KeyRound,
  Loader2,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { Kennzahl, Kennzahlen, Kopf } from '@marken';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useToast } from '@/contexts/ToastContext';
import { duGroesseLesbar, formatBytes, formatDate, formatZahl } from '@/utils/formatting';
import {
  useJetztSichern,
  useSicherungen,
  useSicherungStatus,
  useStaende,
  useWiederherstellungstest,
  type LaufErgebnis,
} from './useSicherung';
import { Feldgruppe, Formularseite, Leerzustand } from '@marken';
import { Zurueckholen } from './Zurueckholen';
import { namenDerStaende, standInWorten, standZusatz } from './standInWorten';

/** So viele Stände stehen in „Stände“ zuerst da. */
const STAENDE_ZUERST = 10;

/** Warum die letzte Kopie auf den Datenträger nicht geklappt hat, in Klartext. */
function versuchText(versuch: string | null | undefined): string | null {
  switch (versuch) {
    case 'zu_wenig_platz':
      return 'Auf dem Datenträger ist zu wenig Platz für die Kopie. Räumen Sie ihn auf oder nehmen Sie einen größeren.';
    case 'nur_verschluesselt':
      return 'Es wird nur Verschlüsseltes auf den Datenträger kopiert. Die letzte Sicherung war nicht verschlüsselt und blieb deshalb auf dem Gerät.';
    case 'nicht_beschreibbar':
      return 'Der Datenträger ist angesteckt, lässt sich aber nicht beschreiben. Möglicherweise ist er schreibgeschützt.';
    case 'nicht_eingehaengt':
      return 'Der Datenträger wurde nicht erkannt. Stecken Sie ihn neu an.';
    case 'abgeschaltet':
      return 'Die Kopie auf einen Datenträger ist an diesem Gerät abgeschaltet.';
    case 'fehler':
      return 'Das Kopieren auf den Datenträger ist fehlgeschlagen.';
    default:
      return null; // kopiert, kein_ziel, unbekannt: nichts zu sagen
  }
}

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
          ? 'border-foreground font-medium text-foreground'
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
  const { data: staende = [] } = useStaende('lokal');
  const [alleStaende, setAlleStaende] = useState(false);
  const [technikOffen, setTechnikOffen] = useState(false);
  const namen = useMemo(() => namenDerStaende(staende), [staende]);
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
        // Ein 200 heisst laut Route `erfolg: true`. Die Frage steht trotzdem
        // hier: sonst haengt „fertig" an einem Statuscode statt an dem, was
        // das Geraet sagt.
        if (!ergebnis.erfolg) {
          setSicherungsMeldung({
            gut: false,
            text: 'Die Sicherung ist nicht durchgelaufen.',
            ausgabe: ergebnis.ausgabe,
          });
          toast.error('Sicherung fehlgeschlagen');
          return;
        }
        const groesse = ergebnis.bericht?.total_size;
        const text = `Sicherung fertig${groesse ? `, ${duGroesseLesbar(groesse)}` : ''}. Sie steht unten in der Liste.`;
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
  const traeger = ausserhalb?.datentraeger;
  const klartext = ausserhalb?.klartextDateien ?? 0;
  const versuch = versuchText(ausserhalb?.letzterVersuch);
  const schluessel = status?.schluessel;

  const ausserhalbFussnote = [
    traeger?.angesteckt
      ? `Datenträger „${traeger.name}“${
          traeger.frei != null && traeger.gesamt != null
            ? `, ${formatBytes(traeger.frei)} frei von ${formatBytes(traeger.gesamt)}`
            : ''
        }`
      : 'Kein Datenträger angesteckt. Eine USB-SSD einfach einstecken, mehr ist nicht nötig.',
    ausserhalb?.vorhanden ? `Zuletzt kopiert: ${formatBytes(ausserhalb.bytes)}` : null,
    ausserhalb?.vorhanden
      ? null
      : 'Eine Sicherung, die nur auf diesem Gerät liegt, überlebt das Gerät nicht.',
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <div className="animate-in fade-in" data-testid="sicherung-seite">
      <Kopf
        titel="Sicherung"
        symbol={<DatabaseBackup />}
        beschreibung="Was gesichert ist, wann zuletzt, und ob es sich zurückspielen lässt."
      />

      {isLoading ? (
        <SkeletonText lines={4} />
      ) : (
        <Formularseite>
          {schluessel?.passt === false && (
            <Alert
              variant="destructive"
              data-testid="sicherung-schluessel-warnung"
              className="border border-destructive"
            >
              <KeyRound className="size-4" />
              <AlertTitle>Der Schlüssel dieses Geräts passt nicht zur letzten Sicherung</AlertTitle>
              <AlertDescription>
                <p>
                  Ohne den Wiederherstellungscode des früheren Schlüssels lässt sich diese Sicherung
                  nicht zurückholen. Geben Sie den Code beim Zurückholen ein; wo Sie ihn finden,
                  steht im Handbuch.
                </p>
                {schluessel.grund && <p>{schluessel.grund}</p>}
              </AlertDescription>
            </Alert>
          )}
          {schluessel?.passt !== false && (schluessel?.aelterUnlesbar ?? 0) > 0 && (
            <p className="text-sm text-muted-foreground" data-testid="sicherung-schluessel-hinweis">
              {formatZahl(schluessel?.aelterUnlesbar ?? 0)}{' '}
              {schluessel?.aelterUnlesbar === 1
                ? 'ältere Sicherung ist'
                : 'ältere Sicherungen sind'}{' '}
              mit einem früheren Schlüssel verschlüsselt und nur mit dem Wiederherstellungscode
              lesbar. Die neueste ist in Ordnung.
            </p>
          )}
          <Feldgruppe
            titel="Zustand"
            symbol={<ShieldCheck />}
            beschreibung={'Nicht „könnte sichern“, sondern „hat gesichert“.'}
            aktion={
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
            <Kennzahlen>
              <Kennzahl
                beschriftung="Gerät"
                wert={status?.sichertWirklich ? 'sichert' : 'sichert nicht'}
                fussnote={
                  status?.sichertWirklich
                    ? 'Die letzte Sicherung ist durchgelaufen und nicht veraltet.'
                    : letzte?.status === 'fehlt'
                      ? 'Es liegt kein Bericht vor: dieses Gerät hat noch nie gesichert.'
                      : 'Seit über 48 Stunden ist keine Sicherung durchgelaufen.'
                }
              />
              <Kennzahl
                beschriftung="Letzte Sicherung"
                wert={letzte?.zeitpunkt ? formatDate(letzte.zeitpunkt) : 'keine'}
                fussnote={
                  letzte?.alterStunden != null
                    ? `vor ${letzte.alterStunden === 1 ? '1 Stunde' : `${formatZahl(letzte.alterStunden)} Stunden`}${letzte.groesse ? `, ${duGroesseLesbar(letzte.groesse)}` : ''}${
                        letzte.verschluesselt ? ', verschlüsselt' : ''
                      }${
                        letzte.firmenordnerGeaendert?.anzahl
                          ? `; ${formatZahl(letzte.firmenordnerGeaendert.anzahl)} ${
                              letzte.firmenordnerGeaendert.anzahl === 1 ? 'Datei' : 'Dateien'
                            } im Firmenordner während der Sicherung geändert`
                          : ''
                      }`
                    : 'Dieses Gerät hat noch nie gesichert.'
                }
              />
              <Kennzahl
                beschriftung="Kopie außerhalb"
                wert={
                  ausserhalb?.vorhanden && ausserhalb.zeitpunkt
                    ? formatDate(ausserhalb.zeitpunkt)
                    : 'noch nie'
                }
                fussnote={ausserhalbFussnote}
              />
              <Kennzahl
                beschriftung="Wiederherstellungstest"
                wert={
                  drill?.status === 'nie_gelaufen'
                    ? 'nie gelaufen'
                    : drill?.status === 'ok'
                      ? 'bestanden'
                      : drill?.status === 'failed'
                        ? 'gescheitert'
                        : (drill?.status ?? 'unbekannt')
                }
                fussnote={
                  drill?.zeitpunkt
                    ? `${formatDate(drill.zeitpunkt)}${drill.tabellen ? `, ${drill.tabellen} Tabellen geprüft` : ''}`
                    : 'Ungeprüft ist eine Sicherung eine Vermutung.'
                }
              />
            </Kennzahlen>

            {klartext > 0 && (
              <Alert
                variant="destructive"
                className="mt-4"
                data-testid="sicherung-klartext-warnung"
              >
                <ShieldAlert className="size-4" />
                <AlertDescription>
                  Auf dem Datenträger {klartext === 1 ? 'liegt' : 'liegen'} {formatZahl(klartext)}{' '}
                  {klartext === 1 ? 'Datei' : 'Dateien'} unverschlüsselt. Jeder, der den Datenträger
                  in die Hand bekommt, kann sie lesen.
                </AlertDescription>
              </Alert>
            )}

            {versuch && (
              <p className="mt-4 text-sm text-muted-foreground" data-testid="sicherung-versuch">
                {versuch}
              </p>
            )}

            {status?.laeuftGerade && !sichern.isPending && !test.isPending && (
              <p className="mt-4 text-sm text-muted-foreground" data-testid="sicherung-laeuft">
                Auf dem Gerät läuft gerade: {status.laeuftGerade}. Solange geht nichts Zweites.
              </p>
            )}

            {sicherungsMeldung && (
              <MeldungsZeile meldung={sicherungsMeldung} testid="sicherung-meldung" />
            )}
          </Feldgruppe>

          <Feldgruppe
            titel="Stände"
            symbol={<Archive />}
            beschreibung={
              status?.staende
                ? `${formatZahl(status.staende.anzahl)} Stände, zusammen ${formatBytes(status.staende.bytes ?? 0)}. Jede Nacht kommt einer dazu, der nur Geändertes schreibt; aufbewahrt werden ${status.staende.aufbewahrung?.tage ?? 7} Tage, ${status.staende.aufbewahrung?.wochen ?? 12} Wochen und ${status.staende.aufbewahrung?.monate ?? 60} Monate.`
                : liste
                  ? `${liste.anzahl} Dateien, ${formatBytes(liste.bytes)}`
                  : 'Gelesen wird die Platte, nicht der Bericht der letzten Nacht.'
            }
          >
            {status?.staende?.hinweis && (
              <p className="mb-3 text-sm text-foreground" data-testid="sicherung-platz-hinweis">
                Das Ziel war voll: der älteste Stand ist entfallen, damit der neue Platz hat.
              </p>
            )}
            {staende.length === 0 && (!liste || liste.dateien.length === 0) ? (
              <Leerzustand
                symbol={<Archive />}
                titel="Noch keine Sicherung"
                beschreibung="Der Knopf oben legt die erste an. Danach steht sie hier mit Datum und Uhrzeit."
              />
            ) : staende.length > 0 ? (
              <>
                <ul className="rounded-md border border-border" data-testid="staende-liste">
                  {(alleStaende ? staende : staende.slice(0, STAENDE_ZUERST)).map(s => {
                    const zusatz = standZusatz(s, namen);
                    return (
                      <li
                        key={s.id}
                        data-testid={`stand-${s.id.slice(0, 8)}`}
                        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border p-ui-3 last:border-b-0"
                      >
                        <span className="text-sm font-medium text-foreground">
                          {standInWorten(s.zeitpunkt)}
                        </span>
                        {zusatz && <span className="text-xs text-muted-foreground">{zusatz}</span>}
                      </li>
                    );
                  })}
                </ul>
                {staende.length > STAENDE_ZUERST && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => setAlleStaende(!alleStaende)}
                    data-testid="staende-alle"
                  >
                    {alleStaende
                      ? 'Nur die neuesten zeigen'
                      : `Alle ${formatZahl(staende.length)} Stände zeigen`}
                  </Button>
                )}
              </>
            ) : null}
            {liste && (liste.dateien.length > 0 || staende.length > 0) && (
              <Collapsible
                open={technikOffen}
                onOpenChange={setTechnikOffen}
                className="mt-3"
                data-testid="sicherung-technik"
              >
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2"
                    data-testid="sicherung-technik-knopf"
                  >
                    <ChevronDown
                      className={cn('size-4 transition-transform', technikOffen && 'rotate-180')}
                      aria-hidden="true"
                    />
                    Technische Angaben
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Je Stand die Kennung und was er neu geschrieben hat; darunter die Dateien der
                    Tagesordner von vor den Ständen.
                  </p>
                  <ul
                    className="mt-2 rounded-md border border-border"
                    data-testid="sicherungsliste"
                  >
                    {liste.dateien.slice(0, 40).map(datei => (
                      <li
                        key={`${datei.art}-${datei.name}`}
                        data-testid={`sicherung-${datei.name}`}
                        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border p-ui-3 last:border-b-0"
                      >
                        <span className="text-sm font-medium text-foreground">
                          {formatDate(datei.zeitpunkt)}
                        </span>
                        <span className="text-sm text-foreground">
                          {datei.art === 'stand'
                            ? `${formatBytes(datei.bytes)} neu`
                            : formatBytes(datei.bytes)}
                        </span>
                        <span className="text-xs text-muted-foreground">{datei.zweck}</span>
                        <span className="w-full truncate font-mono text-ui-xs text-muted-foreground">
                          {datei.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            )}
          </Feldgruppe>

          <Feldgruppe
            titel="Der Weg zurück"
            symbol={<RotateCcw />}
            beschreibung="Ob eine Sicherung etwas taugt, weiß man erst, wenn sie einmal zurückgespielt wurde."
            aktion={
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
              Das echte Zurückholen steht im Abschnitt darunter: eine App, ein Bereich des
              Firmenordners oder das ganze Gerät.
            </p>
            {status?.letzteWiederherstellung && (
              <p className="mt-2 text-sm text-muted-foreground">
                Zuletzt wiederhergestellt: {formatDate(status.letzteWiederherstellung.zeitpunkt)} (
                {status.letzteWiederherstellung.status}).
              </p>
            )}
            {testMeldung && <MeldungsZeile meldung={testMeldung} testid="test-meldung" />}
          </Feldgruppe>

          <Zurueckholen />
        </Formularseite>
      )}
    </div>
  );
}
