import { LogOut, MonitorOff } from 'lucide-react';
import PasswordManagement from './PasswordManagement';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { Button } from '@/components/ui/shadcn/button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';

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
      <PageHeader title="Sicherheit" description="Passwörter verwalten und Sitzungen beenden" />

      <div className="flex flex-col gap-8">
        <ComponentErrorBoundary componentName="Passwortverwaltung">
          <PasswordManagement />
        </ComponentErrorBoundary>

        <Section
          title="Sitzungen"
          icon={<LogOut />}
          description="Beende die aktuelle Sitzung oder melde dich auf allen Geräten ab."
          divider={false}
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="size-4" /> Abmelden
            </Button>
            <Button variant="outline" onClick={onLogoutAll} disabled={loggingOutAll}>
              <MonitorOff className="size-4" />
              {loggingOutAll ? 'Wird abgemeldet...' : 'Von allen Geräten abmelden'}
            </Button>
          </div>
        </Section>
      </div>
    </div>
  );
}
