/**
 * Lizenz: die Stufe, Personen genutzt von erlaubt und gültig bis, „Einspielen"
 * und der Fingerabdruck aufgeklappt (J35, seit M5 im Bereich Gerät).
 *
 * Drei Zahlen, weil der Administrator genau drei Fragen hat: was trägt das
 * Gerät, wie viele Personen gehen noch, und bis wann. Dieselben Zahlen wie die
 * Riegel (aktive Konten) und wie `scripts/util/lizenz-geraet.sh status`. Die
 * Apps zählen ebenfalls gegen die Grenze; sie stehen aufgeklappt beim
 * Fingerabdruck, weil sie auf dem Gerät selten knapp werden.
 *
 * EINSPIELEN IST EIN DIALOG. Eine Lizenz ist eine Zeile Text, die jemand
 * einmal einfügt; ein Textfeld, das dauernd auf der Seite steht, fragt jeden,
 * der vorbeikommt, ob er etwas einfügen soll.
 *
 * Der FINGERABDRUCK steht aufgeklappt zum Kopieren da: eine Lizenz kann an
 * ein Gerät gebunden sein, und wer sie ausstellt, braucht genau diesen Wert.
 *
 * Die Rolle blendet aus, das Backend entscheidet: jeder Weg dieses Abschnitts
 * trägt `requireRole('admin')`.
 */
import { useState } from 'react';
import { Check, ChevronDown, Copy, KeyRound } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialogform,
  Feldgruppe,
  Kennzahl,
  Kennzahlen,
  Textarea,
  cn,
} from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useToast } from '@/contexts/ToastContext';
import type { ApiError } from '@/hooks/useApi';
import { useLizenz, useLizenzEinspielen, type Belegung, type Stufe } from './useLizenz';

const STUFEN_NAME: Record<Stufe, string> = {
  community: 'Community',
  professional: 'Professional',
  enterprise: 'Enterprise',
};

/** „2 von 3" oder „4, unbegrenzt". */
function belegt(b: Belegung): string {
  return b.grenze === -1 ? `${b.belegt}` : `${b.belegt} von ${b.grenze}`;
}

/**
 * Das Ablaufdatum als Kalenderdatum, oder „unbegrenzt" (J35, 25.09.2026).
 *
 * Eine Lizenz nennt ihren Ablauf als Tag, und `lizenz-signieren.js` schreibt
 * ihn als Mitternacht UTC. In Ortszeit formatiert rutschte er östlich von
 * Greenwich nach vorn: aus `9999-12-31T23:59:59Z` wurde am Orin
 * „1.1.10000". Gelesen wird deshalb in UTC. Und 9999 ist kein Datum, sondern
 * die Art, wie eine Lizenz ohne Ablauf ihr Pflichtfeld füllt.
 */
function datum(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getUTCFullYear() >= 9999) return 'unbegrenzt';
  return d.toLocaleDateString('de-DE', { timeZone: 'UTC' });
}

