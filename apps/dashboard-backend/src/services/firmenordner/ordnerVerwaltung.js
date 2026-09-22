/**
 * Der Firmenordner in den Begriffen des Geraets (J33, 22.09.2026).
 *
 * Hier stehen Ordner, Ebenen, Rechte und Menschen. Was daraus im Dateidienst
 * wird -- ein Raum, ein Unterordner, eine Einladung --, weiss allein
 * `ordnerdienst.js` daneben.
 *
 * DIE EINE REGEL, DIE ALLES ANDERE ERKLAERT: **Rechte werden nur vergeben,
 * nie unterhalb wieder entzogen** (Ueberordner, 21.09.2026). Sie steht nicht
 * aus Geschmack da, sondern weil zwei der drei am 21.09.2026 gemessenen
 * Dienste gar nichts anderes koennen -- und der gewaehlte gehoert dazu. Eine
 * Schnittstelle, die „weniger" annimmt und der Dienst dann nicht ausfuehrt,
 * waere die schlimmste Form von Sicherheit: eine, die ja sagt und nichts tut.
 * Deshalb weist `gibRecht` eine solche Bitte ab, mit dem Satz, was
 * stattdessen zu tun ist.
 *
 * WAS DARAUS FOLGT, in einem Bild:
 *
 *     projekte/            Ebene 1 -- ein Raum. Wer hier ein Recht hat, hat es
 *       vicona/            auf allem darunter.
 *       intern/            Ebene 2 -- ein Ordner im Raum. Wer NUR ihn bekommen
 *                          soll, bekommt auf `projekte` NICHTS: ein Ordner
 *                          ohne Recht ist unsichtbar, auch sein Name.
 *
 * DER ABGLEICH IST NACHHOLEND, NICHT SPERREND. Jede Spiegelung faengt ihren
 * Fehler und schreibt ihn in `abgleich_offen`. Ein Mitarbeiter wird also
 * angelegt, auch wenn der Firmenordner gerade neu startet; er kommt dort
 * einfach noch nicht herein. `holeNach()` raeumt das auf und wird von der
 * lesenden Route und vom Start des Backends angestossen.
 */

const crypto = require('crypto');
const db = require('../../database');
const logger = require('../../utils/logger');
const { ValidationError, NotFoundError, ConflictError } = require('../../utils/errors');
const dienst = require('./ordnerdienst');

/** Die zwei Rechte, in der Reihenfolge „weniger, mehr". */
const RECHTE = ['lesen', 'schreiben'];

/**
 * DIE WURZEL (Auftrag firmenordner-rechte-im-frontend, 22.09.2026).
 *
 * Das Zielbild hat ueber den zwei Ebenen eine Ebene 0: `firma/`, alle lesen,
 * nur der Administrator schreibt. Darin liegen die Regeln, Skills und Agents
 * der Firma, die Liste der fremden Orte und die je Mensch erzeugte
 * `sicht.md`. Im Dienst gibt es ueber einem Raum nichts, also ist die Wurzel
 * ein EIGENER Raum mit der Art `wurzel`, den das CLI der Wurzel am Rechner
 * des Menschen oben in den Baum legt. Genau eine je Geraet (Migration 184).
 *
 * WER SIE LIEST, STEHT IN KEINER RECHTE-ZEILE. Jeder aktive Mensch liest,
 * jeder Administrator schreibt -- das folgt aus `admin_users.role`. Im
 * Dienst wird es zu einer Einladung je Mensch mit der passenden Rolle, und
 * `spiegleWurzelMitglieder` haelt beides aneinander: beim Anlegen der Wurzel,
 * beim Spiegeln eines neuen Menschen und bei jedem Abgleich.
 */
const ART_WURZEL = 'wurzel';

/** Welche Stufe ein Mensch auf der Wurzel hat -- aus seiner Rolle. */
function wurzelRecht(rolle) {
  return rolle === 'admin' ? 'schreiben' : 'lesen';
}

