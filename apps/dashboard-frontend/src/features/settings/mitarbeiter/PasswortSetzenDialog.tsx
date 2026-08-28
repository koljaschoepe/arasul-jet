/**
 * Einem Menschen ein neues Startpasswort setzen (Phase D3).
 *
 * Ohne Kenntnis des alten: der Administrator hat es nie gesehen und soll es
 * nicht sehen. Der Weg dahinter (`PUT /api/benutzer/:id/passwort`) beendet
 * danach ALLE Sitzungen des Betroffenen — genau der Fall, in dem jemand
 * ausgesperrt werden soll. Das steht hier als Satz im Dialog und nicht erst in
 * der Meldung danach: es ist der Unterschied zwischen „ich helfe jemandem, der
 * sein Passwort vergessen hat" und „ich werfe jemanden hinaus", und beide
 * drücken denselben Knopf.
 */
import { useState, type FormEvent } from 'react';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';

/** Dieselbe Untergrenze wie im Backend (`schemas/benutzer.js`). */
const MINDESTLAENGE = 8;

interface Props {
  /** Wessen Passwort, oder `null` für „Dialog zu". */
  fuer: { id: number | string; username: string } | null;
  laeuft: boolean;
  onSchliessen: () => void;
  onSetzen: (passwort: string) => void;
}

export function PasswortSetzenDialog({ fuer, laeuft, onSchliessen, onSetzen }: Props) {
  const [passwort, setPasswort] = useState('');

  const schliessen = () => {
    setPasswort('');
    onSchliessen();
  };

  const absenden = (e: FormEvent) => {
    e.preventDefault();
    if (passwort.length < MINDESTLAENGE || laeuft) return;
    onSetzen(passwort);
    setPasswort('');
  };

  return (
    <Modal
      isOpen={fuer !== null}
      onClose={schliessen}
      title={fuer ? `Startpasswort für ${fuer.username}` : 'Startpasswort'}
      size="small"
      footer={
        <div className="flex w-full justify-end gap-3">
          <Button type="button" variant="outline" onClick={schliessen}>
            Abbrechen
          </Button>
          <Button
            type="submit"
            form="passwort-setzen"
            disabled={passwort.length < MINDESTLAENGE || laeuft}
            data-testid="passwort-setzen-absenden"
          >
            {laeuft ? 'Setzt…' : 'Passwort setzen'}
          </Button>
        </div>
      }
    >
      <form id="passwort-setzen" className="flex flex-col gap-4" onSubmit={absenden}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="setz-passwort">Neues Startpasswort</Label>
          <Input
            id="setz-passwort"
            type="text"
            value={passwort}
            onChange={e => setPasswort(e.target.value)}
            autoComplete="off"
            minLength={MINDESTLAENGE}
            required
          />
          <p className="text-xs text-muted-foreground">
            Mindestens {MINDESTLAENGE} Zeichen. Es gilt als Startpasswort und wird beim nächsten
            Anmelden gewechselt.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Alle offenen Sitzungen dieses Menschen enden damit sofort.
        </p>
      </form>
    </Modal>
  );
}
