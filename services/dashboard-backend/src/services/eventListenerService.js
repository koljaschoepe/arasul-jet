/**
 * Event Listener Service
 * Monitors Docker events, n8n workflows, and system boot for proactive notifications
 */

const Docker = require('dockerode');
const db = require('../database');
const logger = require('../utils/logger');
const telegramService = require('./telegramNotificationService');

// Service name mappings (from docker.js)
const SERVICE_NAMES = {
    'llm-service': 'LLM Service',
    'embedding-service': 'Embedding Service',
    'n8n': 'n8n Workflows',
    'minio': 'MinIO Storage',
    'postgres-db': 'PostgreSQL',
    'dashboard-backend': 'Dashboard Backend',
    'dashboard-frontend': 'Dashboard Frontend',
    'metrics-collector': 'Metrics Collector',
    'self-healing-agent': 'Self-Healing Agent',
    'reverse-proxy': 'Reverse Proxy (Traefik)',
    'qdrant': 'Qdrant Vector DB',
    'document-indexer': 'Document Indexer'
};

// Status severity mapping
const STATUS_SEVERITY = {
    die: 'error',
    kill: 'error',
    oom: 'critical',
    stop: 'warning',
    start: 'info',
    restart: 'warning',
    pause: 'warning',
    unpause: 'info',
    health_status: 'info'
};

class EventListenerService {
    constructor() {
        this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
        this.eventStream = null;
        this.isListening = false;
        this.startTime = Date.now();
        this.bootDetected = false;
        this.eventCounts = {
            docker: 0,
            workflow: 0,
            boot: 0,
            selfHealing: 0
        };

        // WebSocket clients for broadcasting
        this.wsClients = new Set();

        logger.info('Event Listener Service initialized');
    }

