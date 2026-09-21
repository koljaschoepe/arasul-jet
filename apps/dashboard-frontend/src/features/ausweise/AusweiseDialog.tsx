/**
 * Meine Ausweise: anlegen, ansehen, widerrufen (Brücke, 21.09.2026, J34).
 *
 * WARUM EIN DIALOG UND KEINE EINSTELLUNGS-SEKTION. Die Einstellungen sind seit
 * D1 eine Admin-Seite; ein Mitarbeiter sieht sie nicht, und er ist gerade der,
 * für den dieser Ausweis gebaut ist. Er steht deshalb im Benutzermenü der
 * Kopfleiste — an derselben Stelle wie das Abmelden, und aus demselben Grund
 * wie dieses (D1): was jedem gehört, gehört nicht in die Verwaltung.
 *
 * DER WERT STEHT GENAU EINMAL DA. Danach hat ihn niemand mehr — auch dieses
 * Gerät nicht, dort liegt nur eine Prüfsumme. Deshalb bleibt er nach dem
 * Anlegen stehen, bis der Mensch ihn ausdrücklich wegklickt, und deshalb
 * schließt der Dialog nicht bei einem Klick daneben, solange er da steht: ein
 * verlorener Ausweis ist nicht wiederzubeschaffen, nur neu auszustellen.
 *
 * UND HIER STEHT AUCH DIE SICHT DES ADMINISTRATORS, statt als eigene Sektion
 * in den Einstellungen. Zwei Orte für dieselbe Sache wären zwei Orte, an denen
 * jemand nachsieht, wer wo einen Ausweis liegen hat — und er hat ohnehin
 * beide Rollen in einer Person: er hat eigene Ausweise UND er betreibt das
 * Gerät. Was er mehr sieht, ist ein zweiter Abschnitt und kein zweiter Weg.
 * AUSSTELLEN kann er auch hier nur für sich: der Wert wird einmal gezeigt,
 * und zwar dem, der vor dem Bildschirm sitzt — ein Ausweis, den ein
 * Administrator weiterreicht, hat auf dem Weg in einer Mail gestanden.
 */
import { useState } from 'react';
import { Check, Copy, IdCard, Plus, Trash2 } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialogform,
  Input,
  Label,
  Leerzustand,
} from '@marken';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import useConfirm from '@/hooks/useConfirm';
import { formatDate } from '@/utils/formatting';
import {
  useAlleAusweise,
  useAusweise,
  useAusweisAusstellen,
  useAusweisWiderrufen,
  type AusgestellterAusweis,
} from './useAusweise';

interface AusweiseDialogProps {
  offen: boolean;
  beiSchliessen: () => void;
}

