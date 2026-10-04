/**
 * Ergebnis-Vertrag eines Subagenten (Plan 011, Schritt 11).
 *
 * DER zentrale Hebel, mit dem ein kleines lokales Modell wie ein großes wirkt
 * (§3): Ein Subagent liest Rohdaten — Seiteninhalte, Dateitexte — und arbeitet
 * sie ab. An den Orchestrator zurück geht aber NICHT das Rohmaterial, sondern
 * ausschließlich die im Flow deklarierten Felder, und die hart auf eine
 * Zeichenzahl gedeckelt. So bleibt der Kontext des Orchestrators klein, egal
 * wie viel der Subagent gelesen hat.
 *
 * Diese Datei ist reine Logik: Aus dem rohen Schluss-Text einer Rolle macht sie
 * das vertragskonforme, gekürzte Ergebnis. Sie trifft KEINE Modell-Aufrufe und
 * kennt weder Werkzeuge noch Läufe — damit ist die Kontext-Sperre an genau
 * einer, prüfbaren Stelle festgemacht.
 */

/**
 * Findet das äußerste JSON-Objekt in einem Text — auch wenn ein Modell noch
 * Prosa oder einen ```json-Zaun drumherum gesetzt hat. Klammer-zählend statt
 * per Regex, damit verschachtelte Objekte nicht zu früh abschneiden.
 *
 * @param {string} text
 * @returns {object|null}
 */
function extractJsonObject(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  if (start === -1) {
    return null;
  }
  let tiefe = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (c === '\\') {
        escaped = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
    } else if (c === '{') {
      tiefe += 1;
    } else if (c === '}') {
      tiefe -= 1;
      if (tiefe === 0) {
        try {
          return JSON.parse(s.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Setzt den Ergebnis-Vertrag durch.
 *
 * @param {string} rawText - Der rohe Schluss-Text der Rolle (idealerweise JSON).
 * @param {{felder:string[], max_zeichen:number}} vertrag
 * @returns {{felder:object, text:string, gekuerzt:boolean, json:boolean}}
 *   `felder` — nur die deklarierten Felder (fehlende leer, fremde verworfen).
 *   `text`   — die an den Orchestrator gehende, gedeckelte Darstellung.
 *   `gekuerzt` — wurde am Deckel geschnitten?
 *   `json`   — kam ein gültiges JSON-Objekt zurück (sonst Rückfall, s. u.)?
 *   `unsicher` — deklarierte Felder, die die Rolle als unsicher meldete.
 */
function enforceContract(rawText, vertrag) {
  const felder = Array.isArray(vertrag && vertrag.felder) ? vertrag.felder : [];
  const maxZeichen = (vertrag && vertrag.max_zeichen) || 2000;
  const obj = extractJsonObject(rawText);

  const felderObj = {};
  let json = false;
  // Eine Rolle, die etwas ERKENNT (Schritt mit `faehigkeiten.bild`), darf
  // zusaetzlich die Felder nennen, die sie nicht sicher lesen konnte. Das ist
  // kein deklariertes Feld und geht nicht an den Orchestrator, sondern nur an die
  // Art des Flows (M5); fremde Namen werden verworfen.
  let unsicher = [];

  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    json = true;
    if (Array.isArray(obj.unsicher)) {
      unsicher = obj.unsicher.map(String).filter(f => felder.includes(f));
    }
    // NUR die deklarierten Felder übernehmen — alles andere, was das Modell
    // zusätzlich zurückgibt, wird bewusst verworfen (der Vertrag ist die
    // Obergrenze dessen, was der Orchestrator sieht).
    for (const f of felder) {
      const v = obj[f];
      felderObj[f] = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
    }
  } else {
    // Kein gültiges JSON: Das Modell hat sich nicht an den Vertrag gehalten.
    // Rückfall, damit der Lauf trotzdem weitergeht: der ganze rohe Text ins
    // ERSTE Feld, die übrigen leer. Der Deckel unten schützt den Kontext auch
    // in diesem Fall.
    //
    // `felder.length > 0` ist heute durch das Schema garantiert (ResultContract
    // verlangt mindestens ein Feld). Die Prüfung bleibt trotzdem stehen, weil
    // enforceContract schema-unabhängig ist und anderswo ohne diese Garantie
    // wiederverwendet werden könnte — ohne sie ginge der rohe Text sonst
    // kommentarlos verloren.
    if (felder.length > 0) {
      felderObj[felder[0]] = String(rawText || '').trim();
      for (let i = 1; i < felder.length; i++) {
        felderObj[felder[i]] = '';
      }
    }
  }

  // Serialisieren und hart deckeln. Der Deckel gilt fürs GANZE Ergebnis, nicht
  // je Feld — genau das ist der Kontext-Schutz.
  let text = felder.map(f => `${f}: ${felderObj[f]}`).join('\n');
  let gekuerzt = false;
  if (text.length > maxZeichen) {
    text = `${text.slice(0, maxZeichen)}\n... [gekuerzt bei ${maxZeichen} Zeichen]`;
    gekuerzt = true;
  }

  return { felder: felderObj, text, gekuerzt, json, unsicher };
}

module.exports = { enforceContract, extractJsonObject };
