/**
 * Password Hashing and Validation
 */

const bcrypt = require('bcrypt');
const logger = require('./logger');

const SALT_ROUNDS = 12;

// Password requirements — balanced for edge appliance security.
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REQUIREMENTS = {
  minLength: PASSWORD_MIN_LENGTH,
  requireUppercase: false,
  requireLowercase: false,
  requireNumbers: true,
  requireSpecialChars: false,
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
    errors.push(`Passwort muss mindestens ${PASSWORD_REQUIREMENTS.minLength} Zeichen lang sein`);
  }

  if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Passwort muss mindestens einen Grossbuchstaben enthalten');
  }

  if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Passwort muss mindestens einen Kleinbuchstaben enthalten');
  }

  if (PASSWORD_REQUIREMENTS.requireNumbers && !/[0-9]/.test(password)) {
    errors.push('Passwort muss mindestens eine Zahl enthalten');
  }

  if (
    PASSWORD_REQUIREMENTS.requireSpecialChars &&
    !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)
  ) {
    errors.push('Passwort muss mindestens ein Sonderzeichen enthalten');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  validatePasswordComplexity,
  PASSWORD_REQUIREMENTS,
};
