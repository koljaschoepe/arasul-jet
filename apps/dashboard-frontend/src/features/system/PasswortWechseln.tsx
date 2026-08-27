/**
 * Den Startpasswort-Wechsel erzwingen (Phase D1).
 *
 * Phase C2 hat den Weg gebaut, auf dem ein Administrator einem Mitarbeiter ein
 * Passwort setzt (`PUT /api/benutzer/:id/passwort`). Was fehlte: der
 * Mitarbeiter arbeitete danach mit einem Passwort weiter, das ein anderer
 * Mensch kennt. Diese Seite steht deshalb zwischen der Anmeldung und der
 * Shell, solange `user.passwortWechselNoetig` gilt (Migration 178).
 *
 * ES GIBT KEIN „SPÄTER". Ein Knopf zum Wegklicken wäre der Knopf, den jeder
 * drückt, und die Seite gäbe es dann umsonst. Wer nicht wechseln will, meldet
 * sich ab — der Weg steht unten und ist der einzige daneben.
 *
 * Nach dem Wechsel ist eine neue Anmeldung nötig, und das ist keine
 * Unbequemlichkeit, sondern die Wirkung: `POST /api/auth/change-password`
 * entwertet alle Sitzungen des Betroffenen. Wer sein Passwort wechselt, weil
 * ein Zweiter es kannte, will genau das.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Input } from '@/components/ui/shadcn/input';
import { Button } from '@/components/ui/shadcn/button';
import { Label } from '@/components/ui/shadcn/label';
import { AuthCard, AuthError, AUTH_FIELD } from '@/components/ui/AuthCard';
import { useApi } from '@/hooks/useApi';

interface Anforderungen {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}

/**
 * Dieselben Regeln wie im Backend (`utils/password.js`), hier nur, um sie
 * VORHER zu sagen. Geprüft wird weiterhin dort; diese Liste erspart den
 * Fehlversuch, sie ersetzt ihn nicht.
 */
function offeneRegeln(passwort: string, a: Anforderungen | null): string[] {
  if (!a) return [];
  const offen: string[] = [];
  if (passwort.length < a.minLength) offen.push(`mindestens ${a.minLength} Zeichen`);
  if (a.requireUppercase && !/[A-Z]/.test(passwort)) offen.push('ein Großbuchstabe');
  if (a.requireLowercase && !/[a-z]/.test(passwort)) offen.push('ein Kleinbuchstabe');
  if (a.requireNumbers && !/[0-9]/.test(passwort)) offen.push('eine Ziffer');
  if (a.requireSpecialChars && !/[^A-Za-z0-9]/.test(passwort)) offen.push('ein Sonderzeichen');
  return offen;
}

interface PasswortWechselnProps {
  /** Wird nach erfolgreichem Wechsel gerufen; meldet ab und zeigt die Anmeldung. */
  onGewechselt: () => void;
  /** Der Weg daneben: abmelden, ohne zu wechseln. */
  onAbmelden: () => void;
}

function PasswortWechseln({ onGewechselt, onAbmelden }: PasswortWechselnProps) {
  const api = useApi();
  const [anforderungen, setAnforderungen] = useState<Anforderungen | null>(null);
  const [alt, setAlt] = useState('');
  const [neu, setNeu] = useState('');
  const [wiederholung, setWiederholung] = useState('');
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    let abgebrochen = false;
    api
      .get<{ requirements: Anforderungen }>('/settings/password-requirements', {
        showError: false,
      })
      .then(d => {
        if (!abgebrochen) setAnforderungen(d.requirements);
      })
      .catch(() => {
        // Ohne die Regeln bleibt das Formular benutzbar; das Backend prüft
        // ohnehin und sagt, was fehlt.
      });
    return () => {
      abgebrochen = true;
    };
  }, [api]);

  const offen = offeneRegeln(neu, anforderungen);
  const passtZusammen = neu.length > 0 && neu === wiederholung;
  const absendbar = Boolean(alt) && offen.length === 0 && passtZusammen && !laeuft;

  const absenden = async (e: FormEvent) => {
    e.preventDefault();
    setFehler('');
    setLaeuft(true);
    try {
      await api.post(
        '/auth/change-password',
        { currentPassword: alt, newPassword: neu },
        { showError: false }
      );
      onGewechselt();
    } catch (err: unknown) {
      const e2 = err as { status?: number; message?: string };
      if (e2.status === 401) {
        setFehler('Das bisherige Passwort stimmt nicht.');
      } else if (e2.status === 429) {
        setFehler('Zu viele Versuche. Bitte einen Moment warten.');
      } else {
        setFehler(e2.message || 'Das Passwort ließ sich nicht ändern.');
      }
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <AuthCard
      mascot
      title="Neues Passwort"
      description="Dein bisheriges Passwort hat jemand anderes vergeben. Wähle eines, das nur du kennst."
      footer={
        <button
          type="button"
          onClick={onAbmelden}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Abmelden
        </button>
      }
    >
      <form onSubmit={absenden} data-testid="passwort-wechseln">
        {fehler && <AuthError id="passwort-fehler">{fehler}</AuthError>}

        <div className="space-y-4">
          <div>
            <Label htmlFor="passwort-alt" className="mb-1.5 block text-sm font-medium">
              Bisheriges Passwort
            </Label>
            <Input
              id="passwort-alt"
              type="password"
              autoComplete="current-password"
              aria-describedby={fehler ? 'passwort-fehler' : undefined}
              className={AUTH_FIELD}
              value={alt}
              onChange={e => setAlt(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="passwort-neu" className="mb-1.5 block text-sm font-medium">
              Neues Passwort
            </Label>
            <Input
              id="passwort-neu"
              type="password"
              autoComplete="new-password"
              aria-describedby="passwort-regeln"
              className={AUTH_FIELD}
              value={neu}
              onChange={e => setNeu(e.target.value)}
            />
            <p id="passwort-regeln" className="mt-1.5 text-xs text-muted-foreground">
              {neu.length === 0
                ? anforderungen
                  ? `Mindestens ${anforderungen.minLength} Zeichen${
                      anforderungen.requireNumbers ? ', darunter eine Ziffer' : ''
                    }.`
                  : 'Wähle ein Passwort, das nur du kennst.'
                : offen.length > 0
                  ? `Es fehlt noch: ${offen.join(', ')}.`
                  : 'Das Passwort erfüllt die Regeln.'}
            </p>
          </div>

          <div>
            <Label htmlFor="passwort-wiederholung" className="mb-1.5 block text-sm font-medium">
              Neues Passwort wiederholen
            </Label>
            <Input
              id="passwort-wiederholung"
              type="password"
              autoComplete="new-password"
              className={AUTH_FIELD}
              value={wiederholung}
              onChange={e => setWiederholung(e.target.value)}
            />
            {wiederholung.length > 0 && !passtZusammen && (
              <p className="mt-1.5 text-xs text-warning">
                Die beiden Eingaben stimmen nicht überein.
              </p>
            )}
          </div>
        </div>

        <Button
          type="submit"
          variant="solid"
          size="lg"
          loading={laeuft}
          disabled={!absendbar}
          className="mt-6 w-full font-semibold max-md:h-11"
        >
          {laeuft ? 'Wird geändert …' : 'Passwort ändern'}
        </Button>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          Danach meldest du dich einmal neu an.
        </p>
      </form>
    </AuthCard>
  );
}

export default PasswortWechseln;
