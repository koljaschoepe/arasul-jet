/**
 * Ein Modell am Gerät als Zeile (M5, Auftrag verwaltung-modelle).
 *
 * Was auf der Zeile steht, ist das, wonach ein Administrator sucht: Name,
 * Größe, was das Modell kann, ob es gerade warm ist (im Speicher) und welche
 * Flows es nutzen. Handgriffe gibt es zwei: zum Standard der Flows machen und
 * entfernen. Laden und Entladen von Hand gibt es nicht; das Gerät hält ein
 * Modell nach Nutzung und lädt es bei Bedarf selbst.
 *
 * Entfernen ist gesperrt, solange ein Flow das Modell nutzt oder es der
 * Standard ist. Die Sperre entscheidet das Gerät (409); die Zeile zeigt sie
 * vorher, damit niemand erst gegen sie läuft.
 *
 * Die Zeile bricht um, statt zu rollen. Bei 390 px stehen Name, Merkmale und
 * Knöpfe untereinander.
 */
import { Cpu, Trash2 } from 'lucide-react';
import { Button } from '@marken';
import { formatBytes } from '@/utils/formatting';
import { modellAnzeigeName } from '@/utils/modelDisplay';
import type { Faehigkeiten, VerwaltungModell } from './useModelle';

/** „Text, Bild, Werkzeuge, Kontext 32k": nur, was das Modell wirklich kann. */
function faehigkeitenText(f: Faehigkeiten): string {
  const teile = [
    f.text ? 'Text' : null,
    f.bild ? 'Bild' : null,
    f.werkzeuge ? 'Werkzeuge' : null,
    f.kontext ? `Kontext ${Math.round(f.kontext / 1024)}k` : null,
  ].filter(Boolean);
  return teile.length > 0 ? teile.join(', ') : 'keine bekannt';
}

export interface ModellZeileProps {
  modell: VerwaltungModell;
  /** Läuft irgendwo gerade ein Handgriff? Dann keinen zweiten anfangen. */
  busy: boolean;
  onStandard: () => void;
  onEntfernen: () => void;
}

export function ModellZeile({ modell, busy, onStandard, onEntfernen }: ModellZeileProps) {
  // Ein Einbettungs- oder Bildmodell kann nicht der Standard der Flows sein.
  const name = modellAnzeigeName(modell);
  const kannStandardSein = modell.faehigkeiten.text;
  const nurStandardGrund = modell.ist_standard && modell.flows.length === 0 ? modell.sperre : null;

  return (
    <li
      data-testid={`modell-${modell.id}`}
      className="flex flex-wrap items-start gap-x-4 gap-y-3 border-b border-border p-ui-3 last:border-b-0"
    >
      <span className="flex min-w-0 flex-[1_1_16rem] flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <Cpu className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground">{name}</span>
          {modell.ist_standard && (
            <span
              data-testid={`standard-${modell.id}`}
              className="rounded border border-border px-1.5 py-0.5 text-xs font-medium text-foreground"
            >
              Standard
            </span>
          )}
          {modell.ungemessen && (
            <span
              data-testid={`ungemessen-${modell.id}`}
              title="Läuft, aber auf diesem Gerät hat niemand geprüft, wie gut und wie schnell."
              className="rounded border border-dashed border-border px-1.5 py-0.5 text-xs text-muted-foreground"
            >
              ungemessen
            </span>
          )}
        </span>
        <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          <span data-testid={`groesse-${modell.id}`}>{formatBytes(modell.groesse_bytes ?? 0)}</span>
          <span data-testid={`faehigkeiten-${modell.id}`}>
            {faehigkeitenText(modell.faehigkeiten)}
          </span>
          <span data-testid={`warm-${modell.id}`}>warm: {modell.warm ? 'ja' : 'nein'}</span>
        </span>
        <span className="text-xs text-muted-foreground" data-testid={`flows-${modell.id}`}>
          {modell.flows.length > 0
            ? `Genutzt von: ${modell.flows.map(f => `${f.flow} (${f.app_name})`).join(', ')}`
            : 'Kein Flow nutzt es.'}
        </span>
        {nurStandardGrund && (
          <span className="text-xs text-muted-foreground" data-testid={`sperre-${modell.id}`}>
            {nurStandardGrund}
          </span>
        )}
      </span>

      <span className="flex flex-wrap items-center gap-2">
        {kannStandardSein && !modell.ist_standard && (
          <Button
            size="sm"
            variant="outline"
            onClick={onStandard}
            disabled={busy}
            data-testid={`standard-setzen-${modell.id}`}
          >
            Als Standard setzen
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={onEntfernen}
          disabled={busy || modell.sperre !== null}
          title={modell.sperre ?? undefined}
          aria-label={`${name} vom Gerät entfernen`}
          data-testid={`entfernen-${modell.id}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </span>
    </li>
  );
}
