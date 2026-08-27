/**
 * Eine App in der Mitte der Shell (Phase D1).
 *
 * Die App läuft in einem iframe auf ihrem eigenen Weg (`/apps/<id>/`, C3) und
 * nicht als eingebundenes React-Modul. Das ist eine Entscheidung über die
 * Grenze zwischen Plattform und App und keine Bequemlichkeit: eine App kommt
 * vom Partner, wird mit dem Ara-Kit gebaut und bringt ihr eigenes Frontend mit.
 * Liefe sie im selben Dokument, teilte sie sich mit Arasul den globalen
 * Zustand, das Stylesheet und jeden Fehler, den sie wirft.
 *
 * Die Anmeldung geht trotzdem mit: die Anfragen des iframes tragen dasselbe
 * `httpOnly`-Sitzungscookie, und vor dem Backend der App steht die Forward-Auth
 * aus C4. Deshalb steht hier auch **kein** `sandbox`-Attribut — es nähme dem
 * iframe die eigene Herkunft, und damit ginge genau dieses Cookie verloren.
 * Der Rahmen dafür ist die Content-Security-Policy des Geräts
 * (`frame-src 'self'`, `config/traefik/dynamic/middlewares.yml`): eingebettet
 * wird nur, was von diesem Gerät kommt.
 *
 * WER DARF, ENTSCHEIDET DAS BACKEND. Die Prüfung unten ist keine zweite
 * Berechtigung, sondern eine bessere Meldung: ein Tab, der im localStorage
 * liegen geblieben ist, zeigte sonst die 403-Seite des Servers im Rahmen. Wer
 * die Prüfung hier umgeht, bekommt vom Server dieselbe 403.
 */
import { AppWindow } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { appPfad, type AppStand } from '@/stores/workspaceStore';
import { useMeineApps } from './meineApps';

interface AppRahmenProps {
  appId: string;
  stand: AppStand;
}

export function AppRahmen({ appId, stand }: AppRahmenProps) {
  const { data: apps, isLoading, isError } = useMeineApps();

  if (isLoading) {
    return <LoadingSpinner message={`${appId} wird geöffnet …`} />;
  }

  // Ein Fehler beim Laden der Liste ist KEIN „nicht freigegeben". Die App
  // trotzdem zu zeigen ist hier das Richtige: entscheiden tut ohnehin der
  // Server, der den Rahmen füllt.
  const bekannt = isError || (apps ?? []).some(a => a.id === appId && a[stand]);

  if (!bekannt) {
    return (
      <EmptyState
        icon={<AppWindow />}
        title={`${appId} ist dir nicht freigegeben`}
        description={
          stand === 'test'
            ? 'Den Teststand sieht nur, wer als Tester eingetragen ist. Ein Administrator kann das ändern.'
            : 'Ein Administrator gibt Apps für einzelne Menschen frei. Sprich ihn an, wenn du sie brauchst.'
        }
      />
    );
  }

  return (
    <iframe
      // Der Schlüssel bindet den Rahmen an App UND Stand: ohne ihn behielte
      // React beim Wechsel dasselbe iframe-Element und lüde die neue Adresse
      // in dessen Verlauf — ein „Zurück" im Browser landete dann in der
      // vorigen App statt im vorigen Tab.
      key={`${appId}:${stand}`}
      src={appPfad(appId, stand)}
      title={appId}
      className="h-full w-full border-0 bg-background"
      data-testid={`app-rahmen-${appId}`}
    />
  );
}
