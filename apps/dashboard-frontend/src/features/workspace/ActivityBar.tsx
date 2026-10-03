import React from 'react';
import { House, LogOut, Settings, SlidersHorizontal } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@marken';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspaceStore, ansichtId } from '@/stores/workspaceStore';
import { useMeineApps, zuEintraegen } from '@/features/apps/meineApps';
import { useOffeneFreigaben } from '@/hooks/useOffeneFreigaben';
import { PersonAvatar } from '@/components/PersonAvatar';
import { API_BASE } from '@/config/api';

/**
 * Die Form jedes Knopfs der Leiste (M5).
 *
 * AUSWAHL IST EINE GETÖNTE FLÄCHE, KEIN BALKEN (`frontend.md`, Gestaltung).
 * Seit H5 trug der aktive Knopf eine Linie am linken Rand, weil die Fläche
 * dieselbe war wie beim Überfahren und „hier bist du" und „hier ist die Maus"
 * gleich aussahen. Die Tönung löst das anders: gewählt ist Blau, überfahren ist
 * der neutrale Wisch — zwei Flächen, die sich nicht verwechseln lassen.
 *
 * Das Überfahren blendet in 120 ms ein; wer „weniger Bewegung" eingestellt
 * hat, bekommt es sofort.
 */
const KNOPF =
  'relative flex size-9 shrink-0 items-center justify-center rounded-md transition-colors duration-120 ease-out motion-reduce:transition-none';

function knopfKlasse(aktiv: boolean | undefined): string {
  return cn(
    KNOPF,
    aktiv
      ? 'bg-primary/12 text-primary'
      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
  );
}

/** Der Name steht beim Überfahren rechts daneben, und immer im `aria-label`. */
function MitName({ name, children }: { name: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{name}</TooltipContent>
    </Tooltip>
  );
}

interface LeistenKnopfProps {
  name: string;
  aktiv?: boolean;
  onClick: () => void;
  kennzeichen: string;
  children: React.ReactNode;
}

function LeistenKnopf({ name, aktiv, onClick, kennzeichen, children }: LeistenKnopfProps) {
  return (
    <MitName name={name}>
      <button
        type="button"
        aria-label={name}
        aria-current={aktiv ? 'page' : undefined}
        data-testid={kennzeichen}
        onClick={onClick}
        className={knopfKlasse(aktiv)}
      >
        {children}
      </button>
    </MitName>
  );
}

/**
 * Das Kürzel einer App, bis `app.json` ein Symbol nennt: die Anfänge von zwei
 * Wörtern, sonst die ersten zwei Buchstaben.
 */
export function appKuerzel(name: string): string {
  const woerter = name.trim().split(/\s+/).filter(Boolean);
  if (woerter.length >= 2) {
    return `${woerter[0]?.charAt(0) ?? ''}${woerter[1]?.charAt(0) ?? ''}`.toUpperCase();
  }
  const wort = woerter[0] ?? '?';
  return wort.charAt(0).toUpperCase() + wort.charAt(1).toLowerCase();
}

