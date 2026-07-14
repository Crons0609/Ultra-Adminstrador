/**
 * @file input.js
 * @description Input UI reusable component.
 */

import { Component } from '../../core/component.js';

export class Input extends Component {
  /**
   * @param {Object} props
   * @param {string} [props.id]
   * @param {string} [props.type] - text, password, email, number
   * @param {string} [props.placeholder]
   * @param {string} [props.value]
   * @param {'sm'|'md'|'lg'} [props.size]
   * @param {boolean} [props.disabled]
   * @param {boolean} [props.error] - If true, applies error borders
   * @param {Function} [props.onInput]
   * @param {Function} [props.onChange]
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      type: 'text',
      placeholder: '',
      value: '',
      size: 'md',
      disabled: false,
      error: false,
      ...props
    };
  }

  render() {
    const { id, type, placeholder, value, size, disabled, error } = this.props;
    const idAttr = id ? `id="${id}"` : '';
    const disabledAttr = disabled ? 'disabled' : '';
    const errorClass = error ? 'input-error' : '';

    return `
      <input 
        type="${type}" 
        ${idAttr} 
        placeholder="${placeholder}" 
        value="${value}" 
        class="input input-${size} ${errorClass}" 
        ${disabledAttr}
      />
    `;
  }

  afterMount() {
    if (this.props.onInput && this.element) {
      this.element.addEventListener('input', this.props.onInput);
    }
    if (this.props.onChange && this.element) {
      this.element.addEventListener('change', this.props.onChange);
    }
  }

  getValue() {
    return this.element ? this.element.value : '';
  }
}
