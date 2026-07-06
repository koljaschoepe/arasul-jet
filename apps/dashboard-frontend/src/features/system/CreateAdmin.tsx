import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useApi } from '../../hooks/useApi';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Button } from '@/components/ui/shadcn/button';
import { Label } from '@/components/ui/shadcn/label';
import { PLATFORM_NAME, PLATFORM_DESCRIPTION } from '@/config/branding';

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
    <div className="flex justify-center items-center min-h-screen bg-background p-4 max-md:items-start max-md:pt-[10vh] max-md:p-3">
      <Card className="w-full max-w-[420px] rounded-xl border-border bg-card p-10 shadow-lg max-md:max-w-[95vw] max-md:p-8 max-sm:p-6">
        <CardHeader className="p-0 text-center mb-8 max-md:mb-7 max-sm:mb-6">
          <h1 className="text-[2rem] text-primary mb-2 font-bold min-[1728px]:text-[2.25rem] min-[1280px]:max-[1511px]:text-[1.875rem] max-md:text-[1.875rem] max-sm:text-[1.75rem] max-sm:mb-1 max-[375px]:text-2xl">
            Willkommen bei {PLATFORM_NAME}
          </h1>
          <p className="text-muted-foreground text-sm">
            Legen Sie Ihr Administrator-Konto an, um zu starten.
          </p>
          <p className="text-muted-foreground text-xs mt-1">{PLATFORM_DESCRIPTION}</p>
        </CardHeader>

        <CardContent className="p-0 mb-8 max-sm:mb-6">
          <form onSubmit={handleSubmit(onSubmit)}>
            {error && (
              <div
                id="create-admin-error"
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
                placeholder="z. B. admin"
                autoComplete="username"
                className="h-auto w-full py-3.5 px-4 bg-background border-border text-foreground text-base rounded-md placeholder:text-muted-foreground max-md:py-3 max-md:min-h-12"
                {...usernameField}
                ref={el => {
                  usernameField.ref(el);
                  usernameRef.current = el;
                }}
              />
            </div>

            <div className="mb-6 max-sm:mb-5">
              <Label htmlFor="password" className="block mb-2 text-sm font-medium">
                Passwort
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Mindestens 8 Zeichen"
                autoComplete="new-password"
                className="h-auto w-full py-3.5 px-4 bg-background border-border text-foreground text-base rounded-md placeholder:text-muted-foreground max-md:py-3 max-md:min-h-12"
                {...register('password')}
              />
            </div>

            <div className="mb-6 max-sm:mb-5">
              <Label htmlFor="confirmPassword" className="block mb-2 text-sm font-medium">
                Passwort bestätigen
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Passwort wiederholen"
                autoComplete="new-password"
                aria-describedby={errors.confirmPassword ? 'confirm-error' : undefined}
                className="h-auto w-full py-3.5 px-4 bg-background border-border text-foreground text-base rounded-md placeholder:text-muted-foreground max-md:py-3 max-md:min-h-12"
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && (
                <p id="confirm-error" className="text-destructive text-xs mt-2">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              variant="solid"
              disabled={isSubmitting || !canSubmit}
              className="w-full py-4 h-auto text-base font-bold uppercase tracking-wide hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 transition-all max-md:min-h-12 max-md:text-sm"
            >
              {isSubmitting ? 'Konto wird angelegt...' : 'Konto anlegen'}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex-col p-0 pt-6 border-t border-border max-sm:pt-5">
          <p className="text-muted-foreground text-xs text-center max-sm:text-[0.75rem]">
            Dieses Konto ist der erste Administrator dieser Box. Danach ist diese Seite gesperrt.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

export default CreateAdmin;
