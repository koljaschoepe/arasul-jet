/**
 * Die Flows einer App auf ihrer Seite (Phase D4, seit M5 mit Schritten, Art,
 * Auslöser und dem Schalter „aktiv").
 *
 * Je Flow eine Zeile mit dem, was ein Admin entscheidet: ob er läuft (aktiv)
 * und wie (Art). Darunter in einem Satz, wann er startet und wie viele
 * Schritte er hat. Schritte, Stufen, Modell und die Datei klappen auf: das ist
 * Technik, die man nachliest, nicht täglich schaltet.
 *
 * ZEITPLAN: hat der Flow einen, steht darunter der nächste Lauf in Worten und
 * ein Knopf „Zeitplan pausieren". Die Pause trifft nur den Zeitplan; der
 * Schalter „aktiv" und der Start von Hand bleiben (Migration 203).
 *
 * AUS HEISST AUS: ein inaktiver Flow startet nicht, das Backend weist jeden
 * Start mit 409 `FLOW_INAKTIV` ab (`flowRunner.starten`). Ein Lauf, der schon
 * läuft oder auf eine Freigabe wartet, geht zu Ende.
 */
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
} from '@marken';
import { useToast } from '@/contexts/ToastContext';
import type { Stand } from '../personen/useAppFreigaben';
import { Aufklappen } from './Aufklappen';
import { ModellZeile } from './FlowAnsicht';
import {
  FLOW_ART_NAME,
  useFlowAktiv,
  useFlowArt,
  useFlowZeitplan,
  type AppFlow,
  type FlowZeitplan,
  type FlowArt,
  type FlowAusloeser,
} from './useAppVerwaltung';

const WOCHENTAGE = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
];

/**
 * Ein Zeitplan in Worten, so weit es ohne Rätselraten geht: „werktags um
 * 06:00", „täglich um 18:30", „montags um 07:15". Alles andere heißt „nach
 * Zeitplan", der Ausdruck steht aufgeklappt daneben.
 */
