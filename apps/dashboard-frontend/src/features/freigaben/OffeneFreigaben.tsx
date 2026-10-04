/**
 * „Für Sie" auf der Startseite (M5, 04.10.2026): die Freigaben, die bei mir
 * liegen, je Zeile die App, der Gegenstand und seit wann.
 *
 * ZWEI WEGE, je nachdem, was die App im Manifest erklärt (`zeigt_freigaben`,
 * Kontrakt 12, `docs/features/APP-PAKET.md`):
 *  - Sie zeigt ihre Freigaben selbst: ein Klick öffnet die App beim Vorgang
 *    (`?freigabe=<nummer>`), entschieden wird dort.
 *  - Sie sagt nichts (jede App vor Kontrakt 12) : das Gerät fällt zurück und
 *    öffnet die Freigabe HIER, mit dem Baustein `Freigabe` der Bibliothek —
 *    Original, Felder, Bestätigen, Ablehnen —, und danach steht wieder die
 *    Liste da. Ohne diesen Rückfall könnte niemand die Freigaben einer App
 *    entscheiden, die den Tieflink nicht liest (04.10.2026, `belege`).
 * Es ist derselbe Baustein und dieselbe Regel des Backends (Einreicher 403,
 * `liegt_bei` 409); der Rückfall ist keine zweite Entscheidung, nur eine
 * zweite Stelle, an der sie getroffen wird.
 *
 * Eine neue Freigabe liegt bei der Standardperson ihrer Stufe, die der
 * Administrator je App setzt; ohne sie bei allen mit Zugang. Jeder mit Zugang
 * kann eine Freigabe übernehmen oder weitergeben. Deshalb steht unter jeder
 * Zeile, bei wem sie liegt, mit „Weitergeben an …", und darunter — zugeklappt —
 * was bei anderen liegt, mit „Übernehmen". Die Zahl am Haus zählt nur die
 * Liste oben (`useOffeneFreigaben`); das Backend filtert, nicht diese Datei.
 *
 * Leer steht dort EINE Zeile („Keine Freigabe liegt bei Ihnen."): wer
 * eingereicht hat und vier Augen braucht, muss wissen, WO Freigaben stehen.
 *
 * WAS HIER NICHT STEHT: eine Historie der entschiedenen Freigaben. Die Liste
 * ist ein Posteingang, kein Archiv.
 */
import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, ClipboardCheck, Send, UserRound } from 'lucide-react';
import {
  Button,
  Freigabe,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type FreigabeEintrag,
} from '@marken';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useToast } from '@/contexts/ToastContext';
import {
  useOffeneFreigaben,
  useEingereichteFreigaben,
  useFreigabeEntscheiden,
  useFreigabenBeiAnderen,
  useFreigabeVerlegen,
  type OffeneFreigabe,
} from '@/hooks/useOffeneFreigaben';
import { wartetSeit, oderListe } from './frist';

/**
 * Die Regel des Laufs als Satz, oder nichts (26.09.2026).
 *
 * Bis dahin stand hier ein Abzeichen „Vier Augen" mit der Erklärung im
 * `title` — also nur für den, der mit der Maus darüberfährt, und nie am
 * Telefon. Wer entscheidet, soll lesen, WARUM ausgerechnet er gefragt ist.
 */
function regelSatz(f: {
  einreicher?: string | null;
  ohne_einreicher?: boolean;
  entscheider?: OffeneFreigabe['entscheider'];
}): string | null {
  const teile: string[] = [];
  if (f.ohne_einreicher) {
    teile.push(
      f.einreicher
        ? `Vier-Augen-Prinzip: ${f.einreicher} hat eingereicht und entscheidet nicht mit.`
        : 'Vier-Augen-Prinzip: wer eingereicht hat, entscheidet nicht mit.'
    );
  }
  if (f.entscheider && 'rolle' in f.entscheider) {
    teile.push('Entscheiden darf nur ein Administrator.');
  } else if (f.entscheider && 'konten' in f.entscheider) {
    teile.push(`Entscheiden dürfen nur ${oderListe(f.entscheider.konten)}.`);
  }
  return teile.length > 0 ? teile.join(' ') : null;
}

/** Die Stufe in Worten: die Bezeichnung aus dem Flow, sonst ihr Name. */
function stufeName(f: Pick<OffeneFreigabe, 'stufe' | 'stufe_bezeichnung'>): string | null {
  return f.stufe_bezeichnung || f.stufe || null;
}

