/**
 * Einen Ordner anlegen (Auftrag firmenordner-rechte-im-frontend, 22.09.2026).
 *
 * Drei Formen, und die Art entscheidet, was gefragt wird: ein Bereich
 * (Ebene 1, geteilt), ein Projekt darin (Ebene 2, braucht einen Bereich), ein
 * Ordner am Gerät (Ebene 1, nie abgeglichen) — und die Wurzel, aber nur,
 * solange es keine gibt: sie ist genau eine je Gerät, und der Knopf dafür
 * steht auf der Seite, nicht hier als vierte Wahl.
 *
 * Die Kennung ist streng (Kleinbuchstaben, Ziffern, Bindestriche), weil sie
 * zum Ordnernamen auf der Platte des Geräts UND auf jedem Rechner wird, der
 * abgleicht (`schemas/firmenordner.js`). Der Name daneben darf alles.
 */
import { useState, type FormEvent } from 'react';
import {
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
import type { NeuerOrdner, Ordner } from './useFirmenordner';

/** Dieselbe Regel wie im Backend (`schemas/firmenordner.js`). */
const KENNUNG = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

type Form = 'bereich' | 'projekt' | 'am_geraet';

interface Props {
  offen: boolean;
  laeuft: boolean;
  /** Die Bereiche der Ebene 1, unter die ein Projekt gelegt werden kann. */
  bereiche: Ordner[];
  onSchliessen: () => void;
  onAnlegen: (neu: NeuerOrdner) => void;
}

export function OrdnerAnlegenDialog({ offen, laeuft, bereiche, onSchliessen, onAnlegen }: Props) {
  const [form, setForm] = useState<Form>('bereich');
  const [kennung, setKennung] = useState('');
  const [name, setName] = useState('');
  const [eltern, setEltern] = useState('');

  const kennungPasst = kennung.length >= 2 && kennung.length <= 40 && KENNUNG.test(kennung);
  const vollstaendig =
    kennungPasst && name.trim().length > 0 && (form !== 'projekt' || eltern.length > 0);

  const schliessen = () => {
    setForm('bereich');
    setKennung('');
    setName('');
    setEltern('');
    onSchliessen();
  };

  const absenden = (e: FormEvent) => {
    e.preventDefault();
    if (!vollstaendig || laeuft) return;
    onAnlegen({
      kennung,
      name: name.trim(),
      ebene: form === 'projekt' ? 2 : 1,
      art: form === 'am_geraet' ? 'am_geraet' : 'geteilt',
      ...(form === 'projekt' ? { eltern } : {}),
    });
  };

  return (
    <Dialogform
      offen={offen}
      beiSchliessen={schliessen}
      titel="Ordner anlegen"
      groesse="klein"
      fuss={
        <div className="flex w-full justify-end gap-3">
          <Button type="button" variant="outline" onClick={schliessen}>
            Abbrechen
          </Button>
          <Button
            type="submit"
            form="ordner-anlegen"
            disabled={!vollstaendig || laeuft}
            data-testid="ordner-anlegen-absenden"
          >
            {laeuft ? 'Legt an…' : 'Anlegen'}
          </Button>
        </div>
      }
    >
      <form id="ordner-anlegen" className="flex flex-col gap-4" onSubmit={absenden}>
        <div className="flex flex-col gap-1.5">
          <Label>Was für ein Ordner</Label>
          <RadioGroup
            value={form}
            onValueChange={wert => setForm(wert as Form)}
            className="flex flex-col gap-2"
          >
            <Label htmlFor="form-bereich" className="flex items-center gap-2 font-normal">
              <RadioGroupItem value="bereich" id="form-bereich" />
              Bereich (Ebene 1): Rechte je Person, gilt für alles darunter
            </Label>
            <Label htmlFor="form-projekt" className="flex items-center gap-2 font-normal">
              <RadioGroupItem value="projekt" id="form-projekt" disabled={bereiche.length === 0} />
              Projekt (Ebene 2): liegt in einem Bereich, einzeln vergeben
            </Label>
            <Label htmlFor="form-am-geraet" className="flex items-center gap-2 font-normal">
              <RadioGroupItem value="am_geraet" id="form-am-geraet" />
              Am Gerät: nie abgeglichen, nur Flows und Apps lesen ihn
            </Label>
          </RadioGroup>
        </div>

        {form === 'projekt' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ordner-eltern">Bereich</Label>
            <Select value={eltern} onValueChange={setEltern}>
              <SelectTrigger id="ordner-eltern" data-testid="ordner-eltern">
                <SelectValue placeholder="Bereich wählen" />
              </SelectTrigger>
              <SelectContent>
                {bereiche.map(b => (
                  <SelectItem key={String(b.id)} value={b.kennung}>
                    {b.kennung} — {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ordner-kennung">Kennung</Label>
          <Input
            id="ordner-kennung"
            value={kennung}
            onChange={e => setKennung(e.target.value.trim().toLowerCase())}
            autoComplete="off"
            spellCheck={false}
            required
            data-testid="ordner-kennung"
          />
          <p className="text-xs text-muted-foreground">
            Wird zum Ordnernamen auf dem Gerät und auf jedem Rechner: nur Kleinbuchstaben, Ziffern
            und Bindestriche, 2 bis 40 Zeichen.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ordner-name">Name</Label>
          <Input
            id="ordner-name"
            value={name}
            onChange={e => setName(e.target.value)}
            autoComplete="off"
            maxLength={80}
            required
            data-testid="ordner-name"
          />
        </div>
      </form>
    </Dialogform>
  );
}
