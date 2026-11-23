/**
 * Der Reiter „Auswertung" jeder Fach-App (J55, M7): oben der Zeitraum, dann
 * Kennzahlen für genau diesen Zeitraum, darunter Diagramme, Ranglisten und
 * Tabellen. Alles rechnet aus denselben Einträgen wie Liste und Übersicht,
 * also passen die Zahlen zusammen. Export als CSV (alle Teile in einer
 * Datei) und Drucken (die Seite ohne Bedienung).
 *
 * Was ausgewertet wird, sagt jede App selbst (`AppDef.auswertung`); hier
 * steht nur die Form.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Button, Icon, Kennzahl, Kennzahlen, type KennzahlProps } from '@marken';
import { Chart } from '@marken/diagramm';
import { ArrowDown, ArrowUp, Download, Printer } from '@marken/symbole';
import type { Eintrag } from '../bestand';
import { SPRACHE } from './gemeinsam';
import type { Ctx, Diagramm } from './fachapp';
import {
  csvMehrteilig,
  heuteIso,
  t,
  zeitraum,
  ZEITRAEUME,
  type Zeitraum,
  type ZeitraumKennung,
} from './gemeinsam';

export interface RanglistenZeile {
  name: string;
  /** Länge des Balkens, relativ zum größten Wert. */
  wert: number;
  /** Der Wert als Text, rechts. */
  text: string;
  neben?: string;
  aufKlick?: () => void;
}

export type Teil =
  | {
      art: 'diagramm';
      titel: string;
      d: Diagramm;
      breit?: boolean;
      /** Eine Zeile je Monat des Zeitraums: leere am Anfang fallen weg. */
      monatlich?: boolean;
    }
  | {
      art: 'rangliste';
      titel: string;
      satz?: string;
      zeilen: RanglistenZeile[];
      leer?: string;
      breit?: boolean;
    }
  | {
      art: 'tabelle';
      titel: string;
      satz?: string;
      kopf: string[];
      zeilen: string[][];
      /** Spalten, die rechtsbündig stehen (Zahlen). */
      rechts?: number[];
      breit?: boolean;
    };

export interface AuswertungDef {
  /** Tage über heute hinaus, die zum Zeitraum gehören (Pläne). */
  voraus?: number;
  /** `oeffnen` zeigt einen Vorgang dieser App in der Einzelansicht. */
  rechnen: (
    liste: Eintrag[],
    ctx: Ctx,
    z: Zeitraum,
    oeffnen: (id: number) => void
  ) => { kennzahlen: KennzahlProps[]; teile: Teil[] };
}

function csvVon(teil: Teil): { titel: string; kopf: string[]; zeilen: string[][] } {
  if (teil.art === 'tabelle') return { titel: teil.titel, kopf: teil.kopf, zeilen: teil.zeilen };
  if (teil.art === 'rangliste') {
    return {
      titel: teil.titel,
      kopf: [t('Name', 'Name'), t('Wert', 'Value'), t('Zusatz', 'Detail')],
      zeilen: teil.zeilen.map(z => [z.name, z.text, z.neben ?? '']),
    };
  }
  return {
    titel: teil.titel,
    kopf: [t('Zeitraum', 'Period'), ...teil.d.series.map(s => s.name)],
    zeilen: teil.d.data.map(d => [
      String(d.name),
      ...teil.d.series.map(s => String(Math.round(Number(d[s.key]) * 100) / 100)),
    ]),
  };
}

