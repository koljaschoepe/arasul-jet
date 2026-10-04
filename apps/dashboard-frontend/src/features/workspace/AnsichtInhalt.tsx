import { Suspense, useEffect, useRef, useState } from 'react';
import { Meldung } from '@marken';
import { ComponentErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SkeletonCard, SkeletonText } from '@/components/ui/Skeleton';
import { useWorkspaceStore, ansichtId, ansichtTitel, nurFuerAdmin } from '@/stores/workspaceStore';
import type { Ansicht, AppStand } from '@/stores/workspaceStore';
import { useAuth } from '@/contexts/AuthContext';
import { Uebersicht } from '@/features/apps/Uebersicht';
import { AppRahmen } from '@/features/apps/AppRahmen';
import { AdminHinweise } from './AdminHinweise';
import { OffeneFreigaben } from '@/features/freigaben/OffeneFreigaben';
import { useOffeneFreigaben } from '@/hooks/useOffeneFreigaben';
import { lazyMitVorladen } from '@/utils/lazyNachladen';

const Verwaltung = lazyMitVorladen(() => import('@/features/settings/Settings'));
const Einstellungen = lazyMitVorladen(() => import('@/features/einstellungen/Einstellungen'));
const ModelleAnsicht = lazyMitVorladen(() => import('@/features/modelle/ModelleAnsicht'));

/**
 * Die Ansichten hinter der Leiste laden, sobald die Shell ruht: jeder Wechsel
 * soll unter 200 ms bleiben (`frontend.md`, Gestaltung), auch der erste.
 * Die Verwaltung nur beim Administrator — ein Mitarbeiter öffnet sie nie.
 */
