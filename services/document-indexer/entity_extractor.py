"""
Entity extraction for Knowledge Graph construction.

Uses spaCy NER for German text to extract entities and
co-occurrence-based relations from document text.
"""

import logging
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

# Try to load spaCy with German model
SPACY_AVAILABLE = False
nlp = None

try:
    import spacy
    try:
        nlp = spacy.load("de_core_news_lg")
        SPACY_AVAILABLE = True
        logger.info("spaCy de_core_news_lg loaded successfully")
    except OSError:
        try:
            nlp = spacy.load("de_core_news_sm")
            SPACY_AVAILABLE = True
            logger.warning("Using de_core_news_sm (smaller model)")
        except OSError:
            logger.warning("No German spaCy model found - entity extraction disabled")
except ImportError:
    logger.warning("spaCy not installed - entity extraction disabled")

# Map spaCy NER labels to our Knowledge Graph entity types
ENTITY_TYPE_MAP = {
    'PER': 'Person',
    'ORG': 'Organisation',
    'LOC': 'Ort',
    'MISC': 'Konzept',
    'GPE': 'Ort',
    'PRODUCT': 'Produkt',
    'EVENT': 'Konzept',
    'WORK_OF_ART': 'Konzept',
}

# Minimum entity name length
MIN_ENTITY_LENGTH = 2

# Maximum text length for spaCy processing (avoid memory issues)
MAX_TEXT_LENGTH = 100000


def extract_entities(text: str) -> List[Dict]:
    """
    Extract named entities from German text using spaCy NER.

    Returns list of dicts: {name, type, label, start, end}
    """
    if not SPACY_AVAILABLE or not text:
        return []

    # Truncate very long texts
    proc_text = text[:MAX_TEXT_LENGTH] if len(text) > MAX_TEXT_LENGTH else text

    try:
        doc = nlp(proc_text)
    except Exception as e:
        logger.warning(f"spaCy processing failed: {e}")
        return []

    entities = []
    seen = set()

    for ent in doc.ents:
        normalized = ent.text.strip()
        key = normalized.lower()

        if key in seen or len(normalized) < MIN_ENTITY_LENGTH:
            continue
        seen.add(key)

        entity_type = ENTITY_TYPE_MAP.get(ent.label_, 'Konzept')
        entities.append({
            'name': normalized,
            'type': entity_type,
            'label': ent.label_,
            'start': ent.start_char,
            'end': ent.end_char,
        })

    return entities


def extract_relations(text: str, entities: List[Dict]) -> List[Dict]:
    """
    Extract relations based on entity co-occurrence within sentences.
    Entities appearing in the same sentence are assumed to be related.
    """
    if not SPACY_AVAILABLE or not text or not entities:
        return []

    proc_text = text[:MAX_TEXT_LENGTH] if len(text) > MAX_TEXT_LENGTH else text

    try:
        doc = nlp(proc_text)
    except Exception as e:
        logger.warning(f"spaCy processing for relations failed: {e}")
        return []

    relations = []

    for sent in doc.sents:
        # Find entities within this sentence
        sent_entities = [
            e for e in entities
            if e['start'] >= sent.start_char and e['end'] <= sent.end_char
        ]

        # Co-occurrence: entities in the same sentence are related
        for i, e1 in enumerate(sent_entities):
            for e2 in sent_entities[i + 1:]:
                relation_type = _infer_relation_type(e1, e2, sent.text)
                relations.append({
                    'source': e1['name'],
                    'source_type': e1['type'],
                    'target': e2['name'],
                    'target_type': e2['type'],
                    'relation': relation_type,
                    'context': sent.text[:200],
                })

    return relations


def _infer_relation_type(e1: Dict, e2: Dict, sentence: str) -> str:
    """Infer relation type from entity types and sentence context."""
    type_pair = (e1['type'], e2['type'])
    s = sentence.lower()

    # Rule-based mapping for German text
    if type_pair == ('Person', 'Organisation') or type_pair == ('Organisation', 'Person'):
        if any(w in s for w in ['arbeitet', 'leitet', 'führt', 'beschäftigt', 'mitarbeiter']):
            return 'ARBEITET_BEI'
        if any(w in s for w in ['verantwortlich', 'zuständig', 'betreut']):
            return 'VERANTWORTLICH_FUER'
        return 'GEHOERT_ZU'

    if 'Produkt' in type_pair or 'Technologie' in type_pair:
        if any(w in s for w in ['nutzt', 'verwendet', 'einsetzt', 'basiert']):
            return 'NUTZT'
        if any(w in s for w in ['abhängig', 'benötigt', 'erfordert', 'braucht']):
            return 'ABHAENGIG_VON'
        return 'VERWANDT_MIT'

    if 'Prozess' in type_pair:
        if any(w in s for w in ['nach', 'dann', 'anschließend', 'folgt', 'vor']):
            return 'FOLGT_AUF'
        return 'VERWANDT_MIT'

    if type_pair == ('Ort', 'Organisation') or type_pair == ('Organisation', 'Ort'):
        return 'BEFINDET_IN'

    if 'Dokument' in type_pair:
        return 'REFERENZIERT'

    return 'VERWANDT_MIT'


def extract_from_document(text: str, document_id: str, document_title: str) -> Optional[Dict]:
    """
    Full extraction pipeline for a document.

    Returns dict with 'entities' and 'relations' lists,
    or None if extraction is not available.
    """
    if not SPACY_AVAILABLE:
        return None

    entities = extract_entities(text)
    relations = extract_relations(text, entities)

    # Add document entity
    doc_entity = {
        'name': document_title,
        'type': 'Dokument',
        'label': 'DOC',
        'start': 0,
        'end': len(text),
    }

    # Add ENTHAELT relations from document to all extracted entities
    for entity in entities:
        relations.append({
            'source': document_title,
            'source_type': 'Dokument',
            'target': entity['name'],
            'target_type': entity['type'],
            'relation': 'ENTHAELT',
            'context': f"Dokument '{document_title}' enthält {entity['type']} '{entity['name']}'",
        })

    return {
        'document_id': document_id,
        'entities': [doc_entity] + entities,
        'relations': relations,
    }