/** Ist `a` mindestens so viel wie `b`? */
function mindestens(a, b) {
  return RECHTE.indexOf(a) >= RECHTE.indexOf(b);
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

const SPALTEN = `o.id, o.kennung, o.name, o.ebene, o.eltern_id, o.art, o.raum_id,
                 o.pfad, o.angelegt_am`;

async function listeOrdner() {
  const { rows } = await db.query(
    `SELECT ${SPALTEN},
            e.kennung AS eltern_kennung,
            (SELECT COUNT(*) FROM public.firmenordner_rechte r WHERE r.ordner_id = o.id)::int
              AS rechte_anzahl
       FROM public.firmenordner_ordner o
       LEFT JOIN public.firmenordner_ordner e ON e.id = o.eltern_id
      ORDER BY COALESCE(e.kennung, o.kennung), o.ebene, o.kennung`
  );
  return rows;
}

async function holeOrdner(id) {
  const { rows } = await db.query(
    `SELECT ${SPALTEN} FROM public.firmenordner_ordner o WHERE o.id = $1`,
    [id]
  );
  if (rows.length === 0) {
    throw new NotFoundError(`Diesen Ordner gibt es nicht (${id})`);
  }
  return rows[0];
}

/** Die eine Wurzel, oder `null`, solange niemand sie angelegt hat. */
async function holeWurzel() {
  const { rows } = await db.query(
    `SELECT ${SPALTEN} FROM public.firmenordner_ordner o WHERE o.art = $1`,
    [ART_WURZEL]
  );
  return rows[0] || null;
}

async function listeRechte({ ordnerId, benutzerId } = {}) {
  const { rows } = await db.query(
    `SELECT r.ordner_id, r.user_id, r.recht, r.erteilt_am, r.abgleich_offen,
            o.kennung AS ordner_kennung, o.ebene, o.art,
            e.kennung AS eltern_kennung,
            u.username
       FROM public.firmenordner_rechte r
       JOIN public.firmenordner_ordner o ON o.id = r.ordner_id
       LEFT JOIN public.firmenordner_ordner e ON e.id = o.eltern_id
       JOIN public.admin_users u ON u.id = r.user_id
      WHERE ($1::bigint IS NULL OR r.ordner_id = $1)
        AND ($2::bigint IS NULL OR r.user_id = $2)
      ORDER BY o.ebene, o.kennung, u.username`,
    [ordnerId || null, benutzerId || null]
  );
  return rows;
}

/**
 * Was ein Mensch hat -- die Antwort der lesenden Route.
 *
 * DER PFAD IST DER, AN DEN DAS CLI DEN ORDNER LEGT, und er ist die echte
 * Stelle im Baum: ein Ordner der Ebene 2 heisst `<eltern>/<kennung>`, auch
 * wenn sein Besitzer den Elternordner gar nicht sieht. Das ist Regel 1 des
 * Zielbildes -- „der Ordner liegt bei ihm an seiner echten Stelle im Baum" --,
 * und am 21.09.2026 am Geraet nachgemessen: der Klient legt die Kette
 * darueber lokal an, der Dienst kennt sie fuer diesen Menschen nicht, und im
 * Elternordner darf er nichts anlegen.
 *
 * `am_geraet` kommt hier NIE vor. Diese Ordner haben keine Rechte-Zeile, und
 * das ist die ganze Durchsetzung: es gibt nichts zu filtern, weil es nichts
 * gibt.
 */
async function meineOrdner(benutzerId, rolle = 'mitarbeiter') {
  const { rows } = await db.query(
    `SELECT o.kennung, o.name, o.ebene, o.art, r.recht,
            e.kennung AS eltern_kennung,
            CASE WHEN o.ebene = 1 THEN o.kennung
                 ELSE e.kennung || '/' || o.kennung END AS pfad
       FROM public.firmenordner_rechte r
       JOIN public.firmenordner_ordner o ON o.id = r.ordner_id
       LEFT JOIN public.firmenordner_ordner e ON e.id = o.eltern_id
      WHERE r.user_id = $1 AND o.art = 'geteilt'
      ORDER BY pfad`,
    [benutzerId]
  );
  const ordner = rows.map(z => ({
    kennung: z.kennung,
    name: z.name,
    ebene: z.ebene,
    art: z.art,
    eltern: z.eltern_kennung || null,
    pfad: z.pfad,
    recht: z.recht,
  }));
  // DIE WURZEL ZUERST, mit leerem Pfad: sie liegt ueber allem, und wer sie
  // liest, steht in keiner Zeile -- jeder aktive Mensch tut es, der
  // Administrator schreibt. Ein Geraet ohne Wurzel nennt keine; das CLI
  // legt dann keine oben hin.
  const wurzel = await holeWurzel();
  if (!wurzel) {
    return ordner;
  }
  return [
    {
      kennung: wurzel.kennung,
      name: wurzel.name,
      ebene: 0,
      art: ART_WURZEL,
      eltern: null,
      pfad: '',
      recht: wurzelRecht(rolle),
    },
    ...ordner,
  ];
}

// ---------------------------------------------------------------------------
// Ordner anlegen
// ---------------------------------------------------------------------------

/**
 * Einen Ordner anlegen.
 *
 * ZUERST DIE ZEILE, DANN DER DIENST. Andersherum haette ein Dienst, der nach
 * dem Anlegen des Raums ausfaellt, einen Raum ohne Zeile hinterlassen -- und
 * der waere fuer das Geraet unsichtbar und fuer niemanden loeschbar. So
 * herum ist der schlimmste Fall eine Zeile ohne Raum, und die holt
 * `holeNach()` ein.
 */
async function legeOrdnerAn({ kennung, name, ebene, elternKennung, art, durch }) {
  if (art === ART_WURZEL) {
    return legeWurzelAn({ kennung, name, durch });
  }
  let eltern = null;
  if (ebene === 2) {
    if (!elternKennung) {
      throw new ValidationError('Ein Ordner der Ebene 2 braucht einen Ordner der Ebene 1 darueber');
    }
    const { rows } = await db.query(
      `SELECT ${SPALTEN} FROM public.firmenordner_ordner o
        WHERE o.kennung = $1 AND o.eltern_id IS NULL`,
      [elternKennung]
    );
    if (rows.length === 0) {
      throw new NotFoundError(`Einen Ordner „${elternKennung}" auf Ebene 1 gibt es nicht`);
    }
    eltern = rows[0];
    if (eltern.art === 'am_geraet') {
      throw new ValidationError(
        `„${elternKennung}" ist ein Ordner am Geraet. Darunter gibt es keine Ebene 2, ` +
          'weil niemand ihn abgleicht.'
      );
    }
  }

  const { rows } = await db.query(
    `INSERT INTO public.firmenordner_ordner
       (kennung, name, ebene, eltern_id, art, raum_id, pfad, angelegt_von)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      kennung,
      name,
      ebene,
      eltern ? eltern.id : null,
      art || 'geteilt',
      eltern ? eltern.raum_id : null,
      ebene === 2 ? kennung : '',
      durch || null,
    ]
  );
  const id = rows[0].id;

  await mitDienst(`Ordner ${kennung} anlegen`, async () => {
    if (ebene === 1) {
      const raumId = await dienst.legeRaumAn(kennung);
      await db.query('UPDATE public.firmenordner_ordner SET raum_id = $2 WHERE id = $1', [
        id,
        raumId,
      ]);
    } else {
      await dienst.legeOrdnerAn(eltern.raum_id, kennung);
    }
  });

  return holeOrdner(id);
}

/**
 * Die Wurzel anlegen: Ebene 0, genau eine.
 *
 * Danach bekommt jeder gespiegelte Mensch seine Einladung darauf --
 * Administratoren als Schreiber, alle anderen als Leser. Das ist die eine
 * Stelle, an der „alle lesen, nur der Admin schreibt" fuer die Menschen
 * gilt, die es VOR der Wurzel schon gab; wer danach kommt, bekommt sie in
 * `spiegleNutzer`.
 */
async function legeWurzelAn({ kennung, name, durch }) {
  const vorhanden = await holeWurzel();
  if (vorhanden) {
    throw new ConflictError(
      `Dieses Geraet hat schon eine Wurzel („${vorhanden.kennung}"). Es gibt genau eine.`
    );
  }
  const { rows } = await db.query(
    `INSERT INTO public.firmenordner_ordner
       (kennung, name, ebene, eltern_id, art, raum_id, pfad, angelegt_von)
     VALUES ($1, $2, 0, NULL, $3, NULL, '', $4)
     RETURNING id`,
    [kennung, name, ART_WURZEL, durch || null]
  );
  const id = rows[0].id;
  await mitDienst(`Wurzel ${kennung} anlegen`, async () => {
    const raumId = await dienst.legeRaumAn(kennung);
    await db.query('UPDATE public.firmenordner_ordner SET raum_id = $2 WHERE id = $1', [
      id,
      raumId,
    ]);
  });
  await spiegleWurzelMitglieder();
  return holeOrdner(id);
}

/**
 * Einen Ordner wegwerfen -- **samt allem, was darin liegt**.
 *
 * DREI RIEGEL, UND JEDER HAT EINEN GRUND.
 *
 *   1. Die KENNUNG muss abgetippt werden. Derselbe Riegel wie beim Entfernen
 *      einer App (C5): ein Klick darf nicht die Arbeit eines Jahres
 *      wegnehmen. Er steht an der Route, nicht hier.
 *   2. Ein Ordner der Ebene 1 mit KINDERN geht nicht. Das Fremdschluessel-
 *      `CASCADE` der Migration wuerde sie mitnehmen, und der Mensch, der
 *      „projekte" abtippt, meint nicht auch „vicona" und „intern". Wer den
 *      Bereich wirklich wegwerfen will, raeumt ihn von unten.
 *   3. Ein Ordner mit RECHTEN geht nicht. Sonst verschwindet ein Ordner unter
 *      den Fuessen von jemandem, der gerade darin arbeitet -- und sein Klient
 *      loescht ihn am naechsten Morgen auf seinem Rechner hinterher.
 *
 * DIE ZEILE FAELLT AUCH DANN, WENN DER DIENST NICHT ANTWORTET, und das ist die
 * andere Richtung als beim Anlegen: dort ist der schlimmste Fall eine Zeile
 * ohne Raum (`holeNach` heilt sie), hier waere es ein Raum ohne Zeile. Der ist
 * fuer den Menschen unsichtbar und fuer niemanden loeschbar -- deshalb zuerst
 * der Dienst und erst danach die Zeile.
 */
async function loescheOrdner({ ordnerId }) {
  const ordner = await holeOrdner(ordnerId);

  // DIE WURZEL FAELLT ZULETZT. Solange ein anderer Ordner besteht, haengt an
  // ihr die Kette nach oben, die jeder Mensch mit irgendeinem Recht liest
  // (Regel 1 des Zielbildes) -- ohne sie staende jeder Ordner ohne seine
  // Regeln da. Ein Geraet, das nur noch die Wurzel hat, darf sie wegwerfen.
  if (ordner.art === ART_WURZEL) {
    const { rows: andere } = await db.query(
      'SELECT COUNT(*)::int AS n FROM public.firmenordner_ordner WHERE id <> $1',
      [ordnerId]
    );
    if (andere[0].n > 0) {
      throw new ConflictError(
        `„${ordner.kennung}" ist die Wurzel, und es gibt noch ${andere[0].n} andere Ordner. ` +
          'Sie faellt erst, wenn kein anderer Ordner mehr besteht.'
      );
    }
  }

  const { rows: kinder } = await db.query(
    'SELECT kennung FROM public.firmenordner_ordner WHERE eltern_id = $1',
    [ordnerId]
  );
  if (kinder.length > 0) {
    throw new ConflictError(
      `In „${ordner.kennung}" liegen noch ${kinder.length} Ordner der Ebene 2 ` +
        `(${kinder.map(k => k.kennung).join(', ')}). Raeumen Sie ihn von unten.`
    );
  }

  const { rows: rechte } = await db.query(
    `SELECT u.username FROM public.firmenordner_rechte r
       JOIN public.admin_users u ON u.id = r.user_id
      WHERE r.ordner_id = $1`,
    [ordnerId]
  );
  if (rechte.length > 0) {
    throw new ConflictError(
      `Auf „${ordner.kennung}" haben noch ${rechte.length} Menschen ein Recht ` +
        `(${rechte.map(r => r.username).join(', ')}). Nehmen Sie es zuerst zurueck.`
    );
  }

  if (ordner.raum_id) {
    const offen = await mitDienst(`Ordner ${ordner.kennung} wegwerfen`, () =>
      ordner.ebene === 1
        ? dienst.loescheRaum(ordner.raum_id)
        : dienst.loescheOrdner(ordner.raum_id, ordner.pfad)
    );
    if (offen) {
      throw new ConflictError(
        `Der Dateidienst hat „${ordner.kennung}" nicht weggeworfen: ${offen}. ` +
          'Die Zeile bleibt stehen, sonst gaebe es dort einen Raum, den dieses ' +
          'Geraet nicht mehr kennt.'
      );
    }
  }

  await db.query('DELETE FROM public.firmenordner_ordner WHERE id = $1', [ordnerId]);
  return { kennung: ordner.kennung, ebene: ordner.ebene, art: ordner.art };
}

// ---------------------------------------------------------------------------
// Rechte
// ---------------------------------------------------------------------------

/**
 * Ein Recht vergeben.
 *
 * DIE PRUEFUNG, DIE DIESE FUNKTION AUSMACHT, steht in der Mitte: bekommt
 * jemand auf einem Ordner der Ebene 2 WENIGER, als er auf dem Ordner
 * darueber schon hat, wird die Bitte abgewiesen. Sie waere nicht ausfuehrbar
 * -- der Dienst kennt kein Entziehen nach unten --, und eine angenommene,
 * unausgefuehrte Bitte ist schlimmer als eine abgelehnte: der Administrator
 * saehe in seiner Liste „lesen", waehrend der Mensch schreibt.
 *
 * MEHR AUF DEM KIND IST ERLAUBT und der Normalfall: lesen auf dem Bereich,
 * schreiben auf dem einen Projekt darin.
 */
async function gibRecht({ ordnerId, benutzerId, recht, durch }) {
  if (!RECHTE.includes(recht)) {
    throw new ValidationError(`Unbekanntes Recht „${recht}"; es gibt ${RECHTE.join(' und ')}`);
  }
  const ordner = await holeOrdner(ordnerId);
  if (ordner.art === ART_WURZEL) {
    throw new ValidationError(
      `„${ordner.kennung}" ist die Wurzel. Jeder aktive Mensch liest sie, Administratoren ` +
        'schreiben -- das folgt aus der Rolle, nicht aus einem Recht je Person.'
    );
  }
  if (ordner.art === 'am_geraet') {
    throw new ValidationError(
      `„${ordner.kennung}" ist ein Ordner am Geraet. Er wird nie abgeglichen und bekommt ` +
        'deshalb keine Rechte -- nur Flows und Apps am Geraet lesen ihn.'
    );
  }

  const nutzer = await holeNutzer(benutzerId);

  if (ordner.ebene === 2) {
    const { rows } = await db.query(
      `SELECT recht FROM public.firmenordner_rechte
        WHERE ordner_id = $1 AND user_id = $2`,
      [ordner.eltern_id, benutzerId]
    );
    if (rows.length > 0 && !mindestens(recht, rows[0].recht)) {
      const eltern = await holeOrdner(ordner.eltern_id);
      throw new ConflictError(
        `${nutzer.username} hat auf „${eltern.kennung}" schon „${rows[0].recht}", und ein Recht ` +
          `wird nie unterhalb wieder entzogen. „${recht}" auf „${ordner.kennung}" waere weniger. ` +
          `Nehmen Sie stattdessen das Recht auf „${eltern.kennung}" zurueck und vergeben Sie die ` +
          'Ordner darunter einzeln.'
      );
    }
  }

  const { rows } = await db.query(
    `INSERT INTO public.firmenordner_rechte (ordner_id, user_id, recht, erteilt_von, abgleich_offen)
     VALUES ($1, $2, $3, $4, 'noch nicht an den Dienst gemeldet')
     ON CONFLICT (ordner_id, user_id)
       DO UPDATE SET recht = EXCLUDED.recht,
                     erteilt_am = NOW(),
                     erteilt_von = EXCLUDED.erteilt_von,
                     abgleich_offen = 'noch nicht an den Dienst gemeldet'
     RETURNING (xmax = 0) AS neu`,
    [ordnerId, benutzerId, recht, durch || null]
  );

  await spiegleRecht({ ordner, nutzer, recht });
  return { neu: rows[0].neu, recht, ordner: ordner.kennung, benutzer: nutzer.username };
}

/**
 * Ein Recht zuruecknehmen.
 *
 * DAS IST KEIN WIDERSPRUCH ZU „NIE UNTERHALB ENTZOGEN". Die Regel verbietet,
 * einem Menschen auf einem KIND weniger zu geben als auf dem Elternteil --
 * sie verbietet nicht, ein vergebenes Recht wieder wegzunehmen. Wer einen
 * Menschen aus einem Bereich nimmt, nimmt ihn ganz heraus.
 */
async function nimmRechtZurueck({ ordnerId, benutzerId }) {
  const ordner = await holeOrdner(ordnerId);
  const nutzer = await holeNutzer(benutzerId);
  const { rowCount } = await db.query(
    'DELETE FROM public.firmenordner_rechte WHERE ordner_id = $1 AND user_id = $2',
    [ordnerId, benutzerId]
  );
  if (rowCount === 0) {
    throw new NotFoundError(`${nutzer.username} hat auf „${ordner.kennung}" kein Recht`);
  }
  await mitDienst(`Einladung ${nutzer.username} auf ${ordner.kennung} zuruecknehmen`, async () => {
    const spiegel = await spiegelZeile(benutzerId);
    if (!spiegel || !ordner.raum_id) {
      return;
    }
    await dienst.nimmEinladungZurueck({
      raumId: ordner.raum_id,
      ordnerId: ordner.ebene === 2 ? await dienst.ordnerKennung(ordner.raum_id, ordner.pfad) : null,
      dienstNutzerId: spiegel.dienst_id,
    });
  });
  return { ordner: ordner.kennung, benutzer: nutzer.username };
}

// ---------------------------------------------------------------------------
// Die Spiegelung eines Menschen
// ---------------------------------------------------------------------------

async function holeNutzer(benutzerId) {
  const { rows } = await db.query(
    'SELECT id, username, email, role, is_active FROM public.admin_users WHERE id = $1',
    [benutzerId]
  );
  if (rows.length === 0) {
    throw new NotFoundError(`Benutzer ${benutzerId} gibt es nicht`);
  }
  return rows[0];
}

async function spiegelZeile(benutzerId) {
  const { rows } = await db.query('SELECT * FROM public.firmenordner_nutzer WHERE user_id = $1', [
    benutzerId,
  ]);
  return rows[0] || null;
}

/**
 * Der eine Wrapper um jeden Aufruf des Dienstes.
 *
 * ER FAENGT, UND ZWAR ALLES. Was hier hereinkommt, ist eine Nebenwirkung der
 * eigentlichen Sache: ein Mitarbeiter wird angelegt, ein Passwort gesetzt,
 * ein Recht vergeben. Faellt der Dateidienst dabei aus, darf die eigentliche
 * Sache nicht scheitern -- sonst haette ein Geraet, dessen Firmenordner
 * gerade neu startet, keine Benutzerverwaltung mehr.
 *
 * Gibt `null` zurueck, wenn es geklappt hat, sonst den Satz fuer
 * `abgleich_offen`.
 */
async function mitDienst(was, tuEs) {
  if (!dienst.istAn()) {
    return null;
  }
  try {
    await tuEs();
    return null;
  } catch (err) {
    logger.warn(`Firmenordner: ${was} ging nicht -- ${err.message}`);
    return `${was}: ${err.message}`.slice(0, 500);
  }
}

/**
 * Einen Menschen in den Dienst spiegeln, mit seinem Klartextpasswort.
 *
 * DIE EINZIGE STELLE, AN DER DAS PASSWORT HIER DURCHKOMMT. Aufgerufen wird
 * sie aus `benutzerService.legeBenutzerAn` und aus
 * `passwordService.schreibePasswort` -- also genau aus den zwei Augenblicken,
 * in denen das Geraet den Klartext ohnehin in der Hand hat. Nirgends sonst.
 */
async function spiegleNutzer({ benutzerId, username, email, passwort }) {
  if (!dienst.istAn()) {
    return;
  }
  const vorhanden = await spiegelZeile(benutzerId);

  if (vorhanden) {
    const offen = await mitDienst(`Passwort von ${username} setzen`, () =>
      dienst.setzePasswort(vorhanden.dienst_id, passwort)
    );
    await db.query(
      `UPDATE public.firmenordner_nutzer
          SET passwort_gespiegelt = $2, abgleich_offen = $3, abgeglichen_am = NOW()
        WHERE user_id = $1`,
      [benutzerId, offen === null, offen]
    );
    return;
  }

  let angelegt = null;
  const offen = await mitDienst(`Nutzer ${username} anlegen`, async () => {
    angelegt = await dienst.legeNutzerAn({ name: username, anzeige: username, email, passwort });
  });
  if (!angelegt) {
    // Der Dienst hat den Menschen nicht angenommen. KEINE ZEILE ohne
    // `dienst_id`: sie waere ein Spiegel, der auf nichts zeigt, und jeder
    // spaetere Aufruf haette eine Kennung in der Hand, die es nicht gibt.
    // `holeNach()` findet den Menschen ueber `admin_users` wieder.
    logger.warn(`Firmenordner: ${username} ist noch nicht gespiegelt (${offen})`);
    return;
  }
  await db.query(
    `INSERT INTO public.firmenordner_nutzer
       (user_id, dienst_id, dienst_name, passwort_gespiegelt, abgleich_offen, abgeglichen_am)
     VALUES ($1, $2, $3, true, NULL, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET dienst_id = EXCLUDED.dienst_id,
           dienst_name = EXCLUDED.dienst_name,
           passwort_gespiegelt = true,
           abgleich_offen = NULL,
           abgeglichen_am = NOW()`,
    [benutzerId, angelegt.id, angelegt.name]
  );
  // Und auf die Wurzel, wenn es eine gibt: ein neuer Mensch liest sie vom
  // ersten Tag an, ohne dass jemand ein Recht vergibt.
  await spiegleWurzelMitglieder({ nurBenutzerId: benutzerId });
}

/**
 * Die Mitglieder der Wurzel im Dienst an die Menschen am Geraet angleichen.
 *
 * SOLL: jeder gespiegelte, aktive Mensch -- Administratoren mit
 * `schreiben`, alle anderen mit `lesen`. IST: was der Dienst an der Wurzel
 * des Raums als Berechtigungen fuehrt. Wer fehlt, wird eingeladen; wer die
 * falsche Rolle traegt, verliert sie und bekommt die richtige; wer am
 * Geraet stillgelegt ist, verliert sie. Berechtigungen, die zu keinem
 * gespiegelten Menschen gehoeren (das Konto des Geraets, das den Raum
 * angelegt hat), bleiben unangetastet.
 *
 * `nurBenutzerId` schraenkt auf einen Menschen ein -- fuer den Augenblick,
 * in dem er angelegt wird. Ohne die Einschraenkung ist es der Abgleich.
 *
 * Wirft nie: was nicht geht, steht im Log und beim naechsten Abgleich noch
 * einmal an. Es gibt hier keine Zeile, an der ein Vermerk haengen koennte,
 * und das ist richtig so -- die Wahrheit ueber die Wurzel steht in
 * `admin_users.role`, nicht in einer zweiten Tabelle.
 */
async function spiegleWurzelMitglieder({ nurBenutzerId = null } = {}) {
  if (!dienst.istAn()) {
    return { eingeladen: 0, geaendert: 0, entfernt: 0 };
  }
  const wurzel = await holeWurzel();
  if (!wurzel || !wurzel.raum_id) {
    return { eingeladen: 0, geaendert: 0, entfernt: 0 };
  }
  const bericht = { eingeladen: 0, geaendert: 0, entfernt: 0 };
  const { rows: menschen } = await db.query(
    `SELECT f.user_id, f.dienst_id, u.username, u.role, u.is_active
       FROM public.firmenordner_nutzer f
       JOIN public.admin_users u ON u.id = f.user_id
      WHERE ($1::bigint IS NULL OR f.user_id = $1)
      ORDER BY f.user_id`,
    [nurBenutzerId]
  );
  if (menschen.length === 0) {
    return bericht;
  }

  let ist = null;
  const offen = await mitDienst('Mitglieder der Wurzel lesen', async () => {
    ist = await dienst.mitglieder(wurzel.raum_id);
  });
  if (offen || !ist) {
    return bericht;
  }

  for (const mensch of menschen) {
    const vorhanden = ist.find(m => m.dienstNutzerId === mensch.dienst_id);
    if (!mensch.is_active) {
      if (vorhanden) {
        await mitDienst(`${mensch.username} von der Wurzel nehmen`, () =>
          dienst.entferneMitglied(wurzel.raum_id, vorhanden.permissionId)
        );
        bericht.entfernt += 1;
      }
      continue;
    }
    const recht = wurzelRecht(mensch.role);
    let rolleId = null;
    const ohneRolle = await mitDienst(`Rolle fuer ${recht} auf der Wurzel`, async () => {
      rolleId = await dienst.rolleFuer(recht, 'raum');
    });
    if (ohneRolle || !rolleId) {
      continue;
    }
    if (vorhanden && vorhanden.rollen.includes(rolleId)) {
      continue;
    }
    if (vorhanden) {
      await mitDienst(`${mensch.username} auf der Wurzel umstellen`, () =>
        dienst.entferneMitglied(wurzel.raum_id, vorhanden.permissionId)
      );
      bericht.geaendert += 1;
    } else {
      bericht.eingeladen += 1;
    }
    await mitDienst(`${mensch.username} auf die Wurzel einladen (${recht})`, () =>
      dienst.ladeEin({
        raumId: wurzel.raum_id,
        ordnerId: null,
        dienstNutzerId: mensch.dienst_id,
        recht,
      })
    );
  }
  return bericht;
}

/**
 * Sperren oder wieder zulassen.
 *
 * DIE ERSTE ZEILE IST DIE WICHTIGE, und sie steht in jeder `spiegle*`-Funktion
 * an derselben Stelle: ohne Firmenordner wird hier nicht einmal die Datenbank
 * gefragt. Das ist nicht Sparsamkeit -- es ist die Zusage, dass diese Datei
 * auf einem Geraet ohne Dateidienst NICHTS tut: keine Abfrage, kein Aufruf,
 * kein Vermerk, und damit auch kein Weg, auf dem sie die Benutzerverwaltung
 * stoeren koennte.
 */
async function spiegleAktiv({ benutzerId, aktiv }) {
  if (!dienst.istAn()) {
    return;
  }
  const spiegel = await spiegelZeile(benutzerId);
  if (!spiegel) {
    return;
  }
  const offen = await mitDienst(`${spiegel.dienst_name} ${aktiv ? 'zulassen' : 'sperren'}`, () =>
    dienst.setzeAktiv(spiegel.dienst_id, aktiv)
  );
  await db.query(
    `UPDATE public.firmenordner_nutzer
        SET abgleich_offen = $2, abgeglichen_am = NOW() WHERE user_id = $1`,
    [benutzerId, offen]
  );
  // Die Sperre im Dienst wirkt erst nach Sekunden (gemessen 20 bis 40); die
  // Einladung auf die Wurzel faellt sofort, und beim Zulassen kommt sie
  // zurueck.
  await spiegleWurzelMitglieder({ nurBenutzerId: benutzerId });
}

/**
 * Einen Menschen aus dem Dienst entfernen.
 *
 * DIE ZEILE FAELLT OHNEHIN (`ON DELETE CASCADE`, Migration 183), aber erst
 * NACHDEM diese Funktion gelaufen ist: sonst waere die Kennung im Dienst
 * verloren, und dort bliebe ein Konto stehen, von dem niemand mehr weiss,
 * wem es gehoerte. Deshalb ruft `benutzerService.loescheBenutzer` hier
 * VORHER an.
 *
 * SEINE DATEIEN BLEIBEN LIEGEN, und das ist Absicht: sie gehoeren der Firma
 * und nicht ihm. Was nach Art. 17 zu loeschen ist, sind seine
 * personenbezogenen Daten -- das Konto -- und nicht der Vertrag, den er
 * geschrieben hat.
 */
async function spiegleLoeschung(benutzerId) {
  if (!dienst.istAn()) {
    return;
  }
  const spiegel = await spiegelZeile(benutzerId);
  if (!spiegel) {
    return;
  }
  await mitDienst(`Nutzer ${spiegel.dienst_name} loeschen`, () =>
    dienst.loescheNutzer(spiegel.dienst_id)
  );
}

/** Eine Einladung an den Dienst melden und den Vermerk loeschen. */
async function spiegleRecht({ ordner, nutzer, recht }) {
  if (!dienst.istAn()) {
    return;
  }
  const spiegel = await spiegelZeile(nutzer.id);
  if (!spiegel || !ordner.raum_id) {
    return;
  }
  const offen = await mitDienst(
    `${nutzer.username} auf ${ordner.kennung} einladen (${recht})`,
    async () => {
      const ordnerId =
        ordner.ebene === 2 ? await dienst.ordnerKennung(ordner.raum_id, ordner.pfad) : null;
      await dienst.ladeEin({
        raumId: ordner.raum_id,
        ordnerId,
        dienstNutzerId: spiegel.dienst_id,
        recht,
      });
    }
  );
  await db.query(
    `UPDATE public.firmenordner_rechte SET abgleich_offen = $3
      WHERE ordner_id = $1 AND user_id = $2`,
    [ordner.id, nutzer.id, offen]
  );
}

// ---------------------------------------------------------------------------
// Nachholen
// ---------------------------------------------------------------------------

/**
 * Was offen ist, nachholen.
 *
 * DREI SACHEN, UND EINE DAVON GEHT NICHT. Raeume und Ordner lassen sich
 * nachlegen, Einladungen nachreichen -- ein Passwort nicht: das Geraet hat
 * nur den Hash. Ein Mensch, der vor dem Firmenordner schon da war, bekommt
 * deshalb ein Konto mit einem zufaelligen Passwort, das niemand kennt, und
 * `passwort_gespiegelt = false`. Er kommt herein, sobald jemand sein Passwort
 * einmal setzt oder er es selbst wechselt -- beides laeuft ohnehin durch
 * `spiegleNutzer`. Die Oberflaeche sagt es ihm; hier steht nur, warum es so
 * ist.
 *
 * Gibt einen Bericht zurueck, damit die Route und die Abnahme sehen, was
 * passiert ist.
 */
async function holeNach() {
  if (!dienst.istAn()) {
    return { an: false, nutzer: 0, raeume: 0, rechte: 0, offen: [] };
  }
  const bericht = { an: true, nutzer: 0, raeume: 0, rechte: 0, offen: [] };

  // 1. Menschen ohne Spiegel.
  const { rows: fehlende } = await db.query(
    `SELECT u.id, u.username, u.email, u.is_active
       FROM public.admin_users u
       LEFT JOIN public.firmenordner_nutzer f ON f.user_id = u.id
      WHERE f.user_id IS NULL
      ORDER BY u.id`
  );
  for (const mensch of fehlende) {
    // Ein Passwort, das niemand kennt und niemand braucht: der Zugang
    // entsteht erst beim naechsten Setzen. Ohne eines lehnt der Dienst das
    // Anlegen ab, und der Mensch haette gar kein Konto.
    const platzhalter = crypto.randomBytes(24).toString('base64url');
    let angelegt = null;
    const offen = await mitDienst(`Nutzer ${mensch.username} nachtragen`, async () => {
      angelegt = await dienst.legeNutzerAn({
        name: mensch.username,
        anzeige: mensch.username,
        email: mensch.email,
        passwort: platzhalter,
      });
    });
    if (!angelegt) {
      bericht.offen.push(offen);
      continue;
    }
    await db.query(
      `INSERT INTO public.firmenordner_nutzer
         (user_id, dienst_id, dienst_name, passwort_gespiegelt, abgleich_offen, abgeglichen_am)
       VALUES ($1, $2, $3, false,
               'Das Passwort ist am Geraet nur als Hash da. Setzen Sie es einmal, dann kommt dieser Mensch in den Firmenordner.',
               NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [mensch.id, angelegt.id, angelegt.name]
    );
    if (!mensch.is_active) {
      await mitDienst(`${mensch.username} sperren`, () => dienst.setzeAktiv(angelegt.id, false));
    }
    bericht.nutzer += 1;
  }

  // 2. Ordner der Ebene 1 ohne Raum.
  const neueRaeume = [];
  const { rows: ohneRaum } = await db.query(
    `SELECT ${SPALTEN} FROM public.firmenordner_ordner o
      WHERE o.raum_id IS NULL AND o.eltern_id IS NULL ORDER BY o.id`
  );
  for (const ordner of ohneRaum) {
    let raumId = null;
    const offen = await mitDienst(`Raum ${ordner.kennung} nachtragen`, async () => {
      raumId = await dienst.legeRaumAn(ordner.kennung);
    });
    if (!raumId) {
      bericht.offen.push(offen);
      continue;
    }
    await db.query(
      `UPDATE public.firmenordner_ordner SET raum_id = $2
        WHERE id = $1 OR eltern_id = $1`,
      [ordner.id, raumId]
    );
    neueRaeume.push(ordner.id);
    bericht.raeume += 1;
  }

  // 3. Die Ordner der Ebene 2 IN DEN GERADE ANGELEGTEN RAEUMEN -- und nur
  // dort. Sie jedes Mal alle nachzulegen waere zwar folgenlos (der Dienst
  // antwortet „gibt es schon"), aber es waere bei jedem Aufruf dieser
  // Funktion eine Anfrage je Ordner, und diese Funktion laeuft bei jedem
  // Blick auf den Firmenordner.
  if (neueRaeume.length > 0) {
    const { rows: kinder } = await db.query(
      `SELECT ${SPALTEN} FROM public.firmenordner_ordner o
        WHERE o.eltern_id = ANY($1::bigint[]) ORDER BY o.id`,
      [neueRaeume]
    );
    for (const ordner of kinder) {
      await mitDienst(`Ordner ${ordner.kennung} nachtragen`, () =>
        dienst.legeOrdnerAn(ordner.raum_id, ordner.kennung)
      );
    }
  }

  // 4. Offene Einladungen.
  const { rows: offeneRechte } = await db.query(
    `SELECT r.ordner_id, r.user_id, r.recht FROM public.firmenordner_rechte r
      WHERE r.abgleich_offen IS NOT NULL ORDER BY r.ordner_id, r.user_id`
  );
  for (const zeile of offeneRechte) {
    const ordner = await holeOrdner(zeile.ordner_id);
    const nutzer = await holeNutzer(zeile.user_id);
    await spiegleRecht({ ordner, nutzer, recht: zeile.recht });
    bericht.rechte += 1;
  }

  // 5. Die Wurzel: jeder aktive Mensch liest, Administratoren schreiben.
  bericht.wurzel = await spiegleWurzelMitglieder();

  return bericht;
}

// ---------------------------------------------------------------------------
// Die Sicht eines Menschen und die Aenderungen eines Ordners
// ---------------------------------------------------------------------------

/**
 * Was zuletzt in einem Ordner geschah -- wer wann, aus dem Protokoll des
 * Dienstes.
 *
 * Fuer einen Raum (Ebene 0 und 1) ist die Kennung des Elements die des Raums,
 * fuer einen Ordner darin (Ebene 2) die des Ordners. Ein Ordner ohne Raum
 * (angelegt, waehrend der Dienst stand) hat kein Protokoll: leere Liste.
 */
async function aenderungenVon(ordnerId) {
  const ordner = await holeOrdner(ordnerId);
  if (!dienst.istAn() || !ordner.raum_id) {
    return { ordner: ordner.kennung, aenderungen: [] };
  }
  const itemId =
    ordner.ebene === 2 ? await dienst.ordnerKennung(ordner.raum_id, ordner.pfad) : ordner.raum_id;
  const aenderungen = await dienst.aenderungen(itemId);
  return { ordner: ordner.kennung, aenderungen };
}

/** Hoechstens so viele Zeilen je Abschnitt, damit die Sicht EINE Seite bleibt. */
const SICHT_ZEILEN = { ordner: 25, apps: 10, orte: 10 };

/**
 * Die Orte aus `.claude/places.json` der Wurzel, gelesen ueber den Dienst.
 *
 * Die Form ist die des CLI der Wurzel (`arasul.mjs`): `{ places: [{ name,
 * description?, local?, write? }] }`. Was nicht so aussieht, wird
 * uebergangen -- die Sicht ist eine Auskunft, kein Pruefskript.
 */
async function orteAusWurzel(wurzel) {
  if (!wurzel?.raum_id || !dienst.istAn()) {
    return [];
  }
  let text = null;
  await mitDienst('places.json der Wurzel lesen', async () => {
    text = await dienst.leseDatei(wurzel.raum_id, '.claude/places.json');
  });
  if (!text) {
    return [];
  }
  let daten;
  try {
    daten = JSON.parse(text);
  } catch {
    return [];
  }
  const liste = Array.isArray(daten) ? daten : Array.isArray(daten?.places) ? daten.places : [];
  return liste
    .filter(o => o && typeof o === 'object' && typeof o.name === 'string' && o.name.trim())
    .map(o => ({
      name: o.name.trim().slice(0, 60),
      beschreibung: typeof o.description === 'string' ? o.description.trim().slice(0, 120) : '',
      schreiben: o.write === true,
    }));
}

/** Eine Liste auf ihre Zeilenzahl kuerzen und den Rest zaehlen. */
function gekuerzt(zeilen, grenze) {
  if (zeilen.length <= grenze) {
    return zeilen;
  }
  return [...zeilen.slice(0, grenze), `- … und ${zeilen.length - grenze} weitere`];
}

/**
 * `sicht.md` fuer einen Menschen: seine Ordner mit Stufe, seine Apps mit dem
 * Verweis auf ihre `APP.md`, die Orte der Wurzel. Regel 3 des Zielbildes --
 * „Was es gibt, steht in sicht.md, je Mitarbeiter vom Geraet erzeugt aus
 * seinen Rechten. Hoechstens eine Bildschirmseite. Niemand pflegt Kontext je
 * Rolle von Hand."
 *
 * SIE NENNT NICHTS, WAS ER NICHT HAT. Die Ordner kommen aus `meineOrdner`
 * (nur seine Rechte, nie „am Geraet"), die Apps aus `appsFuerNutzer` (nur
 * seine Freigaben). Ein fremder Ordner steht hier so wenig wie in der
 * Antwort von `GET /api/firmenordner` -- auch sein Name nicht.
 *
 * `apps` wird hier lazy geholt, nicht oben: `appStore` zieht Docker und die
 * Manifeste mit, und diese Datei soll auf einem Geraet ohne Firmenordner
 * nichts davon laden.
 */
async function sichtFuer({ benutzerId, username, rolle }) {
  const ordner = await meineOrdner(benutzerId, rolle);
  const wurzel = ordner.find(o => o.art === ART_WURZEL) || null;
  const appStore = require('../app/appStore');
  const apps = await appStore.appsFuerNutzer(benutzerId);
  const orte = await orteAusWurzel(wurzel ? await holeWurzel() : null);
  const heute = new Date().toISOString().slice(0, 10);

  const ordnerZeilen = ordner.map(o => {
    const weg = o.art === ART_WURZEL ? `/ (Wurzel „${o.kennung}")` : `${o.pfad}/`;
    return `- \`${weg}\`: ${o.recht} — ${o.name}`;
  });
  const appZeilen = apps.map(
    a => `- ${a.id} (${a.name}) — \`apps/${a.id}/APP.md\`${a.test ? ' · auch der Teststand' : ''}`
  );
  const orteZeilen = orte.map(
    o =>
      `- ${o.name}${o.beschreibung ? ` — ${o.beschreibung}` : ''} · ${
        o.schreiben ? 'darf ändern' : 'nur lesen'
      }`
  );

  const zeilen = [
    `# Sicht von ${username}`,
    '',
    `Erzeugt vom Gerät am ${heute} aus deinen Rechten und Freigaben. Nicht bearbeiten: ` +
      'der nächste Abgleich schreibt sie neu. Was hier nicht steht, gibt es für dich nicht.',
    '',
    '## Deine Ordner',
    ...(ordnerZeilen.length
      ? gekuerzt(ordnerZeilen, SICHT_ZEILEN.ordner)
      : ['- keine. Bitte den Administrator um ein Recht auf einen Ordner.']),
    '',
    '## Deine Apps',
    ...(appZeilen.length ? gekuerzt(appZeilen, SICHT_ZEILEN.apps) : ['- keine freigegeben']),
    '',
    '## Orte außerhalb',
    ...(orteZeilen.length
      ? gekuerzt(orteZeilen, SICHT_ZEILEN.orte)
      : ['- keine in `.claude/places.json` der Wurzel genannt']),
    '',
  ];
  return zeilen.join('\n');
}

/**
 * Der Zustand, wie die Oberflaeche und die Abnahme ihn brauchen.
 *
 * ER SAGT AUCH „AUS", und das ist der wichtigere Teil. Ein Geraet ohne
 * Firmenordner ist nicht kaputt -- es hat keinen. Die Antwort unterscheidet
 * beides: `an: false` heisst „gibt es hier nicht", `erreichbar: false` heisst
 * „gibt es, antwortet aber nicht".
 */
async function zustand() {
  const grund = await dienst.zustand();
  const { rows } = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM public.firmenordner_ordner)::int AS ordner,
       (SELECT COUNT(*) FROM public.firmenordner_ordner WHERE art = 'am_geraet')::int AS am_geraet,
       (SELECT COUNT(*) FROM public.firmenordner_nutzer)::int AS nutzer,
       (SELECT COUNT(*) FROM public.firmenordner_nutzer WHERE abgleich_offen IS NOT NULL)::int
         AS nutzer_offen,
       (SELECT COUNT(*) FROM public.firmenordner_rechte)::int AS rechte,
       (SELECT COUNT(*) FROM public.firmenordner_rechte WHERE abgleich_offen IS NOT NULL)::int
         AS rechte_offen,
       (SELECT kennung FROM public.firmenordner_ordner WHERE art = 'wurzel' LIMIT 1) AS wurzel`
  );
  return { ...grund, adresse: dienst.basisAussen(), ...rows[0] };
}

module.exports = {
  RECHTE,
  ART_WURZEL,
  /** Gibt es auf diesem Geraet einen Firmenordner? Die Frage der Aufrufer. */
  istAn: dienst.istAn,
  /**
   * Wie lange das Wegwerfen dauern darf. Steht im Dienst daneben und wird hier
   * nur weitergereicht: die Route braucht dieselbe Zahl fuer die Frist ihrer
   * eigenen Antwort, und zwei Zahlen fuer dieselbe Geduld laufen auseinander.
   */
  ZEITGRENZE_LOESCHEN_MS: dienst.ZEITGRENZE_LOESCHEN_MS,
  listeOrdner,
  holeOrdner,
  holeWurzel,
  listeRechte,
  meineOrdner,
  aenderungenVon,
  sichtFuer,
  spiegleWurzelMitglieder,
  legeOrdnerAn,
  loescheOrdner,
  gibRecht,
  nimmRechtZurueck,
  spiegleNutzer,
  spiegleAktiv,
  spiegleLoeschung,
  holeNach,
  zustand,
};
