/**
 * Person löschen (DSGVO Art. 17), im abgesetzten Teil des Bereichs Daten (M5).
 *
 * Bestätigt wird durch Eintippen des Namens der Person: wer die falsche Zeile
 * erwischt hat, tippt einen Namen, den er gerade nicht meint. Der Knopf bleibt
 * gesperrt, bis er genau stimmt. Sich selbst löscht niemand hier — das Gerät
 * lehnt es ab, und die Liste führt das eigene Konto gar nicht erst auf.
 * Sperren (Bereich Personen) ist der mildere Weg und kommt vor Löschen.
 */
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  Button,
  Dialogform,
  Feldgruppe,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@marken';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { fehlertext } from '@/utils/fehlertext';
import { anzeigeName, useBenutzer, useBenutzerLoeschen } from '../personen/usePersonen';
import { personBezeichnung } from './Auskunft';

export function PersonLoeschen() {
  const { user } = useAuth();
  const toast = useToast();
  const { data: benutzer = [] } = useBenutzer();
  const loeschen = useBenutzerLoeschen();
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [offen, setOffen] = useState(false);
  const [eingabe, setEingabe] = useState('');

  const andere = benutzer.filter(b => String(b.id) !== String(user?.id ?? ''));
  const person = andere.find(b => String(b.id) === gewaehlt) ?? null;
  const name = person ? anzeigeName(person) : '';
  const stimmt = person !== null && eingabe.trim() === name;

  const schliessen = () => {
    setOffen(false);
    setEingabe('');
  };

  const ausfuehren = () => {
    if (!person || !stimmt) return;
    loeschen.mutate(person.id, {
      onSuccess: () => {
        toast.success(`${name} gelöscht`);
        setGewaehlt(null);
        schliessen();
      },
      onError: err => toast.error(fehlertext(err, (err as { status?: number }).status)),
    });
  };

  return (
    <Feldgruppe
      titel="Person löschen"
      symbol={<Trash2 className="text-destructive" />}
      beschreibung="Das Konto, die Läufe, die Schlüssel und die Freigaben der Person werden gelöscht, und das ist nicht umkehrbar. Protokolle bleiben ohne Namen stehen. Wer nur aussperren will, sperrt unter Personen."
    >
      <div className="flex flex-col gap-3" data-testid="person-loeschen">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loeschen-person">Person</Label>
          <Select value={gewaehlt ?? undefined} onValueChange={setGewaehlt}>
            <SelectTrigger id="loeschen-person" data-testid="loeschen-person" className="max-w-sm">
              <SelectValue placeholder="Person wählen" />
            </SelectTrigger>
            <SelectContent>
              {andere.map(b => (
                <SelectItem key={String(b.id)} value={String(b.id)}>
                  {personBezeichnung(b)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Button
            variant="destructive"
            disabled={!person}
            onClick={() => setOffen(true)}
            data-testid="loeschen-oeffnen"
          >
            Person löschen …
          </Button>
        </div>
      </div>

      <Dialogform
        offen={offen}
        beiSchliessen={schliessen}
        titel={`${name} endgültig löschen?`}
        groesse="klein"
        fuss={
          <div className="flex w-full justify-end gap-3">
            <Button type="button" variant="outline" onClick={schliessen}>
              Abbrechen
            </Button>
            <Button
              type="submit"
              form="person-loeschen-formular"
              variant="destructive"
              disabled={!stimmt || loeschen.isPending}
              data-testid="loeschen-bestaetigen"
            >
              {loeschen.isPending ? 'Wird gelöscht …' : 'Endgültig löschen'}
            </Button>
          </div>
        }
      >
        <form
          id="person-loeschen-formular"
          className="flex flex-col gap-3"
          onSubmit={e => {
            e.preventDefault();
            ausfuehren();
          }}
        >
          <Label htmlFor="loeschen-eingabe">
            Zum Bestätigen den Namen eintippen: <strong>{name}</strong>
          </Label>
          <Input
            id="loeschen-eingabe"
            value={eingabe}
            autoComplete="off"
            spellCheck={false}
            placeholder={name}
            onChange={e => setEingabe(e.target.value)}
            data-testid="loeschen-eingabe"
          />
        </form>
      </Dialogform>
    </Feldgruppe>
  );
}
