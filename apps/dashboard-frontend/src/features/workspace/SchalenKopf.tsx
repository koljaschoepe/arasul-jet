import { Glasleiste, IconKnopf, TextKnopf, Linie } from '@marken';
import { Mascot } from '@/components/mascot/Mascot';
import { useWorkspaceStore, ansichtTitel } from '@/stores/workspaceStore';

/**
 * Die Glasleiste der App (J60, `gestaltung.md`, Fassung vom 27.11.2026):
 * durchgehend oben. Links der Vogel, der zur Startseite führt, oder ab der
 * zweiten Ebene „‹ vorige Ebene“. Rechts flache Icons: ist eine App offen,
 * schiebt ihr Rahmen Live und Test (nur für Prüfende) und die Rückmeldung in
 * `leistenSlot` (`features/apps/Kapsel.tsx`); die Suche steht immer da. Im
 * Test trägt die Leiste einen 2 px blauen Streifen am unteren Rand.
 *
 * Ebene 1 sind die Ziele des Docks (Start, Store); alles, was darunter
 * aufgeht (App, Verwaltung, Einstellungen, Terminal), ist Ebene 2.
 */
export function SchalenKopf() {
  const ansicht = useWorkspaceStore(s => s.ansicht);
  const oeffne = useWorkspaceStore(s => s.oeffne);
  const setzePalette = useWorkspaceStore(s => s.setzePalette);
  const setzeSlot = useWorkspaceStore(s => s.setzeLeistenSlot);
  const ebene2 = ansicht.type !== 'dashboard' && ansicht.type !== 'store';
  const test = ansicht.type === 'app' && ansicht.stand === 'test';

  return (
    <Glasleiste
      kennzeichen="schale-kopf"
      test={test}
      links={
        ebene2 ? (
          <TextKnopf onKlick={() => oeffne({ type: 'dashboard' })}>
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <Linie name="zurueck" groesse={16} /> vorige Ebene
            </span>
          </TextKnopf>
        ) : (
          <button
            type="button"
            className="ara-iknopf"
            aria-label="Startseite"
            data-testid="schale-vogel"
            onClick={() => oeffne({ type: 'dashboard' })}
          >
            <Mascot className="h-6 w-6" />
          </button>
        )
      }
      mitte={ebene2 ? ansichtTitel(ansicht) : undefined}
      rechts={
        <>
          <div className="contents" ref={setzeSlot} data-testid="schale-leisten-slot" />
          <IconKnopf
            symbol="suche"
            hinweis="Suchen"
            art="flach"
            kennzeichen="schale-suche"
            onKlick={() => setzePalette(true)}
          />
        </>
      }
    />
  );
}
