/**
 * Modell und Faehigkeiten je Schritt (M5, 04.10.2026, Auftrag modell-je-schritt).
 *
 * Der Entwickler nennt im Flow-Kopf je Schritt, welches Modell er meint
 * (`modell` am Schritt oder an der Rolle) und was der Schritt braucht
 * (`faehigkeiten`, Kontrakt 8). Der Admin kennt sein Geraet und darf einen
 * Schritt auf ein anderes Modell umstellen -- aber nur auf eines, das am Geraet
 * liegt und ALLE genannten Faehigkeiten erfuellt. Prompts aendert er nicht;
 * hier steht nur das Modell.
 *
 * WER ENTSCHEIDET WAS
 *
 *   Original    was der Entwickler nennt: `schritt.modell`, sonst `rolle.modell`.
 *               Nennt er keines, laeuft der Schritt mit dem Modell des Flows.
 *   Wahl        was der Admin umgestellt hat (`flow_schritt_modelle`, ohne
 *               Stand, ueberlebt ein App-Update).
 *   Es gilt     die Wahl, wenn sie noch passt; sonst das Original, wenn es am
 *               Geraet liegt; sonst das Standardmodell -- und DAS wird vermerkt:
 *               im Lauf (ein Schritt der Art `hinweis`) und beim Admin (App-Seite
 *               und Startseite).
 *
 * WOHER DIE FAEHIGKEITEN DER MODELLE KOMMEN: aus dem Modellkatalog, siehe
 * Migration 205. Was der Katalog nicht weiss, schliesst aus.
 *
 * LADEN UND ENTLADEN regelt das Geraet selbst nach Nutzung (`modelLifecycle-
 * Service`); dieses Modul laedt und entlaedt nichts.
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const modelService = require('../llm/modelService');
const { ValidationError, NotFoundError } = require('../../utils/errors');

/** Die Spalten, aus denen die Faehigkeiten eines Modells entstehen. */
const MODELL_SQL = `
  SELECT i.id,
         c.name,
         COALESCE(c.ollama_name, i.id)            AS ollama_name,
         c.model_type,
         c.task,
         COALESCE(c.supports_vision_input, false) AS bild,
         COALESCE(c.supports_tools, false)        AS werkzeuge,
         c.context_window,
         i.is_default
    FROM llm_installed_models i
    LEFT JOIN llm_model_catalog c ON c.id = i.id
   WHERE i.status = 'available'`;

/**
 * Was ein Modell kann, aus einer Zeile des Katalogs.
 *
 *   text   es beantwortet einen Prompt: Aufgabe `text`/`coding` oder keine, und
 *          kein Einbettungsmodell. Dieselbe Regel wie fuer das Standardmodell
 *          (`modelService.getDefaultModel`): ein reines Bildmodell fuehrt keinen
 *          Flow-Schritt mit Auftrag und Werkzeugen.
 *   bild   `supports_vision_input`
 *   werkzeuge  `supports_tools`
 *   kontext    `context_window` in Tokens, oder null (unbekannt)
 */
function faehigkeitenVon(zeile) {
  const aufgabeOk = zeile.task == null || zeile.task === 'text' || zeile.task === 'coding';
  return {
    text: aufgabeOk && zeile.model_type !== 'embedding',
    bild: zeile.bild === true,
    werkzeuge: zeile.werkzeuge === true,
    kontext: zeile.context_window ? Number(zeile.context_window) : null,
  };
}

/**
 * Was dem Modell fuer diesen Schritt fehlt, als Liste von Woertern -- leer,
 * wenn es alle Faehigkeiten erfuellt. `false` und fehlen sind dasselbe
 * (Schema `SchrittFaehigkeiten`). Ein unbekannter Kontext erfuellt keinen
 * Mindestkontext.
 */
