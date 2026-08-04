/**
 * @file barcode-scanner.service.js
 * @description Advanced barcode/QR scanner service for physical HID readers.
 *
 * Physical barcode scanners (USB, Bluetooth, wireless) operate in HID keyboard
 * emulation mode — they send characters rapidly followed by Enter/Tab.
 * This service detects rapid keystroke sequences to distinguish scanner input
 * from manual typing.
 *
 * Features:
 * - HID speed detection (< 80ms between keystrokes = scanner)
 * - Multiple format recognition: EAN-8, EAN-13, UPC-A, Code 128, QR
 * - Field-level attachment (per input)
 * - Global scan mode (document-level listener, toggled via Ctrl+B)
 * - Custom event emission: 'barcode:scanned'
 */

export class BarcodeScannerService {

  // ─── Internal state ────────────────────────────────────────────────────────
  static _globalActive = false;
  static _globalCleanup = null;
  static _globalCallback = null;
  static _fieldCleanups = new WeakMap();

  // Timing thresholds (ms)
  static KEYSTROKE_THRESHOLD = 80;   // Max ms between keystrokes for scanner detection
  static SETTLE_MS = 100;            // Debounce after last keystroke to trigger scan
  static MIN_CODE_LENGTH = 3;        // Minimum code length to accept

  // ═══════════════════════════════════════════════════════════════════════════
  // FORMAT DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Detect the format of a scanned code based on its structure.
   * @param {string} code - The scanned code string
   * @returns {'EAN13'|'EAN8'|'UPC_A'|'CODE128'|'QR'|'CUSTOM'} format name
   */
  static detectFormat(code) {
    if (!code || typeof code !== 'string') return 'CUSTOM';

    const trimmed = code.trim();
    const len = trimmed.length;

    // EAN-8: exactly 8 digits
    if (len === 8 && /^\d{8}$/.test(trimmed)) {
      return 'EAN8';
    }

    // UPC-A: exactly 12 digits
    if (len === 12 && /^\d{12}$/.test(trimmed)) {
      return 'UPC_A';
    }

    // EAN-13: exactly 13 digits
    if (len === 13 && /^\d{13}$/.test(trimmed)) {
      return 'EAN13';
    }

    // Code 128: alphanumeric, typically 6-48 characters
    if (len >= 6 && len <= 48 && /^[A-Za-z0-9\-\.\/\+\%\$\s]+$/.test(trimmed)) {
      return 'CODE128';
    }

    // QR: anything longer or containing special chars (URLs, JSON, etc.)
    if (len > 48 || /[{}[\]:;"'<>@#&=?!]/.test(trimmed)) {
      return 'QR';
    }

    return 'CUSTOM';
  }

  /**
   * Validate checksum for EAN-13 codes.
   * @param {string} code
   * @returns {boolean}
   */
  static validateEAN13(code) {
    if (!/^\d{13}$/.test(code)) return false;
    const digits = code.split('').map(Number);
    const check = digits.pop();
    const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
    return (10 - (sum % 10)) % 10 === check;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FIELD-LEVEL ATTACHMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Attach scanner detection to a specific input field.
   * Works with both scanner input and manual typing fallback.
   *
   * @param {HTMLInputElement} input - The input element to watch
   * @param {Object} options
   * @param {Function} options.onScan - Callback(code, format) when a scan is detected
   * @param {number} [options.minLength=3] - Minimum code length
   * @param {number} [options.settleMs=100] - Settle delay after last keystroke
   * @returns {Function} Cleanup function to remove listeners
   */
  static attach(input, options = {}) {
    if (!input) return () => {};

    // Cleanup previous attachment if any
    BarcodeScannerService.detach(input);

    const minLength = options.minLength || BarcodeScannerService.MIN_CODE_LENGTH;
    const settleMs = options.settleMs || BarcodeScannerService.SETTLE_MS;
    const onScan = typeof options.onScan === 'function' ? options.onScan : () => {};

    let buffer = '';
    let lastKeyTime = 0;
    let timer = null;
    let isScanning = false; // true when rapid keystrokes detected

    const triggerScan = () => {
      const code = input.value.trim();
      if (code.length >= minLength) {
        const format = BarcodeScannerService.detectFormat(code);
        onScan(code, format);

        // Dispatch custom event for global listeners
        document.dispatchEvent(new CustomEvent('barcode:scanned', {
          detail: { code, format, source: 'field', inputId: input.id }
        }));
      }
      buffer = '';
      isScanning = false;
    };

    const onKeydown = (e) => {
      const now = Date.now();
      const timeDiff = now - lastKeyTime;
      lastKeyTime = now;

      // Enter or Tab finalizes the scan immediately
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        clearTimeout(timer);
        setTimeout(triggerScan, 0);
        return;
      }

      // Detect rapid keystrokes (scanner behavior)
      if (timeDiff < BarcodeScannerService.KEYSTROKE_THRESHOLD && buffer.length > 0) {
        isScanning = true;
      }

      // Accumulate printable characters
      if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    const onInput = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Only auto-trigger if it looks like a scanner (rapid input)
        if (isScanning || input.value.trim().length >= minLength) {
          triggerScan();
        }
      }, settleMs);
    };

