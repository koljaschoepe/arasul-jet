/**
 * Ein Modell der Kurzliste als Zeile (Phase D5).
 *
 * Eine Zeile und keine Karte: bei vier Modellen ist ein Kartenraster mit
 * Gruppen nach Größenklasse ein Regal für einen Gegenstand. Was auf der Zeile
 * steht, ist das, wonach ein Administrator sucht: wofür das Modell da ist, ob
 * es am Gerät liegt, ob es gerade im Speicher ist, und ob es der Standard der
 * Flows ist.
 *
 * Die Zeile bricht um, statt zu rollen. Bei 390 px stehen Name, Merkmale und
 * Knöpfe untereinander (Fund der D4-Abnahme: die Verwaltung stand am Telefon
 * nicht).
 */
import { Cpu, Download, Loader2, Power, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/utils/formatting';
import { modellAnzeigeName } from '@/utils/modelDisplay';
import type { CatalogModel } from '@/hooks/useStoreCatalog';
import DownloadProgress from './DownloadProgress';

/** Wofür ein Modell vorgesehen ist. Kommt als `task` aus dem Katalog. */
const AUFGABE: Record<string, string> = {
  text: 'Text',
  coding: 'Code',
  vision: 'Bilder und eingescannter Text',
  ocr: 'Eingescannter Text',
  embedding: 'Einbettungen',
};

interface DownloadZustand {
  progress: number;
  phase: string;
  status?: string;
  error?: string | null;
  bytesCompleted?: number | null;
  bytesTotal?: number | null;
}

export interface ModellZeileProps {
  modell: CatalogModel;
  /** Liegt es am Gerät? */
  installiert: boolean;
  /** Liegt es gerade im Speicher, und mit wie viel? */
  imSpeicherMb: number | null;
  istStandard: boolean;
  /** Läuft irgendwo gerade ein Handgriff? Dann keinen zweiten anfangen. */
  busy: boolean;
  laufenderDownload: DownloadZustand | null;
  /** Wird gerade in den Speicher geladen (ActivationContext). */
  ladeVorgang: boolean;
  onLaden: () => void;
  onAbbrechen: () => void;
  onStandard: () => void;
  onEntfernen: () => void;
  onInDenSpeicher: () => void;
  onAusDemSpeicher: () => void;
}

export function ModellZeile({
  modell,
  installiert,
  imSpeicherMb,
  istStandard,
  busy,
  laufenderDownload,
  ladeVorgang,
  onLaden,
  onAbbrechen,
  onStandard,
  onEntfernen,
  onInDenSpeicher,
  onAusDemSpeicher,
}: ModellZeileProps) {
  const name = modellAnzeigeName(modell);
  const aufgabe = modell.task ? (AUFGABE[modell.task] ?? modell.task) : null;
  // Ein Einbettungs- oder Bildmodell kann nicht der Standard der Flows sein:
  // `POST /api/models/default` setzt das Modell, mit dem ein Flow rechnet.
  const kannStandardSein = !modell.task || modell.task === 'text' || modell.task === 'coding';

  return (
    <li
      data-testid={`modell-${modell.id}`}
      className="flex flex-wrap items-start gap-x-4 gap-y-3 border-b border-border p-ui-3 last:border-b-0"
    >
      <span className="flex min-w-0 flex-[1_1_16rem] flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <Cpu className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-semibold text-foreground">{name}</span>
          {istStandard && (
            <span
              data-testid={`standard-${modell.id}`}
              className="rounded bg-primary/10 px-1.5 py-0.5 text-ui-xs font-medium text-primary"
            >
              Standard
            </span>
          )}
          {imSpeicherMb !== null && (
            <span
              data-testid={`im-speicher-${modell.id}`}
              className="rounded bg-success/15 px-1.5 py-0.5 text-ui-xs font-medium text-success"
            >
              im Speicher
            </span>
          )}
          {!installiert && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-ui-xs text-muted-foreground">
              nicht am Gerät
            </span>
          )}
        </span>
        <span className="text-xs text-muted-foreground">{modell.description}</span>
        <span className="flex flex-wrap gap-x-3 text-ui-xs text-muted-foreground">
          {aufgabe && <span>{aufgabe}</span>}
          <span>{formatBytes(modell.size_bytes)}</span>
          {modell.ram_required_gb ? <span>{modell.ram_required_gb} GB im Speicher</span> : null}
        </span>
      </span>

      <span className={cn('flex flex-wrap items-center gap-2', laufenderDownload && 'w-full')}>
        {laufenderDownload ? (
          <span className="w-full" data-testid={`fortschritt-${modell.id}`}>
            <DownloadProgress downloadState={laufenderDownload} onCancel={onAbbrechen} compact />
          </span>
        ) : !installiert ? (
          <Button size="sm" onClick={onLaden} disabled={busy} data-testid={`laden-${modell.id}`}>
            <Download className="size-4" /> Laden
          </Button>
        ) : (
          <>
            {kannStandardSein && !istStandard && (
              <Button
                size="sm"
                variant="outline"
                onClick={onStandard}
                disabled={busy}
                data-testid={`standard-setzen-${modell.id}`}
              >
                Standard
              </Button>
            )}
            {imSpeicherMb !== null ? (
              <Button
                size="sm"
                variant="outline"
                onClick={onAusDemSpeicher}
                disabled={busy}
                data-testid={`entladen-${modell.id}`}
              >
                <Power className="size-4" /> Aus dem Speicher
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={onInDenSpeicher}
                disabled={busy}
                data-testid={`in-den-speicher-${modell.id}`}
              >
                {ladeVorgang ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Zap className="size-4" />
                )}
                In den Speicher
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={onEntfernen}
              disabled={busy}
              aria-label={`${name} vom Gerät entfernen`}
              data-testid={`entfernen-${modell.id}`}
            >
              <Trash2 className="size-4" />
            </Button>
          </>
        )}
      </span>
    </li>
  );
}
