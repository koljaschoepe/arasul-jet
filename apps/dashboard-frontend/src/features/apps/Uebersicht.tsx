/**
 * Die Startseite (M5, `frontend.md`, Abschnitt Startseite; seit J50 mit dem
 * Seitenkopf wie jede Seite): oben der Gruß mit Vorname und der Stand der
 * Freigaben als Satz, bei offenen ein Knopf zur Liste, darunter „Für Sie",
 * dann eine Kachel je App, beim Administrator zuletzt, was Aufmerksamkeit
 * braucht.
 *
 * MITARBEITER-SICHT ZUERST: was hier steht, gilt für jeden, der sich anmeldet.
 * Der Systemzustand (CPU, GPU, Dienste) gehört ausdrücklich NICHT hierher; er
 * steht in der Verwaltung, und ein Mitarbeiter, der einen Urlaubsantrag stellt,
 * hat mit der GPU-Temperatur nichts zu tun. Auch im Band steht keine Technik,
 * nicht einmal beim Administrator: seine Hinweise stehen unter den Kacheln.
 */
import { useEffect, type ReactNode } from 'react';
import { ArrowDown, Check } from '@marken/symbole';
import { Button, Checkbox, Karte, Kopf } from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { AppSymbol } from '@/components/AppSymbol';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { standFuerKlick, useMeineApps, zuLeiste, type LeistenApp } from './meineApps';
import { ERSTE_SCHRITTE, ersterSchrittSetzen, useErsteSchritte } from './ersteSchritte';

const ZAHLWORT = [
  'Keine',
  'Eine',
  'Zwei',
  'Drei',
  'Vier',
  'Fünf',
  'Sechs',
  'Sieben',
  'Acht',
  'Neun',
  'Zehn',
  'Elf',
  'Zwölf',
];

/** „Zwei Freigaben warten auf Sie": bis zwölf in Worten, darüber als Zahl. */
function wartenSatz(zahl: number): string {
  if (zahl === 1) return 'Eine Freigabe wartet auf Sie';
  return `${ZAHLWORT[zahl] ?? zahl} Freigaben warten auf Sie`;
}

function zurListe() {
  const ziel = document.getElementById('fuer-sie');
  if (!ziel) return;
  const ruhig = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  ziel.scrollIntoView?.({ behavior: ruhig ? 'auto' : 'smooth', block: 'start' });
  ziel.focus({ preventScroll: true });
}

/**
 * Der Kopf der Startseite (J50): derselbe `Kopf` wie auf jeder Seite, der
 * Gruß als Titel, der Stand der Freigaben als Satz darunter. Bis dahin stand
 * er in einem blau getönten Band, der einzigen zweiten Fläche der Shell; der
 * Entwurf will, dass jede Seite gleich beginnt.
 */
function StartKopf({ name, offen }: { name: string; offen?: number }) {
  return (
    <Kopf
      titel={name ? `Guten Tag, ${name}` : 'Guten Tag'}
      beschreibung={
        offen === undefined ? (
          'Ihre Apps und was auf Sie wartet.'
        ) : offen > 0 ? (
          'Was bei Ihnen liegt, steht direkt darunter bei „Für Sie“.'
        ) : (
          <span className="inline-flex items-center gap-1.5" data-testid="startband-erledigt">
            <Check className="size-3.5 text-primary" aria-hidden="true" />
            Alles erledigt, keine Freigabe wartet auf Sie.
          </span>
        )
      }
      aktionen={
        offen !== undefined && offen > 0 ? (
          <Button variant="solid" onClick={zurListe} data-testid="startband-freigaben">
            <ArrowDown aria-hidden="true" />
            {wartenSatz(offen)}
          </Button>
        ) : undefined
      }
    />
  );
}

/** Eine Kachel je App; ein Klick öffnet die Fassung, in der man sie zuletzt hatte. */
function AppKachel({ app, onOeffnen }: { app: LeistenApp; onOeffnen: () => void }) {
  const kennung = `uebersicht-app-${app.id}`;
  return (
    <Karte
      titel={app.name}
      symbol={<AppSymbol symbol={app.symbol} klasse="size-5" />}
      onKlick={onOeffnen}
      kennzeichen={kennung}
    >
      {app.abteilung ?? ''}
    </Karte>
  );
}

/**
 * „Erste Schritte“: eine Karte mit vier Häkchen und einem Fortschrittsbalken.
 * Sind alle vier erledigt, verschwindet sie (Klickentwurf 7).
 */
