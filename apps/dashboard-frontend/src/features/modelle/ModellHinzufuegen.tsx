/**
 * Ein Modell hinzufügen (M5, Auftrag verwaltung-modelle; vorher J4).
 *
 * Zwei Wege, derselbe Ablauf: aus der geprüften Liste (die vier Modelle der
 * Kurzliste, hier gemessen) oder per Ollama-Name (`name:tag`) oder Hugging Face
 * (`hf.co/nutzer/repo:quant`). Vor dem Laden prüft das Gerät, ob Speicher und
 * Platte reichen, und weist sonst mit zwei Sätzen ab. Die Abweisung steht hier
 * und nicht in einem Toast: das Modell hat noch keine Zeile, an der sie stehen
 * könnte.
 *
 * Was nicht in der Kurzliste steht, ist ungemessen und trägt diese
 * Kennzeichnung, sobald es am Gerät liegt.
 */
import { useState, type FormEvent } from 'react';
import { Download } from 'lucide-react';
import { Button, Input, Label } from '@marken';
import { useDownloads } from '@/contexts/DownloadContext';
import { formatBytes } from '@/utils/formatting';
import { modellAnzeigeName } from '@/utils/modelDisplay';
import DownloadProgress from './DownloadProgress';
import { useModellAktionen, type ListenModell } from './useModelle';

interface ModellHinzufuegenProps {
  liste: ListenModell[];
  /** Ein Handgriff läuft schon: keinen zweiten anfangen. */
  busy: boolean;
  /** Die Liste neu lesen, sobald das Gerät die Zeile angelegt hat. */
  onGestartet: () => void;
}

export function ModellHinzufuegen({ liste, busy, onGestartet }: ModellHinzufuegenProps) {
  const { startDownload, cancelDownload, isDownloading, getDownloadState } = useDownloads();
  const { pruefen } = useModellAktionen();
  const [kennung, setKennung] = useState('');
  const [zuletzt, setZuletzt] = useState<string | null>(null);
  const [abweisung, setAbweisung] = useState<string | null>(null);

  const zustand = zuletzt ? getDownloadState(zuletzt) : null;
  const laeuft = zuletzt ? isDownloading(zuletzt) : false;

  const hinzufuegen = async (e: FormEvent) => {
    e.preventDefault();
    const k = kennung.trim();
    if (!k) return;
    setAbweisung(null);
    try {
      const ergebnis = await pruefen.mutateAsync(k);
      if (!ergebnis.passt) {
        setAbweisung(ergebnis.grund ?? 'Das Modell passt nicht auf dieses Gerät.');
        return;
      }
    } catch (err) {
      // Gibt es nicht, oder die Registry antwortet nicht: ein Satz vom Gerät.
      setAbweisung(err instanceof Error ? err.message : 'Die Prüfung ist fehlgeschlagen.');
      return;
    }
    setZuletzt(k);
    void startDownload(k, k);
    // Das Gerät legt die Zeile an, bevor der Strom beginnt; kurz danach liest
    // die Liste sie mit der Kennzeichnung „ungemessen".
    window.setTimeout(onGestartet, 1500);
    setKennung('');
  };

  return (
    <section
      className="mb-6"
      data-testid="modell-hinzufuegen"
      aria-labelledby="modell-hinzufuegen-titel"
    >
      <h2 id="modell-hinzufuegen-titel" className="mb-1 text-sm font-medium text-foreground">
        Modell hinzufügen
      </h2>

      {liste.length > 0 && (
        <ul className="mb-4 rounded-md border border-border" data-testid="geprueft-liste">
          {liste.map(m => {
            const downloadLaeuft = m.laedt || isDownloading(m.id);
            return (
              <li
                key={m.id}
                data-testid={`geprueft-${m.id}`}
                className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-border p-ui-3 last:border-b-0"
              >
                <span className="flex min-w-0 flex-[1_1_16rem] flex-col gap-1">
                  <span className="text-sm font-medium text-foreground">
                    {modellAnzeigeName(m)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatBytes(m.groesse_bytes ?? 0)}
                    {m.beschreibung ? `, ${m.beschreibung}` : ''}
                  </span>
                  {m.passt === false && (
                    <span
                      className="text-xs text-destructive"
                      role="alert"
                      data-testid={`geprueft-grund-${m.id}`}
                    >
                      {m.grund}
                    </span>
                  )}
                </span>
                {downloadLaeuft ? (
                  <span className="w-full" data-testid={`fortschritt-${m.id}`}>
                    <DownloadProgress
                      downloadState={
                        getDownloadState(m.id) ?? { progress: 0, phase: 'download', error: null }
                      }
                      onCancel={() => cancelDownload(m.id)}
                      compact
                    />
                  </span>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      void startDownload(m.id, modellAnzeigeName(m));
                      window.setTimeout(onGestartet, 1500);
                    }}
                    disabled={busy || m.passt === false}
                    data-testid={`hinzufuegen-${m.id}`}
                  >
                    <Download className="size-4" /> Hinzufügen
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mb-3 text-xs text-muted-foreground">
        {liste.length > 0
          ? 'Oder ein beliebiges Modell'
          : 'Alle geprüften Modelle sind installiert. Ein weiteres Modell'}{' '}
        aus der Ollama-Bibliothek (zum Beispiel mistral:7b) oder von Hugging Face
        (hf.co/nutzer/repo:quant). Das Gerät prüft vorher, ob Speicher und Platte reichen. Modelle
        außerhalb der Liste sind ungemessen: sie laufen, aber hier hat niemand geprüft, wie gut und
        wie schnell.
      </p>
      <form onSubmit={e => void hinzufuegen(e)} className="flex flex-wrap items-end gap-2">
        <span className="flex min-w-0 flex-[1_1_18rem] flex-col gap-1">
          <Label htmlFor="modell-hinzufuegen-kennung">Name des Modells</Label>
          <Input
            id="modell-hinzufuegen-kennung"
            value={kennung}
            onChange={e => setKennung(e.target.value)}
            placeholder="mistral:7b"
            autoComplete="off"
            spellCheck={false}
            data-testid="modell-hinzufuegen-kennung"
          />
        </span>
        <Button
          type="submit"
          size="sm"
          disabled={busy || laeuft || pruefen.isPending || kennung.trim() === ''}
          data-testid="modell-hinzufuegen-absenden"
        >
          <Download className="size-4" /> Prüfen und hinzufügen
        </Button>
      </form>

      {abweisung && (
        <p className="mt-3 text-sm text-destructive" role="alert" data-testid="modell-abweisung">
          {abweisung}
        </p>
      )}

      {zuletzt && zustand && (
        <div className="mt-3" data-testid="modell-hinzufuegen-zustand" aria-live="polite">
          {zustand.phase === 'error' ? (
            <p className="text-sm text-destructive" role="alert">
              {zuletzt}: {zustand.error}
            </p>
          ) : (
            <DownloadProgress
              downloadState={zustand}
              onCancel={() => cancelDownload(zuletzt)}
              compact
            />
          )}
        </div>
      )}
    </section>
  );
}
