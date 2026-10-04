/**
 * Die Startseite (M5, `frontend.md`, Abschnitt Startseite): Gruß mit Vorname,
 * darunter „Für Sie", dann die Kacheln der eigenen Apps, beim Administrator
 * zuletzt, was Aufmerksamkeit braucht.
 *
 * MITARBEITER-SICHT ZUERST: was hier steht, gilt für jeden, der sich anmeldet.
 * Der Systemzustand (CPU, GPU, Dienste) gehört ausdrücklich NICHT hierher; er
 * steht in der Verwaltung, und ein Mitarbeiter, der einen Urlaubsantrag stellt,
 * hat mit der GPU-Temperatur nichts zu tun.
 */
import type { ReactNode } from 'react';
import { AppWindow } from 'lucide-react';
import { Karte, Kopf } from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useMeineApps, zuEintraegen, type AppEintrag } from './meineApps';
import { Leerzustand } from '@marken';

/**
 * Eine App als Karte. Ein Klick öffnet sie im Hauptbereich.
 *
 * Die Karte kommt seit D7 aus dem Designsystem (`@marken`) — derselbe
 * Baustein, den eine App für ihre eigenen Karten benutzt. Bis dahin war es
 * dieselbe Form aus einer eigenen Klassenkette, und genau daran laufen zwei
 * Erscheinungsbilder auseinander.
 */
function AppKachel({
  eintrag,
  wartend,
  zeigeFassung,
  onOeffnen,
}: {
  eintrag: AppEintrag;
  wartend: number;
  zeigeFassung: boolean;
  onOeffnen: () => void;
}) {
  return (
    <Karte
      titel={eintrag.stand === 'test' ? `(Test) ${eintrag.name}` : eintrag.name}
      symbol={<AppWindow />}
      onKlick={onOeffnen}
      kennzeichen={`uebersicht-app-${eintrag.id}-${eintrag.stand}`}
      /* Der Teststand steht als „(Test) Name" im Titel, wie in der Leiste
         (M5): wer eine App in zwei Fassungen vor sich hat, muss beim
         Anklicken wissen, welche er gleich bedient. */
      /* Höchstens eine Zahl (J36), und ohne wartende Freigabe gar nichts:
         ein leerer Hinweis zeichnete ein leeres Feld in die Ecke. */
      hinweis={
        wartend > 0 ? (
          <span
            className="font-medium text-foreground"
            data-testid={`uebersicht-app-${eintrag.id}-${eintrag.stand}-wartend`}
            title={wartend === 1 ? '1 Freigabe wartet' : `${wartend} Freigaben warten`}
            aria-label={wartend === 1 ? '1 Freigabe wartet' : `${wartend} Freigaben warten`}
          >
            {wartend}
          </span>
        ) : undefined
      }
    >
      {eintrag.beschreibung && <span className="line-clamp-2">{eintrag.beschreibung}</span>}
      {zeigeFassung && (
        <span className="block text-ui-xs text-muted-foreground/70">Fassung {eintrag.version}</span>
      )}
    </Karte>
  );
}

/**
 * @param freigaben „Für Sie", als Baustein hereingereicht, für jeden (M5).
 *
 * ALS SLOT UND NICHT ALS IMPORT, und das ist die Regel dieses Ordners: ein
 * Bauteil aus `features/X/` importiert nichts aus `features/Y/`. Was quer
 * zusammensetzt, ist die Shell (`features/workspace/AnsichtInhalt.tsx`) — sie
 * reicht hier `<OffeneFreigaben />` herein. Ohne den Slot müsste entweder die
 * Übersicht die Freigaben kennen (dann hängen App-Liste und Freigaben
 * aneinander) oder die Freigaben lägen im App-Ordner (dann heißt der Ordner
 * nicht mehr, was darin steht).
 */
export function Uebersicht({
  freigaben,
  hinweise,
  wartend,
}: {
  freigaben?: ReactNode;
  /** Was der Administrator wissen muss; die Shell reicht es nur ihm herein. */
  hinweise?: ReactNode;
  /** Offene Freigaben je App-Kennung; die Shell zählt sie, hier steht nur die Zahl. */
  wartend?: Record<string, number>;
}) {
  const { user } = useAuth();
  const oeffne = useWorkspaceStore(s => s.oeffne);
  const { data: apps, isLoading } = useMeineApps();

  const eintraege = zuEintraegen(apps ?? []);
  // Der Vorname; ohne ihn der Anzeigename (der auf den Benutzernamen zurückfällt).
  const name = user?.vorname?.trim() || user?.anzeigeName || user?.username || '';

  return (
    <div className="ara-strom" data-testid="uebersicht-seite">
      <Kopf titel={name ? `Guten Tag, ${name}` : 'Guten Tag'} />

      {/* Zuerst das, was auf eine ANTWORT wartet, danach das, was offen
          herumsteht. Ein angehaltener Flow blockiert jemanden anderes; eine
          App wartet nicht. */}
      {freigaben}

      {isLoading ? (
        <SkeletonText lines={3} />
      ) : eintraege.length === 0 ? (
        <Leerzustand
          symbol={<AppWindow />}
          titel="Noch keine App für Sie"
          beschreibung="Ein Administrator gibt Apps für einzelne Menschen frei. Sobald eine für Sie dabei ist, steht sie hier und links in der Leiste."
        />
      ) : (
        <div className="grid grid-cols-1 gap-ui-2 min-[900px]:grid-cols-2">
          {eintraege.map(e => (
            <AppKachel
              key={`${e.id}:${e.stand}`}
              eintrag={e}
              wartend={wartend?.[e.id] ?? 0}
              zeigeFassung={user?.role === 'admin'}
              onOeffnen={() => oeffne({ type: 'app', appId: e.id, stand: e.stand, title: e.name })}
            />
          ))}
        </div>
      )}

      {hinweise}
    </div>
  );
}
