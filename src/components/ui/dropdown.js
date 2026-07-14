/**
 * @file dropdown.js
 * @description Dropdown context trigger lists styling.
 */

import { Component } from '../../core/component.js';

export class Dropdown extends Component {
  /**
   * @param {Object} props
   * @param {string} props.triggerHTML
   * @param {Array<Object>} props.items - { label, onClick, danger }
   * @param {'left'|'right'} [props.align]
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      triggerHTML: '',
      items: [],
      align: 'right',
      ...props
    };
    this.state = { isOpen: false };
  }

  render() {
    const { triggerHTML, items, align } = this.props;
    const { isOpen } = this.state;
    const openClass = isOpen ? 'd-block' : 'd-none';
    const alignClass = align === 'left' ? 'left: 0;' : 'right: 0;';

    const menuStyles = `
      position: absolute;
      top: 100%;
      ${alignClass}
      margin-top: 4px;
      background-color: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-md);
      z-index: 500;
      min-width: 160px;
      overflow: hidden;
    `;

    const triggerContainerStyles = `
      position: relative;
      display: inline-block;
    `;

    let itemsHTML = '';
    items.forEach((item, index) => {
      const itemClass = item.danger ? 'color: var(--color-danger);' : '';
      itemsHTML += `
        <button 
          class="dropdown-item-btn" 
          data-index="${index}" 
          style="width: 100%; text-align: left; background: transparent; border: none; padding: var(--space-2) var(--space-3); font-size: 0.875rem; cursor: pointer; transition: background-color var(--transition-fast); color: var(--color-text-primary); ${itemClass}"
        >
          ${item.label}
        </button>
      `;
    });

    return `
      <div class="dropdown-container" style="${triggerContainerStyles}">
        <div class="dropdown-trigger" id="dropdown-trigger-node" style="cursor: pointer;">
          ${triggerHTML}
        </div>
        <div class="dropdown-menu ${openClass}" style="${menuStyles}">
          ${itemsHTML}
        </div>
      </div>
    `;
  }

  afterMount() {
    const trigger = this.$('#dropdown-trigger-node');
    if (trigger) {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setState({ isOpen: !this.state.isOpen });
      });
    }

    // Bind items clicks
    this.$$('.dropdown-item-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.getAttribute('data-index'));
        const item = this.props.items[index];
        if (item && item.onClick) {
          item.onClick();
        }
        this.setState({ isOpen: false });
      });
    });

    // Close on click outside
    this._clickOutsideHandler = () => {
      if (this.state.isOpen) {
        this.setState({ isOpen: false });
      }
    };
    document.addEventListener('click', this._clickOutsideHandler);
  }

  unmount() {
    document.removeEventListener('click', this._clickOutsideHandler);
    super.unmount();
  }
}
