/**
 * Zurückholen: eine App, oder das ganze Gerät (J37).
 *
 * ZWEI WEGE, ZWEI GEWICHTE. Eine App zurückholen ersetzt ihre Daten und ihr
 * Paket und fasst nichts sonst an; das ganze Gerät zurückholen ersetzt ALLES
 * (Mitarbeiter, Apps, Freigaben, Firmenordner). Beide haben dieselbe Form, damit man
 * sie nicht verwechselt: ein Knopf, ein Dialog, der sagt was geschieht, und
 * eine Eingabe, die man tippen muss — bei der App ihre Kennung, beim Gerät das
 * Wort „wiederherstellen“ (dasselbe Muster wie beim Entfernen einer App und
 * beim Werksreset).
 *
 * DER BERICHT BLEIBT STEHEN. Ein Toast ist nach vier Sekunden weg, und ein
 * Zurückholen dauert Minuten; wer zwischendurch wegsah, soll danach lesen
 * können, was geschah und was nicht. Er ist eine Liste von Sätzen, keine
 * Tabelle, und bricht bei 390 px um.
 */
import { useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, HardDrive, Loader2, RotateCcw, XCircle } from 'lucide-react';
import { Alert, AlertDescription, Button, cn, Dialogform, Input, Label } from '@marken';
import { Feldgruppe, Leerzustand } from '@marken';
import { formatDate, formatZahl } from '@/utils/formatting';
import {
  useAppZurueckholen,
  useExternInhalt,
  useGeraetZurueckholen,
  useSicherungen,
  useSicherungStatus,
  type AppZurueckErgebnis,
  type GeraetZurueckErgebnis,
  type Quelle,
} from './useSicherung';

/** `20261002` -> `02.10.2026` */
function tagesname(datum: string): string {
  return /^\d{8}$/.test(datum)
    ? `${datum.slice(6)}.${datum.slice(4, 6)}.${datum.slice(0, 4)}`
    : datum;
}

function fehlerText(fehler: unknown): string {
  const e = fehler as { name?: string; message?: string };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
    return 'Das Gerät hat zu lange nicht geantwortet. Das Zurückholen kann trotzdem noch laufen; sehen Sie in ein paar Minuten nach.';
  }
  return e?.message || 'Unbekannter Fehler';
}

/** Die Quelle wählen: Datenträger oder dieses Gerät. */
function QuellWahl({
  wert,
  onWahl,
  datentraegerName,
  testid,
}: {
  wert: Quelle;
  onWahl: (q: Quelle) => void;
  datentraegerName: string | null;
  testid: string;
}) {
  const optionen: { id: Quelle; text: string; frei: boolean }[] = [
    {
      id: 'extern',
      text: datentraegerName
        ? `Datenträger „${datentraegerName}“`
        : 'Datenträger (nicht angesteckt)',
      frei: datentraegerName !== null,
    },
    { id: 'lokal', text: 'Dieses Gerät', frei: true },
  ];
  return (
    <div
      role="group"
      aria-label="Woher zurückholen"
      className="flex flex-wrap gap-2"
      data-testid={testid}
    >
      {optionen.map(o => (
        <Button
          key={o.id}
          type="button"
          size="sm"
          variant={wert === o.id ? 'default' : 'outline'}
          aria-pressed={wert === o.id}
          disabled={!o.frei}
          onClick={() => onWahl(o.id)}
          data-testid={`${testid}-${o.id}`}
        >
          {o.text}
        </Button>
      ))}
    </div>
  );
}

