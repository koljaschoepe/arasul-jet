/**
 * Rueckmeldungen aus dem Rahmen (J42, M7, Karte rueckmeldung-im-rahmen).
 *
 * Ein Mitarbeiter meldet ueber das Icon ueber jeder App, was fehlt: freier
 * Text, wahlweise ein Bildschirmfoto der Seite mit einer markierten Stelle.
 * App, Stand, Seite, Person und Zeit haengt der Rahmen an. Vertrag:
 * docs/features/RUECKMELDUNG.md.
 *
 * ZWEI SEITEN, ZWEI RECHTE.
 *   - Melden darf jeder, der die App in diesem Stand benutzen darf
 *     (`appZugang.pruefe`, dieselbe Frage wie vor jeder Seite der App).
 *     Wer die App nicht hat, kann auch nichts zu ihr melden.
 *   - Lesen darf nur, wer das Kennzeichen Entwickler traegt
 *     (`admin_users.entwickler`, Migration 213). Gefragt wird die Datenbank
 *     bei jedem Aufruf, nicht der Zwischenspeicher von `requireAuth`: ein
 *     entzogenes Kennzeichen gilt beim naechsten Aufruf. Die Rolle Admin
 *     allein reicht NICHT (schleife.md, Regel 2).
 *
 * DAS BILD LIEGT ALS DATEI AM GERAET, nicht in der Datenbank: unter
 * `<APPS_DIR>/.rueckmeldungen/<uuid>.png`. Der Ordner liegt im Baum der Apps
 * und geht damit jede Nacht in den Stand der Sicherung
 * (services/backup-service/staende.sh). Die Spalte nennt nur den Namen; der
 * Pfad entsteht hier und wird gegen den Ordner geprueft. Mit der Meldung geht
 * die Datei.
 */

const crypto = require('crypto');
const fsp = require('fs').promises;
const path = require('path');
const db = require('../../database');
const logger = require('../../utils/logger');
const appZugang = require('../app/appZugang');
const { anzeigeName } = require('../../utils/profil');
const { ForbiddenError, NotFoundError, ValidationError } = require('../../utils/errors');

/** Hoechstens so viele Bytes darf ein Bild haben (nach dem Dekodieren). */
const BILD_GRENZE = 6 * 1024 * 1024;

/** Die ersten acht Bytes jeder PNG-Datei. */
const PNG_KOPF = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const NAME_MUSTER = /^[a-f0-9-]{36}\.png$/;

/** Der Ordner der Bilder, je Aufruf gelesen (Tests setzen `APPS_DIR`). */
function bildOrdner() {
  return path.join(process.env.APPS_DIR || '/arasul/apps', '.rueckmeldungen');
}

/** Der Pfad eines Bildes, nur fuer Namen, die der Dienst selbst vergibt. */
function bildPfad(name) {
  if (!NAME_MUSTER.test(String(name))) {
    throw new ValidationError('Ungültiger Bildname');
  }
  return path.join(bildOrdner(), name);
}

/**
 * `data:image/png;base64,...` in Bytes. Nur PNG: das erzeugt der Rahmen, und
 * jedes andere Format waere eine Tuer fuer etwas, das niemand erwartet.
 */
function dekodiereBild(dataUrl) {
  const treffer = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!treffer) {
    throw new ValidationError('Das Bildschirmfoto muss ein PNG sein.');
  }
  const bytes = Buffer.from(treffer[1], 'base64');
  if (bytes.length > BILD_GRENZE) {
    throw new ValidationError('Das Bildschirmfoto ist größer als 6 MB.');
  }
  if (bytes.length < PNG_KOPF.length || !bytes.subarray(0, 8).equals(PNG_KOPF)) {
    throw new ValidationError('Das Bildschirmfoto ist kein PNG.');
  }
  return bytes;
}

/**
 * Die Adresse der Seite muss in der App liegen, zu der gemeldet wird. Sonst
 * koennte eine Meldung zu Belege eine Seite einer anderen App nennen.
 */
function pruefeSeite(appId, seite) {
  const wurzel = `/apps/${appId}/`;
  if (!String(seite).startsWith(wurzel)) {
    throw new ValidationError(`Die Seite muss unter ${wurzel} liegen.`);
  }
}

/**
 * Eine Meldung anlegen.
 *
 * @param {{personId: number|string, appId: string, stand: 'test'|'live', seite: string,
 *          text: string, bild?: string|null, markierung?: object|null}} m
 * @returns {Promise<{id: number, erstellt_am: string}>}
 */
