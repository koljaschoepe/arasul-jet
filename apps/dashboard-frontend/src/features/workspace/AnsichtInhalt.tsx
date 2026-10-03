import { Suspense } from 'react';
import { Meldung } from '@marken';
import { ComponentErrorBoundary } from '@/components/ui/ErrorBoundary';
import { SkeletonCard, SkeletonText } from '@/components/ui/Skeleton';
import { useWorkspaceStore, ansichtId, ansichtTitel, nurFuerAdmin } from '@/stores/workspaceStore';
import type { Ansicht } from '@/stores/workspaceStore';
import { useAuth } from '@/contexts/AuthContext';
import { Uebersicht } from '@/features/apps/Uebersicht';
import { AppRahmen } from '@/features/apps/AppRahmen';
import { OffeneFreigaben } from '@/features/freigaben/OffeneFreigaben';
import { useOffeneFreigaben } from '@/hooks/useOffeneFreigaben';
import { lazyNachladen } from '@/utils/lazyNachladen';

const Verwaltung = lazyNachladen(() => import('@/features/settings/Settings'));
const Einstellungen = lazyNachladen(() => import('@/features/einstellungen/Einstellungen'));
const ModelleAnsicht = lazyNachladen(() => import('@/features/modelle/ModelleAnsicht'));

/**
 * Die Startseite: die Übersicht, zusammengesetzt aus dem, was die Rolle sieht.
 *
 * SEIT J36 (02.10.2026) KEINE FREIGABENLISTE FÜR DEN MITARBEITER. Eine
 * Freigabe steht in der App, in der sie entsteht; an der Kachel der App trägt
 * höchstens eine Zahl. Die Liste bleibt dem Administrator, der die Anfragen
 * aller Apps im Blick haben muss.
 */
function Startseite() {
  const { user } = useAuth();
  const { data } = useOffeneFreigaben();
  const wartend: Record<string, number> = {};
  for (const f of data ?? []) wartend[f.app_id] = (wartend[f.app_id] ?? 0) + 1;
  return (
    <Uebersicht
      wartend={wartend}
      freigaben={user?.role === 'admin' ? <OffeneFreigaben /> : undefined}
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
        <AppRahmen appId={ansicht.appId} stand={ansicht.stand ?? 'live'} />
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

  return (
    // Der Schlüssel baut beim Wechsel neu auf, auch von einer App zur anderen:
    // ein Fehler in der einen bleibt nicht an der nächsten hängen. Ein Bereich
    // der Verwaltung ist kein Wechsel der Ansicht.
    <div
      key={ansichtId(ansicht)}
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
