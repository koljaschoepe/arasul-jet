/**
 * Auf welcher Fassung des Designsystems eine App steht (Phase H6, Spalte und
 * Warnung seit dem Auftrag geraet-zeigt-bibliotheksstand, 08.09.2026).
 *
 * Eine App trägt die Bibliothek als KOPIE — als Spiegel der Quelle in ihrem
 * Frontend oder als beigelegtes `marken.js`. Die Shell zieht mit jedem Deploy
 * nach, die App bleibt auf dem Stand ihres letzten Paketbaus, und der Mensch
 * sieht beides in EINEM Rahmen übereinander. Nichts an einer laufenden App
 * würde davon rot — und ohne Sicht auf die Fassung merkt niemand, dass eine
 * App seit Monaten auf einer alten Bibliothek steht. Deshalb steht sie in
 * der Liste, nicht erst in der Karte nach dem Klick.
 *
 * DAS KIT ERZWINGT BEIM BAU, DAS GERÄT ZEIGT. Der Befund hier ist eine
 * Warnung und kein Verbot: einspielen und live schalten geht weiter, die
 * Fassung ist eine Auskunft an den, der das Gerät betreibt.
 *
 * KEIN ROT. Eine Warnung ist in dieser Bibliothek Grau mit Text
 * (`Badge variant="warning"`, Entscheidung vom 30.08.2026). Rot ist in der
 * App-Verwaltung reserviert für „ein Mensch klickt auf die Kachel und
 * bekommt nichts" (`lieferbar: false`).
 *
 * OHNE FRONTEND KEINE WARNUNG. Ein fremder Container, der nur ein Backend
 * mitbringt, hat kein Erscheinungsbild und braucht keine Bibliothek; eine
 * Warnung dort hieße, jemanden zu einem Update zu schicken, das nichts
 * ändert. Ob ein Stand ein Frontend hat, sagt `dateien.frontend`: `null`
 * heißt, das Manifest nennt keines.
 *
 * Verglichen wird gegen `FASSUNG` aus `@marken` und nicht gegen eine Zahl vom
 * Backend: die Shell ÜBERSETZT die Bibliothek mit, also ist ihre Fassung die
 * des Geräts. Eine zweite Zahl daneben wäre eine, die eines Tages etwas
 * anderes sagt.
 */
import { AlertTriangle } from 'lucide-react';
import { Badge, FASSUNG } from '@marken';

/** Drei Zahlen als Zahlen: `3.10.0` steht hinter `3.9.0` und nicht davor. */
function zahlen(fassung: string): number[] {
  return fassung.split('.').map(teil => Number.parseInt(teil, 10) || 0);
}

/** Ist `a` älter als `b`? */
function aelter(a: string, b: string): boolean {
  const links = zahlen(a);
  const rechts = zahlen(b);
  for (let i = 0; i < Math.max(links.length, rechts.length); i += 1) {
    const eins = links[i] ?? 0;
    const zwei = rechts[i] ?? 0;
    if (eins !== zwei) {
      return eins < zwei;
    }
  }
  return false;
}

/**
 * Was die Verwaltung über die Bibliothek eines Standes sagt. Fünf Fälle, und
 * genau zwei davon sind eine Warnung: `aelter` und `fehlt` — beide nur, wenn
 * der Stand ein Frontend hat.
 */
type BibliothekBefund =
  | { art: 'ohne-frontend' }
  | { art: 'gleich'; fassung: string }
  | { art: 'aelter'; fassung: string }
  | { art: 'neuer'; fassung: string }
  | { art: 'fehlt' };

export function bibliothekBefund(fassung: string | null, hatFrontend: boolean): BibliothekBefund {
  if (!hatFrontend) {
    return { art: 'ohne-frontend' };
  }
  if (!fassung) {
    return { art: 'fehlt' };
  }
  if (fassung === FASSUNG) {
    return { art: 'gleich', fassung };
  }
  return { art: aelter(fassung, FASSUNG) ? 'aelter' : 'neuer', fassung };
}

/** Ist dieser Befund eine Warnung? */
function warnt(befund: BibliothekBefund): boolean {
  return befund.art === 'aelter' || befund.art === 'fehlt';
}

/** Der Befund in Worten — dieselben in Liste und Karte. */
function wortlaut(befund: BibliothekBefund, knapp: boolean): string {
  switch (befund.art) {
    case 'ohne-frontend':
      return knapp ? 'kein Frontend' : 'kein Frontend, braucht keine Bibliothek';
    case 'gleich':
      return befund.fassung;
    case 'aelter':
      return knapp
        ? `${befund.fassung}, älter als das Gerät`
        : `${befund.fassung}, älter als das Gerät (${FASSUNG})`;
    case 'neuer':
      return knapp
        ? `${befund.fassung}, neuer als das Gerät`
        : `${befund.fassung}, neuer als das Gerät (${FASSUNG})`;
    case 'fehlt':
      return knapp ? 'nicht genannt' : 'nicht genannt: die App sagt nicht, worauf sie steht';
  }
}

/**
 * Die Fassung als Text (Karte) oder als Abzeichen (Liste, `knapp`).
 *
 * `data-warnung` steht am Element, damit eine Abnahme fragen kann, OB gewarnt
 * wird, und nicht nur, was dasteht — die Frage des Auftrags ist genau die.
 */
export function Bibliothek({
  fassung,
  hatFrontend,
  knapp = false,
  'data-testid': testId = 'marken-fassung',
}: {
  fassung: string | null;
  hatFrontend: boolean;
  knapp?: boolean;
  'data-testid'?: string;
}) {
  const befund = bibliothekBefund(fassung, hatFrontend);
  const warnung = warnt(befund);
  const text = wortlaut(befund, knapp);

  if (knapp) {
    return (
      <Badge
        variant={warnung ? 'warning' : 'outline'}
        data-testid={testId}
        data-befund={befund.art}
        data-warnung={warnung ? 'true' : undefined}
      >
        {warnung && <AlertTriangle aria-hidden="true" />}
        {text}
      </Badge>
    );
  }

  if (warnung) {
    return (
      <span
        className="inline-flex items-start gap-1.5 text-muted-foreground"
        data-testid={testId}
        data-befund={befund.art}
        data-warnung="true"
      >
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          {befund.art === 'aelter' ? (
            <>
              <span className="font-mono">{befund.fassung}</span>
              {`, älter als das Gerät (${FASSUNG})`}
            </>
          ) : (
            text
          )}
        </span>
      </span>
    );
  }

  return (
    <span
      className={befund.art === 'gleich' ? 'font-mono text-foreground' : 'text-muted-foreground'}
      data-testid={testId}
      data-befund={befund.art}
    >
      {befund.art === 'neuer' ? (
        <>
          <span className="font-mono">{befund.fassung}</span>
          {`, neuer als das Gerät (${FASSUNG})`}
        </>
      ) : (
        text
      )}
    </span>
  );
}
