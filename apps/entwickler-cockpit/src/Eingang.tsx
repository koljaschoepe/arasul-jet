/**
 * Eingang: alle Rückmeldungen je App mit Text, Bild, Seite, Person und Stand
 * (J44, M7). Filter je App und Stand, Vorgabe „offen“ (neu und angenommen).
 * Ein Klick auf eine Meldung öffnet sie: Text, Seite, Bildschirmfoto mit der
 * markierten Stelle, Stand setzen, bei „abgelehnt“ mit Pflichtgrund,
 * Entfernen mit Rückfrage. Ersetzt die Liste Verwaltung › Rückmeldungen
 * aus J42.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FilterX } from '@marken/symbole';
import {
  Icon,
  Werkzeug,
  Badge,
  Bestaetigung,
  Button,
  Datenliste,
  Dialogform,
  Kopf,
  Label,
  Meldung as Hinweis,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  type Spalte,
} from '@marken';
import { bildAdresse } from './api';
import { useEntfernen, useStandSetzen } from './daten';
import {
  STAND_WORT,
  anzahl,
  appsAusMeldungen,
  filtere,
  grundFehlt,
  istOffen,
  zeit,
  FILTER_VORGABE,
  type EingangFilter,
} from './logik';
import { fest, fliesstext, leise, spalte, zeile } from './stil';
import { STAENDE, type AppStand, type Meldung, type StandMeldung } from './typen';

const BADGE: Record<StandMeldung, 'primary' | 'default' | 'outline' | 'warning'> = {
  neu: 'primary',
  angenommen: 'default',
  umgesetzt: 'outline',
  abgelehnt: 'warning',
};

export function StandAbzeichen({ stand }: { stand: StandMeldung }) {
  return (
    <Badge variant={BADGE[stand]} data-testid="cockpit-stand">
      {STAND_WORT[stand]}
    </Badge>
  );
}

const appName = (m: Meldung) => `${m.app_name ?? m.app_id}${m.stand === 'test' ? ' (Test)' : ''}`;

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
    schluessel: 'person',
    titel: 'Von',
    wert: m => m.person?.anzeigeName ?? '',
    zelle: m => m.person?.anzeigeName ?? 'Gelöschte Person',
  },
  {
    // Eine eigene Spalte statt einer zweiten Zeile unter dem Namen: die
    // Zeile der kompakten Tabelle ist 40 px hoch (Bibliothek 5.9.0).
    schluessel: 'wann',
    titel: 'Eingang',
    wert: m => m.erstellt_am,
    zelle: m => <span style={leise}>{zeit(m.erstellt_am)}</span>,
  },
  {
    schluessel: 'bild',
    titel: 'Foto',
    inKarte: false,
    wert: m => (m.hat_bild ? 1 : 0),
    zelle: m => <span style={leise}>{m.hat_bild ? 'mit Foto' : 'ohne'}</span>,
  },
  {
    schluessel: 'stand',
    titel: 'Stand',
    inKarteOben: true,
    wert: m => STAENDE.indexOf(m.stand_meldung),
    zelle: m => <StandAbzeichen stand={m.stand_meldung} />,
  },
];

function Auswahl({
  wert,
  setze,
  beschriftung,
  moeglichkeiten,
  kennung,
}: {
  wert: string;
  setze: (w: string) => void;
  beschriftung: string;
  moeglichkeiten: { wert: string; name: string }[];
  kennung: string;
}) {
  return (
    // Die Beschriftung nur für Vorlesewerkzeuge: der Wert („Alle Apps“,
    // „Offen (neu und angenommen)“) sagt es schon, und zwei verschieden lange
    // Wörter davor rückten die Felder am Handy verschieden weit ein.
    <div style={{ flex: '1 1 14rem', maxWidth: '18rem' }}>
      <Label htmlFor={kennung} className="sr-only">
        {beschriftung}
      </Label>
      <Select value={wert} onValueChange={setze}>
        <SelectTrigger id={kennung} data-testid={kennung} style={{ width: '100%' }}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {moeglichkeiten.map(m => (
            <SelectItem key={m.wert} value={m.wert}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Eine Meldung offen: lesen, Stand setzen, entfernen. */
