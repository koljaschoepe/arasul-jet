/**
 * Die offenen Freigaben in der Übersicht (Phase D2 des Umbaus vom 26.08.2026).
 *
 * Phase C7 hat die Sache gebaut: ein Flow ruft `freigabe_anfordern`, hält an
 * (`flow_runs.status = 'wartend'`) und wartet auf einen Menschen. D1 brachte
 * die ZAHL in die Statusleiste. Hier steht endlich die ENTSCHEIDUNG — und
 * damit ist der Weg von C7 zum ersten Mal ganz begehbar, ohne `curl`.
 *
 * SEIT J36 (02.10.2026) STEHT DIESE LISTE NUR NOCH FÜR DEN ADMINISTRATOR in
 * der Übersicht (die Shell reicht sie nur ihm herein, `TabContent.tsx`). Ein
 * Mitarbeiter findet eine Freigabe in der App, in der sie entsteht — mit dem
 * Baustein `Freigabe` der Bibliothek, aus dem auch diese Liste gebaut ist —
 * und an der Kachel der App trägt höchstens eine Zahl. Das Backend ändert das
 * nicht: `GET /api/freigabe-anfragen` verbindet mit `app_members` (C2), der
 * JOIN IST die Berechtigung, und seit J35 kann ein Lauf den Kreis enger
 * ziehen. Hier steht nur die Anzeige.
 *
 * DIE ABLEHNUNG KLAPPT EIN FELD AUF statt einen Dialog zu öffnen: die
 * Begründung ist im Backend Pflicht (`AblehnenBody`), und wer sie schreibt,
 * will dabei den Titel und den Zusammenhang sehen. Das Muster macht das.
 *
 * WAS HIER NICHT STEHT: eine Historie der entschiedenen Freigaben. Die Liste
 * ist ein Posteingang, kein Archiv; wer nachsehen will, wer was entschieden
 * hat, fragt die App (`GET /api/v1/external/apps/.../freigaben`, C7) oder das
 * Sicherheitsprotokoll. Eine zweite Liste daneben hätte die Frage „warum steht
 * das noch da" bei jedem Blick neu gestellt.
 */
import { ClipboardCheck, Send } from 'lucide-react';
import { Freigabe, type FreigabeEintrag } from '@marken';
import { useToast } from '@/contexts/ToastContext';
import {
  useOffeneFreigaben,
  useEingereichteFreigaben,
  useFreigabeEntscheiden,
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

/**
 * Die Anfrage in der Form des Musters. Der NAME der App und nicht ihre Kennung
 * (26.09.2026): „faktum" ist ein Pfad, „Faktum" ist das, was der Mensch links
 * in seiner Leiste sieht.
 */
function alsEintrag(f: OffeneFreigabe): FreigabeEintrag {
  return {
    id: f.id,
    titel: f.titel,
    zusammenhang: f.zusammenhang,
    herkunft: `${f.app_name || f.app_id}${f.stand === 'test' ? ' (Test)' : ''}`,
    einreicher: f.einreicher,
    frist: f.frist,
    angefragtAm: f.angefragt_am,
    regel: regelSatz(f),
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
  const entscheiden = useFreigabeEntscheiden();
  const toast = useToast();

  /**
   * Nach dem Erfolg wird gesagt, ob der Lauf WIRKLICH weiterläuft.
   * `fortgesetzt: false` heißt: die Entscheidung steht in der Datenbank, aber
   * niemand führt den Lauf mehr fort (das Backend ist zwischendurch neu
   * gestartet). Das zu verschweigen hieße, jemanden auf ein Ergebnis warten zu
   * lassen, das nie kommt. Ein Fehler läuft über den Toast von `useApi` und
   * wirft hier weiter -- das Muster lässt dann das Feld offen.
   */
  const entscheide = async (e: FreigabeEintrag, status: 'bestaetigt' | 'abgelehnt', grund = '') => {
    const d = await entscheiden.mutateAsync(
      status === 'bestaetigt'
        ? { id: Number(e.id), status }
        : { id: Number(e.id), status, begruendung: grund }
    );
    const was = status === 'bestaetigt' ? 'bestätigt' : 'abgelehnt';
    if (!d.fortgesetzt) {
      toast.warning(
        `„${e.titel}" ist ${was}. Der Lauf wird aber nicht mehr fortgesetzt: ` +
          'das Gerät wurde zwischendurch neu gestartet.'
      );
    } else {
      toast.success(
        status === 'bestaetigt'
          ? `„${e.titel}" freigegeben. Der Lauf läuft weiter.`
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
      <Freigabe
        eintraege={data.map(alsEintrag)}
        beiBestaetigen={e => entscheide(e, 'bestaetigt')}
        beiAblehnen={(e, grund) => entscheide(e, 'abgelehnt', grund)}
      />
      <Eingereicht />
    </section>
  );
}
