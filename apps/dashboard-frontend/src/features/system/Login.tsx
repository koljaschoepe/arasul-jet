import { useState, type FormEvent } from 'react';
import { useApi } from '../../hooks/useApi';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Button } from '@/components/ui/shadcn/button';
import { Label } from '@/components/ui/shadcn/label';
import { PLATFORM_NAME, PLATFORM_DESCRIPTION, SUPPORT_EMAIL } from '@/config/branding';

interface LoginProps {
  onLoginSuccess: (data: any) => void;
}

function Login({ onLoginSuccess }: LoginProps) {
  const api = useApi();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await api.post('/auth/login', { username, password }, { showError: false });

      // Store token in localStorage
      localStorage.setItem('arasul_token', data.token);
      localStorage.setItem('arasul_user', JSON.stringify(data.user));

      // Call success callback
      onLoginSuccess(data);
    } catch (err: any) {
      console.error('Login error:', err);
      setError(
        err.data?.error ||
          err.message ||
          'Login failed. Please check your credentials and try again.'
      );
    } finally {
      setLoading(false);
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
          <form onSubmit={handleSubmit}>
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
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
                required
                autoComplete="username"
                autoFocus
                aria-describedby={error ? 'login-error' : undefined}
                className="h-auto w-full py-3.5 px-4 bg-background border-border text-foreground text-base rounded-md placeholder:text-muted-foreground max-md:py-3 max-md:min-h-12"
              />
            </div>

            <div className="mb-6 max-sm:mb-5">
              <Label htmlFor="password" className="block mb-2 text-sm font-medium">
                Passwort
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Passwort eingeben"
                required
                autoComplete="current-password"
                className="h-auto w-full py-3.5 px-4 bg-background border-border text-foreground text-base rounded-md placeholder:text-muted-foreground max-md:py-3 max-md:min-h-12"
              />
            </div>

            <Button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full py-4 h-auto text-base font-bold uppercase tracking-wide hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 transition-all max-md:min-h-12 max-md:text-sm"
            >
              {loading ? 'Anmeldung...' : 'Anmelden'}
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
