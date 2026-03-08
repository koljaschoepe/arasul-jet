import { useState } from 'react';
import {
  Settings as SettingsIcon,
  Upload,
  Wrench,
  Lock,
  Info,
  ChevronRight,
  Server,
  LogOut,
  User,
  MonitorOff,
} from 'lucide-react';
import UpdatePage from '../system/UpdatePage';
import SelfHealingEvents from '../system/SelfHealingEvents';
import PasswordManagement from './PasswordManagement';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { ScrollArea } from '@/components/ui/shadcn/scroll-area';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import { cn } from '@/lib/utils';
import { useApi } from '../../hooks/useApi';
import { GeneralSettings } from './GeneralSettings';
import { AIProfileSettings } from './AIProfileSettings';
import { ServicesSettings } from './ServicesSettings';

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
    label: 'General',
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
          <div className="animate-in fade-in">
            <div className="mb-8 pb-6 border-b border-border">
              <h1 className="settings-section-title text-3xl font-bold text-foreground mb-2">Sicherheit</h1>
              <p className="text-sm text-muted-foreground">
                Passwörter verwalten und Sitzungen beenden
              </p>
            </div>

            <div className="flex flex-col gap-6">
              <ComponentErrorBoundary componentName="Passwortverwaltung">
                <PasswordManagement />
              </ComponentErrorBoundary>

              <Card>
                <CardContent className="pt-6">
                  <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground mb-2">
                    <LogOut className="size-5" /> Sitzungen
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Beenden Sie Ihre aktuelle Sitzung oder melden Sie sich auf allen Geräten ab.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button variant="outline" onClick={handleLogout}>
                      <LogOut className="size-4" /> Abmelden
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleLogoutAll}
                      disabled={loggingOutAll}
                    >
                      <MonitorOff className="size-4" />
                      {loggingOutAll ? 'Wird abgemeldet...' : 'Von allen Geräten abmelden'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
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
    <div className="settings-layout grid grid-cols-1 md:grid-cols-[280px_1fr] h-[calc(100vh-4rem)] animate-in fade-in">
      {/* Sidebar Navigation */}
      <div className="settings-sidebar bg-card border-r border-border flex flex-col animate-in slide-in-from-left">
        <div className="p-6 pb-4 border-b border-border bg-gradient-to-b from-primary/5 to-transparent flex items-center gap-3">
          <SettingsIcon className="size-7 text-primary shrink-0" />
          <div>
            <h2 className="text-lg font-bold text-foreground leading-tight">Einstellungen</h2>
            <p className="text-xs text-muted-foreground font-medium">System-Konfiguration</p>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <nav className="settings-nav p-3 flex flex-col gap-1">
            {sections.map(section => (
              <button
                key={section.id}
                type="button"
                className={cn(
                  'settings-nav-item flex items-center justify-between px-3 py-3 rounded-lg border border-transparent text-left transition-all duration-200 group',
                  activeSection === section.id
                    ? 'active bg-primary/10 border-primary/20 text-primary'
                    : 'text-muted-foreground hover:bg-primary/5 hover:border-primary/10 hover:pl-4'
                )}
                onClick={() => setActiveSection(section.id)}
              >
                <div className="settings-nav-item-content flex items-center gap-3 flex-1">
                  <div className={cn(
                    'settings-nav-item-icon shrink-0 transition-all duration-200',
                    activeSection === section.id ? 'text-primary scale-110' : 'group-hover:text-primary group-hover:scale-110'
                  )}>
                    {section.icon}
                  </div>
                  <div className="settings-nav-item-text flex flex-col gap-0.5">
                    <span className="settings-nav-item-label text-sm font-semibold leading-tight">
                      {section.label}
                    </span>
                    <span className={cn(
                      'settings-nav-item-description text-xs leading-snug transition-colors duration-200',
                      activeSection === section.id ? 'text-muted-foreground' : 'text-muted-foreground/70'
                    )}>
                      {section.description}
                    </span>
                  </div>
                </div>
                <ChevronRight className={cn(
                  'settings-nav-item-arrow size-4 shrink-0 transition-all duration-200',
                  activeSection === section.id
                    ? 'opacity-100 text-primary translate-x-0.5'
                    : 'opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5'
                )} />
              </button>
            ))}
          </nav>
        </ScrollArea>
      </div>

      {/* Main Content Area */}
      <ScrollArea className="settings-content-area bg-background">
        <div className="settings-content-wrapper max-w-[900px] p-8">
          {renderContent()}
        </div>
      </ScrollArea>
    </div>
  );
}

export default Settings;
