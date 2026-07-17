/**
 * Agent `rag` tool — smoke tests with a mocked ragCore.
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/services/rag/ragCore', () => ({
  getEmbedding: jest.fn(),
  hybridSearch: jest.fn(),
}));

const ragCore = require('../../src/services/rag/ragCore');
const RagTool = require('../../src/services/agents/tools/rag');

describe('RagTool (rag)', () => {
  let tool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new RagTool();
    ragCore.getEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
  });

  it('formats matches as text', async () => {
    ragCore.hybridSearch.mockResolvedValue([
      { payload: { document_name: 'handbuch.pdf', text: 'Der Motor braucht Oel.' } },
    ]);
    const out = await tool.execute({ frage: 'Wartung?' }, { workspaceId: 1 });
    expect(typeof out).toBe('string');
    expect(out).toMatch(/handbuch\.pdf/);
    expect(out).toMatch(/Oel/);
  });

  it('returns a clear message when nothing is indexed (no throw)', async () => {
    ragCore.hybridSearch.mockResolvedValue([]);
    const out = await tool.execute({ frage: 'irgendwas' }, {});
    expect(out).toMatch(/[Nn]ichts gefunden/);
  });

  it('does not throw when the search backend fails', async () => {
    ragCore.hybridSearch.mockRejectedValue(new Error('qdrant down'));
    const out = await tool.execute({ frage: 'x' }, {});
    expect(out).toMatch(/nicht moeglich/);
  });

  it('rejects an empty question', async () => {
    const out = await tool.execute({ frage: '   ' }, {});
    expect(out).toMatch(/darf nicht leer/);
  });
});
