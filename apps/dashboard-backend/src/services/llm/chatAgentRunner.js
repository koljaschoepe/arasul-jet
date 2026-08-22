/**
 * Chat-Agent (2026-07-28): die Werkzeugschleife der Flows im normalen Chat.
 *
 * Der Chat war reines Frage-Antwort-Streaming — er konnte weder Dateien
 * schreiben noch selbst suchen, und der fest verdrahtete RAG-Zitier-Modus
 * verweigerte Erstell-Aufgaben („Newsletter-Fall"). Ab jetzt läuft jede
 * Text-Nachricht als Agent-Lauf:
 *
 *  - Das Modell bekommt ECHTE Werkzeuge (Ollama function calling): Wissensraum-
 *    Suche, Projektablage lesen/schreiben/durchsuchen, Web, Subagent. Es ruft
 *    sie selbst auf, wann es sie braucht — einfache Fragen beantwortet es
 *    direkt, ohne Werkzeug-Runde.
 *  - Jede Runde streamt über /api/chat (stream:true): Antwort-Token gehen live
 *    als `response`-Events an den Client (dasselbe Protokoll wie bisher),
 *    Werkzeug-Aufrufe als `agent_step`-Events (kompakte Schritt-Zeilen im UI).
 *  - Geschriebene Ablage-Dateien werden erkannt und als `agent_datei`-Events
 *    gemeldet; der Verweis landet persistent an der Nachricht
 *    (chat_messages.datei), die Schritte in chat_messages.schritte.
 *  - Modelle ohne Tool-Unterstützung: der erste Ollama-Fehler „does not support
 *    tools" schaltet auf eine werkzeuglose Runde um — der Chat verhält sich
 *    dann wie bisher, statt zu scheitern.
 *
 * GPU: jeder Modell-Aufruf läuft durch dieselbe Sperre wie Flows und Alt-Chat
 * (gpuQueue) — nie zwei Aufrufe zugleich auf der GPU.
 */

const axios = require('axios');
const path = require('path');
const fs = require('fs/promises');
const services = require('../../config/services');
const logger = require('../../utils/logger');
const { withGpuLock } = require('../flows/gpuQueue');
const { zuOllamaName } = require('../flows/toolLoop');
const { buildTools } = require('../flows/toolRegistry');
const { RunLimits } = require('../flows/limits');
const projectService = require('../rag/projectService');
const { projektOrdner, listTree } = require('../projects/ablageService');
const { ensureFlowSandbox } = require('../flows/sandboxResolve');
const { buildSystemPrompt } = require('./systemPromptBuilder');
const agentConfig = require('./agentConfig');
const { parseTextToolCalls, enthaeltToolSyntax, ToolSyntaxFilter } = require('./textToolCalls');
const { TodoListeTool, todoErinnerung, parseTodos } = require('./agentTodoTool');
const {
  abbruchMelden,
  abbruchFesthalten,
  abbruchText,
  grundAusFehler,
  kennung,
} = require('./abbruchGrund');
const { benenneNachLauf } = require('../chat/chatTitle');

/**
 * Wie lange ein Modell-Strom stumm bleiben darf, in zwei Faellen (Plan 023 E2).
 *
 * Bis zum 22.08.2026 war das EINE Zahl, 120 Sekunden, fuer zwei sehr
 * verschiedene Wartezeiten. Am Geraet gemessen, Job 6153f7c8: ein Agent-Lauf
 * starb nach 15:39 Minuten daran, dass das Modell 121 Sekunden lang nichts
 * schickte. Nachgerechnet war das kein Haenger:
 *
 *   Zusammenhang der Runde   31 267 Token (von 32 768)
 *   Vorverarbeitung warm     507 bis 589 Token je Sekunde  ->  53 bis 62 s
 *   Vorverarbeitung kalt     262 Token je Sekunde          ->        119 s
 *   Modell laden                                                6 bis 30 s
 *
 * Die 120 Sekunden lagen also genau auf der Kante des erlaubten Falls. Ein
 * grosser Zusammenhang und ein kaltes Modell reichten, und der Lauf starb an
 * seiner eigenen Groesse.
 *
 * Deshalb zwei Grenzen. VOR dem ersten Wort einer Runde laeuft Modellladung
 * und Vorverarbeitung, das darf lange dauern. ZWISCHEN zwei Woertern darf es
 * das nicht: dort ist ein stiller Strom wirklich tot.
 */
const VORLAUF_TIMEOUT_MS = parseInt(process.env.FLOW_LLM_VORLAUF_TIMEOUT_MS || '300000', 10);
const CALL_TIMEOUT_MS = parseInt(process.env.FLOW_LLM_TIMEOUT_MS || '120000', 10);
// Kein praktisches Zeitlimit mehr (Interview 2026-07-29: „Unbegrenzt +
// Abbruch-Knopf") — die Grenze ist der Nutzer-Abbruch; die Zahlen hier sind
// nur Notbremsen gegen Endlosschleifen.
const MAX_RUNDEN = 64;
const ZEITLIMIT_S = 24 * 60 * 60;
const MAX_HISTORY_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 8000;
/**
 * Wie viele Token der Verlauf im Vorlauf der ERSTEN Runde hoechstens kosten
 * darf (Plan 023 D7, Schritt 2).
 *
 * Der Kontext-Haushalt weiter unten hat ein anderes Ziel: er verhindert, dass
 * der Kontext ueberlaeuft, und greift deshalb erst bei NUM_CTX * 0.7, also bei
 * rund 22900 Token. Fuer die Zeit bis zum ersten Wort ist das viel zu spaet.
 * MAX_MESSAGE_CHARS erlaubt 8000 Zeichen je Nachricht; zwoelf davon sind
 * gemessen 12060 Token allein fuer den Verlauf, und bei 262 Token je Sekunde
 * Vorverarbeitung wartet der Nutzer dafuer 46 Sekunden, bevor das erste Wort
 * kommt. Niemand hat ihn ueberlaufen sehen, weil er nie ueberlaeuft.
 *
 * Deshalb ein zweites, viel kleineres Budget, das nur den Verlauf betrifft und
 * nur beim Zusammenbauen greift. Die juengsten Nachrichten bleiben vollstaendig,
 * aeltere werden gekuerzt, und was dann noch nicht passt, faellt weg und wird
 * durch eine Zeile ersetzt, die sagt, wie viel fehlt.
 */
const VERLAUF_TOKEN_BUDGET = agentConfig.VERLAUF_TOKEN_BUDGET;
/** Die juengsten Nachrichten bleiben immer ungekuerzt, egal wie lang sie sind. */
const VERLAUF_SCHUTZ = 2;
/** Auf so viele Zeichen wird eine aeltere Nachricht eingedampft. */
const VERLAUF_KURZ_CHARS = 400;
const KURZ_INPUT = 300;
const KURZ_OUTPUT = 500;
/** Wie oft der Lauf nachschaut, ob der Nutzer abgebrochen hat. */
const ABBRUCH_POLL_MS = 2000;
/** Struktur-Übersicht im Systemprompt: höchstens so viele Einträge. */
const STRUKTUR_MAX_EINTRAEGE = 120;
/** Korrektur-Zyklen: Prüf-Gate und Ankündigungs-Wächter dürfen MEHRFACH greifen
 * (Harness v2) — ein echter Entwurf-Prüfung-Korrektur-Kreis braucht mehr als
 * die eine Runde von früher. Hart gedeckelt gegen Endlos-Pingpong. */
const MAX_PRUEF_ZYKLEN = 2;
const MAX_NACHFASS_ZYKLEN = 2;
/** Fortschritts-Wächter (F-06): So viele aufeinanderfolgende PAAR-Vergleiche
 * mit EXAKT derselben Werkzeug-Signatur UND ohne jeden Fortschritt (keine neue/
 * geänderte Datei, keine Todo-Änderung) lösen den Abbruch aus — praktisch also
 * ab der 4. identischen, fortschrittslosen Runde in Folge. Bewusst KEIN
 * Zeitlimit (Nutzer-Entscheidung 2026-08-15): greift nur bei echtem Stillstand,
 * nicht wenn schon viel abgearbeitet ist. Normale Arbeit variiert Argumente
 * (z. B. Abschnitte anhängen) → andere Signatur → löst nicht aus. */
const MAX_STAGNATION = 3;

/** Werkzeuge des Chat-Agenten. `terminal` läuft projektbeschränkt im Flow-Sandbox-Container. */
const AGENT_WERKZEUGE = [
  'rag_suche',
  'dateien_lesen',
  'dateien_schreiben',
  'dateien_bearbeiten',
  'dateien_anhaengen',
  'dateien_suchen',
  'symbol_suche',
  'web_suche',
  'web_lesen',
  'terminal',
  'subagent',
];

/**
 * Die Rollen-Riege des Orchestrators (Interview 2026-07-29). Flows deklarieren
 * Rollen pro Flow; der Chat bringt vier feste mit — kleine Modelle arbeiten
 * mit enger Rollenbeschreibung nachweislich fokussierter.
 */
const AGENT_ROLLEN = [
  {
    name: 'rechercheur',
    prompt:
      'Du bist ein gründlicher Rechercheur. Erledige den Auftrag mit deinen ' +
      'Werkzeugen: durchsuche die Projektdateien mit dateien_suchen (Namensmuster ' +
      'und/oder Textsuche) und lies Treffer mit dateien_lesen; WO im Code etwas ' +
      'definiert ist, findest du mit symbol_suche(name=…); den Inhalt einer ' +
      'benannten PDF/DOCX holst du gezielt mit rag_suche (Parameter "dateiname"). ' +
      'Für Externes nutze web_suche/web_lesen. Fasse die Ergebnisse knapp und ' +
      'faktentreu auf Deutsch zusammen. Keine Emojis.',
    werkzeuge: [
      'dateien_suchen',
      'symbol_suche',
      'dateien_lesen',
      'rag_suche',
      'web_suche',
      'web_lesen',
    ],
    ergebnis: { felder: ['ergebnis'], max_zeichen: 4000 },
    modell: null,
  },
  {
    name: 'autor',
    prompt:
      'Du bist ein sorgfältiger Autor. Erstelle oder überarbeite die im Auftrag ' +
      'genannten Dateien VOLLSTÄNDIG mit deinen Schreib-Werkzeugen (passende Endung: ' +
      '.html für Webseiten, .md für Texte, .csv für Tabellen; kurzer Dateiname ohne ' +
      'Umlaute). Speichere unter EXAKT dem im Auftrag genannten Pfad/Dateinamen, ' +
      'erfinde keine zusätzlichen Ordner. Lange Dokumente baust du abschnittsweise: erst dateien_schreiben mit ' +
      'dem Anfang, dann Abschnitt für Abschnitt dateien_anhaengen. Gezielte Änderungen ' +
      'machst du mit dateien_bearbeiten statt alles neu zu schreiben. Nutze ' +
      'mitgeliefertes Material und dateien_suchen/dateien_lesen als Quelle (Inhalt einer ' +
      'benannten PDF/DOCX über rag_suche mit "dateiname"), erfinde keine ' +
      'Fakten. Antworte am Ende nur mit einem Satz, was du geschrieben hast. Deutsch, keine Emojis.',
    werkzeuge: [
      'rag_suche',
      'dateien_lesen',
      'dateien_schreiben',
      'dateien_bearbeiten',
      'dateien_anhaengen',
      'dateien_suchen',
    ],
    ergebnis: { felder: ['ergebnis'], max_zeichen: 2000 },
    modell: null,
    schreibend: true,
  },
  {
    name: 'pruefer',
    prompt:
      'Du bist ein strenger Prüfer. Lies die im Auftrag genannten Dateien mit ' +
      'dateien_lesen und beurteile NUR, ob sie den Auftrag erfüllen. MANGEL ist ' +
      'insbesondere: Platzhalter wie "[Thema]", "[Ziel]", "Lorem", "TODO" oder ' +
      '"…" im Inhalt; leere/generische Abschnitte ohne konkrete Fakten; Inhalt, ' +
      'der die genannten Quellen erkennbar NICHT nutzt; fehlende Dateien. ' +
      'Beginne deine Antwort EXAKT mit "OK" nur wenn nichts davon zutrifft, ' +
      'sonst mit "MANGEL:" gefolgt von den konkreten Problemen und was konkret ' +
      'hineingehört. Deutsch, keine Emojis.',
    werkzeuge: ['dateien_lesen', 'dateien_suchen', 'rag_suche'],
    ergebnis: { felder: ['ergebnis'], max_zeichen: 2000 },
    modell: null,
  },
  {
    name: 'entwickler',
    prompt:
      'Du bist ein Entwickler. Schreibe Code-Dateien mit dateien_schreiben und ' +
      'FÜHRE sie mit terminal AUS, um sie zu prüfen (z. B. "python3 skript.py", ' +
      '"node app.js"). Vorhandenen Code findest du mit dateien_suchen (Textsuche); ' +
      'WO eine Funktion/Klasse/Methode definiert ist, mit symbol_suche(name=…). ' +
      'Fehler behebst du gezielt mit dateien_bearbeiten ' +
      '(Suchen/Ersetzen), bis der Befehl sauber läuft. Antworte am Ende nur mit ' +
      'einem Satz zum Ergebnis inkl. des Prüf-Befehls. Deutsch, keine Emojis.',
    werkzeuge: [
      'dateien_lesen',
      'dateien_schreiben',
      'dateien_bearbeiten',
      'dateien_anhaengen',
      'dateien_suchen',
      'symbol_suche',
      'terminal',
    ],
    ergebnis: { felder: ['ergebnis'], max_zeichen: 2000 },
    modell: null,
    schreibend: true,
  },
];

