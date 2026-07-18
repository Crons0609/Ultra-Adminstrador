import { APP_CONFIG } from '../config/app.config.js';
import { TimeService } from '../services/time.service.js';

/**
 * @file formatters.js
 * @description Standard visual formatters for dates, currencies, values and phone numbers.
 */

/**
 * Format numeric value as currency (e.g. $1,250.00).
 * @param {number} value 
 * @param {string} currencyCode - Standard currency abbreviation (default: MXN)
 * @param {string} locale - Standard locale (default: es-MX)
 */
export function formatCurrency(value, currencyCode = APP_CONFIG.currency, locale = APP_CONFIG.locale) {
  if (isNaN(value) || value === null || value === undefined) {
    value = 0;
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode
  }).format(value);
}

/**
 * Format Firestore timestamp or Date object to a readable string (e.g. 14 Jul 2026, 14:30).
 * @param {Date|Object} date - JS Date or Firestore Timestamp { seconds, nanoseconds }
 * @param {boolean} includeTime - If true, appends HH:MM to the returned string.
 */
export function formatDate(date, includeTime = true) {
  return TimeService.formatDate(date, includeTime);
}

/**
 * Format relative time (e.g., 'Hace 5 min', 'Hace 2 horas').
 * @param {Date|Object} date 
 */
export function formatRelativeTime(date) {
  if (!date) return '';
  
  let jsDate = date;
  if (date.seconds !== undefined) {
    jsDate = new Date(date.seconds * 1000);
  } else if (!(date instanceof Date)) {
    jsDate = new Date(date);
  }

  const now = new Date();
  const diffMs = now.getTime() - jsDate.getTime();
  const diffMins = Math.round(diffMs / 60000);
  
  if (diffMins < 1) return 'Hace un momento';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `Hace ${diffHours} hr${diffHours > 1 ? 's' : ''}`;
  
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  
  return formatDate(jsDate, false);
}
