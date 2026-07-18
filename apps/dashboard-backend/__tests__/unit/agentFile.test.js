/**
 * Agent definition file parser — unit tests.
 */

const path = require('path');
const os = require('os');
const fs = require('fs').promises;

const { parseAgentFile, listAgents, loadAgent } = require('../../src/services/agents/agentFile');
const { ValidationError, NotFoundError } = require('../../src/utils/errors');

describe('parseAgentFile', () => {
  it('parses all fields plus the body as system prompt', () => {
    const text = [
      '---',
      'name: Texter',
      'beschreibung: Schreibt Texte',
      'modell: qwen2.5:7b',
      'werkzeuge: [dateien, rag]',
      '---',
      'Du bist ein Lektor.',
      '',
      'Antworte auf Deutsch.',
    ].join('\n');

    const agent = parseAgentFile(text);
    expect(agent.name).toBe('Texter');
    expect(agent.description).toBe('Schreibt Texte');
    expect(agent.model).toBe('qwen2.5:7b');
    expect(agent.tools).toEqual(['dateien', 'rag']);
    expect(agent.systemPrompt).toBe('Du bist ein Lektor.\n\nAntworte auf Deutsch.');
  });

  it('falls back to a default model and empty tools when omitted', () => {
    const text = ['---', 'name: Minimal', '---', 'Hallo.'].join('\n');
    const agent = parseAgentFile(text);
    expect(agent.name).toBe('Minimal');
    expect(typeof agent.model).toBe('string');
    expect(agent.model.length).toBeGreaterThan(0);
    expect(agent.tools).toEqual([]);
    expect(agent.description).toBe('');
    expect(agent.systemPrompt).toBe('Hallo.');
  });

  it('accepts the English aliases (description/model/tools)', () => {
    const text = [
      '---',
      'name: Eng',
      'description: does things',
      'model: llama3.2',
      'tools: [terminal]',
      '---',
      'System.',
    ].join('\n');
    const agent = parseAgentFile(text);
    expect(agent.description).toBe('does things');
    expect(agent.model).toBe('llama3.2');
    expect(agent.tools).toEqual(['terminal']);
  });

  it('throws ValidationError when name is missing', () => {
    const text = ['---', 'beschreibung: kein Name', '---', 'Body.'].join('\n');
    expect(() => parseAgentFile(text)).toThrow(ValidationError);
  });

  it('throws ValidationError on an unknown tool name', () => {
    const text = ['---', 'name: Bad', 'werkzeuge: [dateien, hacken]', '---', 'Body.'].join('\n');
    expect(() => parseAgentFile(text)).toThrow(/Unbekanntes Werkzeug/);
  });

  it('throws when werkzeuge is not a list', () => {
    const text = ['---', 'name: Bad', 'werkzeuge: dateien', '---', 'Body.'].join('\n');
    expect(() => parseAgentFile(text)).toThrow(ValidationError);
  });
});

describe('listAgents / loadAgent', () => {
  let dir;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-file-'));
    await fs.mkdir(path.join(dir, 'agenten'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('lists .md basenames without extension, sorted', async () => {
    await fs.writeFile(path.join(dir, 'agenten', 'zeta.md'), '---\nname: Z\n---\nx');
    await fs.writeFile(path.join(dir, 'agenten', 'alpha.md'), '---\nname: A\n---\nx');
    await fs.writeFile(path.join(dir, 'agenten', 'notes.txt'), 'ignore me');
    const names = await listAgents(dir);
    expect(names).toEqual(['alpha', 'zeta']);
  });

  it('returns [] when the agenten dir does not exist', async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-empty-'));
    expect(await listAgents(empty)).toEqual([]);
    await fs.rm(empty, { recursive: true, force: true });
  });

  it('loads and parses an agent by name', async () => {
    await fs.writeFile(
      path.join(dir, 'agenten', 'texter.md'),
      '---\nname: Texter\nwerkzeuge: [dateien]\n---\nDu bist ein Lektor.'
    );
    const agent = await loadAgent(dir, 'texter');
    expect(agent.name).toBe('Texter');
    expect(agent.tools).toEqual(['dateien']);
  });

  it('throws NotFoundError for a missing agent', async () => {
    await expect(loadAgent(dir, 'ghost')).rejects.toThrow(NotFoundError);
  });

  it('rejects a traversal name', async () => {
    await expect(loadAgent(dir, '../secret')).rejects.toThrow(ValidationError);
  });
});
