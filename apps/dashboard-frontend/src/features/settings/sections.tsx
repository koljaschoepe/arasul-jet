import { AppWindow, Cpu, Database, FolderTree, HardDrive, Server, Users } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Die Bereiche der Verwaltung als einzige Quelle der Wahrheit — gelesen von
 * der Leiste der Bereiche in der Verwaltung selbst (`Settings.tsx`, M5) und
 * von der Shell, die alte `?tab=`-Adressen auf einen Bereich abbildet. Icons
 * ohne Größenklasse — der Verwender bestimmt die Größe.
 *
 * DIE BEREICHE AUS `company/frontend.md`, in dieser Reihenfolge: Personen,
 * Apps, Läufe, Firmenordner, Modelle, System, Daten, Gerät. Läufe baut die
 * Karte verwaltung-laeufe; bis dahin fehlt der Eintrag, statt leer dazustehen.
 * Bis zum 04.10.2026 waren es elf: Allgemein, Sicherheit, Lizenz und
 * Fernzugriff sind im Bereich Gerät aufgegangen, die Auslastung im Satz und
 * den drei Zahlen von System, die Aktualisierung ebenfalls im Gerät. Den
 * Bereich KI gibt es nicht mehr: er ließ den Basis-Prompt bearbeiten, und der
 * Administrator ändert keine Prompts.
 */
export type SettingsSectionId =
  'benutzer' | 'apps' | 'firmenordner' | 'modelle' | 'system' | 'daten' | 'geraet';

export interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  icon: ReactNode;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  // Menschen anlegen und Apps freigeben ist der Handgriff, den ein
  // Administrator am häufigsten tut (Phase D3), und die Zielform beginnt hier.
  { id: 'benutzer', label: 'Personen', icon: <Users /> },
  { id: 'apps', label: 'Apps', icon: <AppWindow /> },
  // Wer welchen Ordner sieht, ist dieselbe Frage wie wer welche App sieht —
  // nur mit drei Stufen statt einem Haken.
  { id: 'firmenordner', label: 'Firmenordner', icon: <FolderTree /> },
  // Welches Modell auf dem Gerät liegt, ist eine Frage an das Gerät.
  { id: 'modelle', label: 'Modelle', icon: <Cpu /> },
  // Ein Satz, drei Zahlen; Dienste und Selbstheilung aufgeklappt.
  { id: 'system', label: 'System', icon: <Server /> },
  // Sicherung, Auskunft, abgesetzt Löschen und Werksreset.
  { id: 'daten', label: 'Daten', icon: <Database /> },
  // Unternehmen, Aktualisierung, Lizenz, Fernzugriff, „Über Arasul".
  { id: 'geraet', label: 'Gerät', icon: <HardDrive /> },
];

const SETTINGS_SECTION_IDS: SettingsSectionId[] = SETTINGS_SECTIONS.map(s => s.id);

/**
 * Alte Bereiche (und Vorkonsolidierungs-Ids) auf die Bereiche abbilden, damit
 * alte Lesezeichen weiter funktionieren — und dort landen, wo die Funktion
 * jetzt steht, mit dem Abschnitt, der sie trägt.
 */
const ALT: Record<string, { bereich: SettingsSectionId; abschnitt?: string }> = {
  general: { bereich: 'geraet', abschnitt: 'unternehmen' },
  security: { bereich: 'geraet', abschnitt: 'fernzugriff' },
  lizenz: { bereich: 'geraet', abschnitt: 'lizenz' },
  'remote-access': { bereich: 'geraet', abschnitt: 'fernzugriff' },
  updates: { bereich: 'geraet', abschnitt: 'aktualisierung' },
  // Den Bereich KI gibt es nicht mehr; was vom Modell bleibt, steht unter Modelle.
  ki: { bereich: 'modelle' },
  'ai-profile': { bereich: 'modelle' },
  'rag-llm': { bereich: 'modelle' },
  services: { bereich: 'system', abschnitt: 'services' },
  selfhealing: { bereich: 'system', abschnitt: 'selfhealing' },
  // Seit M5 stehen Sicherung, Datenschutz und Werksreset im Bereich Daten.
  sicherung: { bereich: 'daten' },
  werksreset: { bereich: 'daten' },
  privacy: { bereich: 'daten' },
  // Seit M5 stehen die Verbindungen auf der Seite jeder App.
  verbindungen: { bereich: 'apps' },
};

/** Initiale System-Unter-Sektion aus einem (evtl. alten) `?tab=`-Wert. */
export function resolveSystemSub(param: string | null): 'services' | 'selfhealing' | undefined {
  if (param === 'selfhealing' || param === 'services') return param;
  return undefined;
}

/**
 * Bereich und Abschnitt einer Adresse, mit den alten Stellen auf die neue
 * abgebildet: `/workspace/verwaltung/privacy` und
 * `/workspace/verwaltung/system/sicherung` landen im Bereich Daten,
 * `/workspace/verwaltung/lizenz` im Gerät beim Abschnitt Lizenz,
 * `/workspace/verwaltung/system/updates` im Gerät bei der Aktualisierung.
 * Ein Lesezeichen auf einen gestrichenen Bereich führt dorthin, wo die
 * Funktion jetzt steht.
 */
export function bereichAusAdresse(
  bereich: string | null | undefined,
  abschnitt: string | null | undefined
): { bereich: SettingsSectionId; abschnitt: string | undefined } {
  if (bereich === 'system' && (abschnitt === 'sicherung' || abschnitt === 'werksreset')) {
    return { bereich: 'daten', abschnitt: undefined };
  }
  if (bereich === 'system' && (abschnitt === 'updates' || abschnitt === 'status')) {
    return abschnitt === 'updates'
      ? { bereich: 'geraet', abschnitt: 'aktualisierung' }
      : { bereich: 'system', abschnitt: undefined };
  }
  if (!bereich) return { bereich: 'benutzer', abschnitt: undefined };
  const alt = ALT[bereich];
  if (alt) return { bereich: alt.bereich, abschnitt: alt.abschnitt };
  if (!SETTINGS_SECTION_IDS.includes(bereich as SettingsSectionId)) {
    return { bereich: 'benutzer', abschnitt: undefined };
  }
  return {
    bereich: bereich as SettingsSectionId,
    abschnitt: bereich === 'daten' ? undefined : (abschnitt ?? undefined),
  };
}
