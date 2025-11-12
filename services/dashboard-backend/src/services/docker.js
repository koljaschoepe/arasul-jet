/**
 * Docker service module
 * Interacts with Docker daemon to get service statuses
 */

const Docker = require('dockerode');
const logger = require('../utils/logger');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// Service name mappings
const SERVICE_NAMES = {
    'llm-service': 'llm',
    'embedding-service': 'embeddings',
    'n8n': 'n8n',
    'minio': 'minio',
    'postgres-db': 'postgres',
    'dashboard-backend': 'dashboard_backend',
    'dashboard-frontend': 'dashboard_frontend',
    'metrics-collector': 'metrics',
    'self-healing-agent': 'self_healing',
    'reverse-proxy': 'proxy'
};

/**
 * Get status of all relevant services
 */
async function getAllServicesStatus() {
    const statuses = {};

    try {
        const containers = await docker.listContainers({ all: true });

        // Initialize all services as unknown
        Object.values(SERVICE_NAMES).forEach(name => {
            statuses[name] = { status: 'unknown', health: 'unknown' };
        });

        containers.forEach(container => {
            const containerName = container.Names[0].replace('/', '');
            const serviceName = SERVICE_NAMES[containerName];

            if (serviceName) {
                let status = 'unknown';
                let health = 'unknown';

                // Map Docker state to our status
                if (container.State === 'running') {
                    status = 'healthy';

                    // Check health status if available
                    if (container.Status.includes('(healthy)')) {
                        health = 'healthy';
                    } else if (container.Status.includes('(unhealthy)')) {
                        status = 'failed';
                        health = 'unhealthy';
                    } else if (container.Status.includes('(starting)')) {
                        status = 'starting';
                        health = 'starting';
                    }

                } else if (container.State === 'restarting') {
                    status = 'restarting';
                    health = 'restarting';
                } else if (container.State === 'exited') {
                    status = 'exited';
                    health = 'failed';
                } else if (container.State === 'paused') {
                    status = 'paused';
                    health = 'paused';
                }

                statuses[serviceName] = {
                    status,
                    health,
                    state: container.State,
                    containerName
                };
            }
        });

        return statuses;

    } catch (error) {
        logger.error(`Error getting service statuses: ${error.message}`);
        return statuses;
    }
}

/**
 * Get detailed info about a specific container
 */
async function getContainerInfo(containerName) {
    try {
        const container = docker.getContainer(containerName);
        const info = await container.inspect();
        return info;
    } catch (error) {
        logger.error(`Error getting container info for ${containerName}: ${error.message}`);
        return null;
    }
}

/**
 * Restart a container
 */
async function restartContainer(containerName) {
    try {
        const container = docker.getContainer(containerName);
        await container.restart();
        logger.info(`Container ${containerName} restarted successfully`);
        return true;
    } catch (error) {
        logger.error(`Error restarting container ${containerName}: ${error.message}`);
        return false;
    }
}

/**
 * Stop a container
 */
async function stopContainer(containerName) {
    try {
        const container = docker.getContainer(containerName);
        await container.stop();
        logger.info(`Container ${containerName} stopped successfully`);
        return true;
    } catch (error) {
        logger.error(`Error stopping container ${containerName}: ${error.message}`);
        return false;
    }
}

/**
 * Start a container
 */
async function startContainer(containerName) {
    try {
        const container = docker.getContainer(containerName);
        await container.start();
        logger.info(`Container ${containerName} started successfully`);
        return true;
    } catch (error) {
        logger.error(`Error starting container ${containerName}: ${error.message}`);
        return false;
    }
}

module.exports = {
    getAllServicesStatus,
    getContainerInfo,
    restartContainer,
    stopContainer,
    startContainer
};
