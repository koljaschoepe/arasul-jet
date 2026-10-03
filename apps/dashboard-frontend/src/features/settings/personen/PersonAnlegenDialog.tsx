/**
 * Eine Person anlegen (M5).
 *
 * Drei Felder und ein Schalter: Vorname, Nachname, E-Mail, „Verwaltung". Das
 * Startpasswort tippt niemand: das Gerät erzeugt es und zeigt es danach einmal
 * (`StartpasswortDialog`). Angemeldet wird mit der E-Mail.
 */
import { useState, type FormEvent } from 'react';
import { Button, Dialogform, Input, Label, Switch } from '@marken';
import type { NeuePerson } from './usePersonen';

interface Props {
  offen: boolean;
  laeuft: boolean;
  onSchliessen: () => void;
  onAnlegen: (neu: NeuePerson) => void;
}

export function PersonAnlegenDialog({ offen, laeuft, onSchliessen, onAnlegen }: Props) {
  const [vorname, setVorname] = useState('');
  const [nachname, setNachname] = useState('');
  const [email, setEmail] = useState('');
  const [verwaltung, setVerwaltung] = useState(false);

  const vollstaendig =
    vorname.trim().length > 0 && nachname.trim().length > 0 && /\S+@\S+\.\S+/.test(email.trim());

  const absenden = (e: FormEvent) => {
    e.preventDefault();
    if (!vollstaendig || laeuft) return;
    onAnlegen({
      vorname: vorname.trim(),
      nachname: nachname.trim(),
      email: email.trim(),
      ...(verwaltung ? { verwaltung: true } : {}),
    });
  };

  const schliessen = () => {
    setVorname('');
    setNachname('');
    setEmail('');
    setVerwaltung(false);
    onSchliessen();
  };

  return (
    <Dialogform
      offen={offen}
      beiSchliessen={schliessen}
      titel="Person anlegen"
      groesse="klein"
      fuss={
        <div className="flex w-full justify-end gap-3">
          <Button type="button" variant="outline" onClick={schliessen}>
            Abbrechen
          </Button>
          <Button
            type="submit"
            form="person-anlegen"
            disabled={!vollstaendig || laeuft}
            data-testid="person-anlegen-absenden"
          >
            {laeuft ? 'Legt an …' : 'Anlegen'}
          </Button>
        </div>
      }
    >
      <form id="person-anlegen" className="flex flex-col gap-4" onSubmit={absenden}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="neu-vorname">Vorname</Label>
          <Input
            id="neu-vorname"
            value={vorname}
            onChange={e => setVorname(e.target.value)}
            autoComplete="off"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="neu-nachname">Nachname</Label>
          <Input
            id="neu-nachname"
            value={nachname}
            onChange={e => setNachname(e.target.value)}
            autoComplete="off"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="neu-email">E-Mail</Label>
          <Input
            id="neu-email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="off"
            required
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="neu-verwaltung" className="font-normal">
            Verwaltung
          </Label>
          <Switch
            id="neu-verwaltung"
            checked={verwaltung}
            onCheckedChange={setVerwaltung}
            data-testid="person-anlegen-verwaltung"
          />
        </div>
      </form>
    </Dialogform>
  );
}
