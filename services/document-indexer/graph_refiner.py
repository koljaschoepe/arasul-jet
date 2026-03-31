"""
LLM-based Knowledge Graph Refinement.

Phase 5: Uses the local LLM (Ollama) to improve graph quality:
- Entity Resolution: merge duplicate entities with different spellings
- Relation Refinement: upgrade generic VERWANDT_MIT to specific types

Designed as a batch job to run at low-load times.
"""

import os
import json
import logging
import time
import threading
from collections import deque
from typing import List, Dict, Optional, Tuple

import psycopg2
import psycopg2.errors
import psycopg2.extensions
import psycopg2.extras
import psycopg2.pool
import requests

logger = logging.getLogger(__name__)

# LLM configuration (same as ai_services.py)
LLM_HOST = os.getenv('LLM_SERVICE_HOST', 'llm-service')
LLM_PORT = int(os.getenv('LLM_SERVICE_PORT', '11434'))
LLM_MODEL = os.getenv('KG_REFINE_MODEL', os.getenv('LLM_MODEL', 'mistral:7b'))
LLM_TIMEOUT = int(os.getenv('LLM_AI_TIMEOUT', '120'))

# Refinement batch sizes
ENTITY_BATCH_SIZE = int(os.getenv('KG_REFINE_ENTITY_BATCH', '30'))
RELATION_BATCH_SIZE = int(os.getenv('KG_REFINE_RELATION_BATCH', '20'))

# Minimum trigram similarity for entity resolution candidates
MIN_SIMILARITY = float(os.getenv('KG_REFINE_MIN_SIMILARITY', '0.4'))


# Resolve Docker secrets (_FILE env vars -> regular env vars)
def _resolve_secrets(*var_names):
    for var in var_names:
        file_path = os.environ.get(f'{var}_FILE')
        if file_path and os.path.isfile(file_path):
            with open(file_path) as f:
                os.environ[var] = f.read().strip()

_resolve_secrets('POSTGRES_PASSWORD')

# Database connection
POSTGRES_DSN = (
    f"host={os.getenv('POSTGRES_HOST', 'postgres-db')} "
    f"port={os.getenv('POSTGRES_PORT', '5432')} "
    f"dbname={os.getenv('POSTGRES_DB', 'arasul_db')} "
    f"user={os.getenv('POSTGRES_USER', 'arasul')} "
    f"password={os.getenv('POSTGRES_PASSWORD', '')}"
)


