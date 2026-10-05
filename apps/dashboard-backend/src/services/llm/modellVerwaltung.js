/**
 * Die Verwaltung der Modelle (M5, 04.10.2026, Auftrag verwaltung-modelle).
 *
 * Eine Zeile je Modell am Geraet: Name, Groesse, Faehigkeiten, warm (liegt es
 * gerade im Speicher) und die Flows, die es nutzen. Dazu die Sperre: ein Modell,
 * das ein Flow nutzt oder das Standardmodell ist, laesst sich nicht entfernen.
 * Laden und Entladen von Hand gibt es nicht; das Geraet haelt ein Modell nach
 * Nutzung (`modelLifecycleService`) und laedt es bei Bedarf selbst.
 *
 * WER EIN MODELL NUTZT. Ein Flow nutzt jedes Modell, das er nennt (Kopf, Rolle,
 * Schritt), das der Admin je Schritt gewaehlt hat (`flow_schritt_modelle`,
 * Migration 205) und das er fuer den ganzen Flow gesetzt hat
 * (`flow_settings.modell`, gewinnt in `appFlows.lade` ueber den Kopf), ueber
 * alle Staende. Nennt ein Flow weder im Kopf noch in den Einstellungen eines,
 * rechnet er mit dem Standardmodell und nutzt dieses. Das ist absichtlich eine
 * Obermenge dessen, was ein Lauf gerade waehlt: gesperrt wird lieber ein
 * Modell zu viel als eines, das ein Flow morgen braucht.
 */

const db = require('../../database');
const modelService = require('./modelService');
const schrittModelle = require('../flows/schrittModelle');
const freiesModell = require('./freiesModell');
const { tagVarianten } = require('./modelSyncHelpers');
const { ConflictError } = require('../../utils/errors');

/**
 * Welche Flows welches installierte Modell nutzen.
 * @param {Array<{id:string, ollama_name:string}>} modelle installierte Modelle
 * @param {string|null} standardId
 * @returns {Promise<Map<string, Array<{app_id:string, app_name:string, flow:string}>>>}
 */
async function nutzung(modelle, standardId) {
  const { rows: flows } = await db.query(
    `SELECT f.app_id, a.name AS app_name, f.name, f.definition
       FROM public.app_flows f
       JOIN public.apps a ON a.id = f.app_id
      ORDER BY f.app_id, f.name`
  );
  const { rows: wahlen } = await db.query(
    'SELECT app_id, flow_name, modell FROM public.flow_schritt_modelle'
  );
  const { rows: einstellungen } = await db.query(
    'SELECT app_id, flow_name, modell FROM public.flow_settings WHERE modell IS NOT NULL'
  );

  const proFlow = new Map();
  for (const z of flows) {
    const schluessel = `${z.app_id}\u0000${z.name}`;
    const e = proFlow.get(schluessel) || {
      app_id: z.app_id,
      app_name: z.app_name,
      flow: z.name,
      namen: new Set(),
      kopfModell: false,
    };
    const d = z.definition || {};
    if (d.modell) {
      e.kopfModell = true;
      e.namen.add(d.modell);
    }
    for (const r of d.rollen || []) {
      if (r.modell) {
        e.namen.add(r.modell);
      }
    }
    for (const s of d.schritte || []) {
      if (s.modell) {
        e.namen.add(s.modell);
      }
    }
    proFlow.set(schluessel, e);
  }
  for (const w of wahlen) {
    const e = proFlow.get(`${w.app_id}\u0000${w.flow_name}`);
    if (e) {
      e.namen.add(w.modell);
    }
  }
  for (const w of einstellungen) {
    const e = proFlow.get(`${w.app_id}\u0000${w.flow_name}`);
    if (e) {
      // Die Wahl des Admins ersetzt das Modell des Kopfes: der Flow rechnet
      // dann nicht mit dem Standardmodell.
      e.kopfModell = true;
      e.namen.add(w.modell);
    }
  }

  const aus = new Map();
  const merke = (id, e) => {
    const liste = aus.get(id) || [];
    if (!liste.some(x => x.app_id === e.app_id && x.flow === e.flow)) {
      liste.push({ app_id: e.app_id, app_name: e.app_name, flow: e.flow });
    }
    aus.set(id, liste);
  };
  for (const e of proFlow.values()) {
    for (const name of e.namen) {
      const m = modelle.find(x => tagVarianten(name).some(v => v === x.id || v === x.ollama_name));
      if (m) {
        merke(m.id, e);
      }
    }
    if (!e.kopfModell && standardId) {
      merke(standardId, e);
    }
  }
  return aus;
}

