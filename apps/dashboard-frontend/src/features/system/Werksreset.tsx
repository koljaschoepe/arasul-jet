import { useCallback, useState } from 'react';
import { AlertTriangle, RotateCcw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { cn } from '@/lib/utils';
import { useApi } from '../../hooks/useApi';
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
  n8nWirdGeleert: boolean;
  unbekannteTabellen: string[];
  durchfuehrbar: boolean;
}

interface Bericht {
  stufe: Stufe;
  zeilenGesamt: number;
  dauerMs: number;
  tabellen: Record<string, number>;
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
    text: 'Zusätzlich die gesamte Einrichtung: Zugangsdaten, Erweiterungen, Flows, n8n-Workflows, hinterlegte Zugänge zu fremden Diensten, Protokolle und Messwerte. Danach läuft wieder die Ersteinrichtung.',
  },
];

export function Werksreset() {
  const api = useApi();
  const toast = useToast();

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
      const ergebnis = await api.post<Bericht>('/werksreset', {
        stufe,
        modelleLoeschen,
        bestaetigung: eingabe.trim(),
      });
      setBericht(ergebnis);
      setVorschau(null);
      setEingabe('');
      toast.success(`Werksreset abgeschlossen: ${ergebnis.zeilenGesamt} Zeilen entfernt`);
    } finally {
      setLaeuft(false);
    }
  }, [api, toast, vorschau, stufe, modelleLoeschen, eingabe]);

  const nameStimmt = vorschau !== null && eingabe.trim() === vorschau.geraetename;
  const betroffen = vorschau?.tabellen.filter(t => (t.zeilen ?? 0) > 0) ?? [];

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <RotateCcw className="size-5 text-primary" />
          Werksreset
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Setzt das Gerät zurück. Es gibt kein Rückgängig. Was hier verschwindet, ist nur noch in
          einer Sicherung vorhanden.
        </p>
      </div>

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
                ? 'border-primary bg-primary/5'
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
            Auch die heruntergeladenen Modelle löschen. Ohne Modelle kann das Gerät bis zum nächsten
            Download weder antworten noch Dokumente durchsuchen.
          </span>
        </label>
      </fieldset>

      <div>
        <Button type="button" variant="outline" onClick={vorschauLaden} disabled={laedt || laeuft}>
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
              {vorschau.zeilenGesamt.toLocaleString('de-DE')} Zeilen in {betroffen.length} Tabellen
              werden gelöscht
              {vorschau.n8nWirdGeleert ? ', dazu alle n8n-Workflows' : ''}
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

      {bericht && (
        <Alert>
          <AlertDescription>
            Werksreset{' '}
            {bericht.stufe === 'inhalte' ? 'Inhalte zurücksetzen' : 'Auslieferungszustand'}{' '}
            abgeschlossen: {bericht.zeilenGesamt.toLocaleString('de-DE')} Zeilen in{' '}
            {Object.keys(bericht.tabellen).length} Tabellen,{' '}
            {Math.round(bericht.dauerMs / 100) / 10} Sekunden.
            {bericht.stufe === 'auslieferung' &&
              ' Beim nächsten Aufruf startet die Ersteinrichtung.'}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default Werksreset;
