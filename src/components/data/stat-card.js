/**
 * @file stat-card.js
 * @description Statistic card for dashboards showing KPI metrics with trends.
 */

import { Component } from '../../core/component.js';

export class StatCard extends Component {
  /**
   * @param {Object} props
   * @param {string} props.title
   * @param {string|number} props.value
   * @param {string} [props.icon] - Emoji or unicode icon
   * @param {string} [props.trend] - '+5.2%' or '-1.3%'
   * @param {boolean} [props.positive] - Green if true, red if false
   * @param {string} [props.description]
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      title: '',
      value: 0,
      icon: '📊',
      trend: null,
      positive: true,
      description: '',
      ...props
    };
  }

  render() {
    const { title, value, icon, trend, positive, description } = this.props;

    const trendColor = positive ? 'var(--color-success)' : 'var(--color-danger)';
    const trendSymbol = positive ? '↑' : '↓';

    const trendHTML = trend
      ? `<span class="stat-trend" style="font-size: 0.75rem; font-weight: 600; color: ${trendColor};">
           ${trendSymbol} ${trend}
         </span>`
      : '';

    const descriptionHTML = description
      ? `<p style="font-size: 0.75rem; color: var(--color-text-tertiary); margin: 0; margin-top: 4px;">${description}</p>`
      : '';

    return `
      <div class="card hover-lift" style="padding: var(--space-5);">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: var(--space-3);">
          <span style="font-size: 0.8125rem; font-weight: 500; color: var(--color-text-secondary);">${title}</span>
          <span style="font-size: 1.5rem;">${icon}</span>
        </div>
        <div style="display: flex; align-items: baseline; gap: var(--space-2); margin-bottom: var(--space-1);">
          <span style="font-family: var(--font-display); font-size: 1.875rem; font-weight: 700; color: var(--color-text-primary); line-height: 1;">${value}</span>
          ${trendHTML}
        </div>
        ${descriptionHTML}
      </div>
    `;
  }
}
