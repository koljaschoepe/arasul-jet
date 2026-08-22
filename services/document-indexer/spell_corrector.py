"""
Spell correction for typo-tolerant RAG queries.
Uses SymSpell for fast (1M× faster than edit-distance) offline correction.
Supports German + English via frequency dictionaries and domain-specific terms.
"""

import os
import re
import time
import logging
from typing import List, Dict, Tuple, Optional

logger = logging.getLogger(__name__)

SYMSPELL_AVAILABLE = False
_sym_spell = None

try:
    from symspellpy import SymSpell, Verbosity
    SYMSPELL_AVAILABLE = True
    logger.info("symspellpy loaded for spell correction")
except ImportError:
    logger.warning("symspellpy not available - spell correction disabled")

# Paths
DOMAIN_DICT_PATH = os.getenv('DOMAIN_DICT_PATH', '/data/bm25_index/domain-dict.txt')
MAX_EDIT_DISTANCE = int(os.getenv('SPELLCHECK_MAX_EDIT_DISTANCE', '2'))

# Words shorter than this are skipped (avoids correcting abbreviations)
MIN_WORD_LENGTH = 3


def get_spell_checker() -> Optional['SymSpell']:
    """Get or initialize the SymSpell singleton."""
    global _sym_spell
    if not SYMSPELL_AVAILABLE:
        return None

    if _sym_spell is not None:
        return _sym_spell

    try:
        _sym_spell = SymSpell(max_dictionary_edit_distance=MAX_EDIT_DISTANCE, prefix_length=7)

        # Load built-in frequency dictionaries (de + en)
        # SymSpell ships with English; German loaded from bundled resource
        import pkg_resources
        en_dict = pkg_resources.resource_filename('symspellpy', 'frequency_dictionary_en_82_765.txt')
        if os.path.exists(en_dict):
            _sym_spell.load_dictionary(en_dict, term_index=0, count_index=1)
            logger.info(f"Loaded English dictionary from {en_dict}")

        # German frequency dictionary (bundled with symspellpy or custom)
        de_dict = pkg_resources.resource_filename('symspellpy', 'frequency_dictionary_de_823_647.txt')
        if os.path.exists(de_dict):
            _sym_spell.load_dictionary(de_dict, term_index=0, count_index=1)
            logger.info(f"Loaded German dictionary from {de_dict}")
        else:
            logger.warning("German dictionary not found in symspellpy package")

        # Load domain-specific dictionary (built from indexed documents)
        if os.path.exists(DOMAIN_DICT_PATH):
            _sym_spell.load_dictionary(DOMAIN_DICT_PATH, term_index=0, count_index=1)
            logger.info(f"Loaded domain dictionary from {DOMAIN_DICT_PATH}")
        else:
            logger.info(f"No domain dictionary at {DOMAIN_DICT_PATH} (will be created during indexing)")

        logger.info("SymSpell spell checker initialized")
        return _sym_spell

    except Exception as e:
        logger.error(f"Failed to initialize spell checker: {e}")
        _sym_spell = None
        return None


def reload_domain_dictionary():
    """Reload the domain dictionary after it has been updated."""
    global _sym_spell
    if _sym_spell is None or not SYMSPELL_AVAILABLE:
        return

    try:
        if os.path.exists(DOMAIN_DICT_PATH):
            _sym_spell.load_dictionary(DOMAIN_DICT_PATH, term_index=0, count_index=1)
            logger.info(f"Reloaded domain dictionary from {DOMAIN_DICT_PATH}")
    except Exception as e:
        logger.warning(f"Failed to reload domain dictionary: {e}")


def correct_query(query: str) -> Tuple[str, List[Dict]]:
    """
    Correct typos in a query string.

    Args:
        query: The raw query text

    Returns:
        Tuple of (corrected_query, list_of_corrections)
        Each correction is {"original": "...", "corrected": "...", "distance": N}
    """
    checker = get_spell_checker()
    if checker is None:
        return query, []

    words = query.split()
    corrected = []
    corrections = []

    for word in words:
        # Skip short words, numbers, and special characters
        clean = re.sub(r'[^\w-]', '', word)
        if len(clean) < MIN_WORD_LENGTH or clean.isdigit():
            corrected.append(word)
            continue

        # Skip hyphenated compound words (common in German: IT-Sicherheit, KI-Modell, etc.)
        if '-' in clean:
            corrected.append(word)
            continue

        suggestions = checker.lookup(
            clean.lower(),
            Verbosity.CLOSEST,
            max_edit_distance=MAX_EDIT_DISTANCE
        )

        if suggestions and suggestions[0].distance > 0:
            best = suggestions[0]
            # Preserve original casing pattern
            if word[0].isupper():
                replacement = best.term.capitalize()
            elif word.isupper():
                replacement = best.term.upper()
            else:
                replacement = best.term

            # Preserve surrounding punctuation
            prefix = word[:len(word) - len(word.lstrip(r'([{"\'"'))]
            suffix = word[len(word.rstrip(r')]}\'".,;:!?')):]
            corrected.append(f"{prefix}{replacement}{suffix}")

            corrections.append({
                "original": word,
                "corrected": f"{prefix}{replacement}{suffix}",
                "distance": best.distance,
            })
        else:
            corrected.append(word)

    return ' '.join(corrected), corrections


