/**
 * FreigabeDialog (Plan 017 Schritt 7) — bestätigt beim Live-Schalten einmalig
 * die im Manifest deklarierten Brücken-Fähigkeiten einer Erweiterung
 * („Diese Erweiterung darf: …"). Erst nach Bestätigung erhält die Erweiterung
 * gescopte Tokens für LLM/RAG/Dateien/Flows.
 */
import { Blocks, ShieldCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/shadcn/dialog';
import { Button } from '@/components/ui/shadcn/button';

/** Menschliche Beschreibung je Fähigkeit. */
const FAEHIGKEIT_LABEL: Record<string, string> = {
  llm: 'das lokale Sprachmodell nutzen (Fragen & Antworten)',
  rag: 'die Wissensbasis durchsuchen',
  dateien: 'einen eigenen Datentopf lesen und schreiben',
  flows: 'Automatisierungen (Flows) starten und auslesen',
};

export interface FreigabeAnfrage {
  extId: string;
  name: string;
  faehigkeiten: string[];
}

export default function FreigabeDialog({
  anfrage,
  laeuft = false,
  onBestaetigen,
  onAbbrechen,
}: {
  anfrage: FreigabeAnfrage | null;
  laeuft?: boolean;
  onBestaetigen: () => void;
  onAbbrechen: () => void;
}) {
  return (
    <Dialog
      open={anfrage != null}
      onOpenChange={open => {
        // Während der Freigabe-Aufruf läuft, nicht per Escape/Klick-außerhalb
        // schließen — sonst könnte ein erneutes 400 den Dialog wieder öffnen.
        if (!open && !laeuft) onAbbrechen();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Blocks className="size-4 text-primary" />
            Erweiterung freigeben
          </DialogTitle>
          <DialogDescription>
            „{anfrage?.name}&ldquo; möchte auf die lokale Basis zugreifen. Diese Freigabe gilt bis
            zum nächsten Update der Erweiterung.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <p className="mb-2 text-ui-sm font-medium text-foreground">Diese Erweiterung darf:</p>
          <ul className="space-y-1.5">
            {(anfrage?.faehigkeiten ?? []).map(f => (
              <li key={f} className="flex items-start gap-2 text-ui-sm text-text-secondary">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span>{FAEHIGKEIT_LABEL[f] || f}</span>
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onAbbrechen} disabled={laeuft}>
            Abbrechen
          </Button>
          <Button onClick={onBestaetigen} disabled={laeuft}>
            {laeuft ? 'Wird freigegeben …' : 'Freigeben & live schalten'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
