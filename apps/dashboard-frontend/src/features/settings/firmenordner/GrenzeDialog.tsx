/**
 * Die Größengrenze eines Hauptordners oder Bereichs einstellen (Auftrag
 * bereich-quote-sichtbar, 28.09.2026, J33).
 *
 * Bis dahin hatte jeder Bereich still 1 GB, und ein Abgleich scheiterte an
 * ihr, ohne dass der Administrator davon wusste. Jetzt steht sie in der
 * Spalte „Platz", und hier stellt er sie ein: mit einer Zahl, oder ohne
 * Grenze — dann nimmt der Bereich auf, bis die Platte des Geräts voll ist.
 *
 * Tausenderschritte wie der Firmenordner selbst (seine 1 GB sind
 * 1.000.000.000 Bytes), damit die Zahl hier dieselbe ist wie die, die ein
 * Mitarbeiter in seinem Abgleich liest.
 */
import { useEffect, useState, type FormEvent } from 'react';
import {
  Alert,
  AlertDescription,
  Button,
  Dialogform,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@marken';
import { useToast } from '@/contexts/ToastContext';
import { formatBytes } from '@/utils/formatting';
import { useGrenzeSetzen, type Ordner, type PlatzStand } from './useFirmenordner';
import { fehlertext } from '@/utils/fehlertext';

const EINHEITEN = { MB: 1e6, GB: 1e9, TB: 1e12 } as const;
type Einheit = keyof typeof EINHEITEN;

/** Eine Bytezahl als Zahl und Einheit, so groß wie es glatt geht. */
function zerlegen(bytes: number): { zahl: string; einheit: Einheit } {
  const einheit: Einheit = bytes >= EINHEITEN.TB ? 'TB' : bytes >= EINHEITEN.GB ? 'GB' : 'MB';
  const zahl = Math.round((bytes / EINHEITEN[einheit]) * 100) / 100;
  return { zahl: zahl.toLocaleString('de-DE', { useGrouping: false }), einheit };
}

/** „1,5" oder „1.5" als Zahl; alles andere als `null`. */
function alsZahl(text: string): number | null {
  const wert = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(wert) && wert > 0 ? wert : null;
}

interface Props {
  fuer: Ordner | null;
  platz: PlatzStand | null;
  /** Was auf der Platte des Geräts frei ist, oder `null`, wenn es sich nicht lesen ließ. */
  platteFrei: number | null;
  onSchliessen: () => void;
}

export function GrenzeDialog({ fuer, platz, platteFrei, onSchliessen }: Props) {
  const toast = useToast();
  const setzen = useGrenzeSetzen();
  const [art, setArt] = useState<'mit' | 'ohne'>('mit');
  const [zahl, setZahl] = useState('');
  const [einheit, setEinheit] = useState<Einheit>('GB');
  const [fehler, setFehler] = useState<string | null>(null);

  // Beim Öffnen steht da, was gerade gilt.
  useEffect(() => {
    if (!fuer) return;
    setFehler(null);
    if (platz?.grenze) {
      const z = zerlegen(platz.grenze);
      setArt('mit');
      setZahl(z.zahl);
      setEinheit(z.einheit);
    } else {
      setArt(platz ? 'ohne' : 'mit');
      setZahl('');
      setEinheit('GB');
    }
  }, [fuer, platz]);

  const belegt = platz?.belegt ?? 0;
  const wert = alsZahl(zahl);
  const bytes = wert === null ? null : Math.round(wert * EINHEITEN[einheit]);
  const zuKlein = art === 'mit' && bytes !== null && (bytes < 1e6 || bytes < belegt);
  const ueberPlatte =
    art === 'mit' && bytes !== null && platteFrei !== null && bytes > belegt + platteFrei;
  const vollstaendig = art === 'ohne' || (bytes !== null && !zuKlein);

  const absenden = (e: FormEvent) => {
    e.preventDefault();
    if (!fuer || !vollstaendig || setzen.isPending) return;
    setFehler(null);
    const grenze = art === 'ohne' ? null : bytes;
    setzen.mutate(
      { ordnerId: fuer.id, grenze },
      {
        onSuccess: () => {
          toast.success(
            grenze === null
              ? `„${fuer.kennung}“ hat keine Grenze mehr; er nimmt auf, bis das Gerät voll ist.`
              : `Die Grenze von „${fuer.kennung}“ steht auf ${formatBytes(grenze)}.`
          );
          onSchliessen();
        },
        onError: err => setFehler(fehlertext(err)),
      }
    );
  };

  return (
    <Dialogform
      offen={fuer !== null}
      beiSchliessen={onSchliessen}
      titel={fuer ? `Grenze von „${fuer.name}“` : 'Grenze'}
      groesse="klein"
      fuss={
        <div className="flex w-full justify-end gap-3">
          <Button type="button" variant="outline" onClick={onSchliessen}>
            Abbrechen
          </Button>
          <Button
            type="submit"
            form="grenze-setzen"
            disabled={!vollstaendig || setzen.isPending}
            data-testid="grenze-absenden"
          >
            {setzen.isPending ? 'Speichert…' : 'Speichern'}
          </Button>
        </div>
      }
    >
      <form
        id="grenze-setzen"
        className="flex flex-col gap-4"
        onSubmit={absenden}
        data-testid="grenze-dialog"
      >
        <p className="text-sm text-muted-foreground">
          Belegt sind {formatBytes(belegt)}
          {platteFrei !== null && <>, auf dem Gerät frei {formatBytes(platteFrei)}</>}. Ein
          Abgleich, der mehr bringen würde, als die Grenze erlaubt, wird abgewiesen. Projekte teilen
          sich die Grenze ihres Bereichs.
        </p>
        {fehler && (
          <Alert variant="destructive" data-testid="grenze-fehler">
            <AlertDescription>{fehler}</AlertDescription>
          </Alert>
        )}
        <RadioGroup
          value={art}
          onValueChange={w => setArt(w as 'mit' | 'ohne')}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="grenze-mit" className="flex items-center gap-2 font-normal">
              <RadioGroupItem value="mit" id="grenze-mit" data-testid="grenze-mit" />
              Höchstens
            </Label>
            <div className="flex gap-2 pl-6">
              <Input
                id="grenze-zahl"
                aria-label="Grenze"
                inputMode="decimal"
                value={zahl}
                onChange={e => {
                  setZahl(e.target.value);
                  setArt('mit');
                }}
                autoComplete="off"
                className="w-28"
                data-testid="grenze-zahl"
              />
              <Select
                value={einheit}
                onValueChange={w => {
                  setEinheit(w as Einheit);
                  setArt('mit');
                }}
              >
                <SelectTrigger className="w-24" aria-label="Einheit" data-testid="grenze-einheit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(EINHEITEN) as Einheit[]).map(e => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Label htmlFor="grenze-ohne" className="flex items-center gap-2 font-normal">
            <RadioGroupItem value="ohne" id="grenze-ohne" data-testid="grenze-ohne" />
            Ohne Grenze, bis der freie Platz des Geräts aufgebraucht ist
          </Label>
        </RadioGroup>
        {zuKlein && (
          <p className="text-sm text-destructive" data-testid="grenze-zu-klein">
            {bytes !== null && bytes < belegt
              ? `Darin liegen schon ${formatBytes(belegt)}; die Grenze muss mindestens so groß sein.`
              : 'Die Grenze ist mindestens 1 MB.'}
          </p>
        )}
        {ueberPlatte && (
          <p className="text-sm text-muted-foreground" data-testid="grenze-ueber-platte">
            Die Grenze ist größer als der freie Platz des Geräts. Der Bereich ist dann voll, wenn
            das Gerät voll ist, nicht erst an der Grenze.
          </p>
        )}
      </form>
    </Dialogform>
  );
}
