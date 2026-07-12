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
const logger = require('../../src/utils/logger');
const { docker } = require('../../src/services/core/docker');
const {
  getHostToolsDir,
  getHostRepoDir,
  getDockerSockGid,
} = require('../../src/services/sandbox/sandboxShared');
const sandboxService = require('../../src/services/sandbox/sandboxService');
const { ForbiddenError } = require('../../src/utils/errors');

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

  describe('infrastructure mode', () => {
    beforeEach(() => {
      process.env.SANDBOX_HOST_REPO_DIR = '/home/arasul/arasul/arasul-jet';
      process.env.SANDBOX_DOCKER_SOCK_GID = '994';
    });

    afterEach(() => {
      delete process.env.SANDBOX_HOST_REPO_DIR;
      delete process.env.SANDBOX_DOCKER_SOCK_GID;
    });

    test('mounts platform repo rw + docker socket in addition to workspace/tools', async () => {
      setupMocks({ network_mode: 'infrastructure' });

      await sandboxService.startContainer('p1', 1);

      const config = docker.createContainer.mock.calls[0][0];
      expect(config.HostConfig.Binds).toEqual([
        `${PROJECT_ROW.host_path}:/workspace`,
        '/home/arasul/arasul/arasul-jet/data/sandbox/tools:/opt/tools:ro',
        '/home/arasul/arasul/arasul-jet:/workspace/repo:rw',
        '/var/run/docker.sock:/var/run/docker.sock',
      ]);
    });

    test('uses backend network and adds the docker socket GID via GroupAdd', async () => {
      setupMocks({ network_mode: 'infrastructure' });

      await sandboxService.startContainer('p1', 1);

      const config = docker.createContainer.mock.calls[0][0];
      expect(config.HostConfig.NetworkMode).toBe(
        process.env.DOCKER_NETWORK || 'arasul-platform_arasul-backend'
      );
      expect(config.HostConfig.GroupAdd).toEqual(['994']);
    });

    test('does not weaken container hardening (CapDrop/no-new-privileges) and logs audit warn', async () => {
      setupMocks({ network_mode: 'infrastructure' });

      await sandboxService.startContainer('p1', 1);

      const config = docker.createContainer.mock.calls[0][0];
      expect(config.HostConfig.CapDrop).toEqual(['ALL']);
      expect(config.HostConfig.SecurityOpt).toEqual(['no-new-privileges:true']);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('AUDIT'));
    });

    test('isolated/internal containers get no GroupAdd and no extra binds', async () => {
      setupMocks({ network_mode: 'internal' });

      await sandboxService.startContainer('p1', 1);

      const config = docker.createContainer.mock.calls[0][0];
      expect(config.HostConfig.GroupAdd).toBeUndefined();
      expect(config.HostConfig.Binds).toHaveLength(2);
    });
  });
});

describe('sandboxService.createProject — infrastructure authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockImplementation(async sql => {
      if (/generate_sandbox_slug/.test(sql)) {
        return { rows: [{ slug: 'infra-projekt' }] };
      }
      if (/INSERT INTO sandbox_projects/.test(sql)) {
        return {
          rows: [{ id: 'p9', name: 'Infra', slug: 'infra-projekt', network_mode: 'infrastructure' }],
        };
      }
      return { rows: [] };
    });
  });

  test('rejects infrastructure mode for non-admin users with ForbiddenError', async () => {
    await expect(
      sandboxService.createProject({
        name: 'Infra',
        network_mode: 'infrastructure',
        userId: 2,
        userRole: 'viewer',
      })
    ).rejects.toThrow(ForbiddenError);
    expect(db.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO sandbox_projects'),
      expect.anything()
    );
  });

  test('allows infrastructure mode for admins and writes an audit warn log', async () => {
    const project = await sandboxService.createProject({
      name: 'Infra',
      network_mode: 'infrastructure',
      userId: 1,
      userRole: 'admin',
    });

    expect(project.network_mode).toBe('infrastructure');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('AUDIT'));
  });

  test('isolated projects need no admin role', async () => {
    db.query.mockImplementation(async sql => {
      if (/generate_sandbox_slug/.test(sql)) {
        return { rows: [{ slug: 'demo' }] };
      }
      if (/INSERT INTO sandbox_projects/.test(sql)) {
        return { rows: [{ id: 'p10', name: 'demo', slug: 'demo', network_mode: 'isolated' }] };
      }
      return { rows: [] };
    });

    await expect(
      sandboxService.createProject({ name: 'demo', userId: 2, userRole: 'viewer' })
    ).resolves.toMatchObject({ network_mode: 'isolated' });
  });
});

describe('sandboxService.updateProject — infrastructure authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockImplementation(async sql => {
      if (/SELECT sp\.\*/.test(sql)) {
        return { rows: [{ id: 'p1', name: 'demo', network_mode: 'isolated', user_id: 2 }] };
      }
      if (/UPDATE sandbox_projects/.test(sql)) {
        return { rows: [{ id: 'p1', name: 'demo', network_mode: 'infrastructure' }] };
      }
      return { rows: [] };
    });
  });

  test('rejects switching to infrastructure for non-admin users', async () => {
    await expect(
      sandboxService.updateProject('p1', { network_mode: 'infrastructure' }, 2, 'viewer')
    ).rejects.toThrow(ForbiddenError);
  });

  test('admins can switch to infrastructure (audit warn logged)', async () => {
    await expect(
      sandboxService.updateProject('p1', { network_mode: 'infrastructure' }, 1, 'admin')
    ).resolves.toMatchObject({ network_mode: 'infrastructure' });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('AUDIT'));
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

describe('sandboxShared.getHostRepoDir', () => {
  afterEach(() => {
    delete process.env.SANDBOX_HOST_REPO_DIR;
    delete process.env.SANDBOX_HOST_DATA_DIR;
  });

  test('honors SANDBOX_HOST_REPO_DIR override', async () => {
    process.env.SANDBOX_HOST_REPO_DIR = '/custom/repo';
    await expect(getHostRepoDir()).resolves.toBe('/custom/repo');
  });

  test('derives repo dir as ancestor of the projects dir (…/data/sandbox/projects → repo)', async () => {
    process.env.SANDBOX_HOST_DATA_DIR = '/home/arasul/arasul/arasul-jet/data/sandbox/projects';
    await expect(getHostRepoDir()).resolves.toBe('/home/arasul/arasul/arasul-jet');
  });
});

describe('sandboxShared.getDockerSockGid', () => {
  afterEach(() => {
    delete process.env.SANDBOX_DOCKER_SOCK_GID;
    delete process.env.DOCKER_GID;
  });

  test('honors SANDBOX_DOCKER_SOCK_GID override', () => {
    process.env.SANDBOX_DOCKER_SOCK_GID = '1234';
    expect(getDockerSockGid()).toBe(1234);
  });

  test('falls back to DOCKER_GID', () => {
    process.env.DOCKER_GID = '994';
    expect(getDockerSockGid()).toBe(994);
  });

  test('ignores non-numeric env values and still returns a number', () => {
    process.env.SANDBOX_DOCKER_SOCK_GID = 'not-a-gid';
    expect(typeof getDockerSockGid()).toBe('number');
  });
});
