/**
 * VorlagenUpdateBanner (Plan 014, Phase 6).
 *
 * Zeigt im Explorer des aktiven Projekts ein Banner „Vorlage aktualisiert",
 * sobald im Gerät eine neuere Vorlagen-Version liegt. Ein Dialog listet die
 * Neuerungen (fehlende Vorlagen-Dateien) einzeln zur Übernahme per Klick.
 * Übernahme ist ausschließlich ADDITIV — bestehende Nutzer-Dateien werden nie
 * verändert (das Backend nutzt wx).
 */
import { useEffect, useMemo, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/shadcn/dialog';
import { Button } from '@/components/ui/shadcn/button';
import { useToast } from '@/contexts/ToastContext';
import { useActiveProject, useVorlagenUpdate } from './useProjects';

export function VorlagenUpdateBanner() {
  const toast = useToast();
  const { activeId } = useActiveProject();
  const { stand, uebernehmen } = useVorlagenUpdate(activeId);
  const [dialogOffen, setDialogOffen] = useState(false);
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  // Lokal ausgeblendet — der Nutzer will jetzt nicht. Der Explorer bleibt beim
  // Projektwechsel gemountet; deshalb den Ausblende-Zustand pro Projekt
  // zurücksetzen, sonst bliebe das Banner für ALLE folgenden Projekte weg.
  const [versteckt, setVersteckt] = useState(false);
  useEffect(() => {
    setVersteckt(false);
    setDialogOffen(false);
  }, [activeId]);

  const neuerungen = useMemo(() => stand?.neuerungen ?? [], [stand]);

  if (!stand?.update || versteckt || neuerungen.length === 0) {
    return null;
  }

  const oeffne = () => {
    setGewaehlt(new Set(neuerungen.map(n => n.pfad)));
    setDialogOffen(true);
  };
  const toggle = (pfad: string) => {
    setGewaehlt(prev => {
      const next = new Set(prev);
      if (next.has(pfad)) {
        next.delete(pfad);
      } else {
        next.add(pfad);
      }
      return next;
    });
  };

  const uebernehmenKlick = async () => {
    const pfade = [...gewaehlt];
    if (pfade.length === 0) return;
    try {
      const res = await uebernehmen.mutateAsync(pfade);
      toast.success(`${res.data.uebernommen.length} Neuerung(en) übernommen`);
      setDialogOffen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Übernahme fehlgeschlagen');
    }
  };

  return (
    <>
      <div
        className="flex items-center gap-2 border-b border-border bg-primary/10 px-3 py-2"
        data-testid="vorlagen-update-banner"
      >
        <Sparkles className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-ui-xs text-foreground">
          Vorlage aktualisiert — {neuerungen.length} Neuerung
          {neuerungen.length === 1 ? '' : 'en'} verfügbar.
        </span>
        <button
          type="button"
          onClick={oeffne}
          data-testid="vorlagen-update-ansehen"
          className="shrink-0 rounded bg-primary px-2 py-0.5 text-ui-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Ansehen
        </button>
        <button
          type="button"
          onClick={() => setVersteckt(true)}
          aria-label="Hinweis ausblenden"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      <Dialog open={dialogOffen} onOpenChange={setDialogOffen}>
        <DialogContent className="sm:max-w-lg" data-testid="vorlagen-update-dialog">
          <DialogHeader>
            <DialogTitle>Vorlage aktualisiert</DialogTitle>
            <DialogDescription>
              Diese Dateien sind in der neuen Vorlagen-Version dazugekommen. Wähle aus, was
              übernommen werden soll — deine eigenen Dateien bleiben dabei unangetastet.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto py-1">
            <ul className="flex flex-col gap-1">
              {neuerungen.map(n => (
                <li key={n.pfad}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-accent/50">
                    <input
                      type="checkbox"
                      checked={gewaehlt.has(n.pfad)}
                      onChange={() => toggle(n.pfad)}
                      data-testid={`vorlagen-update-item-${n.pfad}`}
                      className="size-4 shrink-0"
                    />
                    <span className="min-w-0 truncate font-mono text-ui-xs text-foreground">
                      {n.pfad}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOffen(false)}>
              Später
            </Button>
            <Button
              onClick={uebernehmenKlick}
              disabled={gewaehlt.size === 0 || uebernehmen.isPending}
              data-testid="vorlagen-update-uebernehmen"
            >
              {uebernehmen.isPending ? 'Übernimmt …' : `${gewaehlt.size} übernehmen`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
