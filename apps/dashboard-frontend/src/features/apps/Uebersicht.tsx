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
import { type ReactNode } from 'react';
import { AppWindow, ArrowDown, Check } from '@marken/symbole';
import { Button, Karte, Kopf, Leerzustand } from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { AppSymbol } from '@/components/AppSymbol';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { standFuerKlick, useMeineApps, zuLeiste, type LeistenApp } from './meineApps';

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
          'Was bei Ihnen liegt, steht gleich darunter unter „Für Sie“.'
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

/**
 * Eine Kachel je App (J50): eine App mit Live- und Testfassung steht einmal
 * da, wie in der Leiste; ein Klick öffnet die Fassung, in der man sie zuletzt
 * offen hatte, umgeschaltet wird in der Kapsel. Bis dahin standen zwei
 * Kacheln da, eine davon „(Test) Name".
 */
function AppKachel({
  app,
  wartend,
  onOeffnen,
}: {
  app: LeistenApp;
  wartend: number;
  onOeffnen: () => void;
}) {
  const kennung = `uebersicht-app-${app.id}`;
  return (
    <Karte
      titel={app.name}
      symbol={<AppSymbol symbol={app.symbol} klasse="size-5" />}
      onKlick={onOeffnen}
      kennzeichen={kennung}
    >
      {wartend > 0 ? (
        <span className="font-medium text-primary" data-testid={`${kennung}-wartend`}>
          {wartend === 1 ? '1 Freigabe offen' : `${wartend} Freigaben offen`}
        </span>
      ) : (
        <span data-testid={`${kennung}-ruhig`}>Keine offene Freigabe</span>
      )}
    </Karte>
  );
}

export function Uebersicht({
  freigaben,
  hinweise,
  wartend,
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
  const { data: apps, isLoading } = useMeineApps();

  const eintraege = zuLeiste(apps ?? []);
  const name = user?.vorname?.trim() || user?.anzeigeName || user?.username || '';

  return (
    // Dieselben Ränder wie jede Seite (Bereichsrahmen, Cockpit): linksbündig,
    // oben 10 px, seitlich 16 bis 24 px, höchstens 64rem breit.
    <div
      className="max-w-[64rem] px-[clamp(16px,4vw,24px)] pt-[10px] pb-6"
      data-testid="uebersicht-seite"
    >
      <StartKopf name={name} offen={offen} />

      {/* Zuerst das, was auf eine ANTWORT wartet, danach das, was offen
          herumsteht. Ein angehaltener Flow blockiert jemanden anderes; eine
          App wartet nicht. */}
      {freigaben}

      {isLoading ? (
        <SkeletonText lines={3} />
      ) : eintraege.length === 0 ? (
        <Leerzustand
          symbol={<AppWindow />}
          titel="Noch keine App für Sie"
          beschreibung={
            user?.role === 'admin'
              ? 'Geben Sie Apps unter Verwaltung › Personen frei. Sobald eine für Sie dabei ist, steht sie hier und in der Leiste.'
              : 'Ein Administrator gibt Apps für einzelne Menschen frei. Sobald eine für Sie dabei ist, steht sie hier und in der Leiste.'
          }
        />
      ) : (
        <section aria-labelledby="start-apps" className="mb-6" data-testid="uebersicht-apps">
          <h2 id="start-apps" className="mb-2 text-sm font-medium text-foreground">
            Ihre Apps
          </h2>
          <div className="grid grid-cols-1 gap-ui-2 min-[900px]:grid-cols-2 min-[1400px]:grid-cols-3">
            {eintraege.map(app => {
              const stand = standFuerKlick(app, zuletztStand[app.id]);
              const zahl = app.staende.reduce(
                (summe, st) => summe + (wartend?.[`${app.id}:${st}`] ?? 0),
                0
              );
              return (
                <AppKachel
                  key={app.id}
                  app={app}
                  wartend={zahl}
                  onOeffnen={() => oeffne({ type: 'app', appId: app.id, stand, title: app.name })}
                />
              );
            })}
          </div>
        </section>
      )}

      {hinweise}
    </div>
  );
}
