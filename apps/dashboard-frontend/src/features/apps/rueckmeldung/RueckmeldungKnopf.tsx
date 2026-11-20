/**
 * Das Icon oben rechts über jeder App und das Formular dahinter (J42, M7).
 *
 * DIE EINE AUSNAHME VON „KEINE KOPFLEISTE" (Beschluss 02.10.2026): ein kleines,
 * ruhiges Icon, das über der App schwebt, statt eine Leiste über sie zu legen.
 * Seit der Karte glas-rahmen-und-leiste steht es in der Kapsel aus Glas oben
 * rechts (`../Kapsel.tsx`), neben dem Umschalter Live und Test. Der Rahmen
 * setzt es, nicht die App: keine App bekommt dafür eine Zeile Code, und keine
 * kann es abschalten.
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
          {/* Ein Icon-Knopf von 28 px in der Kapsel, ohne Rahmen; bei grobem
              Zeiger hebt die Bibliothek die Trefferfläche auf 44 px. */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Rückmeldung zu dieser Seite"
            onClick={oeffnen}
            disabled={nimmtAuf}
            className="rounded-full text-muted-foreground hover:text-foreground"
            data-testid="rueckmeldung-knopf"
          >
            <MessageSquarePlus className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Rückmeldung zu dieser Seite</TooltipContent>
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
