/**
 * @file modal.js
 * @description Modal UI reusable component.
 */

import { Component } from '../../core/component.js';

export class Modal extends Component {
  /**
   * @param {Object} props
   * @param {string} props.title
   * @param {string} props.bodyHTML
   * @param {string} [props.footerHTML]
   * @param {'sm'|'md'|'lg'|'xl'} [props.size]
   * @param {Function} [props.onClose]
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      title: '',
      bodyHTML: '',
      footerHTML: '',
      size: 'md',
      ...props
    };
  }

  render() {
    const { title, bodyHTML, footerHTML, size } = this.props;
    const footerTemplate = footerHTML ? `<div class="modal-footer">${footerHTML}</div>` : '';

    return `
      <div class="modal-overlay">
        <div class="modal-container modal-${size}">
          <div class="modal-header">
            <h3 class="modal-title">${title}</h3>
            <button class="modal-close" id="modal-close-btn">&times;</button>
          </div>
          <div class="modal-body">
            ${bodyHTML}
          </div>
          ${footerTemplate}
        </div>
      </div>
    `;
  }

  afterMount() {
    // Lock background scroll when modal is open
    document.body.classList.add('modal-open');

    const closeBtn = this.$('#modal-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Close on overlay click
    if (this.element) {
      this.element.addEventListener('click', (e) => {
        if (e.target === this.element) {
          this.close();
        }
      });
    }
  }

  close() {
    if (this.props.onClose) {
      this.props.onClose();
    }
    this.unmount();
  }

  unmount() {
    // Remove this modal's element from DOM first
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }

    // Restore background scroll only if no other modals remain
    const remainingModals = document.querySelectorAll('.modal-overlay');
    if (remainingModals.length === 0) {
      document.body.classList.remove('modal-open');
    }

    super.unmount();
  }
}
