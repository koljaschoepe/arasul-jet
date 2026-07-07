import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Settings as SettingsIcon,
  Lock,
  Info,
  Server,
  Globe,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { ScrollArea } from '@/components/ui/shadcn/scroll-area';
import { cn } from '@/lib/utils';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import useConfirm from '../../hooks/useConfirm';
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

interface Section {
  id: string;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const sections: Section[] = [
  {
    id: 'general',
    label: 'Allgemein',
    icon: <Info className="size-5" />,
    description: 'Systeminformationen und Konfiguration',
  },
  {
    id: 'ki',
    label: 'KI',
    icon: <Sparkles className="size-5" />,
    description: 'Firmenprofil, Kontext & RAG/LLM',
  },
  {
    id: 'security',
    label: 'Sicherheit',
    icon: <Lock className="size-5" />,
    description: 'Passwörter und Zugriffsverwaltung',
  },
  {
    id: 'privacy',
    label: 'Datenschutz',
    icon: <ShieldAlert className="size-5" />,
    description: 'DSGVO: Auskunft und Löschung',
  },
  {
    id: 'system',
    label: 'System',
    icon: <Server className="size-5" />,
    description: 'Services, Updates & Self-Healing',
  },
  {
    id: 'remote-access',
    label: 'Fernzugriff',
    icon: <Globe className="size-5" />,
    description: 'Tailscale VPN und Remote-Zugriff',
  },
];

const validIds = sections.map(s => s.id);

/**
 * Map legacy / pre-consolidation tab ids (and sub-section ids) onto the new
 * 6-tab structure so old bookmarks and in-app deep links keep working.
 */
function resolveTab(param: string | null): string {
  if (!param) return 'general';
  const legacy: Record<string, string> = {
    'ai-profile': 'ki',
    'rag-llm': 'ki',
    services: 'system',
    updates: 'system',
    selfhealing: 'system',
  };
  const resolved = legacy[param] ?? param;
  return validIds.includes(resolved) ? resolved : 'general';
}

/**
 * Derive the initial System sub-section from a (possibly legacy) `?tab=` value,
 * so a bookmark like `?tab=selfhealing` lands directly on the Self-Healing
 * sub-tab instead of always defaulting to Services.
 */
function resolveSystemSub(
  param: string | null
): 'services' | 'updates' | 'selfhealing' | undefined {
  if (param === 'updates' || param === 'selfhealing' || param === 'services') return param;
  return undefined;
}

function Settings({ handleLogout, theme, onToggleTheme }: SettingsProps) {
  const api = useApi();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState(() => resolveTab(searchParams.get('tab')));
  const [isDirty, setIsDirty] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  // Keep activeSection in sync when the URL changes externally (e.g. a deep
  // link from another page like the SystemHealthWidget). This path also honors
  // the unsaved-changes guard so an external navigation can't silently discard
  // in-progress edits.
  useEffect(() => {
    const resolved = resolveTab(searchParams.get('tab'));
    if (resolved === activeSection) return;
    if (isDirty) {
      void (async () => {
        const ok = await confirm({
          title: 'Ungespeicherte Änderungen',
          message: 'Du hast ungespeicherte Änderungen. Trotzdem den Reiter wechseln?',
          confirmText: 'Wechseln',
          cancelText: 'Bleiben',
          confirmVariant: 'warning',
        });
        if (ok) {
          setIsDirty(false);
          setActiveSection(resolved);
        } else {
          // Reject the navigation: restore the URL to the current tab.
          setSearchParams({ tab: activeSection }, { replace: true });
        }
      })();
      return;
    }
    setActiveSection(resolved);
  }, [searchParams, activeSection, isDirty, confirm, setSearchParams]);

  const handleSectionChange = async (sectionId: string) => {
    if (sectionId === activeSection) return;
    if (isDirty) {
      const ok = await confirm({
        title: 'Ungespeicherte Änderungen',
        message: 'Du hast ungespeicherte Änderungen. Trotzdem den Reiter wechseln?',
        confirmText: 'Wechseln',
        cancelText: 'Bleiben',
        confirmVariant: 'warning',
      });
      if (!ok) return;
      setIsDirty(false);
    }
    setActiveSection(sectionId);
    setSearchParams({ tab: sectionId }, { replace: true });
  };

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
    <div className="flex flex-col md:grid md:grid-cols-[280px_1fr] h-full animate-in fade-in">
      {/* Sidebar Navigation - horizontal tabs on mobile, vertical sidebar on md+ */}
      <div className="border-b md:border-b-0 md:border-r border-border flex flex-col animate-in slide-in-from-left">
        <div className="hidden md:flex p-6 pb-4 border-b border-border items-center gap-3">
          <SettingsIcon className="size-7 text-primary shrink-0" />
          <div>
            <h2 className="text-xl font-bold text-foreground leading-tight">Einstellungen</h2>
            <p className="text-xs text-muted-foreground font-medium">System-Konfiguration</p>
          </div>
        </div>

        {/* Mobile: horizontal scrollable tabs */}
        <div className="md:hidden overflow-x-auto scrollbar-none">
          <nav className="flex gap-0.5 p-2">
            {sections.map(section => (
              <button
                key={section.id}
                type="button"
                className={cn(
                  'flex items-center gap-2 px-3 py-2 text-nowrap text-sm shrink-0 rounded-md transition-colors',
                  activeSection === section.id
                    ? 'text-foreground font-semibold bg-muted'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => void handleSectionChange(section.id)}
              >
                <div className={cn('shrink-0', activeSection === section.id && 'text-primary')}>
                  {section.icon}
                </div>
                <span>{section.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Desktop: vertical sidebar */}
        <ScrollArea className="hidden md:flex flex-1 min-h-0">
          <nav className="p-3 flex flex-col gap-0.5">
            {sections.map(section => (
              <button
                key={section.id}
                type="button"
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 text-left rounded-md transition-colors',
                  activeSection === section.id
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => void handleSectionChange(section.id)}
              >
                <div className={cn('shrink-0', activeSection === section.id && 'text-primary')}>
                  {section.icon}
                </div>
                <div className="flex flex-col gap-0.5">
                  <span
                    className={cn(
                      'text-sm leading-tight',
                      activeSection === section.id ? 'font-semibold' : 'font-medium'
                    )}
                  >
                    {section.label}
                  </span>
                  <span className="text-xs text-muted-foreground leading-snug">
                    {section.description}
                  </span>
                </div>
              </button>
            ))}
          </nav>
        </ScrollArea>
      </div>

      {/* Main Content Area */}
      <ScrollArea className="flex-1">
        <div className="max-w-225 p-6 max-md:p-4">{renderContent()}</div>
      </ScrollArea>

      {ConfirmDialog}
    </div>
  );
}

export default Settings;
