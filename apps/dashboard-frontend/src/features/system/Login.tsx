import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useApi } from '../../hooks/useApi';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Button } from '@/components/ui/shadcn/button';
import { Label } from '@/components/ui/shadcn/label';
import { PLATFORM_NAME, PLATFORM_DESCRIPTION, SUPPORT_EMAIL } from '@/config/branding';

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

  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { username: '', password: '' },
  });

  const username = watch('username');
  const password = watch('password');
  const canSubmit = Boolean(username && password);

  const onSubmit = async (values: LoginFormValues) => {
    setError('');
    try {
      const data = await api.post<LoginResponseData>('/auth/login', values, { showError: false });
      localStorage.setItem('arasul_token', data.token);
      localStorage.setItem('arasul_user', JSON.stringify(data.user));
      onLoginSuccess(data);
    } catch (err: unknown) {
      console.error('Login error:', err);
      const e = err as { message?: string };
      setError(e.message || 'Anmeldung fehlgeschlagen. Bitte überprüfen Sie Ihre Zugangsdaten.');
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-background p-4 max-md:items-start max-md:pt-[10vh] max-md:p-3">
      <Card className="w-full max-w-[420px] rounded-xl border-border bg-card p-10 shadow-lg max-md:max-w-[95vw] max-md:p-8 max-sm:p-6">
        <CardHeader className="p-0 text-center mb-8 max-md:mb-7 max-sm:mb-6">
          <h1 className="text-[2rem] text-primary mb-2 font-bold min-[1728px]:text-[2.25rem] min-[1280px]:max-[1511px]:text-[1.875rem] max-md:text-[1.875rem] max-sm:text-[1.75rem] max-sm:mb-1 max-[375px]:text-2xl">
            {PLATFORM_NAME} Platform
          </h1>
          <p className="text-muted-foreground text-sm max-sm:text-sm max-[375px]:text-sm">
            {PLATFORM_DESCRIPTION}
          </p>
        </CardHeader>

        <CardContent className="p-0 mb-8 max-sm:mb-6">
          <form onSubmit={handleSubmit(onSubmit)}>
            {error && (
              <div
                id="login-error"
                className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm mb-6"
                role="alert"
              >
                {error}
              </div>
            )}

            <div className="mb-6 max-sm:mb-5">
              <Label htmlFor="username" className="block mb-2 text-sm font-medium">
                Benutzername
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="admin"
                autoComplete="username"
                autoFocus
                aria-describedby={error ? 'login-error' : undefined}
                className="h-auto w-full py-3.5 px-4 bg-background border-border text-foreground text-base rounded-md placeholder:text-muted-foreground max-md:py-3 max-md:min-h-12"
                {...register('username')}
              />
            </div>

            <div className="mb-6 max-sm:mb-5">
              <Label htmlFor="password" className="block mb-2 text-sm font-medium">
                Passwort
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Passwort eingeben"
                autoComplete="current-password"
                className="h-auto w-full py-3.5 px-4 bg-background border-border text-foreground text-base rounded-md placeholder:text-muted-foreground max-md:py-3 max-md:min-h-12"
                {...register('password')}
              />
            </div>

            <Button
              type="submit"
              variant="solid"
              disabled={isSubmitting || !canSubmit}
              className="w-full py-4 h-auto text-base font-bold uppercase tracking-wide hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 transition-all max-md:min-h-12 max-md:text-sm"
            >
              {isSubmitting ? 'Anmeldung...' : 'Anmelden'}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex-col p-0 pt-6 border-t border-border max-sm:pt-5">
          <p className="text-muted-foreground text-sm mb-2 max-sm:text-xs max-[375px]:text-[0.75rem]">
            Standard-Benutzername: <strong className="text-primary">admin</strong>
          </p>
          <p className="text-muted-foreground text-xs max-sm:text-[0.75rem]">
            Passwort vergessen? Kontaktieren Sie{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
              {SUPPORT_EMAIL}
            </a>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

export default Login;
