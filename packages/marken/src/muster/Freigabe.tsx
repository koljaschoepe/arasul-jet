import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, CheckCircle2, Clock, ClipboardCheck, XCircle } from 'lucide-react';

import { cn } from '../cn';
import { Badge } from '../primitive/badge';
import { Button } from '../primitive/button';
import { Textarea } from '../primitive/textarea';
import { Leerzustand } from './Leerzustand';
import { istKnapp, restzeit, wartetSeit } from './freigabeFrist';

/**
 * Eine Freigabe: jemand soll etwas bestätigen oder ablehnen, bevor es weitergeht.
 *
 * WARUM ES DAS ALS MUSTER GIBT. Ein Flow kann anhalten und eine Freigabe
 * verlangen. Früher stand die Entscheidung in der Übersicht des Geräts,
 * für jeden, der angemeldet war, mit der Folge, dass ein Mitarbeiter eine
 * Liste sah, in der er den Zusammenhang nicht kannte. Eine Freigabe gehört in
 * die App, in der sie entsteht, und diese Form ist die, die jede App dafür
 * benutzt. Dass die Shell dasselbe Muster für den Administrator benutzt, ist
 * kein Zufall, sondern der Beweis: zwei Aussehen derselben Entscheidung wären
 * der Anfang von zwei Wahrheiten darüber, was „bestätigen" heißt.
 *
 * DREI DINGE, DIE JEDE FREIGABE ZEIGT: worum es geht (Titel, Zusammenhang), wie
 * lange noch Zeit bleibt (Frist als Dauer), und (nach der Entscheidung) WER
 * sie getroffen hat und mit welcher Begründung. Wer eine Ablehnung liest,
 * will den Grund wissen und den Namen.
 *
 * DIE ABLEHNUNG VERLANGT EINEN GRUND. Eine Ablehnung beendet die Arbeit eines
 * anderen Menschen; wer sie schreibt, sieht dabei den Titel und den
 * Zusammenhang, über den er urteilt. Deshalb klappt ein Feld AUF, statt dass
 * sich ein Dialog darüberlegt, und der Knopf bleibt gesperrt, solange es
 * leer ist.
 *
 * SIE WISSEN NICHTS VON ARASUL. Kein Endpunkt, keine Rolle: das Muster
 * bekommt Einträge und zwei Funktionen. Was entscheiden darf, entscheidet die
 * App (oder das Backend) und gibt nur Einträge herein, bei denen es der
 * Betrachter darf. Wirft eine der Funktionen, bleibt das Feld offen und der
 * Text steht; die Fehlermeldung zeigt der Aufrufer.
 *
 * ZWEI ANSICHTEN, EINE KOMPONENTE: die Liste (jede Freigabe als Karte mit
 * ihren Knöpfen) und die Einzelansicht (eine Freigabe ganz, mit Zurück). Wer
 * `gewaehlt` setzt, steuert sie von außen, etwa aus einer Adresse; ohne die
 * Eigenschaft führt die Komponente es selbst.
 */
export interface FreigabeEintrag {
  id: string | number;
  titel: string;
  /** Worum es geht, in ganzen Sätzen. */
  zusammenhang?: string | null;
  /** Woher die Anfrage kommt, in einer Zeile (etwa der Name der App). */
  herkunft?: ReactNode;
  /** Wer sie gestellt hat. */
  einreicher?: string | null;
  /** ISO-Zeitpunkt, bis zu dem entschieden sein muss. */
  frist?: string | null;
  /** ISO-Zeitpunkt der Anfrage. */
  angefragtAm?: string | null;
  /** Die Regel dieser Anfrage als Satz („Vier-Augen-Prinzip: …"). */
  regel?: string | null;
  /** Ohne Angabe `offen`. Nur eine offene Freigabe trägt Knöpfe. */
  status?: 'offen' | 'bestaetigt' | 'abgelehnt';
  /** Wer entschieden hat. */
  entschiedenVon?: string | null;
  /** ISO-Zeitpunkt der Entscheidung. */
  entschiedenAm?: string | null;
  /** Der Grund einer Ablehnung. */
  begruendung?: string | null;
}

export interface FreigabeProps {
  eintraege: FreigabeEintrag[];
  /** Bestätigen. Darf ein Versprechen geben; solange es läuft, sind die Knöpfe gesperrt. */
  beiBestaetigen: (eintrag: FreigabeEintrag) => void | Promise<unknown>;
  /** Ablehnen, mit dem Grund (nie leer). */
  beiAblehnen: (eintrag: FreigabeEintrag, grund: string) => void | Promise<unknown>;
  /** Die Einzelansicht von außen steuern; `null` ist die Liste. */
  gewaehlt?: FreigabeEintrag['id'] | null;
  beiWahl?: (id: FreigabeEintrag['id'] | null) => void;
  /** Was steht, wenn nichts da ist. Ohne Angabe ein Leerzustand. */
  leer?: ReactNode;
  /** Das Gerät kennt die Zeit besser als der Test: hier lässt sie sich setzen. */
  jetzt?: number;
  className?: string;
}

