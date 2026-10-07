/**
 * Die Startseite (M5, `frontend.md`, Abschnitt Startseite): oben ein blaues
 * Band mit dem Gruß mit Vorname und der Zahl offener Freigaben als Knopf zur
 * Liste, darunter „Für Sie", dann die Kacheln der eigenen Apps, beim
 * Administrator zuletzt, was Aufmerksamkeit braucht.
 *
 * MITARBEITER-SICHT ZUERST: was hier steht, gilt für jeden, der sich anmeldet.
 * Der Systemzustand (CPU, GPU, Dienste) gehört ausdrücklich NICHT hierher; er
 * steht in der Verwaltung, und ein Mitarbeiter, der einen Urlaubsantrag stellt,
 * hat mit der GPU-Temperatur nichts zu tun. Auch im Band steht keine Technik,
 * nicht einmal beim Administrator: seine Hinweise stehen unter den Kacheln.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { AppWindow, ArrowDown, Check } from 'lucide-react';
import { Button, Karte, Kopf, Leerzustand, cn } from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { AppSymbol } from '@/components/AppSymbol';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useMeineApps, zuEintraegen, type AppEintrag } from './meineApps';

const ZAHLWORT = [
  'Keine',
  'Eine',
  'Zwei',
  'Drei',
  'Vier',
  'Fünf',
  'Sechs',
  'Sieben',
  'Acht',
  'Neun',
  'Zehn',
  'Elf',
  'Zwölf',
];

/** „Zwei Freigaben warten auf Sie": bis zwölf in Worten, darüber als Zahl. */
function wartenSatz(zahl: number): string {
  if (zahl === 1) return 'Eine Freigabe wartet auf Sie';
  return `${ZAHLWORT[zahl] ?? zahl} Freigaben warten auf Sie`;
}

/**
 * Das Band blendet EINMAL ein, beim ersten Zeichnen nach dem Laden der Seite.
 * Wer danach zur Startseite zurückkehrt, sieht es stehen: „danach bewegt sich
 * nichts" (`frontend.md`, Gestaltung).
 */
let bandGezeigt = false;

/**
 * Das blaue Band: Gruß mit Vorname und, sobald die Liste da ist, die Zahl der
 * offenen Freigaben als Knopf zu „Für Sie" (oder „Alles erledigt").
 *
 * Der Knopf springt nicht in eine andere Ansicht, er rollt zur Liste darunter
 * und setzt den Fokus dorthin: die Freigaben stehen auf dieser Seite, eine
 * zweite Stelle für sie gibt es nicht.
 */
function Band({ name, offen }: { name: string; offen?: number }) {
  const ersteMal = useRef(!bandGezeigt).current;
  useEffect(() => {
    bandGezeigt = true;
  }, []);

  const zurListe = () => {
    const ziel = document.getElementById('fuer-sie');
    if (!ziel) return;
    const ruhig = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    ziel.scrollIntoView?.({ behavior: ruhig ? 'auto' : 'smooth', block: 'start' });
    ziel.focus({ preventScroll: true });
  };

  return (
    <section
      className={cn(
        'ara-startband mb-6 rounded-md border border-(--kante-band) bg-card bg-(image:--verlauf-band) p-ui-4 min-[900px]:px-6 min-[900px]:py-5',
        ersteMal && 'animate-in fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none'
      )}
      data-testid="startband"
      data-eingeblendet={ersteMal ? 'true' : undefined}
    >
      <Kopf
        titel={name ? `Guten Tag, ${name}` : 'Guten Tag'}
        aktionen={
          offen === undefined ? undefined : offen > 0 ? (
            <Button variant="solid" onClick={zurListe} data-testid="startband-freigaben">
              <ArrowDown aria-hidden="true" />
              {wartenSatz(offen)}
            </Button>
          ) : (
            <span
              className="flex h-9 items-center gap-2 text-sm text-muted-foreground"
              data-testid="startband-erledigt"
            >
              <Check className="size-4 text-primary" aria-hidden="true" />
              Alles erledigt
            </span>
          )
        }
      />
    </section>
  );
}

