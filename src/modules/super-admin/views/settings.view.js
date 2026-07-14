import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { AuthService } from '../../../services/auth.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { db } from '../../../config/firebase.config.js';

export class SettingsView extends Component {
  constructor(params = {}) {
    super(params);
    this.layout = new PageLayout({
      title: 'Configuración Global',
      subtitle: 'Configuraciones de límites globales del servidor, variables del sistema y mantenimiento.',
      contentHTML: `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: var(--space-6);">
          
          <!-- SaaS Global Settings -->
          <div class="card p-5">
            <h3 class="text-lg font-semibold mb-4">⚙️ Ajustes del SaaS</h3>
            <form id="saas-settings-form" style="display: flex; flex-direction: column; gap: var(--space-4);">
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

          <!-- Create SuperAdmin Account Panel -->
          <div class="card p-5">
            <h3 class="text-lg font-semibold mb-4" style="color: var(--color-accent);">🔑 Crear Administrador del Sistema</h3>
            <p class="text-xs text-secondary mb-4">
              Registra una nueva cuenta de SuperAdministrador para dar acceso total al panel de control, gestión de planes y monitoreo de la nube.
            </p>
            
            <form id="create-superadmin-form" style="display: flex; flex-direction: column; gap: var(--space-4);">
              <div class="form-group">
                <label class="form-label" for="sa-name">Nombre Completo</label>
                <input type="text" id="sa-name" class="input input-md" placeholder="Ej. Administrador Principal" required />
              </div>
              
              <div class="form-group">
                <label class="form-label" for="sa-email">Correo Electrónico</label>
                <input type="email" id="sa-email" class="input input-md" placeholder="ejemplo@correo.com" required />
              </div>
              
              <div class="form-group">
                <label class="form-label" for="sa-password">Contraseña (Mín. 6 caracteres)</label>
                <input type="password" id="sa-password" class="input input-md" placeholder="******" minlength="6" required />
              </div>
              
              <button type="submit" id="btn-create-sa" class="btn btn-primary btn-md" style="align-self: flex-start; margin-top: var(--space-2); width: 100%;">
                ⚡ Registrar SuperAdministrador
              </button>
            </form>
          </div>

        </div>
      `
    });
  }

  mount() {
    const element = this.layout.mount();
    
    // Bind afterMount manually
    this.afterMount(element);

    return element;
  }

  afterMount(element) {
    const root = element || this.layout.element;
    if (!root) return;

    const saasForm = root.querySelector('#saas-settings-form');
    if (saasForm) {
      saasForm.addEventListener('submit', (e) => {
        e.preventDefault();
        NotificationService.success('Ajustes globales guardados.');
      });
    }

    const createSaForm = root.querySelector('#create-superadmin-form');
    if (createSaForm) {
      createSaForm.addEventListener('submit', (e) => this.handleCreateSuperAdmin(e));
    }
  }

  /**
   * Registers a new SUPER_ADMIN user in Firebase Auth and Firestore
   */
  async handleCreateSuperAdmin(e) {
    e.preventDefault();
    
    const root = this.layout.element;
    if (!root) return;

    const nameInput = root.querySelector('#sa-name');
    const emailInput = root.querySelector('#sa-email');
    const passInput = root.querySelector('#sa-password');
    const submitBtn = root.querySelector('#btn-create-sa');

    if (!nameInput || !emailInput || !passInput || !submitBtn) return;

    const displayName = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passInput.value;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Registrando en la nube...';

    try {
      if (db) {
        console.log('[SettingsView] Registrando nuevo SuperAdministrador...');
        await AuthService.createUser(email, password, {
          displayName: displayName,
          role: 'SUPER_ADMIN',
          companyId: 'global',
          branchId: 'global'
        });
        NotificationService.success(`SuperAdministrador "${displayName}" registrado exitosamente.`);
      } else {
        // Fallback local persistence if offline
        const dynamicUsers = JSON.parse(localStorage.getItem('ua_dynamic_users') || '[]');
        dynamicUsers.push({
          uid: `sa-${Date.now()}`,
          email: email,
          password: password,
          displayName: displayName,
          role: 'SUPER_ADMIN',
          companyId: 'global',
          branchId: 'global'
        });
        localStorage.setItem('ua_dynamic_users', JSON.stringify(dynamicUsers));
        NotificationService.success(`[Offline] SuperAdministrador guardado localmente.`);
      }

      // Reset form fields
      nameInput.value = '';
      emailInput.value = '';
      passInput.value = '';

    } catch (err) {
      console.error('[SettingsView] Error al registrar SuperAdmin:', err);
      alert(`Error al registrar el SuperAdministrador: ${err.message || err}`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '⚡ Registrar SuperAdministrador';
    }
  }

  unmount() {
    this.layout.unmount();
    super.unmount();
  }
}