/**
 * Die Arbeitsweise des Orchestrators.
 *
 * Kurz gehalten seit Plan 023 D7, Schritt 2 (22.08.2026). Der Vorlauf des
 * Agentenpfads lag bei 3811 Token, davon 1142 in dieser Anweisung und 2654 in
 * den Werkzeugbeschreibungen. Gemessen mit `scripts/test/vorlauf-wiegen.js`.
 *
 * Gekuerzt wurde nicht nach Gefuehl, sondern entlang einer Regel: was
 * strukturell schon an einem Werkzeug haengt, steht hier nicht noch einmal.
 * Der Vergleich symbol_suche gegen dateien_suchen stand in beiden, die
 * dateiname-Regel von rag_suche stand in beiden, die Ordnerregeln von
 * dateien_bearbeiten und dateien_anhaengen ebenfalls. Das Modell sieht jede
 * dieser Regeln weiterhin, aber nur einmal und an der Stelle, an der sie
 * hingehoert.
 *
 * Die Nummern enden bewusst bei 10: was der Runner je nach Anfrage
 * zusaetzlich anhaengt (Zielordner, Datei-Modus), traegt keine eigene Nummer
 * mehr. Bis zum 22.08.2026 haengte er dort "7." und "8." an, obwohl die Liste
 * schon eine 7 und eine 8 hatte, und zwar hinter dem Projektbaum, also weit
 * weg von der Liste, in die sie sich einreihen wollten.
 */
const AGENT_ANWEISUNG = `

## Arbeitsweise
Du bist der Arasul-Orchestrator mit Werkzeugen und Subagenten. Regeln:
1. Einfache Fragen und Gespräche beantwortest du DIREKT, ohne Werkzeug.
2. Nutze die Struktur-Übersicht des Projektordners (unten) und lies relevante Dateien, bevor du antwortest oder etwas erstellst. In großen Bäumen findest du Dateien mit dateien_suchen, statt zu raten.
3. ERFINDE KEINE Ordner oder Kunden- und Firmennamen. Neue Dateien legst du GENAU dort an, wo der Nutzer es sagt; nennt er nur einen Dateinamen, speicherst du unter exakt diesem Namen in der Wurzel des Arbeitsordners. Einen Unterordner nutzt du nur, wenn der Nutzer ihn nennt oder die Struktur-Übersicht einen eindeutig passenden BESTEHENDEN zeigt.
4. Fragen zu Dokumenten, Projekten oder Firmenwissen beantwortest du aus den Projektdateien: mit dateien_suchen finden, mit dateien_lesen holen, frei als Material verarbeiten. PDF, DOCX und andere Binärdateien liest du NICHT mit dateien_lesen, ihren Inhalt holst du mit rag_suche.
5. Will der Nutzer ein Dokument (Newsletter, Webseite, Bericht, Liste …), erstellst du den vollständigen Inhalt und speicherst ihn mit dateien_schreiben (.html für Webseiten, .md für Texte, .csv für Tabellen; kurzer Dateiname ohne Umlaute). Danach EIN kurzer Satz, was du gespeichert hast, den Inhalt NICHT wiederholen.
6. Lange Dokumente baust du abschnittsweise: dateien_schreiben für den Anfang, danach Abschnitt für Abschnitt dateien_anhaengen, nie alles in einem Aufruf.
7. Bei mehrschrittigen Aufträgen pflegst du mit todo_liste eine Aufgabenliste: zu Beginn anlegen, nach JEDEM erledigten Schritt aktualisieren.
8. DELEGIERE AGGRESSIV: zerlege größere Aufträge in kleine, in sich geschlossene Blöcke und gib JEDEN an einen frischen Subagenten. rolle="rechercheur" sammelt Material, "autor" schreibt Dateien aus Material, "entwickler" schreibt und testet Code per Terminal, "pruefer" kontrolliert Ergebnisse. Jeder Subagent hat seinen EIGENEN Kontext, so bleibt deiner schlank. Faustregel: braucht ein Teilschritt selbst mehrere Werkzeug-Aufrufe oder viel Lesestoff, delegiere ihn, mit Zielpfad und vollständigem Kontext. Unabhängige Blöcke gehen als getrennte Aufrufe.
9. Sage vor jedem Werkzeug-Block in EINEM kurzen Satz, was du tust ("Ich lese zuerst die Preisliste."), und rufe die Werkzeuge dann SOFORT in derselben Antwort auf. Niemals eine Aktion ankündigen, ohne sie auszuführen.
10. Erfinde keine Fakten. Liefern die Werkzeuge nichts, sag das ehrlich. Antworte auf Deutsch, ohne Emojis (außer der Nutzer bittet darum).`;

/**
 * Hakt jede Checkbox einer Aufgabenliste ab ([ ]/[~] → [x]), Einrückung und
 * Bullet-Zeichen bleiben erhalten (F-06). Wird NUR beim echten Abschluss
 * aufgerufen — der letzte todo_liste-Aufruf fehlt kleinen Modellen oft, sodass
 * die Leiste sonst auf „1/2" stehenbliebe, obwohl die Antwort fertig ist.
 */
function alleTodosErledigt(liste) {
  return String(liste || '').replace(/^(\s*[-*]\s*)\[[ xX~]\]/gm, '$1[x]');
}

/**
 * Deckelt den Verlauf auf VERLAUF_TOKEN_BUDGET (Plan 023 D7, Schritt 2).
 *
 * Von hinten nach vorn, weil die juengsten Nachrichten die sind, auf die sich
 * die Frage bezieht. Die letzten VERLAUF_SCHUTZ bleiben ungekuerzt, auch wenn
 * sie das Budget allein sprengen: die aktuelle Frage zu beschneiden waere
 * schlimmer als jede Wartezeit. Danach wird gekuerzt, und was dann noch nicht
 * passt, faellt weg. Dass etwas fehlt, erfaehrt das Modell als eine Zeile,
 * statt dass der Verlauf stillschweigend mit einer Antwort ohne Frage beginnt.
 *
 * @param {{role:string, content:string}[]} nachrichten juengste zuletzt
 * @returns {{verlauf:object[], weggelassen:number, gekuerzt:number}}
 */
function verlaufAufBudget(nachrichten) {
  const kosten = text => Math.ceil(String(text || '').length / 3.2) + 8;
  const behalten = [];
  let summe = 0;
  let gekuerzt = 0;
  let weggelassen = 0;
  for (let i = nachrichten.length - 1; i >= 0; i--) {
    const m = nachrichten[i];
    const geschuetzt = nachrichten.length - 1 - i < VERLAUF_SCHUTZ;
    if (geschuetzt) {
      behalten.unshift(m);
      summe += kosten(m.content);
      continue;
    }
    if (summe + kosten(m.content) <= VERLAUF_TOKEN_BUDGET) {
      behalten.unshift(m);
      summe += kosten(m.content);
      continue;
    }
    const knapp = kurz(m.content, VERLAUF_KURZ_CHARS);
    if (summe + kosten(knapp) <= VERLAUF_TOKEN_BUDGET) {
      behalten.unshift({ role: m.role, content: knapp });
      summe += kosten(knapp);
      gekuerzt += 1;
      continue;
    }
    // Ab hier passt nichts mehr; alles Aeltere faellt in einem Zug weg.
    weggelassen = i + 1;
    break;
  }
  if (weggelassen > 0) {
    behalten.unshift({
      role: 'user',
      content:
        `[${weggelassen} ältere Nachricht${weggelassen === 1 ? '' : 'en'} aus diesem Gespräch ` +
        'sind hier ausgelassen. Frag nach, wenn dir etwas fehlt.]',
    });
  }
  return { verlauf: behalten, weggelassen, gekuerzt };
}

/**
 * Signatur einer Werkzeug-Runde (F-06 Fortschritts-Wächter): Name + Argumente
 * jedes Aufrufs, in Reihenfolge. Zwei Runden gelten nur dann als „gleich", wenn
 * dieselben Werkzeuge mit EXAKT denselben Argumenten gerufen werden — variieren
 * die Argumente (z. B. anderer Abschnitt beim Anhängen), unterscheiden sich die
 * Signaturen und der Wächter löst nicht aus.
 */
function berechneToolSignatur(toolCalls) {
  return (Array.isArray(toolCalls) ? toolCalls : [])
    .map(c => {
      const args = c.function?.arguments;
      return `${c.function?.name}:${typeof args === 'string' ? args : JSON.stringify(args || {})}`;
    })
    .join('|');
}

/** Kürzt Werte für die persistierte Schritt-Liste (Kontext-/Speicherschutz). */
function kurz(wert, max) {
  const text = typeof wert === 'string' ? wert : JSON.stringify(wert ?? '');
  return text.length > max ? `${text.slice(0, max)} …` : text;
}

/**
 * Übersetzt einen technischen Fehler in einen Satz, den ein Nicht-Techniker
 * versteht (Agent-UX 2026-08-02). Der rohe Text bleibt im Log — dem Nutzer
 * gehört die Ursache in Alltagssprache plus ein klarer nächster Schritt.
 */
function verstaendlicherFehler(err) {
  const roh = String(err?.message || err || '');
  if (/ohne Daten|timeout|timed?\s*out|ETIMEDOUT/i.test(roh)) {
    return 'Das Modell hat zu lange nicht geantwortet (Zeitüberschreitung). Bitte noch einmal versuchen, bei großen Aufträgen hilft es, sie in kleinere Schritte zu teilen.';
  }
  if (/ECONNREFUSED|ENOTFOUND|fetch failed|socket|ECONNRESET/i.test(roh)) {
    return 'Der KI-Dienst ist gerade nicht erreichbar. Einen Moment warten und erneut versuchen.';
  }
  if (/model .*not found|no such model|nicht geladen|model_not_found/i.test(roh)) {
    return 'Das gewählte Modell ist nicht geladen, bitte im Store laden oder ein anderes Modell wählen.';
  }
  if (/GPU|out of memory|OOM|Speicher/i.test(roh)) {
    return 'Dem Gerät ist der KI-Speicher ausgegangen. Ein kleineres Modell wählen oder laufende Aufgaben beenden.';
  }
  return `Der Lauf ist unerwartet gescheitert (${kurz(roh, 140)}). Bitte erneut versuchen.`;
}

/**
 * Kürzt die Werkzeug-Parameter, behält aber die OBJEKT-Form — die UI baut
 * daraus die Schritt-Beschriftung („schreibt kunden/angebot.html").
 */
function kurzInput(input, maxJeWert) {
  if (!input || typeof input !== 'object') {
    return {};
  }
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    out[key] = typeof value === 'string' ? kurz(value, maxJeWert) : value;
  }
  return out;
}

/**
 * Wie lange Ollama das Modell nach dieser Anfrage halten soll (Plan 023 D6).
 *
 * Bis zum 21.08.2026 stand hier fest `agentConfig.KEEP_ALIVE`, also
 * `AGENT_KEEP_ALIVE` aus der Umgebung, Vorgabe 30 Minuten. Der zweite Pfad
 * (`llmOllamaStream`) fragt seit langem den Lebenszyklus. Ausgerechnet der
 * Pfad, der am meisten benutzt wird, haengt also nicht an der Automatik.
 *
 * Das war nicht nur inkonsequent, es hatte eine sichtbare Folge: weil der
 * Agent Ollama 30 Minuten mitgibt, waehrend die Automatik nach zwei Minuten
 * Ruhe entlaedt, entladen sich beide gegenseitig. Genau daher stammen die 877
 * protokollierten Entladungen, die Plan 023 D3 gefunden hat.
 *
 * Der Umgebungswert bleibt als Rueckfall, falls der Lebenszyklus nicht
 * antwortet. Ein Agentenlauf soll nicht daran scheitern.
 */
async function haltezeit() {
  try {
    const modelLifecycleService = require('./modelLifecycleService');
    const lage = await modelLifecycleService.getCurrentKeepAlive();
    return lage.keepAliveSeconds;
  } catch {
    return agentConfig.KEEP_ALIVE;
  }
}

/**
 * Liest einen Antwortstrom vollstaendig als Text (Plan 023 E2).
 *
 * Nur fuer Fehlerrumpfe gedacht, die klein sind. Ein Fehlschlag beim Lesen ist
 * kein Grund, den urspruenglichen Fehler zu verlieren, deshalb faellt alles auf
 * eine leere Zeichenkette zurueck.
 *
 * @param {any} strom
 * @returns {Promise<string>}
 */
async function stromAlsText(strom) {
  if (!strom || typeof strom.on !== 'function') {
    return '';
  }
  try {
    const stuecke = [];
    for await (const stueck of strom) {
      stuecke.push(Buffer.from(stueck));
      if (stuecke.reduce((n, b) => n + b.length, 0) > 8192) {
        break;
      }
    }
    return Buffer.concat(stuecke).toString('utf8');
  } catch {
    return '';
  }
}

/**
 * Zieht jede System-Nachricht an den Anfang (Plan 023 E2).
 *
 * Am 22.08.2026 auf dem Orin gemessen: das Standard-Chatmodell des Geraets
 * lehnt eine System-Nachricht ab, die nicht die erste ist. Ollama antwortet mit
 * HTTP 500 und dem Satz aus der Vorlage des Modells:
 *
 *   Jinja Exception: System message must be at the beginning.
 *
 * Der Agent haengt aber genau so eine ans Ende, sobald eine Aufgabenliste
 * existiert. Damit scheiterte auf dem Standardmodell **jeder** Agent-Lauf, der
 * eine Aufgabenliste anlegt, also jeder groessere Auftrag. Mit
 * `qwen3-coder:30b` fiel es nicht auf, dessen Vorlage ist nachsichtiger.
 *
 * Der Inhalt geht nicht verloren, er wandert an die erste System-Nachricht.
 * Die Reihenfolge der uebrigen Nachrichten bleibt unberuehrt.
 *
 * @param {{role:string, content:string}[]} nachrichten
 * @returns {{nachrichten:object[], verschoben:number}}
 */
function systemAnDenAnfang(nachrichten) {
  const liste = Array.isArray(nachrichten) ? nachrichten : [];
  const system = liste.filter(n => n?.role === 'system');
  const rest = liste.filter(n => n?.role !== 'system');
  // Nichts zu tun heisst: hoechstens eine System-Nachricht, und die steht schon
  // ganz vorne. Alles andere wird zusammengelegt, auch der Fall EINER
  // System-Nachricht mitten im Verlauf: sie ist genauso verboten wie zwei, und
  // ein "verschoben: 0" waere hier eine falsche Auskunft.
  if (system.length === 0 || (system.length === 1 && liste[0]?.role === 'system')) {
    return { nachrichten: liste, verschoben: 0 };
  }
  const zusammen = {
    ...system[0],
    role: 'system',
    content: system
      .map(n => String(n.content ?? ''))
      .filter(Boolean)
      .join('\n\n'),
  };
  return {
    nachrichten: [zusammen, ...rest],
    verschoben: system.length - (liste[0]?.role === 'system' ? 1 : 0),
  };
}

