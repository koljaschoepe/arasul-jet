import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Settings as SettingsIcon,
  Upload,
  Wrench,
  Lock,
  Info,
  Server,
  User,
  Globe,
  Zap,
  ShieldAlert,
} from 'lucide-react';
import UpdatePage from '../system/UpdatePage';
import SelfHealingEvents from '../system/SelfHealingEvents';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { ScrollArea } from '@/components/ui/shadcn/scroll-area';
import { cn } from '@/lib/utils';
import { useApi } from '../../hooks/useApi';
import {
  UnsavedChangesProvider,
  useUnsavedChangesGate,
} from '../../contexts/UnsavedChangesContext';
import { GeneralSettings } from './components/GeneralSettings';
import { AIProfileSettings } from './components/AIProfileSettings';
import { ServicesSettings } from './components/ServicesSettings';
import { SecuritySettings } from './components/SecuritySettings';
import { RemoteAccessSettings } from './components/RemoteAccessSettings';
import { N8nIntegrationSettings } from './components/N8nIntegrationSettings';
import { PrivacySettings } from './components/PrivacySettings';

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
    id: 'ai-profile',
    label: 'KI-Profil',
    icon: <User className="size-5" />,
    description: 'Firmen- und KI-Verhalten konfigurieren',
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
    description: 'DSGVO: Datenexport und Recht auf Löschung',
  },
  {
    id: 'services',
    label: 'Services',
    icon: <Server className="size-5" />,
    description: 'Dienste verwalten und neustarten',
  },
  {
    id: 'remote-access',
    label: 'Fernzugriff',
    icon: <Globe className="size-5" />,
    description: 'Tailscale VPN und Remote-Zugriff',
  },
  {
    id: 'n8n',
    label: 'n8n Integration',
    icon: <Zap className="size-5" />,
    description: 'Workflow-Anbindung & API-Zugriff',
  },
  {
    id: 'updates',
    label: 'Updates',
    icon: <Upload className="size-5" />,
    description: 'System-Updates verwalten',
  },
  {
    id: 'selfhealing',
    label: 'Self-Healing',
    icon: <Wrench className="size-5" />,
    description: 'Automatische Wiederherstellung',
  },
];

const VALID_SECTIONS = new Set(sections.map(s => s.id));
const DEFAULT_SECTION = 'general';

function SettingsInner({ handleLogout, theme, onToggleTheme }: SettingsProps) {
  const api = useApi();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const confirmDiscard = useUnsavedChangesGate();

  // Active section is driven by URL — `?tab=ai-profile` etc. — so deep links
  // and back/forward navigation work. Falls back to 'general' for missing or
  // invalid tabs (so old bookmarks don't break).
  const tabParam = searchParams.get('tab');
  const activeSection = tabParam && VALID_SECTIONS.has(tabParam) ? tabParam : DEFAULT_SECTION;

  const setActiveSection = useCallback(
    (id: string) => {
      // Confirm discard if any sub-component reports unsaved changes
      if (id !== activeSection && !confirmDiscard()) return;
      const next = new URLSearchParams(searchParams);
      if (id === DEFAULT_SECTION) {
        next.delete('tab');
      } else {
        next.set('tab', id);
      }
      // `replace: true` so back-button doesn't bounce through every tab visit
      setSearchParams(next, { replace: true });
    },
    [activeSection, confirmDiscard, searchParams, setSearchParams]
  );

  const handleLogoutAll = async () => {
    setLoggingOutAll(true);
    try {
      await api.post('/auth/logout-all', null, { showError: false });
    } catch {
      // Even if API fails, proceed with local logout
    }
    handleLogout();
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'general':
        return (
          <ComponentErrorBoundary componentName="Allgemein">
            <GeneralSettings theme={theme} onToggleTheme={onToggleTheme} />
          </ComponentErrorBoundary>
        );
      case 'ai-profile':
        return (
          <ComponentErrorBoundary componentName="KI-Profil">
            <AIProfileSettings />
          </ComponentErrorBoundary>
        );
      case 'security':
        return (
          <ComponentErrorBoundary componentName="Sicherheit">
            <SecuritySettings
              handleLogout={handleLogout}
              loggingOutAll={loggingOutAll}
              onLogoutAll={handleLogoutAll}
            />
          </ComponentErrorBoundary>
        );
      case 'privacy':
        return (
          <ComponentErrorBoundary componentName="Datenschutz">
            <PrivacySettings handleLogout={handleLogout} />
          </ComponentErrorBoundary>
        );
      case 'services':
        return (
          <ComponentErrorBoundary componentName="Services">
            <ServicesSettings />
          </ComponentErrorBoundary>
        );
      case 'remote-access':
        return (
          <ComponentErrorBoundary componentName="Fernzugriff">
            <RemoteAccessSettings />
          </ComponentErrorBoundary>
        );
      case 'n8n':
        return (
          <ComponentErrorBoundary componentName="n8n Integration">
            <N8nIntegrationSettings />
          </ComponentErrorBoundary>
        );
      case 'updates':
        return (
          <ComponentErrorBoundary componentName="Updates">
            <UpdatePage />
          </ComponentErrorBoundary>
        );
      case 'selfhealing':
        return (
          <ComponentErrorBoundary componentName="Self-Healing">
            <SelfHealingEvents />
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
                onClick={() => setActiveSection(section.id)}
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
                onClick={() => setActiveSection(section.id)}
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
        <div className="max-w-[900px] p-6 max-md:p-4">{renderContent()}</div>
      </ScrollArea>
    </div>
  );
}

/**
 * Settings — wraps the inner page with UnsavedChangesProvider so any
 * settings sub-form (currently AIProfileSettings, but extensible) can mark
 * itself dirty via useUnsavedChangesGuard. Tab switches then prompt before
 * discarding edits.
 */
function Settings(props: SettingsProps) {
  return (
    <UnsavedChangesProvider>
      <SettingsInner {...props} />
    </UnsavedChangesProvider>
  );
}

export default Settings;
