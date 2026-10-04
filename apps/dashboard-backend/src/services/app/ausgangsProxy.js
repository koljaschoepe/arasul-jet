/**
 * Die Seite des Backends am Ausgangs-Proxy der Apps (J38, 02.10.2026).
 *
 * Der Proxy (`services/egress-proxy`) laesst aus dem Netz `arasul-apps` nur
 * die Hostnamen durch, die das Manifest einer App in `verbindungen` nennt. Das
 * Backend tut hier vier Dinge:
 *
 *   1. es gibt jedem App-Container seinen Zugang zum Proxy mit (`umgebung`),
 *   2. es nennt dem Proxy die Regeln (`regeln`): je App und Stand die
 *      Hostnamen aus dem Manifest des Standes, der gerade dort steht,
 *   3. es nimmt die gezaehlten Entscheidungen des Proxys an (`nimmAuf`),
 *   4. es zaehlt die Aufrufe der Plattform selbst (`zaehlePlattform`) und
 *      zeigt alles dem Administrator (`uebersicht`).
 *
 * WER FREIGIBT: das eingespielte Manifest. Wer eine App auf das Geraet bringt,
 * ist Administrator oder hat einen Schluessel von ihm; was er in
 * `verbindungen` eintraegt, steht in der Verbindungsseite und kann dort
 * gelesen und beurteilt werden. Eine zweite Freigabe daneben waere ein
 * Zustand, in dem die App laeuft und nichts darf -- und niemand weiss warum.
 */

const crypto = require('crypto');
const db = require('../../database');
const logger = require('../../utils/logger');

/** Wo die App den Proxy erreicht: im Netz `arasul-apps`, unter dem Dienstnamen. */
const PROXY_ADRESSE = process.env.EGRESS_PROXY_ADRESSE || 'egress-proxy:3128';

// Wie viele verschiedene abgewiesene Namen je App und Stand gespeichert werden.
const MAX_ZIELE_JE_APP = 100;

/**
 * Der Token einer Kennung. Muss mit `tokenFuer` in `services/egress-proxy/proxy.js`
 * uebereinstimmen: HMAC-SHA256 des Namens mit dem Geheimnis des Geraets
 * (dem JWT-Schluessel, den beide Container ohnehin haben).
 */
function tokenFuer(name) {
  return crypto
    .createHmac('sha256', process.env.JWT_SECRET || '')
    .update(`egress-proxy:${name}`)
    .digest('hex');
}

/** Stimmt der Token, den der Proxy dem Backend zeigt? */
function dienstTokenGueltig(vorgelegt) {
  const soll = Buffer.from(tokenFuer('dienst'));
  const ist = Buffer.from(String(vorgelegt || ''));
  return soll.length === ist.length && crypto.timingSafeEqual(soll, ist);
}

/**
 * Die Umgebung, mit der eine App den Proxy findet. `https_proxy` auch klein
 * geschrieben, weil Werkzeuge sich uneins sind. OHNE kleines `http_proxy`, und
 * das ist gemessen: der BusyBox-`wget` im Healthcheck der Apps liest genau
 * diese Variable und ignoriert `NO_PROXY`; seine Abfrage auf 127.0.0.1 ging
 * durch den Proxy und bekam 407, jede App galt als unhealthy und der Umzug
 * ging zurueck (Orin, 02.10.2026). Grosses `HTTP_PROXY` liest er nicht. Die Plattform und die eigene
 * Datenbank gehen am Proxy vorbei.
 */
function umgebung(containerName) {
  const url = `http://${containerName}:${tokenFuer(containerName)}@${PROXY_ADRESSE}`;
  const ohne = 'localhost,127.0.0.1,postgres-db,dashboard-backend,reverse-proxy';
  return {
    HTTP_PROXY: url,
    HTTPS_PROXY: url,
    https_proxy: url,
    NO_PROXY: ohne,
    no_proxy: ohne,
    NODE_USE_ENV_PROXY: '1',
  };
}

/** `{ "<app>:<stand>": [hostnamen] }` aus den Manifesten der eingespielten Staende. */
async function regeln() {
  const result = await db.query(
    `SELECT app_id, stand, manifest FROM public.app_staende WHERE manifest IS NOT NULL`
  );
  const aus = {};
  for (const zeile of result.rows) {
    const verbindungen = zeile.manifest?.verbindungen;
    aus[`${zeile.app_id}:${zeile.stand}`] = Array.isArray(verbindungen) ? verbindungen : [];
  }
  return aus;
}

/**
 * Gezaehlte Entscheidungen des Proxys in die Tabelle. Je Zeile Anzahl
 * dazu, Zeitpunkt auf den neueren. Mehr als `MAX_ZIELE_JE_APP` verschiedene
 * abgewiesene Namen je App und Stand laufen unter `(weitere)`.
 */
