import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useApi } from '../../hooks/useApi';
import { Input } from '@/components/ui/shadcn/input';
import { Button } from '@/components/ui/shadcn/button';
import { Label } from '@/components/ui/shadcn/label';
import { AuthCard, AuthFehler, AUTH_FELD } from '@/components/ui/AuthCard';
import { PLATFORM_NAME } from '@/config/branding';

// First-run onboarding: the box ships without an admin, so the very first
// visitor creates it here. This is the ONLY thing the setup ever asks. The
// backend (/auth/setup) accepts this only while no admin exists.
const CreateAdminSchema = z
  .object({
    username: z.string().trim().min(1, 'Benutzername erforderlich').max(64),
    password: z.string().min(8, 'Mindestens 8 Zeichen').max(256),
    confirmPassword: z.string().min(1, 'Bitte Passwort bestätigen'),
  })
  .refine(v => v.password === v.confirmPassword, {
    message: 'Passwörter stimmen nicht überein',
    path: ['confirmPassword'],
  });

type CreateAdminFormValues = z.infer<typeof CreateAdminSchema>;

interface SetupResponseData {
  token: string;
  user: { id: number; username: string; [key: string]: unknown };
}

interface CreateAdminProps {
  onCreated: (data: SetupResponseData) => void;
}

function CreateAdmin({ onCreated }: CreateAdminProps) {
  const api = useApi();
  const [error, setError] = useState('');
  const submitAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      submitAbortRef.current?.abort();
    };
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting, errors },
  } = useForm<CreateAdminFormValues>({
    resolver: zodResolver(CreateAdminSchema),
    defaultValues: { username: '', password: '', confirmPassword: '' },
  });

  const username = watch('username');
  const password = watch('password');
  const confirmPassword = watch('confirmPassword');
  const canSubmit = Boolean(username && password && confirmPassword);

  // Focus the first field on mount without `autoFocus` (a11y: jsx-a11y/no-autofocus).
  // Compose react-hook-form's ref with a local ref used only for the initial focus.
  const usernameField = register('username');
  const usernameRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  const onSubmit = async (values: CreateAdminFormValues) => {
    setError('');
    submitAbortRef.current?.abort();
    submitAbortRef.current = new AbortController();
    try {
      const data = await api.post<SetupResponseData>(
        '/auth/setup',
        { username: values.username, password: values.password },
        { showError: false, signal: submitAbortRef.current.signal }
      );
      if (!mountedRef.current) return;
      localStorage.setItem('arasul_token', data.token);
      localStorage.setItem('arasul_user', JSON.stringify(data.user));
      onCreated(data);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      if ((err as Error)?.name === 'AbortError') return;
      const e = err as { message?: string };
      setError(e.message || 'Konto konnte nicht angelegt werden. Bitte erneut versuchen.');
    }
  };

  return (
    <AuthCard
      title={`Willkommen bei ${PLATFORM_NAME}`}
      description="Lege dein Administrator-Konto an, danach ist das Gerät bereit."
      footer={
        <p className="text-xs text-muted-foreground">
          Dieses Konto ist der erste Administrator dieses Geräts. Danach ist diese Seite gesperrt.
        </p>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        {error && <AuthFehler id="create-admin-error">{error}</AuthFehler>}

        <div className="space-y-4">
          <div>
            <Label htmlFor="username" className="mb-1.5 block text-sm font-medium">
              Benutzername
            </Label>
            {/* Kein Vorschlag wie „admin": ein geratener Standardname ist die
                halbe Zugangsangabe und stand vorher auf beiden Seiten (F-01). */}
            <Input
              id="username"
              type="text"
              autoComplete="username"
              aria-describedby={error ? 'create-admin-error' : undefined}
              className={AUTH_FELD}
              {...usernameField}
              ref={el => {
                usernameField.ref(el);
                usernameRef.current = el;
              }}
            />
          </div>

          <div>
            <Label htmlFor="password" className="mb-1.5 block text-sm font-medium">
              Passwort
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="Mindestens 8 Zeichen"
              autoComplete="new-password"
              className={AUTH_FELD}
              {...register('password')}
            />
          </div>

          <div>
            <Label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium">
              Passwort bestätigen
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Passwort wiederholen"
              autoComplete="new-password"
              aria-describedby={errors.confirmPassword ? 'confirm-error' : undefined}
              className={AUTH_FELD}
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p id="confirm-error" className="mt-1.5 text-xs text-destructive">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>
        </div>

        <Button
          type="submit"
          variant="solid"
          size="lg"
          loading={isSubmitting}
          disabled={!canSubmit}
          className="mt-6 w-full font-semibold max-md:h-11"
        >
          {isSubmitting ? 'Konto wird angelegt …' : 'Konto anlegen'}
        </Button>
      </form>
    </AuthCard>
  );
}

export default CreateAdmin;
