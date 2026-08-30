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
 *
 * DIE APP FOLGT DEM THEME (Phase H2). CSS-Variablen reichen nicht über eine
 * Dokumentgrenze: die App stand deshalb bis H2 immer auf den Rückfallwerten
 * von `packages/marken/src/marken.css`, auch wenn der Mensch die Shell hell
 * eingestellt hatte — zwei Erscheinungsbilder auf einem Bildschirm, und der
 * Mensch sieht sie als eines. Reichen kann man es nur, weil der Rahmen
 * dieselbe Herkunft hat wie die Shell, und genau deshalb steht hier kein
 * `sandbox` (s. o.). Zwei Wege hinein, für zwei Arten von App:
 *
 *   `data-theme` im Dokument des Rahmens
 *       Die App muss NICHTS tun. `marken.css` trägt seit H2 einen Block
 *       `[data-theme='dark']`, also färbt sich alles, was aus der Bibliothek
 *       gebaut ist, von selbst um. Das ist der Weg der Beispielapp.
 *   `postMessage` an das Fenster des Rahmens
 *       `{ typ: 'arasul:theme', theme: 'light' | 'dark' }`, bei jedem Wechsel
 *       und bei jedem Laden. Für eine App, die mehr tut als Farben tauschen
 *       (ein Bild, ein Diagramm) — und der einzige Weg, der den Wert
 *       AUSDRÜCKLICH nennt: am Dokument steht Hell ohne Attribut (H1).
 *
 * Die Vorlage des Ara-Kits liest zusätzlich `data-theme` am `<html>` des
 * Elternfensters und hört mit einem `MutationObserver` darauf. Das ist
 * derselbe Zustand aus einer dritten Richtung gelesen und braucht von hier
 * nichts — die Shell setzt das Attribut seit H1 an ihrem eigenen Dokument.
 *
 * UND DER WECHSEL LÄDT DEN RAHMEN NICHT NEU. Das Theme gehört deshalb weder
 * in den `key` noch in die Adresse: beides tauschte das iframe-Element aus,
 * die App finge von vorn an, und ein halb ausgefülltes Formular wäre weg.
 * Geschrieben wird in das Dokument, das schon dasteht.
 */
import { useCallback, useEffect, useRef } from 'react';
import { AppWindow } from 'lucide-react';
import { useTheme, themeAmDokument } from '@/hooks/useTheme';
import { appPfad, type AppStand } from '@/stores/workspaceStore';
import { useMeineApps } from './meineApps';
import { Ladezustand, Leerzustand } from '@marken';

interface AppRahmenProps {
  appId: string;
  stand: AppStand;
}

export function AppRahmen({ appId, stand }: AppRahmenProps) {
  const { data: apps, isLoading, isError } = useMeineApps();
  const { theme } = useTheme();
  const rahmen = useRef<HTMLIFrameElement>(null);

  /**
   * Das Theme in den Rahmen reichen — an das Dokument und an das Fenster.
   *
   * Der Zugriff auf `contentDocument` steht in einem `try`, obwohl er heute
   * nicht werfen kann (`frame-src 'self'`, gleiche Herkunft): eine App, die
   * den Rahmen doch einmal auf eine fremde Herkunft schickt, soll die Shell
   * nicht mitreißen. Ohne Rahmen ist hier nichts zu tun, und das ist kein
   * Fehler, sondern die Antwort.
   */
  const themeReichen = useCallback(() => {
    const element = rahmen.current;
    if (!element) return;
    try {
      const dokument = element.contentDocument;
      if (dokument?.documentElement) themeAmDokument(dokument, theme);
      element.contentWindow?.postMessage({ typ: 'arasul:theme', theme }, window.location.origin);
    } catch {
      /* fremde Herkunft — dann gilt in der App, was ihr Stylesheet sagt. */
    }
  }, [theme]);

  // Bei jedem Wechsel. Nicht bei jedem Rendern: `themeReichen` hängt am Theme
  // und sonst an nichts.
  useEffect(themeReichen, [themeReichen]);

  // Alle Hooks stehen oben, also darf ab hier vorzeitig zurueckgekehrt werden.
  if (isLoading) {
    return <Ladezustand meldung={`${appId} wird geöffnet …`} />;
  }

  // Ein Fehler beim Laden der Liste ist KEIN „nicht freigegeben". Die App
  // trotzdem zu zeigen ist hier das Richtige: entscheiden tut ohnehin der
  // Server, der den Rahmen füllt.
  const bekannt = isError || (apps ?? []).some(a => a.id === appId && a[stand]);

  if (!bekannt) {
    return (
      <Leerzustand
        symbol={<AppWindow />}
        titel={`${appId} ist Ihnen nicht freigegeben`}
        beschreibung={
          stand === 'test'
            ? 'Den Teststand sieht nur, wer als Tester eingetragen ist. Ein Administrator kann das ändern.'
            : 'Ein Administrator gibt Apps für einzelne Menschen frei. Sprechen Sie ihn an, wenn Sie sie brauchen.'
        }
      />
    );
  }

  return (
    <iframe
      // Der Schlüssel bindet den Rahmen an App UND Stand: ohne ihn behielte
      // React beim Wechsel dasselbe iframe-Element und lüde die neue Adresse
      // in dessen Verlauf — ein „Zurück" im Browser landete dann in der
      // vorigen App statt im vorigen Tab. Das THEME steht bewusst nicht darin
      // (siehe Kopf).
      key={`${appId}:${stand}`}
      ref={rahmen}
      src={appPfad(appId, stand)}
      title={appId}
      // Jedes Dokument, das in diesem Rahmen ankommt, bekommt das Theme —
      // auch das zweite, wenn die App in sich weiternavigiert. Ein Effekt
      // allein reichte dafür nicht: er läuft, wenn sich das Theme ändert,
      // und nicht, wenn der Rahmen etwas Neues lädt.
      onLoad={themeReichen}
      className="h-full w-full border-0 bg-background"
      data-testid={`app-rahmen-${appId}`}
    />
  );
}
