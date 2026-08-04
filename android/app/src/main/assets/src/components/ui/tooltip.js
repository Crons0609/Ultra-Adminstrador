/**
 * @file tooltip.js
 * @description Tooltip overlay helper.
 */

import { Component } from '../../core/component.js';

export class Tooltip extends Component {
  /**
   * @param {Object} props
   * @param {string} props.text - Hover tooltip contents
   * @param {string} props.childHTML - Inner HTML of target element
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      text: '',
      childHTML: '',
      ...props
    };
  }

  render() {
    const { text, childHTML } = this.props;

    const wrapperStyles = `
      position: relative;
      display: inline-block;
    `;

    const tooltipStyles = `
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%) translateY(-8px);
      background-color: var(--color-bg-primary);
      color: var(--color-text-primary);
      border: 1px solid var(--color-border);
      padding: 4px 8px;
      font-size: 0.75rem;
      border-radius: var(--radius-sm);
      white-space: nowrap;
      box-shadow: var(--shadow-sm);
      z-index: 600;
      pointer-events: none;
      opacity: 0;
      transition: opacity var(--transition-fast), transform var(--transition-fast);
    `;

    return `
      <div class="tooltip-wrapper" style="${wrapperStyles}">
        <div class="tooltip-trigger">
          ${childHTML}
        </div>
        <div class="tooltip-popup" style="${tooltipStyles}">
          ${text}
        </div>
      </div>
    `;
  }

  afterMount() {
    const trigger = this.$('.tooltip-trigger');
    const popup = this.$('.tooltip-popup');

    if (trigger && popup) {
      trigger.addEventListener('mouseenter', () => {
        popup.style.opacity = '1';
        popup.style.transform = 'translateX(-50%) translateY(-4px)';
      });

      trigger.addEventListener('mouseleave', () => {
        popup.style.opacity = '0';
        popup.style.transform = 'translateX(-50%) translateY(-8px)';
      });
    }
  }
}
