/**
 * @file page-layout.js
 * @description General Page wrapper combining Sidebar and Header.
 */

import { Component } from '../../core/component.js';
import { Sidebar } from './sidebar.js';
import { Header } from './header.js';

export class PageLayout extends Component {
  /**
   * @param {Object} props
   * @param {string} props.title - Main title page
   * @param {string} [props.subtitle]
   * @param {string} props.contentHTML - Inner Page HTML
   * @param {string} [props.actionHTML] - Extra top bar buttons HTML
   */
  constructor(props = {}) {
    super(props);
    this.sidebarComponent = new Sidebar();
    this.headerComponent = new Header();
  }

  render() {
    const { title, subtitle, contentHTML, actionHTML } = this.props;

    const actionContainer = actionHTML ? `<div class="page-actions">${actionHTML}</div>` : '';
    const subtitleHTML = subtitle ? `<p class="page-subtitle">${subtitle}</p>` : '';

    return `
      <div class="app-container w-full">
        <!-- Sidebar placeholder -->
        <div id="sidebar-layout-container"></div>
        
        <div class="main-content">
          <!-- Header placeholder -->
          <div id="header-layout-container"></div>
          
          <main class="page-body animate-fade-in">
            <div class="page-header">
              <div class="page-title-group">
                <h1 class="text-2xl font-bold">${title}</h1>
                ${subtitleHTML}
              </div>
              ${actionContainer}
            </div>
            
            <div class="page-content-wrapper">
              ${contentHTML}
            </div>
          </main>
        </div>
      </div>
    `;
  }

  afterMount() {
    // 1. Mount sidebar
    const sidebarContainer = this.$('#sidebar-layout-container');
    if (sidebarContainer) {
      sidebarContainer.appendChild(this.sidebarComponent.mount());
    }

    // 2. Mount header
    const headerContainer = this.$('#header-layout-container');
    if (headerContainer) {
      headerContainer.appendChild(this.headerComponent.mount());
    }
  }

  unmount() {
    this.sidebarComponent.unmount();
    this.headerComponent.unmount();
    super.unmount();
  }
}
