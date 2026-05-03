/**
 * InitialSetupWizard — Phase 1.2
 *
 * Wird gerendert wenn /api/auth/setup-status meldet, dass noch kein Admin
 * existiert. Erste Box-Inbetriebnahme: Customer öffnet http://arasul.local,
 * legt sich selbst einen Admin-Account an. Das ersetzt die alte „ADMIN_PASSWORD
 * im Terminal"-Methode, bei der Solo-Dev-Customers strandeten.
 */

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { Card, CardHeader, CardContent } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Button } from '@/components/ui/shadcn/button';
import { Label } from '@/components/ui/shadcn/label';
import { PLATFORM_NAME } from '@/config/branding';

const SetupSchema = z
  .object({
    username: z
      .string()
      .min(3, 'Benutzername muss mindestens 3 Zeichen lang sein')
      .max(64, 'Benutzername zu lang'),
    email: z.string().email('Bitte gültige E-Mail-Adresse eingeben'),
    password: z.string().min(12, 'Passwort muss mindestens 12 Zeichen lang sein'),
    passwordConfirm: z.string().min(1),
  })
  .refine(values => values.password === values.passwordConfirm, {
    path: ['passwordConfirm'],
    message: 'Passwörter stimmen nicht überein',
  });

type SetupFormValues = z.infer<typeof SetupSchema>;

interface PasswordRequirement {
  label?: string;
  description?: string;
  rule?: string;
}

interface SetupResponse {
  token: string;
  user: { id: number; username: string; email: string };
}

interface InitialSetupWizardProps {
  onSetupSuccess: (data: SetupResponse) => void;
}

export default function InitialSetupWizard({ onSetupSuccess }: InitialSetupWizardProps) {
  const api = useApi();
  const [error, setError] = useState('');
  const [requirements, setRequirements] = useState<PasswordRequirement[]>([]);

  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm<SetupFormValues>({
    resolver: zodResolver(SetupSchema),
    defaultValues: { username: 'admin', email: '', password: '', passwordConfirm: '' },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<{ requirements: PasswordRequirement[] }>(
          '/settings/password-requirements'
        );
        if (!cancelled && Array.isArray(data.requirements)) {
          setRequirements(data.requirements);
        }
      } catch {
        // Anforderungen sind nice-to-have — ohne läuft das Formular trotzdem.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const onSubmit = async (values: SetupFormValues) => {
    setError('');
    try {
      const data = await api.post<SetupResponse>(
        '/auth/setup-initial-admin',
        {
          username: values.username,
          email: values.email,
          password: values.password,
        },
        { showError: false }
      );
      localStorage.setItem('arasul_token', data.token);
      localStorage.setItem('arasul_user', JSON.stringify(data.user));
      onSetupSuccess(data);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Setup fehlgeschlagen. Bitte erneut versuchen.');
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-background p-4 max-md:items-start max-md:pt-[6vh] max-md:p-3">
      <Card className="w-full max-w-[520px] rounded-xl border-border bg-card p-10 shadow-lg max-md:max-w-[95vw] max-md:p-8 max-sm:p-6">
        <CardHeader className="p-0 text-center mb-7">
          <div className="size-14 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <ShieldCheck className="size-7 text-primary" />
          </div>
          <h1 className="text-2xl text-foreground mb-2 font-bold">
            Willkommen bei {PLATFORM_NAME}
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Diese Box wurde noch nicht eingerichtet. Bitte legen Sie Ihren ersten
            Administrator-Account an. Notieren Sie das Passwort sicher &mdash; ohne ihn ist kein
            Login möglich.
          </p>
        </CardHeader>

        <CardContent className="p-0">
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
            {error && (
              <div
                className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm"
                role="alert"
              >
                {error}
              </div>
            )}

            <div>
              <Label htmlFor="setup-username" className="block mb-2 text-sm font-medium">
                Benutzername *
              </Label>
              <Input
                id="setup-username"
                type="text"
                autoComplete="username"
                autoFocus
                {...register('username')}
              />
              {errors.username && (
                <p className="text-destructive text-xs mt-1">{errors.username.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="setup-email" className="block mb-2 text-sm font-medium">
                E-Mail-Adresse *
              </Label>
              <Input
                id="setup-email"
                type="email"
                autoComplete="email"
                placeholder="admin@kanzlei-mueller.de"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-destructive text-xs mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="setup-password" className="block mb-2 text-sm font-medium">
                Passwort *
              </Label>
              <Input
                id="setup-password"
                type="password"
                autoComplete="new-password"
                {...register('password')}
              />
              {errors.password && (
                <p className="text-destructive text-xs mt-1">{errors.password.message}</p>
              )}
              {requirements.length > 0 && (
                <ul className="mt-2 text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
                  {requirements.map((r, i) => (
                    <li key={i}>{r.description || r.label || r.rule}</li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <Label htmlFor="setup-password-confirm" className="block mb-2 text-sm font-medium">
                Passwort wiederholen *
              </Label>
              <Input
                id="setup-password-confirm"
                type="password"
                autoComplete="new-password"
                {...register('passwordConfirm')}
              />
              {errors.passwordConfirm && (
                <p className="text-destructive text-xs mt-1">{errors.passwordConfirm.message}</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-4 h-auto text-base font-bold uppercase tracking-wide"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Account wird angelegt...
                </>
              ) : (
                'Account anlegen und einloggen'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
