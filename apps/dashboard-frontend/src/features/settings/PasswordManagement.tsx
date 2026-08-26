import { useState, useEffect } from 'react';
import { Eye, EyeOff, Check, X, AlertCircle, AlertTriangle, Info, Lock, Zap } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Button } from '@/components/ui/shadcn/button';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Section } from '@/components/ui/Section';
import { cn } from '@/lib/utils';

interface PasswordRequirements {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}

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

interface PasswordManagementProps {
  /**
   * Meldet nach oben, ob im Formular etwas steht, das noch nicht abgeschickt
   * ist. Bis Plan 023 C6 hat das nur der KI-Bereich gemeldet: die
   * Passwortverwaltung hielt eingetippte Felder ueber einen Bereichswechsel
   * hinweg, ohne dass die Kopfzeile davon wusste (Befund F-41). Wer die Seite
   * wechselte, verlor die Eingabe wortlos.
   */
  onDirtyChange?: (dirty: boolean) => void;
}

function PasswordManagement({ onDirtyChange }: PasswordManagementProps = {}) {
  const api = useApi();
  const { logout } = useAuth();
  const toast = useToast();
  // Seit Phase B4 (26.08.2026) gibt es nur noch das Dashboard-Passwort; der
  // MinIO-Reiter ist mit dem Objektspeicher gefallen.
  const [passwords, setPasswords] = useState<PasswordFields>({
    current: '',
    new: '',
    confirm: '',
  });
  const [showPasswords, setShowPasswords] = useState<ShowPasswordFields>({
    current: false,
    new: false,
    confirm: false,
  });
  const etwasEingetippt = Object.values(passwords).some(wert => wert.length > 0);
  useEffect(() => {
    onDirtyChange?.(etwasEingetippt);
  }, [etwasEingetippt, onDirtyChange]);
  // Beim Verlassen zuruecksetzen, sonst bliebe die Meldung in der Kopfzeile
  // stehen, nachdem der Bereich weg ist.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const [requirements, setRequirements] = useState<PasswordRequirements | null>(null);
  const [validations, setValidations] = useState({
    minLength: false,
    uppercase: false,
    lowercase: false,
    number: false,
    special: false,
    match: false,
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  useEffect(() => {
    fetchPasswordRequirements();
  }, []);

  useEffect(() => {
    validatePassword();
  }, [passwords]);

  const fetchPasswordRequirements = async () => {
    try {
      const data = await api.get<{ requirements: PasswordRequirements }>(
        '/settings/password-requirements',
        { showError: false }
      );
      setRequirements(data.requirements);
    } catch (error) {
      console.error('Failed to fetch password requirements:', error);
    }
  };

  const validatePassword = () => {
    const newPass = passwords.new;
    const confirmPass = passwords.confirm;

    if (!requirements) return;

    setValidations({
      minLength: newPass.length >= requirements.minLength,
      uppercase: requirements.requireUppercase ? /[A-Z]/.test(newPass) : true,
      lowercase: requirements.requireLowercase ? /[a-z]/.test(newPass) : true,
      number: requirements.requireNumbers ? /[0-9]/.test(newPass) : true,
      special: requirements.requireSpecialChars
        ? /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPass)
        : true,
      match: newPass.length > 0 && newPass === confirmPass,
    });
  };

  const handleInputChange = (field: keyof PasswordFields, value: string) => {
    setPasswords(prev => ({ ...prev, [field]: value }));
    setMessage(null);
  };

  const togglePasswordVisibility = (field: keyof ShowPasswordFields) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const isFormValid = () =>
    passwords.current &&
    passwords.new &&
    passwords.confirm &&
    Object.values(validations).every(v => v === true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isFormValid()) {
      setMessage({
        type: 'error',
        text: 'Bitte alle Felder und Anforderungen prüfen',
      });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const data = await api.post<{ message?: string }>(
        '/settings/password/dashboard',
        {
          currentPassword: passwords.current,
          newPassword: passwords.new,
        },
        { showError: false }
      );

      toast.success(data.message || 'Passwort erfolgreich geändert');

      setPasswords({ current: '', new: '', confirm: '' });

      // P2.1.5: previous code did setTimeout + localStorage.removeItem +
      // location.href, which kept the just-changed-from token valid for its
      // full TTL because no /auth/logout was called. Properly blacklist the
      // token server-side now and clear React Query cache + cookies via
      // AuthContext.logout().
      setTimeout(() => {
        logout().finally(() => {
          window.location.href = '/';
        });
      }, 2000);
    } catch (error: unknown) {
      const err = error as { message?: string };
      setMessage({
        type: 'error',
        text: err.message || 'Fehler beim Ändern des Passworts',
      });
    } finally {
      setLoading(false);
    }
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
          type={showPasswords[field] ? 'text' : 'password'}
          value={passwords[field]}
          onChange={e => handleInputChange(field, e.target.value)}
          placeholder={placeholder}
          required
          // Mirror the backend limit (PasswordChangeBody: .max(500)) so the
          // client rejects over-long input before the round-trip.
          maxLength={500}
          // P2.7.5: signal correct intent to the browser's password manager.
          // Without this hint, browsers may try to autofill the new-password
          // field with the current saved password.
          autoComplete={field === 'current' ? 'current-password' : 'new-password'}
          className="pr-10"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 -translate-y-1/2 size-8"
          onClick={() => togglePasswordVisibility(field)}
          aria-label={showPasswords[field] ? 'Passwort verbergen' : 'Passwort anzeigen'}
        >
          {showPasswords[field] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    // Fragment, kein div: so ist der Abschnitt ein Geschwister der uebrigen
    // Abschnitte in SecuritySettings, und die SectionList dort entscheidet
    // ueber seine Trennlinie. In einem div waere er versteckt und traege sie
    // auch dann, wenn er der letzte auf der Seite ist.
    <>
      <Section
        title="Passwortverwaltung"
        icon={<Lock />}
        description="Ändere das Passwort für das Dashboard"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {renderPasswordField(
            'current',
            'Aktuelles Dashboard-Passwort',
            'Dashboard-Passwort eingeben',
            'Zur Sicherheit wird dein aktuelles Passwort benötigt'
          )}
          {renderPasswordField('new', 'Neues Passwort', 'Neues Passwort eingeben')}
          {renderPasswordField('confirm', 'Passwort bestätigen', 'Neues Passwort bestätigen')}

          {/* Password Requirements */}
          {requirements && passwords.new && (
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

          {/* Message */}
          {message && (
            <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
              <AlertCircle className="size-4" />
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button type="submit" loading={loading} disabled={!isFormValid()}>
              Passwort ändern
            </Button>
          </div>

          {/* Es gibt bewusst kein Zuruecksetzen per Mail: dafuer braeuchte das
                Geraet einen Postausgang nach draussen. Der Weg fuehrt deshalb
                ueber das Geraet selbst. Bis Plan 023 C6 stand hier nur der
                nackte Pfad „scripts/security/reset-password.sh", ohne zu sagen,
                auf welchem Rechner und in welchem Ordner (Befund F-22). */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p>
                Passwort vergessen? Dann hilft nur der Zugang zum Gerät selbst, über SSH oder mit
                Tastatur und Bildschirm. Das ist Absicht: ein Zurücksetzen per Mail bräuchte einen
                Weg nach draußen.
              </p>
              <p>
                Melde dich am Gerät an, wechsle in den Ordner, in den Arasul installiert wurde, und
                starte dort:
              </p>
              <code className="block w-fit rounded bg-muted px-1.5 py-1 font-mono text-foreground">
                ./scripts/security/reset-password.sh dein-benutzername
              </code>
              <p>
                Ohne Benutzernamen nimmt das Skript <code className="font-mono">admin</code>. Es
                setzt das Passwort direkt in der Datenbank neu und fragt vorher nach.
              </p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            <AlertTriangle className="size-3.5 inline" /> Nach dem Ändern des Dashboard-Passworts
            wirst du automatisch abgemeldet.
          </p>
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
      </Section>
    </>
  );
}

export default PasswordManagement;
