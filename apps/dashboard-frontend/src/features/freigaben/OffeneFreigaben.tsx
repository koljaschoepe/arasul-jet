/**
 * Die offenen Freigaben in der Übersicht (Phase D2 des Umbaus vom 26.08.2026).
 *
 * Phase C7 hat die Sache gebaut: ein Flow ruft `freigabe_anfordern`, hält an
 * (`flow_runs.status = 'wartend'`) und wartet auf einen Menschen. D1 brachte
 * die ZAHL in die Statusleiste. Hier steht endlich die ENTSCHEIDUNG — und
 * damit ist der Weg von C7 zum ersten Mal ganz begehbar, ohne `curl`.
 *
 * WER HIER ETWAS SIEHT, ist nicht nach Rolle bestimmt: `GET /api/freigabe-anfragen`
 * verbindet mit `app_members` (C2), und der JOIN IST die Berechtigung.
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
import { ClipboardCheck, Clock } from 'lucide-react';
import { Formular, Karte, Knopf } from '@marken';
import { Textarea } from '@marken';
import { useToast } from '@/contexts/ToastContext';
import {
  useOffeneFreigaben,
  useFreigabeEntscheiden,
  type OffeneFreigabe,
} from '@/hooks/useOffeneFreigaben';
import { restzeit, istKnapp } from './frist';

/** Woher die Anfrage kommt: App, Stand, Flow — in einer Zeile. */
function Herkunft({ f }: { f: OffeneFreigabe }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ui-xs text-muted-foreground">
      <span className="font-medium text-foreground/80">{f.app_id}</span>
      {f.stand === 'test' && (
        <span
          className="rounded bg-warning/15 px-1.5 py-0.5 font-medium text-warning"
          title="Teststand: diese Fassung der App ist noch nicht live"
        >
          Test
        </span>
      )}
      <span aria-hidden="true">·</span>
      <span>Flow {f.flow_name}</span>
    </span>
  );
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
            className={`flex items-center gap-1 ${knapp ? 'text-warning' : ''}`}
            data-testid={`freigabe-${f.id}-frist`}
            title={`Frist: ${new Date(f.frist).toLocaleString('de-DE')}`}
          >
            <Clock className="size-3 shrink-0" aria-hidden="true" />
            {restzeit(f.frist)}
          </span>
        }
      >
        <Herkunft f={f} />

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
 * Die Liste. Steht sie leer, steht sie GAR NICHT da.
 *
 * Ein Leerzustand („keine offenen Freigaben") wäre auf der Übersicht eines
 * Mitarbeiters, der nie eine bekommt, eine Dauermeldung über etwas, das es
 * nicht gibt. Die Apps darunter sind das, wofür er die Seite öffnet.
 */
export function OffeneFreigaben() {
  const { data, isLoading } = useOffeneFreigaben();

  // Beim ersten Laden bleibt der Platz leer statt ein Skelett zu zeigen: in
  // aller Regel ist die Liste leer, und ein Skelett, das zu nichts aufklappt,
  // hat nur Unruhe gestiftet.
  if (isLoading || !data || data.length === 0) return null;

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
    </section>
  );
}
