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
      icon: '📁',
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
        <span class="empty-state-icon" style="font-size: 3rem; margin-bottom: var(--space-4); display: block; filter: grayscale(0.2);">${icon}</span>
        <h3 class="text-xl font-semibold mb-2" style="margin-bottom: var(--space-2); color: var(--color-text-primary);">${title}</h3>
        <p class="text-secondary max-w-sm" style="margin-bottom: var(--space-4); max-width: 320px; font-size: 0.875rem;">${description}</p>
        ${actionHTML}
      </div>
    `;
  }
}
