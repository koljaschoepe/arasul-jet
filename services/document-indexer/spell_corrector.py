"""
Spell correction for typo-tolerant RAG queries.
Uses SymSpell for fast (1M× faster than edit-distance) offline correction.
Supports German + English via frequency dictionaries and domain-specific terms.
"""

import os
import re
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


def update_domain_dictionary(texts: List[str]):
    """
    Update the domain dictionary with words from newly indexed documents.
    Extracts words (3+ chars) and their frequencies, merges with existing dictionary.

    Args:
        texts: List of chunk texts from the indexed document
    """
    if not texts:
        return

    try:
        from collections import Counter
        word_freq = Counter()

        for text in texts:
            words = re.findall(r'\b\w{3,}\b', text.lower())
            word_freq.update(words)

        # Load existing dictionary
        existing = Counter()
        if os.path.exists(DOMAIN_DICT_PATH):
            with open(DOMAIN_DICT_PATH, 'r', encoding='utf-8') as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) == 2:
                        try:
                            existing[parts[0]] = int(parts[1])
                        except ValueError:
                            continue

        # Merge
        existing.update(word_freq)

        # Write back (ensure directory exists)
        os.makedirs(os.path.dirname(DOMAIN_DICT_PATH) or '.', exist_ok=True)
        with open(DOMAIN_DICT_PATH, 'w', encoding='utf-8') as f:
            for word, count in existing.most_common():
                f.write(f"{word} {count}\n")

        logger.info(f"Domain dictionary updated: {len(word_freq)} new terms, {len(existing)} total")

        # Reload into SymSpell
        reload_domain_dictionary()

    except Exception as e:
        logger.warning(f"Failed to update domain dictionary: {e}")
