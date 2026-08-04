/**
 * @file badge.js
 * @description Colored status pills (e.g. Active, Pending, Cancelled) styling.
 */

import { Component } from '../../core/component.js';

export class Badge extends Component {
  /**
   * @param {Object} props
   * @param {string} props.text
   * @param {'success'|'warning'|'danger'|'info'|'neutral'} [props.variant]
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      text: '',
      variant: 'neutral',
      ...props
    };
  }

  render() {
    const { text, variant } = this.props;

    // Direct mapping to CSS colors defined in tokens.css
    const inlineStyles = `
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      font-size: 0.75rem;
      font-weight: 500;
      border-radius: var(--radius-full);
      line-height: 1.25;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background-color: var(--color-${variant === 'neutral' ? 'bg-tertiary' : variant + '-light'});
      color: var(--color-${variant === 'neutral' ? 'text-secondary' : variant});
    `;

    return `
      <span class="badge" style="${inlineStyles}">${text}</span>
    `;
  }
}
