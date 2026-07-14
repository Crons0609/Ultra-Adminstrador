import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';

export class SettingsView extends Component {
  constructor(params = {}) {
    super(params);
    this.layout = new PageLayout({
      title: 'Configuración Global',
      subtitle: 'Configuraciones de límites globales del servidor, variables del sistema y mantenimiento.',
      contentHTML: `
        <div class="card p-5">
          <h3 class="text-lg font-semibold mb-4">Ajustes del SaaS</h3>
          <form style="display: flex; flex-direction: column; gap: var(--space-4); max-width: 500px;">
            <div class="form-group">
              <label class="form-label">Nombre del SaaS</label>
              <input type="text" class="input input-md" value="Ultra Administrador" />
            </div>
            <div class="form-group">
              <label class="form-label">Límite de Sucursales por Restaurante (Plan Basic)</label>
              <input type="number" class="input input-md" value="1" />
            </div>
            <div class="form-group">
              <label class="form-label">Modo Mantenimiento</label>
              <div style="display: flex; align-items: center; gap: var(--space-2); margin-top: 4px;">
                <input type="checkbox" id="mantenimiento-toggle" />
                <label for="mantenimiento-toggle" class="text-sm">Activar pantalla de mantenimiento para todos los clientes</label>
              </div>
            </div>
            <button class="btn btn-primary btn-md" style="align-self: flex-start; margin-top: var(--space-2);">Guardar Configuración</button>
          </form>
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