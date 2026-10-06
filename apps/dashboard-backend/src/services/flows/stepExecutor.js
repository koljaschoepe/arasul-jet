/**
 * Deterministischer Schritt-Executor (Plan 013, B7).
 *
 * Wenn ein Flow eine `schritte`-Kette deklariert, entscheidet NICHT mehr das
 * Orchestrator-Modell, wann es an welche Rolle delegiert — der Executor führt
 * die Schritte in FESTER Reihenfolge aus:
 *
 *   1. Für jeden Schritt die Vorlagen einsetzen ({{argument}} plus {{name}} für
 *      die Ausgaben früherer Schritte und {{vorher}}/{{iteration}} innerhalb
 *      einer Wiederholung).
 *   2. `subagent`-Schritt → an die deklarierte Rolle delegieren (dasselbe
 *      SubagentTool wie im modellgetriebenen Pfad: eigene Werkzeug-Schleife,
 *      Ergebnis-Vertrag, Protokoll-Schritt mit Rohdaten). Innerhalb des Schritts
 *      darf das Rollen-Modell iterieren.
 *   3. `werkzeug`-Schritt → EIN Werkzeug direkt aufrufen (kein Modell).
 *   4. Danach synthetisiert der Rumpf-Prompt die Antwort AUS den gesammelten
 *      Schritt-Ausgaben (ein letzter Modell-Aufruf, ohne Werkzeuge).
 *
 * Der Executor gibt dasselbe `{ result, error, aborted }` zurück wie
 * `runFlowLoop`, damit der Runner (runFlow.js) seinen Abschluss-Pfad unverändert
 * lässt. Die Schritt-Persistenz läuft über dieselben Hilfen wie der
 * modellgetriebene Pfad (`stepRecorder` im Kontext, `recordWerkzeug` als
 * Parameter) — die Lauf-Karte im Frontend zeigt beide Pfade identisch.
 */

const { fillPlaceholders } = require('./flowFile');
const { felderText } = require('./resultContract');
const { felderDerErkennung } = require('./freigabeAnfragen');
const { runFlowLoop } = require('./toolLoop');
const SubagentTool = require('./subagent');
const originalDienst = require('./original');
const runStore = require('./runStore');
const logger = require('../../utils/logger');

/** Obergrenze der Elemente einer `wiederhole_ueber`-Schleife (Notbremse). */
const MAX_MAP_ELEMENTE = 50;

/**
 * Liest eine Schritt-Ausgabe (oder ein Argument) als LISTE — die Quelle einer
 * `wiederhole_ueber`-Schleife. Zwei Formen, in dieser Reihenfolge:
 *
 *  1. JSON-Array (auch in Prosa/```json-Zaun eingebettet — Modelle liefern
 *     selten NUR das Array),
 *  2. sonst eine Zeile je Eintrag, Aufzählungszeichen/Nummerierung entfernt.
 *
 * @param {string} text
 * @returns {string[]}
 */
