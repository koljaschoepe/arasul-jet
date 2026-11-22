/**
 * Meine Meldungen: was diese Person über das Icon oben rechts gemeldet hat,
 * mit Stand und, wo es einen gibt, dem Grund (J52, M7, Karte
 * werkstatt-und-rechte; `company/schleife.md`, Regel 2 seit 22.11.2026).
 *
 * Die einzige Ansicht der Werkstatt ohne das Recht dazu. Nur lesen: den Stand
 * setzt, wer das Recht hat. Welche Meldungen hier stehen, entscheidet das
 * Gerät (`GET /api/rueckmeldungen` liefert ohne das Recht nur die eigenen),
 * nicht diese Seite; ein Bild gibt das Gerät nur zur eigenen Meldung heraus.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Datenliste, Dialogform, Kopf, Meldung as Hinweis, type Spalte } from '@marken';
import { Bildschirmfoto, StandAbzeichen, appName } from './Eingang';
import { anzahl, istOffen, zeit } from './logik';
import { fest, fliesstext, leise, spalte } from './stil';
import { STAENDE, type Meldung } from './typen';

const SPALTEN: ReadonlyArray<Spalte<Meldung>> = [
  {
    schluessel: 'text',
    titel: 'Meldung',
    kuerzen: true,
    wert: m => m.text,
    zelle: m => m.text,
  },
  { schluessel: 'app', titel: 'App', wert: appName, zelle: appName },
  {
    schluessel: 'wann',
    titel: 'Gemeldet',
    wert: m => m.erstellt_am,
    zelle: m => (
      <span style={{ ...leise, fontVariantNumeric: 'tabular-nums' }}>{zeit(m.erstellt_am)}</span>
    ),
  },
  {
    schluessel: 'stand',
    titel: 'Stand',
    inKarteOben: true,
    wert: m => STAENDE.indexOf(m.stand_meldung),
    zelle: m => <StandAbzeichen stand={m.stand_meldung} />,
  },
];

/** Was ein Stand für den bedeutet, der gemeldet hat. */
const STAND_SATZ: Record<Meldung['stand_meldung'], string> = {
  neu: 'Ihre Meldung ist angekommen und noch nicht bearbeitet.',
  angenommen: 'Ihre Meldung ist angenommen und wird umgesetzt.',
  umgesetzt: 'Ihre Meldung ist umgesetzt.',
  abgelehnt: 'Ihre Meldung wird nicht umgesetzt.',
};

function EigeneMeldungDialog({ meldung, schliessen }: { meldung: Meldung; schliessen: () => void }) {
  return (
    <Dialogform
      offen
      beiSchliessen={schliessen}
      titel={appName(meldung)}
      groesse="gross"
      fuss={
        <Button type="button" variant="outline" onClick={schliessen}>
          Schließen
        </Button>
      }
    >
      <div style={spalte(3)} data-testid="werkstatt-eigene-meldung">
        <p style={leise}>{`Gemeldet ${zeit(meldung.erstellt_am)}`}</p>
        <p style={fliesstext}>{meldung.text}</p>
        <p style={{ ...fest, ...leise }} data-testid="werkstatt-seite">
          {meldung.seite}
        </p>
        <Bildschirmfoto meldung={meldung} />
        <div
          style={{
            ...spalte(2),
            borderTop: '1px solid var(--ara-kante)',
            paddingTop: 'var(--ara-abstand-3)',
          }}
        >
          <div style={{ display: 'flex', gap: 'var(--ara-abstand-2)', alignItems: 'center' }}>
            <StandAbzeichen stand={meldung.stand_meldung} />
            {meldung.stand_geaendert_am && (
              <span style={leise}>seit {zeit(meldung.stand_geaendert_am)}</span>
            )}
          </div>
          <p style={fliesstext}>{STAND_SATZ[meldung.stand_meldung]}</p>
          {meldung.grund && (
            <div style={spalte(1)} data-testid="werkstatt-grund-lesen">
              <p style={leise}>
                {meldung.stand_meldung === 'abgelehnt' ? 'Grund der Ablehnung' : 'Anmerkung'}
              </p>
              <p style={fliesstext}>{meldung.grund}</p>
            </div>
          )}
        </div>
      </div>
    </Dialogform>
  );
}

export function EigeneMeldungen({
  meldungen,
  laedt,
  fehler,
  werkzeuge,
}: {
  meldungen: readonly Meldung[];
  laedt: boolean;
  fehler: string | null;
  werkzeuge?: ReactNode;
}) {
  const [offenId, setOffenId] = useState<number | null>(null);
  const offen = useMemo(() => meldungen.filter(istOffen).length, [meldungen]);
  const gewaehlt = meldungen.find(m => m.id === offenId) ?? null;

  useEffect(() => {
    if (offenId !== null && !laedt && !gewaehlt) setOffenId(null);
  }, [offenId, laedt, gewaehlt]);

  return (
    <div style={spalte(2)} data-testid="werkstatt-meine">
      <Kopf
        titel="Meine Meldungen"
        beschreibung={`Was Sie über das Icon oben rechts in einer App gemeldet haben, und was daraus wurde. ${anzahl(offen, 'Meldung ist', 'Meldungen sind')} in Arbeit.`}
        werkzeuge={werkzeuge}
      />
      {fehler ? (
        <Hinweis
          art="fehler"
          titel="Ihre Meldungen ließen sich nicht laden."
          kennzeichen="werkstatt-fehler"
        >
          {fehler}
        </Hinweis>
      ) : (
        <Datenliste
          daten={meldungen}
          spalten={SPALTEN}
          kennung={m => String(m.id)}
          beschriftung="Meine Meldungen"
          laedt={laedt}
          aufZeile={m => setOffenId(m.id)}
          gewaehlt={offenId === null ? null : String(offenId)}
          leer={{
            titel: 'Noch keine Meldung von Ihnen',
            beschreibung:
              'Fehlt in einer App etwas oder stimmt etwas nicht, tippen Sie dort oben rechts auf das Icon. Ihre Meldung steht danach hier, mit Stand.',
          }}
        />
      )}
      {!laedt && !fehler && meldungen.length > 0 && (
        <p style={leise} data-testid="werkstatt-zahl">
          {`${anzahl(meldungen.length, 'Meldung', 'Meldungen')} von Ihnen`}
        </p>
      )}
      {gewaehlt && (
        <EigeneMeldungDialog
          key={gewaehlt.id}
          meldung={gewaehlt}
          schliessen={() => setOffenId(null)}
        />
      )}
    </div>
  );
}
