/**
 * Telegram WebSocket Service
 *
 * Provides real-time communication for Telegram bot setup wizard.
 * Notifies frontend clients when chat is detected after /start command.
 */

const WebSocket = require('ws');
const logger = require('../utils/logger');

class TelegramWebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // setupToken -> Set<WebSocket>
    this.initialized = false;
  }

  /**
   * Initialize WebSocket server
   * @param {http.Server} server - HTTP server instance
   */
  initialize(server) {
    if (this.initialized) {
      logger.warn('TelegramWebSocketService already initialized');
      return;
    }

    this.wss = new WebSocket.Server({
      server,
      path: '/api/telegram-app/ws'
    });

    this.wss.on('connection', (ws, req) => {
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      logger.info(`Telegram WebSocket client connected from ${clientIp}`);

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to Telegram setup WebSocket',
        timestamp: new Date().toISOString()
      }));

      ws.on('message', (data) => {
        this.handleMessage(ws, data);
      });

      ws.on('close', () => {
        logger.debug('Telegram WebSocket client disconnected');
        this.unsubscribeClient(ws);
      });

      ws.on('error', (error) => {
        logger.error('Telegram WebSocket error:', error.message);
        this.unsubscribeClient(ws);
      });

      // Heartbeat to keep connection alive
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });
    });

    // Heartbeat interval to detect dead connections
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          logger.debug('Terminating dead WebSocket connection');
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // Every 30 seconds

    this.wss.on('close', () => {
      clearInterval(this.heartbeatInterval);
    });

    this.initialized = true;
    logger.info('Telegram WebSocket Service initialized at /api/telegram-app/ws');
  }

  /**
   * Handle incoming WebSocket messages
   * @param {WebSocket} ws - WebSocket client
   * @param {Buffer|string} data - Message data
   */
  handleMessage(ws, data) {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'subscribe':
          if (message.setupToken) {
            this.subscribeClient(ws, message.setupToken);
            ws.send(JSON.stringify({
              type: 'subscribed',
              setupToken: message.setupToken.substring(0, 8) + '...',
              timestamp: new Date().toISOString()
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Missing setupToken',
              timestamp: new Date().toISOString()
            }));
          }
          break;

        case 'unsubscribe':
          this.unsubscribeClient(ws);
          ws.send(JSON.stringify({
            type: 'unsubscribed',
            timestamp: new Date().toISOString()
          }));
          break;

        case 'ping':
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: new Date().toISOString()
          }));
          break;

        default:
          logger.debug(`Unknown WebSocket message type: ${message.type}`);
      }
    } catch (err) {
      logger.error('Error parsing WebSocket message:', err.message);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid JSON message',
        timestamp: new Date().toISOString()
      }));
    }
  }

  /**
   * Subscribe a client to a setup token
   * @param {WebSocket} ws - WebSocket client
   * @param {string} setupToken - Setup session token
   */
  subscribeClient(ws, setupToken) {
    if (!this.clients.has(setupToken)) {
      this.clients.set(setupToken, new Set());
    }
    this.clients.get(setupToken).add(ws);

    // Store token on ws for cleanup
    ws.setupToken = setupToken;

    logger.info(`Client subscribed to setup token: ${setupToken.substring(0, 8)}...`);
  }

  /**
   * Unsubscribe a client from all tokens
   * @param {WebSocket} ws - WebSocket client
   */
  unsubscribeClient(ws) {
    // If we stored the token on the ws, use it directly
    if (ws.setupToken && this.clients.has(ws.setupToken)) {
      const clients = this.clients.get(ws.setupToken);
      clients.delete(ws);
      if (clients.size === 0) {
        this.clients.delete(ws.setupToken);
      }
      return;
    }

    // Fallback: iterate all tokens
    for (const [token, clients] of this.clients.entries()) {
      if (clients.has(ws)) {
        clients.delete(ws);
        if (clients.size === 0) {
          this.clients.delete(token);
        }
        break;
      }
    }
  }

  /**
   * Broadcast a message to all clients subscribed to a setup token
   * @param {string} setupToken - Setup session token
   * @param {object} data - Data to send
   */
  broadcast(setupToken, data) {
    if (!this.initialized) {
      logger.warn('TelegramWebSocketService not initialized, cannot broadcast');
      return false;
    }

    const clients = this.clients.get(setupToken);
    if (!clients || clients.size === 0) {
      logger.debug(`No clients subscribed to setup token: ${setupToken.substring(0, 8)}...`);
      return false;
    }

    const message = JSON.stringify({
      ...data,
      timestamp: new Date().toISOString()
    });

    let sentCount = 0;
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
        sentCount++;
      }
    }

    logger.info(`Broadcast to ${sentCount}/${clients.size} client(s) for token ${setupToken.substring(0, 8)}...`);
    return sentCount > 0;
  }

  /**
   * Notify clients that setup is complete
   * @param {string} setupToken - Setup session token
   * @param {object} chatData - Chat information
   */
  notifySetupComplete(setupToken, chatData) {
    return this.broadcast(setupToken, {
      type: 'setup_complete',
      status: 'completed',
      chatId: chatData.chatId,
      chatUsername: chatData.username || null,
      chatFirstName: chatData.firstName || null,
      chatType: chatData.type || 'private'
    });
  }

  /**
   * Notify clients of setup progress
   * @param {string} setupToken - Setup session token
   * @param {string} status - Current status
   * @param {string} message - Status message
   */
  notifyProgress(setupToken, status, message) {
    return this.broadcast(setupToken, {
      type: 'progress',
      status,
      message
    });
  }

  /**
   * Notify clients of an error
   * @param {string} setupToken - Setup session token
   * @param {string} error - Error message
   */
  notifyError(setupToken, error) {
    return this.broadcast(setupToken, {
      type: 'error',
      status: 'error',
      error
    });
  }

  /**
   * Get the number of subscribed clients for a token
   * @param {string} setupToken - Setup session token
   * @returns {number} Client count
   */
  getClientCount(setupToken) {
    const clients = this.clients.get(setupToken);
    return clients ? clients.size : 0;
  }

  /**
   * Check if service is initialized
   * @returns {boolean}
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Get service stats
   * @returns {object} Stats
   */
  getStats() {
    let totalClients = 0;
    this.clients.forEach(clients => {
      totalClients += clients.size;
    });

    return {
      initialized: this.initialized,
      activeTokens: this.clients.size,
      totalClients,
      wsServerClients: this.wss ? this.wss.clients.size : 0
    };
  }
}

// Export singleton instance
module.exports = new TelegramWebSocketService();