/**
 * Eine Modell-Runde über /api/chat mit stream:true.
 * Antwort-Token fließen sofort über onToken; tool_calls werden gesammelt.
 * Inaktivitäts-Timeout statt Gesamt-Timeout: ein langsam tröpfelnder Stream
 * ist gesund, ein stiller Stream ist tot.
 *
 * Plan 023 E1: die Wartezeit auf das ERSTE Zeichen wird gemessen und
 * aufgeschrieben, auch wenn sie gut ausgeht. Sie ist etwas anderes als die
 * Pause zwischen zwei Zeichen: davor laufen Modell-Ladung und Vorverarbeitung
 * des ganzen Prompts, und beides kann auf dem Jetson nahe an CALL_TIMEOUT_MS
 * heranreichen, ohne dass irgendetwas kaputt ist. Ohne diese Zahl laesst sich
 * nicht unterscheiden, ob ein Abbruch ein totes Modell war oder ein zu knapp
 * gesetztes Zeitlimit.
 *
 * @returns {Promise<{content:string, toolCalls:object[]}>}
 */
async function streamChatRound({
  model,
  messages,
  tools,
  onToken,
  onThinking,
  think,
  signal,
  numPredict,
  jobId = null,
}) {
  return withGpuLock(async () => {
    if (signal?.aborted) {
      throw new Error('Vom Nutzer abgebrochen');
    }
    // Explizite options statt Server-Defaults (Harness v2): Ollama schneidet
    // Prompts über num_ctx STILL vorne ab — System-Prompt und Tools zuerst.
    // Der Agent setzt sein Fenster deshalb selbst und haushaltet davor.
    // Plan 023 E2: nie eine System-Nachricht mitten im Verlauf. Das
    // Standardmodell des Geraets lehnt sie mit HTTP 500 ab, und der Fehler kam
    // beim Nutzer als "Der KI-Dienst ist gerade nicht erreichbar" an.
    const { nachrichten: geordnet, verschoben } = systemAnDenAnfang(messages);
    if (verschoben > 0) {
      logger.debug(
        `[SYSTEM] ${verschoben} System-Nachricht(en) an den Anfang gezogen, Modell ${model}`
      );
    }
    const body = {
      model,
      messages: geordnet,
      stream: true,
      think: think === true,
      keep_alive: await haltezeit(),
      options: {
        num_ctx: agentConfig.NUM_CTX,
        num_predict: Number.isFinite(numPredict) ? numPredict : agentConfig.NUM_PREDICT,
      },
    };
    if (tools && tools.length > 0) {
      body.tools = tools;
    }
    // Plan 023 E2: das Signal geht MIT an axios. Zwischen diesem Aufruf und
    // dem Anhaengen des Abbruch-Horchers weiter unten liegt die gesamte
    // Anfrage; wer erst dort horcht, verpasst jeden Abbruch, der in dieser
    // Zeit kommt, und der Lauf liefe bis zum Ende weiter. Genau diese Spanne
    // ist bei einem kalten Modell die laengste des ganzen Laufs.
    let response;
    try {
      response = await axios.post(services.llm.chatEndpoint, body, {
        responseType: 'stream',
        timeout: 0,
        signal,
      });
    } catch (err) {
      // Plan 023 E2: Bei `responseType: 'stream'` ist auch der FEHLER-Rumpf ein
      // Strom. Wer ihn nicht liest, verliert die einzige Auskunft darueber, was
      // Ollama eigentlich beanstandet hat, und behaelt ein nacktes
      // "Request failed with status code 500".
      const rumpf = await stromAlsText(err?.response?.data);
      if (rumpf) {
        err.message = `${err.message}: ${rumpf.slice(0, 400)}`;
        err.response.data = rumpf;
      }
      throw err;
    }
    // Und noch einmal danach: das Abbrechen kann genau in dem Augenblick
    // passiert sein, in dem die Antwort schon unterwegs war.
    if (signal?.aborted) {
      response.data?.destroy?.();
      throw new Error('Vom Nutzer abgebrochen');
    }

    return new Promise((resolve, reject) => {
      const stream = response.data;
      let buffer = '';
      let content = '';
      const toolCalls = [];
      let inactivity = null;
      let settled = false;
      // Plan 023 E1: zwei verschiedene Wartezeiten, bisher unter einer Zahl.
      const rundeBegonnen = Date.now();
      /**
       * Wann das erste WORT dieser Runde kam, nicht der erste Block.
       *
       * Der Unterschied ist der ganze Punkt: Ollama oeffnet den Strom sofort
       * und schweigt danach, solange es den Prompt verarbeitet. Wer den ersten
       * Block fuer den Anfang der Antwort haelt, misst null Millisekunden und
       * legt danach die strenge Grenze an eine Wartezeit, die noch gar nicht
       * begonnen hat.
       */
      let erstesZeichenNachMs = null;
      // Plan 023 E9: Werkzeug-Syntax darf nicht in der Anzeige landen. Der
      // Nachparser weiter unten raeumt den Text der Runde auf, aber er kommt
      // zu spaet: onToken hat jedes Stueck laengst durchgereicht. `content`
      // bleibt absichtlich ROH, denn genau daraus zieht der Parser die Aufrufe.
      const syntaxFilter = new ToolSyntaxFilter();

      const onAbort = () => fail(new Error('Vom Nutzer abgebrochen'));
      const cleanup = () => {
        if (inactivity) {
          clearTimeout(inactivity);
          inactivity = null;
        }
        signal?.removeEventListener('abort', onAbort);
        stream.removeAllListeners();
        stream.destroy();
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      const fail = err => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(err);
      };
      const armInactivity = () => {
        if (inactivity) {
          clearTimeout(inactivity);
        }
        // Plan 023 E2: zwei Grenzen, nicht eine. Vor dem ersten Wort laeuft
        // Modellladung und Vorverarbeitung, danach nur noch das Erzeugen.
        const grenze = erstesZeichenNachMs === null ? VORLAUF_TIMEOUT_MS : CALL_TIMEOUT_MS;
        inactivity = setTimeout(() => {
          // Plan 023 E1: der Grund unterscheidet, was bisher gleich aussah.
          const wartet = erstesZeichenNachMs === null ? 'vor dem ersten Wort' : 'mitten im Text';
          abbruchMelden({
            log: logger,
            jobId,
            grund: 'stream_still',
            quelle: 'chatAgentRunner.streamChatRound',
            detail: `${wartet}, Modell ${model}, Grenze ${grenze / 1000}s`,
            nachMs: Date.now() - rundeBegonnen,
          });
          fail(new Error(`Modell-Stream ${grenze / 1000}s ohne Daten, abgebrochen`));
        }, grenze);
      };
      armInactivity();

      stream.on('data', chunk => {
        armInactivity();
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }
          let data;
          try {
            data = JSON.parse(line);
          } catch {
            continue; // unvollständige Zeile — bleibt im Buffer-Rest
          }
          if (data.error) {
            fail(new Error(String(data.error)));
            return;
          }
          const msg = data.message || {};
          // Reasoning-Trace (qwen3 & Co.): Ollama liefert ihn als eigenes
          // thinking-Feld. Live durchreichen — der Nutzer sieht den
          // Gedankengang, in den Verlauf wandert er NICHT.
          // Plan 023 E2: erst das erste WORT beendet den Vorlauf. Danach
          // gilt die strenge Grenze, davor die grosszuegige.
          if (erstesZeichenNachMs === null && (msg.content || msg.thinking)) {
            erstesZeichenNachMs = Date.now() - rundeBegonnen;
            logger.info(
              `[VORLAUF] job=${jobId || 'ohne'} modell=${model} ` +
                `erstes_wort_nach=${erstesZeichenNachMs}ms grenze=${VORLAUF_TIMEOUT_MS}ms`
            );
            armInactivity();
          }
          if (msg.thinking && typeof onThinking === 'function') {
            try {
              onThinking(msg.thinking);
            } catch (err) {
              logger.warn(`Chat-Agent onThinking warf: ${err.message}`);
            }
          }
          if (msg.content) {
            content += msg.content;
            const sichtbar = syntaxFilter.durch(msg.content);
            if (sichtbar) {
              try {
                onToken(sichtbar);
              } catch (err) {
                logger.warn(`Chat-Agent onToken warf: ${err.message}`);
              }
            }
          }
          if (Array.isArray(msg.tool_calls)) {
            toolCalls.push(...msg.tool_calls);
          }
          if (data.done && !settled) {
            settled = true;
            cleanup();
            // Ein angefangener Halbsatz gehoert dem Nutzer; ein angefangener
            // AUFRUF nicht, der war nie Text.
            const nachzuegler = syntaxFilter.rest();
            if (nachzuegler) {
              try {
                onToken(nachzuegler);
              } catch (err) {
                logger.warn(`Chat-Agent onToken warf: ${err.message}`);
              }
            }
            // Plan 022 — Generierungs-Metriken der Runde (Ollama done-Chunk):
            // eval_count = erzeugte Tokens, eval_duration = reine Generierzeit
            // in Nanosekunden. Der Aufrufer summiert sie über alle Runden für
            // die Tokens/Sekunde-Anzeige am Ende.
            //
            // Plan 023 D7 — dazu die PROMPT-Seite. Ollama meldet sie im selben
            // Chunk und dieser Pfad hat sie bisher fallen gelassen. Ohne sie
            // gibt es keine Zahl für den Vorlauf, und D7 könnte seine eigene
            // Abnahme nicht belegen: `llm_jobs` hatte am 21.08.2026 neun
            // Zeilen und keine einzige mit `prompt_tokens`.
            resolve({
              content,
              toolCalls,
              evalCount: Number(data.eval_count) || 0,
              evalDurationNs: Number(data.eval_duration) || 0,
              promptCount: Number(data.prompt_eval_count) || 0,
              promptDurationNs: Number(data.prompt_eval_duration) || 0,
            });
          }
        }
      });
      stream.on('error', err => fail(err));
      stream.on('end', () => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve({
            content,
            toolCalls,
            evalCount: 0,
            evalDurationNs: 0,
            promptCount: 0,
            promptDurationNs: 0,
          });
        }
      });
    });
  });
}

/**
 * Aufschreiben, was der Lauf gekostet hat (Plan 023 D7).
 *
 * Am 21.08.2026 auf dem Orin gemessen: `llm_jobs` hatte neun Zeilen, keine
 * einzige mit `prompt_tokens`, die juengste vom 30.07. `v_llm_usage_profile`
 * war leer, und `model_performance_metrics` hatte in sieben Tagen keinen
 * Eintrag. `llmOllamaStream` schreibt beides seit langem; dieser Pfad, der das
 * Produkt traegt, schrieb nichts.
 *
 * Das hatte zwei Folgen. D7 konnte seine eigene Abnahme nicht belegen, weil es
 * keine Vorlaufzahl gab. Und die Haltezeit-Automatik stufte jede Stunde als
 * `idle` ein, weil ihr Nutzungsprofil aus genau dieser leeren Sicht kommt,
 * womit sie das Modell nach zwei Minuten Ruhe entlud, waehrend der Agent
 * Ollama dreissig mitgab.
 *
 * Fehler beim Schreiben brechen den Lauf nicht ab. Eine Antwort, die beim
 * Nutzer angekommen ist, darf nicht daran scheitern, dass die Messung nicht
 * gespeichert werden konnte.
 */
async function vorlaufFesthalten({
  database,
  log,
  jobId,
  modelId,
  vorlaufTokens,
  vorlaufDauerNs,
  evalTokens,
  evalDauerNs,
  vorlaufZeichen,
}) {
  if (!vorlaufTokens && !evalTokens) {
    return;
  }
  // Aus der Review von #451: das ist die Vorverarbeitung der ERSTEN Runde plus
  // die Generierungszeit ALLER Runden. Die Vorverarbeitung der Runden zwei bis
  // n fehlt, und die kostet echte Zeit, weil jede Runde einen gewachsenen
  // Kontext neu verarbeitet. Bei mehrrundigen Laeufen ist `total_duration_ms`
  // damit zu klein und die daraus gerechnete Spalte `tokens_per_second`
  // systematisch zu hoch. Bewusst so: D7 misst den Vorlauf der ersten Runde,
  // und die ist die Zahl, die der Nutzer als Wartezeit erlebt. Wer spaeter
  // echte Wanduhrzeit braucht, misst sie und rechnet sie nicht aus Teilen.
  const gesamtMs = Math.round((vorlaufDauerNs + evalDauerNs) / 1e6);
  try {
    await database.query(
      `UPDATE llm_jobs SET prompt_tokens = $1, completion_tokens = $2 WHERE id = $3`,
      [vorlaufTokens || null, evalTokens || null, jobId]
    );
  } catch (err) {
    log.warn(`[JOB ${jobId}] Vorlauf nicht in llm_jobs geschrieben: ${err.message}`);
  }
  try {
    // Dieselbe Funktion, die `llmOllamaStream` benutzt, nicht ein zweiter
    // Schreibweg daneben. Die Bedeutung der Spalten soll zwischen beiden
    // Pfaden dieselbe bleiben, sonst steht in einer Tabelle zweierlei.
    //
    // `time_to_first_token_ms` ist hier die reine Vorverarbeitung, und genau
    // das ist die Zahl, um die es in D7 geht: was vergeht, bevor das erste
    // Wort kommt.
    await database.query(`SELECT record_model_performance($1, $2, $3, $4, $5, $6, $7, $8)`, [
      modelId || 'unknown',
      jobId,
      'chat',
      evalTokens || 0,
      gesamtMs || 0,
      Math.round(vorlaufDauerNs / 1e6) || null,
      false,
      // Achter Parameter ist `context_length`, und der ist im Schema als
      // ZEICHENZAHL dokumentiert. `llmOllamaStream` schreibt dort
      // `prompt.length`. Hier stand bis zur Review von #451 die Tokenzahl,
      // womit dieselbe Spalte je nach Pfad zweierlei bedeutet haette, rund um
      // den Faktor drei bis vier auseinander. Die Tokenzahl geht oben nach
      // `llm_jobs.prompt_tokens`, hier stehen Zeichen.
      vorlaufZeichen || null,
    ]);
  } catch (err) {
    log.warn(`[JOB ${jobId}] Messung nicht gespeichert: ${err.message}`);
  }
}

