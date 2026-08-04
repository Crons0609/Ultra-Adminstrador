import { APP_CONFIG } from '../config/app.config.js';

export class TimeService {
  static timezone = APP_CONFIG.timezone || 'America/Managua';
  static locale = APP_CONFIG.locale || 'es-NI';

  static now() {
    return Date.now();
  }

  static timestamp() {
    return {
      epochMs: Date.now(),
      iso: new Date().toISOString(),
      timezone: this.timezone
    };
  }

  static dateFormatter(options = {}) {
    return new Intl.DateTimeFormat(this.locale, {
      timeZone: this.timezone,
      ...options
    });
  }

  static formatDate(date, includeTime = true) {
    if (!date) return '';
    const jsDate = this.toDate(date);
    if (!jsDate || isNaN(jsDate.getTime())) return '';

    const options = {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    };

    if (includeTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
      options.hour12 = false;
    }

    return this.dateFormatter(options).format(jsDate);
  }

  static formatTime(date = new Date(), includeSeconds = true) {
    const jsDate = this.toDate(date);
    if (!jsDate || isNaN(jsDate.getTime())) return '';

    return this.dateFormatter({
      hour: '2-digit',
      minute: '2-digit',
      second: includeSeconds ? '2-digit' : undefined,
      hour12: false
    }).format(jsDate);
  }

  static getHour(date = new Date()) {
    const parts = this.dateFormatter({ hour: '2-digit', hour12: false }).formatToParts(this.toDate(date));
    return Number(parts.find(part => part.type === 'hour')?.value || 0);
  }

  static toDate(value) {
    if (value instanceof Date) return value;
    if (value?.seconds !== undefined) return new Date(value.seconds * 1000);
    if (value?.epochMs !== undefined) return new Date(value.epochMs);
    return new Date(value);
  }

  static todayKey(date = new Date()) {
    const parts = this.dateFormatter({
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(this.toDate(date));

    const get = (type) => parts.find(part => part.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
}
