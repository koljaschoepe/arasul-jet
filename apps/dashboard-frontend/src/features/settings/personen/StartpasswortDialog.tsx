/**
 * Das Startpasswort, einmal (M5, Auftrag verwaltung-personen).
 *
 * Das Gerät erzeugt es beim Anlegen und beim „Neues Startpasswort"; danach
 * steht es nirgends mehr, auch nicht in der Liste. Deshalb schließt der Dialog
 * nur über „Fertig" und nicht bei einem Klick daneben: ein verlorenes
 * Startpasswort ist nicht wiederzubeschaffen, nur neu zu erzeugen.
 *
 * ZWEI WEGE, ES WEITERZUGEBEN: kopieren oder als Zettel drucken. Der Zettel ist
 * ein eigenes Element direkt unter `body` (`.zettel-druck`, `index.css`), das
 * nur im Druck erscheint — der Dialog liegt in einem Portal, und ein Druck der
 * Seite risse sonst alles mit, was dahinter steht.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Printer } from 'lucide-react';
import { Button, Dialogform } from '@marken';

export interface StartpasswortZettel {
  name: string;
  email: string;
  startpasswort: string;
}

interface Props {
  zettel: StartpasswortZettel | null;
  onFertig: () => void;
}

export function StartpasswortDialog({ zettel, onFertig }: Props) {
  const [kopiert, setKopiert] = useState(false);

  const kopieren = async () => {
    if (!zettel) return;
    try {
      await navigator.clipboard.writeText(zettel.startpasswort);
      setKopiert(true);
      window.setTimeout(() => setKopiert(false), 2000);
    } catch {
      // Ohne Zwischenablage (kein HTTPS, Berechtigung verweigert): das
      // Passwort steht im Dialog und lässt sich markieren.
    }
  };

  const drucken = () => {
    document.body.classList.add('zettel-drucken');
    window.print();
    document.body.classList.remove('zettel-drucken');
  };

  return (
    <>
      <Dialogform
        offen={zettel !== null}
        // Nur „Fertig" schließt (siehe Kopf).
        beiSchliessen={() => undefined}
        titel={zettel ? `Startpasswort für ${zettel.name}` : 'Startpasswort'}
        groesse="klein"
        fuss={
          <div className="flex w-full justify-end gap-3">
            <Button type="button" onClick={onFertig} data-testid="startpasswort-fertig">
              Fertig
            </Button>
          </div>
        }
      >
        {zettel && (
          <div className="flex flex-col gap-4" data-testid="startpasswort-dialog">
            <p className="text-sm text-muted-foreground">
              Anmeldung mit <span className="text-foreground">{zettel.email}</span>. Dieses
              Startpasswort wird nur jetzt angezeigt.
            </p>
            <p
              className="rounded-md border border-border bg-muted px-3 py-3 text-center font-mono text-lg tracking-wide select-all"
              data-testid="startpasswort-wert"
            >
              {zettel.startpasswort}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void kopieren()}
                data-testid="startpasswort-kopieren"
              >
                {kopiert ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : (
                  <Copy className="size-4" aria-hidden="true" />
                )}
                {kopiert ? 'Kopiert' : 'Kopieren'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={drucken}
                data-testid="startpasswort-drucken"
              >
                <Printer className="size-4" aria-hidden="true" />
                Zettel drucken
              </Button>
            </div>
          </div>
        )}
      </Dialogform>
      {zettel &&
        createPortal(
          <div className="zettel-druck" data-testid="startpasswort-zettel">
            <p className="zettel-titel">Ihr Zugang zu Arasul</p>
            <p>{zettel.name}</p>
            <dl>
              <dt>Anmelden mit</dt>
              <dd>{zettel.email}</dd>
              <dt>Startpasswort</dt>
              <dd className="zettel-passwort">{zettel.startpasswort}</dd>
            </dl>
            <p>Bei der ersten Anmeldung wählen Sie ein eigenes Passwort.</p>
          </div>,
          document.body
        )}
    </>
  );
}
