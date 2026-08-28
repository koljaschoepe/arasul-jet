import { AppWindow, Info, Lock, Server, Globe, ShieldAlert, Sparkles, Users } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Die Einstellungs-Sektionen als einzige Quelle der Wahrheit — geteilt von der
 * Sidebar-Ansicht (SettingsPanel) und dem Einstellungen-Mitte-Tab (Settings).
 * B4: die Sektionen leben jetzt in der linken Sidebar (wie die Flows), NICHT
 * mehr in einer zweiten Spalte innerhalb des Tabs. Icons ohne Größenklasse —
 * der Verwender bestimmt die Größe.
 */
export type SettingsSectionId =
  'general' | 'apps' | 'benutzer' | 'ki' | 'security' | 'privacy' | 'system' | 'remote-access';

export interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  icon: ReactNode;
  description: string;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: 'general', label: 'Allgemein', icon: <Info />, description: 'System & Erscheinungsbild' },
  // Zweiter Platz (Phase D4): was auf dem Geraet laeuft, ist das erste, was
  // ein Administrator nachsieht -- und der Ort, an dem er den Teststand live
  // schaltet. Die Menschen kommen direkt danach: erst was laeuft, dann wer es
  // benutzt.
  {
    id: 'apps',
    label: 'Apps',
    icon: <AppWindow />,
    description: 'Fassungen, Zustand, Flows und Laeufe',
  },
  // Menschen anlegen und Apps freigeben ist der Handgriff, den ein
  // Administrator am haeufigsten tut (Phase D3).
  {
    id: 'benutzer',
    label: 'Mitarbeiter',
    icon: <Users />,
    description: 'Konten, Startpasswort, App-Freigaben',
  },
  { id: 'ki', label: 'KI', icon: <Sparkles />, description: 'Firmenprofil, Kontext & RAG/LLM' },
  { id: 'security', label: 'Sicherheit', icon: <Lock />, description: 'Passwörter und Zugriff' },
  {
    id: 'privacy',
    label: 'Datenschutz',
    icon: <ShieldAlert />,
    description: 'DSGVO: Auskunft und Löschung',
  },
  {
    id: 'system',
    label: 'System',
    icon: <Server />,
    description: 'Services, Updates, Self-Healing',
  },
  {
    id: 'remote-access',
    label: 'Fernzugriff',
    icon: <Globe />,
    description: 'Tailscale VPN und Remote-Zugriff',
  },
];

const SETTINGS_SECTION_IDS: SettingsSectionId[] = SETTINGS_SECTIONS.map(s => s.id);

/**
 * Alt-/Unter-Sektions-Ids (und Vorkonsolidierungs-Ids) auf die 6 Sektionen
 * abbilden, damit alte Lesezeichen / Deep-Links weiter funktionieren.
 */
export function resolveTab(param: string | null): SettingsSectionId {
  if (!param) return 'general';
  const legacy: Record<string, SettingsSectionId> = {
    'ai-profile': 'ki',
    'rag-llm': 'ki',
    services: 'system',
    updates: 'system',
    selfhealing: 'system',
    werksreset: 'system',
  };
  const resolved = legacy[param] ?? param;
  return SETTINGS_SECTION_IDS.includes(resolved as SettingsSectionId)
    ? (resolved as SettingsSectionId)
    : 'general';
}

/** Initiale System-Unter-Sektion aus einem (evtl. alten) `?tab=`-Wert. */
export function resolveSystemSub(
  param: string | null
): 'services' | 'updates' | 'selfhealing' | 'werksreset' | undefined {
  if (
    param === 'updates' ||
    param === 'selfhealing' ||
    param === 'services' ||
    param === 'werksreset'
  ) {
    return param;
  }
  return undefined;
}
