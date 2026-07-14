/**
 * @file breadcrumb.js
 * @description Breadcrumbs navigation UI helper component.
 */

import { Component } from '../../core/component.js';

export class Breadcrumb extends Component {
  /**
   * @param {Object} props
   * @param {Array<Object>} props.items - { label, link }
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      items: [],
      ...props
    };
  }

  render() {
    const { items } = this.props;

    let itemsHTML = '';
    items.forEach((item, index) => {
      const isLast = index === items.length - 1;
      
      if (isLast) {
        itemsHTML += `
          <div class="breadcrumb-item active">
            <span>${item.label}</span>
          </div>
        `;
      } else {
        itemsHTML += `
          <div class="breadcrumb-item">
            <a href="${item.link || '#'}" class="breadcrumb-link">${item.label}</a>
            <span class="breadcrumb-separator mx-2">/</span>
          </div>
        `;
      }
    });

    return `
      <nav class="breadcrumb-container" aria-label="Breadcrumb">
        ${itemsHTML}
      </nav>
    `;
  }
}
