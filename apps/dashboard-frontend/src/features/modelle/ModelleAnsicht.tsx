/**
 * Modelle: die Kurzliste dieses Geräts (Phase D5 des Umbaus vom 26.08.2026).
 *
 * WAS HIER GESTRICHEN IST, und warum. An dieser Stelle stand der „Store": ein
 * Kartenraster mit Suche, vier Facettengruppen (Typ, Größe, Status, Aufgabe),
 * einer Gruppierung nach Größenklasse und einer eigenen Detailseite mit
 * Steckbrief. Gebaut war das für einen Katalog, aus dem sich ein Kunde etwas
 * aussucht. Seit C8 gibt es diesen Katalog nicht mehr: der Modellkatalog IST
 * die Kurzliste, vier Modelle, festgelegt an `ollama list` am Orin. Eine Suche
 * über vier Zeilen ist kein Werkzeug, sondern ein Überbleibsel.
 *
 * Übrig sind die Fragen, die ein Administrator wirklich hat: welche vier gibt
 * es, welches liegt am Gerät, welches ist gerade im Speicher, wie viel KI-RAM
 * ist übrig, und welches treibt die Flows (der Standard).
 *
 * Die Rolle blendet aus, das Backend entscheidet: jeder Weg dieser Seite trägt
 * `requireRole('admin')` und antwortet einem Mitarbeiter mit 403, ob die
 * Ansicht für ihn sichtbar ist oder nicht.
 */
import { useEffect } from 'react';
import { Cpu } from 'lucide-react';
import { Kopf } from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { useActivation } from '@/contexts/ActivationContext';
import { useDownloads } from '@/contexts/DownloadContext';
import { useToast } from '@/contexts/ToastContext';
import { isModelInstalled } from '@/hooks/useStoreCatalog';
import { modellAnzeigeName } from '@/utils/modelDisplay';
import { kiRamZeile, modellage, wechselGrund, zuGb } from '@/utils/modellZustand';
import { ModellZeile } from './ModellZeile';
import { useModelle, useModellAktionen } from './useModelle';

function ModelleAnsicht() {
  const toast = useToast();
  const { isDownloading, getDownloadState, startDownload, cancelDownload, onDownloadComplete } =
    useDownloads();
  const { activation, startActivation, onActivationComplete, isActivating } = useActivation();
  const { standardSetzen, entfernen, entladen, entwerten } = useModellAktionen();

  const busy =
    standardSetzen.isPending || entfernen.isPending || entladen.isPending || activation !== null;
  const { modelle, standard, budget, isLoading } = useModelle(busy);

  // Ist ein Download durch, liegt das Modell am Gerät: die Liste muss es
  // wissen, sonst steht dort weiter „nicht am Gerät" bis zum Neuladen.
  useEffect(() => onDownloadComplete(() => entwerten()), [onDownloadComplete, entwerten]);
  useEffect(
    () =>
      onActivationComplete((_id, erfolg) => {
        entwerten();
        if (erfolg) toast.success('Das Modell liegt jetzt im Speicher.');
      }),
    [onActivationComplete, entwerten, toast]
  );

  const geladen = budget?.loadedModels ?? [];
  const lage = modellage(budget);
  const grund = wechselGrund(budget?.lastSwitch?.reason);
  const imSpeicher = (id: string, ollamaName?: string) =>
    geladen.find(m => m.id === id || (ollamaName != null && m.ollamaName === ollamaName)) ?? null;

  const standardName = standard
    ? modellAnzeigeName(modelle.find(m => m.id === standard) ?? standard)
    : null;

  return (
    <div className="min-w-0 p-6 max-md:p-4 animate-in fade-in" data-testid="modelle-seite">
      <Kopf
        titel="Modelle"
        symbol={<Cpu />}
        beschreibung="Die Kurzliste dieses Geräts: vier Modelle, hier gemessen. Geladen wird nur, was hier steht."
      />

      <StatGrid className="mb-6">
        <StatTile
          label="KI-RAM"
          value={budget ? zuGb(budget.usedMb ?? 0) : '—'}
          unit={budget ? `von ${zuGb(budget.totalBudgetMb ?? 0)} GB` : undefined}
          note={kiRamZeile(budget)}
        />
        {/*
          EIN ZUSTAND, UEBERALL GLEICH (Plan 023 D3, hier weitergeführt). Der
          Satz kommt aus `modellage` und lautet damit wortgleich so wie in der
          Statusleiste. Ein Modell, das heruntergeladen ist und gerade nicht im
          Speicher liegt, heißt „bereit" und nicht „keins": Ollama entlädt nach
          einer Ruhezeit von selbst, und das ist kein Fehler.
        */}
        <StatTile
          label="Modell"
          value={lage.name || 'keins'}
          note={
            <span data-testid="modelle-zustand">
              {lage.text}
              {lage.zustand === 'bereit' && ', wird bei Bedarf automatisch geladen'}
              {geladen.length > 0 &&
                `, ${zuGb(geladen.reduce((summe, m) => summe + m.ramMb, 0))} GB im Speicher`}
            </span>
          }
        />
        <StatTile
          label="Standard der Flows"
          value={standardName ?? 'keiner'}
          note={
            standardName
              ? 'Damit rechnet ein Flow, der im Frontmatter keines nennt.'
              : 'Ohne Standard fällt jeder Flow ohne eigenes Modell aus.'
          }
        />
        <StatTile
          label="Am Gerät"
          value={`${modelle.filter(isModelInstalled).length} von ${modelle.length}`}
          note="Was nicht am Gerät liegt, lädt der Knopf in der Zeile."
        />
      </StatGrid>

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
        // Kein Leerzustand mit Einstieg: eine leere Kurzliste heißt, dass die
        // Migration mit dem Katalog nicht gelaufen ist. Dagegen hilft kein
        // Knopf auf dieser Seite.
        <p className="text-sm text-muted-foreground" data-testid="modelle-leer">
          Dieses Gerät führt keinen Modellkatalog. Das ist ein Fehler der Einrichtung, kein leerer
          Zustand.
        </p>
      ) : (
        <ul className="rounded-md border border-border" data-testid="modell-liste">
          {modelle.map(modell => {
            const laeuft = isDownloading(modell.id);
            const geladenMb = imSpeicher(modell.id, modell.effective_ollama_name)?.ramMb ?? null;
            return (
              <ModellZeile
                key={modell.id}
                modell={modell}
                installiert={isModelInstalled(modell)}
                imSpeicherMb={geladenMb}
                istStandard={standard === modell.id}
                busy={busy}
                laufenderDownload={laeuft ? getDownloadState(modell.id) : null}
                ladeVorgang={isActivating(modell.id)}
                onLaden={() => void startDownload(modell.id, modellAnzeigeName(modell))}
                onAbbrechen={() => cancelDownload(modell.id)}
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
                onInDenSpeicher={() => void startActivation(modell.id, modellAnzeigeName(modell))}
                onAusDemSpeicher={() =>
                  entladen.mutate(
                    imSpeicher(modell.id, modell.effective_ollama_name)?.id ?? modell.id,
                    {
                      onSuccess: () => toast.success('Das Modell ist aus dem Speicher.'),
                    }
                  )
                }
              />
            );
          })}
        </ul>
      )}

      {activation && (
        <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
          {activation.error
            ? `${activation.modelName}: ${activation.error}`
            : `${activation.modelName} wird in den Speicher geladen. ${activation.message}`}
        </p>
      )}
    </div>
  );
}

export default ModelleAnsicht;
