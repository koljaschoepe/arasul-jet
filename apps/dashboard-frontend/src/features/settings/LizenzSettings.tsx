/**
 * Lizenz: Stufe, Konten und Apps je belegt und Grenze, der Fingerabdruck des
 * Geräts und ein Feld zum Einspielen (Auftrag J35, 25.09.2026).
 *
 * Bis dahin gab es die Aktivierung nur als `POST /api/license/activate` — ein
 * Kunde, der eine Lizenz gekauft hatte, brauchte `curl`, und wer wissen
 * wollte, warum das vierte Konto nicht ging, las es in einer Fehlermeldung.
 * Die Seite zeigt beides, bevor es jemand braucht: was die Lizenz trägt und
 * was davon belegt ist. Dieselben Zahlen wie die Riegel (aktive Konten, jede
 * eingespielte App) und wie `scripts/util/lizenz-geraet.sh status`.
 *
 * Der FINGERABDRUCK steht zum Kopieren da: eine Lizenz kann an ein Gerät
 * gebunden sein, und wer sie ausstellt, braucht genau diesen Wert.
 *
 * Die Rolle blendet aus, das Backend entscheidet: jeder Weg dieser Seite
 * trägt `requireRole('admin')`.
 */
import { useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Feldgruppe,
  Formularseite,
  Kennzahl,
  Kennzahlen,
  Kopf,
  Textarea,
} from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useToast } from '@/contexts/ToastContext';
import type { ApiError } from '@/hooks/useApi';
import { useLizenz, useLizenzEinspielen, type Belegung, type Stufe } from './lizenz/useLizenz';

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
 * „1.1.10000". Gelesen wird deshalb in UTC — der Tag, der dasteht, ist der
 * Tag, der gemeint ist. Und 9999 ist kein Datum, sondern die Art, wie eine
 * Lizenz ohne Ablauf ihr Pflichtfeld füllt: ab diesem Jahr steht
 * „unbegrenzt" da.
 */
function datum(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getUTCFullYear() >= 9999) return 'unbegrenzt';
  return d.toLocaleDateString('de-DE', { timeZone: 'UTC' });
}

export function LizenzSettings() {
  const toast = useToast();
  const { data, isLoading, isError } = useLizenz();
  const einspielen = useLizenzEinspielen();
  const [lizenz, setLizenz] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);

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

  const handleEinspielen = () => {
    setFehler(null);
    einspielen.mutate(lizenz.trim(), {
      onSuccess: res => {
        setLizenz('');
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
    <div className="animate-in fade-in" data-testid="lizenz-seite">
      <Kopf
        titel="Lizenz"
        symbol={<KeyRound />}
        beschreibung="Was dieses Gerät trägt, was davon belegt ist, und wo eine neue Lizenz hineingeht."
      />

      {isLoading ? (
        <SkeletonText lines={5} />
      ) : isError || !data || !n ? (
        <p className="text-sm text-muted-foreground" data-testid="lizenz-fehler">
          Die Lizenz ließ sich nicht laden.
        </p>
      ) : (
        <Formularseite>
          <Kennzahlen className="lg:grid-cols-3">
            <Kennzahl
              beschriftung="Stufe"
              wert={<span data-testid="lizenz-stufe">{STUFEN_NAME[n.stufe] ?? n.stufe}</span>}
              fussnote={
                data.valid
                  ? [
                      data.customer,
                      bis === 'unbegrenzt' ? 'unbegrenzt gültig' : bis ? `gültig bis ${bis}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : 'ohne Lizenz'
              }
            />
            <Kennzahl
              beschriftung="Konten"
              wert={<span data-testid="lizenz-konten">{belegt(n.konten)}</span>}
              fussnote={
                n.konten.grenze === -1 ? 'unbegrenzt' : 'aktive Konten, der Administrator zählt mit'
              }
            />
            <Kennzahl
              beschriftung="Apps"
              wert={<span data-testid="lizenz-apps">{belegt(n.apps)}</span>}
              fussnote={n.apps.grenze === -1 ? 'unbegrenzt' : 'Test- und Livestand zählen zusammen'}
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

          <Feldgruppe
            titel="Fingerabdruck"
            beschreibung="Die Kennung dieses Geräts. Eine Lizenz kann an sie gebunden sein; wer sie ausstellt, braucht diesen Wert."
          >
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
          </Feldgruppe>

          <Feldgruppe
            titel="Lizenz einspielen"
            beschreibung="Die Lizenz ist eine Zeile Text. Sie wird geprüft, bevor sie gilt; eine, die nicht besteht, ändert nichts."
          >
            <div className="flex flex-col gap-3">
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
              <div>
                <Button
                  onClick={handleEinspielen}
                  disabled={lizenz.trim().length < 10 || einspielen.isPending}
                  data-testid="lizenz-einspielen"
                >
                  <KeyRound className="size-4" aria-hidden="true" />
                  Einspielen
                </Button>
              </div>
            </div>
          </Feldgruppe>
        </Formularseite>
      )}
    </div>
  );
}
