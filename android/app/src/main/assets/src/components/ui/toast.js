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
      success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><path d="M20 6 9 17l-5-5"/></svg>`,
      error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
      warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`,
      info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>`
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
