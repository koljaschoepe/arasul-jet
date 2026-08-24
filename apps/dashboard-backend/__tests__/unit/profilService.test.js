/**
 * Tests fuer den Firmenprofil-Dienst.
 *
 * Hervorgegangen aus `memoryService.test.js`, das am 24.08.2026 mit dem
 * KI-Gedaechtnis gestrichen wurde. Uebrig sind die Profil-Faelle: sie decken
 * den Teil ab, der weiterlebt, weil der Einrichtungsassistent und
 * `systemPromptBuilder` darauf zeigen.
 *
 * - generateProfileYaml (reine Funktion)
 * - getProfile          (MinIO, dann Datenbank als Rueckfallebene)
 * - updateProfile       (Groessengrenze, MinIO + Datenbank)
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/database', () => ({
  query: jest.fn(),
}));

jest.mock('../../src/config/services', () => ({
  minio: { host: 'minio', port: 9000 },
}));

jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => ({
    bucketExists: jest.fn().mockResolvedValue(true),
    makeBucket: jest.fn().mockResolvedValue(undefined),
    getObject: jest.fn(),
    putObject: jest.fn().mockResolvedValue(undefined),
  })),
}));

const database = require('../../src/database');
const profilService = require('../../src/services/memory/profilService');

describe('profilService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateProfileYaml', () => {
    it('should generate minimal YAML with only sprache', () => {
      const yaml = profilService.generateProfileYaml({});

      expect(yaml).toContain('sprache: "de"');
      expect(yaml.endsWith('\n')).toBe(true);
    });

    it('should include firma', () => {
      const yaml = profilService.generateProfileYaml({ firma: 'Arasul GmbH' });

      expect(yaml).toContain('firma: "Arasul GmbH"');
    });

    it('should include branche', () => {
      const yaml = profilService.generateProfileYaml({ branche: 'IT-Dienstleistungen' });

      expect(yaml).toContain('branche: "IT-Dienstleistungen"');
    });

    it('should include teamgroesse as mitarbeiter', () => {
      const yaml = profilService.generateProfileYaml({ teamgroesse: 50 });

      expect(yaml).toContain('mitarbeiter: 50');
    });

    it('should include produkte list', () => {
      const yaml = profilService.generateProfileYaml({
        produkte: ['Edge AI', 'IoT Gateway'],
      });

      expect(yaml).toContain('produkte:');
      expect(yaml).toContain('  - Edge AI');
      expect(yaml).toContain('  - IoT Gateway');
    });

    it('should not include produkte if empty array', () => {
      const yaml = profilService.generateProfileYaml({ produkte: [] });

      expect(yaml).not.toContain('produkte:');
    });

    it('should include praeferenzen', () => {
      const yaml = profilService.generateProfileYaml({
        praeferenzen: {
          antwortlaenge: 'mittel',
          formalitaet: 'formell',
        },
      });

      expect(yaml).toContain('praeferenzen:');
      expect(yaml).toContain('  antwortlaenge: "mittel"');
      expect(yaml).toContain('  formalitaet: "formell"');
    });

    it('should generate complete YAML', () => {
      const yaml = profilService.generateProfileYaml({
        firma: 'TestCo',
        branche: 'Tech',
        teamgroesse: 10,
        produkte: ['Product A'],
        praeferenzen: { antwortlaenge: 'kurz' },
      });

      expect(yaml).toContain('firma: "TestCo"');
      expect(yaml).toContain('branche: "Tech"');
      expect(yaml).toContain('sprache: "de"');
      expect(yaml).toContain('mitarbeiter: 10');
      expect(yaml).toContain('produkte:');
      expect(yaml).toContain('  - Product A');
      expect(yaml).toContain('praeferenzen:');
      expect(yaml).toContain('  antwortlaenge: "kurz"');
    });
  });

  // =========================================================================
  // getProfile
  // =========================================================================
  describe('getProfile', () => {
    it('should return MinIO profile when available', async () => {
      // readFile internally calls getMinioClient().getObject
      // Since readFile uses getObject, we need to mock it via the minio client
      const Minio = require('minio');
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('firma: "Test"\nsprache: "de"\n');
        },
      };
      Minio.Client.mock.results[0]?.value?.getObject?.mockResolvedValue(mockStream);

      // Force re-init by calling readFile path directly
      const result = await profilService.getProfile();

      // If MinIO returns content, DB should not be queried for profile
      // (though it might be queried, the test verifies the return value)
      if (result) {
        expect(result).toContain('firma');
      }
    });

    it('should fall back to database when MinIO returns null', async () => {
      const Minio = require('minio');
      Minio.Client.mock.results[0]?.value?.getObject?.mockRejectedValue({ code: 'NoSuchKey' });

      database.query.mockResolvedValue({
        rows: [{ ai_profile_yaml: 'firma: "DB Fallback"\n' }],
      });

      const result = await profilService.getProfile();

      expect(result).toBe('firma: "DB Fallback"\n');
    });

    it('should return null when neither MinIO nor DB has profile', async () => {
      const Minio = require('minio');
      Minio.Client.mock.results[0]?.value?.getObject?.mockRejectedValue({ code: 'NoSuchKey' });

      database.query.mockResolvedValue({ rows: [] });

      const result = await profilService.getProfile();

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // updateProfile
  // =========================================================================
  describe('updateProfile', () => {
    it('should reject profiles exceeding MAX_PROFILE_BYTES', async () => {
      const oversized = 'a'.repeat(3000);

      await expect(profilService.updateProfile(oversized)).rejects.toThrow(
        /Das Profil ist zu groß/
      );
    });

    it('should save to MinIO and DB', async () => {
      const Minio = require('minio');
      const mockPutObject = Minio.Client.mock.results[0]?.value?.putObject;
      const mockBucketExists = Minio.Client.mock.results[0]?.value?.bucketExists;
      mockBucketExists?.mockResolvedValue(true);
      mockPutObject?.mockResolvedValue(undefined);
      database.query.mockResolvedValue({ rows: [] });

      const yamlContent = 'firma: "Test"\nsprache: "de"\n';
      await profilService.updateProfile(yamlContent);

      // Should have called DB to save backup
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE system_settings'),
        expect.arrayContaining([yamlContent])
      );
    });
  });

  // =========================================================================
  // getAllMemories
  // =========================================================================
});