const DATUM = (iso: string) => new Date(iso).toLocaleString('de-DE');

function istZahl(iso?: string | null): iso is string {
  return !!iso && Number.isFinite(new Date(iso).getTime());
}

/** Die Zeile unter dem Titel: Herkunft, Einreicher, wie lange schon. */
function Herkunft({ e, jetzt }: { e: FreigabeEintrag; jetzt?: number }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ui-xs text-muted-foreground">
      {e.herkunft && <span className="font-medium text-foreground/80">{e.herkunft}</span>}
      {e.einreicher && (
        <>
          {e.herkunft && <span aria-hidden="true">·</span>}
          <span>eingereicht von {e.einreicher}</span>
        </>
      )}
      {istZahl(e.angefragtAm) && (
        <>
          {(e.herkunft || e.einreicher) && <span aria-hidden="true">·</span>}
          <span data-testid={`freigabe-${e.id}-seit`} title={`Angefragt: ${DATUM(e.angefragtAm)}`}>
            {wartetSeit(e.angefragtAm, jetzt)}
          </span>
        </>
      )}
    </span>
  );
}

/** Wer wann entschieden hat, und warum nicht. */
function Entscheidung({ e }: { e: FreigabeEintrag }) {
  const bestaetigt = e.status === 'bestaetigt';
  return (
    <div className="mt-3 text-ui-sm" data-testid={`freigabe-${e.id}-entscheidung`}>
      <p className="flex items-center gap-1.5 font-medium text-foreground">
        {bestaetigt ? (
          <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
        ) : (
          <XCircle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
        )}
        {bestaetigt ? 'Freigegeben' : 'Abgelehnt'}
        {e.entschiedenVon ? ` von ${e.entschiedenVon}` : ''}
        {istZahl(e.entschiedenAm) ? `, ${DATUM(e.entschiedenAm)}` : ''}
      </p>
      {!bestaetigt && e.begruendung && (
        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">Grund: {e.begruendung}</p>
      )}
    </div>
  );
}

interface KarteProps {
  e: FreigabeEintrag;
  einzeln: boolean;
  beiBestaetigen: FreigabeProps['beiBestaetigen'];
  beiAblehnen: FreigabeProps['beiAblehnen'];
  beiOeffnen?: () => void;
  beiZurueck?: () => void;
  jetzt?: number;
}

