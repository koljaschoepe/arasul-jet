/**
 * Das Icon oben rechts über jeder App und das Formular dahinter (J42, M7).
 *
 * DIE EINE AUSNAHME VON „KEINE KOPFLEISTE" (Beschluss 02.10.2026): ein kleines,
 * ruhiges Icon, das über der App schwebt, statt eine Leiste über sie zu legen.
 * Der Rahmen setzt es, nicht die App: keine App bekommt dafür eine Zeile
 * Code, und keine kann es abschalten. Am Handy steht es ebenfalls oben rechts,
 * weit weg von der Leiste unten.
 *
 * Ablauf: ein Klick nimmt ZUERST das Bildschirmfoto auf (das Formular liegt
 * ja im Dokument der Shell, nicht in der App, und käme nie mit aufs Bild),
 * dann öffnet sich das Formular. Freier Text ist Pflicht, das Foto ist
 * vorausgewählt und abwählbar, eine Stelle darauf lässt sich markieren. App,
 * Stand und Seite hängt der Rahmen an, Person und Zeit das Gerät. Nach dem
 * Absenden sieht der Mitarbeiter nur die Bestätigung, lesen kann die Meldung
 * nur, wer das Kennzeichen Entwickler trägt (schleife.md, Regel 2).
 */
import { useRef, useState, type FormEvent, type RefObject } from 'react';
import { MessageSquarePlus } from '@marken/symbole';
import {
  Button,
  Checkbox,
  Dialogform,
  Label,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@marken';
import type { AppStand } from '@/stores/workspaceStore';
import { bildMitMarkierung, fotoVomRahmen, type Markierung as Stelle } from './bildschirmfoto';
import { Markierung } from './Markierung';
import { useRueckmeldungSenden } from './useRueckmeldung';

interface Props {
  appId: string;
  stand: AppStand;
  /** Der Rahmen der App: aus ihm kommen Seite und Bildschirmfoto. */
  rahmen: RefObject<HTMLIFrameElement | null>;
}

/**
 * Die Adresse der Seite im Rahmen, ohne Herkunft. Nur, was unter der App
 * liegt: ein Rahmen, der noch lädt (`about:blank`), nennt sonst eine Seite,
 * die das Gerät zu Recht abweist.
 */
function seiteImRahmen(rahmen: HTMLIFrameElement | null, appId: string, rueckfall: string): string {
  try {
    const ort = rahmen?.contentWindow?.location;
    if (ort?.pathname?.startsWith(`/apps/${appId}/`)) {
      return `${ort.pathname}${ort.search}${ort.hash}`;
    }
  } catch {
    /* fremde Herkunft: dann gilt die Adresse, mit der der Rahmen geöffnet wurde */
  }
  return rueckfall;
}

export function RueckmeldungKnopf({ appId, stand, rahmen }: Props) {
  const [offen, setOffen] = useState(false);
  const [nimmtAuf, setNimmtAuf] = useState(false);
  const [text, setText] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [mitFoto, setMitFoto] = useState(true);
  const [stelle, setStelle] = useState<Stelle | null>(null);
  const [seite, setSeite] = useState('');
  const [gesendet, setGesendet] = useState(false);
  const stellenRahmen = useRef<HTMLDivElement>(null);
  const senden = useRueckmeldungSenden();

  const oeffnen = async () => {
    if (nimmtAuf) return;
    setNimmtAuf(true);
    const element = rahmen.current;
    const rueckfall = element?.getAttribute('src')?.split('?')[0] ?? `/apps/${appId}/`;
    setSeite(seiteImRahmen(element, appId, rueckfall));
    const bild = await fotoVomRahmen(element);
    setFoto(bild);
    setMitFoto(Boolean(bild));
    setStelle(null);
    setText('');
    setGesendet(false);
    setNimmtAuf(false);
    setOffen(true);
  };

  const schliessen = () => {
    setOffen(false);
    setFoto(null);
    setStelle(null);
    setText('');
    setGesendet(false);
  };

  const gueltigeStelle = stelle && stelle.breite > 0 && stelle.hoehe > 0 ? stelle : null;

  const absenden = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || senden.isPending) return;
    let bild: string | null = null;
    if (foto && mitFoto) {
      const farbe = stellenRahmen.current
        ? getComputedStyle(stellenRahmen.current).borderTopColor
        : '';
      bild = await bildMitMarkierung(foto, farbe ? gueltigeStelle : null, farbe);
    }
    senden.mutate(
      {
        app_id: appId,
        stand,
        seite,
        text: text.trim(),
        bild,
        markierung: bild ? gueltigeStelle : null,
      },
      { onSuccess: () => setGesendet(true) }
    );
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Die Trefferfläche ist 44 px groß und durchsichtig (am Handy hebt das
              Gerät jeden Knopf ohnehin auf 44 px, `index.css`); gezeichnet wird
              darin nur der kleine Kreis von 28 px, 8 px vom Rand. */}
          <Button
            type="button"
            variant="ghost"
            aria-label="Rückmeldung zu dieser Seite"
            onClick={oeffnen}
            disabled={nimmtAuf}
            className="group absolute top-0 right-0 z-10 size-11 rounded-full p-0 hover:bg-transparent dark:hover:bg-transparent"
            data-testid="rueckmeldung-knopf"
          >
            <span className="flex size-7 items-center justify-center rounded-full border border-border bg-background/85 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors group-hover:text-foreground">
              <MessageSquarePlus className="size-3.5" />
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Rückmeldung zu dieser Seite</TooltipContent>
      </Tooltip>

      <Dialogform
        offen={offen}
        beiSchliessen={schliessen}
        titel={gesendet ? 'Danke' : 'Rückmeldung zu dieser Seite'}
        groesse={gesendet ? 'klein' : 'gross'}
        schliesstBeiKlickDaneben={gesendet || !text.trim()}
        fuss={
          gesendet ? (
            <div className="flex w-full justify-end">
              <Button type="button" onClick={schliessen} data-testid="rueckmeldung-fertig">
                Schließen
              </Button>
            </div>
          ) : (
            <div className="flex w-full justify-end gap-3">
              <Button type="button" variant="outline" onClick={schliessen}>
                Abbrechen
              </Button>
              <Button
                type="submit"
                form="rueckmeldung"
                disabled={!text.trim() || senden.isPending}
                data-testid="rueckmeldung-absenden"
              >
                {senden.isPending ? 'Sendet …' : 'Absenden'}
              </Button>
            </div>
          )
        }
      >
        {gesendet ? (
          <p className="text-sm" data-testid="rueckmeldung-bestaetigung">
            Ihre Rückmeldung ist angekommen. Wer die App weiterbaut, sieht sie jetzt.
          </p>
        ) : (
          <form id="rueckmeldung" className="flex flex-col gap-4" onSubmit={absenden}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rueckmeldung-text">Was fehlt oder stimmt nicht?</Label>
              <Textarea
                id="rueckmeldung-text"
                value={text}
                onChange={e => setText(e.target.value)}
                rows={4}
                maxLength={5000}
                required
                placeholder="Zum Beispiel: Hier fehlt ein Filter nach Monat."
                data-testid="rueckmeldung-text"
              />
            </div>

            {foto ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="rueckmeldung-mit-foto"
                    checked={mitFoto}
                    onCheckedChange={an => setMitFoto(an === true)}
                    data-testid="rueckmeldung-mit-foto"
                  />
                  <Label htmlFor="rueckmeldung-mit-foto" className="font-normal">
                    Bildschirmfoto mitschicken
                  </Label>
                </div>
                {mitFoto && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Ziehen Sie auf dem Bild einen Rahmen um die Stelle, oder tippen Sie darauf.
                    </p>
                    <Markierung
                      bild={foto}
                      markierung={stelle}
                      beiMarkierung={setStelle}
                      rahmenRef={stellenRahmen}
                    />
                  </>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground" data-testid="rueckmeldung-ohne-foto">
                Das Bildschirmfoto ließ sich nicht aufnehmen. Ihre Rückmeldung geht ohne Bild.
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              Mit der Rückmeldung gehen App, Seite, Ihr Name und die Uhrzeit mit. Gespeichert wird
              auf diesem Gerät.
            </p>
          </form>
        )}
      </Dialogform>
    </>
  );
}
