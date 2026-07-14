import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';

export class PlansView extends Component {
  constructor(params = {}) {
    super(params);
    this.layout = new PageLayout({
      title: 'Planes SaaS',
      subtitle: 'Administración de suscripciones, límites de sucursales, productos y costos de licencias.',
      actionHTML: `<button class="btn btn-primary btn-sm" id="btn-add-plan">+ Nuevo Plan</button>`,
      contentHTML: `
        <div class="grid-stats">
          <div class="card p-5 text-center">
            <h4 class="text-lg font-bold text-primary">Plan Basic</h4>
            <h3 class="text-3xl font-extrabold my-3">$499 <span class="text-sm font-normal">/ mes</span></h3>
            <p class="text-xs text-secondary mb-4">Ideal para cafeterías pequeñas o un solo local.</p>
            <ul class="text-sm text-left mb-4" style="list-style: none; padding: 0;">
              <li>✓ 1 Sucursal</li>
              <li>✓ 3 Usuarios activos</li>
              <li>✓ Menú Digital QR</li>
            </ul>
            <button class="btn btn-secondary btn-sm w-full">Editar Plan</button>
          </div>
          <div class="card p-5 text-center" style="border: 2px solid var(--color-accent);">
            <h4 class="text-lg font-bold text-accent">Plan Premium</h4>
            <h3 class="text-3xl font-extrabold my-3">$999 <span class="text-sm font-normal">/ mes</span></h3>
            <p class="text-xs text-secondary mb-4">El más popular para restaurantes en crecimiento.</p>
            <ul class="text-sm text-left mb-4" style="list-style: none; padding: 0;">
              <li>✓ 3 Sucursales</li>
              <li>✓ Usuarios ilimitados</li>
              <li>✓ Módulo KDS e Inventario</li>
            </ul>
            <button class="btn btn-primary btn-sm w-full">Editar Plan</button>
          </div>
          <div class="card p-5 text-center">
            <h4 class="text-lg font-bold text-success">Plan Enterprise</h4>
            <h3 class="text-3xl font-extrabold my-3">$1,999 <span class="text-sm font-normal">/ mes</span></h3>
            <p class="text-xs text-secondary mb-4">Para franquicias y grandes cadenas de comida.</p>
            <ul class="text-sm text-left mb-4" style="list-style: none; padding: 0;">
              <li>✓ Sucursales ilimitadas</li>
              <li>✓ Soporte prioritario 24/7</li>
              <li>✓ API abierta e informes avanzados</li>
            </ul>
            <button class="btn btn-secondary btn-sm w-full">Editar Plan</button>
          </div>
        </div>
      `
    });
  }

  mount() {
    return this.layout.mount();
  }

  unmount() {
    this.layout.unmount();
    super.unmount();
  }
}