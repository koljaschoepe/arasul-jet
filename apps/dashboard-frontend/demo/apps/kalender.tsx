/**
 * Der Reiter „Kalender" für Urlaub und Wartung (J55, M7): ein Monat als
 * Raster von Montag bis Sonntag, je Tag die Einträge als kleine Streifen,
 * ein Klick öffnet den Vorgang. Am Handy (schmaler Kasten) wird daraus eine
 * Liste der Tage mit Einträgen; ein Raster mit sieben Spalten ist dort
 * nicht lesbar.
 *
 * Was im Kalender steht, sagt die App (`AppDef.kalender`).
 */
import { useMemo, useState } from 'react';
import { Button, Icon, useSchmalerBehaelter } from '@marken';
import { ChevronLeft, ChevronRight } from '@marken/symbole';
import type { Eintrag } from '../bestand';
import { heuteIso, kalenderwoche, SPRACHE, t, tagAus } from './gemeinsam';

export interface Termin {
  e: Eintrag;
  von: string;
  bis: string;
  text: string;
  /** Die Tönung: wie in der Liste die Marke des Stands. */
  ton: 'fest' | 'offen' | 'warnung' | 'erledigt';
}

export interface KalenderDef {
  satz: string;
  termine: (liste: Eintrag[]) => Termin[];
  /** Die Erklärung der Tönungen unter dem Kalender. */
  legende: [Termin['ton'], string][];
  /** Ein Satz je Tag in der Liste am Handy oder unter dem Raster, etwa „4 abwesend". */
  tagSatz?: (termine: Termin[]) => string;
}

const ORT = SPRACHE === 'en' ? 'en-GB' : 'de-DE';
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Feiertage um den Jahreswechsel, wie im Bestand (keine Termine dort). */
function feiertag(tag: string): string | null {
  const md = tag.slice(5);
  if (md === '01-01') return t('Neujahr', "New Year's Day");
  if (md === '12-25') return t('1. Weihnachtstag', 'Christmas Day');
  if (md === '12-26') return t('2. Weihnachtstag', 'Boxing Day');
  if (md === '05-01') return t('Tag der Arbeit', 'Labour Day');
  if (md === '10-03') return t('Tag der Deutschen Einheit', 'German Unity Day');
  return null;
}

