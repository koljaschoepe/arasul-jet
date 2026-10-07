import React, { useEffect, useRef, useState } from 'react';
import { House, Settings, SlidersHorizontal } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, cn, useSchmalesFenster } from '@marken';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspaceStore, ansichtId } from '@/stores/workspaceStore';
import {
  useMeineApps,
  zuEintraegen,
  ordneEintraege,
  reihenfolgeSchluessel,
  useAppReihenfolge,
} from '@/features/apps/meineApps';
import { AppSymbol, appKuerzel } from './AppSymbol';
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
      className="mb-1 size-8 shrink-0 object-contain"
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

export { appKuerzel };

/**
 * Die Aktivitätsleiste (M5): das Einzige, was um eine App herum steht.
 *
 * Oben das Haus zur Startseite mit der Zahl offener Freigaben, darunter die
 * freigegebenen Apps nur als Symbol — ab etwa zehn rollt dieser Teil, die
 * Knöpfe unten bleiben fest: Verwaltung (nur Administrator) und Zahnrad (die
 * persönlichen Einstellungen). Das eigene Bild steht seit dem 07.10.2026 nicht
 * mehr hier, sondern links in der Fußzeile mit Name, Rolle und dem Menü
 * „Abmelden" (`StatusBar`); unten in der Leiste wirkte es wie ein dritter
 * Bereich. Jeder Knopf öffnet genau
 * eine Ansicht im Hauptbereich; es gibt keine zweite Seitenleiste mehr, die
 * er auf- oder zuklappen könnte.
 *
 * Ganz oben das Logo des Hauses, falls eines hinterlegt ist (`LogoDesHauses`,
 * Verwaltung, Gerät, Unternehmen).
 *
 * Die Apps kommen aus `GET /api/apps/meine` — auch beim Administrator nur
 * die, die ihm freigegeben sind. Eine App mit Live- und Teststand steht
 * zweimal da (`zuEintraegen`), der Teststand als „(Test) Name" (M5).
 */
export function ActivityBar() {
  // Unter 900 px steht die Leiste unten (`LeisteUnten`); die Aufteilung ist
  // dieselbe Schwelle wie überall im Produkt.
  return useSchmalesFenster() ? <LeisteUnten /> : <LeisteLinks />;
}

function LeisteLinks() {
  const { user } = useAuth();
  const istAdmin = user?.role === 'admin';
  const ansicht = useWorkspaceStore(s => s.ansicht);
  const oeffne = useWorkspaceStore(s => s.oeffne);
  const aktivId = ansichtId(ansicht);
  const { data: apps } = useMeineApps();
  const { data: freigaben } = useOffeneFreigaben();
  const wartend = freigaben?.length ?? 0;
  const { reihenfolge, speichere } = useAppReihenfolge();
  const eintraege = ordneEintraege(zuEintraegen(apps ?? []), reihenfolge);
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
    const uebrige = reihenfolge.filter(k => !schluessel.includes(k));
    speichere([...schluessel, ...uebrige]);
    return nach;
  };

  return (
    <nav
      aria-label="Aktivitätsleiste"
      data-testid="aktivitaetsleiste"
      className="flex h-full w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-background py-2"
    >
      <LogoDesHauses />
      <LeistenKnopf
        name={wartend > 0 ? `Startseite, ${wartend} offen` : 'Startseite'}
        aktiv={aktivId === 'dashboard'}
        kennzeichen="leiste-startseite"
        onClick={() => oeffne({ type: 'dashboard' })}
      >
        <House className="size-4.5" aria-hidden="true" />
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

      <div
        className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-x-hidden overflow-y-auto"
        data-testid="leiste-apps"
        ref={leiste}
      >
        {eintraege.map((e, index) => {
          const id = ansichtId({ type: 'app', appId: e.id, stand: e.stand });
          const schluessel = reihenfolgeSchluessel(e);
          const name = e.stand === 'test' ? `(Test) ${e.name}` : e.name;
          return (
            <LeistenKnopf
              key={id}
              name={name}
              aktiv={aktivId === id}
              kennzeichen={`leiste-app-${e.id}-${e.stand}`}
              onClick={() => oeffne({ type: 'app', appId: e.id, stand: e.stand, title: e.name })}
              extra={{
                draggable: true,
                ['data-schluessel' as string]: schluessel,
                'aria-keyshortcuts': 'Alt+ArrowUp Alt+ArrowDown',
                className: cn(
                  knopfKlasse(aktivId === id),
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
                    setAngesagt(`${name}, Platz ${nach + 1} von ${eintraege.length}`);
                  }
                },
              }}
            >
              <AppSymbol symbol={e.symbol} kuerzel={appKuerzel(e.name)} />
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
      <p className="sr-only" role="status" aria-live="polite">
        {angesagt}
      </p>

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
        // Wie bei der Verwaltung: stehen die Einstellungen schon da, bleibt der Bereich.
        onClick={() => aktivId !== 'settings' && oeffne({ type: 'settings' })}
      >
        <Settings className="size-4.5" aria-hidden="true" />
      </LeistenKnopf>
    </nav>
  );
}
