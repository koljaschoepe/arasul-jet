/**
 * Der Schalter, mit dem eine Erweiterung an- und ausgeht (Plan 023 H5).
 *
 * Zwei Sorten teilen sich diese Fläche: Kern-Apps (`workspace-apps`, etwa n8n)
 * und selbst gebaute oder importierte Pakete (`extensions`). Sie kommen aus
 * verschiedenen Endpunkten, aber der Schalter bedeutet in beiden dasselbe, und
 * genau das war er vorher nicht:
 *
 *   Kern-App    „Im Workspace sichtbar"   Zustand des Schalters
 *   Paket       „Selbst gebaut"           Herkunft des Pakets
 *
 * Die Herkunft gehört zu den Merkmalen oben, nicht neben den Schalter. Zwei
 * Karten mit demselben Schalter an derselben Stelle müssen dieselbe Beschriftung
 * tragen, sonst rät der Nutzer, was der Schalter tut.
 *
 * Die Logik steht hier und nicht in den Karten, weil beide Karten sie brauchen
 * und weil sich die Frage „wie viele Tabs macht das zu?" nur so prüfen lässt,
 * ohne die halbe Arbeitsfläche zu zeichnen.
 */
import type { WorkspaceTab, WorkspaceTabType } from '@/stores/workspaceStore';

/** Beschriftung neben dem Schalter. Gilt für beide Sorten. */
export function schalterText(an: boolean): string {
  return an ? 'Im Workspace sichtbar' : 'Im Workspace ausgeblendet';
}

/**
 * Welche offenen Tabs schließt das Ausschalten?
 *
 * @param tabs offene Tabs der Arbeitsfläche
 * @param ziel Tab-Typ einer Kern-App, oder die Kennung eines Pakets
 */
export function betroffeneTabs(
  tabs: WorkspaceTab[],
  ziel: { tabTyp?: WorkspaceTabType; extensionId?: string }
): WorkspaceTab[] {
  return tabs.filter(t => {
    if (ziel.extensionId) {
      return t.type === 'extension' && t.extensionId === ziel.extensionId;
    }
    return ziel.tabTyp ? t.type === ziel.tabTyp : false;
  });
}

/**
 * Der Satz, der vor dem Ausschalten erscheint.
 *
 * Erst zählen, dann fragen: „Ein Tab wird geschlossen" ist eine andere Auskunft
 * als „Vier Tabs werden geschlossen", und ohne Zahl müsste der Nutzer selbst
 * nachsehen, was er gerade verliert.
 */
export function schliessFrage(name: string, anzahl: number): string {
  const tabs = anzahl === 1 ? 'ein offener Tab' : `${anzahl} offene Tabs`;
  return (
    `„${name}" wird im Workspace ausgeblendet. Dabei schließt sich ${tabs}. ` +
    'Ungespeicherte Eingaben darin gehen verloren.'
  );
}
