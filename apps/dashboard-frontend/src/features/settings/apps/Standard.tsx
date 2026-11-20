/**
 * Erfüllt ein Stand den App-Standard? (J45, M7, 20.11.2026)
 *
 * Seit J45 weist das Gerät beim Ausrollen ab, was nicht auf der Bibliothek
 * steht, keine Tests mitbringt oder nicht über den Ablauf des Kits gebaut ist.
 * Das Urteil rechnet das Backend (`services/app/appStandard.js`) mit genau
 * den Sätzen, die das Kit dem Bauenden zeigt; hier wird es nur gezeigt.
 *
 * Es ersetzt die Warnung zur Bibliothek, die bis dahin hier stand (H6): eine
 * fremde Hauptzahl oder eine fehlende Fassung ist seit J45 ein Fund des
 * Standards und steht mit den anderen in einer Liste.
 *
 * GRAU, NICHT ROT. Ein Stand, der vor J45 kam, läuft weiter, die Prüfung
 * greift nicht rückwirkend. Rot bleibt „ein Mensch klickt auf die Kachel und
 * bekommt nichts" (`lieferbar: false`).
 */
import { CircleCheck, TriangleAlert } from 'lucide-react';
import type { AppStandDetail, StandardUrteil } from './useAppVerwaltung';

/** Kein Urteil (ein älteres Backend), erfüllt, ausgenommen oder mit Funden. */
type Art = 'unbekannt' | 'erfuellt' | 'ausgenommen' | 'fehlt';

function standardArt(urteil: StandardUrteil | null | undefined): Art {
  if (!urteil) return 'unbekannt';
  if (urteil.ausgenommen) return 'ausgenommen';
  return urteil.erfuellt ? 'erfuellt' : 'fehlt';
}

/** Die Zeile in der Karte eines Standes. */
export function Standard({
  urteil,
  'data-testid': testId = 'standard',
}: {
  urteil: StandardUrteil | null | undefined;
  'data-testid'?: string;
}) {
  const art = standardArt(urteil);
  if (art === 'unbekannt') {
    return (
      <span className="text-muted-foreground" data-testid={testId} data-art={art}>
        nicht bekannt
      </span>
    );
  }
  if (art === 'ausgenommen') {
    return (
      <span className="text-muted-foreground" data-testid={testId} data-art={art}>
        kommt mit dem Gerät, der Standard gilt hier nicht
      </span>
    );
  }
  if (art === 'erfuellt') {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-foreground"
        data-testid={testId}
        data-art={art}
      >
        <CircleCheck className="size-3.5 text-primary" aria-hidden="true" />
        erfüllt den Standard
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-start gap-1.5 text-muted-foreground"
      data-testid={testId}
      data-art={art}
    >
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>
        erfüllt den Standard nicht. Eine neue Fassung nimmt das Gerät erst an, wenn das behoben ist:
        <ul className="mt-1 list-disc pl-4">
          {(urteil?.funde ?? []).map(fund => (
            <li key={fund.code} data-code={fund.code}>
              {fund.text}
            </li>
          ))}
        </ul>
      </span>
    </span>
  );
}

/**
 * Der Satz oben auf der Seite einer App: erfüllt sie den Standard, über beide
 * Stände? `null`, wenn kein Stand ein Urteil trägt.
 */
export function standardSatz(staende: {
  live: AppStandDetail | null;
  test: AppStandDetail | null;
}): { gut: boolean; satz: string } | null {
  const paare = (
    [
      ['Livefassung', staende.live],
      ['Testfassung', staende.test],
    ] as const
  ).filter(([, s]) => s && standardArt(s.standard) !== 'unbekannt');
  if (paare.length === 0) return null;
  if (paare.every(([, s]) => standardArt(s?.standard) === 'ausgenommen')) {
    return { gut: true, satz: 'Kommt mit dem Gerät, der App-Standard gilt für sie nicht.' };
  }
  const fehlt = paare.filter(([, s]) => standardArt(s?.standard) === 'fehlt').map(([n]) => n);
  if (fehlt.length === 0) return { gut: true, satz: 'Erfüllt den App-Standard.' };
  const wer = fehlt.length === 2 ? 'Live- und Testfassung erfüllen' : `Die ${fehlt[0]} erfüllt`;
  return { gut: false, satz: `${wer} den App-Standard nicht, siehe Fassungen.` };
}
