/**
 * Rückmeldungen: was Mitarbeiter über das Icon über jeder App gemeldet haben
 * (J42, M7, Karte rueckmeldung-im-rahmen).
 *
 * VORERST EINE EINFACHE LISTE. Neueste zuerst, je Meldung App, Person, Zeit,
 * Seite, Text und das Bildschirmfoto mit der markierten Stelle; ein Klick auf
 * das Bild zeigt es groß, „Entfernen" nimmt Meldung und Bild vom Gerät. Den
 * Eingang mit Ständen (angenommen, umgesetzt, abgelehnt) baut das
 * Entwickler-Cockpit (J44), nicht diese Seite.
 *
 * Der Bereich steht nur in der Leiste, wenn die Person das Kennzeichen
 * Entwickler trägt (`Settings.tsx`). Entscheiden tut das Backend: jeder Weg
 * hier fragt das Kennzeichen frisch aus der Datenbank, auch beim Administrator.
 */
import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { Bestaetigung, Button, Dialogform, Kopf, Leerzustand } from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import {
  bildAdresse,
  useRueckmeldungEntfernen,
  useRueckmeldungen,
  type Rueckmeldung,
} from './rueckmeldungen/useRueckmeldungen';

const zeit = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

function Zeile({
  meldung,
  onBild,
  onEntfernen,
}: {
  meldung: Rueckmeldung;
  onBild: () => void;
  onEntfernen: () => void;
}) {
  const app = meldung.app_name ?? meldung.app_id;
  return (
    <li
      className="flex flex-col gap-2 border-b border-border p-4 last:border-b-0"
      data-testid={`rueckmeldung-${meldung.id}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium">
          {app}
          {meldung.stand === 'test' ? ' (Test)' : ''}
        </span>
        <span className="text-xs text-muted-foreground">
          {meldung.person?.anzeigeName ?? 'Gelöschte Person'} · {zeit(meldung.erstellt_am)}
        </span>
      </div>
      <p className="text-sm whitespace-pre-wrap break-words">{meldung.text}</p>
      <p className="font-mono text-xs break-all text-muted-foreground">{meldung.seite}</p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        {meldung.hat_bild ? (
          <Button
            type="button"
            variant="ghost"
            className="h-auto p-0"
            onClick={onBild}
            aria-label="Bildschirmfoto groß zeigen"
            data-testid={`rueckmeldung-bild-${meldung.id}`}
          >
            <img
              src={bildAdresse(meldung.id)}
              alt={`Bildschirmfoto zu ${app}`}
              loading="lazy"
              className="block max-h-40 max-w-full rounded-sm border border-border"
            />
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Ohne Bildschirmfoto</span>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onEntfernen}
          data-testid={`rueckmeldung-entfernen-${meldung.id}`}
        >
          Entfernen
        </Button>
      </div>
    </li>
  );
}

export function RueckmeldungenSettings({ entwickler }: { entwickler: boolean }) {
  const liste = useRueckmeldungen(entwickler);
  const entfernen = useRueckmeldungEntfernen();
  const [gross, setGross] = useState<Rueckmeldung | null>(null);
  const [weg, setWeg] = useState<Rueckmeldung | null>(null);

  const kopf = (
    <Kopf
      titel="Rückmeldungen"
      symbol={<MessageSquarePlus />}
      beschreibung="Was Mitarbeiter über das Icon oben rechts in den Apps gemeldet haben. Neueste zuerst."
    />
  );

  if (!entwickler) {
    return (
      <div className="animate-in fade-in flex flex-col gap-4" data-testid="rueckmeldungen-seite">
        {kopf}
        <Leerzustand
          symbol={<MessageSquarePlus />}
          titel="Nur mit dem Kennzeichen Entwickler"
          beschreibung="Rückmeldungen lesen nur Personen mit dem Kennzeichen Entwickler. Es steht unter Personen."
        />
      </div>
    );
  }

  const meldungen = liste.data ?? [];

  return (
    <div className="animate-in fade-in flex flex-col gap-4" data-testid="rueckmeldungen-seite">
      {kopf}
      {liste.isLoading ? (
        <SkeletonText lines={6} />
      ) : liste.isError ? (
        <p className="text-sm text-muted-foreground" data-testid="rueckmeldungen-fehler">
          Die Rückmeldungen ließen sich nicht laden.
        </p>
      ) : meldungen.length === 0 ? (
        <Leerzustand
          symbol={<MessageSquarePlus />}
          titel="Noch keine Rückmeldung"
          beschreibung="Sobald jemand in einer App auf das Icon oben rechts tippt und absendet, steht es hier."
        />
      ) : (
        <>
          <p className="text-xs text-muted-foreground" data-testid="rueckmeldungen-zahl">
            {meldungen.length === 1 ? '1 Rückmeldung' : `${meldungen.length} Rückmeldungen`}
          </p>
          <ul className="rounded-md border border-border" data-testid="rueckmeldungen-liste">
            {meldungen.map(m => (
              <Zeile
                key={m.id}
                meldung={m}
                onBild={() => setGross(m)}
                onEntfernen={() => setWeg(m)}
              />
            ))}
          </ul>
        </>
      )}

      <Dialogform
        offen={gross !== null}
        beiSchliessen={() => setGross(null)}
        titel={gross ? `${gross.app_name ?? gross.app_id}: ${gross.seite}` : ''}
        groesse="ganz"
      >
        {gross && (
          <img
            src={bildAdresse(gross.id)}
            alt="Bildschirmfoto mit markierter Stelle"
            className="mx-auto block h-auto max-w-full"
          />
        )}
      </Dialogform>

      <Bestaetigung
        offen={weg !== null}
        beiSchliessen={() => setWeg(null)}
        beiBestaetigen={() => {
          if (!weg) return;
          entfernen.mutate(weg.id, { onSettled: () => setWeg(null) });
        }}
        titel="Rückmeldung entfernen?"
        frage="Text und Bildschirmfoto gehen vom Gerät. In älteren Sicherungen bleiben sie, bis diese ablaufen."
        jaText="Entfernen"
        art="gefahr"
        laeuft={entfernen.isPending}
      />
    </div>
  );
}
