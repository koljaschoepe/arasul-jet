/**
 * Agent definition files.
 *
 * An agent is a Markdown file with a YAML frontmatter head and a Markdown body.
 * The body is the agent's system prompt; the head declares its name, model and
 * the subset of tools it may call. Definition files live under
 * `<host_path>/agenten/<name>.md` — the SAME on-disk workspace the `terminal`
 * and `dateien` tools see (NOT the documents/spaces tables).
 *
 * Example (agenten/texter.md):
 *
 *   ---
 *   name: Texter
 *   beschreibung: Schreibt und ueberarbeitet Texte im Workspace.
 *   modell: qwen2.5:7b
 *   werkzeuge: [dateien, rag]
 *   ---
 *   Du bist ein praeziser Lektor. Nutze `dateien` zum Lesen und Schreiben und
 *   `rag`, um im Workspace-Wissen zu recherchieren. Antworte auf Deutsch.
 */

const path = require('path');
const fs = require('fs').promises;
const yaml = require('js-yaml');
const { ValidationError, NotFoundError } = require('../../utils/errors');
const { resolveWithin } = require('./pathSafe');

// The three tools an agent may declare. Kept in sync with services/agents/tools/*.
const VALID_TOOLS = ['dateien', 'rag', 'terminal'];

// Sub-directory (relative to host_path) that holds agent definition files.
const AGENTS_DIR = 'agenten';

// Fallback model when a definition omits `modell`/`model`.
const DEFAULT_AGENT_MODEL =
  process.env.AGENT_DEFAULT_MODEL || process.env.LLM_DEFAULT_MODEL || 'llama3.2';

/**
 * Split a raw file into its YAML frontmatter block and Markdown body.
 * Frontmatter is an opening `---` line, a YAML block, and a closing `---` line.
 * Returns { front: <yaml string>, body: <markdown string> }.
 */
function splitFrontmatter(text) {
  // Strip a leading UTF-8 BOM (U+FEFF), then normalize line endings.
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const normalized = withoutBom.replace(/\r\n/g, '\n');
  // Must start with a `---` fence (optionally preceded by whitespace).
  const match = normalized.match(/^\s*---\n([\s\S]*?)\n---\s*(?:\n([\s\S]*))?$/);
  if (!match) {
    return { front: '', body: normalized.trim() };
  }
  return { front: match[1], body: (match[2] || '').trim() };
}

/**
 * Parse the text of an agent definition file into a normalized definition.
 * @param {string} text - Raw file contents.
 * @returns {{name:string, description:string, model:string, tools:string[], systemPrompt:string}}
 * @throws {ValidationError} on missing name or an unknown tool name.
 */
function parseAgentFile(text) {
  if (typeof text !== 'string') {
    throw new ValidationError('Agenten-Datei ist leer oder ungueltig');
  }

  const { front, body } = splitFrontmatter(text);

  let meta = {};
  if (front.trim().length > 0) {
    try {
      meta = yaml.load(front) || {};
    } catch (err) {
      throw new ValidationError(`Agenten-Kopfdaten sind kein gueltiges YAML: ${err.message}`);
    }
    if (typeof meta !== 'object' || Array.isArray(meta)) {
      throw new ValidationError('Agenten-Kopfdaten muessen ein Objekt sein');
    }
  }

  // name (required) — accept only German/English key, no alias fallback for name.
  const name = typeof meta.name === 'string' ? meta.name.trim() : '';
  if (!name) {
    throw new ValidationError('Agenten-Datei braucht ein Feld "name"');
  }

  // description — beschreibung || description
  const description =
    (typeof meta.beschreibung === 'string' && meta.beschreibung.trim()) ||
    (typeof meta.description === 'string' && meta.description.trim()) ||
    '';

  // model — modell || model || default
  const model =
    (typeof meta.modell === 'string' && meta.modell.trim()) ||
    (typeof meta.model === 'string' && meta.model.trim()) ||
    DEFAULT_AGENT_MODEL;

  // tools — werkzeuge || tools (array of names)
  const rawTools = meta.werkzeuge != null ? meta.werkzeuge : meta.tools;
  let tools = [];
  if (rawTools != null) {
    if (!Array.isArray(rawTools)) {
      throw new ValidationError('Feld "werkzeuge"/"tools" muss eine Liste sein');
    }
    tools = rawTools.map(t => String(t).trim()).filter(Boolean);
    for (const t of tools) {
      if (!VALID_TOOLS.includes(t)) {
        throw new ValidationError(
          `Unbekanntes Werkzeug "${t}". Erlaubt: ${VALID_TOOLS.join(', ')}`
        );
      }
    }
    // De-duplicate while preserving order.
    tools = [...new Set(tools)];
  }

  return {
    name,
    description,
    model,
    tools,
    systemPrompt: body,
  };
}

/**
 * List the agent definition files in a workspace.
 * @param {string} hostPath - Workspace root (sandbox_projects.host_path).
 * @returns {Promise<string[]>} Agent names (basenames without the `.md` suffix),
 *   sorted. Returns [] if the workspace has no `agenten/` directory yet.
 */
async function listAgents(hostPath) {
  const dir = resolveWithin(hostPath, AGENTS_DIR);
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
  return entries
    .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.md'))
    .map(e => e.name.slice(0, -3))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Load and parse a single agent definition by name.
 * @param {string} hostPath - Workspace root.
 * @param {string} name - Agent name (the `<name>.md` basename, no extension).
 * @returns {Promise<object>} Parsed agent definition.
 * @throws {NotFoundError} if the file does not exist.
 * @throws {ValidationError} on a bad name or invalid definition.
 */
async function loadAgent(hostPath, name) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new ValidationError('Agenten-Name fehlt');
  }
  // Reject any path separator / traversal in the name — a name is a bare basename.
  const base = name.trim();
  if (base.includes('/') || base.includes('\\') || base.includes('..')) {
    throw new ValidationError(`Ungueltiger Agenten-Name "${name}"`);
  }
  const file = resolveWithin(hostPath, path.join(AGENTS_DIR, `${base}.md`));

  let text;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new NotFoundError(`Agent "${name}" nicht gefunden`);
    }
    throw err;
  }
  return parseAgentFile(text);
}

module.exports = {
  parseAgentFile,
  listAgents,
  loadAgent,
  VALID_TOOLS,
  AGENTS_DIR,
  DEFAULT_AGENT_MODEL,
};
