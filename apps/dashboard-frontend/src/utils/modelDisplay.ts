/**
 * Modell-Anzeige & -Filter (Plan 022) — EINE Quelle der Wahrheit für „welche
 * Modelle darf man im Chat wählen?" und „wie heißt ein Modell für den Nutzer?".
 *
 * Vorher lag der Filter dupliziert im Composer und in der StatusBar (`model_type
 * !== 'embedding' && !== 'ocr'`) und driftete auseinander; der Anzeigename fiel
 * bei fehlendem Katalog-Namen auf die rohe Ollama-/hf.co-Id zurück. Beides
 * vereinheitlicht dieses Modul.
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

/** Sieht der String wie eine rohe Ollama-/hf.co-Modell-Id aus (statt eines Namens)? */
function istRoheId(s: string): boolean {
  return /^hf\.co\//i.test(s) || /^ollama\//i.test(s) || (s.includes('/') && s.includes(':'));
}

/**
 * Aus einer Ollama-/hf.co-Id einen lesbaren Namen ableiten, falls der Katalog
 * keinen sauberen Namen liefert — z. B.
 * "hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS" → "Qwen3.8 27B".
 */
function humanisiereId(id: string): string {
  const ohnePrefix = id.replace(/^hf\.co\//i, '').replace(/^ollama\//i, '');
  const letzterTeil = ohnePrefix.split('/').pop() || ohnePrefix;
  const ohneTag = letzterTeil.split(':')[0] || letzterTeil;
  return (
    ohneTag
      .replace(/[-_]+/g, ' ')
      .replace(/\bGGUF\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim() || id
  );
}

/**
 * Einheitlicher Anzeigename eines Modells — nie ein roher `hf.co`-/Ollama-String.
 * Bevorzugt den sauberen Katalog-Namen, fällt sonst auf eine humanisierte Id
 * zurück.
 */
export function modellAnzeigeName(m: ModellAnzeige): string {
  const name = (m.name || '').trim();
  if (name && !istRoheId(name)) {
    return name;
  }
  return humanisiereId(m.id || name);
}
