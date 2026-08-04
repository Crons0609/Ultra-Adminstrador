/**
 * @file button.js
 * @description Button UI reusable component.
 */

import { Component } from '../../core/component.js';

export class Button extends Component {
  /**
   * @param {Object} props
   * @param {string} props.text - Button label
   * @param {'sm'|'md'|'lg'} [props.size]
   * @param {'primary'|'secondary'|'outline'|'danger'|'ghost'} [props.variant]
   * @param {boolean} [props.disabled]
   * @param {string} [props.id]
   * @param {string} [props.type] - button, submit, reset
   * @param {Function} [props.onClick]
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      size: 'md',
      variant: 'primary',
      disabled: false,
      type: 'button',
      text: '',
      ...props
    };
  }

  render() {
    const { text, size, variant, disabled, id, type } = this.props;
    const idAttr = id ? `id="${id}"` : '';
    const disabledAttr = disabled ? 'disabled' : '';

    return `
      <button type="${type}" ${idAttr} class="btn btn-${size} btn-${variant}" ${disabledAttr}>
        ${text}
      </button>
    `;
  }

  afterMount() {
    if (this.props.onClick && this.element) {
      this.element.addEventListener('click', this.props.onClick);
    }
  }
}
