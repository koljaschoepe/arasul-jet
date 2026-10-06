/**
 * Modelle: der Bereich der Verwaltung (M5, Auftrag verwaltung-modelle).
 *
 * Eine Zeile Speicher für KI, darunter eine Zeile je Modell am Gerät mit Name,
 * Größe, Fähigkeiten, „warm" und den Flows, die es nutzen. Hinzufügen geht aus
 * der geprüften Liste oder per Ollama-Name, jeweils mit Prüfung vorab, ob das
 * Modell auf das Gerät passt. Entfernen ist gesperrt, solange ein Flow das
 * Modell nutzt oder es der Standard ist.
 *
 * WAS HIER FEHLT, mit Absicht: Knöpfe zum Laden oder Entladen von Hand. Das
 * Gerät hält ein Modell nach Nutzung (`modelLifecycleService`) und lädt es bei
 * Bedarf selbst; ein Knopf dafür war eine Entscheidung, die das Gerät besser
 * trifft. Dieselbe Regel stand schon für die Statusleiste.
 *
 * Die Rolle blendet aus, das Backend entscheidet: jeder Weg dieser Seite trägt
 * `requireRole('admin')` und antwortet einem Mitarbeiter mit 403, ob die
 * Ansicht für ihn sichtbar ist oder nicht.
 */
import { useEffect } from 'react';
import { Cpu } from 'lucide-react';
import { Kopf } from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useDownloads } from '@/contexts/DownloadContext';
import { useToast } from '@/contexts/ToastContext';
import { kiRamZeile, wechselGrund } from '@/utils/modellZustand';
import { modellAnzeigeName } from '@/utils/modelDisplay';
import { ModellHinzufuegen } from './ModellHinzufuegen';
import { ModellZeile } from './ModellZeile';
import { useModelle, useModellAktionen } from './useModelle';

function ModelleAnsicht() {
  const toast = useToast();
  const { onDownloadComplete } = useDownloads();
  const { standardSetzen, entfernen, entwerten } = useModellAktionen();

  const busy = standardSetzen.isPending || entfernen.isPending;
  const { modelle, liste, budget, isLoading } = useModelle(busy);

  // Ist ein Download durch, liegt das Modell am Gerät: die Liste muss es
  // wissen, sonst steht dort weiter die Zeile der Liste bis zum Neuladen.
  useEffect(() => onDownloadComplete(() => entwerten()), [onDownloadComplete, entwerten]);

  const grund = wechselGrund(budget?.lastSwitch?.reason);

  return (
    <div className="min-w-0 animate-in fade-in" data-testid="modelle-seite">
      <Kopf
        titel="Modelle"
        symbol={<Cpu />}
        beschreibung="Die Modelle dieses Geräts und die Flows, die sie nutzen. Das Gerät lädt und entlädt sie selbst, je nach Nutzung."
      />

      <p className="mb-6 text-sm text-foreground" data-testid="modelle-speicher">
        <span className="font-medium">Speicher für KI</span>{' '}
        <span className="text-muted-foreground">{budget ? kiRamZeile(budget) : '—'}</span>
      </p>

      {/* Plan 023 D3: warum das Gerät zuletzt selbst etwas getan hat. Wer sein
          Modell aus dem Speicher verschwinden sieht, bekam dafür keine
          Erklärung. */}
      {grund && budget?.lastSwitch && (
        <p className="mb-6 text-sm text-muted-foreground" data-testid="modelle-wechselgrund">
          {modellAnzeigeName(budget.lastSwitch.model)} wurde {grund}.
        </p>
      )}

      {isLoading ? (
        <SkeletonText lines={4} />
      ) : modelle.length === 0 ? (
        <p className="mb-6 text-sm text-muted-foreground" data-testid="modelle-leer">
          Auf diesem Gerät liegt noch kein Modell. Unten lässt sich eines hinzufügen.
        </p>
      ) : (
        <ul className="mb-6 rounded-md border border-border" data-testid="modell-liste">
          {modelle.map(modell => (
            <ModellZeile
              key={modell.id}
              modell={modell}
              busy={busy}
              onStandard={() =>
                standardSetzen.mutate(modell.id, {
                  onSuccess: () =>
                    toast.success(`Die Flows rechnen jetzt mit ${modellAnzeigeName(modell)}.`),
                })
              }
              onEntfernen={() =>
                entfernen.mutate(modell.id, {
                  onSuccess: () =>
                    toast.success(`${modellAnzeigeName(modell)} ist vom Gerät entfernt.`),
                })
              }
            />
          ))}
        </ul>
      )}

      <ModellHinzufuegen liste={liste} busy={busy} onGestartet={entwerten} />
    </div>
  );
}

export default ModelleAnsicht;
