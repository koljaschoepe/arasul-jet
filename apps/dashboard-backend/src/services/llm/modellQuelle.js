/**
 * Ein Modell über einen Link hinzufügen.
 *
 * Warum es das gibt (Entscheidung Kolja, 23.08.2026). Bis heute konnte ein
 * Kunde nur laden, was im Katalog steht, und der Katalog kommt aus Migrationen
 * — also aus einer Software-Aktualisierung. Ein Gerät, das keine mehr bekommt,
 * hätte damit für immer die Modelle von seinem Auslieferungstag. Das ist die
 * falsche Bedingung: neue Modelle erscheinen schneller, als Geräte aktualisiert
 * werden.
 *
 * Der Weg selbst ist nicht neu, nur nie erreichbar gewesen: Ollama lädt direkt
 * von HuggingFace, wenn der Name mit `hf.co/` beginnt. Das Standardmodell
 * dieses Geräts ist genau so eines
 * (`hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS`, am 23.08.2026 im Katalog
 * nachgesehen). Es fehlte die Tür, nicht der Raum dahinter.
 *
 * Was dieses Modul tut:
 *   1. `quelleLesen`  — aus dem, was ein Mensch einfügt, eine gültige Kennung
 *                       machen. Adresse, `hf.co/...`, `nutzer/ablage:tag` oder
 *                       ein reiner Ollama-Name.
 *   2. `variantenHolen` — bei HuggingFace nachfragen, welche Quantisierungen es
 *                       gibt und wie groß sie sind.
 *   3. `ramFuer`      — dieselbe Rechnung wie beim automatischen Katalog-Import
 *                       (`modelSyncHelpers`), damit zwei Wege nicht zwei Zahlen
 *                       ergeben.
 */

const axios = require('axios');
const { ValidationError, ServiceUnavailableError } = require('../../utils/errors');

// Nur diese Zeichen. Der zusammengesetzte Name geht in eine HTTP-Adresse und in
// den Ollama-Namen; ein Schrägstrich oder ein Punkt zu viel wäre ein Weg aus
// dem vorgesehenen Pfad heraus. Bewusst eng: HuggingFace erlaubt selbst nicht
// mehr als das.
const TEIL = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TAG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const HF_API = 'https://huggingface.co/api/models';

/** Die Rechnung aus `modelSyncHelpers`, damit beide Wege dieselbe Zahl ergeben. */
function ramFuer(sizeBytes) {
  return Math.max(2, Math.ceil((Number(sizeBytes || 0) / 1e9) * 1.3));
}

/**
 * Aus einer Eingabe eine Modellkennung machen.
 *
 * Angenommen wird, was ein Mensch wirklich einfügt:
 *   https://huggingface.co/unsloth/Qwen3-30B-A3B-GGUF
 *   https://huggingface.co/unsloth/Qwen3-30B-A3B-GGUF/tree/main
 *   hf.co/unsloth/Qwen3-30B-A3B-GGUF:IQ4_XS
 *   unsloth/Qwen3-30B-A3B-GGUF
 *   llama3.2:3b            (kein HuggingFace, sondern Ollamas eigene Ablage)
 *
 * @returns {{art:'huggingface'|'ollama', repo:string|null, tag:string|null, name:string}}
 */
function quelleLesen(eingabe) {
  const roh = String(eingabe || '').trim();
  if (!roh) {
    throw new ValidationError('Bitte einen Link oder einen Modellnamen angeben.');
  }
  if (roh.length > 300) {
    throw new ValidationError('Die Angabe ist zu lang.');
  }

  let rest = roh;
  let istHf = false;

  // Adresse oder hf.co-Kurzform: den Vorspann abschneiden.
  const adresse = rest.match(/^https?:\/\/(?:www\.)?(huggingface\.co|hf\.co)\/(.+)$/i);
  if (adresse) {
    istHf = true;
    rest = adresse[2];
  } else if (/^hf\.co\//i.test(rest)) {
    istHf = true;
    rest = rest.slice('hf.co/'.length);
  } else if (/^https?:\/\//i.test(rest)) {
    // Eine Adresse, aber nicht HuggingFace. Lieber klar ablehnen als raten:
    // Ollama laedt von genau zwei Orten, und der andere hat keine Adressen.
    throw new ValidationError(
      'Nur Links zu huggingface.co werden unterstützt. Ein Modell aus Ollamas ' +
        'eigener Ablage gibst du ohne Link an, zum Beispiel „llama3.2:3b".'
    );
  }

  // Alles ab /tree, /blob oder /resolve gehört zur Weboberfläche, nicht zum Namen.
  rest = rest.replace(/\/(tree|blob|resolve)\/.*$/i, '');
  rest = rest.replace(/\/+$/, '');

  // Ein Doppelpunkt trennt den Tag ab. Bei einer Adresse gibt es meist keinen.
  let tag = null;
  const doppelpunkt = rest.lastIndexOf(':');
  if (doppelpunkt > 0) {
    tag = rest.slice(doppelpunkt + 1);
    rest = rest.slice(0, doppelpunkt);
    if (!TAG.test(tag)) {
      throw new ValidationError(`Ungültige Variante „${tag}".`);
    }
  }

  const teile = rest.split('/').filter(Boolean);

  if (istHf || teile.length === 2) {
    if (teile.length !== 2) {
      throw new ValidationError(
        'Ein HuggingFace-Modell braucht Besitzer und Ablage, zum Beispiel ' +
          '„unsloth/Qwen3-30B-A3B-GGUF".'
      );
    }
    if (!TEIL.test(teile[0]) || !TEIL.test(teile[1])) {
      throw new ValidationError('Der Link enthält Zeichen, die dort nicht vorkommen dürfen.');
    }
    const repo = `${teile[0]}/${teile[1]}`;
    return {
      art: 'huggingface',
      repo,
      tag,
      name: `hf.co/${repo}${tag ? `:${tag}` : ''}`,
    };
  }

  // Kein Schrägstrich: Ollamas eigene Ablage, zum Beispiel `llama3.2:3b`.
  if (teile.length !== 1 || !TEIL.test(teile[0])) {
    throw new ValidationError('Das ist weder ein HuggingFace-Link noch ein Ollama-Modellname.');
  }
  return {
    art: 'ollama',
    repo: null,
    tag,
    name: `${teile[0]}${tag ? `:${tag}` : ''}`,
  };
}