class GraphRefiner:
    """Refines the Knowledge Graph using LLM batch processing."""

    def __init__(self):
        self.llm_url = f"http://{LLM_HOST}:{LLM_PORT}"
        self._running = False
        self._lock = threading.Lock()
        self._last_result = None
        self._pool = psycopg2.pool.SimpleConnectionPool(1, 5, POSTGRES_DSN)

    def _get_conn(self):
        conn = self._pool.getconn()
        conn.autocommit = False
        return conn

    def _put_conn(self, conn):
        self._pool.putconn(conn)

    def close(self):
        """Close all connections in the pool."""
        if self._pool:
            self._pool.closeall()
            logger.info("GraphRefiner connection pool closed")

    def __del__(self):
        """Ensure pool is closed on garbage collection."""
        try:
            self.close()
        except Exception:
            pass

    def _llm_generate(self, prompt: str, system_prompt: str = None,
                      temperature: float = 0.1) -> Optional[str]:
        """Call the local LLM (Ollama) for refinement tasks."""
        try:
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})

            response = requests.post(
                f"{self.llm_url}/api/chat",
                json={
                    "model": LLM_MODEL,
                    "messages": messages,
                    "stream": False,
                    "options": {
                        "num_predict": 2048,
                        "temperature": temperature,
                    }
                },
                timeout=LLM_TIMEOUT
            )
            response.raise_for_status()
            result = response.json()
            return result.get('message', {}).get('content', '')

        except requests.exceptions.Timeout:
            logger.warning(f"LLM request timed out after {LLM_TIMEOUT}s")
            return None
        except Exception as e:
            logger.warning(f"LLM generation error: {e}")
            return None

    def _parse_json_response(self, text: str) -> Optional[dict]:
        """Extract JSON from LLM response (handles markdown code blocks)."""
        if not text:
            return None
        # Strip think tags (Qwen3 reasoning)
        if '<think>' in text:
            idx = text.rfind('</think>')
            if idx != -1:
                text = text[idx + len('</think>'):]
        # Try direct parse
        text = text.strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        # Try extracting from code block
        for marker in ['```json', '```']:
            if marker in text:
                start = text.index(marker) + len(marker)
                end = text.find('```', start)
                if end > start:
                    try:
                        return json.loads(text[start:end].strip())
                    except json.JSONDecodeError:
                        pass
        return None

    # ── Entity Resolution ─────────────────────────────────────

    def find_similar_entities(self, batch_size: int = ENTITY_BATCH_SIZE) -> List[Dict]:
        """
        Find groups of potentially duplicate entities using trigram similarity.
        Returns clusters of entities that might refer to the same real-world entity.
        """
        conn = self._get_conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                # Find unrefined entities that are similar to others
                cur.execute("""
                    SELECT DISTINCT ON (LEAST(a.id, b.id), GREATEST(a.id, b.id))
                        a.id AS id_a, a.name AS name_a, a.entity_type AS type_a,
                            a.mention_count AS count_a,
                        b.id AS id_b, b.name AS name_b, b.entity_type AS type_b,
                            b.mention_count AS count_b,
                        similarity(LOWER(a.name), LOWER(b.name)) AS sim
                    FROM kg_entities a
                    JOIN kg_entities b ON a.id < b.id
                        AND a.entity_type = b.entity_type
                        AND similarity(LOWER(a.name), LOWER(b.name)) > %s
                    WHERE a.canonical_id IS NULL
                      AND b.canonical_id IS NULL
                      AND a.refined = FALSE
                    ORDER BY LEAST(a.id, b.id), GREATEST(a.id, b.id),
                             similarity(LOWER(a.name), LOWER(b.name)) DESC
                    LIMIT %s
                """, (MIN_SIMILARITY, batch_size))
                return [dict(row) for row in cur.fetchall()]
        finally:
            self._put_conn(conn)

    def resolve_entities_via_llm(self, similar_pairs: List[Dict]) -> List[Dict]:
        """
        Ask LLM which entity pairs are true duplicates and should be merged.
        Returns list of merge instructions: {old_names: [...], canonical: "...", type: "..."}
        """
        if not similar_pairs:
            return []

        # Group pairs into clusters
        clusters = self._cluster_pairs(similar_pairs)

        # Format for LLM
        cluster_text = ""
        for i, cluster in enumerate(clusters[:15]):  # Max 15 clusters per batch
            names = ", ".join(f'"{n}"' for n in cluster['names'])
            cluster_text += f"{i+1}. Typ: {cluster['type']}, Namen: [{names}]\n"

        system_prompt = (
            "Du bist ein Experte für Entity Resolution in einem deutschen Wissensgraphen. "
            "Antworte ausschließlich mit validem JSON, ohne Erklärungen."
        )

        prompt = f"""Analysiere folgende Entitäts-Gruppen. Entscheide für jede Gruppe, ob die Namen
die gleiche reale Entität beschreiben. Wenn ja, wähle den besten kanonischen Namen.

Gruppen:
{cluster_text}

Antworte als JSON-Array. Für jede Gruppe mit echten Duplikaten:
{{"old_names": ["Name1", "Name2"], "canonical": "Bester Name", "type": "Typ"}}

Wenn eine Gruppe KEINE Duplikate enthält, überspringe sie.
Beispiel: "BMW AG" und "BMW" → {{"old_names": ["BMW AG", "BMW"], "canonical": "BMW", "type": "Organisation"}}

JSON-Array:"""

        response = self._llm_generate(prompt, system_prompt)
        result = self._parse_json_response(response)

        if isinstance(result, list):
            # Validate structure
            valid = []
            for item in result:
                if (isinstance(item, dict)
                        and 'old_names' in item
                        and 'canonical' in item
                        and isinstance(item['old_names'], list)
                        and len(item['old_names']) >= 2):
                    valid.append(item)
            return valid
        return []

    def _cluster_pairs(self, pairs: List[Dict]) -> List[Dict]:
        """Group similar pairs into clusters using union-find."""
        # Build adjacency
        name_to_type = {}
        adjacency = {}
        for pair in pairs:
            name_a, name_b = pair['name_a'], pair['name_b']
            name_to_type[name_a] = pair['type_a']
            name_to_type[name_b] = pair['type_b']
            adjacency.setdefault(name_a, set()).add(name_b)
            adjacency.setdefault(name_b, set()).add(name_a)

        # BFS to find connected components
        visited = set()
        clusters = []
        for name in adjacency:
            if name in visited:
                continue
            cluster_names = []
            queue = deque([name])
            while queue:
                current = queue.popleft()
                if current in visited:
                    continue
                visited.add(current)
                cluster_names.append(current)
                for neighbor in adjacency.get(current, []):
                    if neighbor not in visited:
                        queue.append(neighbor)
            if len(cluster_names) >= 2:
                clusters.append({
                    'names': cluster_names,
                    'type': name_to_type.get(cluster_names[0], 'Konzept'),
                })

        return clusters

    def merge_entities(self, merges: List[Dict]) -> int:
        """
        Execute entity merges in the database.
        Keeps the canonical entity, redirects all relations/documents from old entities.
        Returns number of entities merged.
        """
        if not merges:
            return 0

        conn = self._get_conn()
        conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_SERIALIZABLE)
        merged_count = 0
        try:
            with conn.cursor() as cur:
                for merge in merges:
                    canonical_name = merge['canonical']
                    entity_type = merge.get('type', 'Konzept')
                    old_names = [n for n in merge['old_names'] if n != canonical_name]

                    if not old_names:
                        continue

                    # Find canonical entity ID
                    cur.execute(
                        "SELECT id FROM kg_entities WHERE name = %s AND entity_type = %s",
                        (canonical_name, entity_type)
                    )
                    row = cur.fetchone()
                    if not row:
                        # Canonical name doesn't exist yet — pick highest mention_count
                        cur.execute("""
                            SELECT id, name FROM kg_entities
                            WHERE name = ANY(%s) AND entity_type = %s
                            ORDER BY mention_count DESC LIMIT 1
                        """, (merge['old_names'], entity_type))
                        row = cur.fetchone()
                        if not row:
                            continue
                        # Rename to canonical
                        cur.execute(
                            "UPDATE kg_entities SET name = %s WHERE id = %s",
                            (canonical_name, row[0])
                        )
                    canonical_id = row[0]

                    # Find old entity IDs
                    cur.execute("""
                        SELECT id FROM kg_entities
                        WHERE name = ANY(%s) AND entity_type = %s AND id != %s
                    """, (old_names, entity_type, canonical_id))
                    old_ids = [r[0] for r in cur.fetchall()]

                    if not old_ids:
                        # Mark canonical as refined
                        cur.execute(
                            "UPDATE kg_entities SET refined = TRUE WHERE id = %s",
                            (canonical_id,)
                        )
                        continue

                    for old_id in old_ids:
                        # Move document links: sum counts for overlapping, move the rest
                        cur.execute("""
                            UPDATE kg_entity_documents AS target
                            SET mention_count = target.mention_count + src.mention_count
                            FROM kg_entity_documents AS src
                            WHERE src.entity_id = %s
                              AND target.entity_id = %s
                              AND src.document_id = target.document_id
                        """, (old_id, canonical_id))
                        # Delete overlapping old links (already merged above)
                        cur.execute("""
                            DELETE FROM kg_entity_documents
                            WHERE entity_id = %s
                              AND document_id IN (
                                  SELECT document_id FROM kg_entity_documents
                                  WHERE entity_id = %s
                              )
                        """, (old_id, canonical_id))
                        # Move remaining non-overlapping links
                        cur.execute("""
                            UPDATE kg_entity_documents
                            SET entity_id = %s
                            WHERE entity_id = %s
                        """, (canonical_id, old_id))

                        # Redirect relations (source)
                        cur.execute("""
                            UPDATE kg_relations
                            SET source_entity_id = %s
                            WHERE source_entity_id = %s
                            AND NOT EXISTS (
                                SELECT 1 FROM kg_relations r2
                                WHERE r2.source_entity_id = %s
                                  AND r2.target_entity_id = kg_relations.target_entity_id
                                  AND r2.relation_type = kg_relations.relation_type
                            )
                        """, (canonical_id, old_id, canonical_id))

                        # Redirect relations (target)
                        cur.execute("""
                            UPDATE kg_relations
                            SET target_entity_id = %s
                            WHERE target_entity_id = %s
                            AND NOT EXISTS (
                                SELECT 1 FROM kg_relations r2
                                WHERE r2.source_entity_id = kg_relations.source_entity_id
                                  AND r2.target_entity_id = %s
                                  AND r2.relation_type = kg_relations.relation_type
                            )
                        """, (canonical_id, old_id, canonical_id))

                        # Sum mention counts
                        cur.execute("""
                            UPDATE kg_entities
                            SET mention_count = mention_count + (
                                SELECT mention_count FROM kg_entities WHERE id = %s
                            )
                            WHERE id = %s
                        """, (old_id, canonical_id))

                        # Mark old entity with canonical reference, then delete
                        cur.execute(
                            "UPDATE kg_entities SET canonical_id = %s WHERE id = %s",
                            (canonical_id, old_id)
                        )

                        merged_count += 1

                    # Clean up: delete merged entities (cascades relations/doc links)
                    cur.execute(
                        "DELETE FROM kg_entities WHERE id = ANY(%s)",
                        (old_ids,)
                    )

                    # Mark canonical as refined
                    cur.execute(
                        "UPDATE kg_entities SET refined = TRUE WHERE id = %s",
                        (canonical_id,)
                    )

                    logger.info(
                        f"Merged {len(old_ids)} entities into "
                        f"'{canonical_name}' (ID {canonical_id})"
                    )

            conn.commit()
            return merged_count

        except psycopg2.errors.SerializationFailure:
            conn.rollback()
            logger.warning("Serialization conflict during entity merge, will retry on next cycle")
            return 0
        except Exception as e:
            conn.rollback()
            logger.error(f"Entity merge failed: {e}")
            return 0
        finally:
            self._put_conn(conn)

    # ── Relation Refinement ───────────────────────────────────

    def find_generic_relations(self, batch_size: int = RELATION_BATCH_SIZE) -> List[Dict]:
        """Find VERWANDT_MIT relations that could be refined to specific types."""
        conn = self._get_conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("""
                    SELECT r.id, r.relation_type, r.context,
                           se.name AS source_name, se.entity_type AS source_type,
                           te.name AS target_name, te.entity_type AS target_type
                    FROM kg_relations r
                    JOIN kg_entities se ON se.id = r.source_entity_id
                    JOIN kg_entities te ON te.id = r.target_entity_id
                    WHERE r.relation_type = 'VERWANDT_MIT'
                      AND r.refined = FALSE
                      AND r.context IS NOT NULL
                      AND r.context != ''
                    ORDER BY r.weight DESC
                    LIMIT %s
                """, (batch_size,))
                return [dict(row) for row in cur.fetchall()]
        finally:
            self._put_conn(conn)

    def refine_relations_via_llm(self, relations: List[Dict]) -> List[Dict]:
        """
        Ask LLM to suggest specific relation types for generic VERWANDT_MIT.
        Returns list of {id, new_type} dicts.
        """
        if not relations:
            return []

        # Format for LLM
        relations_text = ""
        for i, rel in enumerate(relations):
            ctx = (rel.get('context') or '')[:150]
            relations_text += (
                f"{i+1}. {rel['source_name']} ({rel['source_type']}) "
                f"→ VERWANDT_MIT → "
                f"{rel['target_name']} ({rel['target_type']})\n"
                f"   Kontext: \"{ctx}\"\n"
            )

        valid_types = [
            'ARBEITET_BEI', 'GEHOERT_ZU', 'VERANTWORTLICH_FUER',
            'NUTZT', 'ABHAENGIG_VON', 'FOLGT_AUF', 'BEFINDET_IN',
            'REFERENZIERT', 'ENTHAELT', 'PRODUZIERT', 'LIEFERT',
            'KONKURRIERT_MIT', 'KOOPERIERT_MIT', 'TEIL_VON',
            'VERWANDT_MIT',  # Keep if no better match
        ]

        system_prompt = (
            "Du bist ein Experte für Wissensmodellierung. "
            "Antworte ausschließlich mit validem JSON, ohne Erklärungen."
        )

        prompt = f"""Analysiere folgende Beziehungen und schlage spezifischere Beziehungstypen vor.

Beziehungen:
{relations_text}

Erlaubte Beziehungstypen: {', '.join(valid_types)}

Antworte als JSON-Array. Für jede Beziehung:
{{"index": 1, "new_type": "SPEZIFISCHER_TYP"}}

Wenn VERWANDT_MIT der beste Typ ist, überspringe den Eintrag.

JSON-Array:"""

        response = self._llm_generate(prompt, system_prompt)
        result = self._parse_json_response(response)

        if not isinstance(result, list):
            return []

        refinements = []
        for item in result:
            if not isinstance(item, dict):
                continue
            idx = item.get('index')
            new_type = item.get('new_type', '')
            if (idx and isinstance(idx, int) and 1 <= idx <= len(relations)
                    and new_type in valid_types
                    and new_type != 'VERWANDT_MIT'):
                refinements.append({
                    'id': relations[idx - 1]['id'],
                    'new_type': new_type,
                })

        return refinements

    def apply_relation_refinements(self, refinements: List[Dict]) -> int:
        """Apply relation type refinements to the database."""
        if not refinements:
            return 0

        conn = self._get_conn()
        count = 0
        try:
            with conn.cursor() as cur:
                for ref in refinements:
                    cur.execute("""
                        UPDATE kg_relations
                        SET relation_type = %s, refined = TRUE
                        WHERE id = %s AND relation_type = 'VERWANDT_MIT'
                    """, (ref['new_type'], ref['id']))
                    count += cur.rowcount

                # Mark remaining VERWANDT_MIT in this batch as refined (checked, no change)
                rel_ids = [r['id'] for r in refinements]
                if rel_ids:
                    cur.execute("""
                        UPDATE kg_relations
                        SET refined = TRUE
                        WHERE id = ANY(%s) AND refined = FALSE
                    """, (rel_ids,))

            conn.commit()
            return count
        except Exception as e:
            conn.rollback()
            logger.error(f"Relation refinement failed: {e}")
            return 0
        finally:
            self._put_conn(conn)

    def mark_relations_refined(self, relation_ids: List[int]):
        """Mark relations as refined even if no change was made."""
        if not relation_ids:
            return
        conn = self._get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE kg_relations SET refined = TRUE WHERE id = ANY(%s)",
                    (relation_ids,)
                )
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to mark relations as refined: {e}")
        finally:
            self._put_conn(conn)

    # ── Main Entry Point ──────────────────────────────────────

    def run_refinement_batch(self) -> Dict:
        """
        Run one refinement batch: entity resolution + relation refinement.
        Returns summary of actions taken.
        """
        with self._lock:
            if self._running:
                return {'status': 'already_running'}
            self._running = True

        start_time = time.time()
        result = {
            'status': 'completed',
            'entity_resolution': {'pairs_found': 0, 'merges_proposed': 0, 'merged': 0},
            'relation_refinement': {'found': 0, 'proposed': 0, 'applied': 0},
            'duration_seconds': 0,
        }

        try:
            # Phase 1: Entity Resolution
            logger.info("Graph refinement: starting entity resolution...")
            similar_pairs = self.find_similar_entities()
            result['entity_resolution']['pairs_found'] = len(similar_pairs)

            if similar_pairs:
                merges = self.resolve_entities_via_llm(similar_pairs)
                result['entity_resolution']['merges_proposed'] = len(merges)

                if merges:
                    merged = self.merge_entities(merges)
                    result['entity_resolution']['merged'] = merged
                    logger.info(f"Entity resolution: {merged} entities merged")
                else:
                    # Mark entities as refined (no merges needed)
                    self._mark_entities_refined(similar_pairs)
            else:
                logger.info("Entity resolution: no similar entities found")

            # Phase 2: Relation Refinement
            logger.info("Graph refinement: starting relation refinement...")
            generic_relations = self.find_generic_relations()
            result['relation_refinement']['found'] = len(generic_relations)

            if generic_relations:
                refinements = self.refine_relations_via_llm(generic_relations)
                result['relation_refinement']['proposed'] = len(refinements)

                if refinements:
                    applied = self.apply_relation_refinements(refinements)
                    result['relation_refinement']['applied'] = applied
                    logger.info(f"Relation refinement: {applied} relations refined")

                # Mark all checked relations as refined
                all_ids = [r['id'] for r in generic_relations]
                self.mark_relations_refined(all_ids)
            else:
                logger.info("Relation refinement: no generic relations found")

            result['duration_seconds'] = round(time.time() - start_time, 1)
            logger.info(
                f"Graph refinement completed in {result['duration_seconds']}s: "
                f"{result['entity_resolution']['merged']} merges, "
                f"{result['relation_refinement']['applied']} refinements"
            )

        except Exception as e:
            result['status'] = 'error'
            result['error'] = str(e)
            logger.error(f"Graph refinement batch failed: {e}")
        finally:
            self._last_result = result
            with self._lock:
                self._running = False

        return result

    def _mark_entities_refined(self, pairs: List[Dict]):
        """Mark entities from pairs as refined (checked, no merge needed)."""
        entity_ids = set()
        for pair in pairs:
            entity_ids.add(pair['id_a'])
            entity_ids.add(pair['id_b'])

        if not entity_ids:
            return

        conn = self._get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE kg_entities SET refined = TRUE WHERE id = ANY(%s)",
                    (list(entity_ids),)
                )
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to mark entities as refined: {e}")
        finally:
            self._put_conn(conn)

    def get_refinement_stats(self) -> Dict:
        """Get current refinement status/statistics."""
        conn = self._get_conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("""
                    SELECT
                        COUNT(*) AS total_entities,
                        COUNT(*) FILTER (WHERE refined = TRUE) AS refined_entities,
                        COUNT(*) FILTER (WHERE refined = FALSE) AS unrefined_entities,
                        COUNT(*) FILTER (WHERE canonical_id IS NOT NULL) AS merged_entities
                    FROM kg_entities
                """)
                entity_stats = dict(cur.fetchone())

                cur.execute("""
                    SELECT
                        COUNT(*) AS total_relations,
                        COUNT(*) FILTER (WHERE refined = TRUE) AS refined_relations,
                        COUNT(*) FILTER (WHERE refined = FALSE AND relation_type = 'VERWANDT_MIT')
                            AS unrefined_generic
                    FROM kg_relations
                """)
                relation_stats = dict(cur.fetchone())

                with self._lock:
                    is_running = self._running
                return {
                    'entities': entity_stats,
                    'relations': relation_stats,
                    'is_running': is_running,
                    'last_result': self._last_result,
                }
        finally:
            self._put_conn(conn)


# Singleton
_refiner: Optional[GraphRefiner] = None


def get_refiner() -> GraphRefiner:
    global _refiner
    if _refiner is None:
        _refiner = GraphRefiner()
    return _refiner
