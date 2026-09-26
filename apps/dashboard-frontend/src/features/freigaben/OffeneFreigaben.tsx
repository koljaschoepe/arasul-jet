/**
 * Die offenen Freigaben in der Übersicht (Phase D2 des Umbaus vom 26.08.2026).
 *
 * Phase C7 hat die Sache gebaut: ein Flow ruft `freigabe_anfordern`, hält an
 * (`flow_runs.status = 'wartend'`) und wartet auf einen Menschen. D1 brachte
 * die ZAHL in die Statusleiste. Hier steht endlich die ENTSCHEIDUNG — und
 * damit ist der Weg von C7 zum ersten Mal ganz begehbar, ohne `curl`.
 *
 * WER HIER ETWAS SIEHT, ist nicht nach Rolle bestimmt: `GET /api/freigabe-anfragen`
 * verbindet mit `app_members` (C2), und der JOIN IST die Berechtigung. Seit
 * J35 kann ein Lauf den Kreis enger ziehen (ohne Einreicher, nur benannte
 * Entscheider); auch das entscheidet das Backend, hier steht nur der Hinweis.
 * Administrator und Mitarbeiter bekommen dieselbe Abfrage — freigeben ist
 * Arbeit und keine Verwaltung. Dieses Bauteil blendet deshalb nichts nach
 * Rolle aus; es gäbe nichts auszublenden.
 *
 * WARUM DIE ABLEHNUNG EIN FELD AUFKLAPPT statt einen Dialog zu öffnen: die
 * Begründung ist im Backend Pflicht (`AblehnenBody`), weil eine Ablehnung den
 * Lauf eines anderen Menschen beendet. Wer sie schreibt, will dabei den Titel
 * und den Zusammenhang sehen, über den er gerade urteilt. Ein Dialog legt sich
 * genau darüber.
 *
 * WAS HIER NICHT STEHT: eine Historie der entschiedenen Freigaben. Die Liste
 * ist ein Posteingang, kein Archiv; wer nachsehen will, wer was entschieden
 * hat, fragt die App (`GET /api/v1/external/apps/.../freigaben`, C7) oder das
 * Sicherheitsprotokoll. Eine zweite Liste daneben hätte die Frage „warum steht
 * das noch da" bei jedem Blick neu gestellt.
 */
import { useEffect, useRef, useState } from 'react';
import { ClipboardCheck, Clock, Send } from 'lucide-react';
import { Formular, Karte, Knopf } from '@marken';
import { Textarea } from '@marken';
import { useToast } from '@/contexts/ToastContext';
import {
  useOffeneFreigaben,
  useEingereichteFreigaben,
  useFreigabeEntscheiden,
  type OffeneFreigabe,
} from '@/hooks/useOffeneFreigaben';
import { restzeit, istKnapp, wartetSeit, oderListe } from './frist';

/**
 * Woher die Anfrage kommt und wie lange sie schon wartet, in einer Zeile.
 *
 * Der NAME der App und nicht ihre Kennung (26.09.2026): „faktum" ist ein Pfad,
 * „Faktum" ist das, was der Mensch links in seiner Leiste sieht. Der Flow steht
 * nicht mehr in der Zeile, sondern im Hinweis über dem Namen — wer entscheidet,
 * urteilt über die Sache, nicht über die Datei, die sie ausgelöst hat.
 */
function Herkunft({ f }: { f: OffeneFreigabe }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ui-xs text-muted-foreground">
      <span
        className="font-medium text-foreground/80"
        title={`App ${f.app_id}, Flow ${f.flow_name}`}
      >
        {f.app_name || f.app_id}
      </span>
      {f.stand === 'test' && (
        <span
          className="rounded bg-muted-foreground/15 px-1.5 py-0.5 font-medium text-muted-foreground"
          title="Test: diese Fassung der App ist noch nicht live"
        >
          Test
        </span>
      )}
      {f.einreicher && (
        <>
          <span aria-hidden="true">·</span>
          <span>eingereicht von {f.einreicher}</span>
        </>
      )}
      <span aria-hidden="true">·</span>
      <span
        data-testid={`freigabe-${f.id}-seit`}
        title={`Angefragt: ${new Date(f.angefragt_am).toLocaleString('de-DE')}`}
      >
        {wartetSeit(f.angefragt_am)}
      </span>
    </span>
  );
}

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

