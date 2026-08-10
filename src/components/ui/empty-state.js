/**
 * @file empty-state.js
 * @description Empty state layout placeholders styling.
 */

import { Component } from '../../core/component.js';

export class EmptyState extends Component {
  /**
   * @param {Object} props
   * @param {string} props.title
   * @param {string} props.description
   * @param {string} [props.icon] - Emoji or icon HTML character
   * @param {string} [props.actionHTML] - Option to pass button for fast redirect
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      title: '',
      description: '',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="42" height="42" style="color:var(--color-text-tertiary);"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
      actionHTML: '',
      ...props
    };
  }

  render() {
    const { title, description, icon, actionHTML } = this.props;

    const styles = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: var(--space-12) var(--space-6);
      border: 1px dashed var(--color-border);
      border-radius: var(--radius-lg);
      background-color: var(--color-bg-secondary);
    `;

    return `
      <div class="empty-state-container" style="${styles}">
        <span class="empty-state-icon" style="margin-bottom: var(--space-4); display: flex; align-items: center; justify-content: center;">${icon}</span>
        <h3 class="text-xl font-semibold mb-2" style="margin-bottom: var(--space-2); color: var(--color-text-primary); font-size: 1.1rem;">${title}</h3>
        <p class="text-secondary max-w-sm" style="margin-bottom: var(--space-4); max-width: 320px; font-size: 0.85rem; color: var(--color-text-secondary);">${description}</p>
        ${actionHTML}
      </div>
    `;

  }
}