async function melde({ personId, appId, stand, seite, text, bild = null, markierung = null }) {
  await appZugang.pruefe({ benutzerId: personId, appId, stand });
  pruefeSeite(appId, seite);

  let bildName = null;
  if (bild) {
    const bytes = dekodiereBild(bild);
    bildName = `${crypto.randomUUID()}.png`;
    await fsp.mkdir(bildOrdner(), { recursive: true });
    await fsp.writeFile(bildPfad(bildName), bytes, { mode: 0o640 });
  }

  let zeile;
  try {
    const { rows } = await db.query(
      `INSERT INTO public.rueckmeldungen
         (app_id, stand, seite, text, bild, markierung, person_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, erstellt_am`,
      [
        appId,
        stand,
        seite,
        text,
        bildName,
        bild && markierung ? JSON.stringify(markierung) : null,
        personId,
      ]
    );
    zeile = rows[0];
  } catch (err) {
    // Ohne Zeile keine Datei: ein Bild, auf das nichts zeigt, kaeme sonst in
    // jede Sicherung und gehoerte niemandem.
    if (bildName) {
      await fsp.rm(bildPfad(bildName), { force: true });
    }
    throw err;
  }

  logger.info(
    `Rückmeldung ${zeile.id} zu ${appId} (${stand}) von Person ${personId}` +
      (bildName ? ' mit Bild' : ' ohne Bild')
  );
  return { id: Number(zeile.id), erstellt_am: zeile.erstellt_am };
}

/**
 * Traegt diese Person das Kennzeichen Entwickler? Frisch aus der Datenbank.
 * Wirft 403, wenn nicht -- auch fuer einen Administrator ohne Kennzeichen.
 */
async function pruefeEntwickler(personId) {
  const { rows } = await db.query(
    'SELECT entwickler FROM public.admin_users WHERE id = $1 AND is_active = true',
    [personId]
  );
  if (rows[0]?.entwickler !== true) {
    throw new ForbiddenError(
      'Rückmeldungen lesen nur Personen mit dem Kennzeichen Entwickler. ' +
        'Ein Administrator schaltet es unter Verwaltung › Personen.'
    );
  }
}

/** Eine Zeile so, wie sie nach aussen geht. */
function nachAussen(z) {
  return {
    id: Number(z.id),
    app_id: z.app_id,
    app_name: z.app_name ?? null,
    stand: z.stand,
    seite: z.seite,
    text: z.text,
    hat_bild: Boolean(z.bild),
    markierung: z.markierung ?? null,
    person: z.person_id == null ? null : { id: Number(z.person_id), anzeigeName: anzeigeName(z) },
    stand_meldung: z.stand_meldung,
    erstellt_am: z.erstellt_am,
  };
}

/**
 * Die Meldungen, neueste zuerst, hoechstens `grenze`.
 * @param {{appId?: string, grenze?: number}} [f]
 */
async function liste({ appId, grenze = 200 } = {}) {
  const { rows } = await db.query(
    `SELECT r.id, r.app_id, a.name AS app_name, r.stand, r.seite, r.text, r.bild,
            r.markierung, r.person_id, r.stand_meldung, r.erstellt_am,
            u.username, u.vorname, u.nachname
       FROM public.rueckmeldungen r
       LEFT JOIN public.apps a ON a.id = r.app_id
       LEFT JOIN public.admin_users u ON u.id = r.person_id
      WHERE ($1::text IS NULL OR r.app_id = $1)
      ORDER BY r.erstellt_am DESC, r.id DESC
      LIMIT $2`,
    [appId ?? null, grenze]
  );
  return rows.map(nachAussen);
}

/** Die Bytes des Bildes einer Meldung. 404, wenn sie keins hat. */
async function bild(id) {
  const { rows } = await db.query('SELECT bild FROM public.rueckmeldungen WHERE id = $1', [id]);
  if (rows.length === 0) {
    throw new NotFoundError(`Keine Rückmeldung ${id}`);
  }
  if (!rows[0].bild) {
    throw new NotFoundError(`Rückmeldung ${id} hat kein Bild`);
  }
  try {
    return await fsp.readFile(bildPfad(rows[0].bild));
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new NotFoundError(`Das Bild der Rückmeldung ${id} fehlt am Gerät`);
    }
    throw err;
  }
}

/** Eine Meldung entfernen, und mit ihr ihr Bild. */
async function loesche(id) {
  const { rows } = await db.query(
    'DELETE FROM public.rueckmeldungen WHERE id = $1 RETURNING bild',
    [id]
  );
  if (rows.length === 0) {
    throw new NotFoundError(`Keine Rückmeldung ${id}`);
  }
  if (rows[0].bild) {
    await fsp.rm(bildPfad(rows[0].bild), { force: true });
  }
  logger.info(`Rückmeldung ${id} entfernt${rows[0].bild ? ', Bild mit' : ''}`);
}

module.exports = {
  melde,
  liste,
  bild,
  loesche,
  pruefeEntwickler,
  bildOrdner,
  BILD_GRENZE,
};
