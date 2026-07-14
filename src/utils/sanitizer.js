/**
 * @file sanitizer.js
 * @description XSS protection utility to sanitize strings before mounting them into the DOM.
 */

/**
 * Escapes HTML characters in a string to prevent XSS injection.
 * @param {string} str 
 * @returns {string}
 */
export function sanitizeHTML(str) {
  if (typeof str !== 'string') {
    return str;
  }
  
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    "/": '&#x2F;',
    "`": '&grave;'
  };
  
  const reg = /[&<>"'`/]/g;
  return str.replace(reg, (match) => map[match]);
}

/**
 * Strips all HTML tags entirely from a string.
 * @param {string} str 
 * @returns {string}
 */
export function stripHTML(str) {
  if (typeof str !== 'string') {
    return str;
  }
  return str.replace(/<[^>]*>/g, '');
}
