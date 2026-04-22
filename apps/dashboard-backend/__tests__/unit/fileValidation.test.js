/**
 * Unit tests for utils/fileValidation.js
 *
 * Covers magic-byte validation for binary types and null-byte rejection
 * for text types. These guards protect upload endpoints from mislabeled
 * content (e.g. a .pdf extension wrapping a shell script).
 */

const { validateFileContent, MAGIC_BYTES } = require('../../src/utils/fileValidation');

describe('validateFileContent', () => {
  describe('binary types (magic bytes)', () => {
    test('accepts valid PDF', () => {
      const buf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
      expect(validateFileContent(buf, '.pdf')).toBe(true);
    });

    test('rejects PDF with wrong magic', () => {
      const buf = Buffer.from([0x00, 0x50, 0x44, 0x46]);
      expect(validateFileContent(buf, '.pdf')).toBe(false);
    });

    test('rejects buffer shorter than magic length', () => {
      const buf = Buffer.from([0x25, 0x50]);
      expect(validateFileContent(buf, '.pdf')).toBe(false);
    });

    test('accepts valid DOCX (ZIP archive)', () => {
      const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
      expect(validateFileContent(buf, '.docx')).toBe(true);
    });

    test('accepts valid PNG', () => {
      const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(validateFileContent(buf, '.png')).toBe(true);
    });

    test('accepts valid JPEG for both .jpg and .jpeg', () => {
      const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      expect(validateFileContent(buf, '.jpg')).toBe(true);
      expect(validateFileContent(buf, '.jpeg')).toBe(true);
    });

    test('accepts valid GIF', () => {
      const buf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
      expect(validateFileContent(buf, '.gif')).toBe(true);
    });

    test('accepts valid WebP (RIFF)', () => {
      const buf = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00]);
      expect(validateFileContent(buf, '.webp')).toBe(true);
    });

    test('rejects text file mislabeled as PDF', () => {
      const buf = Buffer.from('plain text not a pdf', 'utf8');
      expect(validateFileContent(buf, '.pdf')).toBe(false);
    });

    test('rejects PNG labeled as JPEG', () => {
      const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      expect(validateFileContent(buf, '.jpg')).toBe(false);
    });
  });

  describe('text types (null-byte rejection)', () => {
    test.each(['.md', '.markdown', '.txt', '.yaml', '.yml', '.svg'])(
      'accepts clean UTF-8 for %s',
      (ext) => {
        const buf = Buffer.from('hello world\nzweite zeile', 'utf8');
        expect(validateFileContent(buf, ext)).toBe(true);
      }
    );

    test('rejects text file containing null byte', () => {
      const buf = Buffer.concat([
        Buffer.from('hello ', 'utf8'),
        Buffer.from([0x00]),
        Buffer.from('world', 'utf8'),
      ]);
      expect(validateFileContent(buf, '.txt')).toBe(false);
    });

    test('only scans first 8KB for null bytes', () => {
      const prefix = Buffer.alloc(8192, 0x61);
      const trailing = Buffer.concat([prefix, Buffer.from([0x00])]);
      expect(validateFileContent(trailing, '.txt')).toBe(true);
    });

    test('accepts empty text buffer', () => {
      expect(validateFileContent(Buffer.alloc(0), '.md')).toBe(true);
    });
  });

  describe('unknown extensions', () => {
    test('allows unknown extension without validation', () => {
      const buf = Buffer.from([0x00, 0x01, 0x02]);
      expect(validateFileContent(buf, '.bin')).toBe(true);
    });
  });

  describe('MAGIC_BYTES export', () => {
    test('exposes all expected file types', () => {
      expect(Object.keys(MAGIC_BYTES).sort()).toEqual(
        ['.docx', '.gif', '.jpeg', '.jpg', '.pdf', '.png', '.webp'].sort()
      );
    });
  });
});
