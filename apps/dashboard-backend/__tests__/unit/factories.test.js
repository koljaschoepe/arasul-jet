/**
 * Contract tests for the test data factories.
 *
 * Not feature tests — these pin the default shape and override semantics
 * so a factory change surfaces here before it silently breaks consumers.
 */

const {
  makeUser,
  makeAdmin,
  makeViewer,
  makeInactiveUser,
  makeChat,
  makeMessage,
  makeAttachment,
  makeDocument,
  makeBotConfig,
  makeNotificationRule,
  makeSetupSession,
  makeProject,
  makeKnowledgeSpace,
} = require('../factories');
const { resetSequence } = require('../factories/_seq');

describe('factories', () => {
  beforeEach(() => resetSequence(1000));

  describe('makeUser', () => {
    test('produces a complete admin_users row with sensible defaults', () => {
      const u = makeUser();
      expect(u).toEqual(expect.objectContaining({
        id: expect.any(Number),
        username: expect.stringMatching(/^user\d+$/),
        email: expect.stringMatching(/@arasul\.local$/),
        role: 'admin',
        is_active: true,
      }));
    });

    test('overrides win over defaults', () => {
      const u = makeUser({ id: 42, role: 'viewer', email: 'x@y.z' });
      expect(u.id).toBe(42);
      expect(u.role).toBe('viewer');
      expect(u.email).toBe('x@y.z');
    });

    test('sequential calls produce distinct ids', () => {
      const a = makeUser();
      const b = makeUser();
      expect(a.id).not.toBe(b.id);
    });

    test('role helpers set the expected role', () => {
      expect(makeAdmin().role).toBe('admin');
      expect(makeViewer().role).toBe('viewer');
      expect(makeInactiveUser().is_active).toBe(false);
    });
  });

  describe('chat factories', () => {
    test('makeChat defaults to no project', () => {
      const c = makeChat();
      expect(c.project_id).toBeNull();
      expect(c.title).toMatch(/^Conversation /);
    });

    test('makeMessage role defaults to user and status to completed', () => {
      const m = makeMessage();
      expect(m.role).toBe('user');
      expect(m.status).toBe('completed');
      expect(m.job_id).toBeNull();
    });

    test('makeAttachment ties to a message_id and carries extraction state', () => {
      const a = makeAttachment({ message_id: 99 });
      expect(a.message_id).toBe(99);
      expect(a.extraction_status).toBe('completed');
      expect(a.truncated).toBe(false);
    });
  });

  describe('makeDocument', () => {
    test('uses a UUID-shaped id and a deterministic content hash', () => {
      const d = makeDocument();
      expect(d.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(d.content_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(d.file_hash).toBe(d.content_hash);
      expect(d.status).toBe('processed');
    });
  });

  describe('telegram factories', () => {
    test('makeBotConfig returns an active, notifications-enabled bot', () => {
      const b = makeBotConfig();
      expect(b.is_active).toBe(true);
      expect(b.notifications_enabled).toBe(true);
      expect(b.bot_token_encrypted).toMatch(/^enc:/);
      expect(typeof b.chat_id).toBe('string');
    });

    test('makeNotificationRule includes the event triple + template', () => {
      const r = makeNotificationRule();
      expect(r.event_source).toBe('system');
      expect(r.event_type).toBe('cpu_high');
      expect(r.message_template).toContain('{{event.value}}');
    });

    test('makeSetupSession starts as pending with no bot/chat metadata', () => {
      const s = makeSetupSession();
      expect(s.status).toBe('pending');
      expect(s.bot_username).toBeNull();
      expect(s.chat_id).toBeNull();
      expect(s.expires_at.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('project factories', () => {
    test('makeProject is non-default and scoped to user 1', () => {
      const p = makeProject();
      expect(p.is_default).toBe(false);
      expect(p.user_id).toBe(1);
      expect(p.system_prompt).toMatch(/assistant/);
    });

    test('makeKnowledgeSpace has a slug derived from its id', () => {
      const s = makeKnowledgeSpace({ id: 7 });
      expect(s.slug).toBe('space-7');
      expect(s.is_default).toBe(false);
    });
  });
});
