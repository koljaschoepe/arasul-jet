const { isValidSlug, escapeIdentifier, escapeTableName, SQL_RESERVED_KEYWORDS } = require('../../src/utils/sqlIdentifier');

describe('sqlIdentifier', () => {
  describe('isValidSlug', () => {
    it('accepts valid slugs', () => {
      expect(isValidSlug('name')).toBe(true);
      expect(isValidSlug('test_123')).toBe(true);
      expect(isValidSlug('a')).toBe(true);
      expect(isValidSlug('kunden')).toBe(true);
      expect(isValidSlug('my_table_name')).toBe(true);
    });

    it('rejects empty/null/undefined', () => {
      expect(isValidSlug('')).toBe(false);
      expect(isValidSlug(null)).toBe(false);
      expect(isValidSlug(undefined)).toBe(false);
    });

    it('rejects non-string input', () => {
      expect(isValidSlug(123)).toBe(false);
      expect(isValidSlug({})).toBe(false);
      expect(isValidSlug([])).toBe(false);
    });

    it('rejects slugs starting with a number', () => {
      expect(isValidSlug('123abc')).toBe(false);
      expect(isValidSlug('1test')).toBe(false);
    });

    it('rejects slugs with uppercase letters', () => {
      expect(isValidSlug('MyTable')).toBe(false);
      expect(isValidSlug('NAME')).toBe(false);
    });

    it('rejects slugs with special characters', () => {
      expect(isValidSlug('a; --')).toBe(false);
      expect(isValidSlug('test-name')).toBe(false);
      expect(isValidSlug('test.name')).toBe(false);
      expect(isValidSlug('test name')).toBe(false);
      expect(isValidSlug('über')).toBe(false);
      expect(isValidSlug('naïve')).toBe(false);
    });

    it('rejects slugs exceeding 100 chars', () => {
      expect(isValidSlug('a'.repeat(101))).toBe(false);
      expect(isValidSlug('a'.repeat(100))).toBe(true);
    });

    it('rejects SQL reserved keywords', () => {
      expect(isValidSlug('select')).toBe(false);
      expect(isValidSlug('drop')).toBe(false);
      expect(isValidSlug('table')).toBe(false);
      expect(isValidSlug('insert')).toBe(false);
      expect(isValidSlug('delete')).toBe(false);
      expect(isValidSlug('update')).toBe(false);
      expect(isValidSlug('alter')).toBe(false);
      expect(isValidSlug('truncate')).toBe(false);
      expect(isValidSlug('execute')).toBe(false);
    });

    it('accepts prefixed keywords (not exact match)', () => {
      expect(isValidSlug('tbl_select')).toBe(true);
      expect(isValidSlug('my_table')).toBe(true);
      expect(isValidSlug('selected')).toBe(true);
    });
  });

  describe('escapeIdentifier', () => {
    it('double-quotes valid identifiers', () => {
      expect(escapeIdentifier('name')).toBe('"name"');
      expect(escapeIdentifier('field_name')).toBe('"field_name"');
      expect(escapeIdentifier('test_123')).toBe('"test_123"');
    });

    it('throws ValidationError for invalid identifiers', () => {
      expect(() => escapeIdentifier('DROP TABLE')).toThrow('Invalid identifier');
      expect(() => escapeIdentifier('')).toThrow('Invalid identifier');
      expect(() => escapeIdentifier('123abc')).toThrow('Invalid identifier');
      expect(() => escapeIdentifier('select')).toThrow('Invalid identifier');
    });
  });

  describe('escapeTableName', () => {
    it('returns quoted table name with data_ prefix', () => {
      expect(escapeTableName('kunden')).toBe('"data_kunden"');
      expect(escapeTableName('my_table')).toBe('"data_my_table"');
      expect(escapeTableName('test_123')).toBe('"data_test_123"');
    });

    it('throws ValidationError for invalid slugs', () => {
      expect(() => escapeTableName('DROP TABLE')).toThrow('Invalid table name');
      expect(() => escapeTableName('')).toThrow('Invalid table name');
      expect(() => escapeTableName('select')).toThrow('Invalid table name');
    });
  });

  describe('SQL injection attempts', () => {
    it('rejects injection via semicolons', () => {
      expect(isValidSlug('test; DROP TABLE users; --')).toBe(false);
    });

    it('rejects injection via double quotes', () => {
      expect(isValidSlug('test" OR 1=1 --')).toBe(false);
    });

    it('rejects injection via single quotes', () => {
      expect(isValidSlug("test' OR '1'='1")).toBe(false);
    });

    it('rejects injection via SQL keywords', () => {
      expect(isValidSlug('select')).toBe(false);
      expect(isValidSlug('union')).toBe(false);
      expect(isValidSlug('drop')).toBe(false);
    });

    it('rejects injection via unicode', () => {
      expect(isValidSlug('ｓｅｌｅｃｔ')).toBe(false);
    });

    it('blocks attempts that pass regex but match keywords', () => {
      // These pass the regex but should be blocked by keyword check
      for (const keyword of ['select', 'insert', 'update', 'delete', 'drop', 'create', 'alter', 'truncate']) {
        expect(isValidSlug(keyword)).toBe(false);
      }
    });
  });

  describe('SQL_RESERVED_KEYWORDS', () => {
    it('contains all critical SQL keywords', () => {
      const critical = ['select', 'insert', 'update', 'delete', 'drop', 'create', 'alter', 'truncate', 'union', 'exec', 'execute'];
      for (const keyword of critical) {
        expect(SQL_RESERVED_KEYWORDS.has(keyword)).toBe(true);
      }
    });

    it('is a Set (case-sensitive, lowercase)', () => {
      expect(SQL_RESERVED_KEYWORDS.has('SELECT')).toBe(false);
      expect(SQL_RESERVED_KEYWORDS.has('select')).toBe(true);
    });
  });
});
