import { useCallback, useState } from 'react';
import {
  Lock,
  Eye,
  EyeOff,
  Check,
  X,
  AlertTriangle,
  Info,
  Monitor,
  HardDrive,
  Zap,
} from 'lucide-react';
import useConfirm from '../../../hooks/useConfirm';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Button } from '@/components/ui/shadcn/button';
import StatusMessage from '../../../components/ui/StatusMessage';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/shadcn/tabs';
import { cn } from '@/lib/utils';
import { usePasswordRequirementsQuery } from '../hooks/queries';
import { useChangePasswordMutation } from '../hooks/mutations';

interface PasswordFields {
  current: string;
  new: string;
  confirm: string;
}

interface ShowPasswordFields {
  current: boolean;
  new: boolean;
  confirm: boolean;
}

type ServiceId = 'dashboard' | 'minio';

const SERVICES: { id: ServiceId; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <Monitor className="size-4" /> },
  { id: 'minio', label: 'MinIO', icon: <HardDrive className="size-4" /> },
];

function PasswordManagement() {
  const { confirm, ConfirmDialog } = useConfirm();
  const { data: requirements } = usePasswordRequirementsQuery();
  const changePassword = useChangePasswordMutation();

  const [activeService, setActiveService] = useState<ServiceId>('dashboard');
  const [passwords, setPasswords] = useState<Record<ServiceId, PasswordFields>>({
    dashboard: { current: '', new: '', confirm: '' },
    minio: { current: '', new: '', confirm: '' },
  });
  const [showPasswords, setShowPasswords] = useState<Record<ServiceId, ShowPasswordFields>>({
    dashboard: { current: false, new: false, confirm: false },
    minio: { current: false, new: false, confirm: false },
  });
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  const loading = changePassword.isPending;

  // Validations derived from current input + server requirements (no useState needed)
  const newPass = passwords[activeService]?.new ?? '';
  const confirmPass = passwords[activeService]?.confirm ?? '';
  const validations = requirements
    ? {
        minLength: newPass.length >= requirements.minLength,
        uppercase: requirements.requireUppercase ? /[A-Z]/.test(newPass) : true,
        lowercase: requirements.requireLowercase ? /[a-z]/.test(newPass) : true,
        number: requirements.requireNumbers ? /[0-9]/.test(newPass) : true,
        special: requirements.requireSpecialChars
          ? /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(newPass)
          : true,
        match: newPass.length > 0 && newPass === confirmPass,
      }
    : {
        minLength: false,
        uppercase: false,
        lowercase: false,
        number: false,
        special: false,
        match: false,
      };

  const handleInputChange = (service: ServiceId, field: keyof PasswordFields, value: string) => {
    setPasswords(prev => ({
      ...prev,
      [service]: { ...prev[service], [field]: value },
    }));
    setMessage(null);
  };

  const togglePasswordVisibility = (service: ServiceId, field: keyof ShowPasswordFields) => {
    setShowPasswords(prev => ({
      ...prev,
      [service]: { ...prev[service], [field]: !prev[service][field] },
    }));
  };

  const handleServiceSwitch = useCallback(
    async (newService: string) => {
      const current = passwords[activeService];
      const hasInput = current.current || current.new || current.confirm;

      if (hasInput) {
        const confirmed = await confirm({
          title: 'Ungespeicherte Eingaben',
          message: 'Die eingegebenen Passwörter gehen beim Wechsel verloren. Fortfahren?',
          confirmText: 'Fortfahren',
          confirmVariant: 'warning',
        });
        if (!confirmed) return;
      }

      setPasswords(prev => ({
        ...prev,
        [activeService]: { current: '', new: '', confirm: '' },
      }));
      setActiveService(newService as ServiceId);
      setMessage(null);
    },
    [activeService, passwords, confirm]
  );

  const isFormValid = () => {
    const current = passwords[activeService];
    return (
      current.current &&
      current.new &&
      current.confirm &&
      Object.values(validations).every(v => v === true)
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!isFormValid()) {
      setMessage({
        type: 'error',
        text: 'Bitte überprüfen Sie alle Felder und Anforderungen',
      });
      return;
    }

    setMessage(null);

    changePassword.mutate(
      {
        service: activeService,
        currentPassword: passwords[activeService].current,
        newPassword: passwords[activeService].new,
      },
      {
        onSuccess: data => {
          setMessage({
            type: 'success',
            text: data.message || 'Passwort erfolgreich geändert',
          });
          setPasswords(prev => ({
            ...prev,
            [activeService]: { current: '', new: '', confirm: '' },
          }));

          if (activeService === 'dashboard') {
            setTimeout(() => {
              localStorage.removeItem('arasul_token');
              localStorage.removeItem('arasul_user');
              window.location.href = '/';
            }, 2000);
          }
        },
        onError: error => {
          const err = error as { message?: string };
          setMessage({
            type: 'error',
            text: err.message || 'Fehler beim Ändern des Passworts',
          });
        },
      }
    );
  };

  const renderPasswordField = (
    field: keyof PasswordFields,
    label: string,
    placeholder: string,
    hint?: string
  ) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          type={showPasswords[activeService][field] ? 'text' : 'password'}
          value={passwords[activeService][field]}
          onChange={e => handleInputChange(activeService, field, e.target.value)}
          placeholder={placeholder}
          required
          className="pr-10"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 -translate-y-1/2 size-8"
          onClick={() => togglePasswordVisibility(activeService, field)}
          aria-label={
            showPasswords[activeService][field] ? 'Passwort verbergen' : 'Passwort anzeigen'
          }
        >
          {showPasswords[activeService][field] ? (
            <EyeOff className="size-4" />
          ) : (
            <Eye className="size-4" />
          )}
        </Button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <div>
      {ConfirmDialog}

      <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
        <Lock className="size-4 text-muted-foreground" />
        Passwortverwaltung
      </h3>
      <p className="text-xs text-muted-foreground mb-6">
        Ändern Sie die Passwörter für Dashboard und MinIO
      </p>

      <div className="space-y-6">
        {/* Service Selector */}
        <Tabs value={activeService} onValueChange={handleServiceSwitch}>
          <TabsList variant="line" className="w-full">
            {SERVICES.map(service => (
              <TabsTrigger key={service.id} value={service.id} className="flex-1">
                {service.icon}
                <span>{service.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Password Change Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {renderPasswordField(
            'current',
            'Aktuelles Dashboard-Passwort',
            'Dashboard-Passwort eingeben',
            activeService === 'dashboard'
              ? 'Zur Sicherheit wird Ihr aktuelles Passwort benötigt'
              : 'Zur Bestätigung wird Ihr Dashboard-Admin-Passwort benötigt'
          )}
          {renderPasswordField('new', 'Neues Passwort', 'Neues Passwort eingeben')}
          {renderPasswordField('confirm', 'Passwort bestätigen', 'Neues Passwort bestätigen')}

          {/* Password Requirements */}
          {requirements && passwords[activeService].new && (
            <div className="border-l-2 border-primary/30 pl-4 space-y-2">
              <h4 className="text-sm font-semibold text-foreground">Passwortanforderungen</h4>
              <ul className="space-y-1">
                <li
                  className={cn(
                    'flex items-center gap-2 text-xs',
                    validations.minLength ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {validations.minLength ? (
                    <Check className="size-3.5" />
                  ) : (
                    <X className="size-3.5" />
                  )}
                  Mindestens {requirements.minLength} Zeichen
                </li>
                {requirements.requireUppercase && (
                  <li
                    className={cn(
                      'flex items-center gap-2 text-xs',
                      validations.uppercase ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {validations.uppercase ? (
                      <Check className="size-3.5" />
                    ) : (
                      <X className="size-3.5" />
                    )}
                    Mindestens ein Großbuchstabe
                  </li>
                )}
                {requirements.requireLowercase && (
                  <li
                    className={cn(
                      'flex items-center gap-2 text-xs',
                      validations.lowercase ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {validations.lowercase ? (
                      <Check className="size-3.5" />
                    ) : (
                      <X className="size-3.5" />
                    )}
                    Mindestens ein Kleinbuchstabe
                  </li>
                )}
                {requirements.requireNumbers && (
                  <li
                    className={cn(
                      'flex items-center gap-2 text-xs',
                      validations.number ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {validations.number ? (
                      <Check className="size-3.5" />
                    ) : (
                      <X className="size-3.5" />
                    )}
                    Mindestens eine Zahl
                  </li>
                )}
                {requirements.requireSpecialChars && (
                  <li
                    className={cn(
                      'flex items-center gap-2 text-xs',
                      validations.special ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {validations.special ? (
                      <Check className="size-3.5" />
                    ) : (
                      <X className="size-3.5" />
                    )}
                    Mindestens ein Sonderzeichen
                  </li>
                )}
                <li
                  className={cn(
                    'flex items-center gap-2 text-xs',
                    validations.match ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {validations.match ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                  Passwörter stimmen überein
                </li>
              </ul>
            </div>
          )}

          <StatusMessage message={message as { type: 'success' | 'error'; text: string } | null} />

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button type="submit" disabled={!isFormValid() || loading}>
              {loading ? 'Wird geändert...' : 'Passwort ändern'}
            </Button>
          </div>

          {activeService === 'dashboard' && (
            <p className="text-xs text-muted-foreground text-center">
              <AlertTriangle className="size-3.5 inline" /> Nach dem Ändern des Dashboard-Passworts
              werden Sie automatisch abgemeldet.
            </p>
          )}

          {activeService === 'minio' && (
            <p className="text-xs text-muted-foreground text-center">
              <Info className="size-3.5 inline" /> Der MinIO-Service wird nach der Passwortänderung
              automatisch neu gestartet.
            </p>
          )}
        </form>

        {/* n8n info */}
        <div className="mt-6 pt-6 border-t border-border">
          <div className="flex items-start gap-3 text-sm">
            <Zap className="size-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">n8n-Passwort</p>
              <p className="text-xs text-muted-foreground mt-1">
                n8n verwaltet Benutzerkonten und Passwörter selbst. Öffne{' '}
                <a
                  href="/n8n"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  n8n
                </a>{' '}
                → Settings → Personal Settings, um dein n8n-Passwort zu ändern.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PasswordManagement;
