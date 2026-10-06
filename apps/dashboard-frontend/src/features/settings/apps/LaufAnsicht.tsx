/**
 * Ein Flow-Lauf zum Nachlesen: Schritte und Gedankengang (Phase D4).
 *
 * WAS EIN LAUF HINTERLÄSST, ist eine Kette von Schritten. Bis D4 waren das nur
 * Werkzeug-Aufrufe und Delegationen — eine Liste von Handgriffen ohne einen
 * Satz dazu. Was das Modell sagte, BEVOR es ein Werkzeug rief, fiel im Runner
 * lautlos weg; seit D4 steht es als Schritt der Art `modell` dazwischen und
 * beantwortet die Frage, die eine reine Werkzeug-Kette offenlässt: warum
 * dieses Werkzeug.
 *
 * DIE SCHRITTE STEHEN FLACH UND EINGERÜCKT, nicht als aufklappbarer Baum. Ein
 * Lauf ist eine Geschichte in zeitlicher Reihenfolge; die inneren Schritte
 * einer Rolle (`parent_step_id`) gehören dazu und nicht hinter einen Klick.
 * Was hinter einem Klick liegt, ist die AUSGABE eines Schritts — die kann
 * mehrere Bildschirme lang sein.
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, Brain, PenLine, Users, Info } from 'lucide-react';
import { Button, cn, useSchmalesFenster } from '@marken';
import { formatDate } from '@/utils/formatting';
import type { AppLauf, AppLaufDetail, LaufFreigabe, LaufSchritt } from './useAppVerwaltung';
import { useLaufErneut } from './useAppVerwaltung';
import { useToast } from '@/contexts/ToastContext';
import { laufFehlerKurz, werkzeugText } from '../laeufe/laufText';

/** Der Zustand eines Laufs in einem Wort, mit Farbe. */
export function LaufZustand({ status }: { status: string }) {
  const farbe =
    status === 'fertig'
      ? 'bg-primary/15 text-primary'
      : status === 'wartend' || status === 'laeuft'
        ? 'border border-border text-muted-foreground'
        : status === 'abgelaufen'
          ? 'bg-muted-foreground/15 text-muted-foreground'
          : status === 'nicht_uebergeben'
            ? 'border border-destructive/40 text-destructive'
            : 'bg-destructive/15 text-destructive';
  const wort =
    status === 'laeuft'
      ? 'läuft'
      : status === 'wartend'
        ? 'wartet auf Freigabe'
        : status === 'abgelaufen'
          ? 'Frist abgelaufen'
          : status === 'nicht_uebergeben'
            ? 'nicht übergeben'
            : status;
  return (
    <span
      data-lauf-status={status}
      className={cn('rounded px-1.5 py-0.5 text-xs font-medium', farbe)}
    >
      {wort}
    </span>
  );
}

const SYMBOL: Record<LaufSchritt['kind'], React.ReactNode> = {
  modell: <Brain className="size-3.5" aria-hidden="true" />,
  werkzeug: <PenLine className="size-3.5" aria-hidden="true" />,
  subagent: <Users className="size-3.5" aria-hidden="true" />,
  hinweis: <Info className="size-3.5" aria-hidden="true" />,
};

