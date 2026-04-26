import { LogOut, MonitorOff } from 'lucide-react';
import PasswordManagement from './PasswordManagement';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { Button } from '@/components/ui/shadcn/button';

interface SecuritySettingsProps {
  handleLogout: () => void;
  loggingOutAll: boolean;
  onLogoutAll: () => void;
}

export function SecuritySettings({
  handleLogout,
  loggingOutAll,
  onLogoutAll,
}: SecuritySettingsProps) {
  return (
    <div className="animate-in fade-in">
      <div className="mb-8 pb-6 border-b border-border">
        <h1 className="text-2xl font-bold text-foreground mb-2">Sicherheit</h1>
        <p className="text-sm text-muted-foreground">Passwörter verwalten und Sitzungen beenden</p>
      </div>

      <div className="flex flex-col gap-8">
        <ComponentErrorBoundary componentName="Passwortverwaltung">
          <PasswordManagement />
        </ComponentErrorBoundary>

        <div className="pt-6 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
            <LogOut className="size-4 text-muted-foreground" />
            Sitzungen
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Beenden Sie Ihre aktuelle Sitzung oder melden Sie sich auf allen Geräten ab.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="size-4" /> Abmelden
            </Button>
            <Button variant="outline" onClick={onLogoutAll} disabled={loggingOutAll}>
              <MonitorOff className="size-4" />
              {loggingOutAll ? 'Wird abgemeldet...' : 'Von allen Geräten abmelden'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