/** Ollama meldet fehlende Tool-Unterstützung als 400 mit dieser Formulierung. */
function istToolsNichtUnterstuetzt(err) {
  return `${err.message || ''} ${fehlerRumpf(err)}`
    .toLowerCase()
    .includes('does not support tools');
}

/**
 * Der Antwortrumpf eines gescheiterten Ollama-Aufrufs, als Text (Plan 023 E2).
 *
 * Hier stand `JSON.stringify(err.response?.data || '')`. Bei `responseType:
 * 'stream'` ist `data` aber ein Node-Strom, und dessen Socket-Geflecht ist
 * ringfoermig: `JSON.stringify` wirft `Converting circular structure to JSON`.
 *
 * Der Aufruf stand in einem catch-Block. Der geworfene Fehler ersetzte also den
 * echten, und zwar genau in dem Augenblick, in dem der echte gebraucht wurde.
 * Am 22.08.2026 auf dem Orin gemessen: Ollama meldete "System message must be
 * at the beginning", der Nutzer las "Der KI-Dienst ist gerade nicht
 * erreichbar", und im Protokoll stand der Serialisierungsfehler.
 *
 * Zweite Folge, stiller: die Ausweiche fuer Modelle ohne Werkzeug-Unterstuetzung
 * (`toolsAktiv = false`) wurde nie erreicht, weil der Test davor warf.
 */
function fehlerRumpf(err) {
  const daten = err?.response?.data;
  if (daten == null) {
    return '';
  }
  if (typeof daten === 'string') {
    return daten;
  }
  if (Buffer.isBuffer(daten)) {
    return daten.toString('utf8').slice(0, 500);
  }
  // Ein Strom oder irgendein anderes Geflecht: nicht serialisieren.
  if (typeof daten.pipe === 'function' || typeof daten.on === 'function') {
    return '';
  }
  try {
    return JSON.stringify(daten).slice(0, 500);
  } catch {
    return '';
  }
}

/**
 * Verarbeitet einen Chat-Job im Agent-Modus.
 * Gleicher Vertrag wie processChatJob: streamt Events an service.notifySubscribers,
 * persistiert über llmJobService (updateJobContent/completeJob).
 */
