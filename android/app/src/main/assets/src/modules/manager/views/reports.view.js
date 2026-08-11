import { Component } from '../../../core/component.js';
import { I18nService } from '../../../services/i18n.service.js';

export class ReportsView extends Component {
  constructor(p={}) { super(p); }
  render() {
    const phase = 10;
    return `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--color-bg-primary)"><div class="card animate-slide-up" style="padding:var(--space-8);text-align:center;max-width:400px"><h2 style="font-family:var(--font-display);font-weight:700;margin-bottom:var(--space-2)">${I18nService.t('rep_title')}</h2><p style="color:var(--color-text-secondary);font-size:.875rem">${I18nService.t('rep_phase_implementation', { phase })}</p></div></div>`;
  }
}
