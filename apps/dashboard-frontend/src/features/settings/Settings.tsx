import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { ScrollArea } from '@/components/ui/shadcn/scroll-area';
import { Mascot } from '@/components/mascot/Mascot';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import useConfirm from '../../hooks/useConfirm';
import { useSettingsStore } from '@/stores/settingsStore';
import { resolveTab, resolveSystemSub, sectionLabel } from './sections';
import { GeneralSettings } from './GeneralSettings';
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-4 max-md:px-4">
        <Mascot state="idle" label="Arasul" className="h-8 w-8 shrink-0" />
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight text-foreground">Einstellungen</h2>
          <p className="truncate text-xs text-muted-foreground">{sectionLabel(activeSection)}</p>
        </div>
        {isDirty && (
          <span className="ml-auto shrink-0 rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-warning">
            Ungespeicherte Änderungen
          </span>
        )}
      </header>
      <ScrollArea className="flex-1">
        <div className="max-w-225 p-6 max-md:p-4">{renderContent()}</div>
      </ScrollArea>

      {ConfirmDialog}
    </div>
  );
}

export default Settings;
