/**
 * Eingang: alle Rückmeldungen je App mit Text, Bild, Seite, Person und Stand
 * (J44, M7). Nur mit dem Recht in der Werkstatt (J52); ohne es zeigt die
 * Werkstatt „Meine Meldungen“ (`EigeneMeldungen.tsx`). Filter je App und
 * Stand, Vorgabe „offen“ (neu und angenommen). Ein Klick auf eine Meldung
 * öffnet sie: Text, Seite, Bildschirmfoto mit der markierten Stelle, Stand
 * setzen, bei „abgelehnt“ mit Pflichtgrund, Entfernen mit Rückfrage. Ersetzt
 * die Liste Verwaltung › Rückmeldungen aus J42.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FilterX } from '@marken/symbole';
import {
  Icon,
  Werkzeug,
  Badge,
  Bestaetigung,
  Blatt,
  Button,
  Datenliste,
  Kopf,
  Label,
  Meldung as Hinweis,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  useSchmalesFenster,
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
    <Badge variant={BADGE[stand]} data-testid="werkstatt-stand">
      {STAND_WORT[stand]}
    </Badge>
  );
}

export const appName = (m: Meldung) =>
  `${m.app_name ?? m.app_id}${m.stand === 'test' ? ' (Test)' : ''}`;

/** Das Bildschirmfoto einer Meldung; ein Klick zeigt es groß. */
export function Bildschirmfoto({ meldung }: { meldung: Meldung }) {
  const [gross, setGross] = useState(false);
  if (!meldung.hat_bild) return <p style={leise}>Ohne Bildschirmfoto.</p>;
  return (
    <button
      type="button"
      onClick={() => setGross(g => !g)}
      aria-label={gross ? 'Bildschirmfoto kleiner' : 'Bildschirmfoto groß zeigen'}
      style={{ padding: 0, border: 0, background: 'none', cursor: 'zoom-in' }}
    >
      <img
        src={bildAdresse(meldung.id)}
        alt="Bildschirmfoto mit markierter Stelle"
        data-testid="werkstatt-bild"
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
  );
}

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
    zelle: m => (
      <span style={{ ...leise, fontVariantNumeric: 'tabular-nums' }}>{zeit(m.erstellt_am)}</span>
    ),
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
  imBlatt = false,
}: {
  wert: string;
  setze: (w: string) => void;
  beschriftung: string;
  moeglichkeiten: { wert: string; name: string }[];
  kennung: string;
  /** Im Blatt einer Meldung: eine Spalte, keine Filterzeile, die Beschriftung sichtbar. */
  imBlatt?: boolean;
}) {
  const schmal = useSchmalesFenster();
  return (
    // In der Filterzeile die Beschriftung nur für Vorlesewerkzeuge: der Wert
    // („Alle Apps“, „Offen (neu und angenommen)“) sagt es schon, und zwei
    // verschieden lange Wörter davor rückten die Felder am Handy verschieden
    // weit ein. Im Blatt steht sie über dem Feld wie „Grund“ darunter, und die
    // Grundbreite der Filterzeile gilt dort nicht: in einer Spalte wurde aus
    // `flex: 1 1 14rem` eine Höhe von 224 px, und „Grund“ rutschte unter den
    // Fuß des Blatts (Generalprobe der Schleife, 22.11.2026).
    // Unter 900 px ohne Grenze der Breite: am Handy steht jedes Feld in
    // einer eigenen Zeile und ist so breit wie die Karten darunter; mit
    // 18rem endete es vorher mitten in der Zeile (J55).
    <div
      style={
        imBlatt
          ? { ...spalte(1), maxWidth: '18rem' }
          : { flex: '1 1 14rem', maxWidth: schmal ? undefined : '18rem' }
      }
    >
      <Label
        htmlFor={kennung}
        className={imBlatt ? undefined : 'sr-only'}
        style={imBlatt ? leise : undefined}
      >
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

/**
 * Eine Meldung offen: lesen, Stand setzen, entfernen. Seit J53 im Blatt der
 * Bibliothek, am Rechner neben der Liste, am Handy von unten.
 */
function MeldungDialog({
  meldung,
  offen,
  schliessen,
}: {
  meldung: Meldung;
  offen: boolean;
  schliessen: () => void;
}) {
  const setzen = useStandSetzen();
  const entfernen = useEntfernen();
  const [stand, setStand] = useState<StandMeldung>(meldung.stand_meldung);
  const [grund, setGrund] = useState(meldung.grund ?? '');
  const [weg, setWeg] = useState(false);
  const fehlt = grundFehlt(stand, grund);
  const unveraendert = stand === meldung.stand_meldung && grund.trim() === (meldung.grund ?? '');

  return (
    <>
      <Blatt
        offen={offen}
        beiSchliessen={schliessen}
        titel={appName(meldung)}
        beschreibung={`${meldung.person?.anzeigeName ?? 'Gelöschte Person'} · ${zeit(meldung.erstellt_am)}`}
        breite="breit"
        kennzeichen="werkstatt-blatt"
        fuss={
          <div style={{ ...zeile(2), justifyContent: 'space-between', width: '100%' }}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setWeg(true)}
              data-testid="werkstatt-entfernen"
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
                data-testid="werkstatt-stand-speichern"
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
        <div style={spalte(3)} data-testid="werkstatt-meldung">
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
            <Auswahl
              kennung="werkstatt-stand-wahl"
              imBlatt
              beschriftung="Stand"
              wert={stand}
              setze={w => setStand(w as StandMeldung)}
              moeglichkeiten={STAENDE.map(s => ({ wert: s, name: STAND_WORT[s] }))}
            />
            <div style={spalte(1)}>
              <Label htmlFor="werkstatt-grund" style={leise}>
                {stand === 'abgelehnt' ? 'Grund (Pflicht beim Ablehnen)' : 'Grund (frei)'}
              </Label>
              <Textarea
                id="werkstatt-grund"
                data-testid="werkstatt-grund"
                value={grund}
                maxLength={2000}
                onChange={e => setGrund(e.target.value)}
                aria-invalid={fehlt}
                rows={3}
              />
              {fehlt && (
                <p style={leise} data-testid="werkstatt-grund-fehlt">
                  Wer ablehnt, schreibt dazu, warum.
                </p>
              )}
            </div>
            {setzen.isError && (
              <Hinweis art="fehler" kennzeichen="werkstatt-stand-fehler">
                {setzen.error.message}
              </Hinweis>
            )}
            <p style={leise}>Wer gemeldet hat, sieht Stand und Grund in der eigenen Werkstatt.</p>
          </div>
        </div>
      </Blatt>
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
  /** Werkzeuge, die jede Ansicht trägt (Neu laden), aus dem Rahmen der Werkstatt. */
  werkzeuge?: ReactNode;
}) {
  const [offenId, setOffenId] = useState<number | null>(null);
  const gefiltert = useMemo(() => filtere(meldungen, filter), [meldungen, filter]);
  const appWahl = useMemo(() => appsAusMeldungen(meldungen, apps), [meldungen, apps]);
  const offen = meldungen.filter(istOffen).length;
  const gewaehlt = meldungen.find(m => m.id === offenId) ?? null;
  // Die zuletzt offene Meldung bleibt im Blatt, während es zugeht.
  const [letzte, setLetzte] = useState<Meldung | null>(null);
  useEffect(() => {
    if (gewaehlt) setLetzte(gewaehlt);
  }, [gewaehlt]);

  // Verschwindet die offene Meldung (entfernt), schließt der Dialog.
  useEffect(() => {
    if (offenId !== null && !laedt && !gewaehlt) setOffenId(null);
  }, [offenId, laedt, gewaehlt]);

  return (
    <div style={spalte(2)} data-testid="werkstatt-eingang">
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
                data-testid="werkstatt-filter-zuruecksetzen"
              />
            )}
            {werkzeuge}
          </>
        }
      />
      <div style={zeile(2)}>
        <Auswahl
          kennung="werkstatt-filter-app"
          beschriftung="App"
          wert={filter.app}
          setze={app => setzeFilter({ ...filter, app })}
          moeglichkeiten={[
            { wert: 'alle', name: 'Alle Apps' },
            ...appWahl.map(a => ({ wert: a.id, name: a.name })),
          ]}
        />
        <Auswahl
          kennung="werkstatt-filter-stand"
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
          kennzeichen="werkstatt-fehler"
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
        <p style={leise} data-testid="werkstatt-zahl">
          {anzahl(gefiltert.length, 'Meldung', 'Meldungen')} in diesem Filter
        </p>
      )}
      {(gewaehlt ?? letzte) && (
        <MeldungDialog
          key={(gewaehlt ?? letzte)!.id}
          meldung={(gewaehlt ?? letzte)!}
          offen={gewaehlt !== null}
          schliessen={() => setOffenId(null)}
        />
      )}
    </div>
  );
}
