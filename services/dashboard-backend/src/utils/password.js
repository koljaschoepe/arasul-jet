/**
 * Password Hashing and Validation
 */

const bcrypt = require('bcrypt');
const logger = require('./logger');

const SALT_ROUNDS = 12;

// Password complexity requirements (simplified for development)
const PASSWORD_MIN_LENGTH = 4;
const PASSWORD_REQUIREMENTS = {
    minLength: PASSWORD_MIN_LENGTH,
    requireUppercase: false,
    requireLowercase: false,
    requireNumbers: false,
    requireSpecialChars: false
};

/**
 * Hash a password
 */
async function hashPassword(password) {
    try {
        const hash = await bcrypt.hash(password, SALT_ROUNDS);
        return hash;
    } catch (error) {
        logger.error(`Error hashing password: ${error.message}`);
        throw new Error('Password hashing failed');
    }
}

/**
 * Verify password against hash
 */
async function verifyPassword(password, hash) {
    try {
        const isValid = await bcrypt.compare(password, hash);
        return isValid;
    } catch (error) {
        logger.error(`Error verifying password: ${error.message}`);
        throw new Error('Password verification failed');
    }
}

/**
 * Validate password complexity
 */
function validatePasswordComplexity(password) {
    const errors = [];

    if (password.length < PASSWORD_REQUIREMENTS.minLength) {
        errors.push(`Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters long`);
    }

    if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }

    if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }

    if (PASSWORD_REQUIREMENTS.requireNumbers && !/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }

    if (PASSWORD_REQUIREMENTS.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push('Password must contain at least one special character');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Generate random secure password
 */
function generateSecurePassword(length = 16) {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=[]{}|';

    const allChars = uppercase + lowercase + numbers + special;

    let password = '';

    // Ensure at least one of each required type
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    // Fill rest with random characters
    for (let i = password.length; i < length; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle the password
    password = password.split('').sort(() => Math.random() - 0.5).join('');

    return password;
}

module.exports = {
    hashPassword,
    verifyPassword,
    validatePasswordComplexity,
    generateSecurePassword,
    PASSWORD_REQUIREMENTS
};