function useVorladen(istAdmin: boolean) {
  useEffect(() => {
    const laden = () => {
      void Einstellungen.vorladen();
      if (istAdmin) {
        void Verwaltung.vorladen();
        void ModelleAnsicht.vorladen();
      }
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(laden, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(laden, 1500);
    return () => window.clearTimeout(id);
  }, [istAdmin]);
}

/**
 * Die Startseite: die Übersicht mit „Für Sie" darüber.
 *
 * SEIT M5 (04.10.2026) „FÜR SIE" FÜR JEDEN: die Freigaben, die bei mir liegen
 * (frontend.md, Startseite). J36 hatte die Liste dem Administrator vorbehalten,
 * weil sie damals alle Anfragen aller Apps zeigte; seit eine Freigabe bei einer
 * Person liegt, sieht jeder nur seine. Die Zahl an der Kachel zählt dieselbe
 * Liste.
 */
function Startseite() {
  const { user } = useAuth();
  const { data } = useOffeneFreigaben();
  const wartend: Record<string, number> = {};
  for (const f of data ?? []) wartend[f.app_id] = (wartend[f.app_id] ?? 0) + 1;
  return (
    <Uebersicht
      wartend={wartend}
      freigaben={<OffeneFreigaben />}
      hinweise={user?.role === 'admin' ? <AdminHinweise /> : undefined}
    />
  );
}

/**
 * Die Weiche für den Inhalt der Ansicht. Die Shell ist die EINE Stelle, die
 * quer zusammensetzt (Regel des Ordners: `features/X/` importiert nichts aus
 * `features/Y/`) — deshalb bekommt die Übersicht die Freigaben und die
 * Verwaltung die Modelle hereingereicht, statt sie zu kennen.
 */
export function AnsichtWeiche({ ansicht }: { ansicht: Ansicht }) {
  switch (ansicht.type) {
    case 'dashboard':
      return <Startseite />;
    case 'app':
      // Ohne Kennung ist die Ansicht keine; `pfadZuAnsicht` lässt eine solche
      // gar nicht erst durch, `appId` ist im Typ aber optional.
      return ansicht.appId ? (
        <AppRahmen
          appId={ansicht.appId}
          stand={ansicht.stand ?? 'live'}
          vorgang={ansicht.vorgang}
        />
      ) : (
        <div className="p-ui-4">
          <Meldung art="warnung" titel="Diese Adresse zeigt auf keine App." />
        </div>
      );
    case 'settings':
      return <Einstellungen />;
    case 'verwaltung':
      return <Verwaltung modelle={<ModelleAnsicht />} />;
  }
}

/** Wie viele Apps im Hintergrund am Leben bleiben (frontend.md, Rahmen). */
const APPS_IM_HINTERGRUND = 3;

interface LebendeApp {
  appId: string;
  stand: AppStand;
  vorgang?: number;
  /** Wann sie in den Stapel kam: die Reihenfolge im DOM (siehe `AppStapel`). */
  seit: number;
}

const appSchluessel = (a: Pick<LebendeApp, 'appId' | 'stand'>) => `${a.appId}:${a.stand}`;

/**
 * Die zuletzt geöffneten Apps, die letzte zuerst, höchstens eine offene und
 * drei im Hintergrund. Die Liste wird beim Wechsel angepasst, noch bevor
 * gezeichnet wird (Zustand aus dem Vorrender abgeleitet), damit eine App nie
 * einen Augenblick ohne Rahmen dasteht.
 *
 * Ein Vorgang (`?freigabe=`) lädt den Rahmen neu, ein Wechsel ohne Vorgang
 * nicht: kommt jemand zu einer App im Hintergrund zurück, bleibt ihr Vorgang
 * stehen und mit ihm Eingaben und Scrollstand.
 */
function useLebendeApps(ansicht: Ansicht): LebendeApp[] {
  const [liste, setListe] = useState<LebendeApp[]>([]);
  const zaehler = useRef(0);
  if (ansicht.type === 'app' && ansicht.appId) {
    const neu = { appId: ansicht.appId, stand: ansicht.stand ?? 'live' };
    const alt = liste.find(a => appSchluessel(a) === appSchluessel(neu));
    const vorgang = ansicht.vorgang ?? alt?.vorgang;
    if (!alt || liste[0] !== alt || alt.vorgang !== vorgang) {
      setListe(
        [
          { ...neu, ...(vorgang ? { vorgang } : {}), seit: alt?.seit ?? ++zaehler.current },
          ...liste.filter(a => appSchluessel(a) !== appSchluessel(neu)),
        ].slice(0, APPS_IM_HINTERGRUND + 1)
      );
    }
  }
  // Steht keine App offen, zählen nur die drei im Hintergrund: die vierte
  // fällt hier endgültig heraus, sie darf bei der nächsten App nicht als
  // frischer, nie geöffneter Rahmen wiederkehren.
  if (ansicht.type !== 'app' && liste.length > APPS_IM_HINTERGRUND) {
    setListe(liste.slice(0, APPS_IM_HINTERGRUND));
  }
  return ansicht.type === 'app' ? liste : liste.slice(0, APPS_IM_HINTERGRUND);
}

/**
 * Alle lebenden Apps nebeneinander im selben Platz, nur die offene sichtbar.
 *
 * `invisible` und nicht `hidden`: das Dokument im Rahmen behält seine Größe,
 * also auch seinen Scrollstand, und läuft ohne Neuaufbau weiter. Unsichtbar
 * heißt hier auch: nicht fokussierbar, nicht anklickbar (`inert`).
 */
function AppStapel({ apps, aktiv }: { apps: LebendeApp[]; aktiv: string | null }) {
  // IN DER REIHENFOLGE DES ERSTEN ÖFFNENS, nicht des letzten Gebrauchs: React
  // hängt umsortierte Kinder im DOM um, und ein umgehängter iframe lädt neu —
  // Eingabe und Scrollstand wären weg, genau was hier bleiben soll.
  const geordnet = [...apps].sort((x, y) => x.seit - y.seit);
  return (
    <>
      {geordnet.map(a => {
        const offen = appSchluessel(a) === aktiv;
        return (
          <div
            key={appSchluessel(a)}
            className={offen ? 'h-full min-h-0' : 'invisible absolute inset-0 h-full'}
            inert={!offen}
            aria-hidden={!offen}
            data-testid={`app-stapel-${a.appId}-${a.stand}`}
            data-sichtbar={offen}
          >
            <ComponentErrorBoundary componentName={`App ${a.appId}`}>
              <AppRahmen appId={a.appId} stand={a.stand} vorgang={a.vorgang} />
            </ComponentErrorBoundary>
          </div>
        );
      })}
    </>
  );
}

/**
 * Der Hauptbereich: genau eine Ansicht, mit eigener ErrorBoundary — ein
 * Renderfehler darf die Shell nicht mitreißen.
 *
 * Bis M5 standen hier alle offenen Tabs, App-Tabs blieben versteckt gemountet.
 * Seit der Karte rahmen-aktivitaetsleiste ist genau eine Ansicht offen; seit
 * apps-im-hintergrund bleiben die letzten drei Apps, die man verlassen hat,
 * verborgen am Leben (`AppStapel`), mit Eingaben und Scrollstand. Die vierte
 * fällt heraus und fängt beim Zurückkommen von vorn an.
 */
export function AnsichtInhalt() {
  const { user } = useAuth();
  const istAdmin = user?.role === 'admin';
  const ansicht = useWorkspaceStore(s => s.ansicht);
  const titel = ansichtTitel(ansicht);
  useVorladen(istAdmin);
  const lebende = useLebendeApps(ansicht);
  const istApp = ansicht.type === 'app' && !!ansicht.appId;
  const aktiveApp = istApp
    ? appSchluessel({ appId: ansicht.appId!, stand: ansicht.stand ?? 'live' })
    : null;

  return (
    // Die Apps stehen im Stapel, jede mit eigener Fehlergrenze. Der Schlüssel
    // der übrigen Ansichten baut beim Wechsel neu auf: ein Fehler in der einen
    // bleibt nicht an der nächsten hängen. Ein Bereich der Verwaltung ist kein
    // Wechsel der Ansicht.
    <div className="relative h-full min-h-0" data-ansicht={ansicht.type}>
      <AppStapel apps={lebende} aktiv={aktiveApp} />
      {!istApp && (
        <div key={ansichtId(ansicht)} className="h-full min-h-0 overflow-auto">
          <ComponentErrorBoundary componentName={`Ansicht ${titel}`}>
            {/* Die Shell öffnet eine Admin-Ansicht für einen Mitarbeiter gar
            nicht erst; dieser Satz fängt nur den Augenblick, in dem die Rolle
            gewechselt hat und die Adresse noch nicht. */}
            {!istAdmin && nurFuerAdmin(ansicht.type) ? (
              <div className="p-ui-4" data-testid="ansicht-nur-admin">
                <Meldung titel={`Die ${titel} verwaltet Ihr Administrator.`}>
                  Soll hier etwas anders sein, sprechen Sie ihn an.
                </Meldung>
              </div>
            ) : (
              <Suspense
                fallback={
                  <div className="flex flex-col gap-6 p-6 animate-in fade-in">
                    <SkeletonText lines={2} width="40%" />
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <SkeletonCard hasAvatar={false} lines={3} />
                      <SkeletonCard hasAvatar={false} lines={3} />
                    </div>
                  </div>
                }
              >
                <AnsichtWeiche ansicht={ansicht} />
              </Suspense>
            )}
          </ComponentErrorBoundary>
        </div>
      )}
    </div>
  );
}
