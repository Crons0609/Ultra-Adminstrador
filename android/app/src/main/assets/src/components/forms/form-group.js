/**
 * @file form-group.js
 * @description FormGroup wrapper component combining label, input and validation messages.
 */

import { Component } from '../../core/component.js';

export class FormGroup extends Component {
  /**
   * @param {Object} props
   * @param {string} props.label
   * @param {string} props.inputHTML - Raw HTML for the input/select/textarea
   * @param {boolean} [props.required]
   * @param {string} [props.error]
   * @param {string} [props.hint]
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      label: '',
      inputHTML: '',
      required: false,
      error: '',
      hint: '',
      ...props
    };
  }

  render() {
    const { label, inputHTML, required, error, hint } = this.props;

    const requiredClass = required ? 'form-label-required' : '';
    const errorHTML = error
      ? `<p class="form-helper error">${error}</p>`
      : '';
    const hintHTML = hint && !error
      ? `<p class="form-helper">${hint}</p>`
      : '';

    return `
      <div class="form-group">
        <label class="form-label ${requiredClass}">${label}</label>
        ${inputHTML}
        ${errorHTML}
        ${hintHTML}
      </div>
    `;
  }
}
