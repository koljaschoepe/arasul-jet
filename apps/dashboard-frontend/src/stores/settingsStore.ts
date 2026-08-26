import { create } from 'zustand';
import type { SettingsSectionId } from '@/features/settings/sections';

/**
 * Aktive Einstellungs-Sektion (B4). Brücke zwischen der Sidebar-Ansicht
 * »Einstellungen« (SettingsPanel) und dem Einstellungen-Mitte-Tab (Settings),
 * die in getrennten Router-Kontexten laufen. Bewusst nicht persistiert.
 */
interface SettingsState {
  activeSection: SettingsSectionId;
  setActiveSection: (id: SettingsSectionId) => void;
}

export const useSettingsStore = create<SettingsState>(set => ({
  activeSection: 'general',
  setActiveSection: id => set({ activeSection: id }),
}));
