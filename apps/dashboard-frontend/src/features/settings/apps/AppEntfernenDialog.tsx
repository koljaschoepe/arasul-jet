/**
 * Eine App vom Gerät entfernen, nach Rückfrage (Auftrag app-leiche, 28.08.2026).
 *
 * Die Rückfrage ist dieselbe wie die des Kits (`?bestaetigung=<id>` an
 * `DELETE /api/v1/external/apps/:id`): die Kennung abtippen. Ein Häkchen
 * „ja, wirklich" klickt man aus Gewohnheit; eine Kennung tippt man, nachdem
 * man sie gelesen hat. Was fällt, steht im Dialog und nicht erst in der
 * Meldung danach — beide Container mitsamt Volumes, beide Stände, alle
 * Freigaben, die Schlüssel und die Dateien am Gerät.
 */
import { useState, type FormEvent } from 'react';
import { Button, Dialogform, Input, Label } from '@marken';

interface Props {
  /** Welche App, oder `null` für „Dialog zu". */
  fuer: { id: string; name: string } | null;
  laeuft: boolean;
  onSchliessen: () => void;
  onEntfernen: () => void;
}

export function AppEntfernenDialog({ fuer, laeuft, onSchliessen, onEntfernen }: Props) {
  const [eingabe, setEingabe] = useState('');
  const passt = fuer !== null && eingabe.trim() === fuer.id;

  const schliessen = () => {
    setEingabe('');
    onSchliessen();
  };

  const absenden = (e: FormEvent) => {
    e.preventDefault();
    if (!passt || laeuft) return;
    onEntfernen();
    setEingabe('');
  };

  return (
    <Dialogform
      offen={fuer !== null}
      beiSchliessen={schliessen}
      titel={fuer ? `${fuer.name} entfernen` : 'App entfernen'}
      groesse="klein"
      fuss={
        <div className="flex w-full justify-end gap-3">
          <Button type="button" variant="outline" onClick={schliessen}>
            Abbrechen
          </Button>
          <Button
            type="submit"
            form="app-entfernen"
            variant="destructive"
            disabled={!passt || laeuft}
            data-testid="app-entfernen-absenden"
          >
            {laeuft ? 'Entfernt…' : 'Endgültig entfernen'}
          </Button>
        </div>
      }
    >
      <form id="app-entfernen" className="flex flex-col gap-4" onSubmit={absenden}>
        <p className="text-sm text-foreground">
          Es fallen beide Container mitsamt ihren Volumes, beide Stände, alle Freigaben, die
          Schlüssel der App und ihre Dateien auf diesem Gerät. Zurück kommt sie nur, wenn der
          Partner sie neu einspielt.
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="app-entfernen-kennung">
            Zur Bestätigung die Kennung eintippen:{' '}
            <span className="font-mono text-foreground">{fuer?.id}</span>
          </Label>
          <Input
            id="app-entfernen-kennung"
            type="text"
            value={eingabe}
            onChange={e => setEingabe(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            data-testid="app-entfernen-kennung"
          />
        </div>
      </form>
    </Dialogform>
  );
}