function parseListe(text) {
  const s = String(text || '').trim();
  if (!s) {
    return [];
  }
  const zuStrings = arr => arr.map(x => (typeof x === 'string' ? x : JSON.stringify(x)));
  const start = s.indexOf('[');
  const ende = s.lastIndexOf(']');
  if (start !== -1 && ende > start) {
    try {
      const arr = JSON.parse(s.slice(start, ende + 1));
      if (Array.isArray(arr) && arr.length > 0) {
        return zuStrings(arr);
      }
    } catch {
      // kein JSON — Zeilenform versuchen
    }
  }
  return s
    .split('\n')
    .map(z => z.replace(/^\s*(?:[-*+]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

/**
 * Setzt Vorlagen in den `parameter`-Werten eines Werkzeug-Schritts ein.
 *
 * Nur Zeichenketten werden ersetzt; Zahlen und Wahrheitswerte bleiben, wie sie
 * sind. Listen von Zeichenketten werden EINTRAGSWEISE ersetzt (Plan 023 I4):
 * `frage_nutzer` bekommt seine Optionen als Liste, und eine Option darf
 * denselben Platzhalter tragen wie die Frage darüber.
 */
function resolveParams(parameter = {}, scope = {}) {
  const out = {};
  for (const [key, value] of Object.entries(parameter)) {
    if (typeof value === 'string') {
      out[key] = fillPlaceholders(value, scope);
    } else if (Array.isArray(value)) {
      out[key] = value.map(v => (typeof v === 'string' ? fillPlaceholders(v, scope) : v));
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Bildet die Schritte eines ALTEN, fehlgeschlagenen Laufs auf die deklarierte
 * Schritt-Kette ab: welche Ketten-Schritte waren vollständig erfolgreich, und
 * mit welcher Ausgabe? („Ab Fehler wiederholen", 2026-07-29.)
 *
 * Grundlage sind die persistierten Schritte oberster Ebene (flow_run_steps mit
 * parent_step_id NULL) — der Executor schreibt sie deterministisch in
 * Ketten-Reihenfolge: je Ketten-Schritt `iterationen` Einträge, ein
 * subagent-Schritt als kind='subagent'/name=rolle, ein Werkzeug-Schritt als
 * kind='werkzeug'/name=werkzeug. Ein bereits übernommener Schritt (aus einer
 * früheren Wiederholung) steht als EIN Eintrag mit `input.uebernommen = true`,
 * unabhängig von `iterationen`.
 *
 * Die Abbildung ist bewusst STRENG: Passt Art oder Name nicht (z. B. weil die
 * Flow-Definition seit dem alten Lauf geändert wurde) oder ist ein Eintrag
 * nicht 'fertig', endet die Übernahme dort — ab da wird echt ausgeführt.
 * Lieber einen Schritt zu viel wiederholen als eine falsche Ausgabe einsetzen.
 *
 * @param {object[]} schritte - flow.schritte (deklarierte Kette).
 * @param {object[]} altSteps - Schritte des alten Laufs (aus runStore.getRun).
 * @returns {Map<number, string>} Schritt-Index → Ausgabe (der letzten Iteration).
 */
function berechneVorabErgebnisse(schritte = [], altSteps = []) {
  // Eine Freigabe, die das Geraet selbst angelegt hat (`automatisch`, M5:
  // unsichere Erkennung, Ergebnis bestaetigen), steht nicht in der Kette und
  // zaehlt hier nicht mit.
  const top = altSteps.filter(
    s =>
      s.parent_step_id == null &&
      (s.kind === 'werkzeug' || s.kind === 'subagent') &&
      !(s.input && s.input.automatisch === true)
  );
  const vorab = new Map();
  let cursor = 0;

  for (const [index, schritt] of schritte.entries()) {
    const kind = schritt.typ === 'subagent' ? 'subagent' : 'werkzeug';
    const name = schritt.typ === 'subagent' ? schritt.rolle : schritt.werkzeug;
    const passt = s => Boolean(s) && s.kind === kind && s.name === name && s.status === 'fertig';
    const istUebernommen = s => Boolean(s && s.input && s.input.uebernommen === true);

    // Fall 1: der Ketten-Schritt wurde im Altlauf selbst schon übernommen —
    // genau EIN Protokoll-Eintrag, egal wie viele Iterationen deklariert sind.
    const erster = top[cursor];
    if (passt(erster) && istUebernommen(erster)) {
      vorab.set(index, String(erster.output ?? ''));
      cursor += 1;
      continue;
    }

    // Listen-Schritte (wiederhole_ueber) haben eine DYNAMISCHE Zahl von
    // Protokoll-Einträgen — auf die Kette abbilden lässt sich das nicht
    // verlässlich. Übernahme endet hier; ab diesem Schritt wird echt
    // ausgeführt (lieber wiederholen als falsch übernehmen).
    if (schritt.wiederhole_ueber) {
      break;
    }

    // Fall 2: echt ausgeführt — es müssen ALLE Iterationen fertig dastehen.
    const n = schritt.iterationen || 1;
    let letzte = null;
    let vollstaendig = true;
    for (let i = 0; i < n; i++) {
      const s = top[cursor + i];
      if (!passt(s) || istUebernommen(s)) {
        vollstaendig = false;
        break;
      }
      letzte = s;
    }
    if (!vollstaendig) {
      break; // erster nicht (voll) erfolgreicher Schritt — ab hier echt ausführen
    }
    cursor += n;
    vorab.set(index, String(letzte.output ?? ''));
  }

  return vorab;
}

/**
 * Was an einer Erkennung fehlt oder unsicher ist (M5).
 *
 * Fehlend ist ein deklariertes Feld ohne Wert, unsicher eines, das die Rolle in
 * `unsicher` nannte. Kam gar kein JSON zurueck, hat die Rolle den Vertrag nicht
 * eingehalten: dann gilt jedes Feld als unsicher.
 *
 * @param {{felder:Object<string,string>, json:boolean, unsicher:string[]}} erkannt
 * @returns {{fehlend:string[], unsicher:string[]}}
 */
function erkennungsBefund(erkannt) {
  const namen = Object.keys(erkannt.felder || {});
  if (!erkannt.json) {
    return { fehlend: [], unsicher: namen };
  }
  const fehlend = namen.filter(f => String(erkannt.felder[f] ?? '').trim() === '');
  const unsicher = (erkannt.unsicher || []).filter(f => !fehlend.includes(f));
  return { fehlend, unsicher };
}

/** Der Satz, der als Titel der Freigabe dasteht: „Erkennung unsicher: Feld X". */
function erkennungsTitel({ fehlend, unsicher }) {
  const alle = [...fehlend, ...unsicher];
  return `Erkennung unsicher: ${alle.length === 1 ? 'Feld' : 'Felder'} ${alle.join(', ')}`;
}

/**
 * Erkennt dieser Flow (M5)? Mindestens ein `subagent`-Schritt mit
 * `faehigkeiten.bild: true`. Dieselbe Regel wie im Kontrakt.
 */
function istErkennend(flow) {
  return (flow?.schritte || []).some(s => s.typ === 'subagent' && s.faehigkeiten?.bild === true);
}

/**
 * Ein kurzer Titel aus den erkannten Feldern (Kontrakt 14): die ersten drei
 * Werte in der Reihenfolge, in der die Rolle ihre Felder nennt, je hoechstens
 * 40 Zeichen. So steht auf der Karte „Deutsche Post, 4,95, 01.10.2026" statt
 * nur des Grundes. Null, wenn kein Feld einen Wert hat.
 */
function titelAusFeldern(felder = {}, reihenfolge = []) {
  const namen = [...reihenfolge, ...Object.keys(felder).filter(n => !reihenfolge.includes(n))];
  const werte = namen
    .map(n =>
      String(felder[n] ?? '')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean)
    .slice(0, 3)
    .map(w => (w.length > 40 ? `${w.slice(0, 39)}…` : w));
  return werte.length ? werte.join(', ').slice(0, 120) : null;
}

/** Der Titel einer Freigabe, wenn das Original nicht zu lesen war. */
const TITEL_OHNE_ORIGINAL = {
  fehlt: 'Original fehlt',
  zu_gross: 'Original zu groß',
  format: 'Original nicht lesbar',
  pdf: 'Original nicht lesbar',
  zugang: 'Original nicht abrufbar',
  kein_bildmodell: 'Kein Bildmodell am Gerät',
};

/**
 * Das Original eines erkennenden Schritts (Kontrakt 10), mit eingesetzten
 * Platzhaltern. Ein Wert, der nach dem Einsetzen kein Pfad relativ zur App mehr
 * ist (ein Argument brachte `..` oder ein Schema mit), faellt weg: die Freigabe
 * entsteht trotzdem, nur ohne Bild -- lieber das als ein Lauf, der an einer
 * Anzeige scheitert, oder ein Bild von anderswo.
 */
function originalPfad(vorlage, scope) {
  if (!vorlage) {
    return null;
  }
  const pfad = fillPlaceholders(vorlage, scope).trim();
  // `%`, `?` und `#` dazu: ein Browser liest `%2e%2e` als `..` und verliesse
  // damit die Adresse der App.
  if (!pfad || pfad.length > 500 || /^\/|:\/\/|\.\.|\\|\s|[%?#]/.test(pfad)) {
    logger.warn(`Original "${pfad.slice(0, 80)}" ist kein Pfad relativ zur App, ohne Bild weiter`);
    return null;
  }
  return pfad;
}

/**
 * Die Ausgabe eines erkennenden Schritts NACH seiner Freigabe (M5): die Felder,
 * wie der Mensch sie bestaetigt hat, in derselben Form, in der die Rolle sie
 * geliefert haette (`felderText`). Gelesen aus der Anfrage, damit es im Prozess
 * und nach einem Neustart dieselbe Quelle ist.
 *
 * @returns {Promise<string|null>} null, wenn es nichts einzusetzen gibt
 */
async function korrigierteAusgabe({ flow, schritt, runId, lesen }) {
  if (
    !schritt ||
    schritt.typ !== 'subagent' ||
    schritt.faehigkeiten?.bild !== true ||
    runId == null ||
    typeof lesen !== 'function'
  ) {
    return null;
  }
  const rolle = (flow.rollen || []).find(r => r.name === schritt.rolle);
  if (!rolle) {
    return null;
  }
  const nach = await lesen({ runId, schritt: schritt.name });
  if (!nach) {
    return null;
  }
  return felderText(nach.felder, rolle.ergebnis).text;
}

/**
 * Uebernommene Ausgaben (Fortsetzen nach einem Neustart, „Ab Fehler
 * wiederholen") mit den Korrekturen der Freigaben des Laufs `runId` versehen
 * (M5): im Protokoll des erkennenden Schritts steht der Vorschlag der KI, weiter
 * arbeitet der Lauf mit dem, was ein Mensch bestaetigt hat. Aendert `vorab`.
 */
async function korrigiereVorab({ flow, vorab, runId, lesen }) {
  if (!vorab || runId == null) {
    return vorab;
  }
  for (const index of [...vorab.keys()]) {
    const korrigiert = await korrigierteAusgabe({
      flow,
      schritt: (flow.schritte || [])[index],
      runId,
      lesen,
    });
    if (korrigiert != null) {
      vorab.set(index, korrigiert);
    }
  }
  return vorab;
}

/** Baut den Synthese-Block aus den gesammelten Schritt-Ausgaben. */
function buildSynthesisInput(userInput, schritte, outputs) {
  const bloecke = schritte.map(
    s => `## Schritt „${s.name}"\n${outputs[s.name] ?? '(keine Ausgabe)'}`
  );
  return `${userInput}\n\n--- Ergebnisse der Schritte (in Reihenfolge) ---\n${bloecke.join('\n\n')}`;
}

/**
 * Führt die deklarierte Schritt-Kette aus und synthetisiert die Antwort.
 *
 * @param {object} p
 * @param {object} p.flow - validierte Flow-Definition (mit `schritte`).
 * @param {object} p.werte - eingesetzte Argumentwerte (name → Wert).
 * @param {string} p.userInput - die zusammengebaute Nutzer-Eingabe.
 * @param {string} p.model - aufgelöstes Modell.
 * @param {object|null} [p.extern] - Zugang zu einem externen Modell (D4).
 * @param {object} p.context - der volle Runner-Kontext (rollen, limits, depth 0,
 *   stepRecorder, roleContextBase, …) — identisch zum modellgetriebenen Pfad.
 * @param {(names:string[])=>object[]} p.makeTools - buildTools.
 * @param {Function} [p.runLoop] - runFlowLoop (für Tests austauschbar).
 * @param {Function} p.recordWerkzeug - persistiert + führt einen Werkzeug-Schritt aus,
 *   liefert die Werkzeug-Ausgabe (String).
 * @param {(evt:object)=>void} [p.emitLive] - Live-Sink (roher onEvent des Laufs).
 * @param {AbortSignal} [p.signal]
 * @param {Map<number,string>} [p.vorabErgebnisse] - „Ab Fehler wiederholen":
 *   Schritt-Index → Ausgabe aus einem alten Lauf. Diese Schritte werden NICHT
 *   ausgeführt, ihre Ausgabe fließt unverändert ins Threading; im Protokoll
 *   stehen sie als übernommene Schritte mit Vermerk.
 * @param {number|null} [p.vorabQuelleLaufId] - Lauf-ID, aus der die
 *   übernommenen Ausgaben stammen (nur für den Vermerk).
 * @param {boolean} [p.fortsetzung] - Der Lauf setzt sich nach einer Freigabe
 *   FORT (M5): die übernommenen Schritte stehen schon im Protokoll DIESES
 *   Laufs, also schreibt der Executor keinen Übernahme-Vermerk noch einmal.
 * @param {Map<string,{modell:string|null,herkunft:string,vermerk:string|null}>} [p.schrittPlan] -
 *   Modell je Schritt (M5, `schrittModelle.planFuerLauf`): womit der Schritt
 *   rechnet. Ein `vermerk` (Modell fehlt am Gerät, Wahl passt nicht mehr) steht
 *   als Hinweis-Schritt im Lauf. Ohne Plan gilt wie bisher `schritt.modell`.
 * @param {new()=>object} [p.SubagentToolClass] - für Tests austauschbar.
 * @returns {Promise<{result:string|null, error?:string, aborted?:boolean}>}
 */
async function executeSteps({
  flow,
  werte,
  userInput,
  model,
  extern = null,
  context,
  makeTools,
  runLoop = runFlowLoop,
  recordWerkzeug,
  emitLive,
  signal,
  vorabErgebnisse = null,
  vorabQuelleLaufId = null,
  fortsetzung = false,
  schrittPlan = null,
  SubagentToolClass = SubagentTool,
  felderNachFreigabe = null,
  holeOriginal = originalDienst.hole,
  modellMitBild = originalDienst.modellMitBild,
  titelSetzen = runStore.titelSetzen,
}) {
  const subagentTool = new SubagentToolClass();
  const outputs = {};

  // Modell je Schritt (M5): weicht ein Schritt vom Paket ab, ohne dass der Admin
  // es so gewaehlt hat (das Modell fehlt am Geraet, die Wahl passt nicht mehr),
  // steht das als Hinweis VORN im Lauf -- einmal je Schritt, vor dem ersten
  // Modellaufruf. Eine Fortsetzung nach einer Freigabe schreibt ihn nicht noch
  // einmal: er steht schon im Protokoll dieses Laufs.
  if (schrittPlan && context?.stepRecorder && !fortsetzung) {
    for (const [name, geplant] of schrittPlan) {
      if (!geplant.vermerk) {
        continue;
      }
      try {
        const hinweis = await context.stepRecorder.beginnen({
          kind: 'hinweis',
          name: 'modell',
          input: {
            text: geplant.vermerk,
            schritt: name,
            original: geplant.original,
            modell: geplant.modell,
            herkunft: geplant.herkunft,
          },
          modell: geplant.modell,
        });
        await context.stepRecorder.abschliessen({ stepId: hinweis.id, output: geplant.vermerk });
      } catch (err) {
        logger.warn(`Flow-Schritt "${name}": Modell-Vermerk nicht gespeichert: ${err.message}`);
      }
    }
  }

  for (const [index, schritt] of flow.schritte.entries()) {
    if (signal && signal.aborted) {
      return { result: null, aborted: true };
    }

    // Übernommener Schritt (Wiederholung ab Fehler): nicht ausführen, die alte
    // Ausgabe ins Threading geben und den Schritt mit Vermerk protokollieren —
    // mit derselben Art/demselben Namen wie eine echte Ausführung, damit die
    // Lauf-Ansicht (und eine weitere Wiederholung) ihn genauso liest.
    if (vorabErgebnisse && vorabErgebnisse.has(index)) {
      const ausgabe = String(vorabErgebnisse.get(index) ?? '');
      outputs[schritt.name] = ausgabe;
      const recorder = context && context.stepRecorder;
      if (recorder && !fortsetzung) {
        try {
          const step = await recorder.beginnen({
            kind: schritt.typ === 'subagent' ? 'subagent' : 'werkzeug',
            name: (schritt.typ === 'subagent' ? schritt.rolle : schritt.werkzeug) || schritt.name,
            input: {
              hinweis:
                vorabQuelleLaufId != null
                  ? `(übernommen aus Lauf ${vorabQuelleLaufId})`
                  : '(übernommen aus früherem Lauf)',
              uebernommen: true,
            },
          });
          await recorder.abschliessen({ stepId: step.id, output: ausgabe });
        } catch (err) {
          // Das Mitschreiben darf die Wiederholung nicht kippen — die Ausgabe
          // ist ja da, nur der Protokoll-Eintrag fehlt dann.
          logger.warn(
            `Flow-Schritt "${schritt.name}": Übernahme-Vermerk nicht gespeichert: ${err.message}`
          );
        }
      }
      continue;
    }

    // Modell je Schritt (M5): womit dieser Schritt rechnet. Der Vermerk steht
    // schon vorn im Lauf (siehe oben); hier nur das Modell.
    const geplant = schritt.typ === 'subagent' ? schrittPlan?.get(schritt.name) : null;

    // Einen einzelnen Durchlauf ausführen (subagent oder werkzeug) — geteilt
    // zwischen Zähl-Iteration und Listen-Schleife. Ein Schritt-Modell
    // (schritt.modell) überschreibt das Flow-Modell für diese Delegation.
    const einDurchlauf = async scope => {
      if (schritt.typ === 'subagent') {
        const auftrag = fillPlaceholders(schritt.auftrag, scope);
        // Ein Schritt, der ein Bild liest (`faehigkeiten.bild`), ERKENNT. Seine
        // Felder kommen mit zurueck, damit bei fehlender oder unsicherer
        // Erkennung ein Mensch entscheidet -- in jeder Art des Flows (M5).
        const erkennt = schritt.faehigkeiten?.bild === true;
        const rolle = (flow.rollen || []).find(r => r.name === schritt.rolle);
        const original = erkennt ? originalPfad(schritt.original, scope) : null;
        const fortsetzungHier =
          !schritt.wiederhole_ueber && (schritt.iterationen || 1) === 1
            ? { schritt: index, name: schritt.name }
            : null;
        const stufeHier = flow.stufen?.length ? { stufe: flow.stufen[0].name } : {};
        // Wie `SubagentTool`: extern rechnet die Rolle, wenn der Flow extern
        // steht und sie kein eigenes Modell nennt.
        const rechnetExtern = Boolean(context?.extern) && !rolle?.modell;

        // Das Original (Kontrakt 14): nennt der Schritt eines, bekommt das
        // Modell es als Bild -- oder der Lauf haelt mit dem Grund an, warum
        // nicht. Ohne `original` (jedes Paket vor Kontrakt 14) bleibt es beim
        // Auftrag als Text, wie bisher.
        let bild = null;
        let ohneOriginal = null;
        if (erkennt && schritt.original) {
          try {
            if (!original) {
              throw originalDienst.originalFehler(
                'fehlt',
                'Der Pfad des Originals ist nach dem Einsetzen kein Pfad relativ zur App.'
              );
            }
            const geholt = await holeOriginal({ pfad: original, context });
            // Hat der Administrator den Flow auf ein externes Modell gestellt
            // (D4), geht das Bild dorthin mit: seine Entscheidung, nicht die des
            // Schritts. Sonst rechnet ein Modell des Geraets, das Bilder liest.
            const gewaehlt = rechnetExtern
              ? null
              : await modellMitBild(
                  geplant?.modell || schritt.modell || rolle?.modell || context.model
                );
            bild = { ...geholt, modell: gewaehlt?.modell ?? null };
          } catch (err) {
            if (!err.originalGrund) {
              throw err;
            }
            ohneOriginal = { grund: err.originalGrund, satz: err.message };
          }
        }

        if (ohneOriginal) {
          // Kein Modellaufruf: ohne Bild wuerde das Modell die Felder aus dem
          // Auftrag erfinden (Fremdtest 06.10.2026: „Fehlt Beleg"). Der Schritt
          // steht trotzdem im Protokoll, mit dem Grund -- die Wiederaufnahme
          // nach einem Neustart erwartet ihn dort.
          const namen = rolle?.ergebnis?.felder || [];
          const recorder = context?.stepRecorder;
          if (recorder) {
            try {
              const step = await recorder.beginnen({
                kind: 'subagent',
                name: schritt.rolle,
                input: { auftrag, original: { pfad: original, grund: ohneOriginal.grund } },
              });
              await recorder.abschliessen({
                stepId: step.id,
                output: `Kein Modellaufruf: ${ohneOriginal.satz}`,
              });
            } catch (err) {
              logger.warn(
                `Flow-Schritt "${schritt.name}": Schritt nicht gespeichert: ${err.message}`
              );
            }
          }
          await recordWerkzeug({
            werkzeug: 'freigabe_anfordern',
            params: {
              titel: TITEL_OHNE_ORIGINAL[ohneOriginal.grund] || 'Original nicht lesbar',
              zusammenhang:
                `Schritt „${schritt.name}" (Rolle ${schritt.rolle}): ${ohneOriginal.satz}\n\n` +
                'Das Modell hat nichts gelesen, die Felder sind leer. Tragen Sie ein, was ' +
                'Sie ändern dürfen, oder lehnen Sie ab.',
              ...stufeHier,
              automatisch: true,
            },
            fortsetzung: fortsetzungHier,
            erkennung: {
              felder: felderDerErkennung({
                felder: Object.fromEntries(namen.map(n => [n, ''])),
                fehlend: namen,
                unsicher: [],
                aenderbar: rolle?.ergebnis?.aenderbar || [],
              }),
              schritt: schritt.name,
              // Fehlt es, zeigt die Freigabe kein kaputtes Bild.
              original: ohneOriginal.grund === 'fehlt' ? null : original,
            },
          });
          const korrigiert = await korrigierteAusgabe({
            flow,
            schritt,
            runId: context?.runId,
            lesen: felderNachFreigabe,
          });
          return korrigiert ?? '';
        }

        let erkannt = null;
        // SubagentTool schreibt den DB-Schritt (samt Kind-Schritten und
        // Rohdaten) über context.stepRecorder selbst und meldet ihn live —
        // hier keine eigene Meldung, sonst stünde die Delegation doppelt.
        const antwort = await subagentTool.execute(
          {
            rolle: schritt.rolle,
            auftrag: bild ? `${auftrag}\n\n${originalDienst.hinweisFuerModell(bild)}` : auftrag,
          },
          {
            ...context,
            signal,
            model: bild?.modell || geplant?.modell || schritt.modell || context.model,
            // Ein Modell aus dem Plan gilt auch gegen `rolle.modell`: der Admin
            // hat den SCHRITT umgestellt, nicht die Rolle. Mit Bild ebenso: das
            // Modell ist oben schon auf Bildfaehigkeit geprueft.
            ...(geplant?.modell || bild?.modell ? { modellErzwungen: true } : {}),
            ...(erkennt ? { erkennend: true, onErgebnis: e => (erkannt = e) } : {}),
            // Lokal heisst lokal: `modellErzwungen` liesse die Rolle sonst den
            // externen Zugang des Flows nehmen, mit dem Namen eines Modells
            // dieses Geraets.
            ...(bild && !rechnetExtern ? { extern: null } : {}),
            ...(bild
              ? {
                  bilder: bild.bilder,
                  originalInfo: {
                    pfad: bild.pfad,
                    art: bild.art,
                    seiten: bild.seiten,
                    gesamt: bild.gesamt,
                    bytes: bild.bytes,
                    modell: bild.modell || 'extern',
                  },
                }
              : {}),
          }
        );
        if (erkennt) {
          // Kam keine Erkennung zurueck (die Rolle scheiterte), ist das kein
          // stiller Durchlauf: jedes Feld gilt als unsicher, ein Mensch sieht es.
          const namen = rolle?.ergebnis?.felder || [];
          const ergebnis = erkannt || {
            felder: Object.fromEntries(namen.map(n => [n, ''])),
            json: false,
            unsicher: [],
          };
          const befund = erkennungsBefund(ergebnis);
          // In der Art `ergebnis_bestaetigen` ist diese Freigabe DIE Bestaetigung
          // (Kontrakt 14): sie kommt immer, auch wenn alles sicher erkannt ist,
          // und traegt die Felder. Am Ende kommt keine zweite (`runFlow`).
          const immer = flow.art === 'ergebnis_bestaetigen';
          if (befund.fehlend.length + befund.unsicher.length > 0 || immer) {
            // Der Titel des Laufs (Kontrakt 14): was die App beim Start nannte,
            // sonst aus den erkannten Feldern. Er steht vorn an jeder Freigabe.
            if (context?.runId != null && ergebnis.json) {
              try {
                await titelSetzen({
                  runId: context.runId,
                  titel: titelAusFeldern(ergebnis.felder, namen),
                });
              } catch (err) {
                logger.warn(`Flow-Schritt "${schritt.name}": Titel nicht gesetzt: ${err.message}`);
              }
            }
            const unsicher = befund.fehlend.length + befund.unsicher.length > 0;
            await recordWerkzeug({
              werkzeug: 'freigabe_anfordern',
              params: {
                titel: unsicher
                  ? erkennungsTitel(befund)
                  : `Ergebnis bestätigen: ${context?.slug || schritt.name}`,
                zusammenhang:
                  `Schritt „${schritt.name}" (Rolle ${schritt.rolle}):\n${antwort}\n\n` +
                  (befund.fehlend.length ? `Nicht erkannt: ${befund.fehlend.join(', ')}\n` : '') +
                  (befund.unsicher.length ? `Unsicher: ${befund.unsicher.join(', ')}\n` : ''),
                ...stufeHier,
                automatisch: true,
              },
              fortsetzung: fortsetzungHier,
              // Die Felder fuer die Ansicht der Freigabe (M5): Vorschlag,
              // unsicher, fehlend, und was die App als aenderbar erklaert.
              erkennung: {
                felder: felderDerErkennung({
                  felder: ergebnis.felder,
                  fehlend: befund.fehlend,
                  unsicher: befund.unsicher,
                  aenderbar: rolle?.ergebnis?.aenderbar || [],
                }),
                schritt: schritt.name,
                original,
              },
            });
            // Bestaetigt: der weitere Lauf arbeitet mit dem, was der Mensch
            // bestaetigt hat, samt seinen Korrekturen.
            const korrigiert = await korrigierteAusgabe({
              flow,
              schritt,
              runId: context?.runId,
              lesen: felderNachFreigabe,
            });
            if (korrigiert != null) {
              return korrigiert;
            }
          }
        }
        return antwort;
      }
      const params = resolveParams(schritt.parameter, scope);
      // Wo der Lauf nach einem Neustart weitergeht, wenn dieser Schritt eine
      // Freigabe anfordert: nur ein einfacher Schritt der obersten Ebene --
      // keine Wiederholung, keine Liste. Dort liessen sich die Ausgaben der
      // schon gelaufenen Durchlaeufe nicht eindeutig zuordnen
      // (`berechneVorabErgebnisse`), und ein Schritt wuerde doppelt laufen.
      const fortsetzbar = !schritt.wiederhole_ueber && (schritt.iterationen || 1) === 1;
      return recordWerkzeug({
        werkzeug: schritt.werkzeug,
        params,
        fortsetzung: fortsetzbar ? { schritt: index, name: schritt.name } : null,
      });
    };

    let ausgabe = '';
    if (schritt.wiederhole_ueber) {
      // Listen-Schleife (Harness v2): der Schritt läuft einmal je Element der
      // referenzierten Liste — der Baustein für Sektion-für-Sektion-Pipelines.
      const quelle = { ...werte, ...outputs }[schritt.wiederhole_ueber];
      const elemente = parseListe(quelle);
      if (elemente.length === 0) {
        return {
          result: null,
          error: `Schritt „${schritt.name}": Liste "${schritt.wiederhole_ueber}" ist leer oder nicht lesbar.`,
        };
      }
      let gekuerztHinweis = '';
      if (elemente.length > MAX_MAP_ELEMENTE) {
        gekuerztHinweis =
          `\n\n[Hinweis: Liste "${schritt.wiederhole_ueber}" hatte ${elemente.length} Elemente, ` +
          `auf ${MAX_MAP_ELEMENTE} gekürzt, die übrigen wurden NICHT verarbeitet.]`;
        logger.warn(
          `Flow-Schritt "${schritt.name}": wiederhole_ueber-Liste von ${elemente.length} auf ${MAX_MAP_ELEMENTE} gekürzt`
        );
        elemente.length = MAX_MAP_ELEMENTE;
      }
      const teile = [];
      for (const [i, element] of elemente.entries()) {
        const scope = {
          ...werte,
          ...outputs,
          element,
          index: String(i + 1),
          anzahl: String(elemente.length),
          vorher: teile.length ? teile[teile.length - 1] : '',
          iteration: String(i + 1),
        };
        try {
          teile.push(await einDurchlauf(scope));
        } catch (err) {
          return {
            result: null,
            error: `Schritt „${schritt.name}" (Element ${i + 1}/${elemente.length}) fehlgeschlagen: ${err.message}`,
          };
        }
        if (signal && signal.aborted) {
          return { result: null, aborted: true };
        }
      }
      ausgabe = teile.join('\n\n') + gekuerztHinweis;
    } else {
      const iterationen = schritt.iterationen || 1;
      for (let i = 1; i <= iterationen; i++) {
        const scope = { ...werte, ...outputs, vorher: ausgabe, iteration: String(i) };
        try {
          ausgabe = await einDurchlauf(scope);
        } catch (err) {
          return {
            result: null,
            error: `Schritt „${schritt.name}" fehlgeschlagen: ${err.message}`,
          };
        }
        if (signal && signal.aborted) {
          return { result: null, aborted: true };
        }
      }
    }

    outputs[schritt.name] = ausgabe;
  }

  // Synthese: der Rumpf-Prompt schreibt die Antwort aus den Schritt-Ausgaben.
  // Bewusst OHNE Werkzeuge und mit einer Runde — das Sammeln ist deterministisch
  // schon geschehen, hier wird nur noch formuliert.
  const systemPrompt = fillPlaceholders(flow.systemPrompt, werte);
  const synthInput = buildSynthesisInput(userInput, flow.schritte, outputs);

  return runLoop({
    model,
    extern,
    systemPrompt,
    userInput: synthInput,
    tools: makeTools([]),
    maxRunden: 1,
    zeitlimitS: flow.grenzen.zeitlimit_s,
    context: { ...context, signal },
    signal,
    onEvent: emitLive,
  });
}

module.exports = {
  executeSteps,
  resolveParams,
  buildSynthesisInput,
  berechneVorabErgebnisse,
  parseListe,
  erkennungsBefund,
  erkennungsTitel,
  korrigierteAusgabe,
  korrigiereVorab,
  originalPfad,
  istErkennend,
  titelAusFeldern,
  MAX_MAP_ELEMENTE,
};
