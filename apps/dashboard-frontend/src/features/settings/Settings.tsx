import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { Mascot } from '@/components/mascot/Mascot';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import useConfirm from '../../hooks/useConfirm';
import { useSettingsStore } from '@/stores/settingsStore';
import { resolveTab, resolveSystemSub } from './sections';
import { GeneralSettings } from './GeneralSettings';
import { AppsSettings } from './AppsSettings';
import { MitarbeiterSettings } from './MitarbeiterSettings';
import { KISettings } from './KISettings';
import { SecuritySettings } from './SecuritySettings';
import { RemoteAccessSettings } from './RemoteAccessSettings';
import { PrivacySettings } from './PrivacySettings';
import { SystemSettings } from '../system/SystemSettings';

interface SettingsProps {
  handleLogout: () => void;
  theme: string;
  onToggleTheme: () => void;
}

/**
 * Einstellungen-Mitte-Tab (B4). Die Sektionsauswahl lebt jetzt in der linken
 * Sidebar (SettingsPanel, wie die Flows); dieser Tab zeigt NUR noch die aktive
 * Sektion — keine zweite Spalte / kein „Tab im Tab" mehr. Die aktive Sektion
 * steht im settingsStore, den beide Seiten teilen.
 */
function Settings({ handleLogout, theme, onToggleTheme }: SettingsProps) {
  const api = useApi();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [searchParams] = useSearchParams();
  const activeSection = useSettingsStore(s => s.activeSection);
  const setActiveSection = useSettingsStore(s => s.setActiveSection);
  const [isDirty, setIsDirty] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  // Alt-Deep-Link (/settings?tab=…) einmalig in den Store übernehmen, damit
  // Lesezeichen weiter direkt auf der richtigen Sektion landen.
  useEffect(() => {
    const param = searchParams.get('tab');
    if (param) setActiveSection(resolveTab(param));
  }, []);

  const confirmThenLogout = async () => {
    const ok = await confirm({
      title: 'Abmelden',
      message: 'Möchtest du dich von diesem Gerät abmelden?',
      confirmText: 'Abmelden',
      cancelText: 'Abbrechen',
      confirmVariant: 'warning',
    });
    if (ok) handleLogout();
  };

  const handleLogoutAll = async () => {
    const ok = await confirm({
      title: 'Von allen Geräten abmelden',
      message: 'Dadurch werden alle aktiven Sitzungen auf allen Geräten beendet. Fortfahren?',
      confirmText: 'Überall abmelden',
      cancelText: 'Abbrechen',
      confirmVariant: 'warning',
    });
    if (!ok) return;
    setLoggingOutAll(true);
    try {
      await api.post('/auth/logout-all', null, { showError: false });
    } catch {
      // Surface the failure instead of swallowing it, then still log out
      // locally so the user isn't stuck in a half-authenticated state.
      toast.error(
        'Sitzungen auf anderen Geräten konnten nicht serverseitig beendet werden. Du wirst hier lokal abgemeldet.'
      );
    } finally {
      handleLogout();
    }
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'general':
        return (
          <ComponentErrorBoundary componentName="Allgemein">
            <GeneralSettings theme={theme} onToggleTheme={onToggleTheme} />
          </ComponentErrorBoundary>
        );
      case 'apps':
        return (
          <ComponentErrorBoundary componentName="Apps">
            <AppsSettings />
          </ComponentErrorBoundary>
        );
      case 'benutzer':
        return (
          <ComponentErrorBoundary componentName="Mitarbeiter">
            <MitarbeiterSettings />
          </ComponentErrorBoundary>
        );
      case 'ki':
        return (
          <ComponentErrorBoundary componentName="KI">
            <KISettings onDirtyChange={setIsDirty} />
          </ComponentErrorBoundary>
        );
      case 'security':
        return (
          <ComponentErrorBoundary componentName="Sicherheit">
            <SecuritySettings
              handleLogout={confirmThenLogout}
              loggingOutAll={loggingOutAll}
              onLogoutAll={handleLogoutAll}
              onDirtyChange={setIsDirty}
            />
          </ComponentErrorBoundary>
        );
      case 'privacy':
        return (
          <ComponentErrorBoundary componentName="Datenschutz">
            <PrivacySettings />
          </ComponentErrorBoundary>
        );
      case 'system':
        return (
          <ComponentErrorBoundary componentName="System">
            <SystemSettings initial={resolveSystemSub(searchParams.get('tab'))} />
          </ComponentErrorBoundary>
        );
      case 'remote-access':
        return (
          <ComponentErrorBoundary componentName="Fernzugriff">
            <RemoteAccessSettings />
          </ComponentErrorBoundary>
        );
      default:
        return (
          <ComponentErrorBoundary componentName="Allgemein">
            <GeneralSettings theme={theme} onToggleTheme={onToggleTheme} />
          </ComponentErrorBoundary>
        );
    }
  };

  return (
    <div className="flex h-full flex-col animate-in fade-in">
      {/*
        Kein Ueberschriftenelement: Der Rahmen ist bleibende Umgebung, nicht die
        Ueberschrift der Seite. Die steht als einziges h1 im Bereich darunter,
        aus dem Kopf. Vorher stand hier ein h2 ueber einem h1, und der
        Bereichsname darunter noch einmal im h1, vierzig Pixel tiefer.
      */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-4 max-md:px-4">
        <Mascot state="idle" label="Arasul" className="h-8 w-8 shrink-0" />
        <div className="min-w-0 text-lg font-bold leading-tight text-foreground">Einstellungen</div>
        {isDirty && (
          <span className="ml-auto shrink-0 rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-warning">
            Ungespeicherte Änderungen
          </span>
        )}
      </header>
      {/*
        EIN GEWOEHNLICHER ROLLBEREICH und keine `ScrollArea` mehr (Phase D4,
        Fund der D3-Abnahme am Orin).

        Bei 1440 px mit offener Notizspalte war die Einstellungsseite in der
        Mitte abgeschnitten -- die Namensspalte der Mitarbeiter-Tabelle war
        nicht zu sehen und auch nicht zu erreichen. Der Grund steckt in Radix'
        `ScrollArea`: ihr Ansichtsfenster legt um den Inhalt ein Element mit
        `display: table`, und dessen Breite richtet sich nach dem INHALT. Eine
        Tabelle, die breiter ist als die Spalte, macht damit den ganzen
        Rollbereich breiter, statt in sich zu rollen -- waagerecht rollen
        laesst er sich zwar, aber ohne sichtbaren Balken (Radix rendert je
        Richtung eine eigene Leiste, und hier stand nur die senkrechte).

        Ein `div` mit `overflow-y-auto` und `min-w-0` kann schrumpfen. Was
        darin breiter ist als die Spalte -- Tabellen, die Freigabe-Matrix, die
        Log-Ausgabe der App-Ansicht -- rollt in seinem EIGENEN `overflow-x-auto`
        und damit dort, wo es hingehoert: „die Mitte scrollt waagerecht
        innerhalb".
      */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="min-w-0 max-w-225 p-6 max-md:p-4">{renderContent()}</div>
      </div>

      {ConfirmDialog}
    </div>
  );
}

export default Settings;
