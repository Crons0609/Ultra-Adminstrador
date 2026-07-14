/**
 * @file spinner.js
 * @description Spinner UI loading animation reusable component.
 */

import { Component } from '../../core/component.js';

export class Spinner extends Component {
  /**
   * @param {Object} props
   * @param {'sm'|'md'|'lg'} [props.size]
   * @param {'primary'|'secondary'} [props.variant]
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      size: 'md',
      variant: 'primary',
      ...props
    };
  }

  render() {
    const { size, variant } = this.props;
    
    // Inline SVG spinner for performance and self-containment
    return `
      <div class="spinner-container justify-content-center align-items-center d-flex p-2">
        <svg class="animate-spin spinner-${size} spinner-${variant}" viewBox="0 0 50 50" style="width: ${size === 'sm' ? '20px' : size === 'lg' ? '48px' : '32px'}; height: ${size === 'sm' ? '20px' : size === 'lg' ? '48px' : '32px'};">
          <circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5" stroke="var(--color-${variant === 'primary' ? 'accent' : 'text-secondary'})" stroke-linecap="round" style="stroke-dasharray: 50, 150; stroke-dashoffset: 0;"></circle>
        </svg>
      </div>
    `;
  }
}
