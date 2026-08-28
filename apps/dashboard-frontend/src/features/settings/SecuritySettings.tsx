import { useState } from 'react';
import { Download, LogOut, MonitorOff, ShieldCheck } from 'lucide-react';
import PasswordManagement from './PasswordManagement';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { Button } from '@/components/ui/shadcn/button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section, SectionList } from '@/components/ui/Section';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';

interface SecuritySettingsProps {
  handleLogout: () => void;
  loggingOutAll: boolean;
  onLogoutAll: () => void;
  /** Reicht die Meldung der Passwortverwaltung an die Kopfzeile durch. */
  onDirtyChange?: (dirty: boolean) => void;
}

export function SecuritySettings({
  handleLogout,
  loggingOutAll,
  onLogoutAll,
  onDirtyChange,
}: SecuritySettingsProps) {
  const api = useApi();
  const toast = useToast();
  const [ladeZertifikat, setLadeZertifikat] = useState(false);

  /**
   * Das CA-Zertifikat des Geräts herunterladen.
   *
   * Es ist die Antwort auf die Warnung, die jeder Mitarbeiter beim ersten
   * Aufruf sieht: das Gerät stellt sein TLS-Zertifikat selbst aus, und solange
   * niemand seine CA kennt, traut ihm kein Browser. Der Admin lädt die Datei
   * einmal herunter und verteilt sie; danach ist Ruhe, auch nach einer
   * Erneuerung des Zertifikats.
   */
  const zertifikatLaden = async () => {
    setLadeZertifikat(true);
    try {
      const res = await api.get<Response>('/system/ca-zertifikat', {
        raw: true,
        showError: false,
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'arasul-ca.crt';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success('Gerätezertifikat heruntergeladen');
    } catch (err) {
      const e = err as { status?: number };
      if (e.status === 404) {
        toast.error('Dieses Gerät hat noch kein CA-Zertifikat.');
      } else if (e.status === 403) {
        toast.error('Nur Admins dürfen das Gerätezertifikat herunterladen.');
      } else {
        toast.error('Gerätezertifikat konnte nicht geladen werden.');
      }
    } finally {
      setLadeZertifikat(false);
    }
  };

  return (
    <div className="animate-in fade-in" data-testid="sicherheit-seite">
      <PageHeader title="Sicherheit" description="Passwörter verwalten und Sitzungen beenden" />

      <SectionList>
        <ComponentErrorBoundary componentName="Passwortverwaltung">
          <PasswordManagement onDirtyChange={onDirtyChange} />
        </ComponentErrorBoundary>

        <Section
          title="Gerätezertifikat"
          icon={<ShieldCheck />}
          description="Die Datei einmal herunterladen und auf den Rechnern der Firma installieren. Danach zeigt der Browser kein Warnschild mehr, wenn jemand dieses Gerät aufruft."
        >
          <div className="flex flex-col gap-3">
            <Button variant="outline" onClick={zertifikatLaden} disabled={ladeZertifikat}>
              <Download className="size-4" />
              {ladeZertifikat ? 'Wird geladen...' : 'Zertifikat herunterladen'}
            </Button>
            <p className="text-sm text-muted-foreground">
              Wie die Datei auf Windows, macOS, iOS und Android installiert wird, steht in der
              Anleitung {'\u201eNetzname und Zertifikat\u201c'} im Handbuch.
            </p>
          </div>
        </Section>

        <Section
          title="Sitzungen"
          icon={<LogOut />}
          description="Beende die aktuelle Sitzung oder melde dich auf allen Geräten ab."
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
      </SectionList>
    </div>
  );
}