async function processAgentChatJob(ctx, job) {
  // Plan 023 D6: EINE Anfrage je Auftrag, nicht je Werkzeugrunde. Ein Auftrag
  // ist eine Frage des Nutzers; eine Antwort darauf kann bis zu MAX_RUNDEN
  // Runden brauchen, und jede einzelne zu zaehlen hiesse, dass eine gewoehnliche
  // agentische Antwort (suchen, lesen, schreiben) allein schon die Schwelle
  // fuer die lange Haltezeit reisst. Die Stufe dazwischen waere damit vom
  // Agentenpfad aus nie erreichbar.
  //
  // Waehrend der Auftrag laeuft, schuetzt ohnehin `activeRequests` vor dem
  // Entladen; die Haltezeit zaehlt erst danach.
  try {
    require('./modelLifecycleService').anfrageGesehen();
  } catch {
    /* ohne Lebenszyklus laeuft der Auftrag trotzdem */
  }

  const { database, logger: log, llmJobService } = ctx.deps;
  const service = ctx.service;
  const { id: jobId, request_data: requestData, requested_model } = job;

  // --- Kontext: aktives Projekt, Ablage-Wurzel, Ziel-Ordner, Wissensräume ----
  const projectId = await projectService.getActiveProjectId();
  // Scope der Wissensraum-Suche: ein per Drag gesetzter Ordner-Fokus
  // (space_ids) hat Vorrang; sonst alle Ordner des aktiven Projekts. NIE mit
  // leerer Liste weiterarbeiten — rag_suche behandelt [] als „ohne Filter"
  // und suchte dann über ALLE Räume (RAG-Isolationsregel). Der Sentinel hält
  // ein ordnerloses Projekt auf sich selbst gescopt (wie routes/rag.js).
  const EMPTY_SCOPE_SENTINEL = '00000000-0000-0000-0000-000000000000';
  let spaceIds =
    Array.isArray(requestData.space_ids) && requestData.space_ids.length > 0
      ? requestData.space_ids
      : projectId
        ? await projectService.getProjectSpaceIds(projectId)
        : [];
  if (spaceIds.length === 0) {
    spaceIds = [EMPTY_SCOPE_SENTINEL];
  }
  const wurzel = await projektOrdner(projectId);
  // Strenge Ordner-Bindung (Plan 019 · Phase 2): angehängter Ordner = Wurzel.
  const { arbeitsOrdner, zielPrefix, roots, scoped } = deriveRoots(wurzel, requestData.ablage_ziel);
  if (scoped) {
    await fs.mkdir(arbeitsOrdner, { recursive: true });
  }

  const alleTools = [...buildTools(AGENT_WERKZEUGE), new TodoListeTool()];
  const toolByName = new Map(alleTools.map(t => [t.name, t]));
  const toolDefs = alleTools.map(t => t.toOllamaToolDefinition());

  // --- Schritt-Protokoll: live als SSE, am Ende persistiert -----------------
  const schritte = [];
  let schrittZaehler = 0;
  const dateien = [];
  // Cursor-Darstellung (Plan 019): jeder Werkzeug-Schritt der obersten Ebene
  // gehört zur gerade aktiven Aufgabe (Todo). `aktiveTaskIndex` zeigt auf den
  // Index der Aufgabe, die läuft (bzw. der nächsten offenen) — er wird bei
  // jedem Todo-Update in `setTodos` nachgezogen. So kann das Frontend die
  // Schritte GRUPPIERT unter ihrer Aufgabe zeigen, statt als flachen Strom.
  let aktiveTaskIndex = null;
  const stepRecorder = {
    beginnen: async ({ kind, name = '', input = {}, parentStepId = null, modell = null }) => {
      schrittZaehler += 1;
      const step = {
        id: schrittZaehler,
        kind,
        name,
        input: kurzInput(input, KURZ_INPUT),
        parent_step_id: parentStepId,
        // Nur Schritte der obersten Ebene hängen an einer Aufgabe; Kind-Schritte
        // (Subagent-Innereien) hängen an ihrem Eltern-Schritt, nicht an einer Todo.
        task_index:
          parentStepId == null && kind !== 'todos' && kind !== 'plan' ? aktiveTaskIndex : null,
        modell,
        status: 'laeuft',
      };
      schritte.push(step);
      service.notifySubscribers(jobId, { type: 'agent_step', phase: 'start', step });
      return step;
    },
    abschliessen: async ({ stepId, output = null, rawOutput: _raw = null, status = 'fertig' }) => {
      const step = schritte.find(s => s.id === stepId);
      if (step) {
        step.status = status;
        step.output = kurz(output ?? '', KURZ_OUTPUT);
        service.notifySubscribers(jobId, { type: 'agent_step', phase: 'end', step });
      }
      return step;
    },
  };

  // Abbruch-Knopf: Der Nutzer kann den Lauf jederzeit stoppen (DELETE
  // /llm/jobs/:id setzt status='cancelled'). Ein Poller sieht das und reißt
  // über das Signal den laufenden Modell-Stream und alle Subagenten mit ab.
  const abbruch = new AbortController();
  let abgebrochen = false;
  // Plan 023 E1: WARUM abgebrochen wurde. Bisher gab es nur das Ob, und
  // deshalb sah ein Nutzer-Stopp im Chat genauso aus wie ein Zeitlimit.
  let abbruchGrund = 'nutzer';
  let abbruchDetail = '';
  let abbruchKennung = null;
  const laufBegonnen = Date.now();
  abbruch.signal.addEventListener('abort', () => {
    abgebrochen = true;
  });
  // Plan 022 — Generierungs-Metriken über ALLE Modell-Runden summieren
  // (Plan-Runde + Werkzeug-Runden), damit die Tokens/Sekunde am Ende den
  // ganzen Agent-Lauf widerspiegeln, nicht nur die letzte Runde.
  let evalTokensGesamt = 0;
  let evalDauerNsGesamt = 0;
  // Plan 023 D7 — der Vorlauf der ERSTEN Runde ist die Zahl, um die es geht:
  // Systemprompt, Werkzeugbeschreibungen, Zusatzkontext und Verlauf, also
  // alles, was der Nutzer bezahlt, bevor das erste Wort kommt. Spätere Runden
  // wachsen um die Werkzeugergebnisse und sagen darüber nichts.
  let vorlaufErsteRunde = 0;
  let vorlaufDauerErsteNs = 0;
  let vorlaufGesamt = 0;
  // Plan 023 D7, aus der Review von #451: `context_length` ist im Schema als
  // ZEICHENZAHL dokumentiert (`030_model_performance_metrics.sql`), und
  // `llmOllamaStream` schreibt dort `prompt.length`. Wer hier die Tokenzahl
  // hineinschreibt, gibt derselben Spalte je nach Pfad zwei Bedeutungen. Die
  // Tokenzahl steht ohnehin in `llm_jobs.prompt_tokens`.
  //
  // Gezaehlt werden nur die Nachrichten. Werkzeugbeschreibungen gehen als
  // eigener `tools`-Parameter an Ollama und stehen in keiner Nachricht; sie
  // sind laut der Messung weiter unten in diesem Plan rund 59 Prozent des
  // Grundprompts. `context_length` untertreibt die echte Prompt-Groesse also
  // und ist nicht mit `prompt_tokens` derselben Zeile vergleichbar. Der
  // einfache Chatpfad hat dieselbe Luecke. Steht auch am Spaltenkommentar in
  // 030_model_performance_metrics.sql.
  let zeichenErsteRunde = 0;
  const zeichenZaehlen = nachrichten =>
    Array.isArray(nachrichten)
      ? nachrichten.reduce((summe, n) => summe + String(n?.content ?? '').length, 0)
      : 0;
  const metrikSammeln = (ergebnis, gesendeteNachrichten) => {
    if (!ergebnis) {
      return;
    }
    evalTokensGesamt += Number(ergebnis.evalCount) || 0;
    evalDauerNsGesamt += Number(ergebnis.evalDurationNs) || 0;
    const vorlauf = Number(ergebnis.promptCount) || 0;
    if (vorlaufErsteRunde === 0 && vorlauf > 0) {
      vorlaufErsteRunde = vorlauf;
      vorlaufDauerErsteNs = Number(ergebnis.promptDurationNs) || 0;
      zeichenErsteRunde = zeichenZaehlen(gesendeteNachrichten);
    }
    vorlaufGesamt += vorlauf;
    // Plan 023 E2: die Schaetzung des Kontext-Haushalts gegen Ollamas eigene
    // Zaehlung halten. Die Differenz ist der Posten, den die Schaetzung nicht
    // sehen kann, allen voran die Werkzeugbeschreibungen: sie gehen als
    // eigener Parameter an Ollama und stehen in keiner Nachricht.
    if (vorlauf > 0 && Array.isArray(gesendeteNachrichten)) {
      const geschaetzt = schaetzeTokens(gesendeteNachrichten);
      const neu = Math.max(0, vorlauf - geschaetzt);
      if (Math.abs(neu - vorlaufAufschlag) > 100) {
        log.info(
          `[KONTEXT] job=${jobId} Aufschlag ${vorlaufAufschlag} auf ${neu} ` +
            `(geschaetzt ${geschaetzt}, gemessen ${vorlauf})`
        );
      }
      vorlaufAufschlag = neu;
    }
  };
  // Sofort-Weg: die Abbruch-Route feuert registrierte AbortController direkt.
  if (typeof llmJobService.registerStream === 'function') {
    llmJobService.registerStream(jobId, abbruch);
  }
  // Fallback-Weg: falls die Registrierung verloren geht (Prozess-Neustart der
  // Route o. Ä.), sieht der Poller den 'cancelled'-Status in der DB.
  const abbruchPoller = setInterval(() => {
    database
      .query('SELECT status FROM llm_jobs WHERE id = $1', [jobId])
      .then(r => {
        if (r.rows[0]?.status === 'cancelled' && !abgebrochen) {
          // Plan 023 E1: dieser Weg ist der Ersatzweg. Dass er greift, heisst,
          // dass die Sofort-Registrierung verloren gegangen ist, und das
          // gehoert ins Protokoll, auch wenn der Abbruch selbst gewollt war.
          abbruchDetail = 'über den Datenbank-Poller erkannt, nicht über die Abbruch-Route';
          abbruch.abort();
        }
      })
      .catch(() => {});
  }, ABBRUCH_POLL_MS);
  abbruchPoller.unref?.();

  // Auto-Eskalation (Interview 2026-07-30): Die Prüf-Rolle — der Schritt, an
  // dem Qualität hängt — läuft auf dem Qualitätsmodell, wenn eines
  // konfiguriert ist. Werkzeug-Runden bleiben auf dem schnellen Modell.
  const qualModell = agentConfig.qualitaetsModell();
  const rollen = qualModell
    ? AGENT_ROLLEN.map(r => (r.name === 'pruefer' ? { ...r, modell: qualModell } : r))
    : AGENT_ROLLEN;

  // Aggressivere Delegation (Plan 019 · Phase 5): das Subagent-Budget ist
  // konfigurierbar (agentConfig.MAX_SUBAGENTEN) — viele kleine Blöcke halten den
  // Hauptkontext schlank; maxTiefe 2 begrenzt die Verschachtelung hart.
  const limits = new RunLimits({
    maxAufrufe: agentConfig.MAX_SUBAGENTEN,
    zeitlimitS: ZEITLIMIT_S,
    maxTiefe: 2,
  });
  const roleContextBase = {
    userId: job.user_id,
    roots,
    // Plan 022 — Snapshots/Undo IMMER am Projekt-Wurzelordner verankern, auch
    // wenn der Agent auf einen Unterordner gebunden ist (scoped). So teilen
    // Agent- und Editor-Änderungen denselben Undo-Stapel je Datei (Schlüssel =
    // projektrelativer Pfad).
    snapshotRoot: wurzel,
    spaceIds,
    slug: 'chat-agent',
    // Subagenten dürfen denken, wenn ihr Modell es kann (Interview 2026-07-30).
    denkenSubagenten: true,
  };
  const context = {
    ...roleContextBase,
    rollen,
    limits,
    depth: 0,
    model: requested_model,
    werkzeugRunden: MAX_RUNDEN,
    roleContextBase,
    stepRecorder,
    signal: abbruch.signal,
  };

  // Terminal projektbeschränkt: Der Flow-Sandbox-Container wird erst
  // bereitgestellt, wenn wirklich ein Befehl laufen soll — einfache Chats
  // zahlen keinen Docker-Aufwand. Einmal aufgebaut, erben Subagenten den
  // Container über roleContextBase (gleiche Objekt-Referenz).
  let terminalBereit = null;
  const stelleTerminalBereit = async () => {
    if (context.containerId) {
      return;
    }
    if (!terminalBereit) {
      // Terminal an DIESELBE Wurzel binden wie die Datei-Werkzeuge (Plan 019 ·
      // Phase 2): cwd + Mount = angehängter Ordner, nicht die ganze Projektablage.
      terminalBereit = ensureFlowSandbox(roots).then(sb => {
        context.containerId = sb.containerId;
        context.cwd = sb.cwd;
        roleContextBase.containerId = sb.containerId;
        roleContextBase.cwd = sb.cwd;
      });
    }
    await terminalBereit;
  };

  // --- System-Prompt (geschichtete Basis + Agent-Arbeitsweise) --------------
  // includeTools:false — der alte '## Tools'-Prompt-Text entfällt; der Agent
  // bekommt seine Werkzeuge STRUKTURELL über den tools-Parameter.
  const basisPrompt = await buildSystemPrompt(database, job.conversation_id, {
    includeTools: false,
  });
  let systemPrompt = (basisPrompt || '') + AGENT_ANWEISUNG;

  // Orchestrator-Protokoll (Interview 2026-07-29): Die Ordnerstruktur des
  // Projekts kommt IMMER in den Kontext — der Server erzwingt das, statt zu
  // hoffen, dass ein 7B-Modell von sich aus nachschaut. So weiß der Agent,
  // was existiert und wohin neue Dateien gehören.
  try {
    // Struktur-Übersicht auf die gebundene Wurzel scopen: ist ein Ordner
    // angehängt, sieht der Agent NUR dessen Baum (relative Pfade) — keine
    // unerreichbaren Projektpfade, die zu „verlässt die erlaubten Ordner" führen.
    const { eintraege, gekuerzt } = await listTree(projectId, { startRel: zielPrefix });
    if (eintraege.length > 0) {
      const zeilen = eintraege
        .slice(0, STRUKTUR_MAX_EINTRAEGE)
        .map(e => (e.typ === 'ordner' ? `${e.pfad}/` : e.pfad));
      const rest = eintraege.length - zeilen.length;
      systemPrompt +=
        `\n\n## Projektordner (Struktur)\n` +
        zeilen.join('\n') +
        (rest > 0 || gekuerzt ? `\n… (${rest > 0 ? rest : 'weitere'} Einträge ausgelassen)` : '');
    } else {
      systemPrompt += `\n\n## Projektordner (Struktur)\n(leer)`;
    }
  } catch (err) {
    log.warn(`[JOB ${jobId}] Struktur-Übersicht fehlgeschlagen: ${err.message}`);
  }
  if (zielPrefix) {
    systemPrompt += `\n\n## Für diese Anfrage\n- Zielordner des Nutzers: "${zielPrefix}". Dein Arbeitsverzeichnis zeigt bereits dorthin, schreibe Dateien mit relativem Pfad.`;
  }
  if (requestData.datei_modus) {
    systemPrompt += zielPrefix
      ? `\n- Datei-Modus: erstelle IN JEDEM FALL eine Datei mit dateien_schreiben (passende Endung) und antworte danach nur mit einem kurzen Bestätigungssatz.`
      : `\n\n## Für diese Anfrage\n- Datei-Modus: erstelle IN JEDEM FALL eine Datei mit dateien_schreiben (passende Endung) und antworte danach nur mit einem kurzen Bestätigungssatz.`;
  }

  // --- Verlauf: letzte Nachrichten, hart gekappt ----------------------------
  const verlaufRoh = (Array.isArray(requestData.messages) ? requestData.messages : [])
    .filter(
      m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map(m => ({ role: m.role, content: kurz(m.content, MAX_MESSAGE_CHARS) }));
  const { verlauf, weggelassen, gekuerzt: verlaufGekuerzt } = verlaufAufBudget(verlaufRoh);
  if (weggelassen > 0 || verlaufGekuerzt > 0) {
    log.info(
      `[JOB ${jobId}] Verlauf auf ${VERLAUF_TOKEN_BUDGET} Token gedeckelt: ` +
        `${verlaufGekuerzt} gekuerzt, ${weggelassen} weggelassen`
    );
  }
  const messages = [{ role: 'system', content: systemPrompt }, ...verlauf];

  const ollamaModel = await zuOllamaName(requested_model);

  // --- Denk-Strom (Interview 2026-07-30: „voller Gedankengang, live") -------
  // Modelle mit Reasoning (qwen3 …) denken sichtbar: thinking-Token gehen live
  // als eigene SSE-Events raus (das UI hat dafür die Gedankengang-Zeile).
  // Coder-Modelle ohne Reasoning liefern stattdessen die Erzähl-Sätze aus
  // Regel 9 — der Nutzer sieht IMMER einen Arbeitsstrom.
  // Einfache Fragen denken nicht (Audit 023, Befund F-28). Die rohe Nachricht
  // statt `verlauf`, weil dort schon gekürzt wurde und die Einstufung an
  // Längenschwellen hängt.
  const letzteNutzerfrage =
    (Array.isArray(requestData.messages) ? requestData.messages : [])
      .filter(m => m && m.role === 'user' && typeof m.content === 'string')
      .pop()?.content || '';
  const denkEntscheidung = agentConfig.sollDenken(ollamaModel, letzteNutzerfrage);
  const denken = denkEntscheidung.denken;
  log.info(`[JOB ${jobId}] Denken ${denken ? 'an' : 'aus'}: ${denkEntscheidung.grund}`);
  let denktGerade = false;
  const onThinking = token => {
    denktGerade = true;
    service.notifySubscribersBatched(jobId, { type: 'thinking', token });
  };
  const denkenEnde = () => {
    if (denktGerade) {
      denktGerade = false;
      service.notifySubscribers(jobId, { type: 'thinking_end' });
    }
  };

  // --- Aufgabenliste (TodoWrite-Muster): Zustand statt flüchtigem Plan ------
  // Der Harness hält die Liste und hängt sie VOR JEDER Runde frisch ans
  // Kontextende — sie kann nicht aus dem Fenster rutschen. Im Schritt-Protokoll
  // lebt sie als EIN Schritt, der bei jeder Änderung aktualisiert wird.
  let todoListe = '';
  let todoStep = null;
  // Wie viele Werkzeug-Runden ist die Aufgabenliste unverändert? Kleinere
  // Modelle (8B/14B) vergessen das Nachpflegen mitten im Lauf; nach ein paar
  // stummen Runden bei noch offenen Punkten wird die Aufforderung verschärft.
  let rundenSeitTodoUpdate = 0;
  const setTodos = (liste, todos) => {
    todoListe = liste;
    rundenSeitTodoUpdate = 0;
    // Aktive Aufgabe bestimmen: danach beginnende Schritte werden ihr über
    // task_index zugeordnet (Grundlage der gruppierten Darstellung, Plan 019).
    aktiveTaskIndex = aktiveTaskIndexAus(todos);
    service.notifySubscribers(jobId, { type: 'agent_todos', liste, todos });
    void (async () => {
      try {
        if (!todoStep) {
          todoStep = await stepRecorder.beginnen({ kind: 'todos', name: 'aufgaben', input: {} });
        }
        await stepRecorder.abschliessen({ stepId: todoStep.id, output: liste });
      } catch (err) {
        log.warn(`[JOB ${jobId}] Aufgabenliste nicht protokolliert: ${err.message}`);
      }
    })();
  };
  context.setTodos = setTodos;

  // --- Token-Fluss: live an Client UND gebatcht in die DB -------------------
  let dbPuffer = '';
  let dbFlushTimer = null;
  /**
   * Ist ueberhaupt schon ein Zeichen an den Nutzer gegangen (Plan 023 E2)?
   *
   * Bis zum 22.08.2026 fragte der Fehlerzweig weiter unten `!fertigText &&
   * !dbPuffer`, und beide sind mitten in einer Runde regelmaessig leer:
   * `fertigText` wird erst am ENDE einer Runde gefuellt, `dbPuffer` leert jeder
   * Schreibtakt nach 800 Millisekunden. Ein Abbruch kurz nach einem
   * Schreibtakt sah deshalb aus wie einer vor dem ersten Wort, der Lauf warf,
   * und der Teiltext ging verloren.
   *
   * Am Geraet gemessen, Job 6e610c80: 260 Zeichen in `llm_jobs.content`, 0 in
   * `chat_messages`, Status `error`. Der Nutzer hatte diese 260 Zeichen kommen
   * sehen. Das ist die gemeldete Meldung, woertlich: sie kommt "einfach", und
   * der Text ist danach weg.
   *
   * Dieses Merkzeichen wird nur gesetzt, nie zurueckgenommen.
   */
  let etwasGestroemt = false;
  const flushDb = async () => {
    if (!dbPuffer) {
      return;
    }
    const delta = dbPuffer;
    dbPuffer = '';
    try {
      await llmJobService.updateJobContent(jobId, delta, null);
    } catch (err) {
      log.warn(`[JOB ${jobId}] Agent-Content-Flush fehlgeschlagen: ${err.message}`);
    }
  };
  const onToken = token => {
    denkenEnde(); // erster Antwort-Token schließt die Gedankengang-Zeile
    if (token) {
      etwasGestroemt = true;
    }
    service.notifySubscribersBatched(jobId, { type: 'response', token });
    dbPuffer += token;
    if (!dbFlushTimer) {
      dbFlushTimer = setTimeout(() => {
        dbFlushTimer = null;
        void flushDb();
      }, 800);
    }
  };
  const separator = () => {
    // Zwischen Erzähl-Text einer Werkzeug-Runde und der Fortsetzung eine
    // Leerzeile — sonst klebt „Ich suche zunächst…Die Ergebnisse zeigen" zusammen.
    onToken('\n\n');
  };

  const deadline = Date.now() + ZEITLIMIT_S * 1000;
  let toolsAktiv = true;
  let fertigText = '';
  // Hat der Text-Tool-Call-Fallback rohes XML aus einer Antwort entfernt?
  // Dann muss am Ende fertigText (bereinigt) den gestreamten Roh-Inhalt in
  // der DB ERSETZEN — der Token-Strom enthielt das XML bereits.
  let inhaltBereinigt = false;
  let pruefZyklen = 0;
  let nachfassZyklen = 0;
  // Fortschritts-Wächter (F-06): Signatur der letzten Werkzeug-Runde + eine
  // Fortschritts-Marke (Anzahl gemeldeter Dateien + aktuelle Todo-Liste). Bleibt
  // beides mehrere Runden gleich, steht der Lauf → sauber beenden.
  let letzteToolSignatur = null;
  let letzteFortschrittMarke = null;
  let stagnation = 0;

  // --- Kontext-Haushalt (Harness v2) ----------------------------------------
  // Das Nachrichten-Array wächst über die Runden — jede Werkzeug-Ausgabe bleibt
  // sonst bis zum Ende resident und lange Läufe sterben am stillen Ollama-
  // Truncate (der zuerst den System-Prompt frisst). Deshalb: grob Token
  // schätzen und über der Schwelle ALTE Werkzeug-Ausgaben eindampfen; die
  // jüngsten Züge und der System-Prompt bleiben unangetastet. Die Details
  // stehen weiterhin im Schritt-Protokoll.
  const schaetzeTokens = list =>
    list.reduce((n, m) => n + Math.ceil(String(m.content || '').length / 3.2) + 8, 0);
  /**
   * Was die Schaetzung UNTERSCHLAEGT, aus Ollamas eigener Zaehlung (Plan 023 E2).
   *
   * Am 22.08.2026 gemessen, Job 6153f7c8: der Zusammenhang erreichte 31 267
   * Token von 32 768, waehrend der Haushalt oben ihn fuer unter 22 937 hielt
   * und deshalb nie eindampfte. Der Grund ist nicht der Zeichenfaktor, sondern
   * ein ganzer Posten, den die Schaetzung gar nicht sieht: die
   * Werkzeugbeschreibungen gehen als eigener `tools`-Parameter an Ollama und
   * stehen in keiner Nachricht. Gemessen sind das rund 2200 Token, also fast
   * ein Zehntel des Budgets, in JEDER Runde.
   *
   * Statt diese Zahl abzuschreiben und beim naechsten Werkzeug falsch zu haben,
   * wird sie nach jeder Runde nachgemessen: Ollama liefert `prompt_eval_count`
   * in jedem Abschluss-Block. Die Differenz zur eigenen Schaetzung ist der
   * Aufschlag, und er enthaelt beides, die Werkzeuge und den Fehler des
   * Zeichenfaktors.
   */
  let vorlaufAufschlag = 0;
  let kompaktierungGemeldet = false;
  const kontextHaushalt = () => {
    const budget = Math.floor(agentConfig.NUM_CTX * agentConfig.KONTEXT_SCHWELLE);
    const belegt = () => schaetzeTokens(messages) + vorlaufAufschlag;
    if (belegt() <= budget) {
      return;
    }
    log.info(
      `[KONTEXT] job=${jobId} eindampfen: geschaetzt=${schaetzeTokens(messages)} ` +
        `aufschlag=${vorlaufAufschlag} budget=${budget}`
    );
    const SCHUTZ = 6; // die jüngsten Nachrichten bleiben immer vollständig
    for (let i = 1; i < messages.length - SCHUTZ && belegt() > budget; i++) {
      const m = messages[i];
      if (m.role === 'tool' && typeof m.content === 'string' && m.content.length > 700) {
        m.content = `${m.content.slice(0, 400)}\n… [ältere Werkzeug-Ausgabe gekürzt, Details im Schritt-Protokoll]`;
      }
    }
    for (let i = 1; i < messages.length - SCHUTZ && belegt() > budget; i++) {
      const m = messages[i];
      if (
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.length > 900
      ) {
        m.content = `${m.content.slice(0, 600)}\n… [gekürzt]`;
      }
    }
    if (!kompaktierungGemeldet) {
      kompaktierungGemeldet = true;
      service.notifySubscribers(jobId, {
        type: 'compaction',
        message: 'Kontext eingedampft: ältere Werkzeug-Ausgaben wurden gekürzt.',
      });
    }
  };

  // --- Platten-Wahrheit: Welche Dateien hat dieser Lauf WIRKLICH angelegt? ---
  // Kleine Modelle behaupten gern Erfolge („HTML-Datei erstellt"), ohne je
  // dateien_schreiben gerufen zu haben — gerade in Subagenten. Deshalb zählt
  // nicht die Behauptung, sondern der Baum-Vergleich: vor/nach Subagenten und
  // am Ende des Laufs. Gefundene neue/geänderte Dateien werden zu Karten und
  // füttern das Prüf-Gate; ein „erfolgreicher" Autor ohne Dateiänderung
  // bekommt die Wahrheit als Warnung ins Ergebnis zurück.
  const gemeldeteDateien = new Set(dateien.map(x => x.pfad));
  const leseSnapshot = async () => {
    try {
      const { eintraege } = await listTree(projectId);
      return new Map(
        eintraege.filter(e => e.typ === 'datei').map(e => [e.pfad, `${e.groesse}:${e.geaendert}`])
      );
    } catch {
      return null;
    }
  };
  // Prüft, ob eine (vermeintlich gelöschte) Datei auf der Platte noch existiert.
  // Der Baum-Abzug (listTree) ist gedeckelt; er ist keine verlässliche Quelle
  // für Löschungen. Die Platte ist es.
  const existiertNoch = async pfad => {
    try {
      await fs.stat(path.join(wurzel, pfad));
      return true;
    } catch {
      return false;
    }
  };
  const meldeNeueDateien = async (vorher, nachher) => {
    if (!vorher || !nachher) {
      return 0;
    }
    let geaendertGesamt = 0;
    const melde = (pfad, aenderung) => {
      if (gemeldeteDateien.has(pfad)) {
        return;
      }
      gemeldeteDateien.add(pfad);
      const datei = {
        art: 'projektdatei',
        project_id: projectId,
        pfad,
        name: path.posix.basename(pfad),
        // Kategorie für die Änderungs-Übersicht im Chat (Agent-UX 2026-08-02):
        // neu | geaendert | geloescht — dieselbe Sprache wie bei Flow-Läufen.
        aenderung,
      };
      dateien.push(datei);
      service.notifySubscribers(jobId, { type: 'agent_datei', datei });
    };
    for (const [pfad, sig] of nachher) {
      if (!vorher.has(pfad)) {
        geaendertGesamt += 1;
        melde(pfad, 'neu');
      } else if (vorher.get(pfad) !== sig) {
        geaendertGesamt += 1;
        melde(pfad, 'geaendert');
      }
    }
    // Gelöschte Dateien nicht verschlucken — sie sind genauso eine Änderung,
    // die der Nutzer sehen muss (vorher unsichtbar verpufft). ABER: der
    // Baum-Abzug ist gedeckelt („Liste gekürzt"). Legt der Lauf eine neue Datei
    // an, verschiebt sich die Kappungsgrenze und eine Randdatei fällt aus dem
    // nachher-Abzug — ohne je gelöscht worden zu sein. Sonst meldeten wir dem
    // Nutzer fälschlich, der Agent habe eine fremde Datei gelöscht. Darum jede
    // vermeintliche Löschung gegen die Platte gegenprüfen.
    for (const pfad of vorher.keys()) {
      if (!nachher.has(pfad)) {
        if (await existiertNoch(pfad)) {
          continue;
        }
        geaendertGesamt += 1;
        melde(pfad, 'geloescht');
      }
    }
    return geaendertGesamt;
  };
  const snapshotStart = await leseSnapshot();

  /**
   * Lässt die pruefer-Rolle das Ergebnis gegen den Auftrag prüfen.
   * @returns {Promise<string|null>} Mängel-Text oder null (in Ordnung/Prüfung unmöglich).
   */
  const pruefeErgebnis = async antwortText => {
    const subagentTool = toolByName.get('subagent');
    if (!subagentTool) {
      return null;
    }
    const dateiListe = dateien.map(x => x.pfad).join(', ');
    const auftrag =
      `Auftrag des Nutzers: "${kurz(letzteNachricht, 600)}". ` +
      `Erstellte Datei(en): ${dateiListe}. ` +
      `Kurzfassung der Antwort: "${kurz(antwortText || '', 300)}". ` +
      'Lies die Datei(en) und prüfe, ob sie den Auftrag erfüllen. Prüfe NUR gegen ' +
      'die AUSDRÜCKLICHEN Anforderungen des Auftrags, erfinde keine zusätzlichen ' +
      '(Struktur, Überschriften, Umfang, Stil). Erfüllt die Datei das Verlangte, ' +
      'antworte OK, auch wenn du selbst mehr geschrieben hättest.';
    try {
      const urteil = String(await subagentTool.execute({ rolle: 'pruefer', auftrag }, context));
      return /MANGEL/i.test(urteil) && !/^\s*OK\b/.test(urteil) ? urteil : null;
    } catch (err) {
      log.warn(`[JOB ${jobId}] Prüf-Schritt fehlgeschlagen: ${err.message}`);
      return null;
    }
  };

  // Erzwungener Plan-Schritt (Orchestrator-Protokoll): Bei erkennbar
  // komplexen Aufträgen plant das Modell ERST in einer werkzeuglosen Runde —
  // der Plan wird als Schritt-Zeile gezeigt und bindet die Arbeitsrunden.
  // Kleine Modelle überspringen sonst Recherche und erfinden Inhalte.
  const letzteNachricht = String(verlauf[verlauf.length - 1]?.content || '');
  // Proportionalität (2026-08-01): Nicht jedes "Erstelle …" verdient die
  // teure Qualitätsmodell-Plan-Runde mit Thinking (live gemessen: >5 Minuten
  // Grübeln für eine Drei-Zeilen-Datei). Zwei Stufen:
  //  GROSS  → Recherche/Subagenten/Mehrteiler: Plan auf dem Qualitätsmodell,
  //           mit Thinking, Deckel PLAN_NUM_PREDICT_GROSS.
  //  KOMPLEX→ kleine Erstell-Aufgaben: knapper Plan auf dem Arbeitsmodell,
  //           ohne Thinking, Deckel PLAN_NUM_PREDICT_KLEIN.
  const istGross =
    letzteNachricht.length > 600 ||
    /recherchier|subagent|handbuch|webseite|newsletter|analysier|überarbeit|kapitel|abschnitt|mehrere\s+dateien/i.test(
      letzteNachricht
    );
  const istKomplex =
    istGross ||
    requestData.datei_modus ||
    letzteNachricht.length > 280 ||
    /erstell|schreib|generier|entwickl|entwirf|bau(e|t)?\b|zusammenfass|bericht|dokument|skript/i.test(
      letzteNachricht
    );

  try {
    if (istKomplex && toolsAktiv && !abgebrochen) {
      const planStep = await stepRecorder.beginnen({ kind: 'plan', name: 'plan', input: {} });
      try {
        // Auto-Eskalation: die Plan-Runde — der Schritt mit dem größten
        // Qualitäts-Hebel — läuft auf dem Qualitätsmodell, wenn konfiguriert.
        // Der Plan-Text streamt als Gedankengang live ins UI (nicht als
        // Antwort): der Nutzer sieht das Modell planen, die Antwort bleibt sauber.
        const planOllama = istGross && qualModell ? await zuOllamaName(qualModell) : ollamaModel;
        // In einer Variablen, damit die Zeichenzahl derselben Nachrichten
        // gemessen werden kann, die auch gesendet wurden.
        const planNachrichten = [
          ...messages,
          {
            role: 'user',
            content: istGross
              ? 'Erstelle ZUERST einen knappen nummerierten Plan (3-6 Schritte) für diesen ' +
                'Auftrag: welche Werkzeuge/Subagenten du nutzt, welche Quellen du liest, ' +
                'welche Dateien du wohin schreibst. NUR den Plan, keine Ausführung.'
              : 'Nenne in 2-4 knappen nummerierten Schritten, wie du diesen Auftrag ' +
                'ausführst (Werkzeug + Zieldatei). NUR die Schritte, keine Ausführung, ' +
                'keine Abwägungen.',
          },
        ];
        const planErgebnis = await streamChatRound({
          model: planOllama,
          messages: planNachrichten,
          tools: [],
          think: istGross && agentConfig.thinkingGewuenscht() && agentConfig.kannDenken(planOllama),
          numPredict: istGross
            ? agentConfig.PLAN_NUM_PREDICT_GROSS
            : agentConfig.PLAN_NUM_PREDICT_KLEIN,
          onThinking,
          onToken: token => onThinking(token), // Plan-Text in die Gedankengang-Zeile
          signal: abbruch.signal,
          jobId,
        });
        denkenEnde();
        metrikSammeln(planErgebnis, planNachrichten);
        const plan = (planErgebnis.content || '').trim();
        await stepRecorder.abschliessen({ stepId: planStep.id, output: plan || '(kein Plan)' });
        if (plan) {
          messages.push({ role: 'assistant', content: `Mein Plan:\n${plan}` });
          messages.push({
            role: 'user',
            content:
              'Gut. Führe den Plan jetzt vollständig aus. Hake nach jedem erledigten ' +
              'Schritt die Aufgabenliste mit todo_liste ab.',
          });
          // Plan → Aufgabenliste, deterministisch durch den Harness: Die
          // nummerierten Plan-Schritte werden sofort das Aufgaben-Panel,
          // statt darauf zu hoffen, dass das Modell todo_liste selbst ruft
          // (live beobachtet: es malt sonst nur Checkboxen in den Text).
          if (!todoListe) {
            const schritte = plan
              .split('\n')
              .map(zeile => zeile.match(/^\s*(?:\d+[.)]|[-*])\s+(.+)$/))
              .filter(Boolean)
              .map(m => m[1].replace(/\*\*/g, '').trim())
              .filter(s => s.length > 3)
              .slice(0, 12);
            if (schritte.length >= 2) {
              const liste = schritte.map(s => `- [ ] ${s}`).join('\n');
              setTodos(
                liste,
                schritte.map(text => ({ text, status: 'offen' }))
              );
            }
          }
        }
      } catch (err) {
        await stepRecorder.abschliessen({
          stepId: planStep.id,
          output: `Fehler: ${err.message}`,
          status: 'fehler',
        });
        if (abgebrochen) {
          throw err;
        }
        if (istToolsNichtUnterstuetzt(err)) {
          toolsAktiv = false;
        }
      }
    }

    // Die Laufvariable steht ABSICHTLICH ausserhalb der Schleife (Plan 023 E1):
    // nur so laesst sich danach unterscheiden, ob die Schleife regulaer
    // verlassen wurde (`break`, dann ist runde < MAX_RUNDEN) oder ob ihr die
    // Runden ausgegangen sind (dann ist runde === MAX_RUNDEN). Das war die
    // vierte stille Stelle: der Lauf endete ohne Abschlusssatz, und die
    // Antwort hoerte fuer den Nutzer einfach auf.
    let runde = 0;
    for (; runde < MAX_RUNDEN; runde++) {
      if (abgebrochen) {
        // Plan 023 E2, gefunden bei der Live-Abnahme: ein Abbruch ZWISCHEN
        // zwei Runden verlaesst die Schleife hier, ohne zu werfen. Der
        // catch-Zweig weiter unten laeuft also nie, und ohne diese Zeilen
        // bekaeme der Nutzer den nackten Satz `_Abgebrochen._` ohne Grund und
        // ohne Kennung, also genau das, was E1 abgeschafft hat. Am Geraet
        // gemessen an einem Lauf, den der Stopp-Knopf nach 32 Minuten beendet
        // hat.
        abbruchKennung = abbruchMelden({
          log,
          jobId,
          grund: abbruchGrund,
          quelle: 'chatAgentRunner.zwischenRunden',
          detail: abbruchDetail || `nach Runde ${runde}`,
          nachMs: Date.now() - laufBegonnen,
          fehler: abbruchGrund !== 'nutzer',
        });
        onToken(abbruchText(abbruchGrund, abbruchKennung));
        await abbruchFesthalten({
          database,
          log,
          jobId,
          grund: abbruchGrund,
          kennung: abbruchKennung,
          detail: abbruchDetail || `nach Runde ${runde}`,
        });
        break;
      }
      if (Date.now() >= deadline) {
        abbruchGrund = 'lauf_zeitlimit';
        abbruchDetail = `Zeitlimit ${ZEITLIMIT_S}s, Runde ${runde + 1}`;
        const k = abbruchMelden({
          log,
          jobId,
          grund: abbruchGrund,
          quelle: 'chatAgentRunner.rundenSchleife',
          detail: abbruchDetail,
          nachMs: Date.now() - laufBegonnen,
        });
        onToken(abbruchText(abbruchGrund, k));
        await abbruchFesthalten({
          database,
          log,
          jobId,
          grund: abbruchGrund,
          kennung: k,
          detail: abbruchDetail,
        });
        break;
      }

      // Kontext-Haushalt VOR jeder Runde; die Aufgabenliste kommt danach
      // frisch ans Ende — sie ist Zustand des Harness, nicht des Verlaufs.
      kontextHaushalt();
      // Verschärfte Erinnerung, wenn die Liste offene Punkte hat und mehrere
      // Runden lang nicht angefasst wurde (kleine Modelle „vergessen"
      // todo_liste). Der Punkt-in-Arbeit-Marker `[~]` zählt nicht als offen.
      const rundenMessages = todoListe
        ? [
            ...messages,
            {
              role: 'system',
              content:
                `## Aufgabenliste (aktueller Stand)\n${todoListe}\n` +
                todoErinnerung(todoListe, rundenSeitTodoUpdate),
            },
          ]
        : messages;
      if (todoListe) {
        rundenSeitTodoUpdate += 1;
      }

      let rundenErgebnis;
      try {
        rundenErgebnis = await streamChatRound({
          model: ollamaModel,
          messages: rundenMessages,
          tools: toolsAktiv ? toolDefs : [],
          think: denken,
          onThinking,
          onToken,
          signal: abbruch.signal,
          jobId,
        });
        denkenEnde();
        metrikSammeln(rundenErgebnis, rundenMessages);
      } catch (err) {
        if (toolsAktiv && istToolsNichtUnterstuetzt(err)) {
          // Modell kann keine Werkzeuge — eine werkzeuglose Runde ist der
          // bisherige Chat. Einmal umschalten und weiter.
          log.info(
            `[JOB ${jobId}] Modell ${requested_model} ohne Tool-Support, Agent-Werkzeuge deaktiviert`
          );
          service.notifySubscribers(jobId, {
            type: 'warning',
            message: `Modell "${requested_model}" unterstützt keine Werkzeuge, Antwort ohne Agent-Funktionen.`,
            code: 'AGENT_TOOLS_UNSUPPORTED',
          });
          toolsAktiv = false;
          runde -= 1;
          continue;
        }
        throw err;
      }

      let { content } = rundenErgebnis;
      const { toolCalls } = rundenErgebnis;

      // Fallback: Manche Runden geben den Werkzeug-Aufruf als TEXT aus
      // (fehlendes <tool_call>-Tag → Ollamas Parser greift nicht). Statt das
      // rohe XML als Antwort stehen zu lassen, parsen wir es selbst und
      // führen die Aufrufe normal aus; der Antworttext wird vom XML befreit.
      // Plan 023 E9: die Bedingung hiess bis zum 22.08.2026 `!toolCalls.length
      // && ...`. Eine GEMISCHTE Runde fiel damit durch: ruft das Modell ein
      // Werkzeug richtig auf (etwa todo_liste) und schreibt ein zweites als
      // Text daneben, war `toolCalls.length` groesser als null, der Nachparser
      // lief nicht, und der zweite Aufruf verschwand. Am Geraet gemessen: der
      // Agent meldete "Die Datei notiz.md wurde erfolgreich erstellt", zeigte
      // rohes XML und hatte nichts geschrieben. Genau das verbietet Regel 9
      // der Agent-Anweisung.
      if (enthaeltToolSyntax(content)) {
        const geparst = parseTextToolCalls(content);
        if (geparst.calls.length > 0) {
          log.info(
            `[JOB ${jobId}] Text-Tool-Call-Fallback: ${geparst.calls.length} Aufruf(e) aus Antworttext geparst` +
              (toolCalls.length ? `, neben ${toolCalls.length} regulaeren` : '')
          );
          toolCalls.push(...geparst.calls);
          content = geparst.rest;
          inhaltBereinigt = true;
        } else if (
          !toolCalls.length &&
          nachfassZyklen < MAX_NACHFASS_ZYKLEN &&
          toolsAktiv &&
          !abgebrochen
        ) {
          // Syntax erkannt, aber nicht parsebar — dem Modell eine saubere
          // Wiederholung im echten Werkzeug-Format abverlangen. Nur, wenn die
          // Runde ueberhaupt keinen regulaeren Aufruf hatte: ein verwaistes
          // </tool_call> neben einem richtigen Aufruf ist kein Grund, dem
          // Modell Formatfehler vorzuwerfen und die Runde zu wiederholen.
          nachfassZyklen += 1;
          messages.push({ role: 'assistant', content });
          messages.push({
            role: 'user',
            content:
              'Dein letzter Werkzeug-Aufruf war fehlerhaft formatiert und wurde NICHT ausgeführt. ' +
              'Rufe das Werkzeug jetzt erneut auf, über die Werkzeug-Schnittstelle, nicht als Text.',
          });
          separator();
          continue;
        }
      }
      fertigText += content;

      if (!toolCalls.length) {
        // Platten-Wahrheit nachziehen: auch Dateien aus Terminal-/Subagenten-
        // Arbeit bekommen ihre Karte und zählen für das Prüf-Gate.
        await meldeNeueDateien(snapshotStart, await leseSnapshot());
        // Erzwungener Prüf-Schritt (Orchestrator-Protokoll): Bevor eine Antwort
        // mit erstellten Dateien als fertig gilt, kontrolliert die pruefer-Rolle
        // das Ergebnis. Findet sie Mängel, bekommt das Modell eine Korrektur-
        // Schleife — bis zu MAX_PRUEF_ZYKLEN Mal (Entwurf→Prüfung→Korrektur).
        if (pruefZyklen < MAX_PRUEF_ZYKLEN && dateien.length > 0 && toolsAktiv && !abgebrochen) {
          pruefZyklen += 1;
          const mangel = await pruefeErgebnis(content);
          if (mangel) {
            messages.push({ role: 'assistant', content });
            messages.push({
              role: 'user',
              content:
                `Ein automatischer Prüfer hat Mängel gefunden:\n${kurz(mangel, 1500)}\n` +
                'Behebe sie jetzt: überschreibe die betroffenen Dateien mit dateien_schreiben ' +
                'und bestätige danach mit einem Satz.',
            });
            separator();
            fertigText += '\n\n';
            continue;
          }
        }
        // Ankündigungs-Wächter: kleine Modelle beenden Aufträge gern mit
        // „Ich schreibe die Datei jetzt …" statt zu handeln. Eine angekündigte
        // Aktion ohne Werkzeug-Aufruf bekommt bis zu MAX_NACHFASS_ZYKLEN
        // Nachfass-Runden.
        const kuendigtNurAn =
          /\b(ich\s+(schreibe|erstelle|lege|speichere|kopiere|beginne)|jetzt\s+(schreibe|erstelle|lege|speichere)|werde\s+ich\s+(die|den|das)?\s*\w*\s*(schreiben|erstellen|anlegen|speichern))\b/i.test(
            content || ''
          );
        if (nachfassZyklen < MAX_NACHFASS_ZYKLEN && kuendigtNurAn && toolsAktiv && !abgebrochen) {
          nachfassZyklen += 1;
          messages.push({ role: 'assistant', content });
          messages.push({
            role: 'user',
            content:
              'Du hast eine Aktion nur ANGEKÜNDIGT, aber nicht ausgeführt. ' +
              'Führe sie JETZT mit deinen Werkzeugen aus (z. B. dateien_schreiben) ' +
              'und antworte erst danach mit dem Ergebnis, ohne weitere Ankündigungen.',
          });
          separator();
          fertigText += '\n\n';
          continue;
        }
        // F-06: Echter Abschluss (Modell fertig, keine Werkzeuge mehr, Prüf-/
        // Nachfass-Zyklen durch). Offene Todos deterministisch abhaken, damit die
        // Leiste nicht auf „1/2" hängenbleibt. Nur HIER — nicht bei Abbruch,
        // Fehler oder Rundenlimit, damit ein echt unfertiger Lauf ehrlich bleibt.
        // `!abgebrochen`: das vorangehende `await leseSnapshot()` gibt die
        // Event-Loop frei — bricht der Nutzer genau dann ab, dürfen wir die
        // Todos nicht doch noch als „fertig" persistieren.
        if (!abgebrochen && todoListe && parseTodos(todoListe).some(t => t.status !== 'fertig')) {
          const erledigt = alleTodosErledigt(todoListe);
          setTodos(erledigt, parseTodos(erledigt));
        }
        break; // fertige Antwort — Token sind bereits gestreamt
      }

      // F-06: Fortschritts-Wächter. Greift NUR, wenn mehrere Runden exakt
      // dieselben Werkzeug-Aufrufe machen und dabei NICHTS entsteht (keine neue/
      // geänderte Datei, keine Todo-Änderung) — der Bug-Fall „Output scheitert →
      // Eskalation/Subagent wiederholt sich endlos". Kein Zeitlimit.
      const toolSignatur = berechneToolSignatur(toolCalls);
      const fortschrittMarke = `${dateien.length}::${todoListe}`;
      if (toolSignatur === letzteToolSignatur && fortschrittMarke === letzteFortschrittMarke) {
        stagnation += 1;
      } else {
        stagnation = 0;
      }
      letzteToolSignatur = toolSignatur;
      letzteFortschrittMarke = fortschrittMarke;
      if (stagnation >= MAX_STAGNATION) {
        // Plan 023 E1: die fuenfte Stelle, an der ein Lauf endet. Der Plan
        // nannte vier; diese hier hatte schon einen deutschen Satz, aber keine
        // Kennung, war also im Protokoll nicht wiederzufinden.
        const k = abbruchMelden({
          log,
          jobId,
          grund: 'kein_fortschritt',
          quelle: 'chatAgentRunner.fortschrittsWaechter',
          detail: `${stagnation + 1} gleiche Runden in Folge, Signatur ${kurz(toolSignatur, 120)}`,
          nachMs: Date.now() - laufBegonnen,
        });
        service.notifySubscribers(jobId, {
          type: 'warning',
          message:
            'Der Lauf kam nicht weiter (mehrere Schritte ohne Fortschritt) und wurde beendet.',
          code: 'AGENT_KEIN_FORTSCHRITT',
        });
        onToken(
          '\n\n_Ich komme hier nicht weiter, die letzten Schritte brachten keinen Fortschritt. ' +
            `Bitte formuliere den Auftrag anders oder teile ihn in kleinere Teile. Kennung ${k}._`
        );
        await abbruchFesthalten({
          database,
          log,
          jobId,
          grund: 'kein_fortschritt',
          kennung: k,
          detail: `${stagnation + 1} gleiche Runden in Folge`,
        });
        break;
      }

      messages.push({ role: 'assistant', content, tool_calls: toolCalls });
      if (content) {
        separator();
        fertigText += '\n\n';
      }

      for (const call of toolCalls) {
        if (abgebrochen) {
          break;
        }
        const toolName = call.function?.name;
        let params = call.function?.arguments || {};
        if (typeof params === 'string') {
          try {
            params = JSON.parse(params);
          } catch {
            params = {};
          }
        }

        const istSubagent = toolName === 'subagent';
        let step = null;
        if (!istSubagent) {
          step = await stepRecorder.beginnen({
            kind: 'werkzeug',
            name: toolName || '',
            input: params,
          });
        }

        const tool = toolByName.get(toolName);
        let result;
        if (!tool) {
          result = `Fehler: Werkzeug "${toolName}" steht nicht zur Verfügung.`;
        } else {
          try {
            // Terminal (auch für die entwickler-Rolle) braucht den
            // projektbeschränkten Sandbox-Container — erst beim ersten Bedarf.
            if (toolName === 'terminal' || (istSubagent && params.rolle === 'entwickler')) {
              await stelleTerminalBereit();
            }
            const vorher = istSubagent ? await leseSnapshot() : null;
            result = await tool.execute(params, context);
            if (istSubagent) {
              // Platten-Wahrheit statt Subagenten-Behauptung: neue Dateien
              // melden; ein Schreib-Auftrag ohne Dateiänderung wird als solcher
              // benannt, damit der Orchestrator selbst schreibt statt dem
              // erfundenen Erfolg zu glauben.
              const geaendert = await meldeNeueDateien(vorher, await leseSnapshot());
              const sollteSchreiben = params.rolle === 'autor' || params.rolle === 'entwickler';
              if (sollteSchreiben && geaendert === 0 && !/^Fehler/.test(String(result || ''))) {
                result =
                  `${result}\n\nWARNUNG (Platten-Prüfung): Der Subagent hat KEINE Datei ` +
                  'geschrieben oder geändert, sein Erfolgsbericht stimmt nicht. Erstelle die ' +
                  'Datei jetzt SELBST mit dateien_schreiben (vollständiger Inhalt, relativer Pfad).';
              }
            }
          } catch (err) {
            // Plan 023 E1: feste Form, damit sich Werkzeugfehler zaehlen
            // lassen. Wichtig dabei: ein Werkzeugfehler beendet den Lauf NICHT.
            // Er wird dem Modell als Text zurueckgegeben, das Modell versucht
            // etwas anderes. Der Plan zaehlte diese Stelle zu den vier Orten,
            // an denen ein Lauf endet; gemessen endet er hier nie. Was hier
            // wirklich passiert, sieht man erst im Fortschritts-Waechter
            // weiter oben, wenn dasselbe Werkzeug mehrfach gleich scheitert.
            log.warn(
              `[WERKZEUGFEHLER] job=${jobId} werkzeug=${toolName} ` +
                `detail=${JSON.stringify(String(err.message).slice(0, 300))}`
            );
            result = `Fehler bei "${toolName}": ${err.message}`;
          }
        }
        result = result == null ? '' : String(result);

        if (step) {
          await stepRecorder.abschliessen({
            stepId: step.id,
            output: result,
            status: result.startsWith('Fehler') ? 'fehler' : 'fertig',
          });
        }

        // Geschriebene Ablage-Datei → Datei-Karte (live + persistiert). Nur für
        // saubere RELATIVE Pfade: der Pfad ist relativ zur (einzigen) Wurzel und
        // wird unten mit `zielPrefix` wieder projekt-relativ zusammengesetzt.
        // Ein absoluter Pfad ließe die Karte auf einen falschen Pfad zeigen
        // (und wird von den Werkzeugen bei strenger Bindung ohnehin abgelehnt).
        const pfadStr = String(params.pfad || '');
        const schreibWerkzeug =
          toolName === 'dateien_schreiben' ||
          toolName === 'dateien_bearbeiten' ||
          toolName === 'dateien_anhaengen';
        if (
          schreibWerkzeug &&
          !/^Fehler/.test(result) &&
          pfadStr &&
          !path.isAbsolute(pfadStr) &&
          !pfadStr.split('/').includes('..')
        ) {
          const relPfad = zielPrefix ? path.posix.join(zielPrefix, pfadStr) : pfadStr;
          if (!gemeldeteDateien.has(relPfad)) {
            gemeldeteDateien.add(relPfad);
            const datei = {
              art: 'projektdatei',
              project_id: projectId,
              pfad: relPfad,
              name: path.posix.basename(relPfad),
              // Gab es die Datei beim Lauf-Start schon? Dann ist das eine
              // Änderung, sonst eine Neuanlage — fürs Badge der Datei-Karte.
              ...(snapshotStart
                ? { aenderung: snapshotStart.has(relPfad) ? 'geaendert' : 'neu' }
                : {}),
            };
            dateien.push(datei);
            service.notifySubscribers(jobId, { type: 'agent_datei', datei });
          }
        }

        messages.push({ role: 'tool', content: result });
      }
    }
    // Plan 023 E1: die vierte stille Stelle. Laeuft die Schleife bis
    // MAX_RUNDEN durch, endet der Lauf ohne Abschlusssatz des Modells, und
    // der Nutzer sah eine Antwort, die einfach aufhoert. Der Zaehler steht
    // nach der Schleife auf MAX_RUNDEN; ein Abbruch oder ein regulaeres Ende
    // haette sie vorher verlassen.
    if (!abgebrochen && runde >= MAX_RUNDEN) {
      const k = abbruchMelden({
        log,
        jobId,
        grund: 'runden_ende',
        quelle: 'chatAgentRunner.rundenSchleife',
        detail: `${MAX_RUNDEN} Werkzeug-Runden ohne Abschluss`,
        nachMs: Date.now() - laufBegonnen,
      });
      onToken(abbruchText('runden_ende', k));
      await abbruchFesthalten({
        database,
        log,
        jobId,
        grund: 'runden_ende',
        kennung: k,
        detail: `${MAX_RUNDEN} Werkzeug-Runden ohne Abschluss`,
      });
    }
  } catch (err) {
    if (dbFlushTimer) {
      clearTimeout(dbFlushTimer);
      dbFlushTimer = null;
    }
    if (abgebrochen) {
      // Nutzer-Abbruch ist kein Fehler: bisherigen Text und Schritte behalten.
      // Plan 023 E1: trotzdem mit Grund und Kennung, denn `abgebrochen` wird
      // auch vom Poller gesetzt, wenn irgendetwas anderes den Job auf
      // 'cancelled' gestellt hat. Genau diese beiden Faelle waren im Chat
      // bisher nicht auseinanderzuhalten.
      const k = abbruchMelden({
        log,
        jobId,
        grund: abbruchGrund,
        quelle: 'chatAgentRunner.abbruch',
        detail: abbruchDetail || err.message,
        nachMs: Date.now() - laufBegonnen,
        fehler: abbruchGrund !== 'nutzer',
      });
      abbruchKennung = k;
      onToken(abbruchText(abbruchGrund, k));
      await abbruchFesthalten({
        database,
        log,
        jobId,
        grund: abbruchGrund,
        kennung: k,
        detail: abbruchDetail || err.message,
      });
    } else if (!etwasGestroemt) {
      // Fehler VOR jedem Inhalt: werfen, die Queue markiert den Job als Fehler.
      // Dem Nutzer gehört die verständliche Fassung; die rohe steht im Log.
      clearInterval(abbruchPoller);
      const grund = grundAusFehler(err);
      const k = abbruchMelden({
        log,
        jobId,
        grund,
        quelle: 'chatAgentRunner.vorInhalt',
        detail: err.message,
        nachMs: Date.now() - laufBegonnen,
      });
      await abbruchFesthalten({ database, log, jobId, grund, kennung: k, detail: err.message });
      throw new Error(`${verstaendlicherFehler(err)} (Kennung ${k})`);
    } else {
      // Fehler NACH gestreamtem Inhalt: sauber abschließen statt werfen — der
      // Nutzer soll den bisherigen Text behalten.
      const grund = grundAusFehler(err);
      const k = abbruchMelden({
        log,
        jobId,
        grund,
        quelle: 'chatAgentRunner.nachTeilantwort',
        detail: err.message,
        nachMs: Date.now() - laufBegonnen,
      });
      onToken(`\n\n_Abgebrochen: ${verstaendlicherFehler(err)} Kennung ${k}._`);
      await abbruchFesthalten({ database, log, jobId, grund, kennung: k, detail: err.message });
    }
  } finally {
    clearInterval(abbruchPoller);
  }

  // --- Abschluss: Inhalt + Schritte + Dateien persistieren ------------------
  if (dbFlushTimer) {
    clearTimeout(dbFlushTimer);
    dbFlushTimer = null;
  }
  await flushDb();

  if (inhaltBereinigt && !abgebrochen) {
    try {
      await llmJobService.setJobContent(jobId, fertigText);
    } catch (err) {
      log.warn(`[JOB ${jobId}] Bereinigter Inhalt nicht gesetzt: ${err.message}`);
    }
  }

  let persisted = false;
  if (abgebrochen) {
    // Der Job steht bereits auf 'cancelled' (Abbruch-Route) — completeJob
    // würde den Status überschreiben. Inhalt/Schritte sind trotzdem gesichert.
    persisted = true;
  } else {
    try {
      persisted = await llmJobService.completeJob(jobId);
    } catch (err) {
      log.error(`[JOB ${jobId}] completeJob (Agent) fehlgeschlagen: ${err.message}`);
      try {
        await new Promise(r => {
          setTimeout(r, 2000);
        });
        persisted = await llmJobService.completeJob(jobId);
      } catch (retryErr) {
        log.error(`[JOB ${jobId}] completeJob (Agent) Retry fehlgeschlagen: ${retryErr.message}`);
      }
    }
  }

  // Schritte/Datei an der persistierten Nachricht nachtragen. `datei` bleibt
  // beim Format aus Migration 127: EIN Objekt oder eine Liste (JSONB trägt beides).
  // Bei Nutzer-Abbruch zusätzlich den (ggf. leeren) Teiltext sichern —
  // completeJob (das ihn sonst überträgt) läuft dann nicht, und ohne diesen
  // Schritt bliebe ein Sofort-Abbruch als leere 'error'-Nachricht zurück.
  if (schritte.length > 0 || dateien.length > 0 || abgebrochen) {
    try {
      const jobRow = await database.query(`SELECT message_id FROM llm_jobs WHERE id = $1`, [jobId]);
      const messageId = jobRow.rows[0]?.message_id;
      if (messageId) {
        const dateiWert = dateien.length === 0 ? null : dateien.length === 1 ? dateien[0] : dateien;
        await database.query(
          `UPDATE chat_messages SET schritte = $1, datei = COALESCE($2, datei) WHERE id = $3`,
          [JSON.stringify(schritte), dateiWert ? JSON.stringify(dateiWert) : null, messageId]
        );
        if (abgebrochen) {
          // Plan 023 E1: derselbe Satz wie im Strom, mit derselben Kennung.
          // Sonst stuende beim Neuladen des Chats etwas anderes da als
          // waehrend des Laufs, und die Kennung waere weg.
          // Auch wenn kein Zweig oben eine Kennung gesetzt hat, wird sie
          // hergeleitet statt weggelassen: sie ist aus Job-Id und Grund
          // ableitbar, und ein Satz ohne sie waere fuer den Nutzer wieder
          // unauffindbar.
          const marker = abbruchText(
            abbruchGrund,
            abbruchKennung || kennung(jobId, abbruchGrund)
          ).trimStart();
          await database.query(
            `UPDATE chat_messages SET content = $1, status = 'completed' WHERE id = $2`,
            [fertigText ? `${fertigText}\n\n${marker}` : marker, messageId]
          );
        }
      }
    } catch (err) {
      log.warn(`[JOB ${jobId}] Schritte/Datei nicht persistiert: ${err.message}`);
    }
  }

  // Plan 022 — Tokens/Sekunde des gesamten Agent-Laufs aus den summierten
  // Generierungs-Metriken (reine eval-Zeit, ohne Prompt-Verarbeitung).
  const tokensProSekunde =
    evalDauerNsGesamt > 0 ? Number(((evalTokensGesamt * 1e9) / evalDauerNsGesamt).toFixed(1)) : 0;

  // Plan 023 D7 — aufschreiben, was gemessen wurde. Bis hierher war der Pfad,
  // der das Produkt trägt, der einzige ohne Messung: `v_llm_usage_profile` war
  // leer, und damit stufte die Haltezeit-Automatik jede Stunde als `idle` ein.
  await vorlaufFesthalten({
    database,
    log,
    jobId,
    modelId: requested_model,
    vorlaufTokens: vorlaufErsteRunde,
    vorlaufDauerNs: vorlaufDauerErsteNs,
    evalTokens: evalTokensGesamt,
    evalDauerNs: evalDauerNsGesamt,
    vorlaufZeichen: zeichenErsteRunde,
  });

  service.notifySubscribers(jobId, {
    done: true,
    persisted,
    cancelled: abgebrochen || undefined,
    model: requested_model || 'unknown',
    jobId,
    agent: true,
    schritte,
    datei: dateien.length === 0 ? null : dateien.length === 1 ? dateien[0] : dateien,
    performance: {
      tokens: evalTokensGesamt,
      tokens_per_second: tokensProSekunde,
      // Plan 023 D7: was vor dem ersten Wort stand.
      prompt_tokens: vorlaufErsteRunde,
      prompt_tokens_total: vorlaufGesamt,
      prompt_ms: Math.round(vorlaufDauerErsteNs / 1e6),
      // Plan 023 E4: die Gesamtdauer des Laufs, von der Annahme des Auftrags
      // bis hierher. Etwas anderes als `tokens_per_second`: darin steckt nur
      // die reine Erzeugungszeit, nicht das Warten auf Werkzeuge, Subagenten
      // und das Laden des Modells. Der Nutzer erlebt aber diese Zahl.
      //
      // Der Name ist ABSICHTLICH derselbe wie im einfachen Chatpfad
      // (`llmOllamaStream`, seit P4-002). Ein zweiter Name fuer dieselbe Sache
      // haette bedeutet, dass die Anzeige beide kennen muss und bei jedem
      // kuenftigen Pfad einen dritten dazu.
      duration_ms: Date.now() - laufBegonnen,
    },
    timestamp: new Date().toISOString(),
  });

  // Ein-Ordner-Modell: was der Agent geschrieben hat, sofort in den
  // Wissens-Spiegel übernehmen (statt auf den nächsten Sync-Takt zu warten).
  if (projectId) {
    require('../projects/ordnerSyncService').trigger(projectId);
  }

  // Plan 023 E5: der Chat bekommt einen Namen nach dem, was getan wurde.
  //
  // NACH der Antwort und ohne await: der Nutzer wartet nie auf eine
  // Ueberschrift. Und mit DEMSELBEN Modell, das gerade gelaufen ist; es liegt
  // im Speicher, ein anderes zu nehmen hiesse es zu entladen und wieder zu
  // laden, gemessen 6 bis 30 Sekunden fuer eine Zeile.
  if (!abgebrochen) {
    benenneNachLauf({
      conversationId: job.conversation_id,
      modell: ollamaModel,
      frage: letzteNachricht,
      antwort: fertigText,
      dateien: dateien.map(d => d.pfad).filter(Boolean),
    }).catch(err => log.debug(`[TITEL] Job ${jobId}: ${err.message}`));
  }

  const { onJobComplete } = require('./llmOllamaStream');
  onJobComplete(ctx, jobId);
}

