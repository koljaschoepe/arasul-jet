/**
 * Die Freigabestufen einer App und ihre Standardperson (M5, 04.10.2026).
 *
 * Ein Flow nennt im Kopf benannte Stufen (`stufen`, Kontrakt 8), etwa
 * `pruefung` und `leitung`. Wer in einer Stufe zuerst gefragt wird, nennt er
 * NICHT -- der Flow nennt keine Person (Beschluss 27.08.2026). Das setzt der
 * Administrator hier, je App und Stufe, an genau einer Stelle: der Seite der
 * App in der Verwaltung (frontend.md, Verwaltung, Apps).
 *
 * Zwei Flows derselben App mit einer Stufe `leitung` meinen dieselbe Leitung;
 * deshalb gilt die Person je App und Stufenname und nicht je Flow. Die Stufen
 * kommen aus BEIDEN Staenden: eine Stufe, die erst im Teststand steht, will
 * der Admin besetzen, bevor er live schaltet.
 *
 * Ohne Standardperson liegt eine neue Freigabe bei allen mit Zugang
 * (`freigabeAnfragen.zurStandardperson`), und die Seite sagt das als Hinweis.
 */

const db = require('../../database');
const { NotFoundError, ValidationError } = require('../../utils/errors');

/** Der Satz, wenn eine Stufe niemanden hat, der zuerst gefragt wird. */
const OHNE_PERSON =
  'Keine Standardperson: jede neue Freigabe dieser Stufe liegt bei allen mit Zugang.';

/**
 * Die Stufen einer App mit ihrer Standardperson und die Menschen, die dafuer
 * in Frage kommen (alle aktiven mit Zugang zur App).
 *
 * @returns {Promise<{stufen: object[], personen: {id:number, username:string}[]}>}
 */
async function liste(appId, { datenbank = db } = {}) {
  const { rows: app } = await datenbank.query('SELECT 1 FROM public.apps WHERE id = $1', [appId]);
  if (app.length === 0) {
    throw new NotFoundError(`App ${appId} gibt es am Gerät nicht`);
  }

  // Je Stufenname eine Zeile, in der Reihenfolge, in der die Flows sie
  // nennen; die Bezeichnung aus dem ersten Flow, der eine hat. Sortiert nach
  // der SPAETESTEN Stelle, an der ein Flow die Stufe nennt: eine Stufe, die
  // irgendwo als zweite kommt, steht hinter einer, die nie spaeter als erste
  // kommt. Bei einem einzigen Flow ist das genau seine Reihenfolge.
  const { rows: stufen } = await datenbank.query(
    `WITH s AS (
       SELECT st.wert->>'name' AS stufe, st.wert->>'bezeichnung' AS bezeichnung,
              (st.wert->>'frist_minuten')::int AS frist_minuten,
              f.name AS flow, st.nr
         FROM public.app_flows f
         CROSS JOIN LATERAL jsonb_array_elements(
                COALESCE(f.definition->'stufen', '[]'::jsonb)) WITH ORDINALITY AS st(wert, nr)
        WHERE f.app_id = $1
     )
     SELECT s.stufe,
            (array_agg(s.bezeichnung ORDER BY s.nr) FILTER (WHERE s.bezeichnung IS NOT NULL))[1]
              AS bezeichnung,
            array_agg(DISTINCT s.flow ORDER BY s.flow) AS flows,

            sp.user_id AS person_id, u.username AS person,
            (u.is_active AND EXISTS (SELECT 1 FROM public.app_members m
                                      WHERE m.app_id = $1 AND m.user_id = sp.user_id))
              AS person_hat_zugang,
            sp.gesetzt_am
       FROM s
       LEFT JOIN public.app_stufen_personen sp ON sp.app_id = $1 AND sp.stufe = s.stufe
       LEFT JOIN public.admin_users u ON u.id = sp.user_id
      GROUP BY s.stufe, sp.user_id, u.username, u.is_active, sp.gesetzt_am
      ORDER BY MAX(s.nr), MIN(s.nr), s.stufe`,
    [appId]
  );

  const { rows: personen } = await datenbank.query(
    `SELECT u.id, u.username
       FROM public.app_members m
       JOIN public.admin_users u ON u.id = m.user_id
      WHERE m.app_id = $1 AND u.is_active = TRUE
      ORDER BY u.username`,
    [appId]
  );

  return {
    stufen: stufen.map(z => {
      const gilt = z.person_id != null && z.person_hat_zugang === true;
      let hinweis = null;
      if (z.person_id == null) {
        hinweis = OHNE_PERSON;
      } else if (!gilt) {
        hinweis = `${z.person} hat keinen Zugang mehr zu dieser App: neue Freigaben dieser Stufe liegen bei allen mit Zugang.`;
      }
      return {
        stufe: z.stufe,
        bezeichnung: z.bezeichnung ?? null,
        flows: z.flows,
        person: z.person_id == null ? null : { id: Number(z.person_id), username: z.person },
        gilt,
        gesetzt_am: z.gesetzt_am ?? null,
        hinweis,
      };
    }),
    personen: personen.map(p => ({ id: Number(p.id), username: p.username })),
  };
}

/**
 * Die Standardperson einer Stufe setzen oder (`benutzerId: null`) zuruecknehmen.
 *
 * Die Stufe muss ein Flow der App nennen, sonst waere das eine Einstellung zu
 * einem erfundenen Namen. Die Person muss aktiv sein und Zugang zur App haben:
 * eine Freigabe, die bei jemandem liegt, der sie nicht sehen darf, laege bei
 * niemandem. Bestehende offene Freigaben bleiben, wo sie liegen; die neue
 * Person gilt fuer jede neue.
 */
async function setze({ appId, stufe, benutzerId, durch }, { datenbank = db } = {}) {
  const { stufen, personen } = await liste(appId, { datenbank });
  if (!stufen.some(s => s.stufe === stufe)) {
    throw new NotFoundError(
      `Kein Flow der App ${appId} nennt die Stufe "${stufe}"` +
        (stufen.length > 0 ? ` (bekannt: ${stufen.map(s => s.stufe).join(', ')}).` : '.')
    );
  }
  if (benutzerId == null) {
    await datenbank.query(
      'DELETE FROM public.app_stufen_personen WHERE app_id = $1 AND stufe = $2',
      [appId, stufe]
    );
    return { app_id: appId, stufe, person: null, hinweis: OHNE_PERSON };
  }
  const person = personen.find(p => p.id === Number(benutzerId));
  if (!person) {
    throw new ValidationError(
      'Diese Person hat keinen Zugang zur App. Standardperson kann nur sein, wer die App benutzen darf.'
    );
  }
  await datenbank.query(
    `INSERT INTO public.app_stufen_personen (app_id, stufe, user_id, gesetzt_von, gesetzt_am)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (app_id, stufe)
     DO UPDATE SET user_id = EXCLUDED.user_id, gesetzt_von = EXCLUDED.gesetzt_von,
                   gesetzt_am = NOW()`,
    [appId, stufe, person.id, durch ?? null]
  );
  return { app_id: appId, stufe, person, hinweis: null };
}

module.exports = { liste, setze, OHNE_PERSON };
