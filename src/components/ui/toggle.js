/**
 * @file toggle.js
 * @description Switch toggle checkbox UI component.
 */

import { Component } from '../../core/component.js';

export class Toggle extends Component {
  /**
   * @param {Object} props
   * @param {string} [props.id]
   * @param {boolean} [props.checked]
   * @param {string} [props.label]
   * @param {Function} [props.onChange]
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      checked: false,
      label: '',
      ...props
    };
  }

  render() {
    const { id, checked, label } = this.props;
    const idAttr = id ? `id="${id}"` : '';
    const checkedAttr = checked ? 'checked' : '';

    return `
      <label class="switch-container">
        <input type="checkbox" ${idAttr} class="switch-input" ${checkedAttr} />
        ${label ? `<span class="form-label">${label}</span>` : ''}
      </label>
    `;
  }

  afterMount() {
    const input = this.$('input');
    if (input && this.props.onChange) {
      input.addEventListener('change', (e) => {
        this.props.onChange(e.target.checked);
      });
    }
  }

  isChecked() {
    const input = this.$('input');
    return input ? input.checked : false;
  }
}
