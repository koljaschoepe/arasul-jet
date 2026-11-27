/**
 * Was zur offenen App gehört, rechts in der Glasleiste (J60, `gestaltung.md`,
 * Fassung vom 27.11.2026, „Kopf und Popup“): der Umschalter Live und Test und
 * das Icon der Rückmeldung. Die Suche steht in der Leiste der Shell daneben.
 *
 * DER UMSCHALTER STEHT NUR DA, WO ES BEIDE FASSUNGEN GIBT. `GET /api/apps/meine`
 * nennt den Teststand nur, wer ihn sehen darf (Testperson); wer ihn nicht
 * darf, sieht hier nur das Icon. Das hier ist die EINE Stelle, an der man
 * zwischen Live und Test wechselt (`bausteine.py`, NAVIGATION_AUSNAHMEN).
 *
 * Die Kapsel gehört dem Rahmen, nicht der App: keine App bekommt dafür Code,
 * keine kann sie abschalten. Sie wird in den Platz der Glasleiste geschoben
 * (`leistenSlot` im Store), solange DIESE App offen ist; die Apps im
 * Hintergrund (`AppStapel`) lassen sie weg, sonst stünden sie doppelt da.
 * Gibt es die Leiste nicht (ein Test ohne Shell), steht sie am Platz.
 */
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Segmente } from '@marken';
import { useWorkspaceStore, type AppStand } from '@/stores/workspaceStore';

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
  const slot = useWorkspaceStore(s => s.leistenSlot);
  const offen = useWorkspaceStore(
    s =>
      s.ansicht.type === 'app' && s.ansicht.appId === appId && (s.ansicht.stand ?? 'live') === stand
  );
  const umschalter = staende.includes('live') && staende.includes('test');
  const inhalt = (
    <div className="flex items-center gap-1" data-testid="rahmen-kapsel">
      {umschalter && (
        <Segmente
          beschriftung="Fassung"
          wert={stand}
          onWaehlen={s =>
            s !== stand &&
            oeffne({ type: 'app', appId, stand: s as AppStand, title: name ?? undefined })
          }
          eintraege={[
            { id: 'live', titel: 'Live', beschriftung: 'Live' },
            { id: 'test', titel: 'Test', beschriftung: 'Test' },
          ]}
        />
      )}
      {children}
    </div>
  );
  if (!slot) return inhalt;
  return offen ? createPortal(inhalt, slot) : null;
}
