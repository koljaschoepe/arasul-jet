/**
 * Die Mitte, solange keine App offen ist (Phase D1).
 *
 * MITARBEITER-SICHT ZUERST, und das ist die Reihenfolge des Auftrags: was hier
 * steht, gilt für jeden, der sich anmeldet. Der Administrator sieht dasselbe
 * und daneben seine Verwaltungswege — in der Aktivitätsleiste, nicht hier.
 * Eine zweite Übersicht „für Admins" wäre der Anfang von zwei Oberflächen.
 *
 * Drei Sachen, mehr nicht: wer ich bin, welche Apps ich habe, was auf mich
 * wartet. Der Systemzustand (CPU, GPU, Dienste) gehört ausdrücklich NICHT
 * hierher; er steht in den Einstellungen unter System, und ein Mitarbeiter,
 * der einen Urlaubsantrag stellt, hat mit der GPU-Temperatur nichts zu tun.
 */
import type { ReactNode } from 'react';
import { AppWindow } from 'lucide-react';
import { Karte, Kopf } from '@marken';
import EmptyState from '@/components/ui/EmptyState';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useMeineApps, zuEintraegen, type AppEintrag } from './meineApps';

/**
 * Eine App als Karte. Ein Klick öffnet sie als Tab in der Mitte.
 *
 * Die Karte kommt seit D7 aus dem Designsystem (`@marken`) — derselbe
 * Baustein, den eine App für ihre eigenen Karten benutzt. Bis dahin war es
 * dieselbe Form aus einer eigenen Klassenkette, und genau daran laufen zwei
 * Erscheinungsbilder auseinander.
 */
function AppKachel({ eintrag, onOeffnen }: { eintrag: AppEintrag; onOeffnen: () => void }) {
  return (
    <Karte
      titel={eintrag.name}
      symbol={<AppWindow />}
      onKlick={onOeffnen}
      kennzeichen={`uebersicht-app-${eintrag.id}-${eintrag.stand}`}
      /* Der Teststand-Hinweis fuer Tester (D2): das Wort allein sagt nicht,
         was daran anders ist. Wer eine App in zwei Staenden vor sich hat,
         muss beim Anklicken wissen, welche Fassung er gleich bedient. */
      hinweis={
        eintrag.stand === 'test' ? (
          <span
            className="text-warning"
            title="Teststand: diese Fassung ist noch nicht live. Was du hier tust, ist ein Test."
          >
            Test
          </span>
        ) : undefined
      }
    >
      {eintrag.beschreibung && <span className="line-clamp-2">{eintrag.beschreibung}</span>}
      <span className="block text-ui-xs text-muted-foreground/70">Fassung {eintrag.version}</span>
    </Karte>
  );
}

/**
 * @param freigaben Die offenen Freigaben, als Baustein hereingereicht.
 *
 * ALS SLOT UND NICHT ALS IMPORT, und das ist die Regel dieses Ordners: ein
 * Bauteil aus `features/X/` importiert nichts aus `features/Y/`. Was quer
 * zusammensetzt, ist die Shell (`features/workspace/TabContent.tsx`) — sie
 * reicht hier `<OffeneFreigaben />` herein. Ohne den Slot müsste entweder die
 * Übersicht die Freigaben kennen (dann hängen App-Liste und Freigaben
 * aneinander) oder die Freigaben lägen im App-Ordner (dann heißt der Ordner
 * nicht mehr, was darin steht).
 */
export function Uebersicht({ freigaben }: { freigaben?: ReactNode }) {
  const { user } = useAuth();
  const openTab = useWorkspaceStore(s => s.openTab);
  const { data: apps, isLoading } = useMeineApps();

  const eintraege = zuEintraegen(apps ?? []);

  return (
    <div className="ara-strom" data-testid="uebersicht-seite">
      <Kopf
        titel={user?.username ? `Guten Tag, ${user.username}` : 'Guten Tag'}
        beschreibung="Die Apps, die für dich freigegeben sind. Alles läuft auf diesem Gerät."
      />

      {/* Zuerst das, was auf eine ANTWORT wartet, danach das, was offen
          herumsteht. Ein angehaltener Flow blockiert jemanden anderes; eine
          App wartet nicht. */}
      {freigaben}

      {isLoading ? (
        <SkeletonText lines={3} />
      ) : eintraege.length === 0 ? (
        <EmptyState
          icon={<AppWindow />}
          title="Noch keine App für dich"
          description="Ein Administrator gibt Apps für einzelne Menschen frei. Sobald eine für dich dabei ist, steht sie hier und links in der Leiste."
        />
      ) : (
        <div className="grid grid-cols-1 gap-ui-2 min-[900px]:grid-cols-2">
          {eintraege.map(e => (
            <AppKachel
              key={`${e.id}:${e.stand}`}
              eintrag={e}
              onOeffnen={() => openTab({ type: 'app', appId: e.id, stand: e.stand, title: e.name })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
