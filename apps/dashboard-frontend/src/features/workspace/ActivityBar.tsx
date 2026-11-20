import React, { useEffect, useRef, useState } from 'react';
import { House, LogOut, Settings, SlidersHorizontal, SquareTerminal } from '@marken/symbole';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  useSchmalesFenster,
} from '@marken';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspaceStore, ansichtId } from '@/stores/workspaceStore';
import {
  useMeineApps,
  zuLeiste,
  ordneLeiste,
  reihenfolgeSchluessel,
  useAppReihenfolge,
} from '@/features/apps/meineApps';
import { standFuerKlick } from './standFuerKlick';
import { PersonAvatar } from '@/components/PersonAvatar';
import { API_BASE } from '@/config/api';
import { AppSymbol } from '@/components/AppSymbol';
import { useOffeneFreigaben } from '@/hooks/useOffeneFreigaben';
import { LeisteUnten } from './LeisteUnten';
import { logoAdresse, useGeraetMarke } from '@/hooks/useGeraetMarke';

/**
 * Das Logo des Hauses über dem Haus (M5), falls der Administrator eines unter
 * Verwaltung, Gerät, Unternehmen hinterlegt hat. Kein Knopf: es führt nirgends
 * hin, es sagt nur, wessen Gerät das ist. Ohne Logo steht dort nichts, auch
 * kein Platzhalter. Lädt das Bild nicht, verschwindet es, statt als kaputtes
 * Bild stehen zu bleiben.
 */
function LogoDesHauses() {
  const { data } = useGeraetMarke();
  const [kaputt, setKaputt] = useState<string | null>(null);
  if (!data?.logo || kaputt === data.logo) return null;
  const stand = data.logo;
  return (
    <img
      src={logoAdresse(stand)}
      alt={data.firmenname ?? 'Logo'}
      title={data.firmenname ?? undefined}
      className="mb-1 size-7 shrink-0 object-contain"
      data-testid="leiste-logo"
      onError={() => setKaputt(stand)}
    />
  );
}

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
  'relative flex size-[36px] shrink-0 items-center justify-center rounded-md transition-colors duration-120 ease-out motion-reduce:transition-none';