/**
 * Aktive Aufgabe aus der Todo-Liste bestimmen (Plan 019): die gerade laufende
 * Aufgabe, sonst die erste offene, sonst keine. Danach beginnende Schritte
 * werden dieser Aufgabe zugeordnet (task_index) — Grundlage der gruppierten
 * Cursor-Darstellung im Frontend.
 * @param {Array<{status?: string}>} todos
 * @returns {number|null}
 */
function aktiveTaskIndexAus(todos) {
  if (!Array.isArray(todos) || todos.length === 0) {
    return null;
  }
  const laufend = todos.findIndex(t => t && t.status === 'laeuft');
  if (laufend >= 0) {
    return laufend;
  }
  const offen = todos.findIndex(t => t && t.status === 'offen');
  return offen >= 0 ? offen : null;
}

/**
 * Wurzel-Ableitung der Agent-Werkzeuge (Plan 019 · Phase 2 „strenge
 * Ordner-Bindung"). Hängt der Nutzer einen Ordner an (`ablage_ziel`, relativ
 * zur Projektablage), IST DIESER die Wurzel — der Agent (Datei- UND Terminal-
 * Werkzeug) arbeitet ausschließlich darin, kein Ausweichen auf die ganze
 * Projektablage, kein Ausbruch nach „/". Ohne Anhang bleibt die Projektablage
 * die Wurzel. Ein ungültiger/ausbrechender `ablage_ziel` (…/.., absolut) wird
 * ignoriert und fällt sicher auf die Projektwurzel zurück.
 *
 * Rein & seiteneffektfrei (das mkdir des Zielordners macht der Aufrufer) →
 * unit-testbar ohne echtes Dateisystem.
 *
 * @param {string} wurzel  Absoluter Pfad der Projektablage.
 * @param {string|null|undefined} ablageZiel  Relativer Zielordner oder leer.
 * @returns {{ arbeitsOrdner: string, zielPrefix: string, roots: string[], scoped: boolean }}
 */
