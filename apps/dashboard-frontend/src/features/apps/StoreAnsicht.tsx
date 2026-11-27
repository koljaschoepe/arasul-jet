/**
 * Der Store (J60, `gestaltung.md`, Fassung vom 27.11.2026, „App-Start und
 * Store“): die Apps des Geräts nach Abteilung, ganz oben eine Reihe „Neu“.
 *
 * Jeder baut und reicht ein; eine neue App erscheint zuerst im Test, und ein
 * Admin gibt sie frei (Verwaltung, Apps). Wer den Test sehen darf, sieht sie
 * hier schon und erkennt sie am Wort „Im Test“.
 *
 * OFFEN: woher die Abteilung kommt. Ein Feld `abteilung` in `app.json` wäre
 * Kontrakt 15 (der Fingerabdruck in `appKontrakt.test.js` hält das fest, die
 * Entscheidung liegt bei Kolja); bis dahin liefert `GET /api/apps/meine` keine,
 * und jede App steht unter „Weitere“. Die Ansicht liest `abteilung`, sobald
 * es sie gibt.
 */
import { useEffect, useMemo } from 'react';
import { AppWindow } from '@marken/symbole';
import { Karte, Kopf, Leerzustand } from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { AppSymbol } from '@/components/AppSymbol';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { ersterSchrittSetzen } from './ersteSchritte';
import { standFuerKlick, useMeineApps, zuLeiste, type LeistenApp } from './meineApps';

/** Wie lange eine App „neu“ heißt. */
const NEU_TAGE = 14;
const WEITERE = 'Weitere';

export function istNeu(app: Pick<LeistenApp, 'seit'>, jetzt = Date.now()): boolean {
  if (!app.seit) return false;
  const t = Date.parse(app.seit);
  return Number.isFinite(t) && jetzt - t < NEU_TAGE * 86_400_000;
}

/** Die Apps je Abteilung, alphabetisch, „Weitere“ zuletzt. */
export function nachAbteilung(apps: LeistenApp[]): [string, LeistenApp[]][] {
  const karte = new Map<string, LeistenApp[]>();
  for (const a of apps) {
    const k = a.abteilung?.trim() || WEITERE;
    karte.set(k, [...(karte.get(k) ?? []), a]);
  }
  return [...karte.entries()].sort(([x], [y]) =>
    x === WEITERE ? 1 : y === WEITERE ? -1 : x.localeCompare(y, 'de')
  );
}

function AppKarte({ app }: { app: LeistenApp }) {
  const oeffne = useWorkspaceStore(s => s.oeffne);
  const zuletztStand = useWorkspaceStore(s => s.zuletztStand);
  const nurTest = !app.staende.includes('live');
  return (
    <Karte
      titel={app.name}
      symbol={<AppSymbol symbol={app.symbol} klasse="size-5" />}
      kennzeichen={`store-app-${app.id}`}
      onKlick={() =>
        oeffne({
          type: 'app',
          appId: app.id,
          stand: standFuerKlick(app, zuletztStand[app.id]),
          title: app.name,
        })
      }
    >
      {nurTest ? <span className="font-medium text-primary">Im Test</span> : (app.abteilung ?? '')}
    </Karte>
  );
}

function Reihe({ titel, apps, kennung }: { titel: string; apps: LeistenApp[]; kennung: string }) {
  return (
    <section aria-labelledby={kennung} className="mb-8" data-testid={kennung}>
      <h2 id={kennung} className="mb-2 text-sm font-medium text-foreground">
        {titel}
      </h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-ui-2">
        {apps.map(a => (
          <AppKarte key={`${kennung}-${a.id}`} app={a} />
        ))}
      </div>
    </section>
  );
}

export function StoreAnsicht() {
  const { data, isLoading } = useMeineApps();
  useEffect(() => ersterSchrittSetzen('store'), []);
  const apps = useMemo(() => zuLeiste(data ?? []), [data]);
  const neu = apps.filter(a => istNeu(a));
  const gruppen = nachAbteilung(apps);

  return (
    <div
      className="max-w-[100rem] px-[clamp(16px,4vw,24px)] pt-[10px] pb-6"
      data-testid="store-seite"
    >
      <Kopf titel="Store" beschreibung="Alle Apps Ihres Geräts, nach Abteilung." />
      {isLoading ? (
        <SkeletonText lines={3} />
      ) : apps.length === 0 ? (
        <Leerzustand
          symbol={<AppWindow />}
          titel="Noch keine App"
          beschreibung="Eine neue App erscheint zuerst im Test. Ein Administrator gibt sie frei."
        />
      ) : (
        <>
          {neu.length > 0 && <Reihe titel="Neu" apps={neu} kennung="store-neu" />}
          {gruppen.map(([abteilung, liste]) => (
            <Reihe
              key={abteilung}
              titel={abteilung}
              apps={liste}
              kennung={`store-abt-${abteilung}`}
            />
          ))}
        </>
      )}
    </div>
  );
}
