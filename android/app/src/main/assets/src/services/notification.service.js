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
      success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><path d="M20 6 9 17l-5-5"/></svg>`,
      error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
      warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`,
      info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>`
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
