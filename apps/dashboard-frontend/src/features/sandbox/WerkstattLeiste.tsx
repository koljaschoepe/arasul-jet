/**
 * WerkstattLeiste — „Erweiterung live schalten" für Werkstatt-Sandboxes.
 *
 * Erscheint über dem Terminal, wenn die aktive Sitzung in einer
 * Erweiterungs-Werkstatt läuft. Ein Klick paketiert den angegebenen Ordner
 * der Sandbox über den bestehenden Bau-Pfad (POST /extensions/bauen,
 * overwrite), schaltet die Erweiterung frei und öffnet App-Erweiterungen
 * direkt als Tab — bauen, testen, live sehen, ohne den Store-Umweg.
 */
import { useState } from 'react';
import { Hammer, Loader2, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { useExtensions } from '@/hooks/useExtensions';
import { useToast } from '@/contexts/ToastContext';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { ApiError } from '@/hooks/useApi';
import type { SandboxProject } from './types';

export default function WerkstattLeiste({ projekt }: { projekt: SandboxProject }) {
  const toast = useToast();
  const { buildFromSandbox, setExtensionEnabled } = useExtensions();
  const openTab = useWorkspaceStore(s => s.openTab);
  const [ordner, setOrdner] = useState('.');
  const [laeuft, setLaeuft] = useState(false);

  const liveSchalten = async () => {
    setLaeuft(true);
    try {
      const ext = await buildFromSandbox(projekt.slug, ordner.trim() || '.', true);
      if (!ext.enabled) {
        await setExtensionEnabled(ext.id, true);
      }
      if (ext.type === 'app') {
        openTab({ type: 'extension', extensionId: ext.id, title: ext.name });
        toast.success(`„${ext.name}" ist live — Tab geöffnet`);
      } else {
        toast.success(`„${ext.name}" (${ext.type}) ist live geschaltet`);
      }
    } catch (err) {
      toast.error((err as ApiError).message || 'Live schalten fehlgeschlagen');
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <div
      className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5"
      data-testid="werkstatt-leiste"
    >
      <Hammer className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="hidden text-ui-xs text-muted-foreground sm:inline">
        Erweiterungs-Werkstatt
      </span>
      <div className="ml-auto flex items-center gap-2">
        <Input
          value={ordner}
          onChange={e => setOrdner(e.target.value)}
          className="h-7 w-44 font-mono text-[12px]"
          placeholder="Ordner (z. B. meine-app)"
          aria-label="Ordner der Erweiterung in der Sandbox"
          title="Ordner in der Sandbox, der die manifest.json enthält (. = ganze Sandbox)"
        />
        <Button
          type="button"
          size="sm"
          onClick={() => void liveSchalten()}
          disabled={laeuft}
          data-testid="werkstatt-live-button"
        >
          {laeuft ? <Loader2 className="size-3.5 animate-spin" /> : <Rocket className="size-3.5" />}
          {laeuft ? 'Baut …' : 'Erweiterung live schalten'}
        </Button>
      </div>
    </div>
  );
}
