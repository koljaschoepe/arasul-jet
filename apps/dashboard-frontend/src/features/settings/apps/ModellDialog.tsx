/**
 * Womit dieser Flow rechnen soll (Phase D4).
 *
 * Drei Antworten auf eine Frage, und deshalb ein Dialog mit drei Feldern statt
 * dreier Knöpfe an drei Stellen:
 *
 *   das Paket    was der Partner im Frontmatter hinterlegt hat
 *   hier         eines vom Gerät, aus der Kurzliste (C8)
 *   draußen      eines bei einem Anbieter, mit Adresse und Schlüssel
 *
 * KEIN EIGENER EINSTELLUNGSBEREICH FÜR EXTERNE MODELLE (Entscheidung vom
 * 26.08.2026). Ein solcher Bereich wäre eine Liste von Zugängen, von denen
 * niemand mehr sagen könnte, welcher Flow sie benutzt. Die Entscheidung fällt
 * dort, wo sie wirkt: an diesem Flow.
 *
 * DER SCHLÜSSEL WIRD NIE ANGEZEIGT. Was das Gerät hergibt, sind die letzten
 * vier Zeichen — genug, um zwei Schlüssel auseinanderzuhalten, und zu wenig,
 * um einen zu benutzen. Wer nur den Modellnamen ändert, lässt das Feld leer;
 * dann bleibt der hinterlegte stehen (Backend: `COALESCE`).
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Button, cn, Dialogform, Input, Label, RadioGroup, RadioGroupItem } from '@marken';
import { modellAnzeigeName } from '@/utils/modelDisplay';
import type { CatalogModel } from '@/hooks/useStoreCatalog';
import type { ExternesModell, ModellWunsch } from './useAppVerwaltung';

type Quelle = 'paket' | 'lokal' | 'extern';

interface Props {
  /** Der Flow, um den es geht, oder `null` für „Dialog zu". */
  fuer: {
    name: string;
    modell: string | null;
    modell_ueberschrieben: boolean;
    /**
     * Was das Paket wollte. Steht NUR in der Flow-Ansicht zur Verfügung
     * (`GET /api/apps/:id/flows/:name`); die Liste kennt es nicht, denn dort
     * steht je Flow nur das Modell, das gilt. Der Dialog nennt es dann eben
     * nicht — er soll deswegen nicht von der Liste aus unerreichbar sein.
     */
    paket_modell?: string | null;
    extern: ExternesModell | null;
  } | null;
  /** Die Kurzliste des Geräts — installiert ist installiert. */
  modelle: CatalogModel[];
  laeuft: boolean;
  onSchliessen: () => void;
  onSetzen: (wunsch: ModellWunsch) => void;
}

