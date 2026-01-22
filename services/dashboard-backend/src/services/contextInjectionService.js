/**
 * Context Injection Service for Claude Terminal
 * Automatically collects system metrics, logs, and service status
 * to provide context for LLM queries
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const services = require('../config/services');

const METRICS_COLLECTOR_URL = services.metrics.url;
const LLM_SERVICE_URL = services.llm.url;
const LOG_DIR = '/arasul/logs';

// Sensitive patterns to mask in logs and context
const SENSITIVE_PATTERNS = [
    /(?:api[_-]?key|apikey|token|secret|password|passwd|pwd|auth|bearer)\s*[:=]\s*['"]?([^'"\s,;]+)/gi,
    /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
    /(?:eyJ[A-Za-z0-9\-_]+\.){2}[A-Za-z0-9\-_]+/g, // JWT tokens
    /(?:sk-|pk-)[A-Za-z0-9]{20,}/g, // API keys
    /(?:[A-Za-z0-9+/]{4}){10,}={0,2}/g // Long base64 strings
];

/**
 * Mask sensitive data in text
 */
function maskSensitiveData(text) {
    if (!text) return text;

    let masked = text;
    SENSITIVE_PATTERNS.forEach(pattern => {
        masked = masked.replace(pattern, '[MASKED]');
    });
    return masked;
}

/**
 * Get current system metrics
 */
