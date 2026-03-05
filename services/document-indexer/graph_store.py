"""
PostgreSQL-native Knowledge Graph store.

Uses regular tables + recursive CTEs for graph traversal,
instead of Apache AGE. Simpler, portable, ARM64-compatible.
"""

import logging
from typing import List, Dict, Optional, Tuple

import psycopg2
import psycopg2.extras

logger = logging.getLogger(__name__)


class GraphStore:
    """Stores and queries knowledge graph entities and relations in PostgreSQL."""

    def __init__(self, dsn: str):
        self.dsn = dsn

    def _get_conn(self):
        conn = psycopg2.connect(self.dsn)
        conn.autocommit = False
        return conn

    def upsert_entity(self, cur, name: str, entity_type: str,
                      properties: Optional[dict] = None) -> Optional[int]:
        """Create or update an entity. Returns entity ID."""
        props_json = psycopg2.extras.Json(properties or {})
        cur.execute("""
            INSERT INTO kg_entities (name, entity_type, properties)
            VALUES (%s, %s, %s)
            ON CONFLICT (name, entity_type)
            DO UPDATE SET
                mention_count = kg_entities.mention_count + 1,
                properties = kg_entities.properties || EXCLUDED.properties
            RETURNING id
        """, (name, entity_type, props_json))
        row = cur.fetchone()
        return row[0] if row else None

    def link_entity_document(self, cur, entity_id: int, document_id: str):
        """Link an entity to a source document."""
        cur.execute("""
            INSERT INTO kg_entity_documents (entity_id, document_id)
            VALUES (%s, %s::uuid)
            ON CONFLICT (entity_id, document_id)
            DO UPDATE SET mention_count = kg_entity_documents.mention_count + 1
        """, (entity_id, document_id))

    def upsert_relation(self, cur, source_id: int, target_id: int,
                        relation_type: str, context: str = '',
                        document_id: str = None,
                        properties: Optional[dict] = None) -> Optional[int]:
        """Create or update a relation between two entities."""
        props_json = psycopg2.extras.Json(properties or {})
        cur.execute("""
            INSERT INTO kg_relations
                (source_entity_id, target_entity_id, relation_type, context,
                 source_document_id, properties)
            VALUES (%s, %s, %s, %s, %s::uuid, %s)
            ON CONFLICT (source_entity_id, target_entity_id, relation_type)
            DO UPDATE SET
                weight = kg_relations.weight + 1,
                context = CASE
                    WHEN length(EXCLUDED.context) > length(kg_relations.context)
                    THEN EXCLUDED.context
                    ELSE kg_relations.context
                END,
                properties = kg_relations.properties || EXCLUDED.properties
            RETURNING id
        """, (source_id, target_id, relation_type, context[:200],
              document_id, props_json))
        row = cur.fetchone()
        return row[0] if row else None

    def store_document_graph(self, document_id: str, extraction_result: Dict):
        """
        Store all entities and relations from a document extraction.

        Args:
            document_id: UUID of the source document
            extraction_result: Dict with 'entities' and 'relations' lists
        """
        conn = self._get_conn()
        try:
            with conn.cursor() as cur:
                # Phase 1: Upsert all entities and build name→id map
                entity_ids = {}
                for entity in extraction_result.get('entities', []):
                    name = entity['name']
                    entity_type = entity['type']
                    entity_id = self.upsert_entity(cur, name, entity_type)
                    if entity_id:
                        entity_ids[(name, entity_type)] = entity_id
                        self.link_entity_document(cur, entity_id, document_id)

                # Phase 2: Upsert all relations
                for relation in extraction_result.get('relations', []):
                    source_key = (relation['source'], relation['source_type'])
                    target_key = (relation['target'], relation['target_type'])

                    source_id = entity_ids.get(source_key)
                    target_id = entity_ids.get(target_key)

                    if source_id and target_id and source_id != target_id:
                        self.upsert_relation(
                            cur,
                            source_id, target_id,
                            relation['relation'],
                            relation.get('context', ''),
                            document_id,
                        )

            conn.commit()
            logger.debug(
                f"Stored graph: {len(entity_ids)} entities, "
                f"{len(extraction_result.get('relations', []))} relations"
            )
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

    def delete_document_graph(self, document_id: str):
        """Remove all graph data associated with a document."""
        conn = self._get_conn()
        try:
            with conn.cursor() as cur:
                # Delete entity-document links
                cur.execute("""
                    DELETE FROM kg_entity_documents
                    WHERE document_id = %s::uuid
                """, (document_id,))

                # Delete relations sourced from this document
                cur.execute("""
                    DELETE FROM kg_relations
                    WHERE source_document_id = %s::uuid
                """, (document_id,))

                # Clean up orphaned entities (no remaining document links)
                cur.execute("""
                    DELETE FROM kg_entities
                    WHERE id NOT IN (
                        SELECT DISTINCT entity_id FROM kg_entity_documents
                    )
                """)

            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to delete document graph: {e}")
        finally:
            conn.close()

    def query_related(self, entity_name: str, max_depth: int = 2,
                      limit: int = 20) -> List[Dict]:
        """
        Find related entities up to max_depth hops using recursive CTE.

        Returns list of dicts: {name, type, distance, relation}
        """
        conn = self._get_conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("""
                    WITH RECURSIVE graph_walk AS (
                        -- Base: start entity
                        SELECT
                            e.id,
                            e.name,
                            e.entity_type,
                            0 AS distance,
                            '' AS relation_path,
                            ARRAY[e.id] AS visited
                        FROM kg_entities e
                        WHERE LOWER(e.name) = LOWER(%s)

                        UNION ALL

                        -- Traverse outgoing relations
                        SELECT
                            t.id,
                            t.name,
                            t.entity_type,
                            gw.distance + 1,
                            gw.relation_path || CASE WHEN gw.relation_path = '' THEN '' ELSE ' → ' END || r.relation_type,
                            gw.visited || t.id
                        FROM graph_walk gw
                        JOIN kg_relations r ON r.source_entity_id = gw.id
                        JOIN kg_entities t ON t.id = r.target_entity_id
                        WHERE gw.distance < %s
                          AND t.id != ALL(gw.visited)

                        UNION ALL

                        -- Traverse incoming relations
                        SELECT
                            s.id,
                            s.name,
                            s.entity_type,
                            gw.distance + 1,
                            gw.relation_path || CASE WHEN gw.relation_path = '' THEN '' ELSE ' → ' END || r.relation_type,
                            gw.visited || s.id
                        FROM graph_walk gw
                        JOIN kg_relations r ON r.target_entity_id = gw.id
                        JOIN kg_entities s ON s.id = r.source_entity_id
                        WHERE gw.distance < %s
                          AND s.id != ALL(gw.visited)
                    )
                    SELECT DISTINCT ON (name)
                        name,
                        entity_type AS type,
                        distance,
                        relation_path AS relation
                    FROM graph_walk
                    WHERE distance > 0
                    ORDER BY name, distance
                    LIMIT %s
                """, (entity_name, max_depth, max_depth, limit))
                return cur.fetchall()
        finally:
            conn.close()

    def get_document_entities(self, document_id: str) -> List[Dict]:
        """Get all entities linked to a document."""
        conn = self._get_conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("""
                    SELECT e.name, e.entity_type AS type, ed.mention_count
                    FROM kg_entities e
                    JOIN kg_entity_documents ed ON ed.entity_id = e.id
                    WHERE ed.document_id = %s::uuid
                    ORDER BY ed.mention_count DESC
                """, (document_id,))
                return cur.fetchall()
        finally:
            conn.close()

    def search_entities(self, search: str = None, entity_type: str = None,
                        limit: int = 50) -> List[Dict]:
        """Search entities by name pattern or type."""
        conn = self._get_conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                conditions = []
                params = []

                if search:
                    conditions.append("name ILIKE %s")
                    params.append(f"%{search}%")
                if entity_type:
                    conditions.append("entity_type = %s")
                    params.append(entity_type)

                where = "WHERE " + " AND ".join(conditions) if conditions else ""
                params.append(limit)

                cur.execute(f"""
                    SELECT id, name, entity_type AS type, mention_count,
                           created_at, updated_at
                    FROM kg_entities
                    {where}
                    ORDER BY mention_count DESC, name
                    LIMIT %s
                """, params)
                return cur.fetchall()
        finally:
            conn.close()

    def get_stats(self) -> Dict:
        """Get knowledge graph statistics."""
        conn = self._get_conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("""
                    SELECT
                        (SELECT COUNT(*) FROM kg_entities) AS entity_count,
                        (SELECT COUNT(*) FROM kg_relations) AS relation_count,
                        (SELECT COUNT(DISTINCT document_id) FROM kg_entity_documents) AS document_count
                """)
                row = cur.fetchone()

                # Entity type breakdown
                cur.execute("""
                    SELECT entity_type, COUNT(*) AS count
                    FROM kg_entities
                    GROUP BY entity_type
                    ORDER BY count DESC
                """)
                type_counts = {r['entity_type']: r['count'] for r in cur.fetchall()}

                # Relation type breakdown
                cur.execute("""
                    SELECT relation_type, COUNT(*) AS count
                    FROM kg_relations
                    GROUP BY relation_type
                    ORDER BY count DESC
                """)
                relation_counts = {r['relation_type']: r['count'] for r in cur.fetchall()}

                return {
                    'entities': row['entity_count'],
                    'relations': row['relation_count'],
                    'documents': row['document_count'],
                    'entity_types': type_counts,
                    'relation_types': relation_counts,
                }
        finally:
            conn.close()

    def find_connections(self, entity1: str, entity2: str,
                         max_depth: int = 4) -> List[Dict]:
        """Find shortest path between two entities."""
        conn = self._get_conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("""
                    WITH RECURSIVE path_search AS (
                        SELECT
                            e.id,
                            e.name,
                            ARRAY[e.name] AS path_names,
                            ARRAY[e.id] AS visited,
                            ARRAY[]::text[] AS relations,
                            0 AS depth
                        FROM kg_entities e
                        WHERE LOWER(e.name) = LOWER(%s)

                        UNION ALL

                        SELECT
                            next_e.id,
                            next_e.name,
                            ps.path_names || next_e.name,
                            ps.visited || next_e.id,
                            ps.relations || r.relation_type,
                            ps.depth + 1
                        FROM path_search ps
                        JOIN kg_relations r ON r.source_entity_id = ps.id
                                            OR r.target_entity_id = ps.id
                        JOIN kg_entities next_e ON next_e.id = CASE
                            WHEN r.source_entity_id = ps.id THEN r.target_entity_id
                            ELSE r.source_entity_id
                        END
                        WHERE ps.depth < %s
                          AND next_e.id != ALL(ps.visited)
                    )
                    SELECT path_names AS nodes, relations
                    FROM path_search
                    WHERE LOWER(name) = LOWER(%s)
                    ORDER BY depth
                    LIMIT 5
                """, (entity1, max_depth, entity2))
                return cur.fetchall()
        finally:
            conn.close()