function Rangliste({ zeilen, leer }: { zeilen: RanglistenZeile[]; leer?: string }) {
  const max = Math.max(1, ...zeilen.map(z => z.wert));
  if (zeilen.length === 0)
    return <p className="fa-satz">{leer ?? t('Nichts im Zeitraum.', 'Nothing in this period.')}</p>;
  return (
    <ol className="fa-rangliste">
      {zeilen.map(z => {
        const inhalt = (
          <>
            <span className="fa-rang-name">{z.name}</span>
            <span className="fa-rang-wert">{z.text}</span>
            <span className="fa-rang-balken" aria-hidden="true">
              <span style={{ width: `${Math.max(2, (z.wert / max) * 100)}%` }} />
            </span>
            {z.neben && <span className="fa-rang-neben">{z.neben}</span>}
          </>
        );
        return (
          <li key={z.name}>
            {z.aufKlick ? (
              <button type="button" onClick={z.aufKlick}>
                {inhalt}
              </button>
            ) : (
              <div>{inhalt}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Eine Zahl aus einer Zelle wie „12.430 €" oder „88 %", zum Sortieren. */
function zahlAus(text: string): number | null {
  const roh = SPRACHE === 'en' ? text.replace(/,/g, '') : text.replace(/\./g, '').replace(',', '.');
  const n = Number(roh.replace(/[^\d.-]/g, ''));
  return /\d/.test(text) && !Number.isNaN(n) ? n : null;
}

/**
 * Eine schlichte Tabelle der Auswertung: wenige Spalten, Zahlen rechts, ein
 * Klick auf den Kopf sortiert. Keine Datenliste: die wird in einer halben
 * Fläche zu Karten, und Zahlen ohne Spaltenkopf liest niemand.
 */
function Tabelle({
  titel,
  kopf,
  zeilen,
  rechts,
}: {
  titel: string;
  kopf: string[];
  zeilen: string[][];
  rechts: number[];
}) {
  const [sort, setSort] = useState<{ s: number; auf: boolean } | null>(null);
  const sortiert = useMemo(() => {
    if (!sort) return zeilen;
    return [...zeilen].sort((a, b) => {
      const x = a[sort.s] ?? '';
      const y = b[sort.s] ?? '';
      const nx = zahlAus(x);
      const ny = zahlAus(y);
      const r = nx !== null && ny !== null ? nx - ny : x.localeCompare(y, 'de');
      return sort.auf ? r : -r;
    });
  }, [zeilen, sort]);
  if (zeilen.length === 0)
    return <p className="fa-satz">{t('Nichts im Zeitraum.', 'Nothing in this period.')}</p>;
  return (
    <div className="fa-tabelle-kasten">
      <table className="fa-tabelle">
        <caption className="fa-unsichtbar">{titel}</caption>
        <thead>
          <tr>
            {kopf.map((k, s) => (
              <th
                key={k}
                scope="col"
                data-rechts={rechts.includes(s) ? 'ja' : undefined}
                aria-sort={sort?.s === s ? (sort.auf ? 'ascending' : 'descending') : undefined}
              >
                <button
                  type="button"
                  onClick={() =>
                    setSort(v =>
                      v?.s === s ? { s, auf: !v.auf } : { s, auf: !rechts.includes(s) }
                    )
                  }
                >
                  {k}
                  {sort?.s === s && (
                    <Icon symbol={sort.auf ? ArrowUp : ArrowDown} groesse="klein" />
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortiert.map(z => (
            <tr key={z.join('|')}>
              {z.map((zelle, s) => (
                <td key={s} data-rechts={rechts.includes(s) ? 'ja' : undefined}>
                  {zelle}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Monate am Anfang, in denen keine Reihe eines Diagramms einen Wert hat,
 * fallen weg: die App ist erst seit dann in Gebrauch, und zwölf Monate mit
 * neun leeren sähen aus wie ein Fehler. Gilt für alle Diagramme gleich.
 */
function ersterMitWert(teile: Teil[]): number {
  let erster = Infinity;
  for (const teil of teile) {
    if (teil.art !== 'diagramm' || !teil.monatlich) continue;
    const i = teil.d.data.findIndex(d => teil.d.series.some(r => Number(d[r.key]) > 0));
    if (i >= 0) erster = Math.min(erster, i);
  }
  return Number.isFinite(erster) ? erster : 0;
}

export function DiagrammFlaeche({ d, kennung }: { d: Diagramm; kennung: string }): ReactNode {
  return (
    <>
      <h2 id={kennung} className="fa-abschnitt">
        {d.titel}
      </h2>
      <p className="fa-satz">{d.satz}</p>
      <Chart
        data={d.data}
        series={d.series}
        xKey="x"
        xTicks={d.data.map(x => x.x)}
        formatX={(i: number) => String(d.data[i]?.name ?? '')}
        formatY={d.formatY}
        art={d.art}
        height={d.hoehe ?? 200}
        label={d.titel}
      />
    </>
  );
}

export function Auswertung({
  appId,
  titel,
  def,
  liste,
  ctx,
  oeffnen,
}: {
  appId: string;
  titel: string;
  def: AuswertungDef;
  liste: Eintrag[];
  ctx: Ctx;
  oeffnen: (id: number) => void;
}) {
  const [kennung, setKennung] = useState<ZeitraumKennung>('12m');
  const z = useMemo(() => zeitraum(kennung, def.voraus ?? 0), [kennung, def.voraus]);
  const { kennzahlen, teile: roh } = useMemo(
    () => def.rechnen(liste, ctx, z, oeffnen),
    [def, liste, ctx, z, oeffnen]
  );
  const ab = ersterMitWert(roh);
  const teile: Teil[] = roh.map(teil =>
    teil.art === 'diagramm' && teil.monatlich && ab > 0
      ? {
          ...teil,
          d: {
            ...teil.d,
            data: teil.d.data.slice(ab).map((d, x) => ({ ...d, x })),
          },
        }
      : teil
  );
  // Der Verlauf in den Kennzahlen folgt denselben Monaten.
  const laenge = roh.find(x => x.art === 'diagramm' && x.monatlich);
  const zahlen =
    ab > 0 && laenge?.art === 'diagramm'
      ? kennzahlen.map(k =>
          k.verlauf && k.verlauf.length === laenge.d.data.length
            ? { ...k, verlauf: k.verlauf.slice(ab) }
            : k
        )
      : kennzahlen;
  const seit = (() => {
    if (ab === 0) return null;
    const d = new Date(z.von);
    d.setMonth(d.getMonth() + ab);
    return d.toLocaleDateString(SPRACHE === 'en' ? 'en-GB' : 'de-DE', {
      month: 'long',
      year: 'numeric',
    });
  })();

  const exportieren = () =>
    csvMehrteilig(
      `${titel.toLowerCase().replace(/[^a-zäöü0-9]+/g, '-')}-${t('auswertung', 'report')}-${kennung}-${heuteIso()}.csv`,
      teile.map(csvVon)
    );

  const drucken = () => {
    document.documentElement.dataset.druck = 'seite';
    const weg = () => {
      delete document.documentElement.dataset.druck;
      window.removeEventListener('afterprint', weg);
    };
    window.addEventListener('afterprint', weg);
    window.print();
  };

  return (
    <div className="fa-auswertung" data-testid="fa-auswertung">
      <div className="fa-auswertung-kopf">
        <div className="fa-filter" role="group" aria-label={t('Zeitraum', 'Period')}>
          {ZEITRAEUME.map(([k, text]) => (
            <button
              key={k}
              type="button"
              aria-pressed={kennung === k}
              onClick={() => setKennung(k)}
              data-testid={`fa-zeitraum-${k}`}
            >
              {text}
            </button>
          ))}
        </div>
        <div className="fa-knoepfe fa-nicht-drucken">
          <Button size="sm" onClick={exportieren} data-testid="fa-auswertung-export">
            <Icon symbol={Download} />
            {t('Als CSV exportieren', 'Export as CSV')}
          </Button>
          <Button size="sm" onClick={drucken}>
            <Icon symbol={Printer} />
            {t('Drucken', 'Print')}
          </Button>
        </div>
      </div>
      {seit && (
        <p className="fa-satz fa-seit">
          {t(
            `Erfasst seit ${seit}, als die App eingeführt wurde; davor stehen die Vorgänge nicht hier.`,
            `Recorded since ${seit}, when the app was introduced; earlier records are not here.`
          )}
        </p>
      )}
      <p className="fa-satz fa-druck-titel">
        {titel} · {t('Auswertung', 'Report')} · {z.text}
      </p>

      <Kennzahlen>
        {zahlen.map(k => (
          <Kennzahl key={k.beschriftung} {...k} />
        ))}
      </Kennzahlen>

      <div className="fa-teile">
        {teile.map((teil, i) => {
          const id = `${appId}-teil-${i}`;
          return (
            <section
              key={teil.titel}
              className={teil.breit ? 'fa-flaeche fa-breit' : 'fa-flaeche'}
              aria-labelledby={id}
            >
              {teil.art === 'diagramm' ? (
                <DiagrammFlaeche d={teil.d} kennung={id} />
              ) : (
                <>
                  <h2 id={id} className="fa-abschnitt">
                    {teil.titel}
                  </h2>
                  {teil.satz && <p className="fa-satz">{teil.satz}</p>}
                  {teil.art === 'rangliste' ? (
                    <Rangliste zeilen={teil.zeilen} leer={teil.leer} />
                  ) : (
                    <Tabelle
                      titel={teil.titel}
                      kopf={teil.kopf}
                      zeilen={teil.zeilen}
                      rechts={teil.rechts ?? []}
                    />
                  )}
                </>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
