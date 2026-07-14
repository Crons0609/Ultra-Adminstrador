/**
 * @file pagination.js
 * @description Table pagination interface controls UI component.
 */

import { Component } from '../../core/component.js';

export class Pagination extends Component {
  /**
   * @param {Object} props
   * @param {number} props.currentPage
   * @param {number} props.totalPages
   * @param {Function} props.onPageChange
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      currentPage: 1,
      totalPages: 1,
      ...props
    };
  }

  render() {
    const { currentPage, totalPages } = this.props;

    const prevDisabled = currentPage <= 1 ? 'disabled' : '';
    const nextDisabled = currentPage >= totalPages ? 'disabled' : '';

    return `
      <div class="pagination-container">
        <span class="text-sm text-secondary">
          Página ${currentPage} de ${totalPages}
        </span>
        <div class="pagination-buttons">
          <button class="btn btn-sm btn-secondary" id="page-prev-btn" ${prevDisabled}>
            Anterior
          </button>
          <button class="btn btn-sm btn-secondary" id="page-next-btn" ${nextDisabled}>
            Siguiente
          </button>
        </div>
      </div>
    `;
  }

  afterMount() {
    const prev = this.$('#page-prev-btn');
    const next = this.$('#page-next-btn');

    if (prev && !prev.disabled) {
      prev.addEventListener('click', () => {
        if (this.props.onPageChange) {
          this.props.onPageChange(this.props.currentPage - 1);
        }
      });
    }

    if (next && !next.disabled) {
      next.addEventListener('click', () => {
        if (this.props.onPageChange) {
          this.props.onPageChange(this.props.currentPage + 1);
        }
      });
    }
  }
}