/** Bild und Menü der angemeldeten Person: der Name und Abmelden, sonst nichts. */
function Konto({ onLogout }: { onLogout: () => Promise<void> | void }) {
  const { user } = useAuth();
  const name = user?.anzeigeName ?? user?.username ?? '';
  const bild = user?.hatBild ? `${API_BASE}/profil/bild` : null;
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Konto"
        data-testid="workspace-benutzermenue"
        className={cn(KNOPF, 'hover:bg-accent')}
      >
        <PersonAvatar name={name} bild={bild} className="size-7" />
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-56 p-1 text-ui-sm">
        <p className="truncate px-2 py-1.5 font-medium text-foreground">{name || 'Angemeldet'}</p>
        <div className="my-1 h-px bg-border" aria-hidden="true" />
        <button
          type="button"
          data-testid="workspace-abmelden"
          onClick={() => {
            void onLogout();
          }}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-foreground transition-colors duration-120 ease-out hover:bg-accent motion-reduce:transition-none"
        >
          <LogOut className="size-3.5 shrink-0" aria-hidden="true" />
          Abmelden
        </button>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Die Aktivitätsleiste (M5): das Einzige, was um eine App herum steht.
 *
 * Oben das Haus zur Startseite mit der Zahl offener Freigaben, darunter die
 * freigegebenen Apps nur als Symbol — ab etwa zehn rollt dieser Teil, die
 * Knöpfe unten bleiben fest: Verwaltung (nur Administrator), Zahnrad (die
 * persönlichen Einstellungen) und das eigene Bild. Jeder Knopf öffnet genau
 * eine Ansicht im Hauptbereich; es gibt keine zweite Seitenleiste mehr, die
 * er auf- oder zuklappen könnte.
 *
 * Das Logo des Hauses gehört über das Haus, sobald es sich hinterlegen lässt;
 * bis dahin gibt es dafür keinen Ort am Gerät.
 *
 * Die Apps kommen aus `GET /api/apps/meine` — auch beim Administrator nur
 * die, die ihm freigegeben sind. Eine App mit Live- und Teststand steht
 * zweimal da (`zuEintraegen`), der Teststand mit „(Test)" im Namen.
 */
export function ActivityBar({ onLogout }: { onLogout: () => Promise<void> | void }) {
  const { user } = useAuth();
  const istAdmin = user?.role === 'admin';
  const ansicht = useWorkspaceStore(s => s.ansicht);
  const oeffne = useWorkspaceStore(s => s.oeffne);
  const aktivId = ansichtId(ansicht);
  const { data: apps } = useMeineApps();
  const { data: freigaben } = useOffeneFreigaben();
  const wartend = freigaben?.length ?? 0;
  const eintraege = zuEintraegen(apps ?? []);

  return (
    <nav
      aria-label="Aktivitätsleiste"
      data-testid="aktivitaetsleiste"
      className="flex h-full w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-background py-2"
    >
      <LeistenKnopf
        name={wartend > 0 ? `Startseite, ${wartend} offen` : 'Startseite'}
        aktiv={aktivId === 'dashboard'}
        kennzeichen="leiste-startseite"
        onClick={() => oeffne({ type: 'dashboard' })}
      >
        <House className="size-4.5" aria-hidden="true" />
        {wartend > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-ui-xs leading-none font-medium text-primary-foreground"
            data-testid="leiste-freigaben-zahl"
            aria-hidden="true"
          >
            {wartend > 99 ? '99+' : wartend}
          </span>
        )}
      </LeistenKnopf>

      <div
        className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-x-hidden overflow-y-auto"
        data-testid="leiste-apps"
      >
        {eintraege.map(e => {
          const id = ansichtId({ type: 'app', appId: e.id, stand: e.stand });
          const name = e.stand === 'test' ? `${e.name} (Test)` : e.name;
          return (
            <LeistenKnopf
              key={id}
              name={name}
              aktiv={aktivId === id}
              kennzeichen={`leiste-app-${e.id}-${e.stand}`}
              onClick={() => oeffne({ type: 'app', appId: e.id, stand: e.stand, title: e.name })}
            >
              <span className="text-ui-xs font-medium" aria-hidden="true">
                {appKuerzel(e.name)}
              </span>
              {e.stand === 'test' && (
                <span
                  className="absolute right-1 bottom-1 size-1.5 rounded-full bg-muted-foreground"
                  aria-hidden="true"
                />
              )}
            </LeistenKnopf>
          );
        })}
      </div>

      {istAdmin && (
        <LeistenKnopf
          name="Verwaltung"
          aktiv={aktivId === 'verwaltung'}
          kennzeichen="leiste-verwaltung"
          // Steht die Verwaltung schon da, bleibt der gewählte Bereich.
          onClick={() => aktivId !== 'verwaltung' && oeffne({ type: 'verwaltung' })}
        >
          <SlidersHorizontal className="size-4.5" aria-hidden="true" />
        </LeistenKnopf>
      )}
      <LeistenKnopf
        name="Einstellungen"
        aktiv={aktivId === 'settings'}
        kennzeichen="leiste-einstellungen"
        onClick={() => oeffne({ type: 'settings' })}
      >
        <Settings className="size-4.5" aria-hidden="true" />
      </LeistenKnopf>
      <Konto onLogout={onLogout} />
    </nav>
  );
}
