import { useCallback, useState } from 'react';
import { AlertTriangle, RotateCcw, ShieldAlert } from 'lucide-react';
import { Kopf } from '@marken';
import { Alert, AlertDescription, Button, cn, Input, Label } from '@marken';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

/**
 * Werksreset (Plan 023 B5).
 *
 * Zwei Stufen und zwei Schritte. Die Stufe sagt, wie weit zurück; die zwei
 * Schritte verhindern, dass ein Klick reicht. Zwischen beiden steht die
 * Vorschau: sie zählt vorher ab, was verschwindet. Wer die Zahlen gesehen hat,
 * kann sich hinterher nicht überrascht nennen.
 *
 * Bestätigt wird durch Eintippen des Gerätenamens. Ein Wort wie „LÖSCHEN" tippt
 * man im Zweifel auch auf dem falschen Gerät.
 */

type Stufe = 'inhalte' | 'auslieferung';

interface TabellenStand {
  name: string;
  zweck: string;
  zeilen: number | null;
}

interface OrdnerStand {
  pfad: string;
  zweck: string;
  eintraege: number | null;
}

interface Vorschau {
  stufe: Stufe;
  modelleLoeschen: boolean;
  geraetename: string;
  tabellen: TabellenStand[];
  zeilenGesamt: number;
  ordner: OrdnerStand[];
  unbekannteTabellen: string[];
  durchfuehrbar: boolean;
}

/** Ergebnis eines Nachbarsystems: entweder ok, oder mit Grund. */
interface Nebenwirkung {
  ok: boolean;
  fehler?: string;
}

interface Bericht {
  stufe: Stufe;
  zeilenGesamt: number;
  dauerMs: number;
  tabellen: Record<string, number>;
  modelle?: Nebenwirkung;
  ordner?: { pfad: string; fehler?: string }[];
}

/**
 * Was gescheitert ist, mit dem Satz daneben, der die Folge benennt. Die
 * Datenbank ist zu diesem Zeitpunkt schon geleert; ein toter Nachbardienst
 * nimmt das nicht zurueck. Genau deshalb darf die Oberflaeche hier nicht
 * pauschal Erfolg melden.
 */
const FOLGE: Record<string, string> = {
  modelle: 'Die Modelle liegen noch auf der Platte.',
};

function gescheiterteSchritte(bericht: Bericht): { name: string; fehler: string }[] {
  return (Object.keys(FOLGE) as (keyof Bericht)[])
    .map(name => ({ name: String(name), wert: bericht[name] as Nebenwirkung | undefined }))
    .filter(e => e.wert && e.wert.ok === false)
    .map(e => ({ name: e.name, fehler: e.wert?.fehler ?? 'ohne Meldung' }));
}

const STUFEN: { id: Stufe; titel: string; text: string }[] = [
  {
    id: 'inhalte',
    titel: 'Inhalte zurücksetzen',
    text: 'Chats, Dokumente, Wissensräume, Projekte, Sandboxes und alle Flow-Läufe sind danach weg. Zugang, Erweiterungen, Flows, Einstellungen und Modelle bleiben.',
  },
  {
    id: 'auslieferung',
    titel: 'Auslieferungszustand',
    text: 'Zusätzlich die gesamte Einrichtung: Zugangsdaten, Erweiterungen, Flows, hinterlegte Zugänge zu fremden Diensten, Protokolle und Messwerte. Danach läuft wieder die Ersteinrichtung.',
  },
];

