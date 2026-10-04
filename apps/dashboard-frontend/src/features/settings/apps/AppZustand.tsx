/**
 * Der Zustand einer App in einem Satz, oben auf ihrer Seite (M5).
 *
 * Die Frage beim Öffnen lautet „ist mit dieser App etwas", und die Antwort
 * steht vor allem anderen: läuft sie, wartet im Test eine neue Fassung, wer
 * benutzt sie, welche Flows sind an. ROT nur, wenn sie deshalb nicht arbeiten
 * kann: eine Fassung, die nicht ausgeliefert werden kann, ein Server-Teil, der
 * steht oder Fehler meldet, eine eingetragene Verbindung, die abgewiesen wird.
 */
import { TriangleAlert } from 'lucide-react';
import { freigabeVon, useFreigaben } from '../personen/useAppFreigaben';
import { useBenutzer } from '../personen/usePersonen';
import { bibliothekWarnt } from './Bibliothek';
import type { AppDetail, AppStandDetail } from './useAppVerwaltung';
import { lesbarerName, useAppVerbindungen } from './useVerbindungen';

/** Was an einem Stand die App am Arbeiten hindert, oder null. */
function stoerungVon(stand: AppStandDetail | null, name: string): string | null {
  if (!stand) return null;
  if (!stand.lieferbar)
    return `Die ${name} lässt sich nicht ausliefern: ${stand.mangel ?? 'es fehlen Dateien'}`;
  const b = stand.backend;
  if (b && !b.laeuft) return `Der Server-Teil der ${name} läuft nicht.`;
  if (b?.gesundheit === 'unhealthy') return `Der Server-Teil der ${name} meldet Fehler.`;
  return null;
}

export function AppZustand({ app }: { app: AppDetail }) {
  const { data: freigaben } = useFreigaben();
  const { data: benutzer } = useBenutzer();
  const { data: verbindungen } = useAppVerbindungen(app.id);
  const { live, test } = app.staende;

  const stoerungen = [
    stoerungVon(live, 'Livefassung'),
    stoerungVon(test, 'Testfassung'),
    ...(verbindungen?.abgewiesen ?? [])
      .filter(z => z.stoerung)
      .map(z => `Die Verbindung zu ${lesbarerName(z.host)} wird abgewiesen.`),
  ].filter((s): s is string => Boolean(s));

  const satz = !live
    ? test
      ? `Noch nicht live. Im Test steht Fassung ${test.version}.`
      : 'Keine Fassung am Gerät.'
    : test
      ? `Läuft mit Fassung ${live.version}. Im Test wartet Fassung ${test.version}.`
      : `Läuft mit Fassung ${live.version}.`;

  // Zahlen aus denselben Abfragen wie die Blöcke darunter (React Query fragt einmal).
  const mitZugang = (benutzer ?? []).filter(b => freigabeVon(freigaben ?? [], app.id, b.id));
  const testpersonen = mitZugang.filter(
    b => freigabeVon(freigaben ?? [], app.id, b.id)?.stand === 'test'
  );
  const flows = (live ?? test)?.flows ?? [];
  const aktiv = flows.filter(f => f.aktiv !== false).length;
  const bibliothek = [live, test].some(
    s => s && bibliothekWarnt(s.marken, s.dateien.frontend !== null)
  );

  return (
    <div className="flex flex-col gap-1.5" data-testid="app-zustand">
      <p
        className="text-sm font-medium text-foreground"
        data-testid="app-zustand-satz"
        data-gut={stoerungen.length === 0 ? 'true' : 'false'}
      >
        {satz}
      </p>
      {stoerungen.map(s => (
        <p
          key={s}
          className="flex items-start gap-1.5 text-sm text-destructive"
          data-testid="app-zustand-stoerung"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {s}
        </p>
      ))}
      <p className="text-xs text-muted-foreground" data-testid="app-zustand-zahlen">
        {mitZugang.length === 1 ? '1 Person' : `${mitZugang.length} Personen`} mit Zugang
        {testpersonen.length > 0 &&
          `, davon ${testpersonen.length === 1 ? '1 Testperson' : `${testpersonen.length} Testpersonen`}`}
        {flows.length > 0 &&
          ` · ${aktiv} von ${flows.length} ${flows.length === 1 ? 'Flow' : 'Flows'} aktiv`}
        {bibliothek && ' · die Bibliothek einer Fassung warnt, siehe Fassungen'}
      </p>
    </div>
  );
}
