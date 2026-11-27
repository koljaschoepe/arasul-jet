import { useEffect, useState } from 'react';
import { Popup, PopupEintrag, PopupGruppe } from '@marken';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { istPalettenTaste, useWorkspaceStore, type Ansicht } from '@/stores/workspaceStore';
import { useMeineApps, zuLeiste, ordneLeiste, useAppReihenfolge } from '@/features/apps/meineApps';
import { SETTINGS_SECTIONS } from '@/features/settings/sections';
import { BEREICHE } from '@/features/einstellungen/bereiche';
import { standFuerKlick } from './standFuerKlick';

/**
 * Die Popup-Suche (J60, `gestaltung.md`, Fassung vom 27.11.2026, „Kopf und
 * Popup“): Glas im oberen Drittel, geöffnet mit dem Icon in der Leiste, mit
 * Cmd+K, Strg+K und „/“. Sie ersetzt die Befehlspalette (J51).
 *
 * Vier Gruppen: Apps, Befehle, Konto, und die Verwaltung nur für Admins
 * (Personen, Rechte, neue Apps). Die Gruppe „Datensätze“ kommt mit der Karte
 * suche-ueber-app-inhalte (J58). Ausblenden ist hier keine Berechtigung: die
 * Verwaltung antwortet einem Mitarbeiter im Backend mit 403.
 */
export function Suche({ onLogout }: { onLogout: () => Promise<void> | void }) {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const istAdmin = user?.role === 'admin';
  const istEntwickler = user?.entwickler === true;
  const offen = useWorkspaceStore(s => s.paletteOffen);
  const setzePalette = useWorkspaceStore(s => s.setzePalette);
  const oeffne = useWorkspaceStore(s => s.oeffne);
  const zuletztStand = useWorkspaceStore(s => s.zuletztStand);
  const { data: apps } = useMeineApps();
  const { reihenfolge } = useAppReihenfolge();
  const eintraege = ordneLeiste(zuLeiste(apps ?? []), reihenfolge);
  const [frage, setFrage] = useState('');

  useEffect(() => {
    const taste = (ev: KeyboardEvent) => {
      if (!istPalettenTaste(ev)) return;
      ev.preventDefault();
      setzePalette(!useWorkspaceStore.getState().paletteOffen);
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [setzePalette]);

  // Beim Schließen leeren: die nächste Suche fängt von vorn an.
  useEffect(() => {
    if (!offen) setFrage('');
  }, [offen]);

  const geh = (a: Ansicht) => {
    setzePalette(false);
    oeffne(a);
  };

  const trifft = (...worte: string[]) => {
    const f = frage.trim().toLowerCase();
    return !f || worte.join(' ').toLowerCase().includes(f);
  };

  const alleBefehle = (() => {
    const befehle: {
      id: string;
      titel: string;
      symbol: 'plus' | 'start' | 'einstellungen' | 'store';
      tu: () => void;
      kuerzel?: string;
    }[] = [
      {
        id: 'start',
        titel: 'Zur Startseite',
        symbol: 'start',
        tu: () => geh({ type: 'dashboard' }),
      },
      { id: 'store', titel: 'Store öffnen', symbol: 'store', tu: () => geh({ type: 'store' }) },
      {
        id: 'darstellung',
        titel: theme === 'dark' ? 'Hell einschalten' : 'Dunkel einschalten',
        symbol: 'einstellungen',
        tu: () => {
          setzePalette(false);
          void setTheme(theme === 'dark' ? 'light' : 'dark');
        },
      },
    ];
    if (istEntwickler) {
      befehle.push({
        id: 'terminal',
        titel: 'Terminal öffnen',
        symbol: 'einstellungen',
        tu: () => geh({ type: 'terminal' }),
      });
    }
    return befehle;
  })();

  const apps_ = eintraege.filter(e => trifft(e.name, e.id));
  const befehle = alleBefehle.filter(b => trifft(b.titel));
  const konto = [
    ...BEREICHE.map(b => ({
      id: `einstellungen-${b.id}`,
      titel: b.name,
      unter: 'Einstellungen',
      tu: () => geh({ type: 'settings', bereich: b.id }),
    })),
    {
      id: 'abmelden',
      titel: 'Abmelden',
      unter: undefined as string | undefined,
      tu: () => {
        setzePalette(false);
        void onLogout();
      },
    },
  ].filter(k => trifft(k.titel, k.unter ?? '', 'konto'));
  const verwaltung = istAdmin ? SETTINGS_SECTIONS.filter(b => trifft(b.label, 'verwaltung')) : [];
  const leer = !apps_.length && !befehle.length && !konto.length && !verwaltung.length;

  return (
    <Popup
      offen={offen}
      onSchliessen={() => setzePalette(false)}
      titel="Suche"
      suche={{ wert: frage, onAendern: setFrage, platzhalter: 'Apps, Befehle, Konto suchen' }}
      leer={leer}
      kennzeichen="suche-popup"
    >
      {apps_.length > 0 && (
        <PopupGruppe titel="Apps">
          {apps_.map(e => (
            <PopupEintrag
              key={e.id}
              app
              symbol="angebote"
              titel={e.name}
              onWaehlen={() =>
                geh({
                  type: 'app',
                  appId: e.id,
                  stand: standFuerKlick(e, zuletztStand[e.id]),
                  title: e.name,
                })
              }
            />
          ))}
        </PopupGruppe>
      )}
      {befehle.length > 0 && (
        <PopupGruppe titel="Befehle">
          {befehle.map(b => (
            <PopupEintrag key={b.id} symbol={b.symbol} titel={b.titel} onWaehlen={b.tu} />
          ))}
        </PopupGruppe>
      )}
      {konto.length > 0 && (
        <PopupGruppe titel="Konto">
          {konto.map(k => (
            <PopupEintrag
              key={k.id}
              symbol="personen"
              titel={k.titel}
              unterzeile={k.unter}
              onWaehlen={k.tu}
            />
          ))}
        </PopupGruppe>
      )}
      {verwaltung.length > 0 && (
        <PopupGruppe titel="Verwaltung">
          {verwaltung.map(b => (
            <PopupEintrag
              key={b.id}
              symbol="einstellungen"
              titel={b.label}
              onWaehlen={() => geh({ type: 'verwaltung', bereich: b.id })}
            />
          ))}
        </PopupGruppe>
      )}
    </Popup>
  );
}
