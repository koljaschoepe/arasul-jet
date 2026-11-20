/**
 * Apps: je App die Fassung in Test und Live, zuletzt geändert, die Zahl
 * offener Meldungen (J44, M7). Ein Klick führt in den Eingang, gefiltert auf
 * diese App. Gelesen über alle Apps des Geräts, nicht nur die freigegebenen:
 * wer das Kennzeichen trägt, baut die Apps dieses Hauses.
 */
import { AppWindow } from 'lucide-react';
import { Badge, Datenliste, Kopf, Meldung as Hinweis, type Spalte } from '@marken';
import { anzahl, zeit } from './logik';
import { fest, leise, spalte } from './stil';
import type { AppStand, Fassung } from './typen';

function FassungZelle({ fassung, leerText }: { fassung: Fassung | null; leerText: string }) {
  if (!fassung) return <span style={leise}>{leerText}</span>;
  return <span style={fest}>{fassung.version}</span>;
}

const SPALTEN: ReadonlyArray<Spalte<AppStand>> = [
  {
    schluessel: 'name',
    titel: 'App',
    wert: a => a.name,
    zelle: a => (
      <span style={spalte(1)}>
        <span>{a.name}</span>
        {a.mitgeliefert && <span style={leise}>kommt mit Arasul</span>}
      </span>
    ),
  },
  {
    schluessel: 'live',
    titel: 'Live',
    wert: a => a.live?.version ?? '',
    zelle: a => <FassungZelle fassung={a.live} leerText="noch nicht live" />,
  },
  {
    schluessel: 'test',
    titel: 'Test',
    wert: a => a.test?.version ?? '',
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
}: {
  apps: readonly AppStand[];
  laedt: boolean;
  fehler: string | null;
  zeigeMeldungen: (appId: string) => void;
}) {
  const offen = apps.reduce((summe, a) => summe + a.meldungen.offen, 0);
  return (
    <div style={spalte(4)} data-testid="cockpit-apps">
      <Kopf
        titel="Apps"
        symbol={<AppWindow />}
        beschreibung={`Je App die Fassung in Test und Live. ${anzahl(offen, 'offene Meldung', 'offene Meldungen')} über alle Apps; ein Klick zeigt sie.`}
      />
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