/** Eine Anfrage: worum es geht, wie lange Zeit bleibt, und die zwei Knöpfe. */
function FreigabeKarte({ f }: { f: OffeneFreigabe }) {
  const toast = useToast();
  const entscheiden = useFreigabeEntscheiden();
  const [ablehnenOffen, setAblehnenOffen] = useState(false);
  const [begruendung, setBegruendung] = useState('');

  // Der Zeiger springt in das Feld, sobald es aufklappt: wer „Ablehnen" drueckt,
  // will schreiben. Als Effekt und nicht als `autoFocus`-Prop -- das Prop
  // greift auch beim ERSTEN Rendern der Seite, und eine Liste, die den
  // Bildschirmleser ungefragt an eine Textbox zieht, ist genau das, was die
  // a11y-Regel meint.
  const feld = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ablehnenOffen) feld.current?.focus();
  }, [ablehnenOffen]);

  // `isPending` gilt für die ganze Mutation und damit für ALLE Karten. Ohne
  // diese Kennung sperrte eine Entscheidung die Knöpfe der übrigen mit, und wer
  // drei Freigaben hat, sieht bei der ersten drei Ladezustände.
  const laeuft = entscheiden.isPending && entscheiden.variables?.id === f.id;

  /**
   * Nach dem Erfolg wird gesagt, ob der Lauf WIRKLICH weiterläuft.
   * `fortgesetzt: false` heißt: die Entscheidung steht in der Datenbank, aber
   * niemand führt den Lauf mehr fort (das Backend ist zwischendurch neu
   * gestartet). Das zu verschweigen hieße, jemanden auf ein Ergebnis warten zu
   * lassen, das nie kommt.
   */
  const melde = (was: 'bestaetigt' | 'abgelehnt', fortgesetzt: boolean) => {
    if (!fortgesetzt) {
      toast.warning(
        `„${f.titel}" ist ${was}. Der Lauf wird aber nicht mehr fortgesetzt: ` +
          'das Gerät wurde zwischendurch neu gestartet.'
      );
      return;
    }
    toast.success(
      was === 'bestaetigt'
        ? `„${f.titel}" freigegeben. Der Lauf läuft weiter.`
        : `„${f.titel}" abgelehnt. Der Lauf ist beendet.`
    );
  };

  const bestaetigen = () => {
    entscheiden.mutate(
      { id: f.id, status: 'bestaetigt' },
      { onSuccess: d => melde('bestaetigt', d.fortgesetzt) }
    );
  };

  const ablehnen = () => {
    const grund = begruendung.trim();
    if (!grund) return;
    entscheiden.mutate(
      { id: f.id, status: 'abgelehnt', begruendung: grund },
      {
        onSuccess: d => {
          setAblehnenOffen(false);
          setBegruendung('');
          melde('abgelehnt', d.fortgesetzt);
        },
      }
    );
  };

  const knapp = istKnapp(f.frist);

  return (
    <li>
      {/* Karte, Formular und Knopf kommen seit D7 aus dem Designsystem
          (`@marken`) — dieselben Bausteine, aus denen eine App gebaut ist.
          Eine Freigabe entscheidet man neben der App, die sie ausgeloest hat;
          dass beide gleich aussehen, ist keine Kosmetik. */}
      <Karte
        titel={f.titel}
        kennzeichen={`freigabe-${f.id}`}
        hinweis={
          <span
            className={`flex items-center gap-1 ${knapp ? 'text-muted-foreground' : ''}`}
            data-testid={`freigabe-${f.id}-frist`}
            title={`Frist: ${new Date(f.frist).toLocaleString('de-DE')}`}
          >
            <Clock className="size-3 shrink-0" aria-hidden="true" />
            {restzeit(f.frist)}
          </span>
        }
      >
        <Herkunft f={f} />

        {regelSatz(f) && (
          <p
            className="mt-1 text-ui-xs text-muted-foreground"
            data-testid={`freigabe-${f.id}-regel`}
          >
            {regelSatz(f)}
          </p>
        )}

        {f.zusammenhang && (
          <p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap">{f.zusammenhang}</p>
        )}

        <div className="mt-3">
          {ablehnenOffen ? (
            <Formular
              onAbsenden={ablehnen}
              aktionen={
                <>
                  <Knopf
                    art="gefahr"
                    typ="absenden"
                    gesperrt={laeuft || begruendung.trim().length === 0}
                    kennzeichen={`freigabe-${f.id}-ablehnen-absenden`}
                  >
                    Ablehnen
                  </Knopf>
                  <Knopf
                    gesperrt={laeuft}
                    onKlick={() => {
                      setAblehnenOffen(false);
                      setBegruendung('');
                    }}
                  >
                    Zurück
                  </Knopf>
                </>
              }
            >
              {/* Pflichtfeld, und das ist eine Entscheidung ueber Umgangsformen:
                  eine Ablehnung beendet den Lauf eines anderen Menschen. */}
              <Textarea
                ref={feld}
                rows={2}
                maxLength={2000}
                value={begruendung}
                onChange={e => setBegruendung(e.target.value)}
                placeholder="Warum nicht? Der Grund steht danach am Lauf."
                aria-label={`Begründung für die Ablehnung von ${f.titel}`}
                data-testid={`freigabe-${f.id}-begruendung`}
              />
            </Formular>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Knopf
                art="haupt"
                gesperrt={laeuft}
                onKlick={bestaetigen}
                kennzeichen={`freigabe-${f.id}-bestaetigen`}
              >
                {laeuft ? 'Einen Moment …' : 'Bestätigen'}
              </Knopf>
              <Knopf
                art="gefahr"
                gesperrt={laeuft}
                onKlick={() => setAblehnenOffen(true)}
                kennzeichen={`freigabe-${f.id}-ablehnen`}
              >
                Ablehnen
              </Knopf>
            </div>
          )}
        </div>
      </Karte>
    </li>
  );
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
          className="flex items-start gap-2 text-ui-sm text-muted-foreground"
          data-testid={`eingereicht-${e.id}`}
        >
          <Send className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Ihr Vorgang <span className="font-medium text-foreground">„{e.titel}“</span> (
            {e.app_name || e.app_id}) {wartetSeit(e.angefragt_am)}
            {e.kreis.length > 0 ? ` auf ${oderListe(e.kreis)}.` : '; niemand kann ihn entscheiden.'}
            {e.ohne_einreicher && ' Vier-Augen-Prinzip: Sie entscheiden nicht mit.'}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Die Liste. Steht sie leer, steht dort EINE Zeile (26.09.2026).
 *
 * Bis dahin stand sie leer gar nicht da, mit Absicht: ein Leerzustand mit
 * Symbol und Erklärung wäre auf der Übersicht eines Mitarbeiters, der nie eine
 * Freigabe bekommt, eine Dauermeldung über etwas, das es nicht gibt. Die
 * Absicht gilt weiter — deshalb kein Leerzustand, sondern eine leise Zeile
 * unter derselben Überschrift. Was sich geändert hat, ist die Gegenseite: seit
 * vier Augen reicht jemand ein und entscheidet nicht selbst, und wer
 * eingereicht hat, muss wissen, WO Freigaben stehen. Eine Stelle, die nur
 * erscheint, wenn es etwas zu tun gibt, kann man niemandem zeigen. Und „nichts
 * wartet auf Sie" ist eine Auskunft, kein Rauschen.
 */
