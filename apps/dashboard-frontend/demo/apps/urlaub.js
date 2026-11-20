/**
 * Beispiel-App „Urlaubsanträge" der Demo (J46, M7): Resturlaub, Antrag
 * stellen, wer wann fehlt. Personen tragen keine Namen, nur ihre Abteilung.
 */
import {
  h,
  rendern,
  useState,
  Feld,
  Formular,
  Karte,
  Knopf,
  Kopf,
  Liste,
  ListenEintrag,
  Meldung,
} from '/marken/5/marken.js';
import { t, datum, tag, useFassung } from './gemeinsam.js';

const ABWESEND = [
  { wer: t('Werkstatt', 'Workshop'), von: 2, bis: 6 },
  { wer: t('Vertrieb Innendienst', 'Inside sales'), von: 9, bis: 13 },
  { wer: t('Buchhaltung', 'Accounting'), von: 16, bis: 16 },
  { wer: t('Kundendienst Außendienst', 'Field service'), von: 23, bis: 34 },
];

const iso = d => d.toISOString().slice(0, 10);

function arbeitstage(von, bis) {
  let n = 0;
  for (let d = new Date(von); d <= bis; d.setDate(d.getDate() + 1)) {
    const w = d.getDay();
    if (w !== 0 && w !== 6) n += 1;
  }
  return n;
}

function App() {
  const fassung = useFassung();
  const [rest, setRest] = useState(17);
  const [antraege, setAntraege] = useState([]);
  const [von, setVon] = useState(iso(tag(14)));
  const [bis, setBis] = useState(iso(tag(18)));
  const [hinweis, setHinweis] = useState(null);

  const stellen = () => {
    const a = new Date(von);
    const b = new Date(bis);
    const tage =
      Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a ? 0 : arbeitstage(a, b);
    if (!tage) {
      setHinweis({
        art: 'fehler',
        text: t('Bitte einen gültigen Zeitraum wählen.', 'Please choose a valid period.'),
      });
      return;
    }
    if (tage > rest) {
      setHinweis({
        art: 'fehler',
        text: t(`Es sind nur noch ${rest} Tage übrig.`, `Only ${rest} days left.`),
      });
      return;
    }
    setAntraege([{ von: a, bis: b, tage }, ...antraege]);
    setRest(rest - tage);
    setHinweis({
      art: 'erfolg',
      text: t(
        `Antrag über ${tage} Tage gestellt. Die Freigabe liegt bei der Leitung.`,
        `Request for ${tage} days submitted. Approval is with management.`
      ),
    });
  };

  return h(
    'div',
    {
      style: {
        maxWidth: '56rem',
        margin: '0 auto',
        padding: 'var(--ara-abstand-4, 1rem)',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: 'var(--ara-abstand-4, 1rem)',
      },
    },
    h(Kopf, {
      titel: t('Urlaubsanträge', 'Leave requests'),
      beschreibung: fassung ? t(`Fassung ${fassung.version}`, `Version ${fassung.version}`) : null,
    }),
    h(
      Karte,
      { titel: t('Resturlaub', 'Remaining leave') },
      h('p', { style: { margin: 0, fontSize: '1.25rem' } }, t(`${rest} Tage`, `${rest} days`))
    ),
    h(
      Karte,
      { titel: t('Urlaub beantragen', 'Request leave') },
      hinweis && h(Meldung, { art: hinweis.art }, hinweis.text),
      h(
        Formular,
        {
          onAbsenden: stellen,
          aktionen: h(Knopf, { art: 'haupt', typ: 'absenden' }, t('Beantragen', 'Submit')),
        },
        h(
          Feld,
          { kennung: 'von', beschriftung: t('Von', 'From') },
          h('input', { id: 'von', type: 'date', value: von, onChange: e => setVon(e.target.value) })
        ),
        h(
          Feld,
          { kennung: 'bis', beschriftung: t('Bis', 'To') },
          h('input', { id: 'bis', type: 'date', value: bis, onChange: e => setBis(e.target.value) })
        )
      )
    ),
    antraege.length > 0 &&
      h(
        Liste,
        { beschriftung: t('Meine Anträge', 'My requests') },
        ...antraege.map((a, i) =>
          h(ListenEintrag, {
            key: i,
            titel: `${datum(a.von)} – ${datum(a.bis)}`,
            unterzeile: t(`${a.tage} Arbeitstage`, `${a.tage} working days`),
            hinweis: t('wartet auf Freigabe', 'awaiting approval'),
          })
        )
      ),
    h(
      Liste,
      { beschriftung: t('Wer fehlt in den nächsten Wochen', 'Who is away in the coming weeks') },
      ...ABWESEND.map(a =>
        h(ListenEintrag, {
          key: a.wer,
          titel: a.wer,
          hinweis:
            a.von === a.bis ? datum(tag(a.von)) : `${datum(tag(a.von))} – ${datum(tag(a.bis))}`,
        })
      )
    )
  );
}

rendern(h(App), document.getElementById('app'));