async function nimmAuf(ereignisse) {
  for (const e of ereignisse) {
    let host = e.host;
    if (e.ergebnis === 'abgewiesen' && host !== '(weitere)') {
      const belegt = await db.query(
        `SELECT COUNT(*)::int AS n,
                COALESCE(BOOL_OR(host = $4), false) AS da
           FROM public.ausgang_zaehler
          WHERE quelle = 'app' AND app_id = $1 AND stand = $2 AND ergebnis = $3 AND host <> '(weitere)'`,
        [e.app_id, e.stand, e.ergebnis, host]
      );
      if (!belegt.rows[0].da && belegt.rows[0].n >= MAX_ZIELE_JE_APP) {
        host = '(weitere)';
      }
    }
    await db.query(
      `INSERT INTO public.ausgang_zaehler (quelle, app_id, stand, host, ergebnis, anzahl, zuletzt)
       VALUES ('app', $1, $2, $3, $4, $5, $6)
       ON CONFLICT (quelle, app_id, stand, host, ergebnis)
       DO UPDATE SET anzahl = ausgang_zaehler.anzahl + EXCLUDED.anzahl,
                     zuletzt = GREATEST(ausgang_zaehler.zuletzt, EXCLUDED.zuletzt)`,
      [e.app_id, e.stand, host, e.ergebnis, e.anzahl, e.zuletzt]
    );
  }
}

/**
 * Ein Aufruf der Plattform selbst nach draussen (derzeit: externe Modelle).
 * Wirft nie: Zaehlen darf den Aufruf nicht kosten.
 */
async function zaehlePlattform(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    await db.query(
      `INSERT INTO public.ausgang_zaehler (quelle, app_id, stand, host, ergebnis, anzahl)
       VALUES ('plattform', '', '', $1, 'erlaubt', 1)
       ON CONFLICT (quelle, app_id, stand, host, ergebnis)
       DO UPDATE SET anzahl = ausgang_zaehler.anzahl + 1, zuletzt = NOW()`,
      [host]
    );
  } catch (err) {
    logger.warn(`Ausgang der Plattform nicht gezählt: ${err.message}`);
  }
}

/** Je Host zusammenfassen: Anzahl summiert, juengster Zeitpunkt, welche Staende. */
function nachHost(zeilen) {
  const aus = new Map();
  for (const z of zeilen) {
    const e = aus.get(z.host) || { host: z.host, anzahl: 0, zuletzt: null, staende: [] };
    e.anzahl += Number(z.anzahl);
    if (!e.zuletzt || z.zuletzt > e.zuletzt) {
      e.zuletzt = z.zuletzt;
    }
    if (z.stand && !e.staende.includes(z.stand)) {
      e.staende.push(z.stand);
    }
    aus.set(z.host, e);
  }
  return [...aus.values()].sort((a, b) => (a.zuletzt < b.zuletzt ? 1 : -1));
}

/**
 * Die Seite „Verbindungen": je App was eingetragen ist, was genutzt und was
 * abgewiesen wurde, dazu die Aufrufe der Plattform.
 */
async function uebersicht() {
  const [apps, staende, zeilen] = await Promise.all([
    db.query(`SELECT id, name FROM public.apps ORDER BY id`),
    db.query(`SELECT app_id, stand, manifest, eingespielt_am FROM public.app_staende`),
    db.query(
      `SELECT quelle, app_id, stand, host, ergebnis, anzahl, zuletzt FROM public.ausgang_zaehler`
    ),
  ]);

  const eingetragen = new Map();
  const seit = new Map(staende.rows.map(s => [`${s.app_id}:${s.stand}`, s.eingespielt_am]));
  for (const s of staende.rows) {
    const liste = s.manifest?.verbindungen || [];
    for (const host of liste) {
      const je = eingetragen.get(s.app_id) || new Map();
      je.set(host, [...(je.get(host) || []), s.stand]);
      eingetragen.set(s.app_id, je);
    }
  }

  return {
    apps: apps.rows.map(app => {
      const eigene = zeilen.rows.filter(z => z.quelle === 'app' && z.app_id === app.id);
      return {
        id: app.id,
        name: app.name,
        eingetragen: [...(eingetragen.get(app.id) || new Map())].map(([host, st]) => ({
          host,
          staende: st.sort(),
        })),
        genutzt: nachHost(eigene.filter(z => z.ergebnis === 'erlaubt')),
        // `stoerung` (M5, Seite der App): der Name steht in `verbindungen`
        // desselben Standes und wurde trotzdem abgewiesen, SEIT dieser Stand
        // eingespielt ist -- er zeigt etwa auf eine Adresse im Haus. Dann kann
        // die App nicht arbeiten, wie sie soll, und nur dann ist es rot. Eine
        // Abweisung von vor dem Einspielen (der Name stand damals noch nicht
        // drin) zaehlt nicht: die Zaehler wachsen nur. Einen Namen, den niemand
        // eingetragen hat, abzuweisen, ist dagegen die Aufgabe des Proxys.
        abgewiesen: nachHost(eigene.filter(z => z.ergebnis === 'abgewiesen')).map(z => ({
          ...z,
          stoerung: eigene.some(
            r =>
              r.ergebnis === 'abgewiesen' &&
              r.host === z.host &&
              ((eingetragen.get(app.id) || new Map()).get(r.host) || []).includes(r.stand) &&
              r.zuletzt &&
              seit.get(`${app.id}:${r.stand}`) &&
              new Date(r.zuletzt) >= new Date(seit.get(`${app.id}:${r.stand}`))
          ),
        })),
      };
    }),
    plattform: {
      genutzt: nachHost(zeilen.rows.filter(z => z.quelle === 'plattform')),
    },
  };
}

module.exports = {
  PROXY_ADRESSE,
  tokenFuer,
  dienstTokenGueltig,
  umgebung,
  regeln,
  nimmAuf,
  zaehlePlattform,
  uebersicht,
};
