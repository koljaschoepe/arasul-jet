/**
 * Der Schalter „Bildschirmfotos an den Agenten" je App (J43, M7, Karte
 * rueckmeldung-schnittstelle).
 *
 * Regel 3 der Verbesserungsschleife: Bilder verlassen das Haus nur mit
 * Erlaubnis je App. Vorgabe aus. Aus heißt: das Kit bekommt Text, Seite, App
 * und Person, aber weder Bild noch Markierung noch einen Hinweis, dass es eins
 * gibt. Entwickler sehen die Bilder am Gerät in jedem Fall.
 */
import { Switch } from '@marken';
import { useToast } from '@/contexts/ToastContext';
import { fehlertext } from '@/utils/fehlertext';
import { useBilderAnAgenten } from './useAppVerwaltung';

export function AppBilderAnAgenten({
  appId,
  name,
  erlaubt,
}: {
  appId: string;
  name: string;
  erlaubt: boolean;
}) {
  const toast = useToast();
  const setzen = useBilderAnAgenten(appId);

  const handle = (an: boolean) => {
    setzen.mutate(an, {
      onSuccess: () =>
        toast.success(
          an
            ? `Bildschirmfotos zu ${name} gehen ab jetzt an den Agenten.`
            : `Bildschirmfotos zu ${name} bleiben ab jetzt am Gerät.`
        ),
      onError: fehler => toast.error(fehlertext(fehler)),
    });
  };

  return (
    <div className="flex items-start gap-3" data-testid="bilder-an-agenten">
      <Switch
        checked={erlaubt}
        disabled={setzen.isPending}
        aria-label="Bildschirmfotos an den Agenten"
        data-testid="bilder-an-agenten-schalter"
        onCheckedChange={handle}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">
          Bildschirmfotos an den Agenten
        </span>
        <span className="block text-xs text-muted-foreground" data-testid="bilder-an-agenten-satz">
          {erlaubt
            ? 'An: der Agent bekommt zu jeder Rückmeldung auch das Bildschirmfoto mit der markierten Stelle.'
            : 'Aus: der Agent bekommt Text, Seite und Person, das Bildschirmfoto bleibt am Gerät.'}
        </span>
      </span>
    </div>
  );
}