function fehlendes(forderung, faehigkeiten) {
  const f = forderung || {};
  const fehlt = [];
  if (f.text === true && !faehigkeiten.text) {
    fehlt.push('Text');
  }
  if (f.bild === true && !faehigkeiten.bild) {
    fehlt.push('Bild');
  }
  if (f.werkzeuge === true && !faehigkeiten.werkzeuge) {
    fehlt.push('Werkzeuge');
  }
  if (f.mindestkontext && !(faehigkeiten.kontext && faehigkeiten.kontext >= f.mindestkontext)) {
    fehlt.push(`Kontext ab ${f.mindestkontext}`);
  }
  return fehlt;
}

/** Die Modelle, die am Geraet liegen, mit ihren Faehigkeiten. */
async function installierte() {
  const { rows } = await db.query(`${MODELL_SQL} ORDER BY i.id`);
  return rows.map(z => ({
    id: z.id,
    name: z.name || z.id,
    ollama_name: z.ollama_name,
    ist_standard: z.is_default === true,
    faehigkeiten: faehigkeitenVon(z),
  }));
}

/**
 * Das Standardmodell des Geraets, wie ein Flow es bekommt, wenn er keines nennt
 * (`modelService.getDefaultModel`): ein ausdruecklich gesetzter Standard, sonst
 * der der Aufgabe `text`. Nicht nur `is_default`: am Orin ist keine Zeile so
 * gesetzt, und der Standard ist trotzdem das Qwen aus der Kurzliste.
 */
async function standardKennung(modelle) {
  try {
    const id = await modelService.getDefaultModel();
    return finde(modelle, id)?.id ?? id ?? null;
  } catch (err) {
    logger.warn(`Modell je Schritt: Standardmodell nicht lesbar: ${err.message}`);
    return null;
  }
}

/** Das installierte Modell zu einem Namen aus dem Paket (Kennung oder Ollama-Name). */
function finde(modelle, name) {
  if (!name) {
    return null;
  }
  return modelle.find(m => m.id === name || m.ollama_name === name) || null;
}

/**
 * Die Forderung eines Schritts ueber mehrere Staende: wer in einem Stand Bild
 * braucht, braucht es fuer die Wahl auch -- die Wahl gilt dem Flow, nicht dem
 * Stand.
 */
function vereinige(forderungen) {
  const aus = {};
  for (const f of forderungen) {
    if (!f) {
      continue;
    }
    for (const k of ['text', 'bild', 'werkzeuge']) {
      if (f[k] === true) {
        aus[k] = true;
      }
    }
    if (f.mindestkontext) {
      aus.mindestkontext = Math.max(aus.mindestkontext || 0, f.mindestkontext);
    }
  }
  return aus;
}

/** Das Modell, das der Entwickler fuer diesen Schritt nennt, oder null. */
function originalVon(definition, schritt) {
  if (schritt.modell) {
    return schritt.modell;
  }
  const rolle = (definition.rollen || []).find(r => r.name === schritt.rolle);
  return rolle?.modell || null;
}

/**
 * Wie ein Schritt laeuft: das Modell, das gilt, und warum.
 *
 *   herkunft  `gewaehlt`            der Admin hat umgestellt, es passt
 *          `paket`               das Modell des Entwicklers liegt am Geraet
 *          `standard`            der Entwickler nennt keines
 *          `standard_weil_fehlt` das genannte Modell fehlt am Geraet
 *          `standard_wahl_ungueltig`  die Wahl des Admins passt nicht mehr
 *                                (Modell entfernt oder Faehigkeit neu gefordert)
 *
 * `gilt` ist die Kennung, mit der der Schritt rechnet, oder `null`, wenn der
 * Schritt dem Modell des Flows folgt (`standard`).
 */
