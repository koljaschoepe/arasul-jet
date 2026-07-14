/**
 * Arasul-Maskottchen — der lebendige Status-Anker im Agent-Chat (Plan 005 · Schritt 3).
 *
 * Zwei Pixel-Frames (idle = beide Augen offen, wink = zwinkert) werden gestapelt;
 * der Wink-Frame wird per CSS-Animation eingeblendet:
 *   - state="idle"     → seltenes Blinzeln, die KI ist bereit.
 *   - state="thinking" → schnelleres Zwinkern + sanftes Wippen, die KI arbeitet.
 * Respektiert `prefers-reduced-motion` (dann statisches Idle-Bild).
 */
import idleUrl from '@/assets/mascot/idle.png';
import winkUrl from '@/assets/mascot/wink.png';
import { cn } from '@/lib/utils';

export type MascotState = 'idle' | 'thinking';

interface MascotProps {
  state?: MascotState;
  className?: string;
  /** Barrierefreier Name; per Default aus dem Zustand abgeleitet. */
  label?: string;
}

export function Mascot({ state = 'idle', className, label }: MascotProps) {
  const thinking = state === 'thinking';
  return (
    <span
      className={cn(
        'relative inline-block shrink-0 select-none',
        thinking && 'animate-[mascot-bob_1.1s_ease-in-out_infinite] motion-reduce:animate-none',
        className
      )}
      data-testid="chat-mascot"
      data-state={state}
      role="img"
      aria-label={label ?? (thinking ? 'Arasul denkt nach' : 'Arasul')}
    >
      <img
        src={idleUrl}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="block h-full w-full"
      />
      <img
        src={winkUrl}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={cn(
          'pointer-events-none absolute inset-0 block h-full w-full opacity-0 motion-reduce:animate-none',
          thinking
            ? 'animate-[mascot-wink_1.1s_ease-in-out_infinite]'
            : 'animate-[mascot-blink_7s_ease-in-out_infinite]'
        )}
      />
    </span>
  );
}

export default Mascot;
