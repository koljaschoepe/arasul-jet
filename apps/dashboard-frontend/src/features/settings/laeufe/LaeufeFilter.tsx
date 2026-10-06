/**
 * Die Filter der Läufe: App, Ergebnis, Person und Zeitraum. Jede Auswahl gilt
 * sofort und steht in der Adresse.
 */
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@marken';
import { ERGEBNISSE, filterGesetzt, KEIN_FILTER, type LaeufeFilter } from './useLaeufe';

/** Radix-Select erlaubt keinen leeren Wert; „alle" ist ein Wort. */
const ALLE = 'alle';

function Wahl({
  name,
  beschriftung,
  wert,
  alle,
  optionen,
  onWahl,
}: {
  name: string;
  beschriftung: string;
  wert: string;
  alle: string;
  optionen: { wert: string; text: string }[];
  onWahl: (wert: string) => void;
}) {
  return (
    <label className="col-span-2 flex min-w-40 flex-1 flex-col gap-1 text-xs text-muted-foreground md:col-span-1">
      {beschriftung}
      <Select value={wert || ALLE} onValueChange={w => onWahl(w === ALLE ? '' : w)}>
        <SelectTrigger aria-label={beschriftung} data-testid={`laeufe-filter-${name}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALLE}>{alle}</SelectItem>
          {optionen.map(o => (
            <SelectItem key={o.wert} value={o.wert}>
              {o.text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

export function LaeufeFilterLeiste({
  filter,
  apps,
  personen,
  onAendern,
}: {
  filter: LaeufeFilter;
  apps: { wert: string; text: string }[];
  personen: { wert: string; text: string }[];
  onAendern: (neu: LaeufeFilter) => void;
}) {
  const setze = (teil: Partial<LaeufeFilter>) => onAendern({ ...filter, ...teil });
  return (
    <div
      className="grid grid-cols-2 items-end gap-3 md:flex md:flex-wrap"
      data-testid="laeufe-filter"
    >
      <Wahl
        name="app"
        beschriftung="App"
        wert={filter.app}
        alle="Alle Apps"
        optionen={apps}
        onWahl={app => setze({ app })}
      />
      <Wahl
        name="status"
        beschriftung="Ergebnis"
        wert={filter.status}
        alle="Jedes Ergebnis"
        optionen={ERGEBNISSE}
        onWahl={status => setze({ status })}
      />
      <Wahl
        name="person"
        beschriftung="Person"
        wert={filter.person}
        alle="Alle"
        optionen={[{ wert: 'ohne', text: 'Ohne Person (Zeitplan, Ereignis)' }, ...personen]}
        onWahl={person => setze({ person })}
      />
      <label
        htmlFor="laeufe-von"
        className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground md:min-w-36"
      >
        Von
        <Input
          id="laeufe-von"
          className="w-full"
          type="date"
          value={filter.von}
          max={filter.bis || undefined}
          onChange={e => setze({ von: e.target.value })}
          data-testid="laeufe-filter-von"
        />
      </label>
      <label
        htmlFor="laeufe-bis"
        className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground md:min-w-36"
      >
        Bis
        <Input
          id="laeufe-bis"
          className="w-full"
          type="date"
          value={filter.bis}
          min={filter.von || undefined}
          onChange={e => setze({ bis: e.target.value })}
          data-testid="laeufe-filter-bis"
        />
      </label>
      {filterGesetzt(filter) && (
        <Button
          variant="ghost"
          size="sm"
          className="col-span-2 md:col-span-1"
          onClick={() => onAendern(KEIN_FILTER)}
          data-testid="laeufe-filter-zuruecksetzen"
        >
          Filter zurücksetzen
        </Button>
      )}
    </div>
  );
}
