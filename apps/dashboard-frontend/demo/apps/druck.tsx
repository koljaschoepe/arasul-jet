/**
 * Drucken eines oder mehrerer Vorgänge (J55, M7): ein Blatt je Vorgang mit
 * Briefkopf, Feldern, Dateien und Verlauf, nur im Druck zu sehen. Am
 * Bildschirm bleibt alles, wie es ist; `window.print()` druckt den Rahmen
 * der App, und `app.css` blendet dort alles außer diesen Blättern aus.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Eintrag } from '../bestand';
import { STAENDE } from '../bestand';
import { FIRMA, name, ICH_ID } from '../firma';
import type { AppDef, Ctx } from './fachapp';
import { SPRACHE, t, tx, wann } from './gemeinsam';

export function Druck({
  def,
  ctx,
  eintraege,
  fertig,
}: {
  def: AppDef;
  ctx: Ctx;
  eintraege: Eintrag[];
  fertig: () => void;
}) {
  useEffect(() => {
    document.documentElement.dataset.druck = 'vorgang';
    const ende = () => {
      delete document.documentElement.dataset.druck;
      fertig();
    };
    window.addEventListener('afterprint', ende, { once: true });
    // Einen Takt warten, bis die Blätter im Dokument stehen.
    const uhr = window.setTimeout(() => window.print(), 60);
    return () => {
      window.clearTimeout(uhr);
      window.removeEventListener('afterprint', ende);
      delete document.documentElement.dataset.druck;
    };
  }, [fertig]);

  const gedruckt = new Date().toLocaleString(SPRACHE === 'en' ? 'en-GB' : 'de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return createPortal(
    <div className="fa-druck" aria-hidden="true">
      {eintraege.map(e => (
        <article key={e.id} className="fa-druck-blatt">
          <header className="fa-druck-kopf">
            <strong>{FIRMA.name}</strong>
            <span>
              {FIRMA.strasse} · {FIRMA.plz} {FIRMA.ort} · {FIRMA.telefon}
            </span>
          </header>
          <p className="fa-druck-art">
            {def.einzahl} {e.nr} ·{' '}
            {STAENDE[def.id].find(([k]) => k === e.stand)?.[1][SPRACHE] ?? e.stand}
          </p>
          <h1>{def.titelVon(e)}</h1>
          <p className="fa-druck-neben">{def.nebenVon(e)}</p>
          <dl>
            {def
              .felder(ctx)
              .filter(
                f =>
                  e.felder[f.key] !== null &&
                  e.felder[f.key] !== undefined &&
                  e.felder[f.key] !== ''
              )
              .map(f => (
                <div key={f.key}>
                  <dt>{f.titel}</dt>
                  <dd>
                    {f.anzeigen
                      ? f.anzeigen(e.felder[f.key] ?? null, e)
                      : f.optionen
                        ? (f.optionen.find(([k]) => k === String(e.felder[f.key]))?.[1] ??
                          tx(e.felder[f.key]))
                        : tx(e.felder[f.key])}
                  </dd>
                </div>
              ))}
          </dl>
          {e.dateien.length > 0 && (
            <>
              <h2>{t('Dateien', 'Files')}</h2>
              <ul>
                {e.dateien.map(d => (
                  <li key={d.id}>
                    {tx(d.name)} · {name(d.wer)}
                  </li>
                ))}
              </ul>
            </>
          )}
          <h2>{t('Verlauf', 'History')}</h2>
          <ol>
            {e.verlauf.map((s, i) => (
              <li key={`${s.am}-${i}`}>
                {wann(s.am)} · {name(s.wer)} · {tx(s.text)}
              </li>
            ))}
          </ol>
          <footer>
            {t(
              `Gedruckt am ${gedruckt} von ${name(ICH_ID)} · Beispiel mit erfundenen Angaben`,
              `Printed on ${gedruckt} by ${name(ICH_ID)} · Sample with invented data`
            )}
          </footer>
        </article>
      ))}
    </div>,
    document.body
  );
}
