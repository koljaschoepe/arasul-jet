/**
 * Sandbox Service — container-create unit tests
 *
 * Verifies the docker.createContainer config produced by startContainer:
 * read-only tools mount (/opt/tools, open-ara sources) and the default
 * ARASUL_OLLAMA_URL env var, plus network-mode mapping.
 */

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/services/core/docker', () => ({
  docker: { getContainer: jest.fn(), createContainer: jest.fn(), getImage: jest.fn() },
}));
// Keep the module-load side effect (startIdleChecker) from opening timers
jest.mock('../../src/services/sandbox/sandboxIdleChecker', () => ({
  checkIdleContainers: jest.fn(),
  startIdleChecker: jest.fn(),
  stopIdleChecker: jest.fn(),
}));

const db = require('../../src/database');
const { docker } = require('../../src/services/core/docker');
const { getHostToolsDir } = require('../../src/services/sandbox/sandboxShared');
const sandboxService = require('../../src/services/sandbox/sandboxService');

const PROJECT_ROW = {
  id: 'p1',
  name: 'demo',
  slug: 'demo',
  status: 'active',
  container_id: null,
  container_name: null,
  container_status: 'none',
  committed_image: null,
  base_image: 'arasul-sandbox:latest',
  host_path: '/home/arasul/arasul/arasul-jet/data/sandbox/projects/demo',
  network_mode: 'isolated',
  resource_limits: { memory: '2G', cpus: '2', pids: 256 },
  environment: {},
  user_id: 1,
};

function setupMocks(projectOverrides = {}) {
  const project = { ...PROJECT_ROW, ...projectOverrides };
  db.query.mockImplementation(async sql => {
    if (/SELECT sp\.\*/.test(sql)) {
      return { rows: [project] };
    }
    return { rows: [] };
  });

  // Zombie cleanup: no container with that name
  docker.getContainer.mockReturnValue({
    remove: jest.fn().mockRejectedValue(Object.assign(new Error('no such container'), {
      statusCode: 404,
    })),
  });
  docker.createContainer.mockResolvedValue({
    id: 'container-123',
    start: jest.fn().mockResolvedValue(undefined),
  });
  return project;
}

describe('sandboxService.startContainer — createContainer config', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SANDBOX_HOST_TOOLS_DIR = '/home/arasul/arasul/arasul-jet/data/sandbox/tools';
  });

  afterEach(() => {
    delete process.env.SANDBOX_HOST_TOOLS_DIR;
  });

  test('mounts workspace rw and tools read-only at /opt/tools', async () => {
    setupMocks();

    await sandboxService.startContainer('p1', 1);

    expect(docker.createContainer).toHaveBeenCalledTimes(1);
    const config = docker.createContainer.mock.calls[0][0];
    expect(config.HostConfig.Binds).toEqual([
      `${PROJECT_ROW.host_path}:/workspace`,
      '/home/arasul/arasul/arasul-jet/data/sandbox/tools:/opt/tools:ro',
    ]);
  });

  test('sets ARASUL_OLLAMA_URL default env for local agents (open-ara)', async () => {
    setupMocks();

    await sandboxService.startContainer('p1', 1);

    const config = docker.createContainer.mock.calls[0][0];
    expect(config.Env).toContain('ARASUL_OLLAMA_URL=http://llm-service:11434');
    expect(config.Env).toContain('SANDBOX_PROJECT=demo');
  });

  test('isolated mode uses bridge network, internal uses backend network', async () => {
    setupMocks();
    await sandboxService.startContainer('p1', 1);
    expect(docker.createContainer.mock.calls[0][0].HostConfig.NetworkMode).toBe('bridge');

    jest.clearAllMocks();
    setupMocks({ network_mode: 'internal' });
    await sandboxService.startContainer('p1', 1);
    expect(docker.createContainer.mock.calls[0][0].HostConfig.NetworkMode).toBe(
      process.env.DOCKER_NETWORK || 'arasul-platform_arasul-backend'
    );
  });
});

describe('sandboxShared.getHostToolsDir', () => {
  beforeEach(() => {
    delete process.env.SANDBOX_HOST_TOOLS_DIR;
  });

  test('honors SANDBOX_HOST_TOOLS_DIR override', async () => {
    process.env.SANDBOX_HOST_TOOLS_DIR = '/custom/tools';
    await expect(getHostToolsDir()).resolves.toBe('/custom/tools');
    delete process.env.SANDBOX_HOST_TOOLS_DIR;
  });

  test('derives tools dir as sibling of the projects dir', async () => {
    process.env.SANDBOX_HOST_DATA_DIR = '/home/arasul/arasul/arasul-jet/data/sandbox/projects';
    await expect(getHostToolsDir()).resolves.toBe(
      '/home/arasul/arasul/arasul-jet/data/sandbox/tools'
    );
    delete process.env.SANDBOX_HOST_DATA_DIR;
  });
});
