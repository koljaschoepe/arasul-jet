import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useApi } from '../../hooks/useApi';
import { Button, Input, Label } from '@marken';
import { AuthCard, AuthError, AUTH_FIELD } from '@/components/ui/AuthCard';
import { PLATFORM_NAME, SUPPORT_EMAIL, PLATFORM_WEBSITE } from '@/config/branding';

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
  /**
   * Der Name des Unternehmens, das dieses Geraet betreibt, aus den
   * Einstellungen (`GET /api/auth/needs-setup`). Ohne ihn steht der
   * Produktname da.
   */
  firmenname?: string | null;
}

function Login({ onLoginSuccess, firmenname }: LoginProps) {
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

  // Ueber dem Formular steht, WESSEN Geraet das ist: das Maskottchen und der
  // Name des Unternehmens. Kein Slogan darunter (Auftrag anmeldung-ohne-slogan,
  // 30.08.2026): „Eure Apps, auf eurem Geraet" liess die Software wie ein
  // Bastelprodukt aussehen. Wer die Software gemacht hat, steht klein in der
  // Fusszeile -- und nur, wenn oben nicht ohnehin schon der Produktname steht.
  const titel = firmenname?.trim() || PLATFORM_NAME;
  const betriebenMit = titel !== PLATFORM_NAME;

  return (
    <AuthCard
      mascot
      title={titel}
      footer={
        <p className="text-xs text-muted-foreground">
          {betriebenMit && <span className="mb-1 block">Betrieben mit {PLATFORM_NAME}</span>}
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
        {error && <AuthError id="login-error">{error}</AuthError>}

        <div className="space-y-4">
          <div>
            <Label htmlFor="username" className="mb-1.5 block text-sm font-medium">
              Benutzername oder E-Mail
            </Label>
            {/* Kein Platzhalter: er waere die einzige Stelle, an der wieder ein
                Benutzername auf der Seite steht (Befund F-01).

                Die Beschriftung nennt beides, weil das Backend beides annimmt
                (`WHERE username = $1 OR email = $1`, Phase C1). Ein
                Mitarbeiter bekommt vom Administrator einen Namen UND eine
                Adresse; sich merken zu muessen, welches davon hier gemeint
                ist, waere eine Huerde ohne Zweck. */}
            <Input
              id="username"
              type="text"
              autoComplete="username"
              aria-describedby={error ? 'login-error' : undefined}
              className={AUTH_FIELD}
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
              className={AUTH_FIELD}
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
