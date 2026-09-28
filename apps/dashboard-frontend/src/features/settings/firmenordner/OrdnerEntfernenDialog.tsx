/**
 * Einen Ordner wegwerfen, nach Rückfrage — samt allem, was darin liegt
 * (Auftrag firmenordner-rechte-im-frontend, 22.09.2026).
 *
 * Die Rückfrage ist dieselbe wie beim Entfernen einer App und beim Kit-Weg:
 * die Kennung abtippen. Ein Häkchen „ja, wirklich" klickt man aus Gewohnheit;
 * eine Kennung tippt man, nachdem man sie gelesen hat. Was das Backend dazu
 * sagt — ein Ordner mit Kindern oder mit Rechten geht nicht (409), die Wurzel
 * fällt zuletzt — steht hier als Satz, nicht in einer Meldung, die nach fünf
 * Sekunden weg ist.
 *
 * RECHTE FALLEN MIT (J34, 28.09.2026). Bis dahin verlangte ein Ordner mit
 * Rechten, dass der Administrator erst jede Zelle der Matrix auf „keine"
 * stellt. Jetzt nennt die Rückfrage jeden, der ein Recht hat, mit seiner
 * Stufe — und wer danach die Kennung tippt, hat gelesen, wem er den Ordner
 * wegnimmt.
 */
import { useState, type FormEvent } from 'react';
import { Alert, AlertDescription, Button, Dialogform, Input, Label } from '@marken';
import type { Ordner, RechtZeile } from './useFirmenordner';

interface Props {
  fuer: Ordner | null;
  /** Die Rechte auf genau diesem Ordner; sie fallen mit ihm. */
  rechte: RechtZeile[];
  laeuft: boolean;
  fehler: string | null;
  onSchliessen: () => void;
  onWegwerfen: (o: Ordner) => void;
}

export function OrdnerEntfernenDialog({
  fuer,
  rechte,
  laeuft,
  fehler,
  onSchliessen,
  onWegwerfen,
}: Props) {
  const [eingabe, setEingabe] = useState('');
  const passt = fuer !== null && eingabe.trim() === fuer.kennung;

  const schliessen = () => {
    setEingabe('');
    onSchliessen();
  };

  const absenden = (e: FormEvent) => {
    e.preventDefault();
    if (!passt || laeuft || !fuer) return;
    onWegwerfen(fuer);
  };

  return (
    <Dialogform
      offen={fuer !== null}
      beiSchliessen={schliessen}
      titel={fuer ? `„${fuer.kennung}“ wegwerfen` : 'Ordner wegwerfen'}
      groesse="klein"
      fuss={
        <div className="flex w-full justify-end gap-3">
          <Button type="button" variant="outline" onClick={schliessen}>
            Abbrechen
          </Button>
          <Button
            type="submit"
            form="ordner-wegwerfen"
            variant="destructive"
            disabled={!passt || laeuft}
            data-testid="ordner-wegwerfen-absenden"
          >
            {laeuft ? 'Wirft weg…' : 'Endgültig wegwerfen'}
          </Button>
        </div>
      }
    >
      <form id="ordner-wegwerfen" className="flex flex-col gap-4" onSubmit={absenden}>
        <p className="text-sm text-foreground">
          Es fällt der Ordner samt allem, was darin liegt: auf dem Gerät und danach auf jedem
          Rechner, der ihn hatte. Zurück kommt er nur aus der Sicherung.
          {fuer?.ebene === 1 &&
            ' Ein Bereich mit Projekten darin geht nicht; räumen Sie ihn von unten.'}
          {fuer?.art === 'wurzel' &&
            ' Der Hauptordner fällt erst, wenn kein anderer Ordner mehr besteht.'}
        </p>
        {rechte.length > 0 && (
          <div className="flex flex-col gap-1.5 text-sm" data-testid="ordner-wegwerfen-rechte">
            <p className="text-foreground">
              {rechte.length === 1
                ? 'Dabei verliert dieser Mitarbeiter sein Recht darauf:'
                : `Dabei verlieren diese ${rechte.length} Mitarbeiter ihr Recht darauf:`}
            </p>
            <ul className="flex flex-col gap-0.5 pl-ui-3">
              {rechte.map(r => (
                <li key={String(r.user_id)} className="break-words text-foreground">
                  {r.username}
                  <span className="text-muted-foreground"> — {r.recht}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {fehler && (
          <Alert variant="destructive" data-testid="ordner-wegwerfen-fehler">
            <AlertDescription>{fehler}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ordner-wegwerfen-kennung">
            Zur Bestätigung die Kennung eintippen:{' '}
            <span className="font-mono text-foreground">{fuer?.kennung}</span>
          </Label>
          <Input
            id="ordner-wegwerfen-kennung"
            value={eingabe}
            onChange={e => setEingabe(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            data-testid="ordner-wegwerfen-kennung"
          />
        </div>
      </form>
    </Dialogform>
  );
}