/** Das Feld für den Wiederherstellungscode, eingeklappt, bis man es braucht. */
function CodeFeld({
  wert,
  onAenderung,
  testid,
}: {
  wert: string;
  onAenderung: (v: string) => void;
  testid: string;
}) {
  const [offen, setOffen] = useState(false);
  if (!offen) {
    return (
      <button
        type="button"
        className="self-start text-sm text-muted-foreground underline underline-offset-2"
        onClick={() => setOffen(true)}
        data-testid={`${testid}-oeffnen`}
      >
        Wiederherstellungscode eingeben
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={testid}>Wiederherstellungscode</Label>
      <Input
        id={testid}
        value={wert}
        onChange={e => onAenderung(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        maxLength={100}
        data-testid={testid}
      />
      <p className="text-xs text-muted-foreground">
        Nur nötig, wenn der Schlüssel dieses Geräts nicht zur Sicherung passt. Sonst leer lassen.
      </p>
    </div>
  );
}

/** Eine Liste von Sätzen mit Haken oder Kreuz. */
function Satzliste({
  saetze,
  testid,
}: {
  saetze: { gut: boolean; text: string }[];
  testid: string;
}) {
  return (
    <ul className="flex flex-col gap-1.5" data-testid={testid}>
      {saetze.map((s, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
          {s.gut ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-label="gelungen" />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="gescheitert" />
          )}
          <span className="min-w-0 break-words">{s.text}</span>
        </li>
      ))}
    </ul>
  );
}

function Rahmen({
  gut,
  kopf,
  children,
  testid,
}: {
  gut: boolean;
  kopf: string;
  children: React.ReactNode;
  testid: string;
}) {
  return (
    <div
      data-testid={testid}
      role="status"
      className={cn(
        'mt-4 rounded-md border-l-2 px-3 py-2',
        gut ? 'border-foreground' : 'border-destructive bg-destructive/5'
      )}
    >
      <p className="mb-2 text-sm font-medium text-foreground">{kopf}</p>
      {children}
    </div>
  );
}

/** Aus dem Namen einer App-Datenbank die Kennung: Kennungen haben keinen Unterstrich. */
function appAusDatenbank(datenbank: string): string {
  return datenbank
    .replace(/^arasul_app_/, '')
    .replace(/_(test|live)$/, '')
    .replace(/_/g, '-');
}

export function AppZurueckholen() {
  const { data: status } = useSicherungStatus();
  const { data: extern } = useExternInhalt();
  const { data: liste } = useSicherungen();
  const holen = useAppZurueckholen();

  const traeger = status?.ausserhalb?.datentraeger;
  const angesteckt = Boolean(traeger?.angesteckt && extern?.angesteckt);
  const [gewaehlt, setGewaehlt] = useState<Quelle | null>(null);
  const quelle: Quelle = gewaehlt ?? (angesteckt ? 'extern' : 'lokal');

  const [ziel, setZiel] = useState<{ id: string } | null>(null);
  const [eingabe, setEingabe] = useState('');
  const [code, setCode] = useState('');
  const [mitPaket, setMitPaket] = useState(true);
  const [ergebnis, setErgebnis] = useState<AppZurueckErgebnis | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  // Die Apps zur gewählten Quelle, mit dem Stand der Sicherung.
  let apps: { id: string; staende: string[]; datum: string | null }[] = [];
  if (quelle === 'extern') {
    const neueste = extern?.neuesteSicherung;
    apps = (neueste?.apps ?? []).map(a => ({
      id: a.id,
      staende: a.staende,
      datum: neueste?.zeitpunkt ? formatDate(neueste.zeitpunkt) : tagesname(neueste?.datum ?? ''),
    }));
  } else {
    const nachApp = new Map<string, { staende: Set<string>; zeit: string }>();
    for (const d of liste?.dateien ?? []) {
      if (d.art !== 'app-datenbanken' || !d.datenbank) continue;
      const id = appAusDatenbank(d.datenbank);
      const stand = d.datenbank.endsWith('_live') ? 'live' : 'test';
      const alt = nachApp.get(id);
      nachApp.set(id, {
        staende: new Set([...(alt?.staende ?? []), stand]),
        zeit: alt && alt.zeit > d.zeitpunkt ? alt.zeit : d.zeitpunkt,
      });
    }
    apps = [...nachApp.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, v]) => ({ id, staende: [...v.staende], datum: formatDate(v.zeit) }));
  }

  const schliessen = () => {
    setZiel(null);
    setEingabe('');
    setFehler(null);
  };

  const absenden = (e: FormEvent) => {
    e.preventDefault();
    if (!ziel || eingabe.trim() !== ziel.id || holen.isPending) return;
    setFehler(null);
    setErgebnis(null);
    holen.mutate(
      {
        app: ziel.id,
        bestaetigung: eingabe.trim(),
        quelle,
        paket: mitPaket,
        wiederherstellungscode: code,
      },
      {
        onSuccess: r => {
          setErgebnis(r);
          schliessen();
        },
        onError: f => setFehler(fehlerText(f)),
      }
    );
  };

  const datum = ziel ? (apps.find(a => a.id === ziel.id)?.datum ?? '') : '';

  return (
    <Feldgruppe
      titel="Eine App zurückholen"
      symbol={<RotateCcw />}
      beschreibung="Die Daten einer App und ihr Paket aus der Sicherung. Alles andere auf dem Gerät bleibt, wie es ist."
    >
      <div className="flex flex-col gap-4">
        <QuellWahl
          wert={quelle}
          onWahl={setGewaehlt}
          datentraegerName={angesteckt ? (traeger?.name ?? 'Datenträger') : null}
          testid="app-quelle"
        />

        {apps.length === 0 ? (
          <Leerzustand
            symbol={<HardDrive />}
            titel={
              quelle === 'extern'
                ? 'Auf dem Datenträger liegt noch keine App'
                : 'Auf diesem Gerät liegt noch keine gesicherte App'
            }
            beschreibung="Sobald eine Sicherung mit Apps entstanden ist, stehen sie hier."
          />
        ) : (
          <ul className="rounded-md border border-border" data-testid="app-zurueck-liste">
            {apps.map(a => (
              <li
                key={a.id}
                data-testid={`app-zurueck-${a.id}`}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border p-ui-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-foreground">{a.id}</p>
                  <p className="text-xs text-muted-foreground">
                    Stand vom {a.datum}
                    {a.staende.length > 0 &&
                      `, Stand ${a.staende.map(s => (s === 'live' ? 'Live' : 'Test')).join(' und ')}`}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setErgebnis(null);
                    setZiel({ id: a.id });
                  }}
                  disabled={holen.isPending}
                  data-testid={`app-zurueckholen-${a.id}`}
                >
                  Zurückholen
                </Button>
              </li>
            ))}
          </ul>
        )}

        <CodeFeld wert={code} onAenderung={setCode} testid="app-code" />
      </div>

      {holen.isPending && (
        <p
          className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"
          data-testid="app-laeuft"
        >
          <Loader2 className="size-4 animate-spin" /> Holt zurück. Das dauert einige Minuten.
        </p>
      )}

      {ergebnis && (
        <Rahmen
          gut={ergebnis.erfolg}
          kopf={
            ergebnis.erfolg
              ? `Die App „${ergebnis.app}“ ist zurückgeholt.`
              : `Die App „${ergebnis.app}“ ist nicht vollständig zurückgekommen.`
          }
          testid="app-zurueck-bericht"
        >
          <Satzliste
            saetze={ergebnis.bericht.map(b => ({ gut: b.erfolg, text: b.text }))}
            testid="app-zurueck-saetze"
          />
        </Rahmen>
      )}

      <Dialogform
        offen={ziel !== null}
        beiSchliessen={schliessen}
        titel={ziel ? `„${ziel.id}“ zurückholen` : 'App zurückholen'}
        groesse="klein"
        fuss={
          <div className="flex w-full justify-end gap-3">
            <Button type="button" variant="outline" onClick={schliessen}>
              Abbrechen
            </Button>
            <Button
              type="submit"
              form="app-zurueckholen"
              variant="destructive"
              disabled={!ziel || eingabe.trim() !== ziel.id || holen.isPending}
              data-testid="app-zurueckholen-absenden"
            >
              {holen.isPending ? 'Holt zurück…' : 'Jetzt zurückholen'}
            </Button>
          </div>
        }
      >
        <form id="app-zurueckholen" className="flex flex-col gap-4" onSubmit={absenden}>
          <p className="text-sm text-foreground" data-testid="app-zurueckholen-text">
            Die Daten der App{mitPaket ? ' und ihr Paket' : ''} werden durch den Stand vom {datum}{' '}
            ersetzt. Der jetzige Stand wird vorher abgezogen und aufbewahrt.
          </p>
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={mitPaket}
              onChange={e => setMitPaket(e.target.checked)}
              className="mt-0.5"
              data-testid="app-zurueckholen-paket"
            />
            <span>Auch das Paket der App zurückholen (Oberfläche und Programm)</span>
          </label>
          {fehler && (
            <Alert variant="destructive" data-testid="app-zurueckholen-fehler">
              <AlertDescription>{fehler}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="app-zurueckholen-kennung">
              Zur Bestätigung die Kennung der App eintippen:{' '}
              <span className="font-mono text-foreground">{ziel?.id}</span>
            </Label>
            <Input
              id="app-zurueckholen-kennung"
              value={eingabe}
              onChange={e => setEingabe(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              data-testid="app-zurueckholen-kennung"
            />
          </div>
        </form>
      </Dialogform>
    </Feldgruppe>
  );
}

export function GeraetZurueckholen() {
  const { data: status } = useSicherungStatus();
  const { data: extern } = useExternInhalt();
  const holen = useGeraetZurueckholen();

  const traeger = status?.ausserhalb?.datentraeger;
  const angesteckt = Boolean(traeger?.angesteckt && extern?.angesteckt);
  const [gewaehlt, setGewaehlt] = useState<Quelle | null>(null);
  const quelle: Quelle = gewaehlt ?? (angesteckt ? 'extern' : 'lokal');

  const [code, setCode] = useState('');
  const [offen, setOffen] = useState(false);
  const [eingabe, setEingabe] = useState('');
  const [ergebnis, setErgebnis] = useState<GeraetZurueckErgebnis | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const schliessen = () => {
    setOffen(false);
    setEingabe('');
    setFehler(null);
  };

  const absenden = (e: FormEvent) => {
    e.preventDefault();
    if (eingabe.trim() !== 'wiederherstellen' || holen.isPending) return;
    setFehler(null);
    setErgebnis(null);
    holen.mutate(
      { quelle, wiederherstellungscode: code },
      {
        onSuccess: r => {
          setErgebnis(r);
          schliessen();
        },
        onError: f => setFehler(fehlerText(f)),
      }
    );
  };

  const laufen = ergebnis?.apps.filter(a => a.erfolg) ?? [];
  const nichtLaufen = ergebnis?.apps.filter(a => !a.erfolg) ?? [];
  const b = ergebnis?.bericht;

  return (
    <Feldgruppe
      titel="Das ganze Gerät zurückholen"
      symbol={<AlertTriangle />}
      beschreibung="Der Notfallweg, wenn das Gerät neu aufgesetzt wurde oder seine Daten verloren sind."
    >
      <Alert variant="destructive" data-testid="geraet-zurueck-warnung">
        <AlertTriangle className="size-4" />
        <AlertDescription>
          Das ersetzt alles auf diesem Gerät durch den Stand der Sicherung: Mitarbeiter, Apps,
          Freigaben und den Firmenordner. Was seit der Sicherung dazukam, geht dabei verloren. Für
          eine einzelne App nehmen Sie den Abschnitt darüber.
        </AlertDescription>
      </Alert>

      <div className="mt-4 flex flex-col gap-4">
        <QuellWahl
          wert={quelle}
          onWahl={setGewaehlt}
          datentraegerName={angesteckt ? (traeger?.name ?? 'Datenträger') : null}
          testid="geraet-quelle"
        />
        <CodeFeld wert={code} onAenderung={setCode} testid="geraet-code" />
        <div>
          <Button
            variant="destructive"
            onClick={() => {
              setErgebnis(null);
              setOffen(true);
            }}
            disabled={holen.isPending || Boolean(status?.laeuftGerade)}
            data-testid="geraet-zurueckholen"
          >
            Das ganze Gerät zurückholen …
          </Button>
        </div>
      </div>

      {holen.isPending && (
        <p
          className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"
          data-testid="geraet-laeuft"
        >
          <Loader2 className="size-4 animate-spin" /> Holt zurück. Das kann eine Stunde dauern.
        </p>
      )}

      {ergebnis && (
        <Rahmen
          gut={ergebnis.erfolg}
          kopf={
            ergebnis.erfolg
              ? 'Das Gerät ist zurückgeholt.'
              : 'Das Gerät ist nicht vollständig zurückgekommen.'
          }
          testid="geraet-zurueck-bericht"
        >
          <Satzliste
            testid="geraet-zurueck-saetze"
            saetze={[
              {
                gut: ergebnis.erfolg || (b?.status ?? '') === 'fertig',
                text:
                  b?.tabellen != null
                    ? `Die Datenbank ist zurück (${formatZahl(b.tabellen)} Tabellen).`
                    : (b?.grund ?? 'Die Datenbank wurde nicht zurückgeholt.'),
              },
              ...laufen.map(a => ({
                gut: true,
                text: `Die App „${a.app_id}“ läuft wieder (${a.stand === 'live' ? 'Live' : 'Test'}).`,
              })),
              ...nichtLaufen.map(a => ({
                gut: false,
                text: `Die App „${a.app_id}“ (${a.stand === 'live' ? 'Live' : 'Test'}) läuft nicht wieder${a.grund ? `: ${a.grund}` : '.'}`,
              })),
            ]}
          />
          {ergebnis.apps.length === 0 && (
            <p className="mt-2 text-sm text-muted-foreground">Es waren keine Apps eingespielt.</p>
          )}
          {!ergebnis.erfolg && ergebnis.ausgabe && (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-ui-xs text-muted-foreground">
              {ergebnis.ausgabe}
            </pre>
          )}
        </Rahmen>
      )}

      <Dialogform
        offen={offen}
        beiSchliessen={schliessen}
        titel="Das ganze Gerät zurückholen"
        groesse="klein"
        fuss={
          <div className="flex w-full justify-end gap-3">
            <Button type="button" variant="outline" onClick={schliessen}>
              Abbrechen
            </Button>
            <Button
              type="submit"
              form="geraet-zurueckholen"
              variant="destructive"
              disabled={eingabe.trim() !== 'wiederherstellen' || holen.isPending}
              data-testid="geraet-zurueckholen-absenden"
            >
              {holen.isPending ? 'Holt zurück…' : 'Alles ersetzen'}
            </Button>
          </div>
        }
      >
        <form id="geraet-zurueckholen" className="flex flex-col gap-4" onSubmit={absenden}>
          <p className="text-sm text-foreground">
            Alle Daten dieses Geräts werden durch den Stand der Sicherung
            {quelle === 'extern'
              ? ` auf dem Datenträger „${traeger?.name ?? ''}“`
              : ' auf diesem Gerät'}{' '}
            ersetzt: Mitarbeiter, Apps, Freigaben und der Firmenordner. Danach werden die Apps neu
            aufgebaut. Das dauert und lässt sich nicht rückgängig machen.
          </p>
          {fehler && (
            <Alert variant="destructive" data-testid="geraet-zurueckholen-fehler">
              <AlertDescription>{fehler}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="geraet-zurueckholen-wort">
              Zur Bestätigung das Wort eintippen:{' '}
              <span className="font-mono text-foreground">wiederherstellen</span>
            </Label>
            <Input
              id="geraet-zurueckholen-wort"
              value={eingabe}
              onChange={e => setEingabe(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              data-testid="geraet-zurueckholen-wort"
            />
          </div>
        </form>
      </Dialogform>
    </Feldgruppe>
  );
}