function entscheide({ original, wahl, forderung, modelle, standardId }) {
  const gewaehlt = finde(modelle, wahl);
  if (wahl) {
    if (gewaehlt && fehlendes(forderung, gewaehlt.faehigkeiten).length === 0) {
      return { gilt: gewaehlt.id, herkunft: 'gewaehlt' };
    }
    // Die Wahl hat ihre Grundlage verloren. Nicht still weiterlaufen lassen:
    // zurueck zum Original, wenn es da ist, sonst Standard, jedes Mal mit
    // Vermerk.
    const orig = finde(modelle, original);
    return orig
      ? { gilt: orig.id, herkunft: 'paket', wahl_ungueltig: true }
      : { gilt: standardId, herkunft: 'standard_wahl_ungueltig', wahl_ungueltig: true };
  }
  if (!original) {
    return { gilt: null, herkunft: 'standard' };
  }
  const orig = finde(modelle, original);
  return orig
    ? { gilt: orig.id, herkunft: 'paket' }
    : { gilt: standardId, herkunft: 'standard_weil_fehlt' };
}

/** Der eine Satz an den Admin zu einem Schritt, oder null, wenn alles passt. */
function hinweisFuer({ original, wahl, entscheidung, schritt }) {
  if (entscheidung.herkunft === 'standard_weil_fehlt') {
    return `Schritt „${schritt}": Das Modell „${original}" liegt nicht am Gerät, der Schritt läuft mit dem Standardmodell.`;
  }
  if (entscheidung.wahl_ungueltig) {
    return `Schritt „${schritt}": Das gewählte Modell „${wahl}" passt nicht mehr, der Schritt läuft mit ${
      entscheidung.herkunft === 'paket' ? `„${original}"` : 'dem Standardmodell'
    }.`;
  }
  return null;
}

/**
 * Alle Wahlen eines Flows als Map Schrittname -> Modell.
 */
async function wahlenFuer({ appId, flowName }) {
  const { rows } = await db.query(
    'SELECT schritt, modell FROM public.flow_schritt_modelle WHERE app_id = $1 AND flow_name = $2',
    [appId, flowName]
  );
  return new Map(rows.map(z => [z.schritt, z.modell]));
}

/**
 * Die Schritte eines Flows mit Modell, wie die App-Seite sie zeigt.
 *
 * @param {{appId:string, flowName:string, definitionen:Array<{stand:string, definition:object}>}} p
 *   die Flow-Definitionen aus den Staenden, in denen es den Flow gibt
 * @param {{modelle?:object[], standardId?:string|null}} [vorab] schon gelesene Modelle
 */
async function schritteVon({ appId, flowName, definitionen }, vorab = {}) {
  const modelle = vorab.modelle || (await installierte());
  const standardId = vorab.standardId ?? (await standardKennung(modelle));
  const wahlen = await wahlenFuer({ appId, flowName });

  // Je Schrittname alle Staende sammeln: dieselbe Wahl gilt fuer beide.
  const proName = new Map();
  for (const { stand, definition } of definitionen) {
    for (const s of definition.schritte || []) {
      if (s.typ !== 'subagent') {
        continue;
      }
      const eintrag = proName.get(s.name) || {
        stand: [],
        forderungen: [],
        originale: [],
        rolle: s.rolle,
      };
      eintrag.stand.push(stand);
      eintrag.forderungen.push(s.faehigkeiten || null);
      eintrag.originale.push(originalVon(definition, s));
      proName.set(s.name, eintrag);
    }
  }

  const aus = [];
  for (const [name, e] of proName) {
    const forderung = vereinige(e.forderungen);
    // Nennen die Staende verschiedene Originale, gilt das des Teststands: er ist
    // die Fassung, die gleich live geht. Ohne Teststand das erste.
    const original =
      e.originale[e.stand.indexOf('test') >= 0 ? e.stand.indexOf('test') : 0] || null;
    const wahl = wahlen.get(name) || null;
    const entscheidung = entscheide({ original, wahl, forderung, modelle, standardId });
    aus.push({
      name,
      rolle: e.rolle || null,
      staende: e.stand,
      faehigkeiten: forderung,
      original,
      original_vorhanden: original ? Boolean(finde(modelle, original)) : null,
      gewaehlt: wahl,
      gilt: entscheidung.gilt || standardId,
      gilt_ist_standard: !entscheidung.gilt || entscheidung.gilt === standardId,
      herkunft: entscheidung.herkunft,
      hinweis: hinweisFuer({ original, wahl, entscheidung, schritt: name }),
      // Zur Wahl stehen nur installierte Modelle, die alle Faehigkeiten erfuellen.
      moegliche: modelle
        .filter(m => fehlendes(forderung, m.faehigkeiten).length === 0)
        .map(m => m.id),
    });
  }
  return aus;
}

/**
 * Der Plan fuer einen Lauf: je Schritt (subagent) das Modell, mit dem er
 * rechnet, und ein Vermerk, wenn dafuer vom Paket abgewichen wird, ohne dass der
 * Admin es so gewaehlt hat.
 *
 * @returns {Promise<Map<string,{modell:string|null, herkunft:string, vermerk:string|null}>>}
 *   `modell: null` heisst: der Schritt folgt dem Modell des Flows
 */
async function planFuerLauf({ appId, flowName, definition }) {
  const plan = new Map();
  const subagenten = (definition.schritte || []).filter(s => s.typ === 'subagent');
  if (!appId || subagenten.length === 0) {
    return plan;
  }
  try {
    const modelle = await installierte();
    const standardId = await standardKennung(modelle);
    const wahlen = await wahlenFuer({ appId, flowName });
    for (const s of subagenten) {
      const original = originalVon(definition, s);
      const wahl = wahlen.get(s.name) || null;
      const e = entscheide({
        original,
        wahl,
        forderung: s.faehigkeiten,
        modelle,
        standardId,
      });
      plan.set(s.name, {
        modell: e.gilt,
        herkunft: e.herkunft,
        original,
        vermerk: hinweisFuer({ original, wahl, entscheidung: e, schritt: s.name }),
      });
    }
  } catch (err) {
    // Der Plan ist eine Verfeinerung. Ohne ihn laeuft der Schritt wie bisher.
    logger.warn(`Modell je Schritt: Plan nicht lesbar, Lauf ohne: ${err.message}`);
    return new Map();
  }
  return plan;
}

/**
 * Die Wahl des Admins setzen oder zuruecknehmen (`modell: null`).
 *
 * Das Backend weist ein Modell ab, das nicht am Geraet liegt oder nicht alle
 * Faehigkeiten des Schritts erfuellt -- die Oberflaeche bietet es gar nicht erst
 * an, aber die Pruefung steht hier, nicht dort.
 *
 * @param {{appId:string, flowName:string, schritt:string, modell:string|null,
 *   forderung:object, durch:number|null}} p
 * @returns {Promise<{modell:string|null}>}
 */
async function setze({ appId, flowName, schritt, modell, forderung, durch = null }) {
  if (modell == null || modell === '') {
    await db.query(
      'DELETE FROM public.flow_schritt_modelle WHERE app_id = $1 AND flow_name = $2 AND schritt = $3',
      [appId, flowName, schritt]
    );
    logger.info(`Schritt-Modell zurückgenommen: ${appId}/${flowName}/${schritt}`);
    return { modell: null };
  }
  const modelle = await installierte();
  const treffer = finde(modelle, modell);
  if (!treffer) {
    throw new ValidationError(
      `Das Modell „${modell}" liegt nicht an diesem Gerät. Zur Wahl stehen nur installierte Modelle.`
    );
  }
  const fehlt = fehlendes(forderung, treffer.faehigkeiten);
  if (fehlt.length > 0) {
    throw new ValidationError(
      `Das Modell „${treffer.id}" erfüllt nicht alle Fähigkeiten des Schritts „${schritt}": es fehlt ${fehlt.join(', ')}.`
    );
  }
  await db.query(
    `INSERT INTO public.flow_schritt_modelle (app_id, flow_name, schritt, modell, geaendert_von)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (app_id, flow_name, schritt) DO UPDATE
        SET modell = EXCLUDED.modell, geaendert_am = NOW(), geaendert_von = EXCLUDED.geaendert_von`,
    [appId, flowName, schritt, treffer.id, durch]
  );
  logger.info(`Schritt-Modell gesetzt: ${appId}/${flowName}/${schritt} -> ${treffer.id}`);
  return { modell: treffer.id };
}