function ErsteSchritte() {
  const { stand, anzahl, alle, setze } = useErsteSchritte();
  const oeffne = useWorkspaceStore(s => s.oeffne);
  if (alle) return null;
  return (
    <section
      className="mb-6 rounded-xl border border-border bg-card p-ui-3"
      aria-labelledby="erste-schritte"
      data-testid="erste-schritte"
    >
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="erste-schritte" className="text-sm font-medium text-foreground">
          Erste Schritte
        </h2>
        <span className="text-xs text-muted-foreground">{anzahl} von 4</span>
      </div>
      <div
        role="progressbar"
        aria-label="Erste Schritte"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={anzahl}
        className="mb-3 h-1 overflow-hidden rounded-full bg-accent"
      >
        <div
          className="h-full bg-primary transition-[width]"
          style={{ width: `${anzahl * 25}%` }}
        />
      </div>
      <ul className="flex flex-col">
        {ERSTE_SCHRITTE.map(sch => (
          <li key={sch.id} className="flex min-h-11 items-center gap-3">
            <Checkbox
              checked={!!stand[sch.id]}
              onCheckedChange={v => setze(sch.id, v === true)}
              aria-label={`${sch.titel}: erledigt`}
              data-testid={`erster-schritt-${sch.id}`}
            />
            <button
              type="button"
              className="text-left text-sm text-foreground"
              onClick={() => {
                if (sch.id === 'store') oeffne({ type: 'store' });
                else if (sch.id === 'freigabe') document.getElementById('fuer-sie')?.focus();
              }}
            >
              {sch.titel}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Die Startseite (J60): Begrüßung, Erste Schritte, Für Sie, Zuletzt. */
export function Uebersicht({
  freigaben,
  hinweise,
  offen,
}: {
  freigaben?: ReactNode;
  /** Was der Administrator wissen muss; die Shell reicht es nur ihm herein. */
  hinweise?: ReactNode;
  /** Offene Freigaben je `<kennung>:<stand>`; die Shell zählt sie, hier steht nur die Zahl. */
  wartend?: Record<string, number>;
  /** Alle offenen Freigaben bei mir; `undefined`, solange die Liste lädt. */
  offen?: number;
}) {
  const { user } = useAuth();
  const oeffne = useWorkspaceStore(s => s.oeffne);
  const zuletztStand = useWorkspaceStore(s => s.zuletztStand);
  const zuletzt = useWorkspaceStore(s => s.zuletzt);
  const { data: apps, isLoading } = useMeineApps();

  const eintraege = zuLeiste(apps ?? []);
  const name = user?.vorname?.trim() || user?.anzeigeName || user?.username || '';
  const kuerzlich = zuletzt
    .map(id => eintraege.find(e => e.id === id))
    .filter((e): e is LeistenApp => !!e);

  // Wer einmal eine App geöffnet hat, hat diesen Schritt getan.
  useEffect(() => {
    if (zuletzt.length > 0) ersterSchrittSetzen('app');
  }, [zuletzt.length]);

  return (
    <div
      className="max-w-[100rem] px-[clamp(16px,4vw,24px)] pt-[10px] pb-6"
      data-testid="uebersicht-seite"
    >
      <StartKopf name={name} offen={offen} />
      <ErsteSchritte />

      {/* „Für Sie“ trägt seine Marke selbst (`id="fuer-sie"`): das Dock springt hierher. */}
      {freigaben}

      <section
        id="zuletzt"
        tabIndex={-1}
        aria-labelledby="start-zuletzt"
        className="mb-6 scroll-mt-4 outline-none"
        data-testid="uebersicht-apps"
      >
        <h2 id="start-zuletzt" className="mb-2 text-sm font-medium text-foreground">
          Zuletzt
        </h2>
        {isLoading ? (
          <SkeletonText lines={2} />
        ) : kuerzlich.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="zuletzt-leer">
            {eintraege.length === 0
              ? user?.role === 'admin'
                ? 'Noch keine App für Sie. Geben Sie Apps unter Verwaltung › Personen frei.'
                : 'Noch keine App für Sie. Ein Administrator gibt Apps frei.'
              : 'Noch nichts geöffnet. Im Store finden Sie Ihre Apps.'}
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-ui-2">
            {kuerzlich.map(app => (
              <AppKachel
                key={app.id}
                app={app}
                onOeffnen={() =>
                  oeffne({
                    type: 'app',
                    appId: app.id,
                    stand: standFuerKlick(app, zuletztStand[app.id]),
                    title: app.name,
                  })
                }
              />
            ))}
          </div>
        )}
      </section>

      {hinweise}
    </div>
  );
}
