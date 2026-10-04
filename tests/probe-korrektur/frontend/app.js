/**
 * Die Seite der Probe „Korrekturfelder": die Freigaben dieser App, gezeigt mit
 * dem Muster `Freigabe`, das das Geraet unter `/marken/5/` ausliefert.
 *
 * Gelesen und entschieden wird mit der Sitzung dessen, der die App offen hat
 * (gleiche Herkunft, Cookie), ueber dieselben Wege wie in Arasul:
 * `GET /api/freigabe-anfragen`, `POST …/bestaetigen` mit den geaenderten
 * Feldern, `POST …/ablehnen` mit Grund. Schreibende Aufrufe tragen das
 * CSRF-Token aus dem Cookie `arasul_csrf`.
 *
 * Kein JSX: ohne Bau gibt es keinen Uebersetzer, also `h(...)`.
 */
import { h, rendern, useEffect, useState, FASSUNG, Freigabe, Kopf } from '/marken/5/marken.js';

/** Die Kennung dieser App aus der Adresse (`/apps/<id>/` oder `/apps/<id>/test/`). */
const APP = (/^\/apps\/([^/]+)\//.exec(window.location.pathname) || [])[1] || '';

function csrf() {
  const treffer = /(?:^|;\s*)arasul_csrf=([^;]*)/.exec(document.cookie);
  return treffer ? decodeURIComponent(treffer[1]) : '';
}

async function abruf(pfad, leib) {
  const antwort = await fetch(pfad, {
    method: leib ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: leib ? { 'content-type': 'application/json', 'x-csrf-token': csrf() } : {},
    body: leib ? JSON.stringify(leib) : undefined,
  });
  const rumpf = await antwort.json().catch(() => ({}));
  if (!antwort.ok) {
    throw new Error(rumpf?.error?.message || `HTTP ${antwort.status}`);
  }
  return rumpf;
}

/** Die Anfrage des Geraets in der Form des Musters. */
function alsEintrag(a) {
  return {
    id: a.id,
    titel: a.titel,
    zusammenhang: a.zusammenhang,
    herkunft: a.stufe_bezeichnung ? `Stufe ${a.stufe_bezeichnung}` : null,
    einreicher: a.einreicher,
    frist: a.frist,
    angefragtAm: a.angefragt_am,
    felder: a.felder,
    original: a.original,
    bisher: (a.frueher || []).map(v => ({
      titel: v.titel,
      stufe: v.stufe,
      status: v.status,
      entschiedenVon: v.entschieden_von,
      entschiedenAm: v.entschieden_am,
      begruendung: v.begruendung,
      korrekturen: v.korrekturen,
    })),
  };
}

function App() {
  const [anfragen, setzeAnfragen] = useState(null);
  const [meldung, setzeMeldung] = useState('');

  const laden = () =>
    abruf('/api/freigabe-anfragen')
      .then(r => setzeAnfragen((r.data || []).filter(a => a.app_id === APP)))
      .catch(e => setzeMeldung(e.message));

  useEffect(() => {
    laden();
  }, []);

  const nachher = text => {
    setzeMeldung(text);
    return laden();
  };

  return h(
    'main',
    { style: { padding: '1.5rem', maxWidth: '72rem' } },
    h(Kopf, { titel: 'Belege prüfen', beschreibung: `Bibliothek ${FASSUNG}` }),
    meldung ? h('p', { 'data-testid': 'probe-meldung', role: 'status' }, meldung) : null,
    anfragen === null
      ? h('p', null, 'Lädt …')
      : h(Freigabe, {
          eintraege: anfragen.map(alsEintrag),
          beiBestaetigen: (e, felder) =>
            abruf(`/api/freigabe-anfragen/${e.id}/bestaetigen`, felder ? { felder } : {}).then(r =>
              nachher(
                `Freigegeben${r.data?.korrekturen?.length ? `, ${r.data.korrekturen.length} Feld geändert` : ''}.`
              )
            ),
          beiAblehnen: (e, grund) =>
            abruf(`/api/freigabe-anfragen/${e.id}/ablehnen`, { begruendung: grund }).then(() =>
              nachher('Abgelehnt.')
            ),
        })
  );
}

rendern(h(App), document.getElementById('app'));
