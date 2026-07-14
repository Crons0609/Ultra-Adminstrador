/**
 * @file skeleton.js
 * @description Skeleton loader UI placeholder to simulate layouts during asynchronous events.
 */

import { Component } from '../../core/component.js';

export class Skeleton extends Component {
  /**
   * @param {Object} props
   * @param {'text'|'avatar'|'rect'} [props.variant]
   * @param {string} [props.width] - CSS value, e.g., '100%' or '120px'
   * @param {string} [props.height] - CSS value, e.g., '16px' or '150px'
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      variant: 'text',
      width: '100%',
      height: '16px',
      ...props
    };
  }

  render() {
    const { variant, width, height } = this.props;
    
    // Style configurations based on variant
    let radius = 'var(--radius-sm)';
    let computedHeight = height;
    let computedWidth = width;

    if (variant === 'avatar') {
      radius = 'var(--radius-full)';
      computedHeight = height === '16px' ? '40px' : height;
      computedWidth = width === '100%' ? '40px' : width;
    } else if (variant === 'text') {
      radius = 'var(--radius-sm)';
      computedHeight = '14px';
    }

    const inlineStyles = `width: ${computedWidth}; height: ${computedHeight}; border-radius: ${radius}; display: block;`;

    return `
      <span class="shimmer" style="${inlineStyles}"></span>
    `;
  }
}
