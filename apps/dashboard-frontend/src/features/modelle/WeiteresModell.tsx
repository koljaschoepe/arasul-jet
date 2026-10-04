/**
 * Ein Modell laden, das nicht in der Kurzliste steht (J4, 30.09.2026).
 *
 * Seit C8 (27.08.2026) gab es nur die vier Modelle der Kurzliste. Kunden und
 * Partner wollen wählen, also nimmt das Gerät jede Kennung aus der
 * Ollama-Bibliothek (`name:tag`) und von Hugging Face
 * (`hf.co/nutzer/repo:quant`). Was nicht in der Kurzliste steht, ist
 * **ungemessen** und trägt diese Kennzeichnung in der Liste: das Modell läuft,
 * aber niemand hat hier geprüft, wie gut und wie schnell.
 *
 * Eine Abweisung (zu groß für den Speicher, gibt es nicht, Registry nicht
 * erreichbar) kommt als Satz vom Gerät und steht hier, nicht in einem Toast —
 * das Modell hat noch keine Zeile, an der sie stehen könnte.
 */
import { useState, type FormEvent } from 'react';
import { Download } from 'lucide-react';
import { Button, Input, Label } from '@marken';
import { useDownloads } from '@/contexts/DownloadContext';
import DownloadProgress from './DownloadProgress';

interface WeiteresModellProps {
  /** Ein Handgriff läuft schon: keinen zweiten anfangen. */
  busy: boolean;
  /** Die Liste neu lesen, sobald das Gerät die Zeile angelegt hat. */
  onGestartet: () => void;
}

export function WeiteresModell({ busy, onGestartet }: WeiteresModellProps) {
  const { startDownload, cancelDownload, isDownloading, getDownloadState } = useDownloads();
  const [kennung, setKennung] = useState('');
  const [zuletzt, setZuletzt] = useState<string | null>(null);

  const zustand = zuletzt ? getDownloadState(zuletzt) : null;
  const laeuft = zuletzt ? isDownloading(zuletzt) : false;

  const laden = (e: FormEvent) => {
    e.preventDefault();
    const k = kennung.trim();
    if (!k) return;
    setZuletzt(k);
    void startDownload(k, k);
    // Das Gerät legt die Zeile an, bevor der Strom beginnt; kurz danach liest
    // die Liste sie mit der Kennzeichnung „ungemessen".
    window.setTimeout(onGestartet, 1500);
    setKennung('');
  };

  return (
    <section className="mb-6" data-testid="weiteres-modell" aria-labelledby="weiteres-modell-titel">
      <h2 id="weiteres-modell-titel" className="mb-1 text-sm font-medium text-foreground">
        Weiteres Modell laden
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Jedes offene Modell aus der Ollama-Bibliothek (zum Beispiel mistral:7b) oder von Hugging
        Face (hf.co/nutzer/repo:quant). Modelle außerhalb der Kurzliste sind ungemessen: sie laufen,
        aber hier hat niemand geprüft, wie gut und wie schnell. Passt eines nicht in den Speicher
        des Geräts, sagt das Gerät es vorher.
      </p>
      <form onSubmit={laden} className="flex flex-wrap items-end gap-2">
        <span className="flex min-w-0 flex-[1_1_18rem] flex-col gap-1">
          <Label htmlFor="weiteres-modell-kennung">Name des Modells</Label>
          <Input
            id="weiteres-modell-kennung"
            value={kennung}
            onChange={e => setKennung(e.target.value)}
            placeholder="mistral:7b"
            autoComplete="off"
            spellCheck={false}
            data-testid="weiteres-modell-kennung"
          />
        </span>
        <Button
          type="submit"
          size="sm"
          disabled={busy || laeuft || kennung.trim() === ''}
          data-testid="weiteres-modell-laden"
        >
          <Download className="size-4" /> Laden
        </Button>
      </form>

      {zuletzt && zustand && (
        <div className="mt-3" data-testid="weiteres-modell-zustand" aria-live="polite">
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
