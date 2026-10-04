/**
 * Läufe: alles, was auf dem Gerät gelaufen ist, über alle Apps (M5, Karte
 * verwaltung-laeufe). Der Administrator findet jeden Lauf mit Filtern nach App,
 * Ergebnis, Person und Zeitraum; Fehler und „nicht übergeben" stehen oben.
 * Eine Zeile klappt auf (mehrere zugleich, bis zu Ein- und Ausgabe jedes
 * Schritts), und jeder Lauf hat eine Adresse:
 * `/workspace/verwaltung/laeufe/<nummer>`.
 *
 * Dies ist die EINE Stelle für Läufe. Die Seite einer App verweist hierher,
 * mit der App als Filter, und zeigt keine zweite Liste. Läufe aus Zeitplan und
 * Ereignis gehören keinem Menschen; sie stehen unter „Ohne Person", und der
 * Administrator sieht und bricht auch sie ab.
 */
import { ListOrdered } from 'lucide-react';
import { Button, Kopf, Leerzustand } from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useAlleApps } from './personen/useAppFreigaben';
import { anzeigeName, useBenutzer } from './personen/usePersonen';
import { LaeufeFilterLeiste } from './laeufe/LaeufeFilter';
import { LaufSeite } from './laeufe/LaufSeite';
import { LaufZeile } from './laeufe/LaufZeile';
import {
  KEIN_FILTER,
  filterAusAbfrage,
  filterGesetzt,
  filterZuAbfrage,
  useLaeufe,
  type LaeufeFilter,
} from './laeufe/useLaeufe';

export function LaeufeSettings({
  abschnitt,
  filter: abfrage,
  onOeffnen,
}: {
  /** Die Nummer eines Laufs aus der Adresse; ohne sie die Liste. */
  abschnitt?: string;
  /** Die Filter aus der Adresse (Abfrage ohne `?`). */
  filter?: string;
  onOeffnen: (ziel: { abschnitt?: string; filter?: string }) => void;
}) {
  const filter = filterAusAbfrage(abfrage);
  const apps = useAlleApps();
  const personen = useBenutzer();
  const liste = useLaeufe(filter);

  const appName = (id: string | null | undefined) =>
    id ? ((apps.data ?? []).find(a => a.id === id)?.name ?? id) : 'Plattform';
  const aendern = (neu: LaeufeFilter) => onOeffnen({ filter: filterZuAbfrage(neu) });

  if (abschnitt) {
    return (
      <div className="animate-in fade-in" data-testid="laeufe-seite">
        <LaufSeite
          key={abschnitt}
          runId={Number(abschnitt)}
          appName={appName}
          onZurueck={() => onOeffnen({ filter: abfrage })}
        />
      </div>
    );
  }

  const laeufe = (liste.data?.pages ?? []).flatMap(s => s.laeufe);
  const gesamt = liste.data?.pages[0]?.gesamt ?? 0;
  // Die Apps der Auswahl: die am Gerät und, was in der Adresse steht, auch wenn
  // es die App nicht mehr gibt (ihre Läufe überleben sie).
  const appOptionen = [
    ...(apps.data ?? []).map(a => ({ wert: a.id, text: a.name })),
    ...(filter.app && !(apps.data ?? []).some(a => a.id === filter.app)
      ? [{ wert: filter.app, text: filter.app }]
      : []),
  ];
  const personOptionen = (personen.data ?? []).map(p => ({
    wert: String(p.id),
    text: anzeigeName(p),
  }));

  return (
    <div className="animate-in fade-in flex flex-col gap-4" data-testid="laeufe-seite">
      <Kopf
        titel="Läufe"
        symbol={<ListOrdered />}
        beschreibung="Was auf diesem Gerät gelaufen ist, über alle Apps. Fehler stehen oben."
      />

      <LaeufeFilterLeiste
        filter={filter}
        apps={appOptionen}
        personen={personOptionen}
        onAendern={aendern}
      />

      {liste.isLoading ? (
        <SkeletonText lines={6} />
      ) : liste.isError ? (
        <p className="text-sm text-muted-foreground" data-testid="laeufe-fehler">
          Die Läufe ließen sich nicht laden.
        </p>
      ) : laeufe.length === 0 ? (
        <Leerzustand
          symbol={<ListOrdered />}
          titel={filterGesetzt(filter) ? 'Kein Lauf mit dieser Auswahl' : 'Noch kein Lauf'}
          beschreibung={
            filterGesetzt(filter)
              ? 'Ändern Sie die Auswahl oder setzen Sie sie zurück.'
              : 'Eine App startet ihre Flows selbst, von Hand, nach Zeitplan oder auf ein Ereignis.'
          }
          aktion={
            filterGesetzt(filter) ? (
              <Button variant="outline" size="sm" onClick={() => aendern(KEIN_FILTER)}>
                Auswahl zurücksetzen
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="text-xs text-muted-foreground" data-testid="laeufe-zahl">
            {gesamt === 1 ? '1 Lauf' : `${gesamt} Läufe`}
          </p>
          <ul className="rounded-md border border-border" data-testid="laeufe-liste">
            {laeufe.map(l => (
              <LaufZeile
                key={l.id}
                lauf={l}
                appName={appName(l.app_id)}
                filter={abfrage ?? ''}
                onOeffnen={id => onOeffnen({ abschnitt: String(id), filter: abfrage })}
              />
            ))}
          </ul>
          {liste.hasNextPage && (
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              disabled={liste.isFetchingNextPage}
              onClick={() => void liste.fetchNextPage()}
              data-testid="laeufe-mehr"
            >
              {liste.isFetchingNextPage ? 'lädt…' : 'Mehr laden'}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
