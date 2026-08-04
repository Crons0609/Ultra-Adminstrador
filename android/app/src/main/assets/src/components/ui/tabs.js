/**
 * @file tabs.js
 * @description Horizontal tab controls UI component.
 */

import { Component } from '../../core/component.js';

export class Tabs extends Component {
  /**
   * @param {Object} props
   * @param {Array<Object>} props.tabs - { id, label }
   * @param {string} props.activeTabId
   * @param {Function} props.onTabChange
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      tabs: [],
      activeTabId: '',
      ...props
    };
  }

  render() {
    const { tabs, activeTabId } = this.props;

    let tabsHTML = '';
    tabs.forEach(tab => {
      const activeClass = tab.id === activeTabId ? 'active' : '';
      tabsHTML += `
        <button class="tab-btn ${activeClass}" data-tab-id="${tab.id}">
          ${tab.label}
        </button>
      `;
    });

    return `
      <div class="tabs-container">
        ${tabsHTML}
      </div>
    `;
  }

  afterMount() {
    this.$$('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab-id');
        if (this.props.onTabChange) {
          this.props.onTabChange(tabId);
        }
      });
    });
  }
}
