/**
 * @file avatar.js
 * @description Profile pictures/initial placeholders component.
 */

import { Component } from '../../core/component.js';

export class Avatar extends Component {
  /**
   * @param {Object} props
   * @param {string} [props.src]
   * @param {string} [props.name] - Fallback to initials if src is empty
   * @param {'sm'|'md'|'lg'} [props.size]
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      src: '',
      name: '',
      size: 'md',
      ...props
    };
  }

  getInitials(name) {
    if (!name) return '?';
    return name
      .split(' ')
      .map(part => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  render() {
    const { src, name, size } = this.props;
    const sizePx = size === 'sm' ? '28px' : size === 'lg' ? '48px' : '36px';
    const fontSize = size === 'sm' ? '0.75rem' : size === 'lg' ? '1.125rem' : '0.875rem';

    const containerStyle = `
      width: ${sizePx};
      height: ${sizePx};
      font-size: ${fontSize};
      border-radius: var(--radius-full);
      background-color: var(--color-bg-tertiary);
      border: 1px solid var(--color-border);
      color: var(--color-text-secondary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      font-weight: 600;
      user-select: none;
    `;

    if (src) {
      return `
        <div class="avatar" style="${containerStyle}">
          <img src="${src}" alt="${name || 'Avatar'}" style="width: 100%; height: 100%; object-fit: cover;" />
        </div>
      `;
    }

    return `
      <div class="avatar" style="${containerStyle}">
        ${this.getInitials(name)}
      </div>
    `;
  }
}