function zeitplanInWorten(ausdruck: string): string {
  const [minute, stunde, tag, monat, wochentag] = ausdruck.split(' ');
  if (!minute || !stunde || !/^\d+$/.test(minute) || !/^\d+$/.test(stunde)) return 'nach Zeitplan';
  if (tag !== '*' || monat !== '*') return 'nach Zeitplan';
  const uhr = `um ${stunde.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  if (wochentag === '*') return `täglich ${uhr}`;
  if (wochentag === '1-5') return `werktags ${uhr}`;
  const name = /^\d$/.test(wochentag ?? '') ? WOCHENTAGE[Number(wochentag) % 7] : undefined;
  return name ? `${name.toLowerCase()}s ${uhr}` : 'nach Zeitplan';
}

function ausloeserInWorten(a: FlowAusloeser): string {
  switch (a.typ) {
    case 'hand':
      return 'von Hand in der App';
    case 'zeitplan':
      return zeitplanInWorten(a.zeitplan);
    case 'ereignis':
      return `bei „${a.ereignis}“`;
  }
}

/**
 * Ein Termin in Worten, in der Zeitzone des Geräts: „heute um 18:30 Uhr",
 * „morgen um 06:00 Uhr", sonst „Montag, 5. Oktober, um 06:00 Uhr".
 */
export function terminInWorten(iso: string, zone: string, jetzt: Date = new Date()): string {
  const tagVon = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(d); // JJJJ-MM-TT
  const uhr = new Intl.DateTimeFormat('de-DE', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
  const tag = new Date(iso);
  const morgen = new Date(jetzt.getTime() + 24 * 60 * 60 * 1000);
  if (tagVon(tag) === tagVon(jetzt)) return `heute um ${uhr} Uhr`;
  if (tagVon(tag) === tagVon(morgen)) return `morgen um ${uhr} Uhr`;
  const datum = new Intl.DateTimeFormat('de-DE', {
    timeZone: zone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(tag);
  return `${datum}, um ${uhr} Uhr`;
}

/** Was der Zeitplan eines Flows gerade tut, in einem Satz. */
function zeitplanSatz(z: FlowZeitplan): string {
  switch (z.laeuft_nicht) {
    case 'teststand':
      return 'Im Teststand läuft kein Zeitplan.';
    case 'pausiert':
      return 'Zeitplan pausiert, der Flow startet nicht von allein.';
    case 'ausgeschaltet':
      return 'Der Flow ist aus, der Zeitplan startet nichts.';
    default:
      return z.naechster_termin
        ? `Nächster Lauf: ${terminInWorten(z.naechster_termin, z.zeitzone)}`
        : 'Kein weiterer Termin in den nächsten Jahren.';
  }
}

/** Der letzte Termin, wenn er etwas zu sagen hat: nachgeholt oder übersprungen. */
function letzterTerminSatz(z: FlowZeitplan): string | null {
  const l = z.letzter_termin;
  if (!l || l.ergebnis === 'gestartet') return null;
  if (l.ergebnis === 'nachgeholt') {
    return `Der Termin ${terminInWorten(l.termin, z.zeitzone)} wurde nachgeholt, das Gerät war zu der Zeit nicht erreichbar.`;
  }
  return l.grund ?? `Der Termin ${terminInWorten(l.termin, z.zeitzone)} wurde übersprungen.`;
}

/** Der eine Satz unter dem Namen: wann er startet, wie viele Schritte. */
function ablaufSatz(f: AppFlow): string {
  const wann = (f.ausloeser ?? [{ typ: 'hand' as const }]).map(ausloeserInWorten).join(', ');
  const n = f.schritte?.length ?? 0;
  const schritte = n === 0 ? 'das Modell führt' : n === 1 ? '1 Schritt' : `${n} Schritte`;
  return `Startet ${wann} · ${schritte}`;
}

function FlowZeile({
  f,
  laeuft,
  onAktiv,
  onArt,
  onZeitplan,
  onModell,
  onOeffnen,
}: {
  f: AppFlow;
  laeuft: boolean;
  onAktiv: (aktiv: boolean) => void;
  onArt: (art: FlowArt) => void;
  onZeitplan: (pausiert: boolean) => void;
  onModell: () => void;
  onOeffnen: () => void;
}) {
  const aktiv = f.aktiv !== false;
  const zeitplaene = (f.ausloeser ?? []).filter(
    (a): a is Extract<FlowAusloeser, { typ: 'zeitplan' }> => a.typ === 'zeitplan'
  );
  return (
    <li
      className="flex flex-col gap-1 border-b border-border p-ui-3 last:border-b-0"
      data-testid={`flow-${f.name}`}
      data-aktiv={aktiv ? 'true' : 'false'}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Switch
          checked={aktiv}
          disabled={laeuft}
          aria-label={`Flow ${f.name} aktiv`}
          data-testid={`flow-aktiv-${f.name}`}
          onCheckedChange={onAktiv}
        />
        <span className="min-w-0 flex-[1_1_12rem]">
          <span
            className={cn(
              'block text-sm font-medium',
              aktiv ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {f.name}
            {!aktiv && (
              <span className="ml-2 font-normal text-xs" data-testid={`flow-aus-${f.name}`}>
                aus, startet nicht
              </span>
            )}
          </span>
          {f.beschreibung && (
            <span className="block truncate text-xs text-muted-foreground">{f.beschreibung}</span>
          )}
          <span
            className="block text-xs text-muted-foreground"
            data-testid={`flow-ablauf-${f.name}`}
          >
            {ablaufSatz(f)}
          </span>
          {f.zeitplan && (
            <span
              className="block text-xs text-muted-foreground"
              data-testid={`flow-zeitplan-${f.name}`}
              data-pausiert={f.zeitplan.pausiert ? 'true' : 'false'}
            >
              {zeitplanSatz(f.zeitplan)}
            </span>
          )}
          {f.zeitplan && letzterTerminSatz(f.zeitplan) && (
            <span
              className="block text-xs text-destructive"
              data-testid={`flow-zeitplan-letzter-${f.name}`}
            >
              {letzterTerminSatz(f.zeitplan)}
            </span>
          )}
        </span>
        {f.zeitplan && f.zeitplan.laeuft_nicht !== 'teststand' && (
          <Button
            variant="outline"
            size="sm"
            disabled={laeuft}
            onClick={() => onZeitplan(!f.zeitplan?.pausiert)}
            data-testid={`flow-zeitplan-knopf-${f.name}`}
          >
            {f.zeitplan.pausiert ? 'Zeitplan fortsetzen' : 'Zeitplan pausieren'}
          </Button>
        )}
        {f.arten.length > 1 ? (
          <Select value={f.art} disabled={laeuft} onValueChange={wert => onArt(wert as FlowArt)}>
            <SelectTrigger
              size="sm"
              className="w-48"
              aria-label={`Art des Flows ${f.name}`}
              data-testid={`flow-art-${f.name}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {f.arten.map(a => (
                <SelectItem key={a} value={a} data-testid={`flow-art-${f.name}-${a}`}>
                  {FLOW_ART_NAME[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs text-muted-foreground" data-testid={`flow-art-fest-${f.name}`}>
            {FLOW_ART_NAME[f.art]}
          </span>
        )}
      </div>

      <Aufklappen titel="Schritte, Modell und Datei" kennzeichen={`flow-mehr-${f.name}`}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 pl-ui-2 text-sm">
          <dt className="text-muted-foreground">Schritte</dt>
          <dd data-testid={`flow-schritte-${f.name}`}>
            {f.schritte?.length ? (
              <ol className="flex flex-col gap-0.5">
                {f.schritte.map((s, i) => (
                  <li key={s.name}>
                    <span className="text-muted-foreground">{i + 1}.</span> {s.name}
                    {(s.werkzeug || s.rolle) && (
                      <span className="text-muted-foreground">
                        {' '}
                        ({s.werkzeug ? `Werkzeug ${s.werkzeug}` : `Rolle ${s.rolle}`})
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <span className="text-muted-foreground">
                keine festen Schritte, das Modell führt mit seinen Werkzeugen
              </span>
            )}
          </dd>
          {(f.stufen?.length ?? 0) > 0 && (
            <>
              <dt className="text-muted-foreground">Freigaben</dt>
              <dd>{f.stufen.map(st => st.bezeichnung || st.name).join(', dann ')}</dd>
            </>
          )}
          {zeitplaene.length > 0 && (
            <>
              <dt className="text-muted-foreground">Zeitplan</dt>
              <dd className="font-mono text-xs">{zeitplaene.map(z => z.zeitplan).join(', ')}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Modell</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <ModellZeile
              modell={f.modell}
              ueberschrieben={f.modell_ueberschrieben}
              extern={f.extern}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={onModell}
              data-testid={`flow-modell-${f.name}`}
            >
              Modell ändern
            </Button>
          </dd>
        </dl>
        <Button
          variant="ghost"
          size="sm"
          className="mt-1"
          onClick={onOeffnen}
          data-testid={`flow-oeffnen-${f.name}`}
        >
          Datei mit Auftrag an das Modell lesen
        </Button>
      </Aufklappen>
    </li>
  );
}

export function AppFlows({
  appId,
  flows,
  stand,
  onModell,
  onOeffnen,
}: {
  appId: string;
  flows: AppFlow[];
  stand: Stand;
  onModell: (flow: AppFlow) => void;
  onOeffnen: (name: string, stand: Stand) => void;
}) {
  const toast = useToast();
  const artSetzen = useFlowArt(appId);
  const aktivSetzen = useFlowAktiv(appId);
  const zeitplanSetzen = useFlowZeitplan(appId);

  if (flows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="flows-leer">
        Diese Fassung bringt keine Flows mit.
      </p>
    );
  }

  const handleAktiv = (f: AppFlow, aktiv: boolean) =>
    aktivSetzen.mutate(
      { flow: f.name, aktiv },
      {
        onSuccess: () =>
          toast.success(
            aktiv
              ? `„${f.name}“ ist wieder aktiv.`
              : `„${f.name}“ ist aus und startet nicht, bis Sie ihn wieder einschalten.`
          ),
      }
    );

  const handleZeitplan = (f: AppFlow, pausiert: boolean) =>
    zeitplanSetzen.mutate(
      { flow: f.name, pausiert },
      {
        onSuccess: () =>
          toast.success(
            pausiert
              ? `Der Zeitplan von „${f.name}“ ist pausiert. Verpasste Termine werden nicht nachgeholt.`
              : `Der Zeitplan von „${f.name}“ läuft wieder.`
          ),
      }
    );

  const handleArt = (f: AppFlow, art: FlowArt) =>
    artSetzen.mutate(
      { flow: f.name, art },
      {
        onSuccess: () =>
          toast.success(`„${f.name}“ läuft ab dem nächsten Lauf: ${FLOW_ART_NAME[art]}.`),
      }
    );

  return (
    <ul className="flex flex-col rounded-md border border-border" data-testid="flow-liste">
      {flows.map(f => (
        <FlowZeile
          key={f.name}
          f={f}
          laeuft={artSetzen.isPending || aktivSetzen.isPending || zeitplanSetzen.isPending}
          onAktiv={aktiv => handleAktiv(f, aktiv)}
          onArt={art => handleArt(f, art)}
          onZeitplan={pausiert => handleZeitplan(f, pausiert)}
          onModell={() => onModell(f)}
          onOeffnen={() => onOeffnen(f.name, stand)}
        />
      ))}
    </ul>
  );
}
