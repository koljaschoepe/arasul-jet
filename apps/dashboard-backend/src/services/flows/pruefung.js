/**
 * Prüfschritt für Dokument-Flows (Plan 014, Phase 2).
 *
 * Verlässlichkeit kommt aus Prüfung, nicht aus Hoffnung: Zwischen Entwurf und
 * Ausgabe steht ein fester Prüfschritt —
 *
 *  1. DETERMINISTISCHE CHECKS (Code, kein Modell): Entwurf nicht leer, keine
 *     {{Platzhalter}}-Reste, keine unaufgelösten [offenen Stellen], die
 *     deklarierte Gliederung ist vorhanden, die Ziel-Wortzahl grob getroffen.
 *  2. LLM-PRÜFRUNDE: das Modell prüft den Entwurf gegen Auftrag und Vorgaben
 *     und benennt Probleme + stillschweigend getroffene Annahmen (JSON).
 *  3. HÖCHSTENS EINE KORREKTURRUNDE: nur wenn 1./2. Probleme fanden. Danach
 *     laufen die deterministischen Checks erneut — was dann noch offen ist,
 *     wird ehrlich protokolliert, nicht endlos nachgebessert.
 *
 * Statt Rückfragen gilt das ANNAHMEN-PROTOKOLL (Nutzer-Entscheidung §8):
 * Annahmen aus der Prüfrunde + verbliebene [offene Stellen] werden strukturiert
 * am Lauf gespeichert und im Ergebnis sichtbar gemacht — auch bei n8n-Starts.
 *
 * Jede Einzelprüfung erscheint im Laufprotokoll (Schritt „pruefung"); die
 * Korrekturrunde als eigener Modell-Schritt („korrektur"). Der Prüfschritt
 * wirft nie: scheitert die Prüfrunde selbst (Modell nicht erreichbar, kaputtes
 * JSON), läuft der Entwurf unverändert weiter und das Protokoll benennt das.
 */

const logger = require('../../utils/logger');

/** {{platzhalter}}-Reste — nicht ersetzte Vorlagen-Marker. */
const DOPPELT_RE = /\{\{\s*[^}]{1,80}\}\}/g;

/**
 * [Offene Stellen] — bewusst gesetzte Marker für fehlende Fakten.
 * Ausgenommen: Markdown-Links/Bilder/Fußnoten (`[text](url)`, `![alt](url)`,
 * `[^1]`), Referenz-Links samt Definition (`[text][ref]`, `[ref]: url`) und
 * Task-Listen (`[ ]`, `[x]`).
 */
