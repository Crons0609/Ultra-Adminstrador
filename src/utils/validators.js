/**
 * @file validators.js
 * @description Standard form and field validation formulas.
 */

/**
 * Validate email string structure.
 * @param {string} email 
 * @returns {boolean}
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password requirements (minimum 8 characters, at least 1 number, 1 letter).
 * @param {string} password 
 * @returns {boolean}
 */
export function isValidPassword(password) {
  return password && password.length >= 8 && /\d/.test(password) && /[a-zA-Z]/.test(password);
}

/**
 * Validate standard phone numbers (only digits, 7 to 15 numbers).
 * @param {string} phone 
 * @returns {boolean}
 */
export function isValidPhone(phone) {
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  return cleanPhone.length >= 7 && cleanPhone.length <= 15;
}

/**
 * Check if a value is null, undefined, empty string or empty array.
 * @param {any} value 
 * @returns {boolean} True if empty
 */
export function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}
