/**
 * Zurückholen: eine App, einen Bereich des Firmenordners oder das ganze Gerät
 * (J37, neu gefasst im Auftrag sicherung-zurueckholen, M5, 04.10.2026).
 *
 * EIN WEG IN DREI SCHRITTEN, für jede der drei Sachen derselbe:
 *
 *   1. Was? Eine App, ein Bereich, oder das ganze Gerät.
 *   2. Wann? Die Stände, in denen es steht, nach ihrem Zeitpunkt in Worten
 *      („Gestern, 2:00 Uhr“). Wer zurückholt, weiß nicht, was ein Stand ist,
 *      aber er weiß, wann der Fehler passiert ist. Die Kennung steht nur
 *      unter „Technische Angaben“.
 *   3. Bestätigen mit dem eigenen Passwort — beim ganzen Gerät zusätzlich mit
 *      dem Wort „wiederherstellen“, denn das ersetzt alles.
 *
 * VORHER SICHERT DAS GERÄT DEN JETZIGEN STAND, jedes Mal. Er steht danach
 * oben in der Liste („Heute, 23:41 Uhr · vor dem Zurückholen der App …“), und
 * wer den falschen Zeitpunkt erwischt hat, holt mit ihm auf demselben Weg
 * zurück, was vorher war.
 *
 * DER BERICHT BLEIBT STEHEN. Ein Zurückholen dauert Minuten; wer
 * zwischendurch wegsah, soll danach lesen können, was geschah und was nicht.
 */
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { CheckCircle2, HardDrive, Loader2, RotateCcw, XCircle } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  Button,
  cn,
  Dialogform,
  Feldgruppe,
  Input,
  Label,
  Leerzustand,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@marken';
import { formatBytes, formatZahl } from '@/utils/formatting';
import { TechnischeAngaben } from '../TechnischeAngaben';
import { namenDerStaende, standInWorten, standNamen, standZusatz } from './standInWorten';
import {
  useAppZurueckholen,
  useBereichZurueckholen,
  useExternInhalt,
  useGeraetZurueckholen,
  useSicherungStatus,
  useStaende,
  type Quelle,
  type Stand,
  type VorherStand,
} from './useSicherung';
import { fehlertext } from '@/utils/fehlertext';

type Was = 'app' | 'bereich' | 'geraet';

/** So viele Stände stehen zuerst da; der Rest auf „Alle zeigen“. */
const ERSTE_STAENDE = 8;

function fehlerText(fehler: unknown): string {
  const e = fehler as { name?: string };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
    return 'Das Gerät hat zu lange nicht geantwortet. Das Zurückholen kann trotzdem noch laufen; sehen Sie in ein paar Minuten nach.';
  }
  return fehlertext(fehler);
}