/**
 * Eine App als Kachel: Symbol auf blau getöntem Quadrat, Name, darunter eine
 * Zeile mit den offenen Freigaben. Beim Überfahren hebt sie sich leicht an
 * (`Karte` aus `@marken`, derselbe Baustein, den eine App für ihre eigenen
 * Karten benutzt). Ein Klick öffnet sie im Hauptbereich.
 *
 * Ohne Symbol im Manifest steht ein neutrales Bild auf dem Quadrat, wie in der
 * Leiste (`AppSymbol`). Fassung und Beschreibung stehen seit dem 07.10.2026
 * nicht mehr hier: die Kachel ist ein Weg in die App, die Fassung steht in der
 * Verwaltung.
 */
function AppKachel({
  eintrag,
  wartend,
  onOeffnen,
}: {
  eintrag: AppEintrag;
  wartend: number;
  onOeffnen: () => void;
}) {
  const kennung = `uebersicht-app-${eintrag.id}-${eintrag.stand}`;
  return (
    <Karte
      titel={eintrag.stand === 'test' ? `(Test) ${eintrag.name}` : eintrag.name}
      symbol={<AppSymbol symbol={eintrag.symbol} klasse="size-5" />}
      onKlick={onOeffnen}
      kennzeichen={kennung}
      /* Der Teststand steht als „(Test) Name" im Titel, wie in der Leiste
         (M5): wer eine App in zwei Fassungen vor sich hat, muss beim
         Anklicken wissen, welche er gleich bedient. */
    >
      {wartend > 0 ? (
        <span className="font-medium text-primary" data-testid={`${kennung}-wartend`}>
          {wartend === 1 ? '1 Freigabe offen' : `${wartend} Freigaben offen`}
        </span>
      ) : (
        <span data-testid={`${kennung}-ruhig`}>Keine offene Freigabe</span>
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
  offen,
}: {
  freigaben?: ReactNode;
  /** Was der Administrator wissen muss; die Shell reicht es nur ihm herein. */
  hinweise?: ReactNode;
  /** Offene Freigaben je `<kennung>:<stand>`; die Shell zählt sie, hier steht nur die Zahl. */
  wartend?: Record<string, number>;
  /** Alle offenen Freigaben bei mir; `undefined`, solange die Liste lädt. */
  offen?: number;
}) {
  const { user } = useAuth();
  const oeffne = useWorkspaceStore(s => s.oeffne);
  const { data: apps, isLoading } = useMeineApps();

  const eintraege = zuEintraegen(apps ?? []);
  // Der Vorname; ohne ihn der Anzeigename (der auf den Benutzernamen zurückfällt).
  const name = user?.vorname?.trim() || user?.anzeigeName || user?.username || '';

  return (
    <div className="ara-strom" data-testid="uebersicht-seite">
      <Band name={name} offen={offen} />

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
          beschreibung={
            user?.role === 'admin'
              ? 'Geben Sie Apps unter Verwaltung › Personen frei. Sobald eine für Sie dabei ist, steht sie hier und in der Leiste.'
              : 'Ein Administrator gibt Apps für einzelne Menschen frei. Sobald eine für Sie dabei ist, steht sie hier und in der Leiste.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-ui-3 min-[900px]:grid-cols-2 min-[1400px]:grid-cols-3">
          {eintraege.map(e => (
            <AppKachel
              key={`${e.id}:${e.stand}`}
              eintrag={e}
              wartend={wartend?.[`${e.id}:${e.stand}`] ?? 0}
              onOeffnen={() => oeffne({ type: 'app', appId: e.id, stand: e.stand, title: e.name })}
            />
          ))}
        </div>
      )}

      {hinweise}
    </div>
  );
}