const OFFEN_RE = /(!)?(?<!\])\[([^\]\n]{2,80})\](?!\(|\[|:)/g;

function sammleOffeneStellen(text) {
  const treffer = [];
  for (const m of String(text || '').matchAll(OFFEN_RE)) {
    if (m[1]) {
      continue;
    } // Bild
    const inhalt = (m[2] || '').trim();
    if (/^\^/.test(inhalt)) {
      continue;
    } // Fußnote
    if (/^[xX ]$/.test(inhalt)) {
      continue;
    } // Task-Liste
    treffer.push(inhalt);
  }
  return [...new Set(treffer)];
}

/**
 * Die deterministischen Einzel-Checks. Reine Funktion — Code rechnet, das
 * Modell wird hier nicht gefragt.
 * @returns {{name:string, ok:boolean, detail:string}[]}
 */
function deterministischeChecks(markdown, ausgabe = {}) {
  const text = String(markdown || '');
  const checks = [];

  checks.push({
    name: 'nicht_leer',
    ok: text.trim().length >= 20,
    detail: text.trim().length >= 20 ? '' : 'Der Entwurf ist leer oder fast leer',
  });

  const doppelt = [...new Set((text.match(DOPPELT_RE) || []).map(t => t.trim()))];
  checks.push({
    name: 'platzhalter',
    ok: doppelt.length === 0,
    detail: doppelt.length ? `Nicht ersetzte Platzhalter: ${doppelt.join(', ')}` : '',
  });

  const offen = sammleOffeneStellen(text);
  checks.push({
    name: 'offene_stellen',
    ok: offen.length === 0,
    detail: offen.length ? `Offene Stellen im Text: [${offen.join('], [')}]` : '',
  });

  if (Array.isArray(ausgabe.gliederung) && ausgabe.gliederung.length > 0) {
    const klein = text.toLowerCase();
    const fehlend = ausgabe.gliederung.filter(a => !klein.includes(String(a).toLowerCase()));
    checks.push({
      name: 'gliederung',
      ok: fehlend.length === 0,
      detail: fehlend.length ? `Fehlende Abschnitte: ${fehlend.join(', ')}` : '',
    });
  }

  if (ausgabe.laenge && Number.isFinite(ausgabe.laenge.wortzahl)) {
    const ziel = ausgabe.laenge.wortzahl;
    const woerter = text.split(/\s+/).filter(Boolean).length;
    const ok = woerter >= ziel * 0.5 && woerter <= ziel * 2.5;
    checks.push({
      name: 'wortzahl',
      ok,
      detail: ok ? '' : `${woerter} Wörter statt ~${ziel} (erlaubt: 50–250 %)`,
    });
  }

  return checks;
}

/** Checks als lesbare Protokoll-Zeilen (fürs Laufprotokoll). */
function checksAlsText(checks) {
  return checks
    .map(
      c =>
        `${c.ok ? '✓' : '✗'} ${CHECK_LABELS[c.name] || c.name}${c.detail ? ` — ${c.detail}` : ''}`
    )
    .join('\n');
}

const CHECK_LABELS = {
  nicht_leer: 'Entwurf vorhanden',
  platzhalter: 'Keine Platzhalter-Reste',
  offene_stellen: 'Keine offenen [Stellen]',
  gliederung: 'Gliederung vollständig',
  wortzahl: 'Länge im Zielbereich',
};

/** Die Ausgabe-Vorgaben als Klartext für die Prüfrunde. */
function vorgabenText(ausgabe = {}) {
  const teile = [];
  if (ausgabe.sprache) {
    teile.push(`Sprache: ${ausgabe.sprache}`);
  }
  if (ausgabe.tonalitaet) {
    teile.push(`Tonalität: ${ausgabe.tonalitaet}`);
  }
  if (ausgabe.laenge?.wortzahl) {
    teile.push(`Ziel-Länge: ~${ausgabe.laenge.wortzahl} Wörter`);
  } else if (ausgabe.laenge?.stufe) {
    teile.push(`Länge: ${ausgabe.laenge.stufe}`);
  }
  if (Array.isArray(ausgabe.gliederung) && ausgabe.gliederung.length) {
    teile.push(`Gliederung: ${ausgabe.gliederung.join(' → ')}`);
  }
  return teile.join('\n');
}

const PRUEF_PROMPT = `Du bist ein strenger Korrektor. Du prüfst einen Dokument-Entwurf gegen seinen Auftrag und seine Vorgaben.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in genau dieser Form, ohne Text davor oder danach:
{"bestanden": true, "probleme": [], "annahmen": []}

- "bestanden": false, sobald es mindestens ein Problem gibt.
- "probleme": konkrete Stellen, an denen der Entwurf den Auftrag oder die Vorgaben verfehlt (falsche Sprache, fehlende oder falsch benannte Abschnitte, erfundene Fakten, unpassender Ton). Kurze deutsche Sätze. Leer, wenn nichts zu beanstanden ist.
- "annahmen": Annahmen, die der Entwurf stillschweigend trifft — Aussagen, die weder im Auftrag noch in den Unterlagen belegt sind. Kurze deutsche Sätze. Leer, wenn keine.

Melde als Problem NUR, was sich aus Auftrag/Vorgaben ergibt. Stilfragen ohne Vorgabe sind kein Problem.`;

const KORREKTUR_PROMPT = `Du korrigierst einen Dokument-Entwurf anhand einer Mängelliste.

Regeln:
- Behebe ausschließlich die genannten Mängel; alles andere bleibt unverändert.
- Erfinde KEINE Fakten. Fehlt eine Information, lass die [eckige Markierung] stehen oder formuliere die Stelle als ausdrücklich offene Angabe.
- Ersetze übrig gebliebene {{Platzhalter}} nur, wenn sich der Wert eindeutig aus Auftrag oder Entwurf ergibt — sonst formuliere die Stelle ohne den Platzhalter als [offene Angabe].

Antworte AUSSCHLIESSLICH mit dem vollständigen, korrigierten Dokument — ohne Erklärungen davor oder danach.`;

/** Tolerantes JSON-Lesen einer Modell-Antwort. */
function parsePruefJson(text) {
  const roh = String(text || '').trim();
  const kandidaten = [roh];
  const klammer = roh.match(/\{[\s\S]*\}/);
  if (klammer) {
    kandidaten.push(klammer[0]);
  }
  for (const k of kandidaten) {
    try {
      const obj = JSON.parse(k);
      if (obj && typeof obj === 'object') {
        return {
          bestanden: obj.bestanden !== false,
          probleme: Array.isArray(obj.probleme) ? obj.probleme.map(String).slice(0, 20) : [],
          annahmen: Array.isArray(obj.annahmen) ? obj.annahmen.map(String).slice(0, 20) : [],
        };
      }
    } catch {
      /* nächster Kandidat */
    }
  }
  return null;
}

/**
 * Der komplette Prüfschritt: Checks → Prüfrunde → höchstens eine Korrektur.
 *
 * @param {object} p
 * @param {string} p.markdown - Der Entwurf (Ergebnis der Schleife/Schritt-Kette).
 * @param {object} p.flow - Die geladene Flow-Definition (ausgabe, grenzen, systemPrompt).
 * @param {string} p.userInput - Der Auftrag des Nutzers (eingesetzte Argumente).
 * @param {string} p.model - Modellname.
 * @param {object} p.context - Werkzeug-Kontext (für runLoop durchgereicht).
 * @param {AbortSignal} [p.signal]
 * @param {object} p.stepRecorder - beginnen/abschliessen (Laufprotokoll).
 * @param {Function} p.runLoop - Die Modell-Schleife (ohne Werkzeuge genutzt).
 * @returns {Promise<{text:string, annahmen:string[], korrigiert:boolean, checks:object[]}>}
 */
async function pruefeUndKorrigiere({
  markdown,
  flow,
  userInput,
  model,
  context,
  signal,
  stepRecorder,
  runLoop,
}) {
  const ausgabe = flow.ausgabe || {};
  let text = String(markdown || '');
  const annahmen = [];
  let korrigiert = false;

  const pruefStep = await stepRecorder.beginnen({
    kind: 'hinweis',
    name: 'pruefung',
    input: { text: 'Prüfung des Entwurfs (Checks + Prüfrunde)' },
  });

  // 1. Deterministische Checks.
  let checks = deterministischeChecks(text, ausgabe);

  // 2. LLM-Prüfrunde — scheitert sie, läuft der Entwurf unverändert weiter.
  let pruefung = null;
  try {
    const vorgaben = vorgabenText(ausgabe);
    const antwort = await runLoop({
      model,
      systemPrompt: PRUEF_PROMPT,
      userInput:
        `AUFTRAG:\n${userInput || '(kein gesonderter Auftrag)'}\n\n` +
        (vorgaben ? `VORGABEN:\n${vorgaben}\n\n` : '') +
        `ENTWURF:\n${text}`,
      tools: [],
      maxRunden: 1,
      zeitlimitS: flow.grenzen?.zeitlimit_s || 600,
      context,
      signal,
    });
    if (antwort.error || antwort.truncated || antwort.aborted) {
      throw new Error(antwort.error || 'Prüfrunde abgebrochen (Zeitlimit/Abbruch)');
    }
    pruefung = parsePruefJson(antwort.result);
    if (!pruefung) {
      logger.warn(`Prüfschritt: Prüfrunde lieferte kein auswertbares JSON — übersprungen`);
    }
  } catch (err) {
    logger.warn(`Prüfschritt: Prüfrunde fehlgeschlagen (${err.message}) — übersprungen`);
  }
  if (pruefung) {
    annahmen.push(...pruefung.annahmen);
  }

  const checkProbleme = checks.filter(c => !c.ok);
  const llmProbleme = pruefung && !pruefung.bestanden ? pruefung.probleme : [];
  const probleme = [...checkProbleme.map(c => c.detail || c.name), ...llmProbleme].filter(Boolean);

  // 3. Höchstens EINE Korrekturrunde.
  if (probleme.length > 0) {
    const korrekturStep = await stepRecorder.beginnen({
      kind: 'modell',
      name: 'korrektur',
      input: { probleme },
      modell: model,
    });
    try {
      const antwort = await runLoop({
        model,
        systemPrompt: KORREKTUR_PROMPT,
        userInput:
          `AUFTRAG:\n${userInput || '(kein gesonderter Auftrag)'}\n\n` +
          `MÄNGEL:\n- ${probleme.join('\n- ')}\n\n` +
          `ENTWURF:\n${text}`,
        tools: [],
        maxRunden: 1,
        zeitlimitS: flow.grenzen?.zeitlimit_s || 600,
        context,
        signal,
      });
      const korrigiertText = String(antwort.result || '').trim();
      // WICHTIG: Ein Zeitlimit/Abbruch mitten in der Korrektur liefert einen
      // Platzhalter-Text OHNE `.error` (toolLoop: „Abgebrochen: Zeitlimit …").
      // Der darf NIE zum Dokument werden — der ursprüngliche Entwurf bleibt.
      if (antwort.error || antwort.truncated || antwort.aborted || korrigiertText.length < 20) {
        throw new Error(
          antwort.error ||
            (antwort.truncated || antwort.aborted
              ? 'Korrektur abgebrochen (Zeitlimit/Abbruch)'
              : 'Korrektur lieferte keinen brauchbaren Text')
        );
      }
      text = korrigiertText;
      korrigiert = true;
      checks = deterministischeChecks(text, ausgabe);
      await stepRecorder.abschliessen({
        stepId: korrekturStep.id,
        output: `Entwurf korrigiert (${probleme.length} ${probleme.length === 1 ? 'Mangel' : 'Mängel'})`,
      });
    } catch (err) {
      logger.warn(`Prüfschritt: Korrekturrunde fehlgeschlagen (${err.message}) — Entwurf bleibt`);
      await stepRecorder.abschliessen({
        stepId: korrekturStep.id,
        output: `Korrektur fehlgeschlagen: ${err.message}`,
        status: 'fehler',
      });
    }
  }

  // Verbliebene offene Stellen ins Annahmen-Protokoll — dokumentiert, nicht erfunden.
  for (const offen of sammleOffeneStellen(text)) {
    annahmen.push(`Offen geblieben: [${offen}]`);
  }

  const protokoll =
    checksAlsText(checks) +
    (pruefung
      ? `\n${pruefung.bestanden && llmProbleme.length === 0 ? '✓' : '✗'} Prüfrunde gegen den Auftrag${llmProbleme.length ? ` — ${llmProbleme.join(' · ')}` : ''}`
      : '\n– Prüfrunde nicht auswertbar (übersprungen)') +
    (korrigiert ? '\n→ Eine Korrekturrunde ausgeführt' : '');

  await stepRecorder.abschliessen({ stepId: pruefStep.id, output: protokoll });

  return { text, annahmen: [...new Set(annahmen)].slice(0, 30), korrigiert, checks };
}

module.exports = {
  deterministischeChecks,
  sammleOffeneStellen,
  pruefeUndKorrigiere,
  parsePruefJson,
};
