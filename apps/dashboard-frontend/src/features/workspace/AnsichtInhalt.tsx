import { Suspense, useEffect } from 'react';
import { Meldung } from '@marken';
import { ComponentErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SkeletonCard, SkeletonText } from '@/components/ui/Skeleton';
import { useWorkspaceStore, ansichtId, ansichtTitel, nurFuerAdmin } from '@/stores/workspaceStore';
import type { Ansicht } from '@/stores/workspaceStore';
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

/**
 * Der Hauptbereich: genau eine Ansicht, mit eigener ErrorBoundary — ein
 * Renderfehler darf die Shell nicht mitreißen.
 *
 * Bis M5 standen hier alle offenen Tabs, App-Tabs blieben versteckt gemountet.
 * Seit der Karte rahmen-aktivitaetsleiste ist genau eine Ansicht offen; eine
 * App, die man verlässt, fängt beim Zurückkommen von vorn an, bis die Karte
 * apps-im-hintergrund die letzten drei erhält.
 */
export function AnsichtInhalt() {
  const { user } = useAuth();
  const istAdmin = user?.role === 'admin';
  const ansicht = useWorkspaceStore(s => s.ansicht);
  const titel = ansichtTitel(ansicht);
  useVorladen(istAdmin);

  return (
    // Der Schlüssel baut beim Wechsel neu auf, auch von einer App zur anderen:
    // ein Fehler in der einen bleibt nicht an der nächsten hängen. Ein Bereich
    // der Verwaltung ist kein Wechsel der Ansicht.
    <div
      key={`${ansichtId(ansicht)}${ansicht.vorgang ? `:${ansicht.vorgang}` : ''}`}
      className="h-full min-h-0 overflow-auto"
      data-ansicht={ansicht.type}
    >
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
  );
}
