import { useState, type ReactNode } from 'react';
import {
  Ellipsis,
  House,
  LogOut,
  Settings,
  SlidersHorizontal,
  SquareTerminal,
} from '@marken/symbole';
import { Popover, PopoverContent, PopoverTrigger, cn } from '@marken';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspaceStore, ansichtId } from '@/stores/workspaceStore';
import { useMeineApps, zuLeiste, ordneLeiste, useAppReihenfolge } from '@/features/apps/meineApps';
import { useOffeneFreigaben } from '@/hooks/useOffeneFreigaben';
import { AppSymbol } from '@/components/AppSymbol';
import { standFuerKlick } from './standFuerKlick';

/** Wie viele Apps neben dem Haus in der Leiste stehen; der Rest liegt unter „Mehr". */
const APPS_IN_DER_LEISTE = 4;

/**
 * Ein Feld der Leiste. Ungewählt nur das Symbol (der Name steht im
 * `aria-label`), gewählt eine blau getönte Fläche mit Symbol UND Namen. So
 * wird kein Name abgeschnitten: der eine, der steht, bekommt den Platz, den
 * die übrigen als Symbol nicht brauchen, und bricht notfalls in eine zweite
 * Zeile um, statt mit Auslassungspunkten zu enden.
 */
function Feld({
  name,
  aktiv,
  kennzeichen,
  onClick,
  symbol,
}: {
  name: string;
  aktiv: boolean;
  kennzeichen: string;
  onClick: () => void;
  symbol: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={name}
      aria-current={aktiv ? 'page' : undefined}
      data-testid={kennzeichen}
      onClick={onClick}
      className={cn(
        'flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl transition-colors duration-120 ease-out motion-reduce:transition-none',
        aktiv
          ? 'max-w-[45%] shrink-0 bg-primary/14 px-3 text-primary'
          : 'flex-1 text-muted-foreground hover:text-foreground'
      )}
    >
      <span className="relative flex size-5 shrink-0 items-center justify-center">{symbol}</span>
      {aktiv && (
        <span className="min-w-0 text-left text-xs leading-tight font-medium break-words">
          {name}
        </span>
      )}
    </button>
  );
}

const ZEILE =
  'flex w-full min-h-11 items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors duration-120 ease-out hover:bg-accent motion-reduce:transition-none';

/**
 * Die Aktivitätsleiste am Handy (unter 900 px): dieselben Ziele wie die Leiste
 * links, als Glas, das unten mit Abstand zum Rand schwebt (Karte
 * glas-rahmen-und-leiste, `gestaltung.md`, Rahmen). Start, die ersten vier Apps
 * in der eigenen Reihenfolge, jede genau einmal, und „Mehr“ mit den übrigen
 * Apps, Terminal, Verwaltung, Einstellungen und „Abmelden“. Ziehen gibt es
 * hier nicht; sortiert wird am großen Bildschirm.
 */
