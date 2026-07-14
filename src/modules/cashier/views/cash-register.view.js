import { Component } from '../../../core/component.js';
export class CashRegisterView extends Component {
  constructor(p={}) { super(p); }
  render() {
    const title = 'Caja Registradora';
    const phase = 8;
    return `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--color-bg-primary)"><div class="card animate-slide-up" style="padding:var(--space-8);text-align:center;max-width:400px"><h2 style="font-family:var(--font-display);font-weight:700;margin-bottom:var(--space-2)">${title}</h2><p style="color:var(--color-text-secondary);font-size:.875rem">Implementacion completa en Fase ${phase}.</p></div></div>`;
  }
}