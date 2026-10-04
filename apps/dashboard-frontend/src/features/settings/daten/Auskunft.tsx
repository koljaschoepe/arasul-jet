/**
 * Auskunft und Export nach DSGVO (Art. 15), je Person (M5, Bereich Daten).
 *
 * Der Administrator wählt eine Person (vorgewählt ist er selbst), sieht, was
 * über sie gespeichert ist, und lädt die Auskunft als Datei oder legt sie auf
 * einen angesteckten Datenträger. „Meine Daten exportieren" gibt es in den
 * Einstellungen NICHT: sie sind nur persönlich (Profil, Passwort, Rechner,
 * Erscheinungsbild), und eine Auskunft ist ein Vorgang des Hauses, kein
 * Handgriff der Person. Die Anfrage geht an die Verwaltung, und die findet die
 * Person hier in der Liste.
 */
import { useState } from 'react';
import { Download, FileText, HardDrive } from 'lucide-react';
import {
  Button,
  Feldgruppe,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@marken';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { fehlertext } from '@/utils/fehlertext';
import { formatBytes, formatZahl } from '@/utils/formatting';
import { anzeigeName, useBenutzer, type Benutzer } from '../personen/usePersonen';
import {
  useAuskunft,
  useAuskunftAufDatentraeger,
  useAuskunftHerunterladen,
  useDatentraeger,
} from './useDaten';

/** „Anna Beispiel (anna@firma.de)", damit zwei Gleichnamige unterscheidbar bleiben. */
export function personBezeichnung(b: Benutzer): string {
  const name = anzeigeName(b);
  return name === b.username ? name : `${name} (${b.username})`;
}

export function Auskunft() {
  const { user } = useAuth();
  const toast = useToast();
  const { data: benutzer = [] } = useBenutzer();
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);

  // Ohne Wahl ist es der Angemeldete, sofern er in der Liste steht.
  const id = gewaehlt ?? (user?.id !== undefined ? String(user.id) : null);
  const person = benutzer.find(b => String(b.id) === id) ?? null;

  const { data: kategorien = [], isLoading, isError } = useAuskunft(person ? person.id : null);
  const { data: traeger } = useDatentraeger();
  const herunterladen = useAuskunftHerunterladen();
  const aufDatentraeger = useAuskunftAufDatentraeger();
  const arbeitet = herunterladen.isPending || aufDatentraeger.isPending;

  const laden = () => {
    if (!person) return;
    herunterladen.mutate(
      { id: person.id, name: person.username },
      {
        onSuccess: () => toast.success(`Auskunft über ${anzeigeName(person)} heruntergeladen`),
        onError: err => toast.error(fehlertext(err, (err as { status?: number }).status)),
      }
    );
  };

  const aufMedium = (ziel: string) => {
    if (!person) return;
    aufDatentraeger.mutate(
      { id: person.id, ziel },
      {
        onSuccess: res =>
          toast.success(`Auskunft liegt auf „${ziel}“: ${res.datei} (${formatBytes(res.bytes)})`),
        onError: err => toast.error(fehlertext(err, (err as { status?: number }).status)),
      }
    );
  };

  return (
    <Feldgruppe
      titel="Auskunft und Export"
      symbol={<FileText />}
      beschreibung="Was über eine Person gespeichert ist (DSGVO Art. 15), als Datei zum Herunterladen oder auf einen angesteckten Datenträger."
    >
      <div className="flex flex-col gap-4" data-testid="auskunft">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="auskunft-person">Person</Label>
          <Select value={id ?? undefined} onValueChange={setGewaehlt}>
            <SelectTrigger id="auskunft-person" data-testid="auskunft-person" className="max-w-sm">
              <SelectValue placeholder="Person wählen" />
            </SelectTrigger>
            <SelectContent>
              {benutzer.map(b => (
                <SelectItem key={String(b.id)} value={String(b.id)}>
                  {personBezeichnung(b)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {person && (
          <div data-testid="auskunft-kategorien">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Wird gezählt …</p>
            ) : isError ? (
              <p className="text-sm text-muted-foreground">
                Die Übersicht ließ sich nicht laden. Die Datei enthält trotzdem alles.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-md border border-border text-sm">
                {kategorien.map(k => (
                  <li key={k.name} className="flex items-baseline justify-between gap-4 px-3 py-2">
                    <span>
                      <span className="font-medium text-foreground">{k.name}</span>
                      <span className="block text-xs text-muted-foreground">{k.description}</span>
                    </span>
                    {k.count !== undefined && (
                      <span className="font-mono text-muted-foreground tabular-nums">
                        {formatZahl(k.count)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={laden}
            disabled={!person || arbeitet}
            data-testid="auskunft-herunterladen"
          >
            <Download className="size-4" aria-hidden="true" />
            {herunterladen.isPending ? 'Wird erstellt …' : 'Auskunft herunterladen'}
          </Button>
          {(traeger?.medien ?? []).map(m => (
            <Button
              key={m.name}
              variant="outline"
              disabled={!person || arbeitet || !m.beschreibbar}
              data-testid={`export-ziel-${m.name}`}
              title={m.beschreibbar ? 'Auf den Datenträger legen' : 'Nur lesend eingehängt'}
              onClick={() => aufMedium(m.name)}
            >
              <HardDrive className="size-4" aria-hidden="true" />
              Auf {m.name}
              <span className="text-xs text-muted-foreground">
                {m.beschreibbar && m.freiBytes !== null ? formatBytes(m.freiBytes) : 'nur lesend'}
              </span>
            </Button>
          ))}
        </div>
        {traeger && traeger.medien.length === 0 && traeger.hinweis && (
          <p className="text-xs text-muted-foreground" data-testid="export-ziele-hinweis">
            {traeger.hinweis}
          </p>
        )}
      </div>
    </Feldgruppe>
  );
}
