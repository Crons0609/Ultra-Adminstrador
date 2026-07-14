/**
 * @file menu.view.js
 * @description Customer-facing menu view. Accessed via QR code. Implemented fully in Phase 5.
 */

import { Component } from '../../../core/component.js';

export class MenuView extends Component {
  constructor(params = {}) { super(params); }

  render() {
    return `
      <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--color-bg-primary);">
        <div class="card animate-slide-up" style="padding: var(--space-8); text-align: center; max-width: 400px;">
          <div style="font-size: 3rem; margin-bottom: var(--space-4);">🍽️</div>
          <h2 style="font-family: var(--font-display); font-weight: 700; margin-bottom: var(--space-2);">Menú del Restaurante</h2>
          <p style="color: var(--color-text-secondary); font-size: 0.875rem;">
            Este módulo se implementará completamente en la <strong>Fase 5 — Panel Cliente</strong>.
          </p>
        </div>
      </div>
    `;
  }
}
