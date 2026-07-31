/**
 * Einmal-Tickets für den WebSocket-Aufbau (2026-07-31).
 *
 * Der Vertrag ist bewusst schmal und sicherheitsrelevant: an EINEN Nutzer
 * gebunden, genau EINMAL verbrauchbar, nach kurzer Frist tot. Genau das
 * prüfen diese Tests.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';

const ticketService = require('../../src/services/sandbox/wsTicketService');

describe('wsTicketService', () => {
  test('ein frisch ausgestelltes Ticket liefert beim Verbrauch die userId', () => {
    const { ticket } = ticketService.issue(42);
    expect(typeof ticket).toBe('string');
    expect(ticket.length).toBeGreaterThan(20);
    expect(ticketService.consume(ticket)).toBe(42);
  });

  test('ein Ticket ist nur EINMAL verbrauchbar', () => {
    const { ticket } = ticketService.issue(7);
    expect(ticketService.consume(ticket)).toBe(7);
    expect(ticketService.consume(ticket)).toBeNull();
  });

  test('unbekannte oder leere Tickets ergeben null', () => {
    expect(ticketService.consume('gibt-es-nicht')).toBeNull();
    expect(ticketService.consume('')).toBeNull();
    expect(ticketService.consume(null)).toBeNull();
    expect(ticketService.consume(undefined)).toBeNull();
  });

  test('ein abgelaufenes Ticket wird nicht mehr akzeptiert', () => {
    const echt = Date.now;
    try {
      const { ticket } = ticketService.issue(9);
      // Zeit über die TTL hinaus vorspulen.
      Date.now = () => echt() + ticketService.TICKET_TTL_MS + 1000;
      expect(ticketService.consume(ticket)).toBeNull();
    } finally {
      Date.now = echt;
    }
  });

  test('zwei Tickets sind unterscheidbar und unabhängig', () => {
    const a = ticketService.issue(1).ticket;
    const b = ticketService.issue(2).ticket;
    expect(a).not.toBe(b);
    expect(ticketService.consume(b)).toBe(2);
    expect(ticketService.consume(a)).toBe(1);
  });
});