/** Die Definitionen aller Flows einer App, je Flow die Staende, in denen es ihn gibt. */
async function definitionenDerApp(appId) {
  const { rows } = await db.query(
    `SELECT name, stand, definition FROM public.app_flows WHERE app_id = $1 ORDER BY name, stand`,
    [appId]
  );
  const proFlow = new Map();
  for (const z of rows) {
    const liste = proFlow.get(z.name) || [];
    liste.push({ stand: z.stand, definition: z.definition });
    proFlow.set(z.name, liste);
  }
  return proFlow;
}

/**
 * Die App-Seite: je Flow mit Modell-Schritten die Schritte, dazu die Modelle am
 * Geraet mit ihren Faehigkeiten. Flows ohne Schritt mit Modell stehen nicht darin.
 */
async function uebersicht(appId) {
  const modelle = await installierte();
  const standardId = await standardKennung(modelle);
  for (const m of modelle) {
    m.ist_standard = m.id === standardId;
  }
  const flows = [];
  for (const [flowName, definitionen] of await definitionenDerApp(appId)) {
    const schritte = await schritteVon({ appId, flowName, definitionen }, { modelle, standardId });
    if (schritte.length > 0) {
      flows.push({ name: flowName, schritte });
    }
  }
  return { standard: standardId, modelle, flows };
}

