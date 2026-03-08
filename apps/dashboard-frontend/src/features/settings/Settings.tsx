import { useState } from 'react';
import {
  Settings as SettingsIcon,
  Upload,
  Wrench,
  Lock,
  Info,
  ChevronRight,
  Server,
  User,
} from 'lucide-react';
import UpdatePage from '../system/UpdatePage';
import SelfHealingEvents from '../system/SelfHealingEvents';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { ScrollArea } from '@/components/ui/shadcn/scroll-area';
import { cn } from '@/lib/utils';
import { useApi } from '../../hooks/useApi';
import { GeneralSettings } from './GeneralSettings';
import { AIProfileSettings } from './AIProfileSettings';
import { ServicesSettings } from './ServicesSettings';
import { SecuritySettings } from './SecuritySettings';

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
    id: 'services',
    label: 'Services',
    icon: <Server className="size-5" />,
    description: 'Dienste verwalten und neustarten',
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

function Settings({ handleLogout, theme, onToggleTheme }: SettingsProps) {
  const api = useApi();
  // TODO: warn about unsaved changes on tab switch
  // This would require lifting hasChanges state from sub-components (AIProfileSettings etc.)
  // or implementing a shared context. Skipping for now to avoid over-engineering.
  const [activeSection, setActiveSection] = useState('general');
  const [loggingOutAll, setLoggingOutAll] = useState(false);

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
      case 'services':
        return (
          <ComponentErrorBoundary componentName="Services">
            <ServicesSettings />
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
      <div className="bg-card border-b md:border-b-0 md:border-r border-border flex flex-col animate-in slide-in-from-left">
        <div className="hidden md:flex p-6 pb-4 border-b border-border bg-gradient-to-b from-primary/5 to-transparent items-center gap-3">
          <SettingsIcon className="size-7 text-primary shrink-0" />
          <div>
            <h2 className="text-xl font-bold text-foreground leading-tight">Einstellungen</h2>
            <p className="text-xs text-muted-foreground font-medium">System-Konfiguration</p>
          </div>
        </div>

        {/* Mobile: horizontal scrollable tabs */}
        <div className="md:hidden overflow-x-auto scrollbar-none">
          <nav className="flex gap-1 p-2">
            {sections.map(section => (
              <button
                key={section.id}
                type="button"
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-full border border-transparent text-nowrap text-sm font-medium transition-all duration-200 shrink-0',
                  activeSection === section.id
                    ? 'bg-primary/10 border-primary/20 text-primary'
                    : 'text-muted-foreground hover:bg-primary/5'
                )}
                onClick={() => setActiveSection(section.id)}
              >
                <div className="shrink-0">{section.icon}</div>
                <span>{section.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Desktop: vertical sidebar */}
        <ScrollArea className="hidden md:flex flex-1 min-h-0">
          <nav className="p-3 flex flex-col gap-1">
            {sections.map(section => (
              <button
                key={section.id}
                type="button"
                className={cn(
                  'flex items-center justify-between px-3 py-3 rounded-lg border border-transparent text-left transition-all duration-200 group',
                  activeSection === section.id
                    ? 'active bg-primary/10 border-primary/20 text-primary'
                    : 'text-muted-foreground hover:bg-primary/5 hover:border-primary/10 hover:pl-4'
                )}
                onClick={() => setActiveSection(section.id)}
              >
                <div className="flex items-center gap-3 flex-1">
                  <div
                    className={cn(
                      'shrink-0 transition-all duration-200',
                      activeSection === section.id
                        ? 'text-primary scale-110'
                        : 'group-hover:text-primary group-hover:scale-110'
                    )}
                  >
                    {section.icon}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold leading-tight">{section.label}</span>
                    <span
                      className={cn(
                        'text-xs leading-snug transition-colors duration-200',
                        activeSection === section.id
                          ? 'text-muted-foreground'
                          : 'text-muted-foreground/70'
                      )}
                    >
                      {section.description}
                    </span>
                  </div>
                </div>
                <ChevronRight
                  className={cn(
                    'size-4 shrink-0 transition-all duration-200',
                    activeSection === section.id
                      ? 'opacity-100 text-primary translate-x-0.5'
                      : 'opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5'
                  )}
                />
              </button>
            ))}
          </nav>
        </ScrollArea>
      </div>

      {/* Main Content Area */}
      <ScrollArea className="bg-background flex-1">
        <div className="max-w-[900px] p-6">{renderContent()}</div>
      </ScrollArea>
    </div>
  );
}

export default Settings;
