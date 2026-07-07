/**
 * Unit tests for ragCore.buildHierarchicalContext.
 *
 * Focus: the "Level 3" document-chunk assembly must merge BOTH retrieval tiers
 * in a mixed corpus — parent-backed results emit their parent chunk, while
 * child-only results (legacy docs without a parent_chunk_id, or an unresolved
 * parent) fall back to their child text. Regression guard for the audit finding
 * where any resolvable parent caused every child-only chunk to be dropped.
 */

// buildHierarchicalContext is a pure function, but ragCore pulls in db/axios/
// embeddingService/logger at module load — mock them so the module imports
// cleanly in a unit context.
jest.mock('../../src/database', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }));
jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('../../src/services/embeddingService', () => ({
  getEmbedding: jest.fn(),
  getEmbeddings: jest.fn(),
}));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const ragCore = require('../../src/services/rag/ragCore');

describe('buildHierarchicalContext', () => {
  test('mixed corpus: emits parent chunk AND child-only fallback (neither tier dropped)', () => {
    // One parent-backed result + one legacy child-only result (parent_chunk_id null).
    const chunks = [
      {
        document_name: 'Legacy Handbuch',
        text: 'LEGACY_CHILD_EVIDENCE — top-ranked evidence from a legacy doc.',
        space_name: 'Wissen',
        category: 'Handbuch',
        parent_chunk_id: null,
      },
      {
        document_name: 'Neues Dokument',
        text: 'child snippet that should be superseded by its parent',
        space_name: 'Wissen',
        category: 'Richtlinie',
        parent_chunk_id: 'parent-1',
      },
    ];
    const parentChunks = [{ id: 'parent-1', chunk_text: 'PARENT_CHUNK_TEXT — richer parent context.' }];

    const context = ragCore.buildHierarchicalContext(null, null, chunks, parentChunks);

    // Parent-backed tier contributes its parent chunk.
    expect(context).toContain('PARENT_CHUNK_TEXT — richer parent context.');
    // Child-only tier is NOT dropped — its evidence still reaches the LLM.
    expect(context).toContain('LEGACY_CHILD_EVIDENCE — top-ranked evidence from a legacy doc.');
    // The parent's own child snippet is superseded (not duplicated alongside the parent).
    expect(context).not.toContain('child snippet that should be superseded by its parent');
    // Both tiers surface under one section, numbered sequentially.
    expect(context).toContain('DOKUMENT [1]');
    expect(context).toContain('DOKUMENT [2]');
    expect(context).toContain('Legacy Handbuch');
    expect(context).toContain('Neues Dokument');
  });

  test('multiple children of the same parent emit that parent only once', () => {
    const chunks = [
      { document_name: 'Doc', text: 'a', space_name: null, category: null, parent_chunk_id: 'p1' },
      { document_name: 'Doc', text: 'b', space_name: null, category: null, parent_chunk_id: 'p1' },
    ];
    const parentChunks = [{ id: 'p1', chunk_text: 'ONE_PARENT' }];

    const context = ragCore.buildHierarchicalContext(null, null, chunks, parentChunks);

    expect(context.match(/ONE_PARENT/g)).toHaveLength(1);
    expect(context).toContain('DOKUMENT [1]');
    expect(context).not.toContain('DOKUMENT [2]');
  });

  test('parent_chunk_id set but unresolved falls back to child text', () => {
    const chunks = [
      { document_name: 'Doc', text: 'ORPHAN_CHILD', space_name: null, category: null, parent_chunk_id: 'missing' },
    ];
    // parentChunks non-empty (so the parent branch is taken) but does not contain 'missing'.
    const parentChunks = [{ id: 'other', chunk_text: 'UNRELATED_PARENT' }];

    const context = ragCore.buildHierarchicalContext(null, null, chunks, parentChunks);

    expect(context).toContain('ORPHAN_CHILD');
  });

  test('no parent chunks: pure child-chunk path is unchanged', () => {
    const chunks = [
      { document_name: 'Doc', text: 'CHILD_ONLY', space_name: 'S', category: 'C', parent_chunk_id: null },
    ];

    const context = ragCore.buildHierarchicalContext(null, null, chunks, null);

    expect(context).toContain('CHILD_ONLY');
    expect(context).toContain('Bereich: S');
    expect(context).toContain('Kategorie: C');
  });
});
