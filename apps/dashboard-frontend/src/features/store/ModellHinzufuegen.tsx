import { useState } from 'react';
import { Link2, Loader2, HardDrive, AlertTriangle, Plus } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';
import { Input } from '@/components/ui/shadcn/input';
import { Button } from '@/components/ui/shadcn/button';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';

/**
 * Ein Modell über einen Link hinzufügen (Entscheidung Kolja, 23.08.2026).
 *
 * Warum es das gibt: bis heute konnte ein Kunde nur laden, was im Katalog
 * steht, und der Katalog kommt aus Migrationen — also aus einer
 * Software-Aktualisierung. Ein Gerät, das keine mehr bekommt, hätte für immer
 * die Modelle seines Auslieferungstages. Neue Modelle erscheinen aber
 * schneller, als Geräte aktualisiert werden.
 *
 * Der Ablauf ist bewusst zweistufig. Erst NACHSEHEN, dann laden: eine
 * GGUF-Ablage trägt ein Dutzend Quantisierungen zwischen 11 und 50 GB, und
 * ohne den ersten Schritt müsste der Kunde raten und danach zweistellige
 * Gigabyte laden, um zu merken, dass es nicht ins Gerät passt. Nach dem
 * Nachsehen steht neben jeder Variante ihre Größe und ob sie hineinpasst.
 */

interface Variante {
  tag: string;
  datei: string;
  groesseBytes: number;
  groesse_gb: number;
  ramGb: number;
  passt: boolean | null;
}

interface Befund {
  art: 'huggingface' | 'ollama';
  repo?: string;
  name: string;
  frei_gb?: number | null;
  varianten: Variante[];
  hinweis?: string;
}

export function ModellHinzufuegen({ onHinzugefuegt }: { onHinzugefuegt?: () => void }) {
  const api = useApi();
  const toast = useToast();
  const [offen, setOffen] = useState(false);
  const [quelle, setQuelle] = useState('');
  const [befund, setBefund] = useState<Befund | null>(null);
  const [laeuft, setLaeuft] = useState<'nachsehen' | 'hinzufuegen' | null>(null);

  const nachsehen = async () => {
    setLaeuft('nachsehen');
    setBefund(null);
    try {
      const antwort = await api.post<Befund>('/models/quelle/pruefen', { quelle });
      setBefund(antwort);
    } catch {
      // `useApi` zeigt die Meldung des Servers bereits als Hinweis an. Sie hier
      // ein zweites Mal auszugeben hiesse, denselben Satz doppelt zu sagen.
    } finally {
      setLaeuft(null);
    }
  };

  const hinzufuegen = async (variante?: string) => {
    setLaeuft('hinzufuegen');
    try {
      const antwort = await api.post<{ data: { id: string; name: string } }>('/models/katalog', {
        quelle,
        ...(variante ? { variante } : {}),
      });
      toast.success(`„${antwort.data.name}" steht jetzt im Katalog und kann geladen werden.`);
      setQuelle('');
      setBefund(null);
      setOffen(false);
      onHinzugefuegt?.();
    } catch {
      /* siehe oben */
    } finally {
      setLaeuft(null);
    }
  };

  if (!offen) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        onClick={() => setOffen(true)}
        data-testid="modell-hinzufuegen-oeffnen"
      >
        <Plus className="size-3.5" /> Modell über Link hinzufügen
      </Button>
    );
  }

  return (
    <div
      className="rounded-lg border border-border bg-card p-3"
      data-testid="modell-hinzufuegen"
      aria-label="Modell über Link hinzufügen"
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
        <Link2 className="size-4 text-muted-foreground" />
        Modell über Link hinzufügen
      </div>

      <p className="mb-2 text-xs text-muted-foreground">
        Adresse einer GGUF-Ablage bei huggingface.co, oder ein Modellname aus Ollamas eigener
        Ablage. Beispiel: <code>https://huggingface.co/unsloth/Qwen3-30B-A3B-GGUF</code>
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={quelle}
          onChange={e => setQuelle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && quelle.trim() && !laeuft) void nachsehen();
          }}
          placeholder="https://huggingface.co/…"
          aria-label="Link oder Modellname"
          className="min-w-64 flex-1"
          data-testid="modell-quelle"
        />
        <Button
          size="sm"
          disabled={!quelle.trim() || laeuft !== null}
          onClick={() => void nachsehen()}
          data-testid="modell-nachsehen"
        >
          {laeuft === 'nachsehen' ? <Loader2 className="size-3.5 animate-spin" /> : null} Nachsehen
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOffen(false)}>
          Abbrechen
        </Button>
      </div>

      {befund?.art === 'ollama' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-foreground">{befund.name}</span>
          <span className="text-xs text-muted-foreground">{befund.hinweis}</span>
          <Button
            size="sm"
            disabled={laeuft !== null}
            onClick={() => void hinzufuegen()}
            data-testid="modell-uebernehmen"
          >
            Übernehmen
          </Button>
        </div>
      )}

      {befund?.art === 'huggingface' && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <HardDrive className="size-3.5" />
            {befund.varianten.length} Varianten in {befund.repo}
            {typeof befund.frei_gb === 'number' && <>· {befund.frei_gb} GB frei für Modelle</>}
          </div>
          <ul className="flex flex-col gap-1" data-testid="modell-varianten">
            {befund.varianten.map(v => (
              <li
                key={v.tag}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5"
              >
                <span className="flex items-center gap-2 text-sm text-foreground">
                  <code>{v.tag}</code>
                  <span className="text-xs text-muted-foreground">
                    {v.groesse_gb} GB · braucht {v.ramGb} GB
                  </span>
                  {v.passt === false && (
                    <span className="flex items-center gap-1 text-xs text-destructive">
                      <AlertTriangle className="size-3" /> passt nicht ins Gerät
                    </span>
                  )}
                </span>
                <Button
                  size="sm"
                  variant={v.passt === false ? 'outline' : 'default'}
                  disabled={laeuft !== null}
                  onClick={() => void hinzufuegen(v.tag)}
                  data-testid={`modell-variante-${v.tag}`}
                >
                  Hinzufügen
                </Button>
              </li>
            ))}
          </ul>
          {befund.varianten.some(v => v.passt === false) && (
            <Alert className="mt-2">
              <AlertDescription className="text-xs">
                Eine Variante, die nicht ins Gerät passt, lässt sich hinzufügen und laden — sie
                bleibt aber im Katalog stehen, bis genug Speicher frei ist.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}

export default ModellHinzufuegen;
