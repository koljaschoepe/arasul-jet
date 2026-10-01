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
 * DAS EIGENE RECHT FÄLLT MIT (J33, 28.09.2026). Wer einen Bereich anlegt,
 * bekommt darauf „schreiben"; das darf das Wegwerfen nicht sperren. Das Recht
 * eines anderen Kontos schon: es steht als Hindernis da, und das Backend
 * antwortet auch dann mit 409, wenn jemand die Schaltfläche trotzdem erreicht.
 */
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
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
  const { user } = useAuth();
  const [eingabe, setEingabe] = useState('');
  const fremde = rechte.filter(r => String(r.user_id) !== String(user?.id));
  const eigene = rechte.length - fremde.length;
  const passt = fuer !== null && fremde.length === 0 && eingabe.trim() === fuer.kennung;

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
        {fremde.length > 0 && (
          <div className="flex flex-col gap-1.5 text-sm" data-testid="ordner-wegwerfen-rechte">
            <p className="text-foreground">
              {fremde.length === 1
                ? 'Dieses Konto hat noch ein Recht darauf. Nehmen Sie es zuerst zurück:'
                : `Diese ${fremde.length} Konten haben noch ein Recht darauf. Nehmen Sie es zuerst zurück:`}
            </p>
            <ul className="flex flex-col gap-0.5 pl-ui-3">
              {fremde.map(r => (
                <li key={String(r.user_id)} className="break-words text-foreground">
                  {r.username}
                  <span className="text-muted-foreground">: {r.recht}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {eigene > 0 && fremde.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="ordner-wegwerfen-eigenes">
            Ihr eigenes Recht darauf fällt dabei mit weg.
          </p>
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
