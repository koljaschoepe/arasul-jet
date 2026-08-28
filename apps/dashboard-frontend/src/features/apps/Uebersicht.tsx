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
import { Kopf } from '@marken';
import EmptyState from '@/components/ui/EmptyState';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useMeineApps, zuEintraegen, type AppEintrag } from './meineApps';

/** Eine App als Kachel. Ein Klick öffnet sie als Tab in der Mitte. */
function AppKachel({ eintrag, onOeffnen }: { eintrag: AppEintrag; onOeffnen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOeffnen}
      data-testid={`uebersicht-app-${eintrag.id}-${eintrag.stand}`}
      className="flex min-h-11 flex-col items-start gap-1 rounded-md border border-border bg-card p-ui-3 text-left transition-colors hover:border-primary/50 hover:bg-accent"
    >
      <span className="flex w-full items-center gap-2">
        <AppWindow className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{eintrag.name}</span>
        {/* Der Teststand-Hinweis fuer Tester (D2): das Wort allein sagt nicht,
            was daran anders ist. Wer eine App in zwei Staenden vor sich hat,
            muss beim Anklicken wissen, welche Fassung er gleich bedient. */}
        {eintrag.stand === 'test' && (
          <span
            className="shrink-0 rounded bg-warning/15 px-1.5 py-0.5 text-ui-xs font-medium text-warning"
            title="Teststand: diese Fassung ist noch nicht live. Was du hier tust, ist ein Test."
          >
            Test
          </span>
        )}
      </span>
      {eintrag.beschreibung && (
        <span className="line-clamp-2 text-sm text-muted-foreground">{eintrag.beschreibung}</span>
      )}
      <span className="text-ui-xs text-muted-foreground/70">Fassung {eintrag.version}</span>
    </button>
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