    // Configure input for optimal scanner detection
    input.setAttribute('inputmode', 'text');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    input.dataset.scannerReady = 'true';

    input.addEventListener('keydown', onKeydown);
    input.addEventListener('input', onInput);

    const cleanup = () => {
      clearTimeout(timer);
      input.removeEventListener('keydown', onKeydown);
      input.removeEventListener('input', onInput);
      delete input.dataset.scannerReady;
    };

    BarcodeScannerService._fieldCleanups.set(input, cleanup);
    return cleanup;
  }

  /**
   * Detach scanner from a specific input field.
   * @param {HTMLInputElement} input
   */
  static detach(input) {
    if (!input) return;
    const cleanup = BarcodeScannerService._fieldCleanups.get(input);
    if (cleanup) {
      cleanup();
      BarcodeScannerService._fieldCleanups.delete(input);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GLOBAL SCAN MODE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Activate global scan mode. Listens to the entire document for rapid
   * keystroke sequences (scanner input) when no specific scanner-ready field
   * is focused.
   *
   * @param {Function} callback - Function(code, format) called on global scan
   * @returns {Function} Cleanup function
   */
  static attachGlobal(callback) {
    if (BarcodeScannerService._globalCleanup) {
      BarcodeScannerService._globalCleanup();
    }

    BarcodeScannerService._globalCallback = callback;
    BarcodeScannerService._globalActive = true;

    let buffer = '';
    let lastKeyTime = 0;
    let timer = null;

    const triggerGlobalScan = () => {
      const code = buffer.trim();
      if (code.length >= BarcodeScannerService.MIN_CODE_LENGTH) {
        const format = BarcodeScannerService.detectFormat(code);

        if (typeof callback === 'function') {
          callback(code, format);
        }

        document.dispatchEvent(new CustomEvent('barcode:scanned', {
          detail: { code, format, source: 'global' }
        }));
      }
      buffer = '';
    };

    const onKeydown = (e) => {
      // Skip if a scanner-ready field is focused (let field handler take over)
      const active = document.activeElement;
      if (active && active.dataset && active.dataset.scannerReady === 'true') {
        return;
      }

      // Skip if user is typing in a regular input/textarea
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
        // Only intercept if it looks like rapid scanner input
        const now = Date.now();
        const timeDiff = now - lastKeyTime;
        if (timeDiff > BarcodeScannerService.KEYSTROKE_THRESHOLD && buffer.length === 0) {
          lastKeyTime = now;
          return; // Regular typing, ignore
        }
      }

      const now = Date.now();
      const timeDiff = now - lastKeyTime;
      lastKeyTime = now;

      // Enter finalizes scan
      if (e.key === 'Enter') {
        if (buffer.length >= BarcodeScannerService.MIN_CODE_LENGTH) {
          e.preventDefault();
          clearTimeout(timer);
          triggerGlobalScan();
          return;
        }
        buffer = '';
        return;
      }

      // Only accept rapid input (scanner-like)
      if (timeDiff < BarcodeScannerService.KEYSTROKE_THRESHOLD || buffer.length === 0) {
        if (e.key.length === 1) {
          buffer += e.key;
          clearTimeout(timer);
          timer = setTimeout(triggerGlobalScan, BarcodeScannerService.SETTLE_MS);
        }
      } else {
        // Too slow — reset buffer (manual typing)
        buffer = e.key.length === 1 ? e.key : '';
        clearTimeout(timer);
      }
    };

    document.addEventListener('keydown', onKeydown, true);

    const cleanup = () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKeydown, true);
      BarcodeScannerService._globalActive = false;
      BarcodeScannerService._globalCleanup = null;
      BarcodeScannerService._globalCallback = null;
    };

    BarcodeScannerService._globalCleanup = cleanup;
    return cleanup;
  }

  /**
   * Toggle global scan mode on/off.
   * @param {Function} callback - Callback for when scans are detected
   * @returns {boolean} New state (true = active)
   */
  static toggleGlobal(callback) {
    if (BarcodeScannerService._globalActive) {
      if (BarcodeScannerService._globalCleanup) {
        BarcodeScannerService._globalCleanup();
      }
      return false;
    } else {
      BarcodeScannerService.attachGlobal(callback);
      return true;
    }
  }

  /**
   * Check if global scan mode is active.
   * @returns {boolean}
   */
  static isGlobalActive() {
    return BarcodeScannerService._globalActive;
  }

  /**
   * Detach the global scanner listener.
   */
  static detachGlobal() {
    if (BarcodeScannerService._globalCleanup) {
      BarcodeScannerService._globalCleanup();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get a human-readable format label.
   * @param {string} format
   * @returns {string}
   */
  static getFormatLabel(format) {
    const labels = {
      'EAN13': 'EAN-13',
      'EAN8': 'EAN-8',
      'UPC_A': 'UPC-A',
      'CODE128': 'Code 128',
      'QR': 'Código QR',
      'CUSTOM': 'Personalizado'
    };
    return labels[format] || format;
  }

  /**
   * Get an icon for the code format.
   * @param {string} format
   * @returns {string} emoji
   */
  static getFormatIcon(format) {
    if (format === 'QR') return '📱';
    return '📊';
  }
}
