import { Dock, DockEintrag } from '@marken';
import { useOffeneFreigaben } from '@/hooks/useOffeneFreigaben';
import { useWorkspaceStore } from '@/stores/workspaceStore';

/** Zu einer Stelle der Startseite springen, sobald sie steht. */
function springeZu(id: string) {
  const ruhig = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // Die Startseite baut sich erst auf, wenn die Ansicht gewechselt hat.
  window.setTimeout(() => {
    const ziel = document.getElementById(id);
    ziel?.scrollIntoView?.({ behavior: ruhig ? 'auto' : 'smooth', block: 'start' });
    ziel?.focus({ preventScroll: true });
  }, 60);
}

/**
 * Das Dock der App (J60, `gestaltung.md`, Fassung vom 27.11.2026): Glaspille
 * mittig unten mit gleitender Markierung. Start, Für Sie (die Zahl der
 * Freigaben, die bei mir liegen, ohne Zahl keine Marke), Plus mittig, Store,
 * Zuletzt. „Für Sie“ und „Zuletzt“ sind Stellen auf der Startseite, keine
 * eigenen Ansichten: sie öffnen sie und rollen dorthin.
 */
export function SchalenDock() {
  const ansicht = useWorkspaceStore(s => s.ansicht);
  const oeffne = useWorkspaceStore(s => s.oeffne);
  const setzePalette = useWorkspaceStore(s => s.setzePalette);
  const { data } = useOffeneFreigaben();

  const aufStart = (id?: string) => {
    oeffne({ type: 'dashboard' });
    if (id) springeZu(id);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[max(16px,env(safe-area-inset-bottom))] z-40 flex justify-center">
      <div className="pointer-events-auto">
        <Dock kennzeichen="schale-dock">
          <DockEintrag
            symbol="start"
            beschriftung="Start"
            aktiv={ansicht.type === 'dashboard'}
            onKlick={() => aufStart()}
            kennzeichen="dock-start"
          />
          <DockEintrag
            symbol="fuerSie"
            beschriftung="Für Sie"
            zahl={data?.length}
            onKlick={() => aufStart('fuer-sie')}
            kennzeichen="dock-fuer-sie"
          />
          <DockEintrag
            symbol="plus"
            beschriftung="Neu"
            plus
            onKlick={() => setzePalette(true)}
            kennzeichen="dock-plus"
          />
          <DockEintrag
            symbol="store"
            beschriftung="Store"
            aktiv={ansicht.type === 'store'}
            onKlick={() => oeffne({ type: 'store' })}
            kennzeichen="dock-store"
          />
          <DockEintrag
            symbol="zuletzt"
            beschriftung="Zuletzt"
            onKlick={() => aufStart('zuletzt')}
            kennzeichen="dock-zuletzt"
          />
        </Dock>
      </div>
    </div>
  );
}
