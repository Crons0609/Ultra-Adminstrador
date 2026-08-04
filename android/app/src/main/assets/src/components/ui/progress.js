/**
 * @file progress.js
 * @description Progress bar indicator UI component.
 */

import { Component } from '../../core/component.js';

export class Progress extends Component {
  /**
   * @param {Object} props
   * @param {number} props.value - Percentage value (0-100)
   * @param {'primary'|'success'|'warning'|'danger'} [props.variant]
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      value: 0,
      variant: 'primary',
      ...props
    };
  }

  render() {
    const { value, variant } = this.props;
    const clampedValue = Math.min(Math.max(value, 0), 100);

    const trackStyle = `
      width: 100%;
      height: 8px;
      background-color: var(--color-bg-tertiary);
      border-radius: var(--radius-full);
      overflow: hidden;
    `;

    const barStyle = `
      width: ${clampedValue}%;
      height: 100%;
      background-color: var(--color-${variant === 'primary' ? 'accent' : variant});
      border-radius: var(--radius-full);
      transition: width var(--transition-normal);
    `;

    return `
      <div class="progress-track" style="${trackStyle}">
        <div class="progress-bar" style="${barStyle}"></div>
      </div>
    `;
  }
}
