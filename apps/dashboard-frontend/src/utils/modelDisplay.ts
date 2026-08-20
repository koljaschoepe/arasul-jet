/**
 * Das Namensregister (Plan 022, ausgebaut in Plan 023 D1) — EINE Quelle der
 * Wahrheit für „welche Modelle darf man im Chat wählen?" und „wie heißt ein
 * Modell für den Nutzer?".
 *
 * Vorher lag der Filter dupliziert im Composer und in der StatusBar (`model_type
 * !== 'embedding' && !== 'ocr'`) und driftete auseinander; der Anzeigename fiel
 * bei fehlendem Katalog-Namen auf die rohe Ollama-/hf.co-Id zurück. Beides
 * vereinheitlicht dieses Modul.
 *
 * Am 20.08.2026 am Gerät gemessen, was davon noch offen war: Katalog,
 * Statusleiste und Auswahlliste sagten übereinstimmend „Gemma 4 Kompakt", der
 * Modellknopf im Chat sagte „Gemma". Er kürzte auf das erste Wort. Seit D1
 * liest jede Anzeigestelle aus diesem Modul, gehalten von
 * `scripts/test/modellnamen.py`.
 */

/** Lose Modell-Form, die sowohl installierte als auch Katalog-Modelle abdeckt. */
export interface ModellAnzeige {
  id: string;
  name?: string | null;
  model_type?: string | null;
  capabilities?: unknown;
  install_status?: string;
  status?: string;
}

/**
 * Nicht-Chat-Typen: reine Embedding-/OCR-/Audio-Modelle. `text` zählt bewusst
 * NICHT dazu — es ist der Alt-Name für Sprachmodelle (siehe Migration 094:
 * `model_type IN ('llm','text')`), also ein echter Gesprächspartner.
 */
const NICHT_CHAT_TYPEN = new Set(['embedding', 'ocr', 'audio']);

/**
 * Defensiv: falsch getypte Embedding-Modelle (z. B. per Direkt-Pull als
 * `model_type='llm'` in den Katalog synchronisiert) am Namen/an der Id
 * erkennen. Bewusst eng gehalten, damit kein echtes Chat-Modell hängen bleibt.
 */
// Muster gleichgehalten mit dem Backend (modelSyncHelpers.istEmbeddingModell)
// und Migration 142, damit die drei Stellen nicht auseinanderdriften.
const EMBED_MUSTER =
  /(?:^|[-_/])(?:nomic-embed|bge-m3|bge-large|all-minilm|e5-|gte-)|embed(?:ding)?\b/i;

/**
 * Darf dieses Modell im Chat/als Standardmodell gewählt werden? Chat-, Coding-
 * und multimodale (Vision-)Modelle ja; reine Embedding-/OCR-/Audio-Modelle nein.
 */
export function istChatModell(m: ModellAnzeige): boolean {
  const typ = (m.model_type || '').toLowerCase();
  if (NICHT_CHAT_TYPEN.has(typ)) {
    return false;
  }
  if (Array.isArray(m.capabilities)) {
    const caps = m.capabilities.map(c => String(c).toLowerCase());
    if (caps.includes('embedding') || caps.includes('embed')) {
      return false;
    }
  }
  const kennung = `${m.id || ''} ${m.name || ''}`;
  if (EMBED_MUSTER.test(kennung)) {
    return false;
  }
  return true;
}

/**
 * Sieht der String wie eine rohe Ollama-/hf.co-Modell-Id aus (statt eines
 * Namens)? Ein Name mit Leerzeichen ist NIE eine rohe Id ("Qwen3.8 27B" bleibt
 * unangetastet); sonst gelten Pfad-Schrägstrich ODER Ollama-`name:tag` als roh
 * (z. B. "qwen3-coder:30b" — genau die Form, die der Direkt-Pull erzeugt).
 */
function istRoheId(s: string): boolean {
  if (/\s/.test(s)) {
    return false;
  }
  return /^hf\.co\//i.test(s) || /^ollama\//i.test(s) || s.includes('/') || s.includes(':');
}

/**
 * Aus einer Ollama-/hf.co-Id einen lesbaren Namen ableiten, falls der Katalog
 * keinen sauberen Namen liefert — z. B.
 * "hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS" → "Qwen3.8 27B",
 * "qwen3-coder:30b" → "Qwen3 Coder 30B". Wörter werden groß angesetzt und eine
 * Größenangabe (…B) aus dem Tag angehängt, damit die Anzeige zum Rest passt.
 */
function humanisiereId(id: string): string {
  const ohnePrefix = id.replace(/^hf\.co\//i, '').replace(/^ollama\//i, '');
  const letzterTeil = ohnePrefix.split('/').pop() || ohnePrefix;
  const basis = letzterTeil.split(':')[0] || letzterTeil;
  const tag = letzterTeil.includes(':') ? letzterTeil.slice(letzterTeil.indexOf(':') + 1) : '';
  // Der Zaehler darf nicht mitten in einem Wort stehen: "gemma4:e4b" ist ein
  // E4B-Modell, keins mit 4 Milliarden Parametern. Ohne die Klammer davor ergab
  // die Ableitung "Gemma4 4B".
  const groesse = /(?:^|[^a-z0-9.])(\d+(?:\.\d+)?)\s*b\b/i.exec(tag);
  const worte = basis
    .replace(/[-_]+/g, ' ')
    .replace(/\bGGUF\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    // "Qwen3.8" -> "Qwen 3.8", damit die Ableitung dasselbe Muster trifft wie
    // die gepflegten Katalognamen ("Gemma 3 1B", "Qwen 3 Coder 30B").
    .map(w => w.replace(/^([A-Za-z]+)(\d)/, '$1 $2'))
    .map(w => w.charAt(0).toUpperCase() + w.slice(1));
  let label = worte.join(' ');
  if (groesse) {
    label += ` ${groesse[1]}B`;
  }
  return label || id;
}

/**
 * Einheitlicher Anzeigename eines Modells — nie ein roher `hf.co`-/Ollama-String.
 * Bevorzugt den sauberen Katalog-Namen, fällt sonst auf eine humanisierte Id
 * zurück.
 */
export function modellAnzeigeName(m: ModellAnzeige | string | null | undefined): string {
  // Ein blosser String ist der Regelfall an den Stellen, die nur die Kennung
  // von Ollama haben (Statusleiste, Fortschrittsbaender). Ohne diese Form
  // baute jeder Aufrufer sich sein eigenes { id, name } zusammen, und genau
  // solche Zwischenschritte sind der Weg, auf dem die Anzeige auseinanderlief.
  const modell: ModellAnzeige = typeof m === 'string' ? { id: m, name: m } : (m ?? { id: '' });
  const name = (modell.name || '').trim();
  if (name && !istRoheId(name)) {
    return name;
  }
  return humanisiereId(modell.id || name);
}