/**
 * Die Wahl fuer einen Schritt setzen: die Forderung kommt aus den Definitionen
 * der Staende, nicht vom Aufrufer -- der Admin schickt nur das Modell.
 */
async function setzeFuerSchritt({ appId, flowName, schritt, modell, durch }) {
  const definitionen = (await definitionenDerApp(appId)).get(flowName);
  if (!definitionen) {
    throw new NotFoundError(`App ${appId} hat keinen Flow "${flowName}"`);
  }
  const betroffen = definitionen.flatMap(({ definition }) =>
    (definition.schritte || []).filter(s => s.name === schritt && s.typ === 'subagent')
  );
  if (betroffen.length === 0) {
    throw new NotFoundError(
      `Flow "${flowName}" hat keinen Schritt "${schritt}" mit Modell (nur Schritte der Art subagent rufen eines)`
    );
  }
  return setze({
    appId,
    flowName,
    schritt,
    modell,
    forderung: vereinige(betroffen.map(s => s.faehigkeiten || null)),
    durch,
  });
}

/**
 * Was der Admin wissen muss: Schritte, deren Modell fehlt oder deren Wahl nicht
 * mehr passt, ueber alle Apps. Ist alles gut, ist die Liste leer.
 */
async function hinweise() {
  const { rows: apps } = await db.query('SELECT id, name FROM public.apps ORDER BY id');
  const modelle = await installierte();
  const standardId = await standardKennung(modelle);
  const aus = [];
  for (const app of apps) {
    for (const [flowName, definitionen] of await definitionenDerApp(app.id)) {
      const schritte = await schritteVon(
        { appId: app.id, flowName, definitionen },
        { modelle, standardId }
      );
      for (const s of schritte) {
        if (!s.hinweis) {
          continue;
        }
        aus.push({
          app_id: app.id,
          app_name: app.name,
          flow: flowName,
          schritt: s.name,
          original: s.original,
          gewaehlt: s.gewaehlt,
          gilt: s.gilt,
          text: s.hinweis,
        });
      }
    }
  }
  return aus;
}

module.exports = {
  uebersicht,
  setzeFuerSchritt,
  hinweise,
  faehigkeitenVon,
  fehlendes,
  vereinige,
  originalVon,
  entscheide,
  installierte,
  schritteVon,
  planFuerLauf,
  setze,
};