/**
 * Die Anfrage in der Form des Musters. Der NAME der App und nicht ihre Kennung
 * (26.09.2026): „belege" ist ein Pfad, „Belege" ist das, was der Mensch links
 * in seiner Leiste sieht.
 */
function alsEintrag(f: OffeneFreigabe, fuss?: ReactNode): FreigabeEintrag {
  const stufe = stufeName(f);
  return {
    id: f.id,
    titel: f.titel,
    zusammenhang: f.zusammenhang,
    herkunft:
      `${f.stand === 'test' ? '(Test) ' : ''}${f.app_name || f.app_id}` +
      (stufe ? ` · Stufe ${stufe}` : ''),
    einreicher: f.einreicher,
    frist: f.frist,
    angefragtAm: f.angefragt_am,
    regel: regelSatz(f),
    felder: f.felder ?? null,
    original: f.original ?? null,
    bisher: (f.frueher ?? []).map(v => ({
      titel: v.titel,
      stufe: v.stufe,
      status: v.status,
      entschiedenVon: v.entschieden_von,
      entschiedenAm: v.entschieden_am,
      begruendung: v.begruendung,
      korrekturen: v.korrekturen,
    })),
    fuss,
  };
}

/**
 * Was ich eingereicht habe und noch offen ist: eine Zeile je Vorgang, mit dem
 * Kreis, bei dem er liegt (26.09.2026).
 *
 * Bei vier Augen sieht der Einreicher seine Anfrage in der Liste darüber NICHT
 * — richtig, er darf sie nicht entscheiden. Aber bis hierher erfuhr er auch
 * nirgends, dass sie existiert und bei wem sie liegt; aus seiner Sicht war der
 * Vorgang nach dem Absenden verschwunden. Keine Karte, keine Knöpfe: zu tun
 * gibt es hier nichts, nur zu wissen.
 */
