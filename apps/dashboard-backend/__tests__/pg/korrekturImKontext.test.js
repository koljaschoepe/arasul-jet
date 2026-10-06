/**
 * Ein Schritt nach der Freigabe weiss, was der Mensch korrigiert hat (M5,
 * 07.10.2026) -- gegen ein ECHTES Postgres und eine Probe-App.
 *
 * Am Orin stand nach einer Korrektur von 23,80 auf 23,90 im Satz des Flows
 * „keine menschlichen Aenderungen". Hier: die Freigabe ist ein echter
 * Datensatz (`approvals.felder`, `korrekturen`), `felderNachFreigabe` liest ihn
 * wirklich, und der Auftrag des naechsten Schritts wie die Synthese nennen die
 * Aenderung. Nur das Modell ist ein Stand-in (am Orin mit echtem Modell
 * gemessen, siehe Auftrag).
 *
 * Aufruf wie die Nachbardateien (`npm run test:pg` mit `ARASUL_PG_TEST_URL`).
 * Eigene Zeilen mit Praefix `kik-`, werden weggeraeumt.
 */

const URL_TEST = process.env.ARASUL_PG_TEST_URL;
const beschreibe = URL_TEST ? describe : describe.skip;

jest.setTimeout(30000);

beschreibe('Korrektur im Kontext gegen echtes Postgres', () => {
  let db;
  let freigabeAnfragen;
  let executeSteps;
  let FlowDefinition;
  let benutzer;
  let lauf;

  async function aufraeumen() {
    await db.query(`DELETE FROM public.approvals WHERE app_id = 'kik-app'`);
    await db.query(`DELETE FROM flow_runs WHERE app_id = 'kik-app'`);
    await db.query(`DELETE FROM public.apps WHERE id = 'kik-app'`);
    await db.query(`DELETE FROM public.admin_users WHERE username LIKE 'kik-%'`);
  }

  beforeAll(async () => {
    const ziel = new URL(URL_TEST);
    process.env.POSTGRES_HOST = ziel.hostname;
    process.env.POSTGRES_PORT = ziel.port || '5432';
    process.env.POSTGRES_USER = decodeURIComponent(ziel.username);
    process.env.POSTGRES_PASSWORD = decodeURIComponent(ziel.password);
    process.env.POSTGRES_DB = ziel.pathname.replace(/^\//, '');

    db = require('../../src/database');
    freigabeAnfragen = require('../../src/services/flows/freigabeAnfragen');
    ({ executeSteps } = require('../../src/services/flows/stepExecutor'));
    ({ FlowDefinition } = require('../../src/schemas/flows'));

    await aufraeumen();
    const { rows } = await db.query(
      `INSERT INTO public.admin_users (username, password_hash, email, role, is_active)
       VALUES ('kik-admin', 'x', 'kik-admin@beispiel.de', 'admin', true) RETURNING id`
    );
    benutzer = Number(rows[0].id);
    await db.query(`INSERT INTO public.apps (id, name) VALUES ('kik-app', 'KIK Probe')`);
    const r = await db.query(
      `INSERT INTO flow_runs (user_id, flow_name, app_id, stand, arguments)
       VALUES ($1, 'beleg', 'kik-app', 'test', '{}'::jsonb) RETURNING id`,
      [benutzer]
    );
    lauf = Number(r.rows[0].id);
    await db.query(
      `INSERT INTO public.approvals (run_id, app_id, stand, flow_name, titel, status, frist, entschieden_am,
                                     felder, felder_schritt, korrekturen)
       VALUES ($1, 'kik-app', 'test', 'beleg', 'Erkennung', 'bestaetigt', NOW(), NOW(),
               $2::jsonb, 'lesen', $3::jsonb)`,
      [
        lauf,
        JSON.stringify([
          { name: 'betrag', vorschlag: '23,80', fehlend: false, unsicher: false, aenderbar: true },
          { name: 'datum', vorschlag: '01.10.2026', fehlend: false, unsicher: false },
        ]),
        JSON.stringify([{ feld: 'betrag', vorschlag: '23,80', wert: '23,90' }]),
      ]
    );
  });

  afterAll(async () => {
    if (db) {
      await aufraeumen();
      await db.close?.();
    }
  });

  it('der naechste Schritt und die Synthese bekommen den Wert und nennen die Aenderung', async () => {
    const flow = FlowDefinition.parse({
      name: 'beleg',
      systemPrompt: 'Fasse zusammen.',
      werkzeuge: ['subagent'],
      rollen: [
        {
          name: 'leser',
          ergebnis: { felder: ['betrag', 'datum'], aenderbar: ['betrag'] },
          prompt: 'Lies.',
        },
      ],
      schritte: [
        {
          name: 'lesen',
          typ: 'subagent',
          rolle: 'leser',
          auftrag: 'Lies den Beleg.',
          faehigkeiten: { bild: true },
        },
        { name: 'buchen', typ: 'subagent', rolle: 'leser', auftrag: 'Buche: {{lesen}}' },
      ],
    });
    const auftraege = [];
    class Stand {
      async execute(params, context) {
        auftraege.push(params.auftrag);
        if (context.onErgebnis) {
          context.onErgebnis({
            felder: { betrag: '23,80', datum: '01.10.2026' },
            json: true,
            unsicher: ['betrag'],
          });
          return 'betrag: 23,80\ndatum: 01.10.2026';
        }
        return 'gebucht';
      }
    }
    const runLoop = jest.fn().mockResolvedValue({ result: 'F' });
    await executeSteps({
      flow,
      werte: {},
      userInput: 'UI',
      model: 'm',
      context: { runId: lauf },
      makeTools: () => [],
      runLoop,
      recordWerkzeug: jest.fn().mockResolvedValue('Freigabe erteilt'),
      SubagentToolClass: Stand,
      felderNachFreigabe: freigabeAnfragen.felderNachFreigabe,
      titelSetzen: jest.fn().mockResolvedValue(null),
    });
    expect(auftraege[1]).toContain('betrag: 23,90');
    expect(auftraege[1]).toContain('Feld „betrag": von „23,80" (Vorschlag der KI) auf „23,90"');
    const synthese = runLoop.mock.calls[0][0].userInput;
    expect(synthese).toContain('--- Änderungen durch einen Menschen ---');
    expect(synthese).toContain('auf „23,90"');
  });
});