export function ModellDialog({ fuer, modelle, laeuft, onSchliessen, onSetzen }: Props) {
  const [quelle, setQuelle] = useState<Quelle>('paket');
  const [lokal, setLokal] = useState('');
  const [anbieter, setAnbieter] = useState('');
  const [externesModell, setExternesModell] = useState('');
  const [basisUrl, setBasisUrl] = useState('');
  const [schluessel, setSchluessel] = useState('');

  // Beim Öffnen den Ist-Zustand einsetzen: der Dialog soll zeigen, was GILT,
  // und nicht ein leeres Formular. Wer ihn schließt und wieder öffnet, sieht
  // wieder den Stand des Geräts — deshalb hängt das am Flow und nicht am
  // ersten Rendern.
  useEffect(() => {
    if (!fuer) return;
    setQuelle(fuer.extern ? 'extern' : fuer.modell_ueberschrieben ? 'lokal' : 'paket');
    setLokal(fuer.modell_ueberschrieben && !fuer.extern ? (fuer.modell ?? '') : '');
    setAnbieter(fuer.extern?.anbieter ?? '');
    setExternesModell(fuer.extern?.modell ?? '');
    setBasisUrl(fuer.extern?.basis_url ?? '');
    setSchluessel('');
  }, [fuer]);

  const installiert = modelle.filter(m => m.install_status === 'available');
  const bereit =
    quelle === 'paket' ||
    (quelle === 'lokal' && lokal !== '') ||
    (quelle === 'extern' &&
      anbieter.trim() !== '' &&
      externesModell.trim() !== '' &&
      /^https?:\/\//i.test(basisUrl.trim()));

  const absenden = (e: FormEvent) => {
    e.preventDefault();
    if (!bereit || laeuft) return;
    if (quelle === 'paket') {
      onSetzen({ modell: null });
    } else if (quelle === 'lokal') {
      onSetzen({ modell: lokal });
    } else {
      onSetzen({
        extern: {
          anbieter: anbieter.trim(),
          modell: externesModell.trim(),
          basis_url: basisUrl.trim(),
          ...(schluessel.trim() ? { schluessel: schluessel.trim() } : {}),
        },
      });
    }
  };

  return (
    <Dialogform
      offen={fuer !== null}
      beiSchliessen={onSchliessen}
      titel={fuer ? `Modell für „${fuer.name}"` : 'Modell'}
      groesse="mittel"
      fuss={
        <div className="flex w-full justify-end gap-3">
          <Button type="button" variant="outline" onClick={onSchliessen}>
            Abbrechen
          </Button>
          <Button
            type="submit"
            form="flow-modell"
            disabled={!bereit || laeuft}
            data-testid="modell-absenden"
          >
            Übernehmen
          </Button>
        </div>
      }
    >
      <form id="flow-modell" onSubmit={absenden} className="flex flex-col gap-4">
        <RadioGroup
          value={quelle}
          onValueChange={wert => setQuelle(wert as Quelle)}
          className="flex flex-col gap-2"
          aria-label="Woher das Modell kommt"
        >
          {(
            [
              [
                'paket',
                'Aus dem Paket',
                fuer?.paket_modell
                  ? `Der Partner hat „${fuer.paket_modell}" hinterlegt.`
                  : 'Der Flow nennt keines; dann gilt das Standardmodell des Geräts.',
              ],
              ['lokal', 'Auf diesem Gerät', 'Eines der Modelle, die hier liegen.'],
              ['extern', 'Bei einem Anbieter', 'Der Prompt dieses Flows verlässt dann das Haus.'],
            ] as const
          ).map(([wert, titel, satz]) => (
            <Label
              key={wert}
              htmlFor={`quelle-${wert}`}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-md border p-ui-3 font-normal transition-colors',
                quelle === wert
                  ? 'border-foreground font-medium'
                  : 'border-border hover:bg-accent/50'
              )}
            >
              <RadioGroupItem
                value={wert}
                id={`quelle-${wert}`}
                data-testid={`modell-quelle-${wert}`}
                className="mt-1"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{titel}</span>
                <span className="block text-xs text-muted-foreground">{satz}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>

        {quelle === 'lokal' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="modell-lokal">Modell</Label>
            <select
              id="modell-lokal"
              value={lokal}
              onChange={e => setLokal(e.target.value)}
              data-testid="modell-lokal"
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
            >
              <option value="">bitte wählen</option>
              {installiert.map(m => (
                <option key={m.id} value={m.id}>
                  {modellAnzeigeName(m)} ({m.id})
                </option>
              ))}
            </select>
            {installiert.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Auf diesem Gerät liegt noch kein Modell. Die Ansicht „Modelle“ lädt eines.
              </p>
            )}
          </div>
        )}

        {quelle === 'extern' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="extern-anbieter">Anbieter</Label>
              <Input
                id="extern-anbieter"
                value={anbieter}
                onChange={e => setAnbieter(e.target.value)}
                placeholder="OpenAI"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="extern-modell">Modell beim Anbieter</Label>
              <Input
                id="extern-modell"
                value={externesModell}
                onChange={e => setExternesModell(e.target.value)}
                placeholder="gpt-4o"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="extern-basis">Adresse (OpenAI-kompatibel)</Label>
              <Input
                id="extern-basis"
                value={basisUrl}
                onChange={e => setBasisUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
              <p className="text-xs text-muted-foreground">
                Ohne <code>/chat/completions</code>: das hängt das Gerät an.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="extern-schluessel">Schlüssel</Label>
              <Input
                id="extern-schluessel"
                type="password"
                value={schluessel}
                onChange={e => setSchluessel(e.target.value)}
                autoComplete="off"
                placeholder={
                  fuer?.extern?.endet_auf
                    ? `hinterlegt, endet auf ${fuer.extern.endet_auf}; leer lassen, um ihn zu behalten`
                    : 'leer lassen, wenn der Anbieter keinen verlangt'
                }
              />
              <p className="text-xs text-muted-foreground">
                Er wird verschlüsselt abgelegt und danach nie wieder angezeigt.
              </p>
            </div>
          </div>
        )}
      </form>
    </Dialogform>
  );
}