function knopfKlasse(aktiv: boolean | undefined): string {
  return cn(
    KNOPF,
    aktiv
      ? 'bg-primary/14 text-primary'
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
  /** Zusätzliche Eigenschaften des Knopfs (Ziehen, Tastatur). */
  extra?: React.ButtonHTMLAttributes<HTMLButtonElement>;
}

function LeistenKnopf({ name, aktiv, onClick, kennzeichen, children, extra }: LeistenKnopfProps) {
  return (
    <MitName name={name}>
      <button
        type="button"
        aria-label={name}
        aria-current={aktiv ? 'page' : undefined}
        data-testid={kennzeichen}
        onClick={onClick}
        className={knopfKlasse(aktiv)}
        {...extra}
      >
        {children}
      </button>
    </MitName>
  );
}

/** Die Rolle in einem Wort, wie die Verwaltung sie nennt. */
function rolleText(rolle: string | undefined): string {
  return rolle === 'admin' ? 'Administrator' : 'Mitarbeiter';
}

/** Ein feiner Trenner zwischen zwei Abschnitten der Leiste. */
function Trenner() {
  return (
    <div
      className="my-1.5 h-px w-6 shrink-0 bg-border"
      role="separator"
      data-testid="leiste-trenner"
    />
  );
}

/**
 * Das Konto unten in der Leiste: eine runde Fläche mit dem eigenen Bild oder
 * dem Anfangsbuchstaben, darauf ein Menü mit Name, Rolle und „Abmelden“. Bis
 * zur Karte glas-rahmen-und-leiste stand es links in der Statuszeile; die
 * gibt es nicht mehr.
 */
function Konto({ onLogout }: { onLogout: () => Promise<void> | void }) {
  const { user } = useAuth();
  const name = user?.anzeigeName || user?.username || '';
  const bild = user?.hatBild ? `${API_BASE}/profil/bild` : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Konto: ${name}`}
        data-testid="workspace-benutzermenue"
        className="flex size-[36px] shrink-0 items-center justify-center rounded-full transition-colors duration-120 ease-out outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        <PersonAvatar name={name} bild={bild} className="size-7" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" sideOffset={10} className="min-w-48">
        <DropdownMenuLabel className="flex flex-col font-normal">
          <span className="truncate text-sm text-foreground" data-testid="konto-name">
            {name}
          </span>
          <span className="text-xs text-muted-foreground" data-testid="konto-rolle">
            {rolleText(user?.role)}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem data-testid="workspace-abmelden" onSelect={() => void onLogout()}>
          <LogOut aria-hidden="true" />
          Abmelden
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Die Aktivitätsleiste: das Einzige, was um eine Ansicht herum steht.
 *
 * Seit der Karte glas-rahmen-und-leiste (20.11.2026, `gestaltung.md`,
 * Rahmen) ein Stück Glas, das mit 8 px Abstand zum Rand auf dem Verlauf
 * schwebt, Radius 16 px, 52 px breit, in drei Abschnitten mit zwei feinen
 * Trennern:
 *
 *   oben    das Logo des Hauses (falls hinterlegt) und Start mit der Zahl
 *           offener Freigaben
 *   Mitte   die Apps, JEDE GENAU EINMAL, als Symbol mit dem Namen beim
 *           Überfahren; ab etwa zehn rollt dieser Teil. Live und Test einer
 *           App schaltet die Kapsel über der App um, nicht die Leiste; ein
 *           Klick hier öffnet die Fassung, die man zuletzt offen hatte.
 *   unten   Terminal (nur Rolle Entwickler), Verwaltung (nur Administrator),
 *           Einstellungen und das Konto mit dem Menü „Abmelden“.
 *
 * Bis dahin stand eine App mit Live- und Teststand zweimal da, und unten lief
 * eine Statuszeile mit Name, Datum und Uhrzeit.
 */
export function ActivityBar({ onLogout }: { onLogout: () => Promise<void> | void }) {
  // Unter 900 px steht die Leiste unten (`LeisteUnten`); die Aufteilung ist
  // dieselbe Schwelle wie überall im Produkt.
  return useSchmalesFenster() ? (
    <LeisteUnten onLogout={onLogout} />
  ) : (
    <LeisteLinks onLogout={onLogout} />
  );
}

function LeisteLinks({ onLogout }: { onLogout: () => Promise<void> | void }) {
  const { user } = useAuth();
  const istAdmin = user?.role === 'admin';
  const istEntwickler = user?.entwickler === true;
  const ansicht = useWorkspaceStore(s => s.ansicht);
  const oeffne = useWorkspaceStore(s => s.oeffne);
  const zuletztStand = useWorkspaceStore(s => s.zuletztStand);
  const aktivId = ansichtId(ansicht);
  const offeneApp = ansicht.type === 'app' ? ansicht.appId : undefined;
  const { data: apps } = useMeineApps();
  const { data: freigaben } = useOffeneFreigaben();
  const wartend = freigaben?.length ?? 0;
  const { reihenfolge, speichere } = useAppReihenfolge();
  const eintraege = ordneLeiste(zuLeiste(apps ?? []), reihenfolge);
  const leiste = useRef<HTMLDivElement>(null);
  const [ziehend, setZiehend] = useState<string | null>(null);
  const [ueber, setUeber] = useState<string | null>(null);
  const [angesagt, setAngesagt] = useState('');
  const fokus = useRef<string | null>(null);

  // Nach dem Verschieben mit der Tastatur steht der Fokus wieder auf dem Knopf:
  // der Browser verliert ihn, wenn React das Element umhängt.
  useEffect(() => {
    if (!fokus.current) return;
    leiste.current
      ?.querySelector<HTMLButtonElement>(`[data-schluessel="${fokus.current}"]`)
      ?.focus();
    fokus.current = null;
  });

  /** `von` an die Stelle von `nach` setzen und am Gerät speichern. */
  const verschiebe = (von: string, nach: number) => {
    const schluessel = eintraege.map(reihenfolgeSchluessel);
    const i = schluessel.indexOf(von);
    if (i < 0 || nach < 0 || nach >= schluessel.length || nach === i) return;
    schluessel.splice(i, 1);
    schluessel.splice(nach, 0, von);
    const ids = new Set(eintraege.map(e => e.id));
    const uebrige = reihenfolge.filter(k => !ids.has(k.split(':')[0] ?? ''));
    speichere([...schluessel, ...uebrige]);
    return nach;
  };

  return (
    <nav
      aria-label="Aktivitätsleiste"
      data-testid="aktivitaetsleiste"
      className="glas glas-grund flex h-full w-[52px] shrink-0 flex-col items-center rounded-2xl border py-2"
    >
      <div className="flex shrink-0 flex-col items-center gap-0.5" data-testid="leiste-oben">
        <LogoDesHauses />
        <LeistenKnopf
          name={wartend > 0 ? `Startseite, ${wartend} offen` : 'Startseite'}
          aktiv={aktivId === 'dashboard'}
          kennzeichen="leiste-startseite"
          onClick={() => oeffne({ type: 'dashboard' })}
        >
          <House className="size-[18px]" aria-hidden="true" />
          {wartend > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-xs leading-none font-medium text-primary-foreground"
              data-testid="leiste-freigaben-zahl"
              aria-hidden="true"
            >
              {wartend > 99 ? '99+' : wartend}
            </span>
          )}
        </LeistenKnopf>
      </div>

      <Trenner />

      <div
        className="flex min-h-0 w-full flex-1 flex-col items-center gap-0.5 overflow-x-hidden overflow-y-auto"
        data-testid="leiste-apps"
        ref={leiste}
      >
        {eintraege.map((e, index) => {
          const schluessel = reihenfolgeSchluessel(e);
          const aktiv = offeneApp === e.id;
          return (
            <LeistenKnopf
              key={e.id}
              name={e.name}
              aktiv={aktiv}
              kennzeichen={`leiste-app-${e.id}`}
              onClick={() =>
                oeffne({
                  type: 'app',
                  appId: e.id,
                  stand: standFuerKlick(e, zuletztStand[e.id]),
                  title: e.name,
                })
              }
              extra={{
                draggable: true,
                ['data-schluessel' as string]: schluessel,
                'aria-keyshortcuts': 'Alt+ArrowUp Alt+ArrowDown',
                className: cn(
                  knopfKlasse(aktiv),
                  ziehend === schluessel && 'opacity-40',
                  ueber === schluessel && ziehend !== schluessel && 'ring-2 ring-primary/50'
                ),
                onDragStart: ev => {
                  setZiehend(schluessel);
                  ev.dataTransfer.effectAllowed = 'move';
                  ev.dataTransfer.setData('text/plain', schluessel);
                },
                onDragOver: ev => {
                  if (!ziehend) return;
                  ev.preventDefault();
                  setUeber(schluessel);
                },
                onDrop: ev => {
                  ev.preventDefault();
                  if (ziehend) verschiebe(ziehend, index);
                  setZiehend(null);
                  setUeber(null);
                },
                onDragEnd: () => {
                  setZiehend(null);
                  setUeber(null);
                },
                // Tastatur-Alternative zum Ziehen: Alt + Pfeil nach oben/unten.
                onKeyDown: ev => {
                  if (!ev.altKey || (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown')) return;
                  ev.preventDefault();
                  const nach = verschiebe(schluessel, index + (ev.key === 'ArrowUp' ? -1 : 1));
                  if (nach !== undefined) {
                    fokus.current = schluessel;
                    setAngesagt(`${e.name}, Platz ${nach + 1} von ${eintraege.length}`);
                  }
                },
              }}
            >
              <AppSymbol symbol={e.symbol} />
            </LeistenKnopf>
          );
        })}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {angesagt}
      </p>

      <Trenner />

      <div className="flex shrink-0 flex-col items-center gap-0.5" data-testid="leiste-unten">
        {/* Das Terminal nur für die Rolle Entwickler (Karte terminal-im-frontend). */}
        {istEntwickler && (
          <LeistenKnopf
            name="Terminal"
            aktiv={aktivId === 'terminal'}
            kennzeichen="leiste-terminal"
            onClick={() => oeffne({ type: 'terminal' })}
          >
            <SquareTerminal className="size-[18px]" aria-hidden="true" />
          </LeistenKnopf>
        )}
        {istAdmin && (
          <LeistenKnopf
            name="Verwaltung"
            aktiv={aktivId === 'verwaltung'}
            kennzeichen="leiste-verwaltung"
            // Steht die Verwaltung schon da, bleibt der gewählte Bereich.
            onClick={() => aktivId !== 'verwaltung' && oeffne({ type: 'verwaltung' })}
          >
            <SlidersHorizontal className="size-[18px]" aria-hidden="true" />
          </LeistenKnopf>
        )}
        <LeistenKnopf
          name="Einstellungen"
          aktiv={aktivId === 'settings'}
          kennzeichen="leiste-einstellungen"
          // Wie bei der Verwaltung: stehen die Einstellungen schon da, bleibt der Bereich.
          onClick={() => aktivId !== 'settings' && oeffne({ type: 'settings' })}
        >
          <Settings className="size-[18px]" aria-hidden="true" />
        </LeistenKnopf>
        <div className="mt-1">
          <Konto onLogout={onLogout} />
        </div>
      </div>
    </nav>
  );
}
