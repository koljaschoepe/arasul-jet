/**
 * Logs API routes
 * Provides access to system logs
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

// Base log directory
const LOG_DIR = '/arasul/logs';

// Available log files and their paths
const LOG_FILES = {
    system: path.join(LOG_DIR, 'system.log'),
    self_healing: path.join(LOG_DIR, 'self_healing.log'),
    update: path.join(LOG_DIR, 'update.log'),
    traefik: path.join(LOG_DIR, 'traefik.log'),
    'traefik-access': path.join(LOG_DIR, 'traefik-access.log'),

    // Service-specific logs
    'metrics-collector': path.join(LOG_DIR, 'service', 'metrics-collector.log'),
    'dashboard-backend': path.join(LOG_DIR, 'service', 'dashboard-backend.log'),
    'dashboard-frontend': path.join(LOG_DIR, 'service', 'dashboard-frontend.log'),
    'llm-service': path.join(LOG_DIR, 'service', 'llm-service.log'),
    'embedding-service': path.join(LOG_DIR, 'service', 'embedding-service.log'),
    'n8n': path.join(LOG_DIR, 'service', 'n8n.log'),
    'self-healing-agent': path.join(LOG_DIR, 'service', 'self-healing-agent.log'),
    'postgres-db': path.join(LOG_DIR, 'service', 'postgres-db.log'),
    'minio': path.join(LOG_DIR, 'service', 'minio.log'),
};

// GET /api/logs - Read log file contents
router.get('/', requireAuth, async (req, res) => {
    try {
        const { service = 'system', lines = 100, format = 'text', level = null } = req.query;

        // Validate service parameter
        if (!LOG_FILES[service]) {
            return res.status(400).json({
                error: `Invalid service name. Available services: ${Object.keys(LOG_FILES).join(', ')}`,
                timestamp: new Date().toISOString()
            });
        }

        const logFilePath = LOG_FILES[service];

        // SEC-008 FIX: Validate normalized path to prevent path traversal
        const normalizedPath = path.normalize(logFilePath);
        const resolvedPath = path.resolve(normalizedPath);
        const resolvedLogDir = path.resolve(LOG_DIR);

        if (!resolvedPath.startsWith(resolvedLogDir)) {
            logger.warn(`Path traversal attempt detected: ${service} -> ${resolvedPath}`);
            return res.status(403).json({
                error: 'Access denied: Invalid log file path',
                timestamp: new Date().toISOString()
            });
        }

        // Check if log file exists
        try {
            await fs.access(logFilePath);
        } catch (error) {
            return res.status(404).json({
                error: `Log file not found for service: ${service}`,
                timestamp: new Date().toISOString()
            });
        }

        // Read log file
        const logContent = await fs.readFile(logFilePath, 'utf-8');
        const logLines = logContent.split('\n').filter(line => line.trim().length > 0);

        // Get last N lines
        const numLines = Math.min(parseInt(lines) || 100, 10000); // Max 10k lines
        const lastLines = logLines.slice(-numLines);

        // Filter by log level if specified
        let filteredLines = lastLines;
        if (level) {
            const levelUpper = level.toUpperCase();
            filteredLines = lastLines.filter(line => {
                // Check for log level in line (case-insensitive)
                return line.toUpperCase().includes(`[${levelUpper}]`) ||
                       line.toUpperCase().includes(`"level":"${levelUpper}"`) ||
                       line.toUpperCase().includes(`level=${levelUpper}`);
            });
        }

        // Return in requested format
        if (format === 'json') {
            // Try to parse JSON logs
            const parsedLogs = filteredLines.map((line, index) => {
                try {
                    return JSON.parse(line);
                } catch (e) {
                    // If not JSON, return as text with line number
                    return {
                        line: lastLines.length - filteredLines.length + index + 1,
                        text: line,
                        timestamp: extractTimestamp(line)
                    };
                }
            });

            return res.json({
                service,
                lines: parsedLogs.length,
                total_lines: logLines.length,
                logs: parsedLogs,
                timestamp: new Date().toISOString()
            });
        } else {
            // Return as plain text
            res.setHeader('Content-Type', 'text/plain');
            res.send(filteredLines.join('\n'));
        }

    } catch (error) {
        logger.error(`Error in /api/logs: ${error.message}`);
        res.status(500).json({
            error: 'Failed to read log file',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/logs/list - List available log files
router.get('/list', requireAuth, async (req, res) => {
    try {
        const availableLogs = [];

        for (const [serviceName, filePath] of Object.entries(LOG_FILES)) {
            try {
                const stats = await fs.stat(filePath);
                availableLogs.push({
                    service: serviceName,
                    path: filePath,
                    size: stats.size,
                    size_mb: (stats.size / 1024 / 1024).toFixed(2),
                    modified: stats.mtime,
                    accessible: true
                });
            } catch (error) {
                // File doesn't exist or not accessible
                availableLogs.push({
                    service: serviceName,
                    path: filePath,
                    accessible: false
                });
            }
        }

        res.json({
            logs: availableLogs,
            total: availableLogs.length,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/logs/list: ${error.message}`);
        res.status(500).json({
            error: 'Failed to list log files',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/logs/stream - Stream log file (last N lines + follow)
router.get('/stream', requireAuth, async (req, res) => {
    try {
        const { service = 'system', lines = 50 } = req.query;

        // Validate service parameter
        if (!LOG_FILES[service]) {
            return res.status(400).json({
                error: `Invalid service name. Available services: ${Object.keys(LOG_FILES).join(', ')}`,
                timestamp: new Date().toISOString()
            });
        }

        const logFilePath = LOG_FILES[service];

        // Check if log file exists
        try {
            await fs.access(logFilePath);
        } catch (error) {
            return res.status(404).json({
                error: `Log file not found for service: ${service}`,
                timestamp: new Date().toISOString()
            });
        }

        // Set up SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // BUG-006 FIX: Track file position instead of line count to avoid race condition
        const stats = await fs.stat(logFilePath);
        let lastPosition = stats.size;

        // Send initial log lines
        const logContent = await fs.readFile(logFilePath, 'utf-8');
        const logLines = logContent.split('\n').filter(line => line.trim().length > 0);
        const numLines = Math.min(parseInt(lines) || 50, 1000);
        const lastLines = logLines.slice(-numLines);

        lastLines.forEach(line => {
            res.write(`data: ${JSON.stringify({ line, timestamp: new Date().toISOString() })}\n\n`);
        });

        // Watch for file changes
        const watcher = fs.watch(logFilePath, async (eventType) => {
            if (eventType === 'change') {
                try {
                    const currentStats = await fs.stat(logFilePath);

                    // BUG-006 FIX: Check if file was rotated (size decreased)
                    if (currentStats.size < lastPosition) {
                        logger.info(`Log file ${service} was rotated, resetting position`);
                        lastPosition = 0;
                    }

                    // BUG-006 FIX: Read only new content from last position
                    if (currentStats.size > lastPosition) {
                        const stream = require('fs').createReadStream(logFilePath, {
                            start: lastPosition,
                            encoding: 'utf8'
                        });

                        let buffer = '';
                        stream.on('data', (chunk) => {
                            buffer += chunk;
                            const lines = buffer.split('\n');
                            buffer = lines.pop() || ''; // Keep incomplete line in buffer

                            lines.filter(line => line.trim().length > 0).forEach(line => {
                                res.write(`data: ${JSON.stringify({ line, timestamp: new Date().toISOString() })}\n\n`);
                            });
                        });

                        stream.on('end', () => {
                            lastPosition = currentStats.size;
                        });

                        stream.on('error', (err) => {
                            logger.error(`Error reading log stream: ${err.message}`);
                        });
                    }
                } catch (error) {
                    // Ignore read errors during streaming
                    logger.debug(`Log streaming error: ${error.message}`);
                }
            }
        });

        // Clean up on client disconnect
        req.on('close', () => {
            watcher.close();
            res.end();
        });

    } catch (error) {
        logger.error(`Error in /api/logs/stream: ${error.message}`);
        res.status(500).json({
            error: 'Failed to stream log file',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/logs/search - Search logs for a pattern
router.get('/search', requireAuth, async (req, res) => {
    try {
        const { service = 'system', query, lines = 100, case_sensitive = 'false' } = req.query;

        if (!query) {
            return res.status(400).json({
                error: 'Search query is required',
                timestamp: new Date().toISOString()
            });
        }

        // Validate service parameter
        if (!LOG_FILES[service]) {
            return res.status(400).json({
                error: `Invalid service name. Available services: ${Object.keys(LOG_FILES).join(', ')}`,
                timestamp: new Date().toISOString()
            });
        }

        const logFilePath = LOG_FILES[service];

        // Check if log file exists
        try {
            await fs.access(logFilePath);
        } catch (error) {
            return res.status(404).json({
                error: `Log file not found for service: ${service}`,
                timestamp: new Date().toISOString()
            });
        }

        // Read log file
        const logContent = await fs.readFile(logFilePath, 'utf-8');
        const logLines = logContent.split('\n').filter(line => line.trim().length > 0);

        // Search for pattern
        const isCaseSensitive = case_sensitive === 'true';
        const searchQuery = isCaseSensitive ? query : query.toLowerCase();

        const matchingLines = logLines.filter(line => {
            const searchLine = isCaseSensitive ? line : line.toLowerCase();
            return searchLine.includes(searchQuery);
        });

        // Get last N matching lines
        const numLines = Math.min(parseInt(lines) || 100, 10000);
        const lastMatches = matchingLines.slice(-numLines);

        res.json({
            service,
            query,
            case_sensitive: isCaseSensitive,
            matches: lastMatches.length,
            total_lines: logLines.length,
            lines: lastMatches,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/logs/search: ${error.message}`);
        res.status(500).json({
            error: 'Failed to search log file',
            timestamp: new Date().toISOString()
        });
    }
});

// Helper function to extract timestamp from log line
function extractTimestamp(line) {
    // Try to extract ISO timestamp
    const isoMatch = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/);
    if (isoMatch) {
        return isoMatch[0];
    }

    // Try to extract standard timestamp
    const stdMatch = line.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    if (stdMatch) {
        return stdMatch[0];
    }

    return null;
}

module.exports = router;
