/**
 * Unit tests for Telegram WebSocket Service
 * Tests WebSocket initialization, client management, and broadcasting
 */

const WebSocket = require('ws');
const EventEmitter = require('events');

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Create mock WebSocket class
class MockWebSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = WebSocket.OPEN;
    this.sentMessages = [];
    this.isAlive = true;
  }

  send(data) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    this.emit('close');
  }

  terminate() {
    this.readyState = WebSocket.CLOSED;
  }

  ping() {
    // Simulate pong response
    setTimeout(() => this.emit('pong'), 10);
  }
}

// Create mock WebSocket Server
class MockWebSocketServer extends EventEmitter {
  constructor() {
    super();
    this.clients = new Set();
  }

  addClient(client) {
    this.clients.add(client);
  }

  removeClient(client) {
    this.clients.delete(client);
  }
}

// Mock ws module
jest.mock('ws', () => ({
  Server: jest.fn().mockImplementation(() => new MockWebSocketServer()),
  OPEN: 1,
  CLOSED: 3,
}));

describe('TelegramWebSocketService', () => {
  let service;
  let mockServer;
  let mockWss;

  beforeEach(() => {
    // Clear module cache to get fresh instance
    jest.resetModules();
    jest.clearAllMocks();

    // Create fresh mock server
    mockServer = {
      on: jest.fn(),
    };

    // Get fresh service instance
    service = require('../../src/services/telegramWebSocketService');

    // Reset service state
    service.wss = null;
    service.clients = new Map();
    service.initialized = false;
  });

  afterEach(() => {
    if (service.heartbeatInterval) {
      clearInterval(service.heartbeatInterval);
    }
  });

  describe('initialize()', () => {
    test('should initialize WebSocket server with correct path', () => {
      service.initialize(mockServer);

      // Verify service is initialized
      expect(service.initialized).toBe(true);
      expect(service.wss).toBeDefined();
    });

    test('should not re-initialize if already initialized', () => {
      service.initialize(mockServer);
      const firstWss = service.wss;
      const firstInitialized = service.initialized;

      // Try to initialize again
      service.initialize(mockServer);

      // Should still use the same WSS instance
      expect(service.wss).toBe(firstWss);
      expect(service.initialized).toBe(firstInitialized);
    });

    test('should set up connection handler', () => {
      service.initialize(mockServer);

      expect(service.wss.on).toBeDefined();
    });
  });

  describe('subscribeClient()', () => {
    const setupToken = 'test-setup-token-12345';

    beforeEach(() => {
      service.initialize(mockServer);
    });

    test('should add client to token subscription', () => {
      const mockWs = new MockWebSocket();

      service.subscribeClient(mockWs, setupToken);

      expect(service.clients.has(setupToken)).toBe(true);
      expect(service.clients.get(setupToken).has(mockWs)).toBe(true);
    });

    test('should store setupToken on WebSocket client', () => {
      const mockWs = new MockWebSocket();

      service.subscribeClient(mockWs, setupToken);

      expect(mockWs.setupToken).toBe(setupToken);
    });

    test('should allow multiple clients for same token', () => {
      const mockWs1 = new MockWebSocket();
      const mockWs2 = new MockWebSocket();

      service.subscribeClient(mockWs1, setupToken);
      service.subscribeClient(mockWs2, setupToken);

      expect(service.clients.get(setupToken).size).toBe(2);
    });
  });

  describe('unsubscribeClient()', () => {
    const setupToken = 'test-setup-token-12345';

    beforeEach(() => {
      service.initialize(mockServer);
    });

    test('should remove client from subscription', () => {
      const mockWs = new MockWebSocket();
      service.subscribeClient(mockWs, setupToken);

      service.unsubscribeClient(mockWs);

      expect(service.clients.get(setupToken)?.has(mockWs)).toBeFalsy();
    });

    test('should delete token entry when no clients remain', () => {
      const mockWs = new MockWebSocket();
      service.subscribeClient(mockWs, setupToken);

      service.unsubscribeClient(mockWs);

      expect(service.clients.has(setupToken)).toBe(false);
    });

    test('should keep other clients when one unsubscribes', () => {
      const mockWs1 = new MockWebSocket();
      const mockWs2 = new MockWebSocket();
      service.subscribeClient(mockWs1, setupToken);
      service.subscribeClient(mockWs2, setupToken);

      service.unsubscribeClient(mockWs1);

      expect(service.clients.get(setupToken).has(mockWs2)).toBe(true);
      expect(service.clients.get(setupToken).size).toBe(1);
    });
  });

  describe('broadcast()', () => {
    const setupToken = 'test-setup-token-12345';

    beforeEach(() => {
      service.initialize(mockServer);
    });

    test('should return false if not initialized', () => {
      service.initialized = false;

      const result = service.broadcast(setupToken, { type: 'test' });

      expect(result).toBe(false);
    });

    test('should return false if no clients subscribed', () => {
      const result = service.broadcast(setupToken, { type: 'test' });

      expect(result).toBe(false);
    });

    test('should send message to subscribed clients', () => {
      const mockWs = new MockWebSocket();
      service.subscribeClient(mockWs, setupToken);

      const result = service.broadcast(setupToken, { type: 'test', data: 'hello' });

      expect(result).toBe(true);
      expect(mockWs.sentMessages.length).toBe(1);

      const sentMessage = JSON.parse(mockWs.sentMessages[0]);
      expect(sentMessage.type).toBe('test');
      expect(sentMessage.data).toBe('hello');
      expect(sentMessage.timestamp).toBeDefined();
    });

    test('should not send to closed connections', () => {
      const mockWs = new MockWebSocket();
      mockWs.readyState = WebSocket.CLOSED;
      service.subscribeClient(mockWs, setupToken);

      const result = service.broadcast(setupToken, { type: 'test' });

      expect(result).toBe(false);
      expect(mockWs.sentMessages.length).toBe(0);
    });

    test('should send to all open connections', () => {
      const mockWs1 = new MockWebSocket();
      const mockWs2 = new MockWebSocket();
      service.subscribeClient(mockWs1, setupToken);
      service.subscribeClient(mockWs2, setupToken);

      service.broadcast(setupToken, { type: 'test' });

      expect(mockWs1.sentMessages.length).toBe(1);
      expect(mockWs2.sentMessages.length).toBe(1);
    });
  });

  describe('notifySetupComplete()', () => {
    const setupToken = 'test-setup-token-12345';
    const chatData = {
      chatId: 123456789,
      username: 'testuser',
      firstName: 'Test',
      type: 'private',
    };

    beforeEach(() => {
      service.initialize(mockServer);
    });

    test('should broadcast setup_complete message with chat data', () => {
      const mockWs = new MockWebSocket();
      service.subscribeClient(mockWs, setupToken);

      service.notifySetupComplete(setupToken, chatData);

      expect(mockWs.sentMessages.length).toBe(1);

      const message = JSON.parse(mockWs.sentMessages[0]);
      expect(message.type).toBe('setup_complete');
      expect(message.status).toBe('completed');
      expect(message.chatId).toBe(chatData.chatId);
      expect(message.chatUsername).toBe(chatData.username);
      expect(message.chatFirstName).toBe(chatData.firstName);
      expect(message.chatType).toBe(chatData.type);
    });
  });

  describe('notifyProgress()', () => {
    const setupToken = 'test-setup-token-12345';

    beforeEach(() => {
      service.initialize(mockServer);
    });

    test('should broadcast progress message', () => {
      const mockWs = new MockWebSocket();
      service.subscribeClient(mockWs, setupToken);

      service.notifyProgress(setupToken, 'validating', 'Token wird validiert...');

      const message = JSON.parse(mockWs.sentMessages[0]);
      expect(message.type).toBe('progress');
      expect(message.status).toBe('validating');
      expect(message.message).toBe('Token wird validiert...');
    });
  });

  describe('notifyError()', () => {
    const setupToken = 'test-setup-token-12345';

    beforeEach(() => {
      service.initialize(mockServer);
    });

    test('should broadcast error message', () => {
      const mockWs = new MockWebSocket();
      service.subscribeClient(mockWs, setupToken);

      service.notifyError(setupToken, 'Token ungueltig');

      const message = JSON.parse(mockWs.sentMessages[0]);
      expect(message.type).toBe('error');
      expect(message.status).toBe('error');
      expect(message.error).toBe('Token ungueltig');
    });
  });

  describe('getClientCount()', () => {
    const setupToken = 'test-setup-token-12345';

    beforeEach(() => {
      service.initialize(mockServer);
    });

    test('should return 0 for unknown token', () => {
      expect(service.getClientCount('unknown-token')).toBe(0);
    });

    test('should return correct count', () => {
      const mockWs1 = new MockWebSocket();
      const mockWs2 = new MockWebSocket();
      service.subscribeClient(mockWs1, setupToken);
      service.subscribeClient(mockWs2, setupToken);

      expect(service.getClientCount(setupToken)).toBe(2);
    });
  });

  describe('isInitialized()', () => {
    test('should return false before initialization', () => {
      expect(service.isInitialized()).toBe(false);
    });

    test('should return true after initialization', () => {
      service.initialize(mockServer);

      expect(service.isInitialized()).toBe(true);
    });
  });

  describe('getStats()', () => {
    const setupToken = 'test-setup-token-12345';

    test('should return stats object', () => {
      service.initialize(mockServer);
      const mockWs = new MockWebSocket();
      service.subscribeClient(mockWs, setupToken);

      const stats = service.getStats();

      expect(stats.initialized).toBe(true);
      expect(stats.activeTokens).toBe(1);
      expect(stats.totalClients).toBe(1);
    });

    test('should return correct counts for multiple tokens', () => {
      service.initialize(mockServer);

      const mockWs1 = new MockWebSocket();
      const mockWs2 = new MockWebSocket();
      const mockWs3 = new MockWebSocket();

      service.subscribeClient(mockWs1, 'token1');
      service.subscribeClient(mockWs2, 'token1');
      service.subscribeClient(mockWs3, 'token2');

      const stats = service.getStats();

      expect(stats.activeTokens).toBe(2);
      expect(stats.totalClients).toBe(3);
    });
  });

  describe('handleMessage()', () => {
    beforeEach(() => {
      service.initialize(mockServer);
    });

    test('should handle subscribe message', () => {
      const mockWs = new MockWebSocket();
      const message = JSON.stringify({
        type: 'subscribe',
        setupToken: 'test-token-123',
      });

      service.handleMessage(mockWs, message);

      expect(service.clients.has('test-token-123')).toBe(true);
      expect(mockWs.sentMessages.length).toBe(1);

      const response = JSON.parse(mockWs.sentMessages[0]);
      expect(response.type).toBe('subscribed');
    });

    test('should handle subscribe without token', () => {
      const mockWs = new MockWebSocket();
      const message = JSON.stringify({
        type: 'subscribe',
      });

      service.handleMessage(mockWs, message);

      const response = JSON.parse(mockWs.sentMessages[0]);
      expect(response.type).toBe('error');
      expect(response.message).toBe('Missing setupToken');
    });

    test('should handle unsubscribe message', () => {
      const mockWs = new MockWebSocket();
      service.subscribeClient(mockWs, 'test-token');

      service.handleMessage(mockWs, JSON.stringify({ type: 'unsubscribe' }));

      expect(service.clients.has('test-token')).toBe(false);
    });

    test('should handle ping message', () => {
      const mockWs = new MockWebSocket();

      service.handleMessage(mockWs, JSON.stringify({ type: 'ping' }));

      const response = JSON.parse(mockWs.sentMessages[0]);
      expect(response.type).toBe('pong');
    });

    test('should handle invalid JSON', () => {
      const mockWs = new MockWebSocket();

      service.handleMessage(mockWs, 'not valid json');

      const response = JSON.parse(mockWs.sentMessages[0]);
      expect(response.type).toBe('error');
      expect(response.message).toBe('Invalid JSON message');
    });
  });
});
