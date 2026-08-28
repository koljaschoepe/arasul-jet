/**
 * Einen Menschen anlegen (Phase D3).
 *
 * Vier Felder, mehr braucht `POST /api/benutzer` nicht: Name, E-Mail, ein
 * Startpasswort und die Rolle. Die E-Mail ist freiwillig und trotzdem der
 * Regelfall — angemeldet wird mit Benutzername ODER E-Mail (C1), und einen
 * Menschen ohne E-Mail anzulegen heißt, ihm den Weg zu nehmen, den er kennt.
 *
 * Das Passwort heißt hier ausdrücklich STARTPASSWORT. Es steht einmal auf einem
 * Zettel, wird beim ersten Anmelden gewechselt (`passwort_vom_admin`,
 * Migration 178) und ist danach keins mehr. Deshalb prüft der Server hier auch
 * nur die Länge und nicht die Komplexitätsregeln des Selbstwechsels; wer das
 * nicht weiß, hält die schwächere Regel für ein Versehen.
 */
import { useState, type FormEvent } from 'react';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/shadcn/radio-group';
import type { NeuerBenutzer } from './useMitarbeiter';

/** Dieselbe Untergrenze wie im Backend (`schemas/benutzer.js`). */
const MINDESTLAENGE = 8;

interface Props {
  offen: boolean;
  laeuft: boolean;
  onSchliessen: () => void;
  onAnlegen: (neu: NeuerBenutzer) => void;
}

export function MitarbeiterAnlegenDialog({ offen, laeuft, onSchliessen, onAnlegen }: Props) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [passwort, setPasswort] = useState('');
  const [rolle, setRolle] = useState<'admin' | 'mitarbeiter'>('mitarbeiter');

  const vollstaendig = username.trim().length > 0 && passwort.length >= MINDESTLAENGE;

  const absenden = (e: FormEvent) => {
    e.preventDefault();
    if (!vollstaendig || laeuft) return;
    const sauber = email.trim();
    onAnlegen({
      username: username.trim(),
      password: passwort,
      rolle,
      ...(sauber ? { email: sauber } : {}),
    });
  };

  // Beim Schließen leeren: ein Startpasswort, das im Formular stehen bleibt,
  // steht beim nächsten Öffnen im Browser eines Menschen, der gerade jemand
  // anderen anlegt.
  const schliessen = () => {
    setUsername('');
    setEmail('');
    setPasswort('');
    setRolle('mitarbeiter');
    onSchliessen();
  };

  return (
    <Modal
      isOpen={offen}
      onClose={schliessen}
      title="Menschen anlegen"
      size="small"
      footer={
        <div className="flex w-full justify-end gap-3">
          <Button type="button" variant="outline" onClick={schliessen}>
            Abbrechen
          </Button>
          <Button
            type="submit"
            form="mitarbeiter-anlegen"
            disabled={!vollstaendig || laeuft}
            data-testid="mitarbeiter-anlegen-absenden"
          >
            {laeuft ? 'Legt an…' : 'Anlegen'}
          </Button>
        </div>
      }
    >
      <form id="mitarbeiter-anlegen" className="flex flex-col gap-4" onSubmit={absenden}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="neu-username">Benutzername</Label>
          <Input
            id="neu-username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="off"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="neu-email">E-Mail (freiwillig)</Label>
          <Input
            id="neu-email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Angemeldet wird mit Benutzername oder E-Mail.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="neu-passwort">Startpasswort</Label>
          <Input
            id="neu-passwort"
            type="text"
            value={passwort}
            onChange={e => setPasswort(e.target.value)}
            autoComplete="off"
            minLength={MINDESTLAENGE}
            required
          />
          {/* Sichtbar und nicht als Punkte: der Administrator muss dieses
              Passwort weitergeben, und ein Feld, das er selbst nicht lesen
              kann, wird abgetippt und vertippt. */}
          <p className="text-xs text-muted-foreground">
            Mindestens {MINDESTLAENGE} Zeichen. Wird beim ersten Anmelden gewechselt.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Rolle</Label>
          <RadioGroup
            value={rolle}
            onValueChange={wert => setRolle(wert as 'admin' | 'mitarbeiter')}
            className="flex flex-col gap-2"
          >
            <Label htmlFor="rolle-mitarbeiter" className="flex items-center gap-2 font-normal">
              <RadioGroupItem value="mitarbeiter" id="rolle-mitarbeiter" />
              Mitarbeiter (sieht die freigegebenen Apps)
            </Label>
            <Label htmlFor="rolle-admin" className="flex items-center gap-2 font-normal">
              <RadioGroupItem value="admin" id="rolle-admin" />
              Administrator (verwaltet das Gerät)
            </Label>
          </RadioGroup>
        </div>
      </form>
    </Modal>
  );
}
