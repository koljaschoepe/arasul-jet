/**
 * Live schalten, nach einem Blick auf das, was neu ist (M5, Auftrag
 * live-schalten-mit-sicherung).
 *
 * Vor dem Schalten steht hier, was der Entwickler beim Ausrollen über diese
 * Fassung geschrieben hat (Kontrakt 8) — der Admin entscheidet über eine
 * Fassung, nicht über eine Nummer. Darunter ein Satz, was gleich passiert:
 * vorher wird gesichert, und kommt die neue Fassung nicht hoch, schaltet das
 * Gerät selbst zurück. Das dauert, und der Knopf sagt es, solange es läuft.
 */
import { Button, Dialogform } from '@marken';

interface Props {
  offen: boolean;
  name: string;
  /** Die Fassung aus dem Teststand. */
  neu: string;
  /** Die Fassung, die gerade live ist, oder null. */
  alt: string | null;
  aenderungstext: string | null;
  /** Hat die App einen Server-Teil (und damit Daten)? */
  mitDaten: boolean;
  laeuft: boolean;
  onSchliessen: () => void;
  onSchalten: () => void;
}

export function LiveSchaltenDialog({
  offen,
  name,
  neu,
  alt,
  aenderungstext,
  mitDaten,
  laeuft,
  onSchliessen,
  onSchalten,
}: Props) {
  return (
    <Dialogform
      offen={offen}
      beiSchliessen={() => {
        if (!laeuft) onSchliessen();
      }}
      titel={`${name} live schalten`}
      groesse="klein"
      fuss={
        <div className="flex w-full justify-end gap-3">
          <Button type="button" variant="outline" onClick={onSchliessen} disabled={laeuft}>
            Abbrechen
          </Button>
          <Button
            type="button"
            onClick={onSchalten}
            disabled={laeuft}
            data-testid="live-schalten-bestaetigen"
          >
            {laeuft ? (mitDaten ? 'Sichert und schaltet…' : 'Schaltet…') : `${neu} live schalten`}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-sm" data-testid="live-schalten-dialog">
        <p className="text-foreground">
          {alt
            ? `Fassung ${neu} ersetzt ${alt} für alle, denen die App freigegeben ist.`
            : `Fassung ${neu} wird für alle sichtbar, denen die App freigegeben ist.`}
        </p>
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">Was neu ist</span>
          {aenderungstext ? (
            <p
              className="whitespace-pre-line rounded-md border border-border bg-muted p-ui-2 text-foreground"
              data-testid="live-schalten-aenderungstext"
            >
              {aenderungstext}
            </p>
          ) : (
            <p className="text-muted-foreground" data-testid="live-schalten-ohne-text">
              Der Entwickler hat zu dieser Fassung nichts geschrieben.
            </p>
          )}
        </div>
        {mitDaten && (
          <p className="text-muted-foreground">
            Vorher sichert Arasul die Daten der App. Startet die neue Fassung nicht, schaltet es
            selbst auf {alt ?? 'den Stand davor'} und diese Daten zurück. Das dauert etwa zwei
            Minuten.
          </p>
        )}
      </div>
    </Dialogform>
  );
}