export function OffeneFreigaben() {
  const { data, isLoading, isError } = useOffeneFreigaben();

  // Beim ersten Laden bleibt der Platz leer statt ein Skelett zu zeigen: in
  // aller Regel ist die Liste leer, und ein Skelett, das zu einer Zeile
  // zusammenfällt, stiftet nur Unruhe. Nach einem Fehler steht ebenfalls
  // nichts da — „keine Freigabe" wäre dann eine Behauptung, keine Auskunft.
  if (isLoading || isError || !data) return null;

  if (data.length === 0) {
    return (
      <section className="mb-6" data-testid="offene-freigaben" data-leer="true">
        <p className="flex items-center gap-2 text-ui-sm text-muted-foreground">
          <ClipboardCheck className="size-4 shrink-0" aria-hidden="true" />
          Freigaben: keine wartet auf Ihre Entscheidung.
        </p>
        <Eingereicht />
      </section>
    );
  }

  return (
    <section className="mb-6" data-testid="offene-freigaben">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        <ClipboardCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {data.length === 1
          ? 'Eine Freigabe wartet auf Ihre Entscheidung'
          : `${data.length} Freigaben warten auf Ihre Entscheidung`}
      </h2>
      <ul className="flex flex-col gap-ui-2">
        {data.map(f => (
          <FreigabeKarte key={f.id} f={f} />
        ))}
      </ul>
      <Eingereicht />
    </section>
  );
}