export function Lizenz() {
  const toast = useToast();
  const { data, isLoading, isError } = useLizenz();
  const einspielen = useLizenzEinspielen();
  const [dialog, setDialog] = useState(false);
  const [lizenz, setLizenz] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);
  const [offen, setOffen] = useState(false);

  const handleKopieren = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.hardwareFingerprint);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    } catch {
      toast.error('Kopieren ging nicht. Den Wert bitte markieren und von Hand kopieren.');
    }
  };

  const schliessen = () => {
    setDialog(false);
    setLizenz('');
    setFehler(null);
  };

  const handleEinspielen = () => {
    setFehler(null);
    einspielen.mutate(lizenz.trim(), {
      onSuccess: res => {
        schliessen();
        toast.success(`Lizenz eingespielt. Das Gerät steht auf ${STUFEN_NAME[res.license.tier]}.`);
      },
      onError: err => setFehler((err as ApiError).message),
    });
  };

  const n = data?.nutzung;
  const bis = datum(data?.expiresAt);
  // Eine Datei liegt, besteht aber nicht (anderes Gerät, abgelaufen): das
  // Gerät steht auf community, und der Mensch soll lesen, warum.
  const abgelehnt = data && !data.valid && data.error && data.error !== 'No license file found';

  return (
    <Feldgruppe
      titel="Lizenz"
      symbol={<KeyRound />}
      aktion={
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDialog(true)}
          data-testid="lizenz-einspielen-oeffnen"
        >
          Einspielen
        </Button>
      }
    >
      <div className="flex flex-col gap-4" data-abschnitt="lizenz" data-testid="lizenz-seite">
        {isLoading ? (
          <SkeletonText lines={3} />
        ) : isError || !data || !n ? (
          <p className="text-sm text-muted-foreground" data-testid="lizenz-fehler">
            Die Lizenz ließ sich nicht laden.
          </p>
        ) : (
          <>
            <Kennzahlen className="lg:grid-cols-3">
              <Kennzahl
                beschriftung="Stufe"
                wert={<span data-testid="lizenz-stufe">{STUFEN_NAME[n.stufe] ?? n.stufe}</span>}
                fussnote={data.valid ? data.customer : 'ohne Lizenz'}
              />
              <Kennzahl
                beschriftung="Personen"
                wert={<span data-testid="lizenz-konten">{belegt(n.konten)}</span>}
                fussnote={
                  n.konten.grenze === -1 ? 'genutzt, unbegrenzt erlaubt' : 'genutzt von erlaubt'
                }
              />
              <Kennzahl
                beschriftung="Gültig bis"
                wert={<span data-testid="lizenz-bis">{data.valid ? (bis ?? '—') : '—'}</span>}
              />
            </Kennzahlen>

            {data.graceMode && data.warning && (
              <Alert data-testid="lizenz-nachfrist">
                <AlertTitle>Die Lizenz ist abgelaufen</AlertTitle>
                <AlertDescription>
                  {data.warning}. Bis dahin gilt sie weiter; danach steht das Gerät auf Community.
                </AlertDescription>
              </Alert>
            )}
            {abgelehnt && (
              <Alert variant="destructive" data-testid="lizenz-abgelehnt">
                <AlertTitle>Die eingespielte Lizenz gilt nicht</AlertTitle>
                <AlertDescription>{data.error}</AlertDescription>
              </Alert>
            )}

            <Collapsible open={offen} onOpenChange={setOffen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="-ml-2" data-testid="lizenz-mehr-knopf">
                  <ChevronDown
                    className={cn('size-4 transition-transform', offen && 'rotate-180')}
                    aria-hidden="true"
                  />
                  Fingerabdruck und Apps
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 flex flex-col gap-3">
                  <p className="text-sm text-muted-foreground">
                    Apps: <span data-testid="lizenz-apps">{belegt(n.apps)}</span>
                    {n.apps.grenze === -1 ? ', unbegrenzt erlaubt' : ' genutzt von erlaubt'}. Test
                    und Live zählen zusammen.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Der Fingerabdruck kennzeichnet dieses Gerät. Wer eine Lizenz an das Gerät
                    bindet, braucht diesen Wert.
                  </p>
                  <div className="flex min-w-0 items-center gap-2">
                    <code
                      className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground"
                      data-testid="lizenz-fingerabdruck"
                    >
                      {data.hardwareFingerprint}
                    </code>
                    <Button
                      variant="outline"
                      onClick={() => void handleKopieren()}
                      data-testid="lizenz-fingerabdruck-kopieren"
                    >
                      {kopiert ? (
                        <Check className="size-4" aria-hidden="true" />
                      ) : (
                        <Copy className="size-4" aria-hidden="true" />
                      )}
                      {kopiert ? 'Kopiert' : 'Kopieren'}
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </div>

      <Dialogform
        offen={dialog}
        beiSchliessen={schliessen}
        titel="Lizenz einspielen"
        schliesstBeiKlickDaneben={false}
        fuss={
          <>
            <Button variant="ghost" onClick={schliessen}>
              Abbrechen
            </Button>
            <Button
              onClick={handleEinspielen}
              disabled={lizenz.trim().length < 10 || einspielen.isPending}
              data-testid="lizenz-einspielen"
            >
              Einspielen
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Die Lizenz ist eine Zeile Text. Sie wird geprüft, bevor sie gilt; eine, die nicht
            besteht, ändert nichts.
          </p>
          <Textarea
            aria-label="Lizenz"
            value={lizenz}
            onChange={e => {
              setLizenz(e.target.value);
              setFehler(null);
            }}
            rows={4}
            spellCheck={false}
            className="font-mono text-sm"
            placeholder="eyJjdXN0b21lciI6…"
            data-testid="lizenz-feld"
          />
          {fehler && (
            <Alert variant="destructive" data-testid="lizenz-einspielen-fehler">
              <AlertDescription>{fehler}</AlertDescription>
            </Alert>
          )}
        </div>
      </Dialogform>
    </Feldgruppe>
  );
}
