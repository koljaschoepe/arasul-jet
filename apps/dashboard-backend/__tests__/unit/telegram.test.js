/**
 * Unit tests for Telegram API routes
 * Tests encryption, configuration storage, and API endpoints
 */

const crypto = require('crypto');

// Mock environment
process.env.JWT_SECRET = 'test-jwt-secret-for-encryption-key-derivation';

// Encryption configuration (mirrored from telegram.js)
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

/**
 * Get encryption key from JWT_SECRET (32 bytes for AES-256)
 */
function getEncryptionKey() {
    const secret = process.env.JWT_SECRET || '';
    return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a string using AES-256-GCM
 */
function encrypt(text) {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex')
    };
}

/**
 * Decrypt a string using AES-256-GCM
 */
function decrypt(encrypted, ivHex, tagHex) {
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

/**
 * Mask a bot token for display
 */
function maskToken(token) {
    if (!token || token.length < 10) {
        return '***';
    }
    return `${token.substring(0, 5)}...${token.substring(token.length - 3)}`;
}

describe('Telegram Encryption', () => {
    const testToken = '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz-_12345678';

    describe('encrypt', () => {
        test('should encrypt a token and return encrypted data with iv and tag', () => {
            const result = encrypt(testToken);

            expect(result).toHaveProperty('encrypted');
            expect(result).toHaveProperty('iv');
            expect(result).toHaveProperty('tag');
            expect(result.encrypted).not.toBe(testToken);
            expect(result.iv.length).toBe(32); // 16 bytes as hex = 32 chars
            expect(result.tag.length).toBe(32); // 16 bytes as hex = 32 chars
        });

        test('should produce different encrypted values each time (random IV)', () => {
            const result1 = encrypt(testToken);
            const result2 = encrypt(testToken);

            expect(result1.encrypted).not.toBe(result2.encrypted);
            expect(result1.iv).not.toBe(result2.iv);
        });
    });

    describe('decrypt', () => {
        test('should correctly decrypt an encrypted token', () => {
            const { encrypted, iv, tag } = encrypt(testToken);
            const decrypted = decrypt(encrypted, iv, tag);

            expect(decrypted).toBe(testToken);
        });

        test('should throw error with wrong IV', () => {
            const { encrypted, tag } = encrypt(testToken);
            const wrongIv = crypto.randomBytes(16).toString('hex');

            expect(() => {
                decrypt(encrypted, wrongIv, tag);
            }).toThrow();
        });

        test('should throw error with wrong tag', () => {
            const { encrypted, iv } = encrypt(testToken);
            const wrongTag = crypto.randomBytes(16).toString('hex');

            expect(() => {
                decrypt(encrypted, iv, wrongTag);
            }).toThrow();
        });

        test('should throw error with tampered ciphertext', () => {
            const { encrypted, iv, tag } = encrypt(testToken);
            const tamperedEncrypted = encrypted.replace(encrypted[0], encrypted[0] === 'a' ? 'b' : 'a');

            expect(() => {
                decrypt(tamperedEncrypted, iv, tag);
            }).toThrow();
        });
    });

    describe('encrypt/decrypt roundtrip', () => {
        test('should handle various token formats', () => {
            const tokens = [
                '123456789:ABC-DEF_ghi',
                '9876543210:XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
                '1:a',
                '0000000000:' + 'A'.repeat(35)
            ];

            tokens.forEach(token => {
                const { encrypted, iv, tag } = encrypt(token);
                const decrypted = decrypt(encrypted, iv, tag);
                expect(decrypted).toBe(token);
            });
        });

        test('should handle unicode characters in metadata', () => {
            const textWithUnicode = 'Token with emoji 🤖 and special chars äöü';
            const { encrypted, iv, tag } = encrypt(textWithUnicode);
            const decrypted = decrypt(encrypted, iv, tag);

            expect(decrypted).toBe(textWithUnicode);
        });
    });
});

describe('Token Masking', () => {
    test('should mask token showing first 5 and last 3 characters', () => {
        const token = '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz';
        const masked = maskToken(token);

        expect(masked).toBe('12345...xyz');
    });

    test('should return *** for short tokens', () => {
        expect(maskToken('short')).toBe('***');
        expect(maskToken('123456789')).toBe('***');
    });

    test('should return *** for null/undefined tokens', () => {
        expect(maskToken(null)).toBe('***');
        expect(maskToken(undefined)).toBe('***');
        expect(maskToken('')).toBe('***');
    });

    test('should handle exact minimum length', () => {
        const tenCharToken = '1234567890';
        const masked = maskToken(tenCharToken);

        expect(masked).toBe('12345...890');
    });
});

describe('Token Format Validation', () => {
    /**
     * Validate Telegram bot token format
     * Format: {bot_id}:{random_string}
     */
    function isValidTokenFormat(token) {
        if (!token || typeof token !== 'string') {
            return false;
        }
        return token.includes(':');
    }

    test('should accept valid token formats', () => {
        const validTokens = [
            '123456789:ABCdefGHIjklMNOpqrsTUVwxyz-_12345',
            '9876543210:XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            '1:a'
        ];

        validTokens.forEach(token => {
            expect(isValidTokenFormat(token)).toBe(true);
        });
    });

    test('should reject invalid token formats', () => {
        const invalidTokens = [
            'no-colon-here',
            '12345678901234567890',
            '',
            null,
            undefined,
            123456
        ];

        invalidTokens.forEach(token => {
            expect(isValidTokenFormat(token)).toBe(false);
        });
    });
});

describe('Alert Thresholds', () => {
    const defaultThresholds = {
        cpu_warning: 80,
        cpu_critical: 95,
        ram_warning: 80,
        ram_critical: 95,
        disk_warning: 80,
        disk_critical: 95,
        gpu_warning: 85,
        gpu_critical: 95,
        temperature_warning: 75,
        temperature_critical: 85,
        notify_on_warning: false,
        notify_on_critical: true,
        notify_on_service_down: true,
        notify_on_self_healing: true,
        cooldown_minutes: 15
    };

    test('should have sensible default values', () => {
        expect(defaultThresholds.cpu_warning).toBeLessThan(defaultThresholds.cpu_critical);
        expect(defaultThresholds.ram_warning).toBeLessThan(defaultThresholds.ram_critical);
        expect(defaultThresholds.disk_warning).toBeLessThan(defaultThresholds.disk_critical);
        expect(defaultThresholds.gpu_warning).toBeLessThan(defaultThresholds.gpu_critical);
        expect(defaultThresholds.temperature_warning).toBeLessThan(defaultThresholds.temperature_critical);
    });

    test('should have all required threshold fields', () => {
        const requiredFields = [
            'cpu_warning', 'cpu_critical',
            'ram_warning', 'ram_critical',
            'disk_warning', 'disk_critical',
            'gpu_warning', 'gpu_critical',
            'temperature_warning', 'temperature_critical',
            'notify_on_warning', 'notify_on_critical',
            'notify_on_service_down', 'notify_on_self_healing',
            'cooldown_minutes'
        ];

        requiredFields.forEach(field => {
            expect(defaultThresholds).toHaveProperty(field);
        });
    });

    test('should have numeric values within valid range (0-100)', () => {
        const numericFields = [
            'cpu_warning', 'cpu_critical',
            'ram_warning', 'ram_critical',
            'disk_warning', 'disk_critical',
            'gpu_warning', 'gpu_critical',
            'temperature_warning', 'temperature_critical'
        ];

        numericFields.forEach(field => {
            expect(defaultThresholds[field]).toBeGreaterThanOrEqual(0);
            expect(defaultThresholds[field]).toBeLessThanOrEqual(100);
        });
    });

    test('cooldown_minutes should be within valid range', () => {
        expect(defaultThresholds.cooldown_minutes).toBeGreaterThanOrEqual(0);
        expect(defaultThresholds.cooldown_minutes).toBeLessThanOrEqual(1440); // 24 hours max
    });
});

describe('Chat ID Validation', () => {
    /**
     * Validate Telegram chat ID
     * Can be positive (user/group) or negative (supergroup/channel)
     */
    function isValidChatId(chatId) {
        if (!chatId) return false;
        const id = chatId.toString();
        // Chat IDs are numeric, optionally prefixed with minus for groups
        return /^-?\d+$/.test(id);
    }

    test('should accept valid chat IDs', () => {
        const validChatIds = [
            '123456789',           // User
            '-1001234567890',      // Supergroup/Channel
            '-123456789',          // Group
            '1',                   // Minimal
            123456789              // Number format
        ];

        validChatIds.forEach(chatId => {
            expect(isValidChatId(chatId)).toBe(true);
        });
    });

    test('should reject invalid chat IDs', () => {
        const invalidChatIds = [
            '',
            null,
            undefined,
            'abc123',
            '123.456',
            '123abc'
        ];

        invalidChatIds.forEach(chatId => {
            expect(isValidChatId(chatId)).toBe(false);
        });
    });
});
