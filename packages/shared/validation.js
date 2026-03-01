/**
 * Shared Validation
 * Password requirements and validation logic used by both Frontend and Backend.
 */

const PASSWORD_REQUIREMENTS = {
  minLength: 4,
  requireUppercase: false,
  requireLowercase: false,
  requireNumbers: false,
  requireSpecialChars: false,
};

/**
 * Validate password against requirements.
 * @param {string} password
 * @param {object} [requirements] - Override default requirements
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validatePassword(password, requirements = PASSWORD_REQUIREMENTS) {
  const errors = [];

  if (!password || password.length < requirements.minLength) {
    errors.push(`Passwort muss mindestens ${requirements.minLength} Zeichen lang sein`);
  }

  if (requirements.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Passwort muss mindestens einen Grossbuchstaben enthalten');
  }

  if (requirements.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Passwort muss mindestens einen Kleinbuchstaben enthalten');
  }

  if (requirements.requireNumbers && !/[0-9]/.test(password)) {
    errors.push('Passwort muss mindestens eine Zahl enthalten');
  }

  if (requirements.requireSpecialChars && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push('Passwort muss mindestens ein Sonderzeichen enthalten');
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  PASSWORD_REQUIREMENTS,
  validatePassword,
};
