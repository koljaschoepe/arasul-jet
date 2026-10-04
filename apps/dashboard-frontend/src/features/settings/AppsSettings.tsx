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
import { AppWindow, ChevronRight } from 'lucide-react';
import { Kopf, Leerzustand } from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { AppAnsicht } from './apps/AppAnsicht';
import { useAlleApps, type AppZeile } from './personen/useAppFreigaben';

/**
 * Eine App in der Liste: Name, ein Satz zum Zustand, höchstens ein Tag. Die
 * Fassungen und die Bibliothek stehen auf der Seite der App; hier steht nur,
 * was man vor dem Klick wissen muss (M5: „höchstens ein Tag: (Test)").
 */
function AppZeileKnopf({ app, onOeffnen }: { app: AppZeile; onOeffnen: () => void }) {
  const { live, test } = app.staende;
  const mangel = live?.lieferbar === false || test?.lieferbar === false;
  const satz = !live
    ? 'Noch nicht live'
    : test
      ? `Live ${live.version}, im Test ${test.version}`
      : `Live ${live.version}`;
  return (
    <button
      type="button"
      onClick={onOeffnen}
      data-testid={`app-oeffnen-${app.id}`}
      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 border-b border-border p-ui-3 text-left transition-colors duration-120 last:border-b-0 hover:bg-accent/40 motion-reduce:transition-none"
    >
      <AppWindow className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-[1_1_10rem]">
        <span className="block text-sm font-medium text-foreground">{app.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {app.beschreibung || app.id}
        </span>
      </span>
      <span className="flex shrink-0 flex-wrap items-center gap-2 text-ui-xs">
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
        {test && (
          <span
            className="rounded bg-muted-foreground/15 px-1.5 py-0.5 font-medium text-muted-foreground"
            data-testid={`app-tag-test-${app.id}`}
          >
            (Test)
          </span>
        )}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

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
        symbol={<AppWindow />}
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
          symbol={<AppWindow />}
          titel="Noch keine App am Gerät"
          beschreibung="Apps baut Ihr Partner und bringt sie auf das Gerät. Sobald eine ankommt, steht sie hier, zuerst in Test."
        />
      ) : (
        <ul className="rounded-md border border-border" data-testid="app-liste">
          {(apps ?? []).map(app => (
            <li key={app.id}>
              <AppZeileKnopf app={app} onOeffnen={() => oeffnen(app.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