/**
 * Welche Quantisierungen gibt es, und wie groß sind sie?
 *
 * Ohne diese Frage müsste der Kunde die Variante raten und danach 16 GB laden,
 * um zu merken, dass sie nicht ins Gerät passt. Mit ihr steht die Größe VOR dem
 * Laden fest.
 *
 * `?blobs=true` ist der Grund für den Aufruf: ohne diesen Zusatz liefert
 * HuggingFace die Dateinamen ohne Größe (23.08.2026 nachgesehen).
 */
async function variantenHolen(repo, { zeitlimitMs = 20000 } = {}) {
  const [besitzer, ablage] = String(repo).split('/');
  if (!TEIL.test(besitzer || '') || !TEIL.test(ablage || '')) {
    throw new ValidationError('Ungültige Ablage.');
  }

  let antwort;
  try {
    antwort = await axios.get(
      `${HF_API}/${encodeURIComponent(besitzer)}/${encodeURIComponent(ablage)}?blobs=true`,
      { timeout: zeitlimitMs, validateStatus: s => s < 500 }
    );
  } catch (err) {
    throw new ServiceUnavailableError(
      `huggingface.co ist nicht erreichbar (${err.code || err.message}). ` +
        'Ohne Netz lässt sich kein neues Modell nachschlagen.'
    );
  }

  if (antwort.status === 404) {
    throw new ValidationError(`Die Ablage „${repo}" gibt es bei HuggingFace nicht.`);
  }
  if (antwort.status !== 200) {
    throw new ServiceUnavailableError(`huggingface.co antwortete mit HTTP ${antwort.status}.`);
  }
  if (antwort.data?.gated) {
    throw new ValidationError(
      `„${repo}" ist bei HuggingFace freigabepflichtig und lässt sich vom Gerät aus nicht laden.`
    );
  }

  const dateien = Array.isArray(antwort.data?.siblings) ? antwort.data.siblings : [];
  const varianten = dateien
    .filter(d => typeof d?.rfilename === 'string' && /\.gguf$/i.test(d.rfilename))
    // Aufgeteilte Modelle (`-00001-of-00002.gguf`) laesst Ollama nicht ueber
    // einen Tag laden. Sie hier anzubieten hiesse, einen Fehlschlag zu
    // verkaufen.
    .filter(d => !/-\d{5}-of-\d{5}\.gguf$/i.test(d.rfilename))
    .map(d => {
      const datei = d.rfilename;
      const ohnePfad = datei.split('/').pop();
      // Ollamas Tag ist die Quantisierung, also der Teil hinter dem letzten
      // Bindestrich: `Qwen3-30B-A3B-IQ4_XS.gguf` -> `IQ4_XS`.
      const treffer = ohnePfad.replace(/\.gguf$/i, '').match(/([A-Za-z0-9]+(?:_[A-Za-z0-9]+)*)$/);
      const tag = treffer ? treffer[1] : null;
      const groesseBytes = Number(d.size) || 0;
      return tag && TAG.test(tag)
        ? { tag, datei, groesseBytes, ramGb: ramFuer(groesseBytes) }
        : null;
    })
    .filter(Boolean);

  // Gleiche Tags koennen doppelt vorkommen (Unterordner). Der erste gewinnt.
  const gesehen = new Set();
  return varianten.filter(v => (gesehen.has(v.tag) ? false : gesehen.add(v.tag)));
}

module.exports = { quelleLesen, variantenHolen, ramFuer };