/** Der Satz, der sagt, warum ein Modell nicht entfernt werden kann; sonst null. */
function sperrGrund({ name, istStandard, flows }) {
  if (flows.length > 0) {
    const nenner = flows.map(f => `„${f.flow}" (${f.app_name})`).join(', ');
    return `„${name}" lässt sich nicht entfernen, solange ${flows.length === 1 ? 'ein Flow es nutzt' : 'Flows es nutzen'}: ${nenner}. Bitte erst die Flows auf ein anderes Modell umstellen.`;
  }
  if (istStandard) {
    return `„${name}" ist das Standardmodell und lässt sich nicht entfernen. Bitte zuerst ein anderes Modell als Standard setzen.`;
  }
  return null;
}

/**
 * Was die Ansicht braucht: je installiertem Modell Faehigkeiten, warm, nutzende
 * Flows und Sperre; dazu die geprueften Modelle der Liste, die noch nicht am
 * Geraet liegen, mit dem Ergebnis der Vorpruefung (Speicher und Platte).
 */
async function uebersicht() {
  const [installiert, standardId, geladen] = await Promise.all([
    schrittModelle.installierte(),
    modelService.getDefaultModel().catch(() => null),
    modelService.getLoadedModels(),
  ]);
  const { rows: meta } = await db.query(
    `SELECT c.id, c.size_bytes, c.description, c.jetson_tested, c.frei_geladen, c.task
       FROM llm_model_catalog c`
  );
  const metaVon = new Map(meta.map(m => [m.id, m]));
  const wo = await nutzung(installiert, standardId);

  const modelle = installiert.map(m => {
    const k = metaVon.get(m.id) || {};
    const flows = wo.get(m.id) || [];
    const istStandard = m.id === standardId;
    return {
      id: m.id,
      name: m.name,
      groesse_bytes: k.size_bytes ? Number(k.size_bytes) : null,
      faehigkeiten: m.faehigkeiten,
      warm: geladen.some(g => tagVarianten(m.ollama_name).includes(g.model_id)),
      ist_standard: istStandard,
      ungemessen: k.jetson_tested === false,
      flows,
      sperre: sperrGrund({ name: m.name, istStandard, flows }),
    };
  });

  const { rows: offen } = await db.query(
    `SELECT c.id, c.name, c.description, c.size_bytes, c.task, COALESCE(i.status, '') AS status
       FROM llm_model_catalog c
       LEFT JOIN llm_installed_models i ON i.id = c.id
      WHERE COALESCE(c.frei_geladen, false) = false
        AND c.model_type <> 'ocr'
        AND COALESCE(i.status, '') <> 'available'
      ORDER BY c.performance_tier, c.ram_required_gb`
  );
  const liste = [];
  for (const z of offen) {
    // Was gerade geladen wird, hat die Pruefung schon bestanden; mitten im
    // Laden wuerde sie die halbe Platte als voll melden.
    const pruefung =
      z.status === 'downloading' ? null : await freiesModell.pruefe(z.id).catch(() => null);
    liste.push({
      id: z.id,
      name: z.name,
      beschreibung: z.description,
      groesse_bytes: z.size_bytes ? Number(z.size_bytes) : null,
      laedt: z.status === 'downloading',
      passt: pruefung ? pruefung.passt : null,
      grund: pruefung?.grund ?? null,
    });
  }
  return { standard: standardId, modelle, liste };
}

/**
 * Wirft 409, wenn das Modell nicht entfernt werden darf. Steht hier und nicht
 * in der Route, weil auch die LRU-Raeumung (`evictModelsIfNeeded`) ueber
 * `modelService.deleteModel` laeuft und kein genutztes Modell wegraeumen darf.
 */
async function entfernenPruefen(modelId) {
  const installiert = await schrittModelle.installierte();
  const m = installiert.find(x => x.id === modelId);
  if (!m) {
    return;
  }
  const standardId = await modelService.getDefaultModel().catch(() => null);
  const flows = (await nutzung(installiert, standardId)).get(modelId) || [];
  const grund = sperrGrund({ name: m.name, istStandard: modelId === standardId, flows });
  if (grund) {
    throw new ConflictError(grund, { grund: 'IN_NUTZUNG', flows });
  }
}

module.exports = { uebersicht, entfernenPruefen, nutzung, sperrGrund };