function MeldungDialog({ meldung, schliessen }: { meldung: Meldung; schliessen: () => void }) {
  const setzen = useStandSetzen();
  const entfernen = useEntfernen();
  const [stand, setStand] = useState<StandMeldung>(meldung.stand_meldung);
  const [grund, setGrund] = useState(meldung.grund ?? '');
  const [weg, setWeg] = useState(false);
  const [gross, setGross] = useState(false);
  const fehlt = grundFehlt(stand, grund);
  const unveraendert = stand === meldung.stand_meldung && grund.trim() === (meldung.grund ?? '');

  return (
    <>
      <Dialogform
        offen
        beiSchliessen={schliessen}
        titel={appName(meldung)}
        groesse="gross"
        fuss={
          <div style={{ ...zeile(2), justifyContent: 'space-between', width: '100%' }}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setWeg(true)}
              data-testid="cockpit-entfernen"
            >
              Entfernen
            </Button>
            <div style={zeile(2)}>
              <Button type="button" variant="outline" onClick={schliessen}>
                Schließen
              </Button>
              <Button
                type="button"
                variant="solid"
                disabled={fehlt || unveraendert || setzen.isPending}
                data-testid="cockpit-stand-speichern"
                onClick={() =>
                  setzen.mutate(
                    { id: meldung.id, stand, grund: grund.trim() || undefined },
                    { onSuccess: schliessen }
                  )
                }
              >
                {setzen.isPending ? 'Speichert…' : 'Stand speichern'}
              </Button>
            </div>
          </div>
        }
      >
        <div style={spalte(3)} data-testid="cockpit-meldung">
          <p style={leise}>
            {meldung.person?.anzeigeName ?? 'Gelöschte Person'} · {zeit(meldung.erstellt_am)}
          </p>
          <p style={fliesstext}>{meldung.text}</p>
          <p style={{ ...fest, ...leise }} data-testid="cockpit-seite">
            {meldung.seite}
          </p>
          {meldung.hat_bild ? (
            <button
              type="button"
              onClick={() => setGross(g => !g)}
              aria-label={gross ? 'Bildschirmfoto kleiner' : 'Bildschirmfoto groß zeigen'}
              style={{ padding: 0, border: 0, background: 'none', cursor: 'zoom-in' }}
            >
              <img
                src={bildAdresse(meldung.id)}
                alt="Bildschirmfoto mit markierter Stelle"
                data-testid="cockpit-bild"
                style={{
                  display: 'block',
                  maxWidth: '100%',
                  maxHeight: gross ? 'none' : '18rem',
                  height: 'auto',
                  border: '1px solid var(--ara-kante)',
                  borderRadius: 'var(--ara-rundung-sm)',
                }}
              />
            </button>
          ) : (
            <p style={leise}>Ohne Bildschirmfoto.</p>
          )}

          <div
            style={{
              ...spalte(2),
              borderTop: '1px solid var(--ara-kante)',
              paddingTop: 'var(--ara-abstand-3)',
            }}
          >
            <Auswahl
              kennung="cockpit-stand-wahl"
              beschriftung="Stand"
              wert={stand}
              setze={w => setStand(w as StandMeldung)}
              moeglichkeiten={STAENDE.map(s => ({ wert: s, name: STAND_WORT[s] }))}
            />
            <div style={spalte(1)}>
              <Label htmlFor="cockpit-grund" style={leise}>
                {stand === 'abgelehnt' ? 'Grund (Pflicht beim Ablehnen)' : 'Grund (frei)'}
              </Label>
              <Textarea
                id="cockpit-grund"
                data-testid="cockpit-grund"
                value={grund}
                maxLength={2000}
                onChange={e => setGrund(e.target.value)}
                aria-invalid={fehlt}
                rows={3}
              />
              {fehlt && (
                <p style={leise} data-testid="cockpit-grund-fehlt">
                  Wer ablehnt, schreibt dazu, warum.
                </p>
              )}
            </div>
            {setzen.isError && (
              <Hinweis art="fehler" kennzeichen="cockpit-stand-fehler">
                {setzen.error.message}
              </Hinweis>
            )}
            <p style={leise}>Wer gemeldet hat, erfährt davon nichts.</p>
          </div>
        </div>
      </Dialogform>
      <Bestaetigung
        offen={weg}
        beiSchliessen={() => setWeg(false)}
        beiBestaetigen={() =>
          entfernen.mutate(meldung.id, {
            onSettled: () => {
              setWeg(false);
              schliessen();
            },
          })
        }
        titel="Rückmeldung entfernen?"
        frage="Text und Bildschirmfoto gehen vom Gerät. In älteren Sicherungen bleiben sie, bis diese ablaufen."
        jaText="Entfernen"
        art="gefahr"
        laeuft={entfernen.isPending}
      />
    </>
  );
}

