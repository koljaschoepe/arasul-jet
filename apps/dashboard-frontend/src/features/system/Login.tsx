import { useState, type FormEvent } from 'react';
import { useApi } from '../../hooks/useApi';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Button } from '@/components/ui/shadcn/button';
import { Label } from '@/components/ui/shadcn/label';

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
    <div className="flex justify-center items-center min-h-screen bg-[var(--bg-app)] p-4 max-md:items-start max-md:pt-[10vh] max-sm:p-3 max-sm:pt-[8vh] max-[375px]:p-2 max-[375px]:pt-[5vh]">
      <Card className="w-full max-w-[420px] rounded-2xl border-[var(--border-color)] bg-[var(--bg-card)] p-[clamp(2rem,4vw,3rem)] shadow-lg min-[1728px]:max-w-[450px] min-[1728px]:p-14 min-[1280px]:max-[1511px]:max-w-[400px] min-[1280px]:max-[1511px]:p-10 max-md:max-w-[min(420px,95vw)] max-md:rounded-[14px] max-md:p-10 max-sm:max-w-full max-sm:rounded-lg max-sm:p-8 max-[375px]:p-6">
        <CardHeader className="p-0 text-center mb-8 max-md:mb-7 max-sm:mb-6">
          <h1 className="text-[2rem] text-[var(--primary-color)] mb-2 font-bold min-[1728px]:text-[2.25rem] min-[1280px]:max-[1511px]:text-[1.875rem] max-md:text-[1.875rem] max-sm:text-[1.75rem] max-sm:mb-1 max-[375px]:text-2xl">
            Arasul Platform
          </h1>
          <p className="text-[var(--text-secondary)] text-sm max-sm:text-sm max-[375px]:text-sm">
            Edge-KI Verwaltungssystem
          </p>
        </CardHeader>

        <CardContent className="p-0 mb-8 max-sm:mb-6">
          <form onSubmit={handleSubmit}>
            {error && (
              <div
                id="login-error"
                className="bg-[var(--danger-alpha-10)] border border-[var(--danger-color,#EF4444)] text-[var(--danger-color,#EF4444)] p-4 rounded-md mb-6 text-sm max-sm:p-3.5 max-sm:text-sm max-sm:mb-5"
                role="alert"
              >
                {error}
              </div>
            )}

            <div className="mb-6 max-sm:mb-5">
              <Label
                htmlFor="username"
                className="block mb-2 text-[var(--text-secondary)] font-semibold text-sm uppercase tracking-wide max-sm:text-[0.825rem] max-sm:mb-1 max-[375px]:text-xs"
              >
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
                className="h-auto w-full py-3.5 px-4 bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)] text-base rounded-md placeholder:text-[var(--text-muted)] focus-visible:border-[var(--primary-color)] focus-visible:ring-[var(--primary-alpha-15)] max-md:min-h-12 max-sm:py-3 max-sm:px-3.5 max-sm:min-h-12 max-sm:rounded max-[375px]:py-2.5 max-[375px]:px-3 max-[375px]:min-h-11 max-[375px]:text-sm min-[1280px]:max-[1511px]:py-3 min-[1280px]:max-[1511px]:px-3.5"
              />
            </div>

            <div className="mb-6 max-sm:mb-5">
              <Label
                htmlFor="password"
                className="block mb-2 text-[var(--text-secondary)] font-semibold text-sm uppercase tracking-wide max-sm:text-[0.825rem] max-sm:mb-1 max-[375px]:text-xs"
              >
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
                className="h-auto w-full py-3.5 px-4 bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)] text-base rounded-md placeholder:text-[var(--text-muted)] focus-visible:border-[var(--primary-color)] focus-visible:ring-[var(--primary-alpha-15)] max-md:min-h-12 max-sm:py-3 max-sm:px-3.5 max-sm:min-h-12 max-sm:rounded max-[375px]:py-2.5 max-[375px]:px-3 max-[375px]:min-h-11 max-[375px]:text-sm min-[1280px]:max-[1511px]:py-3 min-[1280px]:max-[1511px]:px-3.5"
              />
            </div>

            <Button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full py-4 h-auto text-base font-bold uppercase tracking-wide hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 transition-all max-md:min-h-12 max-md:text-sm max-sm:min-h-12 max-sm:text-sm max-sm:rounded max-[375px]:min-h-11 max-[375px]:text-sm min-[1280px]:max-[1511px]:py-3.5"
            >
              {loading ? 'Anmeldung...' : 'Anmelden'}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex-col p-0 pt-6 border-t border-[var(--border-color)] max-sm:pt-5">
          <p className="text-[var(--text-secondary)] text-sm mb-2 max-sm:text-xs max-[375px]:text-[0.75rem]">
            Standard-Benutzername: <strong className="text-[var(--primary-color)]">admin</strong>
          </p>
          <p className="text-[var(--text-muted)] text-xs max-sm:text-[0.75rem]">
            Passwort vergessen? Kontaktieren Sie{' '}
            <a href="mailto:info@arasul.de" className="text-[var(--primary-color)] hover:underline">
              info@arasul.de
            </a>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

export default Login;
