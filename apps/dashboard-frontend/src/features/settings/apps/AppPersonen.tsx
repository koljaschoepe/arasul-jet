/**
 * Personen mit Zugang und Testpersonen einer App (Phase D4 als „Tester", seit
 * M5 ein Block der Seite der App).
 *
 * DIESELBE ENTSCHEIDUNG WIE IN DER TABELLE APPS UNTER PERSONEN, aus der
 * anderen Richtung gelesen: dort „wer darf was" für das ganze Gerät, hier die
 * Spalte EINER App. Beide schreiben über dieselben Wege (`POST /api/freigaben`,
 * `DELETE /api/freigaben/:appId/:benutzerId`) und dieselben Hooks — es gibt
 * keine zweite Buchführung, nur eine zweite Sicht.
 *
 * Testperson ist `app_members.stand = 'test'` (C3): sie sieht die App in ihrer
 * Aktivitätsleiste zusätzlich als „(Test) Name" und landet dort in der
 * Testfassung. Keine Rolle: ein Administrator kann Testperson sein, ein
 * Mitarbeiter auch.
 */
import { Checkbox, Switch } from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { anzeigeName, useBenutzer } from '../personen/usePersonen';
import { freigabeVon, useFreigaben, useFreigabeSetzen } from '../personen/useAppFreigaben';

export function AppPersonen({ appId, hatTeststand }: { appId: string; hatTeststand: boolean }) {
  const { data: benutzer, isLoading: menschenLaden, isError: menschenFehler } = useBenutzer();
  const { data: freigaben, isLoading: freigabenLaden, isError: freigabenFehler } = useFreigaben();
  const setzen = useFreigabeSetzen();

  if (menschenLaden || freigabenLaden) {
    return <SkeletonText lines={3} />;
  }
  // Ein Fehler ist kein Leerzustand: „niemand hat Zugang" und „ich konnte
  // nicht fragen" sähen sonst gleich aus.
  if (menschenFehler || freigabenFehler) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="personen-fehler">
        Die Freigaben ließen sich nicht laden.
      </p>
    );
  }

  const alle = freigaben ?? [];
  // Wer Zugang hat, steht oben: die Frage auf dieser Seite ist „wer benutzt
  // diese App", nicht „wer ist am Gerät".
  const liste = [...(benutzer ?? [])].sort(
    (a, b) =>
      Number(Boolean(freigabeVon(alle, appId, b.id))) -
      Number(Boolean(freigabeVon(alle, appId, a.id)))
  );

  return (
    <ul className="flex flex-col rounded-md border border-border" data-testid="personen-liste">
      {liste.map(b => {
        const freigabe = freigabeVon(alle, appId, b.id);
        const name = anzeigeName(b);
        const zelle = `${appId}-${b.username}`;
        return (
          <li
            key={String(b.id)}
            className="flex flex-wrap items-center gap-3 border-b border-border p-ui-3 last:border-b-0"
            data-testid={`person-${zelle}`}
          >
            <Switch
              checked={Boolean(freigabe)}
              disabled={setzen.isPending}
              aria-label={`${name} hat Zugang zu dieser App`}
              data-testid={`person-zugang-${zelle}`}
              onCheckedChange={an =>
                setzen.mutate({ appId, benutzerId: b.id, stand: an ? 'live' : null })
              }
            />
            <span className="min-w-0 flex-1">
              <span className="text-sm text-foreground">{name}</span>
              {!b.is_active && (
                <span className="ml-2 text-xs text-muted-foreground">gesperrt</span>
              )}
            </span>

            {/* Testperson erst, WENN Zugang besteht — sonst machte ein Klick aus
                jemandem ohne Zugang stillschweigend eine Testperson. Ohne
                Testfassung nur, wenn jemand noch als Testperson eingetragen ist:
                ein Zustand, den die Seite verbirgt, räumt niemand mehr auf. */}
            {freigabe && (hatTeststand || freigabe.stand === 'test') && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={freigabe.stand === 'test'}
                  disabled={setzen.isPending}
                  data-testid={`person-test-${zelle}`}
                  onCheckedChange={an =>
                    setzen.mutate({ appId, benutzerId: b.id, stand: an ? 'test' : 'live' })
                  }
                />
                Testperson
              </label>
            )}
          </li>
        );
      })}
    </ul>
  );
}