async function getSystemMetrics() {
    try {
        const response = await axios.get(`${METRICS_COLLECTOR_URL}/metrics`, { timeout: 2000 });
        return {
            cpu: response.data.cpu || 0,
            ram: response.data.ram || 0,
            gpu: response.data.gpu || 0,
            temperature: response.data.temperature || 0,
            disk: response.data.disk || { used: 0, free: 0, total: 0, percent: 0 },
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        logger.warn(`Failed to get system metrics: ${error.message}`);
        return {
            error: 'Metrics unavailable',
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Get service status overview
 */
async function getServiceStatus() {
    const services = {
        llm: { status: 'unknown' },
        embedding: { status: 'unknown' },
        postgres: { status: 'unknown' },
        minio: { status: 'unknown' },
        qdrant: { status: 'unknown' }
    };

    // Check LLM service
    try {
        await axios.get(`${LLM_SERVICE_URL}/api/tags`, { timeout: 2000 });
        services.llm.status = 'online';
    } catch (e) {
        services.llm.status = 'offline';
    }

    // Check Embedding service
    try {
        const embeddingUrl = `http://${process.env.EMBEDDING_SERVICE_HOST || 'embedding-service'}:${process.env.EMBEDDING_SERVICE_PORT || '11435'}`;
        await axios.get(`${embeddingUrl}/health`, { timeout: 2000 });
        services.embedding.status = 'online';
    } catch (e) {
        services.embedding.status = 'offline';
    }

    // Check Qdrant
    try {
        const qdrantUrl = `http://${process.env.QDRANT_HOST || 'qdrant'}:${process.env.QDRANT_PORT || '6333'}`;
        await axios.get(`${qdrantUrl}/collections`, { timeout: 2000 });
        services.qdrant.status = 'online';
    } catch (e) {
        services.qdrant.status = 'offline';
    }

    return services;
}

/**
 * Get recent log lines from a specific service
 * @param {string} service - Service name
 * @param {number} lines - Number of lines to retrieve (default: 50)
 */
async function getRecentLogs(service = 'system', lines = 50) {
    const LOG_FILES = {
        system: path.join(LOG_DIR, 'system.log'),
        self_healing: path.join(LOG_DIR, 'self_healing.log'),
        'dashboard-backend': path.join(LOG_DIR, 'service', 'dashboard-backend.log'),
        'llm-service': path.join(LOG_DIR, 'service', 'llm-service.log'),
        'embedding-service': path.join(LOG_DIR, 'service', 'embedding-service.log')
    };

    const logPath = LOG_FILES[service];
    if (!logPath) {
        return { service, error: 'Unknown service', lines: [] };
    }

    try {
        const content = await fs.readFile(logPath, 'utf-8');
        const logLines = content.split('\n').filter(line => line.trim().length > 0);
        const recentLines = logLines.slice(-lines).map(line => maskSensitiveData(line));

        return {
            service,
            count: recentLines.length,
            lines: recentLines
        };
    } catch (error) {
        logger.debug(`Could not read logs for ${service}: ${error.message}`);
        return {
            service,
            error: 'Log file not accessible',
            lines: []
        };
    }
}

/**
 * Build complete context for Claude Terminal query
 * @param {Object} options - Context options
 * @param {boolean} options.includeMetrics - Include system metrics (default: true)
 * @param {boolean} options.includeLogs - Include recent logs (default: true)
 * @param {boolean} options.includeServices - Include service status (default: true)
 * @param {number} options.logLines - Number of log lines per service (default: 30)
 * @param {string[]} options.logServices - Which services to get logs from
 */
async function buildContext(options = {}) {
    const {
        includeMetrics = true,
        includeLogs = true,
        includeServices = true,
        logLines = 30,
        logServices = ['system', 'self_healing']
    } = options;

    const context = {
        timestamp: new Date().toISOString(),
        platform: 'Arasul Edge AI Platform',
        hardware: 'NVIDIA Jetson AGX Orin'
    };

    const promises = [];

    if (includeMetrics) {
        promises.push(
            getSystemMetrics().then(metrics => {
                context.systemMetrics = metrics;
            })
        );
    }

    if (includeServices) {
        promises.push(
            getServiceStatus().then(services => {
                context.services = services;
            })
        );
    }

    if (includeLogs) {
        promises.push(
            Promise.all(
                logServices.map(service => getRecentLogs(service, logLines))
            ).then(logs => {
                context.recentLogs = logs;
            })
        );
    }

    await Promise.all(promises);

    return context;
}

/**
 * Format context for LLM system prompt injection
 */
function formatContextForPrompt(context) {
    const lines = [
        '=== SYSTEM CONTEXT ===',
        `Platform: ${context.platform}`,
        `Hardware: ${context.hardware}`,
        `Timestamp: ${context.timestamp}`,
        ''
    ];

    if (context.systemMetrics && !context.systemMetrics.error) {
        lines.push('--- System Metrics ---');
        lines.push(`CPU: ${context.systemMetrics.cpu?.toFixed(1) || 'N/A'}%`);
        lines.push(`RAM: ${context.systemMetrics.ram?.toFixed(1) || 'N/A'}%`);
        lines.push(`GPU: ${context.systemMetrics.gpu?.toFixed(1) || 'N/A'}%`);
        lines.push(`Temperature: ${context.systemMetrics.temperature?.toFixed(1) || 'N/A'}°C`);
        if (context.systemMetrics.disk) {
            lines.push(`Disk: ${context.systemMetrics.disk.percent?.toFixed(1) || 'N/A'}% used`);
        }
        lines.push('');
    }

    if (context.services) {
        lines.push('--- Service Status ---');
        for (const [name, info] of Object.entries(context.services)) {
            const statusIcon = info.status === 'online' ? '✓' : '✗';
            lines.push(`${statusIcon} ${name}: ${info.status}`);
        }
        lines.push('');
    }

    if (context.recentLogs && context.recentLogs.length > 0) {
        lines.push('--- Recent Logs (last entries) ---');
        for (const logGroup of context.recentLogs) {
            if (logGroup.lines && logGroup.lines.length > 0) {
                lines.push(`[${logGroup.service}]`);
                // Only include last 10 lines per service to keep context manageable
                const lastLines = logGroup.lines.slice(-10);
                lastLines.forEach(line => {
                    // Truncate very long lines
                    const truncated = line.length > 200 ? line.substring(0, 200) + '...' : line;
                    lines.push(`  ${truncated}`);
                });
                lines.push('');
            }
        }
    }

    lines.push('=== END CONTEXT ===');
    lines.push('');

    return lines.join('\n');
}

module.exports = {
    buildContext,
    formatContextForPrompt,
    getSystemMetrics,
    getServiceStatus,
    getRecentLogs,
    maskSensitiveData
};
