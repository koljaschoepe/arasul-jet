/**
 * Die Kapsel oben rechts über jeder App (Karte glas-rahmen-und-leiste,
 * `gestaltung.md`, Rahmen): ein Stück Glas, 32 px hoch, darin der Umschalter
 * Live und Test und das Rückmelde-Icon.
 *
 * DER UMSCHALTER STEHT NUR DA, WO ES BEIDE FASSUNGEN GIBT. `GET /api/apps/meine`
 * nennt den Teststand nur, wer ihn sehen darf (Testperson); wer ihn nicht
 * darf, sieht hier nur das Icon. Seit dieser Karte steht jede App genau einmal
 * in der Leiste, und das hier ist die EINE Stelle, an der man zwischen Live
 * und Test wechselt (`bausteine.py`, NAVIGATION_AUSNAHMEN).
 *
 * Die Kapsel gehört dem Rahmen, nicht der App: keine App bekommt dafür Code,
 * keine kann sie abschalten.
 */
import type { ReactNode } from 'react';
import { cn } from '@marken';
import { useWorkspaceStore, type AppStand } from '@/stores/workspaceStore';

const NAMEN: Record<AppStand, string> = { live: 'Live', test: 'Test' };

interface KapselProps {
  appId: string;
  name: string | null;
  stand: AppStand;
  /** Welche Fassungen dieser Mensch sehen darf. */
  staende: AppStand[];
  /** Das Rückmelde-Icon, vom Rahmen hereingereicht (es braucht den iframe). */
  children: ReactNode;
}

export function Kapsel({ appId, name, stand, staende, children }: KapselProps) {
  const oeffne = useWorkspaceStore(s => s.oeffne);
  const umschalter = staende.includes('live') && staende.includes('test');
  return (
    <div
      className="glas absolute top-2 right-2 z-20 flex h-8 items-center gap-1 rounded-full border px-1"
      data-testid="rahmen-kapsel"
    >
      {umschalter && (
        <>
          <div
            role="group"
            aria-label="Fassung"
            className="flex h-6 items-center rounded-full bg-muted p-0.5"
          >
            {(['live', 'test'] as const).map(s => (
              <button
                key={s}
                type="button"
                aria-pressed={stand === s}
                // Sichtbar 20 px, die Trefferfläche von 44 px legt `before:`.
                data-treffer-selbst=""
                data-testid={`kapsel-stand-${s}`}
                onClick={() =>
                  stand !== s && oeffne({ type: 'app', appId, stand: s, title: name ?? undefined })
                }
                className={cn(
                  'relative flex h-5 items-center rounded-full px-2.5 text-xs font-medium transition-colors duration-120 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                  'pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:top-1/2 pointer-coarse:before:min-h-11 pointer-coarse:before:-translate-y-1/2 pointer-coarse:before:content-[""]',
                  stand === s
                    ? s === 'test'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {NAMEN[s]}
              </button>
            ))}
          </div>
          <span className="h-4 w-px bg-border" aria-hidden="true" />
        </>
      )}
      {children}
    </div>
  );
}

/**
 * Der Rand der Testfassung: die Fläche der App trägt einen blauen Rand und
 * oben in der Mitte das Wort Test, damit niemand die Fassung, die noch nicht
 * gilt, mit der Livefassung verwechselt, auch wer keinen Umschalter hat.
 */
export function TestRand() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 rounded-[13px] border-2 border-primary"
      data-testid="ansicht-test-rand"
      aria-hidden="true"
    >
      <span
        className="absolute top-0 left-1/2 -translate-x-1/2 rounded-b-md bg-primary px-2 pb-0.5 text-xs leading-4 font-medium text-primary-foreground"
        data-testid="ansicht-test-wort"
      >
        Test
      </span>
    </div>
  );
}