export function Eingang({
  meldungen,
  apps,
  laedt,
  fehler,
  filter,
  setzeFilter,
  werkzeuge,
}: {
  meldungen: readonly Meldung[];
  apps: readonly AppStand[];
  laedt: boolean;
  fehler: string | null;
  filter: EingangFilter;
  setzeFilter: (f: EingangFilter) => void;
  /** Werkzeuge, die jede Ansicht trägt (Neu laden), aus dem Rahmen des Cockpits. */
  werkzeuge?: ReactNode;
}) {
  const [offenId, setOffenId] = useState<number | null>(null);
  const gefiltert = useMemo(() => filtere(meldungen, filter), [meldungen, filter]);
  const appWahl = useMemo(() => appsAusMeldungen(meldungen, apps), [meldungen, apps]);
  const offen = meldungen.filter(istOffen).length;
  const gewaehlt = meldungen.find(m => m.id === offenId) ?? null;

  // Verschwindet die offene Meldung (entfernt), schließt der Dialog.
  useEffect(() => {
    if (offenId !== null && !laedt && !gewaehlt) setOffenId(null);
  }, [offenId, laedt, gewaehlt]);

  return (
    <div style={spalte(2)} data-testid="cockpit-eingang">
      <Kopf
        titel="Eingang"
        beschreibung={`Was in den Apps über das Icon oben rechts gemeldet wurde. ${anzahl(offen, 'Meldung ist', 'Meldungen sind')} offen.`}
        werkzeuge={
          <>
            {(filter.app !== FILTER_VORGABE.app || filter.stand !== FILTER_VORGABE.stand) && (
              <Werkzeug
                symbol={<Icon symbol={FilterX} />}
                beschriftung="Filter zurücksetzen"
                onClick={() => setzeFilter(FILTER_VORGABE)}
                data-testid="cockpit-filter-zuruecksetzen"
              />
            )}
            {werkzeuge}
          </>
        }
      />
      <div style={zeile(2)}>
        <Auswahl
          kennung="cockpit-filter-app"
          beschriftung="App"
          wert={filter.app}
          setze={app => setzeFilter({ ...filter, app })}
          moeglichkeiten={[
            { wert: 'alle', name: 'Alle Apps' },
            ...appWahl.map(a => ({ wert: a.id, name: a.name })),
          ]}
        />
        <Auswahl
          kennung="cockpit-filter-stand"
          beschriftung="Stand"
          wert={filter.stand}
          setze={s => setzeFilter({ ...filter, stand: s as EingangFilter['stand'] })}
          moeglichkeiten={[
            { wert: 'offen', name: 'Offen (neu und angenommen)' },
            ...STAENDE.map(s => ({ wert: s, name: STAND_WORT[s] })),
            { wert: 'alle', name: 'Alle' },
          ]}
        />
      </div>
      {fehler ? (
        <Hinweis
          art="fehler"
          titel="Die Rückmeldungen ließen sich nicht laden."
          kennzeichen="cockpit-fehler"
        >
          {fehler}
        </Hinweis>
      ) : (
        <Datenliste
          daten={gefiltert}
          spalten={SPALTEN}
          kennung={m => String(m.id)}
          beschriftung="Rückmeldungen"
          laedt={laedt}
          aufZeile={m => setOffenId(m.id)}
          gewaehlt={offenId === null ? null : String(offenId)}
          leer={
            meldungen.length === 0
              ? {
                  titel: 'Noch keine Rückmeldung',
                  beschreibung:
                    'Sobald jemand in einer App auf das Icon oben rechts tippt und absendet, steht es hier.',
                }
              : {
                  titel: 'Nichts in diesem Filter',
                  beschreibung: 'Wählen Sie oben eine andere App oder einen anderen Stand.',
                }
          }
        />
      )}
      {!laedt && !fehler && meldungen.length > 0 && (
        <p style={leise} data-testid="cockpit-zahl">
          {anzahl(gefiltert.length, 'Meldung', 'Meldungen')} in diesem Filter
        </p>
      )}
      {gewaehlt && (
        <MeldungDialog key={gewaehlt.id} meldung={gewaehlt} schliessen={() => setOffenId(null)} />
      )}
    </div>
  );
}
