/**
 * Metrics streaming service
 * Pushes live metrics to WebSocket clients
 */

const axios = require('axios');
const logger = require('../utils/logger');

const METRICS_COLLECTOR_URL = `http://${process.env.METRICS_COLLECTOR_HOST || 'metrics-collector'}:9100`;
const STREAM_INTERVAL = 5000; // 5 seconds

let streamInterval = null;

/**
 * Start streaming metrics to all connected WebSocket clients
 */
function startMetricsStream(wss) {
    if (streamInterval) {
        clearInterval(streamInterval);
    }

    streamInterval = setInterval(async () => {
        try {
            // Get latest metrics
            const response = await axios.get(`${METRICS_COLLECTOR_URL}/metrics`, {
                timeout: 2000
            });

            const metrics = response.data;

            // Broadcast to all connected clients
            wss.clients.forEach((client) => {
                if (client.readyState === 1) { // OPEN state
                    client.send(JSON.stringify(metrics));
                }
            });

        } catch (error) {
            logger.error(`Error streaming metrics: ${error.message}`);
        }
    }, STREAM_INTERVAL);

    logger.info(`Metrics streaming started (interval: ${STREAM_INTERVAL}ms)`);
}

/**
 * Stop streaming metrics
 */
function stopMetricsStream() {
    if (streamInterval) {
        clearInterval(streamInterval);
        streamInterval = null;
        logger.info('Metrics streaming stopped');
    }
}

module.exports = {
    startMetricsStream,
    stopMetricsStream
};
