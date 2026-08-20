import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useApi } from '../../hooks/useApi';
import { Input } from '@/components/ui/shadcn/input';
import { Button } from '@/components/ui/shadcn/button';
import { Label } from '@/components/ui/shadcn/label';
import { AuthCard, AuthFehler, AUTH_FELD } from '@/components/ui/AuthCard';
import {
  PLATFORM_NAME,
  PLATFORM_DESCRIPTION,
  SUPPORT_EMAIL,
  PLATFORM_WEBSITE,
} from '@/config/branding';

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

type LoginFormValues = z.infer<typeof LoginSchema>;

interface LoginResponseData {
  token: string;
  user: { id: number; username: string; [key: string]: unknown };
}

interface LoginProps {
  onLoginSuccess: (data: LoginResponseData) => void;
}

function Login({ onLoginSuccess }: LoginProps) {
  const api = useApi();
  const [error, setError] = useState('');
  // P2.9.3: AbortController + mounted-flag so the login fetch does not write
  // localStorage / call onLoginSuccess on an unmounted component if the user
  // closes the tab right after pressing submit.
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
    formState: { isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { username: '', password: '' },
  });

  // Focus the username field on mount (replaces the removed autoFocus prop).
  const usernameRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    usernameRef.current?.focus();
  }, []);
  const { ref: registerUsernameRef, ...usernameField } = register('username');

  const username = watch('username');
  const password = watch('password');
  const canSubmit = Boolean(username && password);

  const onSubmit = async (values: LoginFormValues) => {
    setError('');
    submitAbortRef.current?.abort();
    submitAbortRef.current = new AbortController();
    try {
      const data = await api.post<LoginResponseData>('/auth/login', values, {
        showError: false,
        signal: submitAbortRef.current.signal,
      });
      if (!mountedRef.current) return;
      localStorage.setItem('arasul_token', data.token);
      localStorage.setItem('arasul_user', JSON.stringify(data.user));
      onLoginSuccess(data);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      if ((err as Error)?.name === 'AbortError') return;
      console.error('Login error:', err);
      const e = err as { message?: string; status?: number };
      // Meaningful, distinct German messages instead of the backend's raw
      // (English) text. The /auth/login response is not intercepted by the
      // useApi 401-handler, so it reaches us here with a status to dispatch on.
      let message: string;
      if (e.status === 401) {
        message = 'Benutzername oder Passwort ist falsch.';
      } else if (e.status === 403) {
        message = 'Dieses Konto ist gesperrt oder deaktiviert. Bitte den Administrator ansprechen.';
      } else if (e.status === 429) {
        message = 'Zu viele Anmeldeversuche. Bitte einen Moment warten und erneut versuchen.';
      } else if (typeof e.status === 'number' && e.status >= 500) {
        message = 'Der Server ist derzeit nicht erreichbar. Bitte später erneut versuchen.';
      } else if (e.status === undefined) {
        message = 'Verbindung zum Server fehlgeschlagen. Bitte die Netzwerkverbindung prüfen.';
      } else {
        message = e.message || 'Anmeldung fehlgeschlagen. Bitte die Zugangsdaten prüfen.';
      }
      setError(message);
    }
  };

  return (
    <AuthCard
      mascot
      title={PLATFORM_NAME}
      description={PLATFORM_DESCRIPTION}
      footer={
        <p className="text-xs text-muted-foreground">
          Passwort vergessen? Anleitung auf{' '}
          <a
            href={PLATFORM_WEBSITE}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            {PLATFORM_WEBSITE.replace(/^https?:\/\//, '')}
          </a>{' '}
          oder{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        {error && <AuthFehler id="login-error">{error}</AuthFehler>}

        <div className="space-y-4">
          <div>
            <Label htmlFor="username" className="mb-1.5 block text-sm font-medium">
              Benutzername
            </Label>
            {/* Kein Platzhalter: er waere die einzige Stelle, an der wieder ein
                Benutzername auf der Seite steht (Befund F-01). */}
            <Input
              id="username"
              type="text"
              autoComplete="username"
              aria-describedby={error ? 'login-error' : undefined}
              className={AUTH_FELD}
              {...usernameField}
              ref={el => {
                registerUsernameRef(el);
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
              autoComplete="current-password"
              className={AUTH_FELD}
              {...register('password')}
            />
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
          {isSubmitting ? 'Anmeldung läuft …' : 'Anmelden'}
        </Button>
      </form>
    </AuthCard>
  );
}

export default Login;