# --- Fachwoerterbuch: im Speicher fuehren, selten schreiben ------------------
#
# Plan 023 G4. Vorher las diese Datei bei JEDEM indexierten Dokument das ganze
# Woerterbuch von der Platte, mischte neun neue Woerter hinein, sortierte alle
# Eintraege nach Haeufigkeit und schrieb sie zurueck. Am 22.08.2026 auf dem Orin
# gemessen, bei 242 012 Eintraegen:
#
#   17:01:57.625  Contextualized 1 chunks
#   17:01:57.950  Domain dictionary updated: 9 new terms, 242012 total
#   17:01:57.959  Successfully indexed document
#
# 0,33 Sekunden von 0,35 Sekunden Indexierung, fuer neun Woerter. Bei hundert
# Dateien sind das 33 Sekunden, und die Zahl waechst mit dem Woerterbuch.
#
# Jetzt liegt das Woerterbuch im Speicher und wird gesammelt geschrieben: nach
# DOMAIN_DICT_FLUSH_S Sekunden oder DOMAIN_DICT_FLUSH_WOERTER neuen Woertern.
# Verloren gehen kann dabei nur, was seit dem letzten Schreiben dazukam, und das
# ist abgeleitete Information: sie entsteht beim naechsten Indexieren erneut.

#: Sekunden zwischen zwei Schreibvorgaengen.
DOMAIN_DICT_FLUSH_S = int(os.getenv('DOMAIN_DICT_FLUSH_S', '60'))
#: Oder frueher, wenn so viele neue Woerter aufgelaufen sind.
DOMAIN_DICT_FLUSH_WOERTER = int(os.getenv('DOMAIN_DICT_FLUSH_WOERTER', '2000'))

_woerterbuch = None          # Counter, einmal von der Platte geladen
_offen = 0                   # neue Woerter seit dem letzten Schreiben
_letztes_schreiben = 0.0     # monotone Zeit des letzten Schreibens


def _lade_woerterbuch():
    """Das Woerterbuch EINMAL von der Platte holen."""
    from collections import Counter
    gelesen = Counter()
    if os.path.exists(DOMAIN_DICT_PATH):
        with open(DOMAIN_DICT_PATH, 'r', encoding='utf-8') as f:
            for line in f:
                parts = line.strip().split()
                if len(parts) == 2:
                    try:
                        gelesen[parts[0]] = int(parts[1])
                    except ValueError:
                        continue
    return gelesen


def flush_domain_dictionary(force: bool = False) -> bool:
    """
    Das Woerterbuch auf die Platte schreiben, wenn es sich lohnt.

    Args:
        force: True schreibt auch dann, wenn weder Zeit noch Menge erreicht sind
            (Herunterfahren, Tests).

    Returns:
        True, wenn geschrieben wurde
    """
    global _offen, _letztes_schreiben
    if _woerterbuch is None or _offen == 0:
        return False
    jetzt = time.monotonic()
    faellig = (
        force
        or _offen >= DOMAIN_DICT_FLUSH_WOERTER
        or (jetzt - _letztes_schreiben) >= DOMAIN_DICT_FLUSH_S
    )
    if not faellig:
        return False
    try:
        os.makedirs(os.path.dirname(DOMAIN_DICT_PATH) or '.', exist_ok=True)
        # Erst daneben schreiben, dann umbenennen: ein Absturz mittendrin
        # hinterlaesst sonst ein halbes Woerterbuch, das beim naechsten Start
        # gelesen wird.
        tmp = f"{DOMAIN_DICT_PATH}.neu"
        with open(tmp, 'w', encoding='utf-8') as f:
            for word, count in _woerterbuch.most_common():
                f.write(f"{word} {count}\n")
        os.replace(tmp, DOMAIN_DICT_PATH)
        logger.info(
            f"Domain dictionary written: {_offen} new terms, "
            f"{len(_woerterbuch)} total"
        )
        _offen = 0
        _letztes_schreiben = jetzt
        reload_domain_dictionary()
        return True
    except Exception as e:
        logger.warning(f"Failed to write domain dictionary: {e}")
        return False


def update_domain_dictionary(texts: List[str]):
    """
    Update the domain dictionary with words from newly indexed documents.
    Extracts words (3+ chars) and their frequencies, merges with existing dictionary.

    Geschrieben wird nicht sofort, sondern gesammelt (siehe oben).

    Args:
        texts: List of chunk texts from the indexed document
    """
    global _woerterbuch, _offen, _letztes_schreiben
    if not texts:
        return

    try:
        from collections import Counter
        word_freq = Counter()

        for text in texts:
            words = re.findall(r'\b\w{3,}\b', text.lower())
            word_freq.update(words)

        if _woerterbuch is None:
            _woerterbuch = _lade_woerterbuch()
            _letztes_schreiben = time.monotonic()

        neue = sum(1 for w in word_freq if w not in _woerterbuch)
        _woerterbuch.update(word_freq)
        _offen += neue
        flush_domain_dictionary()

    except Exception as e:
        logger.warning(f"Failed to update domain dictionary: {e}")