/** Eine Freigabe: in der Liste als Karte, einzeln ganz. */
function FreigabeKarte({
  e,
  einzeln,
  beiBestaetigen,
  beiAblehnen,
  beiOeffnen,
  beiZurueck,
  jetzt,
}: KarteProps) {
  const [ablehnenOffen, setAblehnenOffen] = useState(false);
  const [grund, setGrund] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const feld = useRef<HTMLTextAreaElement>(null);
  // Der Zeiger springt in das Feld, sobald es aufklappt: wer „Ablehnen"
  // drückt, will schreiben. Als Effekt und nicht als `autoFocus`: das
  // griffe auch beim ersten Rendern der Seite und zöge einen Bildschirmleser
  // ungefragt an eine Textbox.
  useEffect(() => {
    if (ablehnenOffen) feld.current?.focus();
  }, [ablehnenOffen]);

  const offen = (e.status ?? 'offen') === 'offen';
  const knapp = istZahl(e.frist) && istKnapp(e.frist, jetzt);

  // Jede Karte sperrt nur sich selbst: wer drei Freigaben hat, soll bei der
  // ersten nicht drei Ladezustände sehen.
  const ausfuehren = async (was: () => void | Promise<unknown>, danach?: () => void) => {
    setLaeuft(true);
    try {
      await was();
      danach?.();
    } catch {
      // Die Meldung zeigt, wer die Funktion gab. Hier bleibt das Feld offen
      // und der Text stehen.
    } finally {
      setLaeuft(false);
    }
  };

  const zuruecksetzen = () => {
    setAblehnenOffen(false);
    setGrund('');
  };

  const titel = einzeln ? (
    <h3 className="text-ui font-semibold text-foreground">{e.titel}</h3>
  ) : beiOeffnen ? (
    <h3 className="text-ui font-semibold text-foreground">
      <button
        type="button"
        onClick={beiOeffnen}
        className="text-left underline-offset-4 hover:underline focus-visible:underline"
        data-testid={`freigabe-${e.id}-oeffnen`}
      >
        {e.titel}
      </button>
    </h3>
  ) : (
    <h3 className="text-ui font-semibold text-foreground">{e.titel}</h3>
  );

  return (
    <article
      className="rounded-lg border border-border bg-card p-ui-3 text-card-foreground"
      data-testid={`freigabe-${e.id}`}
      aria-label={e.titel}
    >
      {einzeln && beiZurueck && (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-2"
          onClick={beiZurueck}
          data-testid="freigabe-zurueck"
        >
          <ArrowLeft aria-hidden="true" />
          Zur Liste
        </Button>
      )}

      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        {titel}
        {offen && istZahl(e.frist) ? (
          <span
            className={cn(
              'flex items-center gap-1 text-ui-xs',
              knapp ? 'font-medium text-foreground' : 'text-muted-foreground'
            )}
            data-testid={`freigabe-${e.id}-frist`}
            title={`Frist: ${DATUM(e.frist)}`}
          >
            <Clock className="size-3 shrink-0" aria-hidden="true" />
            {restzeit(e.frist, jetzt)}
          </span>
        ) : (
          !offen && (
            <Badge variant={e.status === 'bestaetigt' ? 'success' : 'destructive'}>
              {e.status === 'bestaetigt' ? 'Freigegeben' : 'Abgelehnt'}
            </Badge>
          )
        )}
      </div>

      <Herkunft e={e} jetzt={jetzt} />

      {e.regel && (
        <p className="mt-1 text-ui-xs text-muted-foreground" data-testid={`freigabe-${e.id}-regel`}>
          {e.regel}
        </p>
      )}

      {e.zusammenhang && (
        <p
          className={cn(
            'mt-2 text-ui-sm whitespace-pre-wrap',
            einzeln ? '' : 'max-h-40 overflow-auto'
          )}
        >
          {e.zusammenhang}
        </p>
      )}

      {offen && istZahl(e.frist) && einzeln && (
        <p className="mt-2 text-ui-xs text-muted-foreground">Frist: {DATUM(e.frist)}</p>
      )}

      {!offen && <Entscheidung e={e} />}

      {offen && (
        <div className="mt-3">
          {ablehnenOffen ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={ev => {
                ev.preventDefault();
                const text = grund.trim();
                if (!text) return;
                void ausfuehren(() => beiAblehnen(e, text), zuruecksetzen);
              }}
            >
              {/* Pflichtfeld, und das ist eine Entscheidung über Umgangsformen:
                  eine Ablehnung beendet die Arbeit eines anderen Menschen. */}
              <Textarea
                ref={feld}
                rows={2}
                maxLength={2000}
                value={grund}
                onChange={ev => setGrund(ev.target.value)}
                placeholder="Warum nicht? Der Grund steht danach dabei."
                aria-label={`Begründung für die Ablehnung von ${e.titel}`}
                aria-required="true"
                data-testid={`freigabe-${e.id}-begruendung`}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={laeuft || grund.trim().length === 0}
                  data-testid={`freigabe-${e.id}-ablehnen-absenden`}
                >
                  Ablehnen
                </Button>
                <Button type="button" disabled={laeuft} onClick={zuruecksetzen}>
                  Zurück
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="solid"
                disabled={laeuft}
                onClick={() => void ausfuehren(() => beiBestaetigen(e))}
                data-testid={`freigabe-${e.id}-bestaetigen`}
              >
                {laeuft ? 'Einen Moment …' : 'Bestätigen'}
              </Button>
              <Button
                variant="destructive"
                disabled={laeuft}
                onClick={() => setAblehnenOffen(true)}
                data-testid={`freigabe-${e.id}-ablehnen`}
              >
                Ablehnen
              </Button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function Freigabe({
  eintraege,
  beiBestaetigen,
  beiAblehnen,
  gewaehlt,
  beiWahl,
  leer,
  jetzt,
  className,
}: FreigabeProps) {
  const [eigene, setEigene] = useState<FreigabeEintrag['id'] | null>(null);
  const gesteuert = gewaehlt !== undefined;
  const aktuell = gesteuert ? gewaehlt : eigene;
  const waehlen = (id: FreigabeEintrag['id'] | null) => {
    if (!gesteuert) setEigene(id);
    beiWahl?.(id);
  };

  const eins = aktuell === null ? undefined : eintraege.find(x => x.id === aktuell);

  // Eine Einzelansicht, deren Eintrag verschwunden ist (entschieden, von einem
  // anderen), fällt auf die Liste zurück statt eine leere Seite zu zeigen.
  if (eins) {
    return (
      <div className={className} data-testid="freigabe-einzeln">
        <FreigabeKarte
          e={eins}
          einzeln
          jetzt={jetzt}
          beiBestaetigen={beiBestaetigen}
          beiAblehnen={beiAblehnen}
          beiZurueck={() => waehlen(null)}
        />
      </div>
    );
  }

  if (eintraege.length === 0) {
    return (
      <div className={className} data-testid="freigabe-liste" data-leer="true">
        {leer ?? (
          <Leerzustand
            symbol={<ClipboardCheck />}
            titel="Nichts wartet auf eine Freigabe"
            beschreibung="Sobald etwas auf Ihre Entscheidung wartet, steht es hier."
          />
        )}
      </div>
    );
  }

  return (
    <ul className={cn('flex flex-col gap-ui-2', className)} data-testid="freigabe-liste">
      {eintraege.map(e => (
        <li key={e.id}>
          <FreigabeKarte
            e={e}
            einzeln={false}
            jetzt={jetzt}
            beiBestaetigen={beiBestaetigen}
            beiAblehnen={beiAblehnen}
            beiOeffnen={() => waehlen(e.id)}
          />
        </li>
      ))}
    </ul>
  );
}