/** Die Quelle wählen: Datenträger oder dieses Gerät. Nur, wenn einer steckt. */
function QuellWahl({
  wert,
  onWahl,
  datentraegerName,
}: {
  wert: Quelle;
  onWahl: (q: Quelle) => void;
  datentraegerName: string;
}) {
  const optionen: { id: Quelle; text: string }[] = [
    { id: 'lokal', text: 'Dieses Gerät' },
    { id: 'extern', text: `Datenträger „${datentraegerName}“` },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Woher</Label>
      <div
        role="group"
        aria-label="Woher zurückholen"
        className="flex flex-wrap gap-2"
        data-testid="zurueck-quelle"
      >
        {optionen.map(o => (
          <Button
            key={o.id}
            type="button"
            size="sm"
            variant={wert === o.id ? 'default' : 'outline'}
            aria-pressed={wert === o.id}
            onClick={() => onWahl(o.id)}
            data-testid={`zurueck-quelle-${o.id}`}
          >
            {o.text}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** Das Feld für den Wiederherstellungscode, eingeklappt, bis man es braucht. */
function CodeFeld({ wert, onAenderung }: { wert: string; onAenderung: (v: string) => void }) {
  const [offen, setOffen] = useState(false);
  if (!offen) {
    return (
      <button
        type="button"
        className="self-start text-sm text-muted-foreground underline underline-offset-2"
        onClick={() => setOffen(true)}
        data-testid="zurueck-code-oeffnen"
      >
        Wiederherstellungscode eingeben
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="zurueck-code">Wiederherstellungscode</Label>
      <Input
        id="zurueck-code"
        value={wert}
        onChange={e => onAenderung(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        maxLength={100}
        data-testid="zurueck-code"
      />
      <p className="text-xs text-muted-foreground">
        Nur nötig, wenn der Schlüssel dieses Geräts nicht zur Sicherung passt. Sonst leer lassen.
      </p>
    </div>
  );
}

/** Eine Liste von Sätzen mit Haken oder Kreuz. */
function Satzliste({ saetze }: { saetze: { gut: boolean; text: string }[] }) {
  return (
    <ul className="flex flex-col gap-1.5" data-testid="zurueck-saetze">
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

/** Was nach einem Zurückholen stehen bleibt. */
interface Bericht {
  gut: boolean;
  kopf: string;
  saetze: { gut: boolean; text: string }[];
  vorher: VorherStand | null;
  ausgabe?: string;
}

/** Steht diese App in diesem Stand (ihr Paket oder eine ihrer Datenbanken)? */
function appImStand(stand: Stand, appId: string): boolean {
  const db = `arasul_app_${appId.replace(/-/g, '_')}_`;
  return stand.apps.some(a => a.id === appId) || stand.appDatenbanken.some(d => d.startsWith(db));
}

export function Zurueckholen() {
  const { data: status } = useSicherungStatus();
  const { data: extern } = useExternInhalt();
  const traeger = status?.ausserhalb?.datentraeger;
  const angesteckt = Boolean(traeger?.angesteckt && extern?.angesteckt);
  const [gewaehlteQuelle, setQuelle] = useState<Quelle>('lokal');
  const quelle: Quelle = angesteckt ? gewaehlteQuelle : 'lokal';

  const { data: staende = [], isLoading } = useStaende(quelle);
  const holeApp = useAppZurueckholen();
  const holeBereich = useBereichZurueckholen();
  const holeGeraet = useGeraetZurueckholen();
  const laeuft =
    holeApp.isPending ||
    holeBereich.isPending ||
    holeGeraet.isPending ||
    Boolean(status?.laeuftGerade);

  const [was, setWas] = useState<Was>('app');
  const [ziel, setZiel] = useState('');
  const [standId, setStandId] = useState('');
  const [alle, setAlle] = useState(false);
  const [offen, setOffen] = useState(false);
  const [passwort, setPasswort] = useState('');
  const [wort, setWort] = useState('');
  const [code, setCode] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [bericht, setBericht] = useState<Bericht | null>(null);

  const namen = useMemo(() => namenDerStaende(staende), [staende]);
  const zeitNamen = useMemo(() => standNamen(staende), [staende]);

  // Was sich zurückholen lässt: jede App, die in irgendeinem Stand steht;
  // jeder Bereich, den es am Gerät noch gibt (in einen weggeworfenen kommt
  // nichts zurück, das der Dienst sähe).
  const ziele = useMemo(() => {
    const gesehen = new Map<string, string>();
    for (const s of staende) {
      if (was === 'app') {
        for (const a of s.apps) gesehen.set(a.id, a.name ?? a.id);
      } else if (was === 'bereich') {
        for (const b of s.bereiche) if (b.vorhanden) gesehen.set(b.kennung, b.name ?? b.kennung);
      }
    }
    return [...gesehen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [staende, was]);

  const zielGueltig = was === 'geraet' || ziele.some(z => z.id === ziel);
  const passende = staende.filter(s =>
    was === 'geraet'
      ? true
      : !zielGueltig
        ? false
        : was === 'app'
          ? appImStand(s, ziel)
          : s.bereiche.some(b => b.kennung === ziel)
  );
  const sichtbar = alle ? passende : passende.slice(0, ERSTE_STAENDE);
  const stand = passende.find(s => s.id === standId) ?? null;
  const zielName =
    was === 'app'
      ? (namen.apps.get(ziel) ?? ziel)
      : was === 'bereich'
        ? (namen.bereiche.get(ziel) ?? ziel)
        : '';
  const wann = stand ? (zeitNamen.get(stand.id) ?? standInWorten(stand.zeitpunkt)) : '';

  const wechsleWas = (neu: Was) => {
    setWas(neu);
    setZiel('');
    setStandId('');
    setAlle(false);
    setBericht(null);
  };
  const schliessen = () => {
    setOffen(false);
    setPasswort('');
    setWort('');
    setFehler(null);
  };

  const fertig = (b: Bericht) => {
    setBericht(b);
    // Die Auswahl bleibt stehen: der Dialog blendet aus und zeigte sonst
    // „auf den Stand von zurückgeholt“ ohne Zeitpunkt (Bild am Orin).
    schliessen();
  };
  const vorherSatz = (v: VorherStand | null | undefined) =>
    v?.erfolg && v.zeitpunkt
      ? `Rückgängig machen: Wählen Sie den Stand „${standInWorten(v.zeitpunkt)}“ (vor dem Zurückholen) und holen Sie dasselbe noch einmal zurück.`
      : null;

  const absenden = (e: FormEvent) => {
    e.preventDefault();
    if (!stand || !passwort || laeuft) return;
    if (was === 'geraet' && wort.trim() !== 'wiederherstellen') return;
    setFehler(null);
    setBericht(null);
    const basis = { passwort, standId: stand.id, quelle, wiederherstellungscode: code };
    const beiFehler = (f: unknown) => setFehler(fehlerText(f));
    if (was === 'app') {
      holeApp.mutate(
        { app: ziel, ...basis },
        {
          onSuccess: r =>
            fertig({
              gut: r.erfolg,
              kopf: r.erfolg
                ? `Die App „${zielName}“ ist auf den Stand von ${wann} zurückgeholt.`
                : `Die App „${zielName}“ ist nicht vollständig zurückgekommen.`,
              saetze: r.bericht.map(b => ({ gut: b.erfolg, text: b.text })),
              vorher: r.vorher ?? null,
            }),
          onError: beiFehler,
        }
      );
    } else if (was === 'bereich') {
      holeBereich.mutate(
        { kennung: ziel, ...basis },
        {
          onSuccess: r =>
            fertig({
              gut: r.erfolg,
              kopf: r.erfolg
                ? `Der Bereich „${zielName}“ ist auf den Stand von ${wann} zurückgeholt.`
                : `Der Bereich „${zielName}“ ist nicht vollständig zurückgekommen.`,
              saetze: r.bericht.map(b => ({ gut: b.erfolg, text: b.text })),
              vorher: r.vorher ?? null,
              ausgabe: r.erfolg ? undefined : r.ausgabe,
            }),
          onError: beiFehler,
        }
      );
    } else {
      holeGeraet.mutate(basis, {
        onSuccess: r => {
          const laufen = r.apps.filter(a => a.erfolg);
          const nicht = r.apps.filter(a => !a.erfolg);
          fertig({
            gut: r.erfolg,
            kopf: r.erfolg
              ? `Das Gerät ist auf den Stand von ${wann} zurückgeholt.`
              : 'Das Gerät ist nicht vollständig zurückgekommen.',
            saetze: [
              ...(r.vorher
                ? [
                    {
                      gut: r.vorher.erfolg,
                      text: r.vorher.erfolg
                        ? 'Der jetzige Stand ist vorher gesichert. Mit ihm lässt sich dieses Zurückholen rückgängig machen.'
                        : 'Der jetzige Stand ließ sich nicht sichern. Deshalb wurde nichts zurückgeholt.',
                    },
                  ]
                : []),
              ...(r.vorher?.erfolg === false
                ? []
                : [
                    {
                      gut: r.erfolg || (r.bericht?.status ?? '') === 'fertig',
                      text:
                        r.bericht?.tabellen != null
                          ? `Die Datenbank ist zurück (${formatZahl(r.bericht.tabellen)} Tabellen).`
                          : (r.bericht?.grund ?? 'Die Datenbank wurde nicht zurückgeholt.'),
                    },
                  ]),
              ...laufen.map(a => ({
                gut: true,
                text: `Die App „${a.app_id}“ läuft wieder (${a.stand === 'live' ? 'Live' : 'Test'}).`,
              })),
              ...nicht.map(a => ({
                gut: false,
                text: `Die App „${a.app_id}“ (${a.stand === 'live' ? 'Live' : 'Test'}) läuft nicht wieder${a.grund ? `: ${a.grund}` : '.'}`,
              })),
            ],
            vorher: r.vorher ?? null,
            ausgabe: r.erfolg ? undefined : r.ausgabe,
          });
        },
        onError: beiFehler,
      });
    }
  };

  const wasText: Record<Was, string> = {
    app: 'Eine App',
    bereich: 'Einen Bereich des Firmenordners',
    geraet: 'Das ganze Gerät',
  };

  let dialogText: ReactNode = null;
  if (was === 'app') {
    dialogText = (
      <>
        Die App „{zielName}“ wird mit ihren Daten und ihrem Programm auf den Stand von {wann}{' '}
        zurückgeholt. Was seitdem in der App eingetragen wurde, ist danach nicht mehr da.
      </>
    );
  } else if (was === 'bereich') {
    dialogText = (
      <>
        Die Dateien im Bereich „{zielName}“ werden auf den Stand von {wann} zurückgeholt. Dateien,
        die seitdem dazukamen, werden entfernt; geänderte bekommen ihren Inhalt von damals. Andere
        Bereiche bleiben, wie sie sind.
      </>
    );
  } else {
    dialogText = (
      <>
        Alle Daten dieses Geräts werden durch den Stand von {wann} ersetzt: Personen, Apps,
        Freigaben und der Firmenordner. Danach werden die Apps neu aufgebaut. Das kann eine Stunde
        dauern.
      </>
    );
  }

  return (
    <Feldgruppe
      titel="Zurückholen"
      symbol={<RotateCcw />}
      beschreibung="Eine App, einen Bereich des Firmenordners oder das ganze Gerät auf einen früheren Stand. Vorher sichert Arasul den jetzigen Stand."
    >
      <div className="flex flex-col gap-5" data-testid="zurueckholen">
        {angesteckt && (
          <QuellWahl
            wert={quelle}
            onWahl={q => {
              setQuelle(q);
              setStandId('');
            }}
            datentraegerName={traeger?.name ?? 'Datenträger'}
          />
        )}

        {/* 1. Was */}
        <div className="flex flex-col gap-1.5">
          <Label>Was soll zurück?</Label>
          <div
            role="group"
            aria-label="Was zurückholen"
            className="flex flex-wrap gap-2"
            data-testid="zurueck-was"
          >
            {(['app', 'bereich', 'geraet'] as Was[]).map(w => (
              <Button
                key={w}
                type="button"
                size="sm"
                variant={was === w ? 'default' : 'outline'}
                aria-pressed={was === w}
                onClick={() => wechsleWas(w)}
                data-testid={`zurueck-was-${w}`}
              >
                {wasText[w]}
              </Button>
            ))}
          </div>
          {was === 'geraet' && (
            <p className="text-sm text-destructive" data-testid="zurueck-geraet-warnung">
              Das ersetzt alles auf diesem Gerät. Für eine einzelne App oder einen Bereich wählen
              Sie oben das Passende.
            </p>
          )}
        </div>

        {was !== 'geraet' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="zurueck-ziel">
              {was === 'app' ? 'Welche App?' : 'Welcher Bereich?'}
            </Label>
            {ziele.length === 0 ? (
              <Leerzustand
                symbol={<HardDrive />}
                titel={
                  isLoading
                    ? 'Lädt …'
                    : was === 'app'
                      ? 'In keinem Stand steht eine App'
                      : 'In keinem Stand steht ein Bereich, den es hier noch gibt'
                }
                beschreibung="Sobald gesichert wurde, stehen sie hier."
              />
            ) : (
              <Select
                value={zielGueltig ? ziel : ''}
                onValueChange={v => {
                  setZiel(v);
                  setStandId('');
                  setBericht(null);
                }}
              >
                <SelectTrigger id="zurueck-ziel" className="sm:w-80" data-testid="zurueck-ziel">
                  <SelectValue placeholder={was === 'app' ? 'App wählen' : 'Bereich wählen'} />
                </SelectTrigger>
                <SelectContent>
                  {ziele.map(z => (
                    <SelectItem key={z.id} value={z.id} data-testid={`zurueck-ziel-${z.id}`}>
                      {z.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* 2. Wann */}
        {zielGueltig && (
          <div className="flex flex-col gap-1.5">
            <Label>Auf welchen Stand?</Label>
            {passende.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {isLoading ? 'Lädt …' : 'Es gibt noch keinen Stand. Sichern Sie zuerst.'}
              </p>
            ) : (
              <RadioGroup
                value={standId}
                onValueChange={setStandId}
                className="flex flex-col gap-0 rounded-md border border-border"
                data-testid="zurueck-staende"
              >
                {sichtbar.map(s => {
                  const zusatz = standZusatz(s, namen);
                  return (
                    <Label
                      key={s.id}
                      htmlFor={`stand-${s.id}`}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 border-b border-border p-ui-3 font-normal last:border-b-0',
                        standId === s.id && 'bg-primary/12'
                      )}
                      data-testid={`zurueck-stand-${s.id.slice(0, 8)}`}
                    >
                      <RadioGroupItem value={s.id} id={`stand-${s.id}`} />
                      <span className="min-w-0">
                        <span className="text-sm font-medium text-foreground">
                          {zeitNamen.get(s.id) ?? standInWorten(s.zeitpunkt)}
                        </span>
                        {zusatz && (
                          <span className="block text-xs text-muted-foreground">{zusatz}</span>
                        )}
                      </span>
                    </Label>
                  );
                })}
              </RadioGroup>
            )}
            {passende.length > ERSTE_STAENDE && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => setAlle(!alle)}
                data-testid="zurueck-alle"
              >
                {alle
                  ? 'Nur die neuesten zeigen'
                  : `Alle ${formatZahl(passende.length)} Stände zeigen`}
              </Button>
            )}
            {stand && (
              <TechnischeAngaben
                kennzeichen="zurueck-technik"
                angaben={[
                  { beschriftung: 'Kennung des Stands', wert: stand.id },
                  { beschriftung: 'Zeitpunkt', wert: stand.zeitpunkt },
                  {
                    beschriftung: 'Neu geschrieben',
                    wert: stand.geschrieben != null ? formatBytes(stand.geschrieben) : null,
                  },
                  {
                    beschriftung: 'Quelle',
                    wert: quelle === 'extern' ? 'Datenträger' : 'dieses Gerät',
                  },
                ]}
              />
            )}
          </div>
        )}

        <div>
          <Button
            variant={was === 'geraet' ? 'destructive' : 'default'}
            onClick={() => {
              setBericht(null);
              setOffen(true);
            }}
            disabled={!stand || laeuft}
            data-testid="zurueck-weiter"
          >
            {was === 'geraet' ? 'Das ganze Gerät zurückholen …' : 'Zurückholen …'}
          </Button>
        </div>
      </div>

      {laeuft && !status?.laeuftGerade && (
        <p
          className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"
          data-testid="zurueck-laeuft"
        >
          <Loader2 className="size-4 animate-spin" /> Sichert den jetzigen Stand und holt dann
          zurück. Das dauert einige Minuten.
        </p>
      )}

      {bericht && (
        <div
          data-testid="zurueck-bericht"
          role="status"
          className={cn(
            'mt-4 rounded-md border-l-2 px-3 py-2',
            bericht.gut ? 'border-foreground' : 'border-destructive bg-destructive/5'
          )}
        >
          <p className="mb-2 text-sm font-medium text-foreground">{bericht.kopf}</p>
          <Satzliste saetze={bericht.saetze} />
          {vorherSatz(bericht.vorher) && (
            <p className="mt-2 text-sm text-muted-foreground" data-testid="zurueck-rueckgaengig">
              {vorherSatz(bericht.vorher)}
            </p>
          )}
          {bericht.ausgabe && (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-ui-xs text-muted-foreground">
              {bericht.ausgabe}
            </pre>
          )}
        </div>
      )}

      <Dialogform
        offen={offen}
        beiSchliessen={schliessen}
        titel="Zurückholen bestätigen"
        groesse="klein"
        fuss={
          <div className="flex w-full justify-end gap-3">
            <Button type="button" variant="outline" onClick={schliessen}>
              Abbrechen
            </Button>
            <Button
              type="submit"
              form="zurueck-bestaetigen"
              variant="destructive"
              disabled={
                !passwort || laeuft || (was === 'geraet' && wort.trim() !== 'wiederherstellen')
              }
              data-testid="zurueck-absenden"
            >
              {laeuft ? 'Holt zurück …' : was === 'geraet' ? 'Alles ersetzen' : 'Zurückholen'}
            </Button>
          </div>
        }
      >
        <form id="zurueck-bestaetigen" className="flex flex-col gap-4" onSubmit={absenden}>
          <p className="text-sm text-foreground" data-testid="zurueck-dialog-text">
            {dialogText}
          </p>
          <p className="text-sm text-muted-foreground">
            Vorher sichert Arasul den jetzigen Stand. Mit ihm können Sie das Zurückholen rückgängig
            machen.
          </p>
          {fehler && (
            <Alert variant="destructive" data-testid="zurueck-fehler">
              <AlertDescription>{fehler}</AlertDescription>
            </Alert>
          )}
          {quelle === 'extern' && <CodeFeld wert={code} onAenderung={setCode} />}
          {was === 'geraet' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="zurueck-wort">
                Zur Bestätigung das Wort eintippen:{' '}
                <span className="font-mono text-foreground">wiederherstellen</span>
              </Label>
              <Input
                id="zurueck-wort"
                value={wort}
                onChange={e => setWort(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                data-testid="zurueck-wort"
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="zurueck-passwort">Ihr Passwort</Label>
            <Input
              id="zurueck-passwort"
              type="password"
              value={passwort}
              onChange={e => setPasswort(e.target.value)}
              autoComplete="current-password"
              data-testid="zurueck-passwort"
            />
          </div>
        </form>
      </Dialogform>
    </Feldgruppe>
  );
}
