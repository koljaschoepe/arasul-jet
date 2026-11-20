/**
 * Apps: je App die Fassung in Test und Live, zuletzt geändert, die Zahl
 * offener Meldungen (J44, M7). Ein Klick führt in den Eingang, gefiltert auf
 * diese App. Gelesen über alle Apps des Geräts, nicht nur die freigegebenen:
 * wer das Kennzeichen trägt, baut die Apps dieses Hauses.
 */
import type { ReactNode } from 'react';
import {
  Badge,
  Datenliste,
  Kennzahl,
  Kennzahlen,
  Kopf,
  Meldung as Hinweis,
  type Spalte,
} from '@marken';
import { anzahl, wartetAufLive, zeit } from './logik';
import { leise, spalte } from './stil';
import type { AppStand, Fassung } from './typen';

function FassungZelle({ fassung, leerText }: { fassung: Fassung | null; leerText: string }) {
  if (!fassung) return <span style={leise}>{leerText}</span>;
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fassung.version}</span>;
}

const SPALTEN: ReadonlyArray<Spalte<AppStand>> = [
  {
    schluessel: 'name',
    titel: 'App',
    wert: a => a.name,
    // Eine Zeile (40 px, Bibliothek 5.9.0): „kommt mit Arasul" steht als
    // leiser Zusatz hinter dem Namen, nicht mehr darunter.
    zelle: a => (
      <span style={{ display: 'inline-flex', gap: 'var(--ara-abstand-2)', alignItems: 'baseline' }}>
        <span>{a.name}</span>
        {a.mitgeliefert && <span style={leise}>kommt mit Arasul</span>}
      </span>
    ),
  },
  {
    schluessel: 'live',
    titel: 'Live',
    wert: a => a.live?.version ?? '',
    kartenText: a => (a.live ? `Live ${a.live.version}` : 'noch nicht live'),
    zelle: a => <FassungZelle fassung={a.live} leerText="noch nicht live" />,
  },
  {
    schluessel: 'test',
    titel: 'Test',
    wert: a => a.test?.version ?? '',
    kartenText: a => (a.test ? `Test ${a.test.version}` : null),
    zelle: a => (
      <span style={{ display: 'inline-flex', gap: 'var(--ara-abstand-1)', alignItems: 'center' }}>
        <FassungZelle fassung={a.test} leerText={a.mitgeliefert ? '—' : 'nichts im Test'} />
        {a.test_neuer && <Badge variant="primary">neuer als live</Badge>}
      </span>
    ),
  },
  {
    schluessel: 'geaendert',
    titel: 'Zuletzt geändert',
    wert: a => a.zuletzt_geaendert ?? '',
    zelle: a => (
      <span style={leise}>{a.mitgeliefert ? 'mit dem Gerät' : zeit(a.zuletzt_geaendert)}</span>
    ),
  },
  {
    schluessel: 'offen',
    titel: 'Offene Meldungen',
    ausrichtung: 'rechts',
    inKarteOben: true,
    kartenText: a =>
      a.meldungen.offen > 0 ? (
        <Badge variant={a.meldungen.neu > 0 ? 'primary' : 'default'}>
          {anzahl(a.meldungen.offen, 'Meldung', 'Meldungen')}
        </Badge>
      ) : null,
    wert: a => a.meldungen.offen,
    zelle: a =>
      a.meldungen.offen > 0 ? (
        <Badge
          variant={a.meldungen.neu > 0 ? 'primary' : 'default'}
          data-testid={`cockpit-offen-${a.id}`}
        >
          {a.meldungen.offen}
        </Badge>
      ) : (
        <span style={leise}>0</span>
      ),
  },
];

export function AppsAnsicht({
  apps,
  laedt,
  fehler,
  zeigeMeldungen,
  werkzeuge,
}: {
  apps: readonly AppStand[];
  laedt: boolean;
  fehler: string | null;
  zeigeMeldungen: (appId: string) => void;
  /** Werkzeuge, die jede Ansicht trägt (Neu laden), aus dem Rahmen des Cockpits. */
  werkzeuge?: ReactNode;
}) {
  const offen = apps.reduce((summe, a) => summe + a.meldungen.offen, 0);
  const neu = apps.reduce((summe, a) => summe + a.meldungen.neu, 0);
  const wartend = wartetAufLive(apps).length;
  return (
    <div style={spalte(2)} data-testid="cockpit-apps">
      <Kopf
        titel="Apps"
        werkzeuge={werkzeuge}
        beschreibung={`Je App die Fassung in Test und Live. ${anzahl(offen, 'offene Meldung', 'offene Meldungen')} über alle Apps; ein Klick zeigt sie.`}
      />
      {!fehler && !laedt && apps.length > 0 && (
        <div data-testid="cockpit-kennzahlen">
          <Kennzahlen>
            <Kennzahl beschriftung="Apps" wert={apps.length} />
            <Kennzahl beschriftung="Offene Meldungen" wert={offen} />
            <Kennzahl beschriftung="Davon neu" wert={neu} />
            <Kennzahl beschriftung="Warten auf Live" wert={wartend} />
          </Kennzahlen>
        </div>
      )}
      {fehler ? (
        <Hinweis
          art="fehler"
          titel="Die Apps ließen sich nicht laden."
          kennzeichen="cockpit-fehler"
        >
          {fehler}
        </Hinweis>
      ) : (
        <Datenliste
          daten={apps}
          spalten={SPALTEN}
          kennung={a => a.id}
          beschriftung="Apps"
          laedt={laedt}
          aufZeile={a => zeigeMeldungen(a.id)}
          leer={{
            titel: 'Noch keine App am Gerät',
            beschreibung: 'Eine App kommt mit dem Kit in den Test und steht dann hier.',
          }}
        />
      )}
    </div>
  );
}