function Schritt({ schritt }: { schritt: LaufSchritt }) {
  const [offen, setOffen] = useState(schritt.kind === 'modell');
  const gedanke = schritt.kind === 'modell';
  const eingabe =
    schritt.input && Object.keys(schritt.input).length > 0 ? JSON.stringify(schritt.input) : '';

  return (
    <li
      className={cn('border-b border-border last:border-b-0', schritt.parent_step_id && 'pl-6')}
      data-testid={`schritt-${schritt.id}`}
      data-schritt-art={schritt.kind}
    >
      <button
        type="button"
        onClick={() => setOffen(o => !o)}
        className="flex w-full items-start gap-2 px-1 py-2 text-left hover:bg-accent/40"
      >
        <span className="mt-0.5 shrink-0 text-muted-foreground">
          {offen ? (
            <ChevronDown className="size-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-3.5" aria-hidden="true" />
          )}
        </span>
        <span className={cn('mt-0.5 shrink-0', 'text-muted-foreground')} aria-hidden="true">
          {SYMBOL[schritt.kind]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {gedanke ? 'Gedankengang' : werkzeugText(schritt.name ?? '') || schritt.kind}
            </span>
            {schritt.modell && (
              <span className="font-mono text-xs text-muted-foreground">{schritt.modell}</span>
            )}
            {schritt.status !== 'fertig' && (
              <span className="text-xs text-muted-foreground">{schritt.status}</span>
            )}
          </span>
          {!offen && (schritt.output || eingabe) && (
            <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">
              {schritt.output || eingabe}
            </span>
          )}
        </span>
      </button>

      {offen && (
        <div className="ml-9 mb-2 flex flex-col gap-2">
          {eingabe && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-border p-2 font-mono text-xs text-muted-foreground">
              {eingabe}
            </pre>
          )}
          {schritt.output && (
            <pre
              className={cn(
                'max-h-72 overflow-auto whitespace-pre-wrap break-words rounded border p-2 text-xs',
                gedanke
                  ? 'border-border font-sans text-foreground'
                  : 'border-border font-mono text-foreground'
              )}
              data-testid={`schritt-${schritt.id}-ausgabe`}
            >
              {schritt.output}
            </pre>
          )}
          {!schritt.output && !eingabe && (
            <p className="text-xs text-muted-foreground">Kein Inhalt.</p>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Die erkannten Felder einer Freigabe (M5): je Feld der Vorschlag der KI und,
 * wenn ein Mensch es beim Bestätigen änderte, der neue Wert mit wer und wann.
 * Eine Tabelle und keine Fließtext-Zeile: wer nachliest, vergleicht Spalten.
 */
function FreigabeFelder({ f }: { f: LaufFreigabe }) {
  const schmal = useSchmalesFenster();
  const nachFeld = new Map((f.korrekturen ?? []).map(k => [k.feld, k]));
  return (
    <div className="rounded-md border border-border p-ui-3" data-testid={`lauf-freigabe-${f.id}`}>
      <p className="text-sm font-medium text-foreground">{f.titel}</p>
      <p className="mb-2 text-xs text-muted-foreground">
        {f.status === 'bestaetigt'
          ? `Bestätigt von ${f.entschieden_von ?? 'einem Menschen'}`
          : f.status === 'abgelehnt'
            ? `Abgelehnt von ${f.entschieden_von ?? 'einem Menschen'}`
            : f.status === 'offen'
              ? 'Wartet auf Entscheidung'
              : f.status === 'abgelaufen'
                ? 'Frist abgelaufen'
                : 'Verfallen'}
        {f.entschieden_am ? `, ${formatDate(f.entschieden_am)}` : ''}
        {f.felder_schritt ? ` · Schritt ${f.felder_schritt}` : ''}
      </p>
      {schmal ? (
        // Am Handy eine Liste: je Feld ein Block, die drei Angaben untereinander.
        <ul className="flex flex-col">
          {(f.felder ?? []).map(feld => {
            const k = nachFeld.get(feld.name);
            return (
              <li
                key={feld.name}
                className="flex flex-col gap-0.5 border-t border-border py-2 text-sm"
                data-testid={`lauf-feld-${f.id}-${feld.name}`}
              >
                <span className="font-mono text-xs text-foreground">
                  {feld.name}
                  {(feld.unsicher || feld.fehlend) && (
                    <span className="ml-1 font-sans text-muted-foreground">(prüfen)</span>
                  )}
                </span>
                <span className="text-foreground">
                  <span className="text-xs text-muted-foreground">Vorschlag der KI: </span>
                  {feld.vorschlag || <span className="text-muted-foreground">nicht erkannt</span>}
                </span>
                <span
                  className="text-foreground"
                  data-testid={`lauf-feld-${f.id}-${feld.name}-neu`}
                >
                  <span className="text-xs text-muted-foreground">Geändert: </span>
                  {k ? (
                    <>
                      {k.wert || <span className="text-muted-foreground">leer</span>}
                      <span className="block text-xs text-muted-foreground">
                        {k.von ?? 'unbekannt'}
                        {k.am ? `, ${formatDate(k.am)}` : ''}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">nein</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 pr-3 font-medium">Feld</th>
              <th className="py-1 pr-3 font-medium">Vorschlag der KI</th>
              <th className="py-1 font-medium">Geändert</th>
            </tr>
          </thead>
          <tbody>
            {(f.felder ?? []).map(feld => {
              const k = nachFeld.get(feld.name);
              return (
                <tr
                  key={feld.name}
                  className="border-t border-border align-top"
                  data-testid={`lauf-feld-${f.id}-${feld.name}`}
                >
                  <td className="py-1 pr-3 font-mono text-xs text-foreground">
                    {feld.name}
                    {(feld.unsicher || feld.fehlend) && (
                      <span className="ml-1 font-sans text-muted-foreground">(prüfen)</span>
                    )}
                  </td>
                  <td className="py-1 pr-3 text-foreground">
                    {feld.vorschlag || <span className="text-muted-foreground">nicht erkannt</span>}
                  </td>
                  <td
                    className="py-1 text-foreground"
                    data-testid={`lauf-feld-${f.id}-${feld.name}-neu`}
                  >
                    {k ? (
                      <>
                        {k.wert || <span className="text-muted-foreground">leer</span>}
                        <span className="block text-xs text-muted-foreground">
                          {k.von ?? 'unbekannt'}
                          {k.am ? `, ${formatDate(k.am)}` : ''}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">nein</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Der Knopf „erneut" für einen Lauf, dessen Ergebnis die App nicht bestätigt hat. */
export function ErneutKnopf({ appId, runId }: { appId: string; runId: number }) {
  const toast = useToast();
  const erneut = useLaufErneut(appId);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={erneut.isPending}
      data-testid={`lauf-erneut-${runId}`}
      onClick={() =>
        erneut.mutate(runId, {
          onSuccess: lauf =>
            lauf?.status === 'fertig'
              ? toast.success('Die App hat das Ergebnis übernommen.')
              : toast.error('Die App hat den Empfang wieder nicht bestätigt.'),
        })
      }
    >
      {erneut.isPending ? 'übergibt…' : 'erneut'}
    </Button>
  );
}

/** Wodurch ein Lauf entstand, in einem Wort; Hand mit dem Menschen, wenn es einen gibt. */
export function ausloeserText(
  l: Pick<AppLauf, 'ausloeser' | 'ereignis'>,
  person: string | null
): string {
  if (l.ausloeser === 'zeitplan') return 'Zeitplan';
  if (l.ausloeser === 'ereignis') {
    const ereignis = l.ereignis ? `Ereignis „${l.ereignis}“` : 'Ereignis';
    return person ? `${ereignis}, ${person}` : ereignis;
  }
  return person ? `Von Hand, ${person}` : 'Von Hand';
}

/**
 * Der Inhalt eines Laufs zum Nachlesen (Läufe der Verwaltung, M5): Zeiten,
 * Auslöser, Person, Übergabe, Argumente, Grund eines Fehlers, Schritte bis zu
 * Ein- und Ausgabe, Freigaben mit Vorschlag und Änderung, Ergebnis. Die Seite
 * eines Laufs und die aufgeklappte Zeile der Liste zeigen dasselbe.
 */
export function LaufDetail({
  lauf,
  person,
}: {
  lauf: AppLaufDetail;
  /** Der Name des Menschen hinter dem Lauf, falls es einen gibt. */
  person: string | null;
}) {
  return (
    <div className="flex flex-col gap-4" data-testid={`lauf-detail-${lauf.id}`}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Auslöser</dt>
        <dd className="text-foreground" data-testid={`lauf-ausloeser-${lauf.id}`}>
          {ausloeserText(lauf, person)}
        </dd>
        <dt className="text-muted-foreground">Person</dt>
        <dd className="text-foreground" data-testid={`lauf-person-${lauf.id}`}>
          {person ?? 'ohne Person'}
        </dd>
        <dt className="text-muted-foreground">Gestartet</dt>
        <dd className="text-foreground">{formatDate(lauf.created_at)}</dd>
        {lauf.finished_at && (
          <>
            <dt className="text-muted-foreground">Beendet</dt>
            <dd className="text-foreground">{formatDate(lauf.finished_at)}</dd>
          </>
        )}
        {lauf.abschluss && (
          <>
            <dt className="text-muted-foreground">Übergabe</dt>
            <dd className="min-w-0 break-words text-foreground" data-testid="lauf-uebergabe">
              {lauf.abschluss.uebergeben_am
                ? `an ${lauf.abschluss.route} übergeben, ${formatDate(lauf.abschluss.uebergeben_am)}`
                : `${lauf.abschluss.route}, ${lauf.abschluss.versuche === 1 ? '1 Versuch' : `${lauf.abschluss.versuche} Versuche`}`}
            </dd>
          </>
        )}
        {Object.keys(lauf.arguments ?? {}).length > 0 && (
          <>
            <dt className="text-muted-foreground">Argumente</dt>
            <dd className="min-w-0 break-words font-mono text-xs text-foreground">
              {Object.entries(lauf.arguments)
                .map(([k, v]) => `${k}=${v}`)
                .join(', ')}
            </dd>
          </>
        )}
      </dl>

      {lauf.error && (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/10 p-ui-3 text-sm text-destructive"
          data-testid="lauf-grund"
        >
          {laufFehlerKurz(lauf.error)}
          <details className="mt-1 text-xs">
            <summary className="cursor-pointer">Technische Angabe</summary>
            <span className="mt-1 block break-words font-mono">{lauf.error}</span>
          </details>
        </div>
      )}

      <div>
        <h4 className="mb-1 text-sm font-medium text-foreground">Schritte und Gedankengang</h4>
        {lauf.steps.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="lauf-ohne-schritte">
            Dieser Lauf hat noch keinen Schritt geschrieben.
          </p>
        ) : (
          <ul
            className="rounded-md border border-border"
            data-testid="lauf-schritte"
            data-schritte={lauf.steps.length}
          >
            {lauf.steps.map(s => (
              <Schritt key={s.id} schritt={s} />
            ))}
          </ul>
        )}
      </div>

      {(lauf.freigaben ?? []).some(f => f.felder && f.felder.length > 0) && (
        <div data-testid="lauf-freigabe-felder">
          <h4 className="mb-1 text-sm font-medium text-foreground">
            Erkannte Felder und Änderungen
          </h4>
          <div className="flex flex-col gap-2">
            {(lauf.freigaben ?? [])
              .filter(f => f.felder && f.felder.length > 0)
              .map(f => (
                <FreigabeFelder key={f.id} f={f} />
              ))}
          </div>
        </div>
      )}

      {lauf.result && (
        <div>
          <h4 className="mb-1 text-sm font-medium text-foreground">Ergebnis</h4>
          <pre
            className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border p-ui-3 text-sm text-foreground"
            data-testid="lauf-ergebnis"
          >
            {lauf.result}
          </pre>
        </div>
      )}
    </div>
  );
}
