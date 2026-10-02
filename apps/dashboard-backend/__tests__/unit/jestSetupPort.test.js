/**
 * Der Portbereich aus jest.setup.js darf an einem fremden Lauscher nicht
 * scheitern. Ein zweiter Jest-Lauf (anderer Worktree) oder ein Dienst des
 * Rechners belegt dieselben Ports; vorher beantwortete der Fremde die Anfrage
 * eines beliebigen Tests (M2, security.test.js wackelte).
 */
const http = require('http');
const express = require('express');
const request = require('supertest');

describe('Testserver-Ports', () => {
  it('weicht einem belegten Port aus, statt die Anfrage dem Fremden zu geben', async () => {
    // Den Port finden, den der naechste Testserver bekaeme, und ihn besetzen.
    const probe = http.createServer();
    probe.listen(0);
    const naechster = probe.address().port;
    await new Promise(resolve => probe.close(resolve));

    const fremder = http.createServer((req, res) => res.writeHead(401).end('fremd'));
    await new Promise((resolve, reject) => {
      fremder.once('error', reject);
      fremder.listen(naechster + 1, resolve);
    });

    const app = express();
    app.get('/ok', (req, res) => res.json({ ok: true }));
    for (let i = 0; i < 3; i += 1) {
      const res = await request(app).get('/ok');
      expect(res.status).toBe(200);
    }
    await new Promise(resolve => fremder.close(resolve));
  });
});