export function Kalender({
  def,
  liste,
  oeffnen,
}: {
  def: KalenderDef;
  liste: Eintrag[];
  oeffnen: (id: number) => void;
}) {
  const [behaelter, schmal] = useSchmalerBehaelter<HTMLDivElement>(640);
  const [monat, setMonat] = useState(() => {
    const d = tagAus(heuteIso());
    return new Date(d.getFullYear(), d.getMonth(), 1, 12);
  });
  const termine = useMemo(() => def.termine(liste), [def, liste]);
  const heute = heuteIso();

  // Das Raster: vom Montag vor dem Ersten bis zum Sonntag nach dem Letzten.
  const wochen = useMemo(() => {
    const start = new Date(monat);
    start.setDate(1 - ((start.getDay() + 6) % 7));
    const ende = new Date(monat.getFullYear(), monat.getMonth() + 1, 0, 12);
    ende.setDate(ende.getDate() + ((7 - ende.getDay()) % 7));
    const aus: string[][] = [];
    for (const d = new Date(start); d <= ende; d.setDate(d.getDate() + 1)) {
      if ((d.getDay() + 6) % 7 === 0) aus.push([]);
      aus[aus.length - 1]!.push(iso(d));
    }
    return aus;
  }, [monat]);

  const amTag = (tag: string) => termine.filter(x => x.von <= tag && x.bis >= tag);
  const imMonat = (tag: string) => Number(tag.slice(5, 7)) === monat.getMonth() + 1;
  const titel = monat.toLocaleDateString(ORT, { month: 'long', year: 'numeric' });
  const wochentage = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i, 12).toLocaleDateString(ORT, { weekday: 'short' })
  );
  const blaettern = (n: number) =>
    setMonat(m => new Date(m.getFullYear(), m.getMonth() + n, 1, 12));

  const chip = (x: Termin, tag: string, woche: string[]) => {
    // Der Name steht am ersten Tag und am Montag jeder Woche; dazwischen nur die Farbe.
    const beschriftet = x.von === tag || woche[0] === tag;
    return (
      <button
        key={x.e.id}
        type="button"
        className="fa-termin"
        data-ton={x.ton}
        data-weiter={beschriftet ? undefined : 'ja'}
        onClick={() => oeffnen(x.e.id)}
        title={`${x.e.nr} · ${x.text}`}
        aria-label={`${x.e.nr} · ${x.text}`}
      >
        {beschriftet ? x.text : ' '}
      </button>
    );
  };

  // Am Wochenende nur, was dort eigens beginnt; ein Urlaub über das
  // Wochenende steht am Freitag und am Montag.
  const tageMitTerminen = wochen
    .flat()
    .filter(
      tag =>
        imMonat(tag) &&
        amTag(tag).some(x => ![0, 6].includes(tagAus(tag).getDay()) || x.von === tag)
    );

  return (
    <div ref={behaelter} className="fa-kalender" data-testid="fa-kalender">
      <div className="fa-kalender-kopf">
        <h2 className="fa-kalender-titel">{titel}</h2>
        <div className="fa-knoepfe">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => blaettern(-1)}
            aria-label={t('Voriger Monat', 'Previous month')}
          >
            <Icon symbol={ChevronLeft} />
          </Button>
          <Button
            size="sm"
            onClick={() =>
              setMonat(new Date(tagAus(heute).getFullYear(), tagAus(heute).getMonth(), 1, 12))
            }
          >
            {t('Heute', 'Today')}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => blaettern(1)}
            aria-label={t('Nächster Monat', 'Next month')}
            data-testid="fa-kalender-weiter"
          >
            <Icon symbol={ChevronRight} />
          </Button>
        </div>
      </div>
      <p className="fa-satz">{def.satz}</p>

      {schmal ? (
        tageMitTerminen.length === 0 ? (
          <p className="fa-satz">{t('In diesem Monat steht nichts an.', 'Nothing this month.')}</p>
        ) : (
          <ol className="fa-agenda">
            {tageMitTerminen.map(tag => {
              const liste = amTag(tag);
              return (
                <li key={tag} data-heute={tag === heute ? 'ja' : undefined}>
                  <div className="fa-agenda-tag">
                    <span>
                      {tagAus(tag).toLocaleDateString(ORT, {
                        weekday: 'short',
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </span>
                    {def.tagSatz && <span className="fa-agenda-satz">{def.tagSatz(liste)}</span>}
                  </div>
                  <div className="fa-agenda-termine">
                    {liste.map(x => (
                      <button
                        key={x.e.id}
                        type="button"
                        className="fa-termin"
                        data-ton={x.ton}
                        onClick={() => oeffnen(x.e.id)}
                      >
                        {x.text}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        )
      ) : (
        <div className="fa-raster" role="grid" aria-label={titel}>
          <div className="fa-raster-zeile fa-raster-kopf" role="row">
            <span className="fa-kw" aria-hidden="true">
              {t('KW', 'Wk')}
            </span>
            {wochentage.map((w, i) => (
              <span key={w} role="columnheader" data-wochenende={i > 4 ? 'ja' : undefined}>
                {w}
              </span>
            ))}
          </div>
          {wochen.map(woche => (
            <div key={woche[0]} className="fa-raster-zeile" role="row">
              <span className="fa-kw" aria-hidden="true">
                {kalenderwoche(tagAus(woche[0]!))}
              </span>
              {woche.map((tag, i) => {
                const hier = amTag(tag);
                const frei = feiertag(tag);
                return (
                  <div
                    key={tag}
                    role="gridcell"
                    className="fa-tag"
                    data-fremd={imMonat(tag) ? undefined : 'ja'}
                    data-heute={tag === heute ? 'ja' : undefined}
                    data-wochenende={i > 4 || frei ? 'ja' : undefined}
                  >
                    <span className="fa-tag-zahl">
                      {Number(tag.slice(8))}
                      {frei && <span className="fa-tag-frei">{frei}</span>}
                    </span>
                    {hier.slice(0, 3).map(x => chip(x, tag, woche))}
                    {hier.length > 3 && (
                      <span className="fa-tag-mehr">
                        {t(`+ ${hier.length - 3} weitere`, `+ ${hier.length - 3} more`)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <ul className="fa-legende" aria-label={t('Legende', 'Legend')}>
        {def.legende.map(([ton, text]) => (
          <li key={ton}>
            <span className="fa-termin-punkt" data-ton={ton} aria-hidden="true" />
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}
