/**
 * Unternehmen: Name und Logo des Hauses, als Text (M5, `frontend.md`, Gerät).
 *
 * IM RUHEZUSTAND KEIN FORMULAR. Ein Administrator liest hier, wem das Gerät
 * gehört; geändert wird das einmal im Jahr. Erst „Bearbeiten" macht aus der
 * Zeile ein Formular mit Name und Logo, „Abbrechen" verwirft alles.
 *
 * Der Name steht über dem Anmeldeformular (ohne ihn der Produktname), das
 * Logo oben in der Aktivitätsleiste, für jeden. Beides kommt aus derselben
 * Antwort wie dort (`useGeraetMarke`), damit hier nie etwas anderes steht als
 * an den Stellen, an denen es wirkt.
 */
import { useRef, useState } from 'react';
import { Building2, ImageUp } from 'lucide-react';
import { Button, Feldgruppe, Input, Label } from '@marken';
import { PLATFORM_NAME } from '@/config/branding';
import { useToast } from '@/contexts/ToastContext';
import { logoAdresse, useGeraetMarke } from '@/hooks/useGeraetMarke';
import {
  FIRMENNAME_MAX,
  LOGO_ARTEN,
  logoLesen,
  useUnternehmenSpeichern,
  type UnternehmenAenderung,
} from './useUnternehmen';

export function Unternehmen() {
  const { data: marke, isPending } = useGeraetMarke();
  const speichern = useUnternehmenSpeichern();
  const toast = useToast();
  const [bearbeiten, setBearbeiten] = useState(false);
  const [name, setName] = useState('');
  // undefined: das Logo bleibt; null: es fällt weg; Zeichenkette: das neue.
  const [logo, setLogo] = useState<string | null | undefined>(undefined);
  const [fehler, setFehler] = useState<string | null>(null);
  const datei = useRef<HTMLInputElement>(null);

  const firmenname = marke?.firmenname ?? null;
  const logoJetzt = marke?.logo ? logoAdresse(marke.logo) : null;
  const logoVorschau = logo === undefined ? logoJetzt : logo;

  const oeffnen = () => {
    setName(firmenname ?? '');
    setLogo(undefined);
    setFehler(null);
    setBearbeiten(true);
  };

  const sichern = () => {
    const aenderung: UnternehmenAenderung = {};
    if (name.trim() !== (firmenname ?? '')) aenderung.firmenname = name.trim();
    if (logo !== undefined) aenderung.logo = logo;
    if (Object.keys(aenderung).length === 0) {
      setBearbeiten(false);
      return;
    }
    speichern.mutate(aenderung, {
      onSuccess: () => {
        setBearbeiten(false);
        toast.success('Gespeichert.');
      },
      // useApi hat die Meldung als Hinweis gezeigt; das Formular bleibt offen.
    });
  };

  const waehle = async (gewaehlt: File | undefined) => {
    if (!gewaehlt) return;
    setFehler(null);
    try {
      setLogo(await logoLesen(gewaehlt));
    } catch (err) {
      setFehler((err as Error).message);
    }
  };

  return (
    <Feldgruppe
      titel="Unternehmen"
      symbol={<Building2 />}
      aktion={
        bearbeiten ? undefined : (
          <Button
            variant="outline"
            size="sm"
            onClick={oeffnen}
            disabled={isPending}
            data-testid="unternehmen-bearbeiten"
          >
            Bearbeiten
          </Button>
        )
      }
    >
      <div data-abschnitt="unternehmen" data-testid="unternehmen">
        {isPending ? (
          <p className="text-sm text-muted-foreground">Wird geladen …</p>
        ) : !bearbeiten ? (
          <div className="flex items-center gap-3">
            {logoJetzt && (
              <img
                src={logoJetzt}
                alt=""
                className="size-10 shrink-0 object-contain"
                data-testid="unternehmen-logo"
              />
            )}
            {firmenname ? (
              <p className="text-sm text-foreground" data-testid="unternehmen-name">
                {firmenname}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="unternehmen-name">
                Kein Name hinterlegt. Die Anmeldeseite zeigt „{PLATFORM_NAME}“.
              </p>
            )}
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            data-testid="unternehmen-formular"
            onSubmit={e => {
              e.preventDefault();
              sichern();
            }}
          >
            <div>
              <Label htmlFor="firmenname" className="mb-1.5 block text-sm font-medium">
                Name
              </Label>
              <Input
                id="firmenname"
                value={name}
                maxLength={FIRMENNAME_MAX}
                autoComplete="organization"
                onChange={e => setName(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Steht über dem Anmeldeformular. Leer zeigt dort „{PLATFORM_NAME}“.
              </p>
            </div>

            <div>
              <span className="mb-1.5 block text-sm font-medium">Logo</span>
              <div className="flex flex-wrap items-center gap-3">
                {logoVorschau && (
                  <img
                    src={logoVorschau}
                    alt=""
                    className="size-10 shrink-0 object-contain"
                    data-testid="unternehmen-logo-vorschau"
                  />
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => datei.current?.click()}
                >
                  <ImageUp className="size-4" aria-hidden="true" />
                  {logoVorschau ? 'Anderes Logo wählen' : 'Logo wählen'}
                </Button>
                {logoVorschau && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setLogo(null)}
                    data-testid="unternehmen-logo-entfernen"
                  >
                    Entfernen
                  </Button>
                )}
                <input
                  ref={datei}
                  type="file"
                  accept={LOGO_ARTEN.join(',')}
                  className="hidden"
                  aria-label="Logo"
                  data-testid="unternehmen-logo-datei"
                  onChange={e => {
                    void waehle(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Steht oben in der Leiste links, für alle. PNG, JPEG oder WebP, höchstens 256 KB.
              </p>
              {fehler && (
                <p className="mt-1 text-sm text-destructive" role="alert">
                  {fehler}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                type="submit"
                loading={speichern.isPending}
                data-testid="unternehmen-speichern"
              >
                Speichern
              </Button>
              <Button type="button" variant="ghost" onClick={() => setBearbeiten(false)}>
                Abbrechen
              </Button>
            </div>
          </form>
        )}
      </div>
    </Feldgruppe>
  );
}