export function LeisteUnten({ onLogout }: { onLogout: () => Promise<void> | void }) {
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
  const { reihenfolge } = useAppReihenfolge();
  const eintraege = ordneLeiste(zuLeiste(apps ?? []), reihenfolge);
  const vorn = eintraege.slice(0, APPS_IN_DER_LEISTE);
  const rest = eintraege.slice(APPS_IN_DER_LEISTE);
  const [offen, setOffen] = useState(false);
  const name = user?.anzeigeName || user?.username || '';

  const mehrAktiv =
    rest.some(e => e.id === offeneApp) ||
    aktivId === 'verwaltung' ||
    aktivId === 'settings' ||
    aktivId === 'terminal';
  const geh = (a: Parameters<typeof oeffne>[0]) => {
    setOffen(false);
    oeffne(a);
  };

  return (
    <nav
      aria-label="Aktivitätsleiste"
      data-testid="aktivitaetsleiste"
      className="glas glas-grund flex h-14 shrink-0 items-center gap-0.5 rounded-2xl border px-1.5"
    >
      <Feld
        name={wartend > 0 ? `Start, ${wartend} offen` : 'Start'}
        aktiv={aktivId === 'dashboard'}
        kennzeichen="leiste-startseite"
        onClick={() => oeffne({ type: 'dashboard' })}
        symbol={
          <>
            <House className="size-5" aria-hidden="true" />
            {wartend > 0 && (
              <span
                className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-xs leading-none font-medium text-primary-foreground"
                data-testid="leiste-freigaben-zahl"
                aria-hidden="true"
              >
                {wartend > 99 ? '99+' : wartend}
              </span>
            )}
          </>
        }
      />

      {vorn.map(e => (
        <Feld
          key={e.id}
          name={e.name}
          aktiv={offeneApp === e.id}
          kennzeichen={`leiste-app-${e.id}`}
          onClick={() =>
            oeffne({
              type: 'app',
              appId: e.id,
              stand: standFuerKlick(e, zuletztStand[e.id]),
              title: e.name,
            })
          }
          symbol={<AppSymbol symbol={e.symbol} klasse="size-5" />}
        />
      ))}

      <Popover open={offen} onOpenChange={setOffen}>
        <PopoverTrigger
          aria-label="Mehr"
          data-testid="leiste-mehr"
          aria-current={mehrAktiv ? 'page' : undefined}
          className={cn(
            'flex h-11 min-w-11 flex-1 items-center justify-center rounded-xl transition-colors duration-120 ease-out motion-reduce:transition-none',
            mehrAktiv || offen
              ? 'bg-primary/14 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Ellipsis className="size-5" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          sideOffset={10}
          className="max-h-[70dvh] w-64 overflow-y-auto p-1"
          data-testid="leiste-mehr-menue"
        >
          {rest.map(e => (
            <button
              key={e.id}
              type="button"
              data-testid={`leiste-app-${e.id}`}
              aria-current={offeneApp === e.id ? 'page' : undefined}
              onClick={() =>
                geh({
                  type: 'app',
                  appId: e.id,
                  stand: standFuerKlick(e, zuletztStand[e.id]),
                  title: e.name,
                })
              }
              className={cn(ZEILE, offeneApp === e.id && 'bg-primary/14 text-primary')}
            >
              <span className="flex size-5 shrink-0 items-center justify-center">
                <AppSymbol symbol={e.symbol} />
              </span>
              <span className="min-w-0 break-words">{e.name}</span>
            </button>
          ))}
          {rest.length > 0 && <div className="my-1 h-px bg-border" aria-hidden="true" />}
          {istEntwickler && (
            <button
              type="button"
              data-testid="leiste-terminal"
              aria-current={aktivId === 'terminal' ? 'page' : undefined}
              onClick={() => (aktivId === 'terminal' ? setOffen(false) : geh({ type: 'terminal' }))}
              className={cn(ZEILE, aktivId === 'terminal' && 'bg-primary/14 text-primary')}
            >
              <SquareTerminal className="size-[18px] shrink-0" aria-hidden="true" />
              Terminal
            </button>
          )}
          {istAdmin && (
            <button
              type="button"
              data-testid="leiste-verwaltung"
              aria-current={aktivId === 'verwaltung' ? 'page' : undefined}
              onClick={() =>
                aktivId === 'verwaltung' ? setOffen(false) : geh({ type: 'verwaltung' })
              }
              className={cn(ZEILE, aktivId === 'verwaltung' && 'bg-primary/14 text-primary')}
            >
              <SlidersHorizontal className="size-[18px] shrink-0" aria-hidden="true" />
              Verwaltung
            </button>
          )}
          <button
            type="button"
            data-testid="leiste-einstellungen"
            aria-current={aktivId === 'settings' ? 'page' : undefined}
            onClick={() => (aktivId === 'settings' ? setOffen(false) : geh({ type: 'settings' }))}
            className={cn(ZEILE, aktivId === 'settings' && 'bg-primary/14 text-primary')}
          >
            <Settings className="size-[18px] shrink-0" aria-hidden="true" />
            Einstellungen
          </button>
          <div className="my-1 h-px bg-border" aria-hidden="true" />
          <p
            className="px-2 pt-1 text-xs break-words text-muted-foreground"
            data-testid="konto-name"
          >
            {name}
          </p>
          <button
            type="button"
            data-testid="workspace-abmelden"
            onClick={() => {
              setOffen(false);
              void onLogout();
            }}
            className={ZEILE}
          >
            <LogOut className="size-[18px] shrink-0" aria-hidden="true" />
            Abmelden
          </button>
        </PopoverContent>
      </Popover>
    </nav>
  );
}