function deriveRoots(wurzel, ablageZiel) {
  let arbeitsOrdner = wurzel;
  let zielPrefix = '';
  if (ablageZiel && typeof ablageZiel === 'string' && ablageZiel.trim()) {
    const ziel = path.resolve(wurzel, ablageZiel);
    // Muss innerhalb der Projektwurzel liegen (kein .. / absoluter Ausbruch).
    if (ziel === wurzel || ziel.startsWith(wurzel + path.sep)) {
      arbeitsOrdner = ziel;
      zielPrefix = path.relative(wurzel, ziel).split(path.sep).join('/');
    }
  }
  const scoped = arbeitsOrdner !== wurzel;
  // STRENG: genau EIN Wurzelordner — der angehängte, sonst das Projekt.
  const roots = [arbeitsOrdner];
  return { arbeitsOrdner, zielPrefix, roots, scoped };
}

module.exports = {
  processAgentChatJob,
  // Plan 023 D7: die Messung des Vorlaufs. Der Plan macht sie zum
  // Abnahmekriterium, also gehoert sie unter Test.
  vorlaufFesthalten,
  // Plan 023 D7, Schritt 2: `scripts/test/vorlauf-wiegen.js` wiegt die
  // Anweisung gegen Ollama. Sie muss aus DIESER Datei kommen, nicht als
  // Kopie im Messwerkzeug liegen, sonst misst das Werkzeug einen Text, den
  // niemand mehr ausliefert.
  AGENT_ANWEISUNG,
  AGENT_WERKZEUGE,
  verlaufAufBudget,
  VERLAUF_TOKEN_BUDGET,
  AGENT_ROLLEN,
  streamChatRound,
  // Plan 023 E2: das Standardmodell lehnt eine System-Nachricht ab, die nicht
  // die erste ist. Die Regel gehoert unter Test, nicht in einen Kommentar.
  systemAnDenAnfang,
  istToolsNichtUnterstuetzt,
  verstaendlicherFehler,
  aktiveTaskIndexAus,
  alleTodosErledigt,
  berechneToolSignatur,
  deriveRoots,
};