function Eingereicht() {
  const { data } = useEingereichteFreigaben();
  if (!data || data.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1" data-testid="eingereichte-freigaben">
      {data.map(e => (
        <li
          key={e.id}
          className="flex items-start gap-2 text-sm text-muted-foreground"
          data-testid={`eingereicht-${e.id}`}
        >
          <Send className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Ihr Vorgang <span className="font-medium text-foreground">„{e.titel}“</span> (
            {e.app_name || e.app_id}) {wartetSeit(e.angefragt_am)}
            {e.liegt_bei
              ? ` bei ${e.liegt_bei}.`
              : e.kreis.length > 0
                ? ` auf ${oderListe(e.kreis)}.`
                : '; niemand kann ihn entscheiden.'}
            {e.ohne_einreicher && ' Vier-Augen-Prinzip: Sie entscheiden nicht mit.'}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Unter jeder Karte: bei wem sie liegt, und an wen sie weitergehen kann (M5).
 *
 * Weitergeben geht nur an jemanden aus dem Kreis — das Backend prüft es, und
 * die Auswahl zeigt auch nur diese. Ohne Standardperson liegt die Freigabe bei
 * allen mit Zugang; der Administrator liest dazu, wo er das ändert.
 */
function Zustaendigkeit({
  f,
  ich,
  istAdmin,
}: {
  f: OffeneFreigabe;
  ich: string;
  istAdmin: boolean;
}) {
  const verlegen = useFreigabeVerlegen();
  const toast = useToast();
  const andere = (f.kreis ?? []).filter(k => k !== ich);
  const stufe = stufeName(f);

  const weitergeben = (an: string) => {
    verlegen.mutate(
      { id: f.id, an },
      { onSuccess: () => toast.success(`„${f.titel}" liegt jetzt bei ${an}.`) }
    );
  };

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-ui-3 pb-ui-2 text-xs text-muted-foreground empty:hidden"
      data-testid={`freigabe-${f.id}-zustaendig`}
    >
      <span className="flex items-center gap-1">
        <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
        {f.liegt_bei ? 'Liegt bei Ihnen.' : 'Liegt bei allen mit Zugang.'}
      </span>
      {!f.liegt_bei && istAdmin && (
        <span data-testid={`freigabe-${f.id}-hinweis`}>
          Keine Standardperson{stufe ? ` für die Stufe ${stufe}` : ''}: setzen unter Verwaltung,
          Apps, {f.app_name || f.app_id}.
        </span>
      )}
      {andere.length > 0 && (
        <Select value="" disabled={verlegen.isPending} onValueChange={weitergeben}>
          <SelectTrigger
            size="sm"
            className="h-7 w-auto gap-1 text-xs"
            aria-label={`${f.titel} weitergeben`}
            data-testid={`freigabe-${f.id}-weitergeben`}
          >
            <SelectValue placeholder="Weitergeben an …" />
          </SelectTrigger>
          <SelectContent>
            {andere.map(k => (
              <SelectItem key={k} value={k} data-testid={`freigabe-${f.id}-an-${k}`}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

/**
 * Was bei anderen liegt und ich übernehmen kann (M5). Zugeklappt: die Seite
 * heißt „Für Sie", und dies ist nicht für mich, solange ich es nicht nehme.
 */
function BeiAnderen() {
  const { data } = useFreigabenBeiAnderen();
  const verlegen = useFreigabeVerlegen();
  const toast = useToast();
  const [offen, setOffen] = useState(false);
  if (!data || data.length === 0) return null;

  const uebernehmen = (f: OffeneFreigabe) => {
    verlegen.mutate(
      { id: f.id },
      { onSuccess: () => toast.success(`„${f.titel}" liegt jetzt bei Ihnen.`) }
    );
  };

  return (
    <div className="mt-3" data-testid="freigaben-bei-anderen">
      <button
        type="button"
        onClick={() => setOffen(o => !o)}
        aria-expanded={offen}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        data-testid="freigaben-bei-anderen-schalter"
      >
        {offen ? (
          <ChevronDown className="size-4" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-4" aria-hidden="true" />
        )}
        {data.length === 1
          ? '1 Freigabe liegt bei anderen'
          : `${data.length} Freigaben liegen bei anderen`}
      </button>
      {offen && (
        <ul className="mt-2 flex flex-col rounded-md border border-border">
          {data.map(f => {
            const stufe = stufeName(f);
            return (
              <li
                key={f.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border p-ui-3 last:border-b-0"
                data-testid={`bei-anderen-${f.id}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{f.titel}</span>
                  <span className="block text-xs text-muted-foreground">
                    {f.app_name || f.app_id}
                    {stufe ? ` · Stufe ${stufe}` : ''} · liegt bei {f.liegt_bei} ·{' '}
                    {wartetSeit(f.angefragt_am)}
                  </span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={verlegen.isPending}
                  onClick={() => uebernehmen(f)}
                  data-testid={`bei-anderen-${f.id}-uebernehmen`}
                >
                  Übernehmen
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Eine Zeile: App, Gegenstand, seit wann. Der Klick öffnet die App beim
 * Vorgang; „Weitergeben" und der Hinweis stehen darunter.
 */
function Zeile({
  f,
  ich,
  istAdmin,
  imGeraet,
}: {
  f: OffeneFreigabe;
  ich: string;
  istAdmin: boolean;
  /** Öffnet die Freigabe in Arasul statt in der App (Rückfall). */
  imGeraet: (id: number) => void;
}) {
  const oeffne = useWorkspaceStore(s => s.oeffne);
  const app = `${f.stand === 'test' ? '(Test) ' : ''}${f.app_name || f.app_id}`;
  const stufe = stufeName(f);
  return (
    <li className="border-b border-border last:border-b-0" data-testid={`freigabe-${f.id}`}>
      <button
        type="button"
        onClick={() =>
          f.app_zeigt_freigaben
            ? oeffne({
                type: 'app',
                appId: f.app_id,
                stand: f.stand,
                vorgang: f.id,
                title: f.app_name || f.app_id,
              })
            : imGeraet(f.id)
        }
        className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-0.5 p-ui-3 text-left transition-colors duration-[120ms] hover:bg-primary/12 motion-reduce:transition-none"
        data-testid={`freigabe-${f.id}-oeffnen`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{f.titel}</span>
          <span className="block text-xs text-muted-foreground">
            {app}
            {stufe ? ` · Stufe ${stufe}` : ''}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          {wartetSeit(f.liegt_seit ?? f.angefragt_am)}
        </span>
      </button>
      <Zustaendigkeit f={f} ich={ich} istAdmin={istAdmin} />
    </li>
  );
}

export function OffeneFreigaben() {
  const { data, isLoading, isError } = useOffeneFreigaben();
  const { user } = useAuth();
  const ich = user?.username ?? '';
  const istAdmin = user?.role === 'admin';
  const entscheiden = useFreigabeEntscheiden();
  const toast = useToast();
  // Die Freigabe, die gerade in Arasul offen ist (Rückfall); `null` ist die Liste.
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);

  /**
   * Nach dem Erfolg wird gesagt, ob der Lauf WIRKLICH weiterläuft.
   * `fortgesetzt: false` heißt: die Entscheidung steht in der Datenbank, aber
   * niemand führt den Lauf mehr fort (das Backend ist zwischendurch neu
   * gestartet). Das zu verschweigen hieße, jemanden auf ein Ergebnis warten zu
   * lassen, das nie kommt. Ein Fehler läuft über den Toast von `useApi` und
   * wirft hier weiter -- das Muster lässt dann das Feld offen.
   */
  const entscheide = async (
    e: FreigabeEintrag,
    status: 'bestaetigt' | 'abgelehnt',
    grund = '',
    felder?: Record<string, string>
  ) => {
    const d = await entscheiden.mutateAsync(
      status === 'bestaetigt'
        ? { id: Number(e.id), status, ...(felder ? { felder } : {}) }
        : { id: Number(e.id), status, begruendung: grund }
    );
    const was = status === 'bestaetigt' ? 'bestätigt' : 'abgelehnt';
    const geaendert = d.korrekturen?.length ?? 0;
    if (!d.fortgesetzt) {
      toast.warning(
        `„${e.titel}" ist ${was}. Der Lauf wird aber nicht mehr fortgesetzt: ` +
          'das Gerät wurde zwischendurch neu gestartet.'
      );
    } else {
      toast.success(
        status === 'bestaetigt'
          ? `„${e.titel}" freigegeben${
              geaendert === 1
                ? ', 1 Feld geändert'
                : geaendert > 1
                  ? `, ${geaendert} Felder geändert`
                  : ''
            }. Der Lauf läuft weiter.`
          : `„${e.titel}" abgelehnt. Der Lauf ist beendet.`
      );
    }
  };

  // Beim ersten Laden bleibt der Platz leer statt ein Skelett zu zeigen: in
  // aller Regel ist die Liste leer, und ein Skelett, das zu einer Zeile
  // zusammenfällt, stiftet nur Unruhe. Nach einem Fehler steht ebenfalls
  // nichts da — „keine Freigabe" wäre dann eine Behauptung, keine Auskunft.
  if (isLoading || isError || !data) return null;

  if (data.length === 0) {
    return (
      <section className="mb-6" data-testid="offene-freigaben" data-leer="true">
        <h2 className="mb-1 text-sm font-medium text-foreground">Für Sie</h2>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ClipboardCheck className="size-4 shrink-0" aria-hidden="true" />
          Keine Freigabe liegt bei Ihnen.
        </p>
        <BeiAnderen />
        <Eingereicht />
      </section>
    );
  }

  // Die Einzelansicht im Gerät: der Baustein mit den Freigaben, die die App
  // nicht selbst zeigt. Nach der Entscheidung ruft er `beiWahl(null)`, und die
  // Liste steht wieder da; ist die Anfrage inzwischen weg (ein anderer war
  // schneller), fällt er von selbst auf die Liste zurück.
  const imGeraet = data.filter(f => !f.app_zeigt_freigaben);
  if (gewaehlt !== null && imGeraet.some(f => f.id === gewaehlt)) {
    return (
      <section className="mb-6" data-testid="offene-freigaben" data-einzeln="true">
        <div data-testid="freigabe-im-geraet">
          <Freigabe
            eintraege={imGeraet.map(f =>
              alsEintrag(f, <Zustaendigkeit f={f} ich={ich} istAdmin={istAdmin} />)
            )}
            gewaehlt={gewaehlt}
            beiWahl={id => setGewaehlt(id === null ? null : Number(id))}
            beiBestaetigen={(e, felder) => entscheide(e, 'bestaetigt', '', felder)}
            beiAblehnen={(e, grund) => entscheide(e, 'abgelehnt', grund)}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6" data-testid="offene-freigaben">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
        <ClipboardCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        Für Sie
        <span className="font-normal text-muted-foreground" data-testid="fuer-sie-zahl">
          {data.length === 1 ? '1 Freigabe' : `${data.length} Freigaben`}
        </span>
      </h2>
      <ul className="flex flex-col rounded-md border border-border" data-testid="fuer-sie">
        {data.map(f => (
          <Zeile key={f.id} f={f} ich={ich} istAdmin={istAdmin} imGeraet={setGewaehlt} />
        ))}
      </ul>
      <BeiAnderen />
      <Eingereicht />
    </section>
  );
}
