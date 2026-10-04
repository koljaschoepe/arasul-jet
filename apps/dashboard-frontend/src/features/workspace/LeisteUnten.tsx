import { useState } from 'react';
import { Ellipsis, House, LogOut, Settings, SlidersHorizontal } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger, cn } from '@marken';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspaceStore, ansichtId } from '@/stores/workspaceStore';
import {
  useMeineApps,
  zuEintraegen,
  ordneEintraege,
  useAppReihenfolge,
} from '@/features/apps/meineApps';
import { useOffeneFreigaben } from '@/hooks/useOffeneFreigaben';
import { PersonAvatar } from '@/components/PersonAvatar';
import { API_BASE } from '@/config/api';
import { AppSymbol, appKuerzel } from './AppSymbol';

/** Wie viele Apps neben dem Haus in der Leiste stehen; der Rest liegt unter „mehr". */
const APPS_IN_DER_LEISTE = 4;

const FELD =
  'relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs transition-colors duration-120 ease-out motion-reduce:transition-none';

function feldKlasse(aktiv: boolean): string {
  return cn(FELD, aktiv ? 'text-primary' : 'text-muted-foreground hover:text-foreground');
}

const ZEILE =
  'flex w-full min-h-11 items-center gap-3 rounded px-2 py-1.5 text-left text-sm text-foreground transition-colors duration-120 ease-out hover:bg-accent motion-reduce:transition-none';

/**
 * Die Aktivitätsleiste am Handy (M5, unter 900 px): dieselben Ziele wie die
 * Leiste links, als Zeile unten. Haus, die ersten vier Apps in der eigenen
 * Reihenfolge (die aus `useAppReihenfolge`, am Gerät gespeichert) und „mehr"
 * mit den übrigen Apps, Verwaltung, Einstellungen und dem Konto. Ziehen gibt es
 * hier nicht; sortiert wird am großen Bildschirm.
 */
