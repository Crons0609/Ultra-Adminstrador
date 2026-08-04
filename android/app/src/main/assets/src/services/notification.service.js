/**
 * @file notification.service.js
 * @description Triggers UI interactive alerts (Toast) on screen corners.
 */

export class NotificationService {
  /**
   * Helper to render Toast HTML directly onto the document body.
   * @param {string} message 
   * @param {'success'|'warning'|'error'|'info'} type 
   * @param {number} [duration] - Milliseconds before auto-dismiss (default: 4000)
   */
  static show(message, type = 'info', duration = 4000) {
    // 1. Create or get container
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-wrapper';
      document.body.appendChild(container);
    }

    // 2. Create toast node
    const toast = document.createElement('div');
    toast.className = `toast toast-${type} animate-slide-up`;
    
    // Simple icon mapping
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    toast.innerHTML = `
      <span class="toast-icon">${icons[type]}</span>
      <span class="toast-message">${message}</span>
      <button class="toast-close">&times;</button>
    `;

    // 3. Bind close action
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
      this.dismiss(toast);
    });

    container.appendChild(toast);

    // 4. Auto dismiss
    setTimeout(() => {
      this.dismiss(toast);
    }, duration);
  }

  static success(msg) { this.show(msg, 'success'); }
  static error(msg) { this.show(msg, 'error'); }
  static warn(msg) { this.show(msg, 'warning'); }
  static info(msg) { this.show(msg, 'info'); }

  /**
   * Animation out and remove from DOM.
   * @param {HTMLElement} toast 
   */
  static dismiss(toast) {
    if (!toast) return;
    toast.classList.remove('animate-slide-up');
    toast.classList.add('animate-fade-out');
    
    let removed = false;
    const forceRemove = () => {
      if (!removed) {
        removed = true;
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }
    };

    toast.addEventListener('animationend', forceRemove);
    // Safety fallback: match transition duration (var(--transition-normal) is ~250-300ms)
    setTimeout(forceRemove, 500);
  }
}