    /**
     * Start listening to all event sources
     */
    async start() {
        logger.info('Starting Event Listener Service...');

        try {
            // Detect system boot on startup
            await this.detectSystemBoot();

            // Start Docker event listener
            await this.startDockerListener();

            // Start periodic pending notification processor
            this.startNotificationProcessor();

            logger.info('Event Listener Service started successfully');
            return { success: true };
        } catch (error) {
            logger.error(`Failed to start Event Listener Service: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Stop all listeners
     */
    async stop() {
        logger.info('Stopping Event Listener Service...');

        this.isListening = false;

        if (this.eventStream) {
            try {
                this.eventStream.destroy();
            } catch (error) {
                logger.warn(`Error stopping event stream: ${error.message}`);
            }
        }

        if (this.notificationProcessorInterval) {
            clearInterval(this.notificationProcessorInterval);
        }

        logger.info('Event Listener Service stopped');
    }

    /**
     * Start Docker events listener
     */
    async startDockerListener() {
        if (this.isListening) {
            logger.warn('Docker listener already running');
            return;
        }

        try {
            // Get event stream from Docker
            this.eventStream = await this.docker.getEvents({
                filters: {
                    type: ['container'],
                    event: ['start', 'stop', 'die', 'kill', 'restart', 'pause', 'unpause', 'health_status', 'oom']
                }
            });

            this.isListening = true;
            logger.info('Docker event listener started');

            this.eventStream.on('data', (chunk) => {
                try {
                    const event = JSON.parse(chunk.toString());
                    this.handleDockerEvent(event);
                } catch (error) {
                    logger.error(`Failed to parse Docker event: ${error.message}`);
                }
            });

            this.eventStream.on('error', (error) => {
                logger.error(`Docker event stream error: ${error.message}`);
                this.isListening = false;

                // Attempt to reconnect after 5 seconds
                setTimeout(() => {
                    if (!this.isListening) {
                        logger.info('Attempting to reconnect Docker event listener...');
                        this.startDockerListener();
                    }
                }, 5000);
            });

            this.eventStream.on('end', () => {
                logger.warn('Docker event stream ended');
                this.isListening = false;
            });

        } catch (error) {
            logger.error(`Failed to start Docker listener: ${error.message}`);
            this.isListening = false;
            throw error;
        }
    }

    /**
     * Handle Docker container event
     */
    async handleDockerEvent(event) {
        try {
            const containerName = event.Actor?.Attributes?.name || 'unknown';
            const action = event.Action;
            const serviceName = SERVICE_NAMES[containerName] || containerName;

            // Skip self-events (our own container starting up)
            if (containerName === 'dashboard-backend' && action === 'start' && !this.bootDetected) {
                return;
            }

            this.eventCounts.docker++;

            // Determine severity
            let severity = STATUS_SEVERITY[action] || 'info';

            // Special handling for health_status events
            let healthStatus = null;
            if (action === 'health_status') {
                healthStatus = event.Actor?.Attributes?.health_status;
                if (healthStatus === 'unhealthy') {
                    severity = 'warning';
                }
            }

            // Update status cache and check for changes
            const statusChange = await this.updateServiceStatusCache(
                containerName,
                action,
                healthStatus
            );

            // Only send notifications for significant changes
            if (!this.shouldNotifyDockerEvent(action, statusChange, containerName)) {
                logger.debug(`Docker event filtered: ${containerName} ${action}`);
                return;
            }

            // Create notification event
            const title = this.getDockerEventTitle(action, serviceName, healthStatus);
            const message = this.getDockerEventMessage(action, serviceName, healthStatus, statusChange);

            await telegramService.queueNotification({
                event_type: 'service_status',
                event_category: this.getDockerEventCategory(action),
                source_service: containerName,
                severity,
                title,
                message,
                metadata: {
                    action,
                    container_name: containerName,
                    health_status: healthStatus,
                    old_status: statusChange?.old_status,
                    new_status: statusChange?.new_status,
                    timestamp: new Date().toISOString()
                }
            });

            // Broadcast to WebSocket clients
            this.broadcastEvent({
                type: 'docker_event',
                service: containerName,
                action,
                severity,
                title,
                timestamp: new Date().toISOString()
            });

            logger.info(`Docker event processed: ${containerName} ${action}`);

        } catch (error) {
            logger.error(`Failed to handle Docker event: ${error.message}`);
        }
    }

    /**
     * Update service status cache and detect changes
     */
    async updateServiceStatusCache(containerName, action, healthStatus) {
        try {
            const status = this.actionToStatus(action);
            const health = healthStatus || (action === 'start' ? 'starting' : null);

            const result = await db.query(
                `SELECT * FROM update_service_status_cache($1, $2, $3, $4, $5)`,
                [
                    containerName,
                    containerName,
                    status,
                    health,
                    JSON.stringify({ last_action: action })
                ]
            );

            return result.rows[0] || {};
        } catch (error) {
            logger.error(`Failed to update status cache: ${error.message}`);
            return {};
        }
    }

    /**
     * Map Docker action to status string
     */
    actionToStatus(action) {
        const actionMap = {
            start: 'running',
            stop: 'stopped',
            die: 'exited',
            kill: 'killed',
            restart: 'restarting',
            pause: 'paused',
            unpause: 'running',
            oom: 'oom_killed'
        };
        return actionMap[action] || action;
    }

    /**
     * Determine if Docker event should trigger notification
     */
    shouldNotifyDockerEvent(action, statusChange, containerName) {
        // Always notify on critical events
        if (['die', 'kill', 'oom'].includes(action)) {
            return true;
        }

        // Always notify on unhealthy status
        if (action === 'health_status' && statusChange?.new_status === 'unhealthy') {
            return true;
        }

        // Notify on status changes (but not every health check)
        if (action !== 'health_status' && (statusChange?.status_changed || statusChange?.health_changed)) {
            return true;
        }

        // Don't spam with routine start events during boot
        const timeSinceBoot = Date.now() - this.startTime;
        if (timeSinceBoot < 60000 && action === 'start') {
            return false;
        }

        // Notify on start/stop for important services
        if (['start', 'stop', 'restart'].includes(action)) {
            const importantServices = ['llm-service', 'n8n', 'postgres-db', 'dashboard-backend'];
            return importantServices.includes(containerName);
        }

        return false;
    }

    /**
     * Get notification title for Docker event
     */
    getDockerEventTitle(action, serviceName, healthStatus) {
        if (action === 'health_status') {
            return healthStatus === 'healthy'
                ? `${serviceName} ist wieder gesund`
                : `${serviceName} ist unhealthy`;
        }

        const titleMap = {
            start: `${serviceName} gestartet`,
            stop: `${serviceName} gestoppt`,
            die: `${serviceName} beendet`,
            kill: `${serviceName} beendet (kill)`,
            restart: `${serviceName} wird neugestartet`,
            pause: `${serviceName} pausiert`,
            unpause: `${serviceName} fortgesetzt`,
            oom: `${serviceName} OOM-Kill!`
        };

        return titleMap[action] || `${serviceName}: ${action}`;
    }

    /**
     * Get notification message for Docker event
     */
    getDockerEventMessage(action, serviceName, healthStatus, statusChange) {
        if (action === 'oom') {
            return `Der Service ${serviceName} wurde wegen Speichermangel beendet. Self-Healing wird versuchen, den Service neu zu starten.`;
        }

        if (action === 'die') {
            return `Der Service ${serviceName} wurde unerwartet beendet. Prüfen Sie die Logs für Details.`;
        }

        if (action === 'health_status' && healthStatus === 'unhealthy') {
            return `Der Health-Check für ${serviceName} ist fehlgeschlagen. Self-Healing überwacht den Status.`;
        }

        if (action === 'restart') {
            return `Der Service ${serviceName} wird neu gestartet.`;
        }

        return null;
    }

    /**
     * Get event category for Docker action
     */
    getDockerEventCategory(action) {
        if (['die', 'kill', 'oom'].includes(action)) {
            return 'failure';
        }
        if (action === 'start') {
            return 'recovery';
        }
        return 'status_change';
    }

    /**
     * Handle n8n workflow event (called via webhook)
     */
    async handleWorkflowEvent(workflowData) {
        try {
            this.eventCounts.workflow++;

            const { workflow_id, workflow_name, status, execution_id, error, duration_ms } = workflowData;

            const severity = status === 'error' ? 'error' : (status === 'success' ? 'info' : 'warning');
            const category = status === 'error' ? 'failure' : 'completion';

            const title = status === 'error'
                ? `Workflow fehlgeschlagen: ${workflow_name}`
                : `Workflow abgeschlossen: ${workflow_name}`;

            const message = status === 'error'
                ? `Der Workflow "${workflow_name}" ist mit einem Fehler beendet worden.`
                : `Der Workflow "${workflow_name}" wurde erfolgreich ausgeführt.`;

            await telegramService.queueNotification({
                event_type: 'workflow_event',
                event_category: category,
                source_service: 'n8n',
                severity,
                title,
                message,
                metadata: {
                    workflow_id,
                    workflow_name,
                    execution_id,
                    status,
                    error,
                    duration_ms
                }
            });

            // Broadcast to WebSocket clients
            this.broadcastEvent({
                type: 'workflow_event',
                workflow_name,
                status,
                severity,
                timestamp: new Date().toISOString()
            });

            logger.info(`Workflow event processed: ${workflow_name} - ${status}`);

            return { success: true };
        } catch (error) {
            logger.error(`Failed to handle workflow event: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Detect and record system boot
     */
    async detectSystemBoot() {
        try {
            // Get last known boot time from database
            const result = await db.query(`
                SELECT boot_timestamp FROM system_boot_events
                ORDER BY boot_timestamp DESC LIMIT 1
            `);

            const lastBoot = result.rows[0]?.boot_timestamp;
            const currentUptime = process.uptime();

            // If backend just started (uptime < 60s) and no recent boot record, this is a boot
            if (currentUptime < 60) {
                // Check if we already recorded this boot (within last 5 minutes)
                if (lastBoot) {
                    const lastBootTime = new Date(lastBoot).getTime();
                    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

                    if (lastBootTime > fiveMinutesAgo) {
                        logger.debug('Recent boot already recorded, skipping');
                        return;
                    }
                }

                // Record new boot event
                await this.recordSystemBoot();
            }
        } catch (error) {
            logger.error(`Failed to detect system boot: ${error.message}`);
        }
    }

    /**
     * Record system boot event
     */
    async recordSystemBoot() {
        try {
            this.bootDetected = true;
            this.eventCounts.boot++;

            // Get current services status
            const servicesStatus = await this.getServicesStatusSnapshot();

            // Record in database
            const result = await db.query(
                `SELECT record_system_boot($1, $2)`,
                [JSON.stringify(servicesStatus), null]
            );

            const bootId = result.rows[0]?.record_system_boot;
            logger.info(`System boot recorded with ID: ${bootId}`);

            // Send notification
            await telegramService.queueNotification({
                event_type: 'system_boot',
                event_category: 'status_change',
                source_service: 'system',
                severity: 'info',
                title: 'Arasul System gestartet',
                message: 'Das Arasul Platform System wurde neu gestartet. Alle Services werden initialisiert.',
                metadata: {
                    boot_id: bootId,
                    services_count: Object.keys(servicesStatus).length,
                    timestamp: new Date().toISOString()
                }
            });

            // Broadcast to WebSocket clients
            this.broadcastEvent({
                type: 'system_boot',
                boot_id: bootId,
                timestamp: new Date().toISOString()
            });

            return { success: true, bootId };
        } catch (error) {
            logger.error(`Failed to record system boot: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get snapshot of all services status
     */
    async getServicesStatusSnapshot() {
        try {
            const containers = await this.docker.listContainers({ all: true });
            const status = {};

            for (const container of containers) {
                const name = container.Names[0]?.replace('/', '') || 'unknown';
                status[name] = {
                    status: container.State,
                    health: container.Status.includes('healthy') ? 'healthy' :
                           container.Status.includes('unhealthy') ? 'unhealthy' : 'unknown'
                };
            }

            return status;
        } catch (error) {
            logger.error(`Failed to get services snapshot: ${error.message}`);
            return {};
        }
    }

    /**
     * Handle self-healing event (called from self-healing-agent webhook)
     */
    async handleSelfHealingEvent(eventData) {
        try {
            this.eventCounts.selfHealing++;

            const { action_type, service_name, reason, success, duration_ms, error_message } = eventData;

            const severity = success ? 'info' : 'error';
            const category = success ? 'recovery' : 'failure';

            const title = success
                ? `Self-Healing: ${this.formatActionType(action_type)}`
                : `Self-Healing fehlgeschlagen: ${this.formatActionType(action_type)}`;

            const serviceFriendlyName = SERVICE_NAMES[service_name] || service_name;

            const message = success
                ? `Self-Healing hat erfolgreich "${this.formatActionType(action_type)}" auf ${serviceFriendlyName} ausgeführt.`
                : `Self-Healing konnte "${this.formatActionType(action_type)}" auf ${serviceFriendlyName} nicht ausführen.`;

            await telegramService.queueNotification({
                event_type: 'self_healing',
                event_category: category,
                source_service: service_name,
                severity,
                title,
                message,
                metadata: {
                    action_type,
                    service_name,
                    reason,
                    success,
                    duration_ms,
                    error: error_message
                }
            });

            // Broadcast to WebSocket clients
            this.broadcastEvent({
                type: 'self_healing',
                action: action_type,
                service: service_name,
                success,
                timestamp: new Date().toISOString()
            });

            logger.info(`Self-healing event processed: ${action_type} on ${service_name} - ${success ? 'success' : 'failed'}`);

            return { success: true };
        } catch (error) {
            logger.error(`Failed to handle self-healing event: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Format action type for display
     */
    formatActionType(actionType) {
        const actionMap = {
            service_restart: 'Service-Neustart',
            llm_cache_clear: 'LLM-Cache geleert',
            gpu_session_reset: 'GPU-Session zurückgesetzt',
            gpu_throttle: 'GPU gedrosselt',
            gpu_reset: 'GPU zurückgesetzt',
            disk_cleanup: 'Festplatten-Bereinigung',
            db_vacuum: 'Datenbank-Optimierung'
        };
        return actionMap[actionType] || actionType;
    }

    /**
     * Start periodic processor for pending notifications
     */
    startNotificationProcessor() {
        // Process pending notifications every 30 seconds
        this.notificationProcessorInterval = setInterval(async () => {
            try {
                await telegramService.processPendingFromDb();
            } catch (error) {
                logger.error(`Notification processor error: ${error.message}`);
            }
        }, 30000);

        logger.info('Notification processor started (30s interval)');
    }

    /**
     * Register WebSocket client for event broadcasting
     */
    registerWsClient(ws) {
        this.wsClients.add(ws);
        logger.debug(`WebSocket client registered (total: ${this.wsClients.size})`);

        ws.on('close', () => {
            this.wsClients.delete(ws);
            logger.debug(`WebSocket client unregistered (total: ${this.wsClients.size})`);
        });
    }

    /**
     * Broadcast event to all WebSocket clients
     */
    broadcastEvent(event) {
        const message = JSON.stringify(event);

        for (const client of this.wsClients) {
            try {
                if (client.readyState === 1) { // WebSocket.OPEN
                    client.send(message);
                }
            } catch (error) {
                logger.error(`Failed to broadcast to client: ${error.message}`);
            }
        }
    }

    /**
     * Get service statistics
     */
    getStats() {
        return {
            isListening: this.isListening,
            startTime: new Date(this.startTime).toISOString(),
            uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
            eventCounts: this.eventCounts,
            wsClients: this.wsClients.size,
            bootDetected: this.bootDetected
        };
    }

    /**
     * Get recent events from database
     */
    async getRecentEvents(limit = 50, eventType = null) {
        try {
            let query = `
                SELECT * FROM notification_events
                WHERE created_at > NOW() - INTERVAL '24 hours'
            `;
            const params = [];

            if (eventType) {
                query += ` AND event_type = $1`;
                params.push(eventType);
            }

            query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
            params.push(limit);

            const result = await db.query(query, params);
            return result.rows;
        } catch (error) {
            logger.error(`Failed to get recent events: ${error.message}`);
            return [];
        }
    }
}

// Singleton instance
const eventListenerService = new EventListenerService();

module.exports = eventListenerService;
