import {
  AppWindow,
  Cpu,
  FolderTree,
  Info,
  KeyRound,
  Lock,
  Server,
  Globe,
  ShieldAlert,
  Sparkles,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Die Bereiche der Verwaltung als einzige Quelle der Wahrheit — gelesen von
 * der Leiste der Bereiche in der Verwaltung selbst (`Settings.tsx`, M5) und
 * von der Shell, die alte `?tab=`-Adressen auf einen Bereich abbildet. Icons
 * ohne Größenklasse — der Verwender bestimmt die Größe.
 */
export type SettingsSectionId =
  | 'general'
  | 'apps'
  | 'benutzer'
  | 'firmenordner'
  | 'modelle'
  | 'ki'
  | 'security'
  | 'privacy'
  | 'system'
  | 'lizenz'
  | 'remote-access';

export interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  icon: ReactNode;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'general',
    label: 'Allgemein',
    icon: <Info />,
  },
  // Zweiter Platz (Phase D4): was auf dem Geraet laeuft, ist das erste, was
  // ein Administrator nachsieht -- und der Ort, an dem er den Teststand live
  // schaltet. Die Menschen kommen direkt danach: erst was laeuft, dann wer es
  // benutzt.
  {
    id: 'apps',
    label: 'Apps',
    icon: <AppWindow />,
  },
  // Menschen anlegen und Apps freigeben ist der Handgriff, den ein
  // Administrator am haeufigsten tut (Phase D3).
  {
    id: 'benutzer',
    label: 'Personen',
    icon: <Users />,
  },
  // Direkt nach den Menschen (Auftrag firmenordner-rechte-im-frontend,
  // 22.09.2026): wer welchen Ordner sieht, ist dieselbe Frage wie wer welche
  // App sieht -- nur mit drei Stufen statt einem Haken.
  {
    id: 'firmenordner',
    label: 'Firmenordner',
    icon: <FolderTree />,
  },
  // Seit M5 ein Bereich der Verwaltung und keine eigene Ansicht der
  // Aktivitätsleiste mehr: welches Modell auf dem Gerät liegt, ist eine Frage
  // an das Gerät, wie die Lizenz und das System.
  { id: 'modelle', label: 'Modelle', icon: <Cpu /> },
  {
    id: 'ki',
    label: 'KI',
    icon: <Sparkles />,
  },
  { id: 'security', label: 'Sicherheit', icon: <Lock /> },
  {
    id: 'privacy',
    label: 'Datenschutz',
    icon: <ShieldAlert />,
  },
  {
    id: 'system',
    label: 'System',
    icon: <Server />,
  },
  // Neben dem System (J35): was das Geraet traegt, ist eine Frage an das
  // Geraet und nicht an einen Menschen -- und wer nach dem Grund sucht, warum
  // das vierte Konto nicht ging, sucht dort.
  {
    id: 'lizenz',
    label: 'Lizenz',
    icon: <KeyRound />,
  },
  {
    id: 'remote-access',
    label: 'Fernzugriff',
    icon: <Globe />,
  },
];

const SETTINGS_SECTION_IDS: SettingsSectionId[] = SETTINGS_SECTIONS.map(s => s.id);

/**
 * Alt-/Unter-Sektions-Ids (und Vorkonsolidierungs-Ids) auf die Bereiche
 * abbilden, damit alte Lesezeichen / Deep-Links weiter funktionieren.
 */
export function resolveTab(param: string | null): SettingsSectionId {
  if (!param) return 'general';
  const legacy: Record<string, SettingsSectionId> = {
    'ai-profile': 'ki',
    'rag-llm': 'ki',
    services: 'system',
    updates: 'system',
    sicherung: 'system',
    selfhealing: 'system',
    werksreset: 'system',
    // Seit M5 stehen die Verbindungen auf der Seite jeder App (Auftrag
    // verwaltung-app-seite); ein altes Lesezeichen landet bei den Apps.
    verbindungen: 'apps',
  };
  const resolved = legacy[param] ?? param;
  return SETTINGS_SECTION_IDS.includes(resolved as SettingsSectionId)
    ? (resolved as SettingsSectionId)
    : 'general';
}

/** Initiale System-Unter-Sektion aus einem (evtl. alten) `?tab=`-Wert. */
export function resolveSystemSub(
  param: string | null
): 'services' | 'updates' | 'sicherung' | 'selfhealing' | 'werksreset' | undefined {
  if (
    param === 'updates' ||
    param === 'sicherung' ||
    param === 'selfhealing' ||
    param === 'services' ||
    param === 'werksreset'
  ) {
    return param;
  }
  return undefined;
}
