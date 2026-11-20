/**
 * Apps: die Verwaltung des Geräts (Phase D4, seit M5 eine Seite je App).
 *
 * Bis D4 gab es zwei Sichten auf eine App und beide waren unvollständig: die
 * linke Spalte der Shell zeigte einem Menschen, was ihm freigegeben ist (D1),
 * und die Freigabe-Matrix zeigte dem Administrator, wer was darf (D3). Was
 * fehlte, ist die Sicht dessen, der das Gerät betreibt: welche Fassung läuft
 * wo, ist ihr Container gesund, was kann sie, was hat sie getan.
 *
 * SEIT M5 (Auftrag verwaltung-app-seite) steht alles, was eine App tut und
 * darf, auf GENAU EINER Seite (`apps/AppAnsicht.tsx`), auch ihre Verbindungen
 * ins Internet, die bis dahin ein eigener Bereich waren. Die Seite hat eine
 * Adresse: `/workspace/verwaltung/apps/<kennung>`.
 *
 * Die Rolle blendet aus, das Backend entscheidet: jeder Weg dieser Seite trägt
 * `requireRole('admin')` und antwortet einem Mitarbeiter mit 403, ob die Seite
 * für ihn sichtbar ist oder nicht.
 */
import { useState } from 'react';
import { AppWindow, ChevronRight } from '@marken/symbole';
import { Datenliste, Kopf, Leerzustand, type Spalte } from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { AppAnsicht } from './apps/AppAnsicht';
import { useAlleApps, type AppZeile } from './personen/useAppFreigaben';

/**
 * Eine App in der Liste: Name, ein Satz zum Zustand, höchstens ein Tag. Die
 * Fassungen und die Bibliothek stehen auf der Seite der App; hier steht nur,
 * was man vor dem Klick wissen muss (M5: „höchstens ein Tag: (Test)").
 *
 * Seit der Karte bausteine-seitenkopf-und-kompakt (J50) eine kompakte
 * `Datenliste`: Zeilen von 40 px auf einer deckenden Fläche, am Handy Karten.
 */
function zustand(app: AppZeile) {
  const { live, test } = app.staende;
  const mangel = live?.lieferbar === false || test?.lieferbar === false;
  // Ein Tag und „im Test“ nur, wenn der Test eine andere Fassung trägt als Live.
  const wartet = Boolean(test) && test?.version !== live?.version;
  const satz = !live
    ? 'Noch nicht live'
    : wartet && test
      ? `Live ${live.version}, im Test ${test.version}`
      : `Live ${live.version}`;
  return { mangel, wartet, satz };
}

const SPALTEN: ReadonlyArray<Spalte<AppZeile>> = [
  {
    schluessel: 'name',
    titel: 'App',
    breite: '13rem',
    wert: app => app.name,
    zelle: app => (
      <span className="flex min-w-0 items-center gap-2 font-medium text-foreground">
        <AppWindow className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate">{app.name}</span>
      </span>
    ),
  },
  {
    schluessel: 'beschreibung',
    titel: 'Was sie tut',
    kuerzen: true,
    wert: app => app.beschreibung || app.id,
    zelle: app => <span className="text-muted-foreground">{app.beschreibung || app.id}</span>,
  },
  {
    schluessel: 'stand',
    titel: 'Stand',
    ausrichtung: 'rechts',
    wert: app => zustand(app).satz,
    // In der Karte ohne Pfeil: die ganze Karte ist der Knopf.
    kartenText: app => {
      const { mangel, satz } = zustand(app);
      return mangel ? <span className="text-destructive">nicht lieferbar</span> : satz;
    },
    zelle: app => {
      const { mangel, wartet, satz } = zustand(app);
      return (
        <span className="inline-flex items-center justify-end gap-2 text-xs">
          {/* Ein Stand, der nicht ausgeliefert werden kann, ist rot schon in der
              Liste (Auftrag app-leiche): ein Mensch klickt auf die Kachel und
              bekommt nichts. Sonst ein Satz in Grau. */}
          {mangel ? (
            <span className="font-medium text-destructive" data-testid={`app-mangel-${app.id}`}>
              nicht lieferbar
            </span>
          ) : (
            <span className="text-muted-foreground" data-testid={`app-zustand-${app.id}`}>
              {satz}
            </span>
          )}
          {wartet && (
            <span
              className="rounded bg-muted-foreground/15 px-1.5 py-0.5 font-medium text-muted-foreground"
              data-testid={`app-tag-test-${app.id}`}
            >
              (Test)
            </span>
          )}
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </span>
      );
    },
  },
];

export function AppsSettings({
  appId,
  onOeffnen,
}: {
  /** Die offene App aus der Adresse; ohne Angabe merkt sich die Liste sie selbst. */
  appId?: string | null;
  onOeffnen?: (id: string | null) => void;
} = {}) {
  const { data: apps, isLoading, isError } = useAlleApps();
  const [lokal, setLokal] = useState<string | null>(null);
  const offen = appId !== undefined ? appId : lokal;
  const oeffnen = onOeffnen ?? setLokal;

  if (offen) {
    return (
      <div className="animate-in fade-in" data-testid="apps-seite">
        <AppAnsicht key={offen} appId={offen} onZurueck={() => oeffnen(null)} />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in" data-testid="apps-seite">
      <Kopf
        titel="Apps"
        beschreibung="Was auf diesem Gerät läuft. Jede App hat eine Seite mit allem, was sie tut und darf."
      />

      {isLoading ? (
        <SkeletonText lines={4} />
      ) : isError ? (
        // Ein Fehler ist kein Leerzustand — sonst schickt „noch keine App" den
        // Administrator zum Partner, obwohl nur die Abfrage gescheitert ist.
        <p className="text-sm text-muted-foreground" data-testid="apps-fehler">
          Die App-Liste ließ sich nicht laden.
        </p>
      ) : (apps ?? []).length === 0 ? (
        <Leerzustand
          titel="Noch keine App am Gerät"
          beschreibung="Apps baut Ihr Partner und bringt sie auf das Gerät. Sobald eine ankommt, steht sie hier, zuerst in Test."
        />
      ) : (
        <div data-testid="app-liste">
          <Datenliste
            daten={apps ?? []}
            spalten={SPALTEN}
            kennung={app => app.id}
            beschriftung="Apps auf diesem Gerät"
            aufZeile={app => oeffnen(app.id)}
            zeilenKennzeichen={app => `app-oeffnen-${app.id}`}
          />
        </div>
      )}
    </div>
  );
}
