import { useEffect } from 'react';
import { House, SquareTerminal } from '@marken/symbole';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@marken';
import { useAuth } from '@/contexts/AuthContext';
import { istPalettenTaste, useWorkspaceStore, type Ansicht } from '@/stores/workspaceStore';
import { useMeineApps, zuLeiste, ordneLeiste, useAppReihenfolge } from '@/features/apps/meineApps';
import { SETTINGS_SECTIONS } from '@/features/settings/sections';
import { BEREICHE } from '@/features/einstellungen/bereiche';
import { AppSymbol } from '@/components/AppSymbol';
import { standFuerKlick } from './standFuerKlick';

/**
 * Die Befehlspalette (Karte palette-symbol-und-demo, J51, `gestaltung.md`,
 * „Neue Bausteine der Bibliothek"): eine Tastenkombination (⌘K, Strg+K)
 * öffnet ein Feld, das zu jeder freigegebenen App, jeder Seite der
 * Verwaltung und jeder Seite der Einstellungen springt.
 *
 * GANZ MIT DER TASTATUR: tippen engt ein, Pfeile wählen, Enter springt, Esc
 * schließt (`cmdk` über `CommandDialog` der Bibliothek). Die Tastenkombination
 * gilt auch, wenn der Fokus in einer App liegt: `AppRahmen` hört am Dokument
 * im Rahmen mit. Am Handy öffnet sie „Mehr" › „Springen zu …".
 *
 * Sie ist Glas, weil sie schwebt, und die eine Glasfläche, die zur Leiste und
 * zur Kapsel dazukommt; der Schleier darunter ist deshalb schlicht.
 *
 * Was hier steht, folgt denselben Regeln wie die Leiste: Verwaltung nur für
 * den Administrator, Terminal nur für Entwickler, jede App genau einmal (ein
 * Klick öffnet die zuletzt benutzte Fassung), die Testfassung als eigener
 * Eintrag nur, wo es sie gibt.
 */
export function Befehlspalette() {
  const { user } = useAuth();
  const istAdmin = user?.role === 'admin';
  const istEntwickler = user?.entwickler === true;
  const offen = useWorkspaceStore(s => s.paletteOffen);
  const setzePalette = useWorkspaceStore(s => s.setzePalette);
  const oeffne = useWorkspaceStore(s => s.oeffne);
  const zuletztStand = useWorkspaceStore(s => s.zuletztStand);
  const { data: apps } = useMeineApps();
  const { reihenfolge } = useAppReihenfolge();
  const eintraege = ordneLeiste(zuLeiste(apps ?? []), reihenfolge);

  useEffect(() => {
    const taste = (ev: KeyboardEvent) => {
      if (!istPalettenTaste(ev)) return;
      ev.preventDefault();
      setzePalette(!useWorkspaceStore.getState().paletteOffen);
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [setzePalette]);

  const geh = (a: Ansicht) => {
    setzePalette(false);
    oeffne(a);
  };

  return (
    <CommandDialog
      open={offen}
      onOpenChange={setzePalette}
      titel="Springen zu"
      beschreibung="Tippen, um eine App oder Seite zu finden. Pfeile wählen, Enter öffnet, Esc schließt."
      inhaltKennzeichen="befehlspalette"
    >
      <CommandInput placeholder="App oder Seite suchen …" data-testid="befehlspalette-feld" />
      <CommandList>
        <CommandEmpty>Nichts gefunden.</CommandEmpty>
        <CommandGroup heading="Apps">
          <CommandItem
            value="Startseite Start"
            onSelect={() => geh({ type: 'dashboard' })}
            data-testid="palette-startseite"
          >
            <House aria-hidden="true" />
            Startseite
          </CommandItem>
          {eintraege.map(e => (
            <CommandItem
              key={e.id}
              value={`${e.name} ${e.id}`}
              onSelect={() =>
                geh({
                  type: 'app',
                  appId: e.id,
                  stand: standFuerKlick(e, zuletztStand[e.id]),
                  title: e.name,
                })
              }
              data-testid={`palette-app-${e.id}`}
            >
              <AppSymbol symbol={e.symbol} klasse="size-4" />
              {e.name}
            </CommandItem>
          ))}
          {eintraege
            .filter(e => e.staende.includes('live') && e.staende.includes('test'))
            .map(e => (
              <CommandItem
                key={`${e.id}-test`}
                value={`${e.name} Test Testfassung ${e.id}`}
                onSelect={() => geh({ type: 'app', appId: e.id, stand: 'test', title: e.name })}
                data-testid={`palette-app-${e.id}-test`}
              >
                <AppSymbol symbol={e.symbol} klasse="size-4" />
                {e.name}
                <CommandShortcut>Test</CommandShortcut>
              </CommandItem>
            ))}
          {istEntwickler && (
            <CommandItem
              value="Terminal"
              onSelect={() => geh({ type: 'terminal' })}
              data-testid="palette-terminal"
            >
              <SquareTerminal aria-hidden="true" />
              Terminal
            </CommandItem>
          )}
        </CommandGroup>
        {istAdmin && (
          <CommandGroup heading="Verwaltung">
            {SETTINGS_SECTIONS.map(b => (
              <CommandItem
                key={b.id}
                value={`Verwaltung ${b.label}`}
                onSelect={() => geh({ type: 'verwaltung', bereich: b.id })}
                data-testid={`palette-verwaltung-${b.id}`}
              >
                {b.icon}
                {b.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Einstellungen">
          {BEREICHE.map(b => (
            <CommandItem
              key={b.id}
              value={`Einstellungen ${b.name}`}
              onSelect={() => geh({ type: 'settings', bereich: b.id })}
              data-testid={`palette-einstellungen-${b.id}`}
            >
              {b.symbol}
              {b.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
