/**
 * Alert delivery integration test.
 *
 * Boots a real HTTP receiver on 127.0.0.1 (via Node's http module) and
 * points the alert-engine's webhook delivery at it through the
 * database-settings mock. Verifies:
 *   - The receiver sees a POST with the expected JSON payload.
 *   - The signature header matches HMAC-SHA256(webhook_secret, body).
 *   - The alert-engine returns without throwing when delivery succeeds.
 *
 * SSRF protection blocks 127.0.0.1 by default, so this test binds to
 * 127.0.0.1 *and* monkey-patches the SSRF allow-list indirectly: we
 * start the mock receiver on 127.0.0.1 but pass its URL via the
 * webhook_url field. The alertEngine's validateWebhookUrl call will
 * reject 127.0.0.1, so we also assert the SSRF guard fires on that
 * URL — covering both happy-path (public DNS) and the defensive path.
 */

const http = require('http');
const crypto = require('crypto');

jest.mock('../../src/database');
jest.mock('../../src/utils/logger');
jest.mock('../../src/services/telegram/telegramNotificationService', () => ({
  enabled: false,
  queueNotification: jest.fn(),
}));

const database = require('../../src/database');
const { createAlertEngine } = require('../../src/services/alertEngine');

function startReceiver() {
  const received = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      received.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        server,
        port,
        received,
        url: `http://127.0.0.1:${port}/hook`,
        close: () =>
          new Promise((r) => {
            server.close(() => r());
          }),
      });
    });
  });
}

describe('alert-engine webhook delivery (integration)', () => {
  let receiver;

  beforeEach(async () => {
    jest.clearAllMocks();
    receiver = await startReceiver();
  });

  afterEach(async () => {
    if (receiver) {
      await receiver.close();
    }
  });

  test('rejects 127.0.0.1 webhook URLs via SSRF guard', async () => {
    const engine = createAlertEngine({
      database,
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    });

    // SSRF guard should reject 127.0.0.1
    await expect(
      engine.testWebhook(receiver.url, 'shh-very-secret')
    ).rejects.toThrow(/interne|privat|intern/i);
  });

  test('fires webhook with signed payload when delivery succeeds', async () => {
    // To exercise the delivery path without disabling SSRF, we wire
    // axios directly against the real receiver via the testWebhook
    // method — but first we have to bypass validateWebhookUrl for
    // 127.0.0.1. The cleanest way is to monkey-patch dns.resolve4
    // to return a public IP for our mock hostname.
    const dns = require('dns');
    const realResolve4 = dns.resolve4;
    dns.resolve4 = (hostname, cb) => cb(null, ['93.184.216.34']); // example.com

    try {
      const engine = createAlertEngine({
        database,
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      });

      // Use a non-IP-literal hostname so the SSRF guard goes down the
      // DNS resolution branch (which we stubbed). We rewrite the URL
      // to 127.0.0.1 via axios interceptor below.
      const fakeUrl = `http://hook.example.com:${receiver.port}/hook`;
      const secret = 'shh-very-secret';

      // Redirect all axios calls to the real receiver. The alert
      // engine's testWebhook signs the payload then calls axios.post;
      // we intercept and rewrite the host to 127.0.0.1.
      const axios = require('axios');
      const realPost = axios.post;
      axios.post = (url, body, opts) => {
        const rewritten = url.replace('hook.example.com', '127.0.0.1');
        return realPost(rewritten, body, opts);
      };

      try {
        const result = await engine.testWebhook(fakeUrl, secret);
        expect(result).toBeDefined();
        expect(result.success).toBe(true);
        expect(result.statusCode).toBe(200);
      } finally {
        axios.post = realPost;
      }

      expect(receiver.received).toHaveLength(1);
      const req = receiver.received[0];
      expect(req.method).toBe('POST');
      expect(req.headers['content-type']).toContain('application/json');

      const payload = JSON.parse(req.body);
      expect(payload.event).toBe('test');
      expect(payload.source).toBe('arasul-platform');
      expect(typeof payload.timestamp).toBe('string');

      const expected = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');
      expect(req.headers['x-arasul-signature']).toBe(`sha256=${expected}`);
    } finally {
      dns.resolve4 = realResolve4;
    }
  });
});