export function LeisteUnten({ onLogout }: { onLogout: () => Promise<void> | void }) {
  const { user } = useAuth();
  const istAdmin = user?.role === 'admin';
  const ansicht = useWorkspaceStore(s => s.ansicht);
  const oeffne = useWorkspaceStore(s => s.oeffne);
  const aktivId = ansichtId(ansicht);
  const { data: apps } = useMeineApps();
  const { data: freigaben } = useOffeneFreigaben();
  const wartend = freigaben?.length ?? 0;
  const { reihenfolge } = useAppReihenfolge();
  const eintraege = ordneEintraege(zuEintraegen(apps ?? []), reihenfolge);
  const vorn = eintraege.slice(0, APPS_IN_DER_LEISTE);
  const rest = eintraege.slice(APPS_IN_DER_LEISTE);
  const [offen, setOffen] = useState(false);
  const name = user?.anzeigeName ?? user?.username ?? '';
  const bild = user?.hatBild ? `${API_BASE}/profil/bild` : null;

  const restId = rest.map(e => ansichtId({ type: 'app', appId: e.id, stand: e.stand }));
  const mehrAktiv = restId.includes(aktivId) || aktivId === 'verwaltung' || aktivId === 'settings';
  const geh = (a: Parameters<typeof oeffne>[0]) => {
    setOffen(false);
    oeffne(a);
  };

  return (
    <nav
      aria-label="Aktivitätsleiste"
      data-testid="aktivitaetsleiste"
      className="flex h-14 w-full shrink-0 items-stretch border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <button
        type="button"
        aria-label={wartend > 0 ? `Startseite, ${wartend} offen` : 'Startseite'}
        aria-current={aktivId === 'dashboard' ? 'page' : undefined}
        data-testid="leiste-startseite"
        onClick={() => oeffne({ type: 'dashboard' })}
        className={feldKlasse(aktivId === 'dashboard')}
      >
        <span className="relative">
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
        </span>
        <span className="max-w-full truncate">Start</span>
      </button>

      {vorn.map(e => {
        const id = ansichtId({ type: 'app', appId: e.id, stand: e.stand });
        const anzeige = e.stand === 'test' ? `(Test) ${e.name}` : e.name;
        return (
          <button
            key={id}
            type="button"
            aria-label={anzeige}
            aria-current={aktivId === id ? 'page' : undefined}
            data-testid={`leiste-app-${e.id}-${e.stand}`}
            onClick={() => oeffne({ type: 'app', appId: e.id, stand: e.stand, title: e.name })}
            className={feldKlasse(aktivId === id)}
          >
            <span className="flex size-5 items-center justify-center">
              <AppSymbol symbol={e.symbol} kuerzel={appKuerzel(e.name)} />
            </span>
            <span className="max-w-full truncate">{e.name}</span>
          </button>
        );
      })}

      <Popover open={offen} onOpenChange={setOffen}>
        <PopoverTrigger
          aria-label="Mehr"
          data-testid="leiste-mehr"
          className={feldKlasse(mehrAktiv || offen)}
        >
          <Ellipsis className="size-5" aria-hidden="true" />
          <span>Mehr</span>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          className="max-h-[70dvh] w-64 overflow-y-auto p-1"
          data-testid="leiste-mehr-menue"
        >
          {rest.map(e => {
            const id = ansichtId({ type: 'app', appId: e.id, stand: e.stand });
            return (
              <button
                key={id}
                type="button"
                data-testid={`leiste-app-${e.id}-${e.stand}`}
                aria-current={aktivId === id ? 'page' : undefined}
                onClick={() => geh({ type: 'app', appId: e.id, stand: e.stand, title: e.name })}
                className={cn(ZEILE, aktivId === id && 'bg-primary/12 text-primary')}
              >
                <span className="flex size-5 shrink-0 items-center justify-center">
                  <AppSymbol symbol={e.symbol} kuerzel={appKuerzel(e.name)} />
                </span>
                <span className="min-w-0 truncate">
                  {e.stand === 'test' ? `(Test) ${e.name}` : e.name}
                </span>
              </button>
            );
          })}
          {rest.length > 0 && <div className="my-1 h-px bg-border" aria-hidden="true" />}
          {istAdmin && (
            <button
              type="button"
              data-testid="leiste-verwaltung"
              aria-current={aktivId === 'verwaltung' ? 'page' : undefined}
              onClick={() =>
                aktivId === 'verwaltung' ? setOffen(false) : geh({ type: 'verwaltung' })
              }
              className={cn(ZEILE, aktivId === 'verwaltung' && 'bg-primary/12 text-primary')}
            >
              <SlidersHorizontal className="size-4.5 shrink-0" aria-hidden="true" />
              Verwaltung
            </button>
          )}
          <button
            type="button"
            data-testid="leiste-einstellungen"
            aria-current={aktivId === 'settings' ? 'page' : undefined}
            onClick={() => geh({ type: 'settings' })}
            className={cn(ZEILE, aktivId === 'settings' && 'bg-primary/12 text-primary')}
          >
            <Settings className="size-4.5 shrink-0" aria-hidden="true" />
            Einstellungen
          </button>
          <div className="my-1 h-px bg-border" aria-hidden="true" />
          <div
            className="flex min-h-11 items-center gap-3 px-2 py-1.5"
            data-testid="workspace-benutzermenue"
          >
            <PersonAvatar name={name} bild={bild} className="size-7 shrink-0" />
            <p className="min-w-0 truncate text-sm font-medium text-foreground">
              {name || 'Angemeldet'}
            </p>
          </div>
          <button
            type="button"
            data-testid="workspace-abmelden"
            onClick={() => {
              setOffen(false);
              void onLogout();
            }}
            className={ZEILE}
          >
            <LogOut className="size-4 shrink-0" aria-hidden="true" />
            Abmelden
          </button>
        </PopoverContent>
      </Popover>
    </nav>
  );
}
