import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { AuthService } from '../../../services/auth.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { GlobalStore } from '../../../core/state.js';

export class SettingsView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || 'global';

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
                <label class="form-label" for="saas-name-input">Nombre del SaaS</label>
                <input type="text" id="saas-name-input" class="input input-md" value="Ultra Administrador" required />
              </div>
              <div class="form-group">
                <label class="form-label" for="saas-branch-limit-input">Límite de Sucursales por Restaurante (Plan Basic)</label>
                <input type="number" id="saas-branch-limit-input" class="input input-md" value="1" required min="1" />
              </div>
              <div class="form-group">
                <label class="form-label">Modo Mantenimiento</label>
                <div style="display: flex; align-items: center; gap: var(--space-2); margin-top: 4px;">
                  <input type="checkbox" id="mantenimiento-toggle" />
                  <label for="mantenimiento-toggle" class="text-sm" style="cursor: pointer;">Activar pantalla de mantenimiento para todos los clientes</label>
                </div>
              </div>
              <button type="submit" id="btn-save-settings" class="btn btn-primary btn-md" style="align-self: flex-start; margin-top: var(--space-2);">
                Guardar Configuración
              </button>
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

    // Load SaaS configuration from Firebase Realtime Database
    this.loadSaaSSettings(element);

    return element;
  }

  afterMount(element) {
    const root = element || this.layout.element;
    if (!root) return;

    const saasForm = root.querySelector('#saas-settings-form');
    if (saasForm) {
      saasForm.addEventListener('submit', (e) => this.handleSaveSettings(e));
    }

    const createSaForm = root.querySelector('#create-superadmin-form');
    if (createSaForm) {
      createSaForm.addEventListener('submit', (e) => this.handleCreateSuperAdmin(e));
    }
  }

  /**
   * Load SaaS Global Config from companies/global/config
   */
  async loadSaaSSettings(element) {
    try {
      console.log('[SettingsView] Cargando configuración global del SaaS...');
      const config = await FirestoreService.getCompanyConfig(this.companyId);
      
      if (config) {
        const nameInput = element.querySelector('#saas-name-input');
        const limitInput = element.querySelector('#saas-branch-limit-input');
        const maintInput = element.querySelector('#mantenimiento-toggle');
        
        if (nameInput) nameInput.value = config.saasName || 'Ultra Administrador';
        if (limitInput) limitInput.value = config.branchLimit || 1;
        if (maintInput) maintInput.checked = !!config.maintenanceMode;
        
        console.log('[SettingsView] ✅ Configuración cargada desde RTDB.');
      }
    } catch (err) {
      console.warn('[SettingsView] No se pudo cargar la configuración de RTDB:', err.message);
    }
  }

  /**
   * Saves global settings to Firebase RTDB
   */
  async handleSaveSettings(e) {
    e.preventDefault();
    const root = this.layout.element;
    if (!root) return;

    const nameInput = root.querySelector('#saas-name-input');
    const limitInput = root.querySelector('#saas-branch-limit-input');
    const maintInput = root.querySelector('#mantenimiento-toggle');
    const saveBtn = root.querySelector('#btn-save-settings');

    if (!nameInput || !limitInput || !maintInput) return;

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando...';
    }

    const saasName = nameInput.value.trim();
    const branchLimit = Number(limitInput.value);
    const maintenanceMode = maintInput.checked;

    try {
      await FirestoreService.updateCompanyConfig(this.companyId, {
        saasName,
        branchLimit,
        maintenanceMode
      });
      NotificationService.success('Ajustes globales guardados en Firebase.');
    } catch (err) {
      console.error('[SettingsView] Error al guardar configuración:', err);
      alert(`Error al guardar configuración: ${err.message || err}`);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar Configuración';
      }
    }
  }

  /**
   * Registers a new SUPER_ADMIN user in Firebase Auth and RTDB
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
      console.log('[SettingsView] Registrando nuevo SuperAdministrador...');
      await AuthService.createUser(email, password, {
        displayName: displayName,
        role: 'SUPER_ADMIN',
        companyId: 'global',
        branchId: 'global'
      });
      NotificationService.success(`SuperAdministrador "${displayName}" registrado exitosamente.`);

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