export function AusweiseDialog({ offen, beiSchliessen }: AusweiseDialogProps) {
  const { user } = useAuth();
  const istAdmin = user?.role === 'admin';
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  // Erst laden, wenn der Dialog offen ist: das Benutzermenü steht auf jeder
  // Seite, und die meisten Menschen machen es nie auf.
  const { data: ausweise, isLoading, isError } = useAusweise(offen);
  // Nur als Administrator, und nur bei offenem Dialog: die Route trägt
  // `requireRole('admin')`, und eine Abfrage daneben wäre ein 403 in der
  // Konsole eines Mitarbeiters (der Fund aus D2 und D3).
  const { data: alle } = useAlleAusweise(offen && istAdmin);
  const ausstellen = useAusweisAusstellen();
  const widerrufen = useAusweisWiderrufen();

  const [name, setName] = useState('');
  const [frisch, setFrisch] = useState<AusgestellterAusweis | null>(null);
  const [kopiert, setKopiert] = useState(false);

  const liste = ausweise ?? [];

  const schliessen = () => {
    setName('');
    setFrisch(null);
    setKopiert(false);
    beiSchliessen();
  };

  const handleAusstellen = () => {
    const getrimmt = name.trim();
    if (!getrimmt) return;
    ausstellen.mutate(getrimmt, {
      onSuccess: neu => {
        setFrisch(neu);
        setKopiert(false);
        setName('');
      },
    });
  };

  const handleKopieren = async () => {
    if (!frisch) return;
    try {
      await navigator.clipboard.writeText(frisch.ausweis);
      setKopiert(true);
    } catch {
      // Ohne sichere Herkunft gibt es keine Zwischenablage. Der Wert steht
      // daneben und lässt sich markieren — eine Fehlermeldung wäre hier
      // schlimmer als der Hinweis, ihn von Hand zu nehmen.
      toast.error('Die Zwischenablage ist hier nicht verfügbar. Bitte von Hand markieren.');
    }
  };

  const handleWiderrufen = async (id: number, wie: string) => {
    const ok = await confirm({
      title: `Ausweis „${wie}“ widerrufen?`,
      message:
        'Der Rechner, auf dem er liegt, kommt danach nicht mehr an Ihre Apps. ' +
        'Zurückholen lässt er sich nicht, nur ein neuer ausstellen.',
      confirmText: 'Widerrufen',
      confirmVariant: 'warning',
    });
    if (!ok) return;
    widerrufen.mutate(id, { onSuccess: () => toast.success(`Ausweis „${wie}“ widerrufen.`) });
  };

  return (
    <>
      {ConfirmDialog}
      <Dialogform
        offen={offen}
        beiSchliessen={schliessen}
        titel="Ausweise"
        groesse="mittel"
        /* Solange ein frischer Wert dasteht, schließt nur der Knopf: ein Klick
           daneben oder eine Escape-Taste hätte ihn unwiederbringlich
           weggenommen. */
        schliesstBeiKlickDaneben={!frisch}
        schliesstBeiEscape={!frisch}
        fuss={
          <Button variant="secondary" onClick={schliessen} data-testid="ausweise-schliessen">
            Schließen
          </Button>
        }
      >
        <div className="space-y-4" data-testid="ausweise-dialog">
          <p className="text-sm text-muted-foreground">
            Ein Ausweis lässt ein Programm auf Ihrem Rechner, etwa das CLI in Ihrem Firmenordner,
            mit den Apps sprechen, die Ihnen freigegeben sind. Er gilt nur für Sie und nur für diese
            Apps. Legen Sie je Rechner einen an, dann können Sie einen einzelnen widerrufen, wenn
            der Rechner abhanden kommt.
          </p>

          {frisch && (
            <Alert data-testid="ausweis-frisch">
              <AlertTitle>„{frisch.name}“ ist ausgestellt</AlertTitle>
              <AlertDescription>
                <span>
                  Dieser Wert steht genau einmal hier. Auch dieses Gerät kennt ihn danach nicht
                  mehr: es hat nur seine Prüfsumme. Legen Sie ihn auf dem Rechner ab, für den er
                  ist.
                </span>
                <code
                  className="mt-2 block w-full break-all rounded border border-border bg-muted p-2 font-mono text-ui-xs"
                  data-testid="ausweis-wert"
                >
                  {frisch.ausweis}
                </code>
                <span className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => void handleKopieren()}
                    data-testid="ausweis-kopieren"
                  >
                    {kopiert ? (
                      <Check className="size-4" aria-hidden="true" />
                    ) : (
                      <Copy className="size-4" aria-hidden="true" />
                    )}
                    {kopiert ? 'Kopiert' : 'Kopieren'}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setFrisch(null)}
                    data-testid="ausweis-verstanden"
                  >
                    Ich habe ihn
                  </Button>
                </span>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="ausweis-name">Name des Rechners</Label>
              <Input
                id="ausweis-name"
                value={name}
                maxLength={60}
                placeholder="z. B. Laptop im Büro"
                onChange={e => setName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAusstellen();
                  }
                }}
                data-testid="ausweis-name"
              />
            </div>
            <Button
              onClick={handleAusstellen}
              disabled={!name.trim() || ausstellen.isPending}
              data-testid="ausweis-ausstellen"
            >
              <Plus className="size-4" aria-hidden="true" />
              Ausstellen
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Wird geladen …</p>
          ) : isError ? (
            <p className="text-sm text-muted-foreground" data-testid="ausweise-fehler">
              Die Liste ließ sich nicht laden.
            </p>
          ) : liste.length === 0 ? (
            <Leerzustand
              symbol={<IdCard />}
              titel="Noch kein Ausweis"
              beschreibung="Solange keiner da ist, kommt kein Programm außerhalb des Browsers an Ihre Apps."
            />
          ) : (
            <ul className="rounded-md border border-border" data-testid="ausweise-liste">
              {liste.map(a => (
                <li
                  key={a.id}
                  data-testid={`ausweis-${a.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border p-ui-3 last:border-b-0"
                >
                  <span className="text-sm font-medium text-foreground">{a.name}</span>
                  <span className="font-mono text-ui-xs text-muted-foreground">{a.praefix}…</span>
                  <span className="text-ui-xs text-muted-foreground">
                    {/* „noch nie benutzt“ ist die Auskunft, an der ein Mensch
                        merkt, dass er den Ausweis widerrufen kann. */}
                    {a.zuletzt_benutzt_am
                      ? `zuletzt ${formatDate(a.zuletzt_benutzt_am)}`
                      : 'noch nie benutzt'}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    disabled={widerrufen.isPending}
                    onClick={() => void handleWiderrufen(a.id, a.name)}
                    data-testid={`ausweis-widerrufen-${a.id}`}
                    title="Widerrufen"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    <span className="sr-only">Widerrufen</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {istAdmin && (
            <section className="border-t border-border pt-4" data-testid="ausweise-alle">
              <h3 className="text-sm font-medium text-foreground">Alle Ausweise am Gerät</h3>
              <p className="mt-1 text-ui-xs text-muted-foreground">
                Was Sie hier sehen, ist der Betrieb und nicht Ihre Arbeit: wer wo einen Ausweis
                liegen hat und wann er zuletzt gebraucht wurde. Widerrufen können Sie jeden: ein
                Rechner, der abhanden kommt, gehört jemandem, der vielleicht gerade nicht am Gerät
                ist. Ausstellen kann ihn nur sein Mensch selbst.
              </p>
              {(alle ?? []).length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Am Gerät liegt kein Ausweis.</p>
              ) : (
                <ul className="mt-2 rounded-md border border-border">
                  {(alle ?? []).map(a => (
                    <li
                      key={a.id}
                      data-testid={`ausweis-fremd-${a.id}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border p-ui-3 last:border-b-0"
                    >
                      <span className="text-sm font-medium text-foreground">{a.username}</span>
                      <span className="text-sm text-muted-foreground">{a.name}</span>
                      <span className="font-mono text-ui-xs text-muted-foreground">
                        {a.praefix}…
                      </span>
                      <span className="text-ui-xs text-muted-foreground">
                        {a.zuletzt_benutzt_am
                          ? `zuletzt ${formatDate(a.zuletzt_benutzt_am)}`
                          : 'noch nie benutzt'}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        disabled={widerrufen.isPending}
                        onClick={() => void handleWiderrufen(a.id, `${a.username} · ${a.name}`)}
                        data-testid={`ausweis-fremd-widerrufen-${a.id}`}
                        title="Widerrufen"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                        <span className="sr-only">Widerrufen</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </Dialogform>
    </>
  );
}