export function Werksreset() {
  const api = useApi();
  const toast = useToast();
  const { logout } = useAuth();

  const [stufe, setStufe] = useState<Stufe>('inhalte');
  const [modelleLoeschen, setModelleLoeschen] = useState(false);
  const [vorschau, setVorschau] = useState<Vorschau | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [eingabe, setEingabe] = useState('');
  const [bericht, setBericht] = useState<Bericht | null>(null);

  const vorschauLaden = useCallback(async () => {
    setLaedt(true);
    setBericht(null);
    try {
      const daten = await api.get<Vorschau>(
        `/werksreset/vorschau?stufe=${stufe}&modelle=${modelleLoeschen}`
      );
      setVorschau(daten);
      setEingabe('');
    } catch {
      setVorschau(null);
    } finally {
      setLaedt(false);
    }
  }, [api, stufe, modelleLoeschen]);

  const ausfuehren = useCallback(async () => {
    if (!vorschau) return;
    setLaeuft(true);
    try {
      // Der Standard von useApi sind 30 Sekunden. Der Reset raeumt Tabellen,
      // Ordner und auf Wunsch die Modelle; bei gefuelltem
      // Geraet reicht das nicht. Ein Abbruch im Browser wuerde den Reset nicht
      // stoppen, sondern nur eine Fehlermeldung ueber einen gelungenen Reset legen.
      const ergebnis = await api.post<Bericht>(
        '/werksreset',
        { stufe, modelleLoeschen, bestaetigung: eingabe.trim() },
        { signal: AbortSignal.timeout(15 * 60 * 1000) }
      );
      setBericht(ergebnis);
      setVorschau(null);
      setEingabe('');
      const offen = gescheiterteSchritte(ergebnis);
      if (offen.length > 0) {
        toast.error(`Werksreset mit ${offen.length} offenen Punkten abgeschlossen`);
      } else {
        toast.success(`Werksreset abgeschlossen: ${ergebnis.zeilenGesamt} Zeilen entfernt`);
      }
      // Nach dem Auslieferungszustand gibt es keinen Zugang mehr. Diesen Tab
      // weiter angemeldet stehen zu lassen, waere genau die Luege, die der
      // Reset beseitigen soll. Kurz stehen lassen, damit das Ergebnis lesbar
      // bleibt, dann abmelden: die Anwendung zeigt danach die Ersteinrichtung.
      if (stufe === 'auslieferung' && offen.length === 0) {
        setTimeout(() => {
          void logout();
        }, 6000);
      }
    } finally {
      setLaeuft(false);
    }
  }, [api, toast, logout, vorschau, stufe, modelleLoeschen, eingabe]);

  const nameStimmt = vorschau !== null && eingabe.trim() === vorschau.geraetename;
  const betroffen = vorschau?.tabellen.filter(t => (t.zeilen ?? 0) > 0) ?? [];

  return (
    <div className="max-w-3xl">
      <Kopf
        titel="Werksreset"
        symbol={<RotateCcw />}
        beschreibung="Setzt das Gerät zurück. Es gibt kein Rückgängig. Was hier verschwindet, ist nur noch in einer Sicherung vorhanden."
      />

      <div className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-3" disabled={laeuft}>
          <legend className="sr-only">Stufe wählen</legend>
          {STUFEN.map(eintrag => (
            <button
              key={eintrag.id}
              type="button"
              onClick={() => {
                setStufe(eintrag.id);
                setVorschau(null);
                setBericht(null);
              }}
              aria-pressed={stufe === eintrag.id}
              className={cn(
                'text-left rounded-lg border p-4 transition-colors',
                stufe === eintrag.id
                  ? 'border-foreground font-medium'
                  : 'border-border hover:border-muted-foreground/40'
              )}
            >
              <span className="block font-medium text-foreground">{eintrag.titel}</span>
              <span className="block text-sm text-muted-foreground mt-1">{eintrag.text}</span>
            </button>
          ))}

          <label className="flex items-start gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="mt-1"
              checked={modelleLoeschen}
              onChange={e => {
                setModelleLoeschen(e.target.checked);
                setVorschau(null);
              }}
            />
            <span>
              Auch die heruntergeladenen Modelle löschen. Ohne Modelle kann das Gerät bis zum
              nächsten Download weder antworten noch Dokumente durchsuchen.
            </span>
          </label>
        </fieldset>

        <div>
          <Button
            type="button"
            variant="outline"
            onClick={vorschauLaden}
            disabled={laedt || laeuft}
          >
            {laedt ? 'Wird geprüft …' : 'Vorschau anzeigen'}
          </Button>
        </div>

        {vorschau && !vorschau.durchfuehrbar && (
          <Alert variant="destructive">
            <ShieldAlert className="size-4" />
            <AlertDescription>
              Der Werksreset ist gesperrt. {vorschau.unbekannteTabellen.length} Tabellen sind in der
              Klassifikation nicht eingeordnet:{' '}
              <code className="text-xs">{vorschau.unbekannteTabellen.join(', ')}</code>. Ein Reset,
              der etwas stehen lässt, behauptet Vollständigkeit, die er nicht hat.
            </AlertDescription>
          </Alert>
        )}

        {vorschau && vorschau.durchfuehrbar && (
          <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription>
                {vorschau.zeilenGesamt.toLocaleString('de-DE')} Zeilen in {betroffen.length}{' '}
                Tabellen werden gelöscht
                {vorschau.modelleLoeschen ? ' und alle Modelle' : ''}.
              </AlertDescription>
            </Alert>

            {betroffen.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">Bereich</th>
                      <th className="text-right font-medium px-3 py-2">Zeilen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {betroffen.map(t => (
                      <tr key={t.name} className="border-t border-border">
                        <td className="px-3 py-1.5 text-foreground">{t.zweck}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                          {(t.zeilen ?? 0).toLocaleString('de-DE')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="werksreset-bestaetigung">
                Zum Bestätigen den Gerätenamen eintippen: <strong>{vorschau.geraetename}</strong>
              </Label>
              <Input
                id="werksreset-bestaetigung"
                value={eingabe}
                autoComplete="off"
                spellCheck={false}
                onChange={e => setEingabe(e.target.value)}
                placeholder={vorschau.geraetename}
                disabled={laeuft}
              />
            </div>

            <div>
              <Button
                type="button"
                variant="destructive"
                onClick={ausfuehren}
                disabled={!nameStimmt || laeuft}
              >
                {laeuft ? 'Läuft …' : 'Werksreset jetzt ausführen'}
              </Button>
            </div>
          </div>
        )}

        {bericht &&
          (() => {
            const offen = gescheiterteSchritte(bericht);
            return (
              <Alert variant={offen.length > 0 ? 'destructive' : undefined}>
                {offen.length > 0 && <AlertTriangle className="size-4" />}
                <AlertDescription>
                  <p>
                    Werksreset{' '}
                    {bericht.stufe === 'inhalte' ? 'Inhalte zurücksetzen' : 'Auslieferungszustand'}{' '}
                    abgeschlossen: {bericht.zeilenGesamt.toLocaleString('de-DE')} Zeilen in{' '}
                    {Object.keys(bericht.tabellen).length} Tabellen,{' '}
                    {Math.round(bericht.dauerMs / 100) / 10} Sekunden.
                    {offen.length === 0 &&
                      bericht.stufe === 'auslieferung' &&
                      ' Diese Sitzung wird gleich beendet, danach startet die Ersteinrichtung.'}
                  </p>
                  {offen.length > 0 && (
                    <>
                      <p className="mt-2 font-medium">
                        {offen.length} Schritte sind nicht durchgelaufen. Die Datenbank ist trotzdem
                        geleert, das lässt sich nicht zurücknehmen.
                      </p>
                      <ul className="mt-1 list-disc pl-5">
                        {offen.map(schritt => (
                          <li key={schritt.name}>
                            {FOLGE[schritt.name]}{' '}
                            <span className="opacity-80">({schritt.fehler})</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </AlertDescription>
              </Alert>
            );
          })()}
      </div>
    </div>
  );
}
