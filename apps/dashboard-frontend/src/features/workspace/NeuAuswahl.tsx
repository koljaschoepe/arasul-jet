import { AppSymbol } from '@/components/AppSymbol';
import { Popup, PopupEintrag, PopupGruppe } from '@marken';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { standFuerKlick, useMeineApps, zuLeiste, type LeistenApp } from '@/features/apps/meineApps';

/** Wie viele Apps ganz oben stehen. */
const OBEN = 3;

/** Die jüngsten Apps zuerst (nach `seit`); ohne Datum hinten, in der Ordnung des Geräts. */
function nachJuengsten(apps: LeistenApp[]): LeistenApp[] {
  const zeit = (a: LeistenApp) => {
    const t = a.seit ? Date.parse(a.seit) : NaN;
    return Number.isFinite(t) ? t : -Infinity;
  };
  return apps
    .map((a, i) => ({ a, i }))
    .sort((x, y) => zeit(y.a) - zeit(x.a) || x.i - y.i)
    .map(x => x.a);
}

/**
 * Die Auswahl „Neu“ (J60, `gestaltung.md`, Fassung vom 27.11.2026, Plus im
 * Dock): ein Glas-Popup ohne Suchfeld. Oben die drei zuletzt angelegten
 * Apps, darunter alle weiteren. Ein Eintrag öffnet die App, in der man etwas
 * Neues anlegt.
 */
export function NeuAuswahl() {
  const offen = useWorkspaceStore(s => s.neuOffen);
  const setzeNeu = useWorkspaceStore(s => s.setzeNeu);
  const oeffne = useWorkspaceStore(s => s.oeffne);
  const zuletztStand = useWorkspaceStore(s => s.zuletztStand);
  const { data } = useMeineApps();
  const sortiert = nachJuengsten(zuLeiste(data ?? []));
  const oben = sortiert.slice(0, OBEN);
  const weitere = sortiert.slice(OBEN);

  const geh = (a: LeistenApp) => {
    setzeNeu(false);
    oeffne({
      type: 'app',
      appId: a.id,
      stand: standFuerKlick(a, zuletztStand[a.id]),
      title: a.name,
    });
  };

  return (
    <Popup
      offen={offen}
      onSchliessen={() => setzeNeu(false)}
      titel="Neu"
      leer={sortiert.length === 0}
      leerText="Noch keine App."
      kennzeichen="neu-popup"
    >
      {oben.length > 0 && (
        <PopupGruppe titel="Zuletzt angelegt">
          {oben.map(a => (
            <PopupEintrag
              key={a.id}
              bild={<AppSymbol symbol={a.symbol} klasse="size-4" />}
              titel={a.name}
              onWaehlen={() => geh(a)}
            />
          ))}
        </PopupGruppe>
      )}
      {weitere.length > 0 && (
        <PopupGruppe titel="Weitere">
          {weitere.map(a => (
            <PopupEintrag
              key={a.id}
              bild={<AppSymbol symbol={a.symbol} klasse="size-4" />}
              titel={a.name}
              onWaehlen={() => geh(a)}
            />
          ))}
        </PopupGruppe>
      )}
    </Popup>
  );
}
