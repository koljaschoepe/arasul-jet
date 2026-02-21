"""
German compound word decomposition service.
Uses compound-split (CharSplit) for splitting compound nouns like:
  "Krankenversicherungsbeitrag" -> "Krankenversicherungs Beitrag"

Only processes words longer than 10 characters to avoid false positives.
"""

import logging

logger = logging.getLogger(__name__)

try:
    from compound_split import char_split
    CHARSPLIT_AVAILABLE = True
    logger.info("CharSplit loaded for German decompounding")
except ImportError:
    char_split = None
    CHARSPLIT_AVAILABLE = False
    logger.warning("CharSplit not available - decompounding disabled")


def decompound_word(word: str) -> str:
    """
    Decompound a single German compound word.

    Args:
        word: A single word to decompound

    Returns:
        Space-separated components if compound, or original word
    """
    if not CHARSPLIT_AVAILABLE or char_split is None:
        return word

    if len(word) <= 10:
        return word

    try:
        # char_split.split_compound returns list of (score, part1, part2) tuples
        splits = char_split.split_compound(word)
        if splits:
            # Take the best split (highest score)
            best_score, part1, part2 = splits[0]
            # Only use split if score is positive (confident split)
            if best_score > 0:
                return f"{part1} {part2}"
        return word
    except Exception:
        return word


def decompound_text(text: str) -> str:
    """
    Decompound all long words in a text.

    Args:
        text: Input text with potentially compound words

    Returns:
        Text with compound words decomposed
    """
    if not CHARSPLIT_AVAILABLE:
        return text

    words = text.split()
    result = []

    for word in words:
        # Strip punctuation for analysis, preserve it in output
        clean = word.strip('.,;:!?()[]{}"\'-')
        if len(clean) > 10 and clean[0].isupper():
            # Likely a German compound noun
            decompounded = decompound_word(clean)
            if decompounded != clean:
                # Replace the compound word but keep surrounding punctuation
                prefix = word[:word.index(clean[0])] if word.index(clean[0]) > 0 else ''
                suffix_start = word.index(clean[0]) + len(clean)
                suffix = word[suffix_start:] if suffix_start < len(word) else ''
                result.append(f"{prefix}{decompounded}{suffix}")
            else:
                result.append(word)
        else:
            result.append(word)

    return ' '.join(result)
