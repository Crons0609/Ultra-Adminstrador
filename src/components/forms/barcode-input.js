/**
 * @file barcode-input.js
 * @description Reusable barcode/QR scanner input component.
 *
 * Wraps an <input> with scanner-ready styling, visual feedback,
 * and automatic BarcodeScannerService attachment.
 *
 * Usage:
 *   const input = new BarcodeInput({
 *     id: 'prod-sku',
 *     label: 'Código de Barras / QR',
 *     placeholder: 'Escanea o escribe...',
 *     onScan: (code, format) => { ... },
 *     onSearch: async (code) => { ... }
 *   });
 *   container.appendChild(input.mount());
 */

import { Component } from '../../core/component.js';
import { BarcodeScannerService } from '../../services/barcode-scanner.service.js';

export class BarcodeInput extends Component {
  /**
   * @param {Object} props
   * @param {string} props.id - Unique input ID
   * @param {string} [props.label='Código de Barras / QR'] - Label text
   * @param {string} [props.placeholder='Escanea o escribe el código...']
   * @param {string} [props.value=''] - Initial value
   * @param {Function} [props.onScan] - Callback(code, format) on scan
   * @param {Function} [props.onSearch] - Async callback(code) for lookup
   * @param {boolean} [props.showHelp=true] - Show help text below input
   * @param {boolean} [props.showClear=true] - Show clear button
   * @param {boolean} [props.autoFocus=false] - Auto-focus on mount
   * @param {boolean} [props.compact=false] - Compact mode for inline use
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      id: 'barcode-input',
      label: 'Código de Barras / QR',
      placeholder: 'Escanea o escribe el código...',
      value: '',
      onScan: null,
      onSearch: null,
      showHelp: true,
      showClear: true,
      autoFocus: false,
      compact: false,
      ...props
    };
    this._scannerCleanup = null;
  }

  render() {
    const { id, label, placeholder, value, showHelp, showClear, compact } = this.props;

    return `
      <div class="barcode-input-wrapper ${compact ? 'barcode-input-compact' : ''}" id="${id}-wrapper">
        ${!compact ? `<label class="form-label barcode-input-label" for="${id}">
          <span class="barcode-label-icon">📊</span>
          ${label}
        </label>` : ''}

        <div class="barcode-input-container">
          <div class="barcode-input-icon-left">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 5v14"/>
              <path d="M6 5v14"/>
              <path d="M9 5v14"/>
              <path d="M12 5v14"/>
              <path d="M16 5v14"/>
              <path d="M19 5v14"/>
              <path d="M21 5v14"/>
            </svg>
          </div>

          <input
            type="text"
            id="${id}"
            class="input input-md barcode-input-field"
            placeholder="${placeholder}"
            value="${value}"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
          />

          ${showClear ? `
            <button type="button" class="barcode-input-clear" id="${id}-clear" title="Limpiar código" style="display: ${value ? 'flex' : 'none'};">
              ✕
            </button>
          ` : ''}

          <div class="barcode-input-indicator" id="${id}-indicator">
            <span class="barcode-pulse"></span>
          </div>
        </div>

        ${showHelp ? `
          <div class="barcode-input-help" id="${id}-help">
            <span class="barcode-help-icon">📡</span>
            <span>Compatible con lectores USB, Bluetooth e inalámbricos. Enfoca este campo y escanea.</span>
          </div>
        ` : ''}

        <div class="barcode-input-feedback" id="${id}-feedback" style="display: none;">
          <span class="barcode-feedback-icon" id="${id}-feedback-icon">✅</span>
          <span class="barcode-feedback-text" id="${id}-feedback-text"></span>
        </div>
      </div>
    `;
  }

  afterMount() {
    if (!this.element) return;

    const { id, autoFocus } = this.props;
    const input = this.element.querySelector(`#${id}`);
    if (!input) return;

    // Attach scanner detection
    this._scannerCleanup = BarcodeScannerService.attach(input, {
      onScan: (code, format) => this._handleScan(code, format)
    });

    // Clear button
    const clearBtn = this.element.querySelector(`#${id}-clear`);
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.style.display = 'none';
        this._hideFeedback();
        input.focus();
      });
    }

    // Show/hide clear button on input
    input.addEventListener('input', () => {
      if (clearBtn) {
        clearBtn.style.display = input.value.trim() ? 'flex' : 'none';
      }
    });

    // Focus visual effects
    input.addEventListener('focus', () => {
      const container = this.element.querySelector('.barcode-input-container');
      if (container) container.classList.add('barcode-input-focused');
    });

    input.addEventListener('blur', () => {
      const container = this.element.querySelector('.barcode-input-container');
      if (container) container.classList.remove('barcode-input-focused');
    });

    if (autoFocus) {
      setTimeout(() => input.focus(), 100);
    }
  }

  /**
   * Internal scan handler — shows feedback animation and calls user callbacks.
   */
  async _handleScan(code, format) {
    const { onScan, onSearch, id } = this.props;

    // Visual feedback: show scan success
    this._showFeedback('✅', `Código detectado: ${code} (${BarcodeScannerService.getFormatLabel(format)})`, 'success');

    // Animate the input border
    const container = this.element?.querySelector('.barcode-input-container');
    if (container) {
      container.classList.add('barcode-scan-detected');
      setTimeout(() => container.classList.remove('barcode-scan-detected'), 1500);
    }

    // User callback
    if (typeof onScan === 'function') {
      onScan(code, format);
    }

    // Search callback
    if (typeof onSearch === 'function') {
      this._showFeedback('🔍', 'Buscando...', 'info');
      try {
        const result = await onSearch(code);
        if (result) {
          this._showFeedback('✅', `Encontrado: ${result.name || result.productName || code}`, 'success');
        } else {
          this._showFeedback('⚠️', `Código "${code}" no registrado en el sistema.`, 'warning');
        }
      } catch (err) {
        this._showFeedback('❌', `Error al buscar: ${err.message}`, 'error');
      }
    }
  }

  _showFeedback(icon, text, type = 'info') {
    const { id } = this.props;
    const feedback = this.element?.querySelector(`#${id}-feedback`);
    const feedbackIcon = this.element?.querySelector(`#${id}-feedback-icon`);
    const feedbackText = this.element?.querySelector(`#${id}-feedback-text`);

    if (feedback && feedbackIcon && feedbackText) {
      feedbackIcon.textContent = icon;
      feedbackText.textContent = text;
      feedback.className = `barcode-input-feedback barcode-feedback-${type}`;
      feedback.style.display = 'flex';
    }
  }

  _hideFeedback() {
    const { id } = this.props;
    const feedback = this.element?.querySelector(`#${id}-feedback`);
    if (feedback) {
      feedback.style.display = 'none';
    }
  }

  /**
   * Get the current value of the input.
   * @returns {string}
   */
  getValue() {
    const input = this.element?.querySelector(`#${this.props.id}`);
    return input ? input.value.trim() : '';
  }

  /**
   * Set the input value programmatically.
   * @param {string} value
   */
  setValue(value) {
    const input = this.element?.querySelector(`#${this.props.id}`);
    if (input) {
      input.value = value;
      const clearBtn = this.element?.querySelector(`#${this.props.id}-clear`);
      if (clearBtn) clearBtn.style.display = value ? 'flex' : 'none';
    }
  }

  /**
   * Focus the barcode input.
   */
  focus() {
    const input = this.element?.querySelector(`#${this.props.id}`);
    if (input) input.focus();
  }

  unmount() {
    if (this._scannerCleanup) {
      this._scannerCleanup();
      this._scannerCleanup = null;
    }
    super.unmount();
  }
}
