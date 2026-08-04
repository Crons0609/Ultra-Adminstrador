/**
 * @file toast.js
 * @description Toast UI element template skeleton.
 */

import { Component } from '../../core/component.js';

export class Toast extends Component {
  /**
   * @param {Object} props
   * @param {string} props.message
   * @param {'success'|'warning'|'error'|'info'} [props.type]
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      message: '',
      type: 'info',
      ...props
    };
  }

  render() {
    const { message, type } = this.props;
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    return `
      <div class="toast toast-${type}">
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close">&times;</button>
      </div>
    `;
  }
}
