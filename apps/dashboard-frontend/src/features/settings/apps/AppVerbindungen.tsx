/**
 * Die Verbindungen einer App ins Internet, auf ihrer Seite (J38, seit M5 kein
 * eigener Bereich der Verwaltung mehr).
 *
 * Apps laufen in einem Netz ohne Internet. Was eine App braucht, nennt sie im
 * Manifest (`verbindungen`), und der Ausgangs-Proxy lässt genau diese Namen
 * durch. Dazu kommen die Flows der App, die bei einem Anbieter draußen
 * rechnen: auch dorthin gehen Daten dieser App.
 *
 * LESBAR BENANNT, ADRESSEN AUFGEKLAPPT. Je Verbindung ein Name, den ein Mensch
 * liest („OpenAI", „Example"), und wie oft sie genutzt wurde; die Adresse
 * steht aufgeklappt.
 *
 * ROT NUR, WENN DIE APP DESHALB NICHT ARBEITEN KANN: ein eingetragener Name,
 * der trotzdem abgewiesen wurde (`stoerung` vom Backend, etwa weil er auf eine
 * Adresse im Haus zeigt). Ein nicht eingetragener Name, der abgewiesen wurde,
 * ist die Aufgabe des Proxys — er steht grau und zugeklappt darunter.
 */
import { Globe } from 'lucide-react';
import { SkeletonText } from '@/components/ui/Skeleton';
import { Aufklappen } from './Aufklappen';
import type { AppFlow } from './useAppVerwaltung';
import { lesbarerName, useAppVerbindungen, type Ziel } from './useVerbindungen';

function zeitpunkt(iso: string | null): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function nutzung(ziel: Ziel | undefined): string {
  if (!ziel) return 'noch nicht genutzt';
  return `${ziel.anzahl.toLocaleString('de-DE')}× genutzt, zuletzt ${zeitpunkt(ziel.zuletzt)}`;
}

function hostVon(adresse: string): string {
  try {
    return new URL(adresse).hostname;
  } catch {
    return adresse;
  }
}

export function AppVerbindungen({ appId, flows }: { appId: string; flows: AppFlow[] }) {
  const { data, isLoading, isError } = useAppVerbindungen(appId);

  if (isLoading) return <SkeletonText lines={2} />;
  if (isError) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="verbindungen-fehler">
        Die Verbindungen ließen sich nicht laden.
      </p>
    );
  }

  const eingetragen = data?.eingetragen ?? [];
  const genutzt = data?.genutzt ?? [];
  const abgewiesen = data?.abgewiesen ?? [];
  const stoerungen = abgewiesen.filter(z => z.stoerung);
  const fremde = abgewiesen.filter(z => !z.stoerung);
  // Je Anbieter einmal, auch wenn mehrere Flows dorthin gehen.
  const extern = new Map<string, { anbieter: string; adresse: string; flows: string[] }>();
  for (const f of flows) {
    if (!f.extern) continue;
    const e = extern.get(f.extern.basis_url) ?? {
      anbieter: f.extern.anbieter,
      adresse: f.extern.basis_url,
      flows: [],
    };
    e.flows.push(f.name);
    extern.set(f.extern.basis_url, e);
  }

  if (eingetragen.length === 0 && extern.size === 0 && abgewiesen.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="verbindungen-keine">
        Keine. Die App erreicht nur ihre Datenbank und das Gerät.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {(eingetragen.length > 0 || extern.size > 0) && (
        <ul
          className="flex flex-col rounded-md border border-border"
          data-testid="verbindungen-liste"
        >
          {eingetragen.map(e => {
            const stoerung = stoerungen.find(z => z.host === e.host);
            const nurTest = e.staende.length === 1 && e.staende[0] === 'test';
            return (
              <li
                key={e.host}
                className="flex flex-col gap-0.5 border-b border-border p-ui-3 last:border-b-0"
                data-testid={`verbindung-${e.host}`}
                data-stoerung={stoerung ? 'true' : undefined}
              >
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <Globe className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="font-medium text-foreground">{lesbarerName(e.host)}</span>
                  {nurTest && (
                    <span className="rounded bg-muted-foreground/15 px-1.5 py-0.5 text-ui-xs font-medium text-muted-foreground">
                      (Test)
                    </span>
                  )}
                  <span className="text-ui-xs text-muted-foreground">
                    {nutzung(genutzt.find(z => z.host === e.host))}
                  </span>
                </span>
                {stoerung && (
                  <span
                    className="text-sm text-destructive"
                    data-testid={`verbindung-stoerung-${e.host}`}
                  >
                    Die App erreicht {lesbarerName(e.host)} nicht, obwohl sie eingetragen ist (
                    {stoerung.anzahl.toLocaleString('de-DE')}× abgewiesen, zuletzt{' '}
                    {zeitpunkt(stoerung.zuletzt)}). Meist zeigt der Name auf eine Adresse im Haus;
                    klären Sie die Adresse mit dem Entwickler der App.
                  </span>
                )}
                <Aufklappen titel="Adresse" kennzeichen={`verbindung-mehr-${e.host}`}>
                  <span className="pl-ui-2 font-mono text-ui-xs text-foreground">{e.host}</span>
                  <span className="ml-2 text-ui-xs text-muted-foreground">
                    eingetragen in{' '}
                    {e.staende.map(s => (s === 'live' ? 'Live' : 'Test')).join(' und ')}
                  </span>
                </Aufklappen>
              </li>
            );
          })}
          {[...extern.values()].map(e => (
            <li
              key={e.adresse}
              className="flex flex-col gap-0.5 border-b border-border p-ui-3 last:border-b-0"
              data-testid={`verbindung-modell-${hostVon(e.adresse)}`}
            >
              <span className="flex flex-wrap items-center gap-2 text-sm">
                <Globe className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium text-foreground">{e.anbieter}</span>
                <span className="text-ui-xs text-muted-foreground">
                  Modell für {e.flows.map(n => `„${n}“`).join(', ')}
                </span>
              </span>
              <Aufklappen
                titel="Adresse"
                kennzeichen={`verbindung-modell-mehr-${hostVon(e.adresse)}`}
              >
                <span className="pl-ui-2 font-mono text-ui-xs text-foreground">{e.adresse}</span>
              </Aufklappen>
            </li>
          ))}
        </ul>
      )}

      {fremde.length > 0 && (
        <Aufklappen
          titel={`Abgewiesen: ${fremde.length === 1 ? '1 Adresse' : `${fremde.length} Adressen`}, die die App nicht eingetragen hat`}
          kennzeichen="verbindungen-abgewiesen"
        >
          <ul className="flex flex-col gap-1 pl-ui-2" data-testid="verbindungen-abgewiesen-liste">
            {fremde.map(z => (
              <li
                key={z.host}
                className="flex flex-wrap items-baseline gap-x-2 text-sm text-muted-foreground"
                data-testid={`abgewiesen-${z.host}`}
              >
                <span className="font-mono text-ui-xs text-foreground">{z.host}</span>
                <span className="text-ui-xs">
                  {z.anzahl.toLocaleString('de-DE')}×, zuletzt {zeitpunkt(z.zuletzt)}
                  {z.staende.length === 1 && z.staende[0] === 'test' ? ' (Test)' : ''}
                </span>
              </li>
            ))}
          </ul>
        </Aufklappen>
      )}
    </div>
  );
}
