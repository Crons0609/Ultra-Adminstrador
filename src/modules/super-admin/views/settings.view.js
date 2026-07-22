import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { AuthService } from '../../../services/auth.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { GlobalStore } from '../../../core/state.js';
import { TimeService } from '../../../services/time.service.js';

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

          <!-- Cron Job / Render Keep Alive -->
          <div class="card p-5">
            <h3 class="text-lg font-semibold mb-4" style="color: var(--color-accent);">Cron Job / Keep Alive Render</h3>
            <p class="text-xs text-secondary mb-4">
              Configura la URL que debe usar un servicio externo de cron job para mantener activa la aplicación alojada en Render.
            </p>

            <form id="cron-settings-form" style="display: flex; flex-direction: column; gap: var(--space-4);">
              <div class="form-group">
                <label class="form-label">Activar monitoreo keep alive</label>
                <div style="display: flex; align-items: center; gap: var(--space-2); margin-top: 4px;">
                  <input type="checkbox" id="cron-enabled-toggle" />
                  <label for="cron-enabled-toggle" class="text-sm" style="cursor: pointer;">Registrar configuración activa para Render</label>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="cron-endpoint-input">API interna para el cron job</label>
                <div style="display:flex; gap:var(--space-2); align-items:center;">
                  <input type="url" id="cron-endpoint-input" class="input input-md" readonly style="flex:1;" />
                  <button type="button" id="btn-copy-cron-url" class="btn btn-secondary btn-sm">Copiar</button>
                  <button type="button" id="btn-test-cron-url" class="btn btn-secondary btn-sm">Probar</button>
                </div>
              </div>

              <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">
                <div class="form-group">
                  <label class="form-label" for="cron-provider-input">Proveedor externo</label>
                  <select id="cron-provider-input" class="input input-md">
                    <option value="cron-job.org">cron-job.org</option>
                    <option value="uptimerobot">UptimeRobot</option>
                    <option value="render-cron">Render Cron Job</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="cron-interval-input">Intervalo recomendado (minutos)</label>
                  <input type="number" id="cron-interval-input" class="input input-md" value="10" min="5" max="60" />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="cron-external-url-input">URL/API del proveedor externo (opcional)</label>
                <input type="url" id="cron-external-url-input" class="input input-md" placeholder="https://cron-job.org/..." />
              </div>

              <div class="form-group">
                <label class="form-label" for="cron-token-input">Token opcional</label>
                <input type="text" id="cron-token-input" class="input input-md" placeholder="Solo si configuras CRON_JOB_TOKEN en Render" />
              </div>

              <p id="cron-last-run" class="text-xs text-secondary">Última prueba: sin ejecutar</p>

              <button type="submit" id="btn-save-cron-settings" class="btn btn-primary btn-md" style="align-self: flex-start;">
                Guardar Cron Job
              </button>
            </form>
          </div>

          <!-- Production Reset Panel (Exclusivo Programadores) -->
          <div class="card p-5" style="border: 1px solid rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.03); grid-column: 1 / -1;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-3);">
              <div>
                <h3 class="text-lg font-semibold" style="color: #ef4444; display: flex; align-items: center; gap: 8px;">
                  <span>💥 Reinicio para Producción</span>
                  <span style="font-size: 0.65rem; padding: 2px 8px; border-radius: 12px; background: rgba(239,68,68,0.2); color: #f87171; border: 1px solid rgba(239,68,68,0.3); font-weight: 600;">EXCLUSIVO PROGRAMADOR</span>
                </h3>
                <p class="text-xs text-secondary" style="margin-top: 4px;">
                  Limpia y reorganiza completamente Firebase eliminando cuentas de usuarios de prueba, negocios, pedidos, productos e historial transaccional para iniciar operaciones en producción.
                </p>
              </div>
            </div>

            <div style="padding: var(--space-4); background: var(--color-bg-secondary, rgba(0,0,0,0.2)); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: var(--space-4);">
              <h4 style="font-size: 0.85rem; font-weight: 600; color: #f87171; margin-bottom: 8px;">⚠️ Advertencia de Seguridad Importante</h4>
              <ul style="font-size: 0.75rem; color: var(--color-text-secondary); display: flex; flex-direction: column; gap: 4px; padding-left: 18px; margin: 0;">
                <li><strong>Permanente e Irreversible:</strong> Esta acción eliminará directamente los registros de prueba en Firebase.</li>
                <li><strong>Protección de Programadores:</strong> Las cuentas de correo de los programadores/SuperAdmin (con sus roles y permisos) <strong>NO</strong> serán eliminadas.</li>
                <li><strong>Respaldo 1 a 1:</strong> Se recomienda respaldar la base de datos descargando el archivo JSON antes de continuar.</li>
                <li><strong>Configuración Global Preservada:</strong> Los parámetros del SaaS y planes (<code style="color:#60a5fa;">companies/global</code>) permanecerán listos para producción.</li>
              </ul>
            </div>

            <div style="display: flex; flex-direction: column; gap: var(--space-4);">
              <!-- Step 1: Backup -->
              <div style="display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); padding: var(--space-3); background: rgba(59, 130, 246, 0.08); border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.2);">
                <div>
                  <h5 style="font-size: 0.8rem; font-weight: 600; color: #60a5fa; margin: 0;">Paso 1: Guardar Copia de Seguridad (1 a 1)</h5>
                  <p style="font-size: 0.7rem; color: var(--color-text-secondary); margin: 0;">Descarga el estado actual de Firebase en formato JSON antes de borrar los datos de prueba.</p>
                </div>
                <button type="button" id="btn-download-backup" class="btn btn-secondary btn-sm" style="border-color: rgba(59, 130, 246, 0.4); color: #60a5fa; white-space: nowrap;">
                  📥 Descargar Backup JSON
                </button>
              </div>

              <!-- Step 2: Confirmation & Execution -->
              <div style="display: flex; flex-direction: column; gap: var(--space-3);">
                <div class="form-group">
                  <label class="form-label" for="purge-confirm-input" style="font-size: 0.8rem; font-weight: 600; color: var(--color-text-primary);">
                    Paso 2: Confirmación de Seguridad (Escribe <code style="background: rgba(239,68,68,0.2); padding: 2px 6px; border-radius: 4px; color: #f87171;">REINICIAR-PRODUCCION</code> o <code style="background: rgba(239,68,68,0.2); padding: 2px 6px; border-radius: 4px; color: #f87171;">1+1</code>)
                  </label>
                  <input type="text" id="purge-confirm-input" class="input input-md" placeholder="Ingresa REINICIAR-PRODUCCION o 1+1" style="font-family: monospace; letter-spacing: 0.05em;" />
                </div>

                <div style="display: flex; gap: var(--space-3); align-items: center; flex-wrap: wrap;">
                  <button type="button" id="btn-execute-purge" class="btn btn-danger btn-md" style="background: #dc2626; border-color: #dc2626; opacity: 0.85; cursor: pointer; font-weight: 600;">
                    🔥 Ejecutar Reinicio y Limpieza de Firebase
                  </button>
                  <span id="purge-status-label" class="text-xs text-secondary" style="font-family: monospace;">Escribe 1+1 o REINICIAR-PRODUCCION para habilitar</span>
                </div>
              </div>

              <!-- Log Console Output -->
              <div id="purge-log-console" style="display: none; background: #0a0a0c; color: #10b981; font-family: monospace; font-size: 0.72rem; padding: 12px; border-radius: 6px; max-height: 180px; overflow-y: auto; border: 1px solid rgba(16, 185, 129, 0.3);">
                <div style="color: #6b7280; margin-bottom: 4px;">--- CONSOLA DE LIMPIEZA Y AUDITORÍA DE FIREBASE ---</div>
              </div>
            </div>
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

    const cronForm = root.querySelector('#cron-settings-form');
    if (cronForm) {
      cronForm.addEventListener('submit', (e) => this.handleSaveCronSettings(e));
    }

    const copyCronBtn = root.querySelector('#btn-copy-cron-url');
    if (copyCronBtn) {
      copyCronBtn.addEventListener('click', () => this.copyCronEndpoint());
    }

    const testCronBtn = root.querySelector('#btn-test-cron-url');
    if (testCronBtn) {
      testCronBtn.addEventListener('click', () => this.testCronEndpoint());
    }

    // Production Reset Event Listeners
    const downloadBackupBtn = root.querySelector('#btn-download-backup');
    if (downloadBackupBtn) {
      downloadBackupBtn.addEventListener('click', () => this.handleDownloadBackup());
    }

    const confirmInput = root.querySelector('#purge-confirm-input');
    const executePurgeBtn = root.querySelector('#btn-execute-purge');
    const purgeStatusLabel = root.querySelector('#purge-status-label');

    if (confirmInput && executePurgeBtn) {
      confirmInput.addEventListener('input', () => {
        const val = confirmInput.value.trim().toUpperCase();
        const isValid = val === 'REINICIAR-PRODUCCION' || val === '1+1';

        executePurgeBtn.style.opacity = isValid ? '1' : '0.85';

        if (purgeStatusLabel) {
          purgeStatusLabel.textContent = isValid
            ? '✅ Confirmación válida. Listo para ejecutar.'
            : 'Escribe 1+1 o REINICIAR-PRODUCCION para habilitar';
          purgeStatusLabel.style.color = isValid ? '#10b981' : 'var(--color-text-secondary)';
        }
      });

      executePurgeBtn.addEventListener('click', () => this.handleExecuteProductionReset());
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
        const cronEnabled = element.querySelector('#cron-enabled-toggle');
        const cronEndpoint = element.querySelector('#cron-endpoint-input');
        const cronProvider = element.querySelector('#cron-provider-input');
        const cronInterval = element.querySelector('#cron-interval-input');
        const cronExternalUrl = element.querySelector('#cron-external-url-input');
        const cronToken = element.querySelector('#cron-token-input');
        const cronLastRun = element.querySelector('#cron-last-run');
        
        if (nameInput) nameInput.value = config.saasName || 'Ultra Administrador';
        if (limitInput) limitInput.value = config.branchLimit || 1;
        if (maintInput) maintInput.checked = !!config.maintenanceMode;
        this.setCronEndpointValue(element, config.keepAliveCron);
        if (cronEnabled) cronEnabled.checked = !!config.keepAliveCron?.enabled;
        if (cronProvider) cronProvider.value = config.keepAliveCron?.provider || 'cron-job.org';
        if (cronInterval) cronInterval.value = config.keepAliveCron?.intervalMinutes || 10;
        if (cronExternalUrl) cronExternalUrl.value = config.keepAliveCron?.externalApiUrl || '';
        if (cronToken) cronToken.value = config.keepAliveCron?.token || '';
        if (cronLastRun && config.keepAliveCron?.lastTestAtLocal) {
          cronLastRun.textContent = `Última prueba: ${TimeService.formatDate(config.keepAliveCron.lastTestAtLocal.epochMs, true)}`;
        }
        
        console.log('[SettingsView] ✅ Configuración cargada desde RTDB.');
      } else {
        this.setCronEndpointValue(element);
      }
    } catch (err) {
      console.warn('[SettingsView] No se pudo cargar la configuración de RTDB:', err.message);
      this.setCronEndpointValue(element);
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

  setCronEndpointValue(root, keepAliveCron = {}) {
    const endpointInput = root.querySelector('#cron-endpoint-input');
    const token = keepAliveCron.token || '';
    const baseUrl = `${window.location.origin}/api/cron/ping`;
    if (endpointInput) {
      endpointInput.value = token ? `${baseUrl}?token=${encodeURIComponent(token)}` : baseUrl;
    }
  }

  async handleSaveCronSettings(e) {
    e.preventDefault();
    const root = this.layout.element;
    if (!root) return;

    const enabled = root.querySelector('#cron-enabled-toggle')?.checked || false;
    const provider = root.querySelector('#cron-provider-input')?.value || 'cron-job.org';
    const intervalMinutes = Number(root.querySelector('#cron-interval-input')?.value || 10);
    const externalApiUrl = root.querySelector('#cron-external-url-input')?.value.trim() || '';
    const token = root.querySelector('#cron-token-input')?.value.trim() || '';
    const endpointUrl = token
      ? `${window.location.origin}/api/cron/ping?token=${encodeURIComponent(token)}`
      : `${window.location.origin}/api/cron/ping`;
    const saveBtn = root.querySelector('#btn-save-cron-settings');

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando...';
    }

    try {
      const keepAliveCron = {
        enabled,
        provider,
        intervalMinutes,
        externalApiUrl,
        token,
        endpointUrl,
        renderKeepAlive: true,
        updatedAtLocal: TimeService.timestamp()
      };

      await FirestoreService.updateCompanyConfig(this.companyId, { keepAliveCron });
      await FirestoreService.logAudit({
        action: 'GLOBAL_CRON_CONFIG_SAVE',
        companyId: 'global',
        description: `Configuración de cron job actualizada para Render (${provider}, cada ${intervalMinutes} min).`,
        metadata: keepAliveCron
      });

      this.setCronEndpointValue(root, keepAliveCron);
      NotificationService.success('Cron Job / Keep Alive guardado en Firebase.');
    } catch (err) {
      console.error('[SettingsView] Error al guardar cron job:', err);
      alert(`Error al guardar Cron Job: ${err.message || err}`);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar Cron Job';
      }
    }
  }

  async copyCronEndpoint() {
    const root = this.layout.element;
    const endpoint = root?.querySelector('#cron-endpoint-input')?.value || `${window.location.origin}/api/cron/ping`;

    try {
      await navigator.clipboard.writeText(endpoint);
      NotificationService.success('API del cron job copiada.');
    } catch {
      const temp = document.createElement('textarea');
      temp.value = endpoint;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      document.body.removeChild(temp);
      NotificationService.success('API del cron job copiada.');
    }
  }

  async testCronEndpoint() {
    const root = this.layout.element;
    const endpoint = root?.querySelector('#cron-endpoint-input')?.value || `${window.location.origin}/api/cron/ping`;
    const statusEl = root?.querySelector('#cron-last-run');
    const testBtn = root?.querySelector('#btn-test-cron-url');

    if (testBtn) {
      testBtn.disabled = true;
      testBtn.textContent = 'Probando...';
    }

    try {
      const response = await fetch(endpoint, { method: 'GET' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const lastTestAtLocal = TimeService.timestamp();
      if (statusEl) statusEl.textContent = `Última prueba: ${TimeService.formatDate(lastTestAtLocal.epochMs, true)}`;

      const existingConfig = await FirestoreService.getCompanyConfig(this.companyId);
      await FirestoreService.updateCompanyConfig(this.companyId, {
        keepAliveCron: {
          ...(existingConfig?.keepAliveCron || {}),
          endpointUrl: endpoint,
          lastTestOk: true,
          lastTestAtLocal
        }
      });

      NotificationService.success('API de cron job respondió correctamente.');
    } catch (err) {
      console.error('[SettingsView] Cron endpoint test failed:', err);
      if (statusEl) statusEl.textContent = `Última prueba: error (${err.message || err})`;
      NotificationService.error('La API de cron job no respondió correctamente.');
    } finally {
      if (testBtn) {
        testBtn.disabled = false;
        testBtn.textContent = 'Probar';
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

  async handleDownloadBackup() {
    try {
      NotificationService.info('Generando archivo de copia de seguridad 1 a 1...');
      await AuthService.downloadDatabaseBackup();
      NotificationService.success('Copia de seguridad 1 a 1 descargada con éxito.');
    } catch (err) {
      console.error('[SettingsView] Error al descargar backup:', err);
      NotificationService.error(`Error al generar respaldo: ${err.message || err}`);
    }
  }

  /**
   * Triggers the Production Reset flow by launching the interactive modal assistant.
   */
  handleExecuteProductionReset() {
    this.openProductionResetModal();
  }

  /**
   * Builds and displays the interactive 2-stage modal for Production Reset.
   */
  openProductionResetModal() {
    // Remove existing modal if present
    const oldModal = document.getElementById('production-reset-modal');
    if (oldModal) oldModal.remove();

    const modalHTML = `
      <div id="production-reset-modal" class="modal-overlay" style="position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px;">
        <div class="card p-6" style="background: #111115; border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 12px; width: 100%; max-width: 680px; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 40px rgba(0,0,0,0.8); color: var(--color-text-primary);">
          
          <!-- Header -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 12px;">
            <div>
              <h3 style="font-size: 1.25rem; font-weight: 700; color: #ef4444; margin: 0; display: flex; align-items: center; gap: 8px;">
                <span>💥 Reinicio Completo para Producción</span>
                <span style="font-size: 0.65rem; padding: 2px 8px; border-radius: 12px; background: rgba(239,68,68,0.2); color: #f87171; border: 1px solid rgba(239,68,68,0.3);">FIREBASE RTDB</span>
              </h3>
              <p style="font-size: 0.8rem; color: #9ca3af; margin-top: 4px;">Asistente exclusivo para usuarios con rol de Programador.</p>
            </div>
            <button id="modal-close-btn" style="background: transparent; border: none; color: #9ca3af; font-size: 1.5rem; cursor: pointer; line-height: 1;">&times;</button>
          </div>

          <!-- STAGE 1: Confirm & Backup -->
          <div id="reset-stage-1">
            <div style="padding: 14px; background: rgba(239, 68, 68, 0.08); border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.25); margin-bottom: 16px;">
              <h4 style="font-size: 0.85rem; font-weight: 700; color: #f87171; margin: 0 0 6px 0;">⚠️ ADVERTENCIA DE ELIMINACIÓN PERMANENTE</h4>
              <p style="font-size: 0.78rem; color: #d1d5db; margin: 0 0 8px 0;">
                Esta acción eliminará <strong>directamente en Firebase</strong> todos los datos de prueba generados durante el desarrollo:
              </p>
              <ul style="font-size: 0.75rem; color: #9ca3af; margin: 0; padding-left: 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                <li>❌ Cuentas de clientes y empleados</li>
                <li>❌ Empresas, negocios y sucursales</li>
                <li>❌ Catálogo de productos y categorías</li>
                <li>❌ Historial de pedidos y facturas</li>
                <li>❌ Mesas, códigos QR y promociones</li>
                <li>❌ Configuraciones de locales y cajas</li>
              </ul>
              <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed rgba(239,68,68,0.3); font-size: 0.75rem; color: #10b981; font-weight: 600;">
                🛡️ PROTECCIÓN INTACTA: Las cuentas con rol de Programador y la configuración del SaaS no sufrirán ninguna alteración.
              </div>
            </div>

            <!-- Paso A: Respaldo JSON -->
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(59, 130, 246, 0.08); padding: 12px; border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.2); margin-bottom: 16px;">
              <div>
                <strong style="font-size: 0.82rem; color: #60a5fa; display: block;">1. Generar Copia de Seguridad (1 a 1)</strong>
                <span style="font-size: 0.72rem; color: #9ca3af;">Descarga el archivo JSON completo de Firebase antes de proceder.</span>
              </div>
              <button id="modal-download-backup-btn" class="btn btn-secondary btn-sm" style="border-color: #3b82f6; color: #60a5fa; white-space: nowrap;">
                📥 Descargar Backup
              </button>
            </div>

            <!-- Paso B: Confirmación obligatoria -->
            <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
              <div>
                <label style="font-size: 0.8rem; font-weight: 600; color: #e5e7eb; display: block; margin-bottom: 6px;">
                  2. Confirmación de Seguridad (Escribe <code style="background: rgba(239,68,68,0.2); color: #f87171; padding: 2px 6px; border-radius: 4px;">1+1</code> o <code style="background: rgba(239,68,68,0.2); color: #f87171; padding: 2px 6px; border-radius: 4px;">REINICIAR-PRODUCCION</code>):
                </label>
                <input type="text" id="modal-confirm-input" class="input input-md" placeholder="Escribe 1+1 o REINICIAR-PRODUCCION" style="width: 100%; font-family: monospace; letter-spacing: 0.05em;" />
              </div>

              <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; font-size: 0.78rem; color: #9ca3af; background: rgba(255,255,255,0.03); padding: 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08);">
                <input type="checkbox" id="modal-confirm-checkbox" style="margin-top: 2px;" />
                <span>Confirmo que he revisado las advertencias, he respaldado la información requerida y deseo proceder con la purga total en Firebase.</span>
              </label>
            </div>

            <!-- Footer Stage 1 -->
            <div style="display: flex; justify-content: flex-end; gap: 10px;">
              <button id="modal-cancel-btn" class="btn btn-secondary btn-md">Cancelar</button>
              <button id="modal-start-purge-btn" class="btn btn-danger btn-md" disabled style="opacity: 0.5; cursor: not-allowed; background: #dc2626; border-color: #dc2626;">
                🔥 Confirmar y Limpiar Firebase
              </button>
            </div>
          </div>

          <!-- STAGE 2: Progress & Execution -->
          <div id="reset-stage-2" style="display: none;">
            <div style="margin-bottom: 16px;">
              <div style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 600; margin-bottom: 6px;">
                <span id="progress-stage-title" style="color: #60a5fa;">Iniciando proceso...</span>
                <span id="progress-percent" style="color: #10b981;">0%</span>
              </div>
              <div style="width: 100%; height: 10px; background: rgba(255,255,255,0.1); border-radius: 5px; overflow: hidden;">
                <div id="progress-bar-fill" style="width: 0%; height: 100%; background: linear-gradient(90deg, #ef4444, #10b981); transition: width 0.3s ease;"></div>
              </div>
              <p id="progress-detail-text" style="font-size: 0.75rem; color: #9ca3af; margin-top: 6px; font-family: monospace;">Preparando escaneo de nodos...</p>
            </div>

            <!-- Console Log -->
            <div id="modal-log-console" style="background: #090a0f; border: 1px solid rgba(16,185,129,0.3); border-radius: 8px; padding: 12px; font-family: monospace; font-size: 0.72rem; max-height: 180px; overflow-y: auto; color: #10b981; margin-bottom: 16px;">
              <div style="color: #6b7280; margin-bottom: 4px;">=== PROCESO DE LIMPIEZA DE FIREBASE EN CURSO ===</div>
            </div>

            <!-- Results Summary Table (Populated on completion) -->
            <div id="modal-result-summary" style="display: none; background: rgba(16, 185, 129, 0.06); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 14px; margin-bottom: 16px;">
              <h4 style="font-size: 0.9rem; font-weight: 700; color: #10b981; margin: 0 0 10px 0;">🎉 ¡Reinicio Completado con Éxito!</h4>
              <div id="result-metrics-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; font-size: 0.75rem; color: #e5e7eb;"></div>
            </div>

            <!-- Footer Stage 2 -->
            <div style="display: flex; justify-content: flex-end;">
              <button id="modal-finish-btn" class="btn btn-primary btn-md" disabled style="opacity: 0.5;">Procesando...</button>
            </div>
          </div>

        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const overlay = document.getElementById('production-reset-modal');
    const closeBtn = document.getElementById('modal-close-btn');
    const cancelBtn = document.getElementById('modal-cancel-btn');
    const downloadBackupBtn = document.getElementById('modal-download-backup-btn');
    const confirmInput = document.getElementById('modal-confirm-input');
    const confirmCheckbox = document.getElementById('modal-confirm-checkbox');
    const startPurgeBtn = document.getElementById('modal-start-purge-btn');

    const stage1 = document.getElementById('reset-stage-1');
    const stage2 = document.getElementById('reset-stage-2');

    const progressStageTitle = document.getElementById('progress-stage-title');
    const progressPercent = document.getElementById('progress-percent');
    const progressBarFill = document.getElementById('progress-bar-fill');
    const progressDetailText = document.getElementById('progress-detail-text');
    const modalLogConsole = document.getElementById('modal-log-console');
    const resultSummary = document.getElementById('modal-result-summary');
    const resultMetricsGrid = document.getElementById('result-metrics-grid');
    const finishBtn = document.getElementById('modal-finish-btn');

    const closeModal = () => overlay.remove();

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    downloadBackupBtn.addEventListener('click', () => this.handleDownloadBackup());

    // Validation logic for Stage 1
    const validateInputs = () => {
      const val = confirmInput.value.trim().toUpperCase();
      const textValid = val === 'REINICIAR-PRODUCCION' || val === '1+1';
      const checkValid = confirmCheckbox.checked;

      const isValid = textValid && checkValid;
      startPurgeBtn.disabled = !isValid;
      startPurgeBtn.style.opacity = isValid ? '1' : '0.5';
      startPurgeBtn.style.cursor = isValid ? 'pointer' : 'not-allowed';
    };

    confirmInput.addEventListener('input', validateInputs);
    confirmCheckbox.addEventListener('change', validateInputs);

    // Execution Stage 2
    startPurgeBtn.addEventListener('click', async () => {
      stage1.style.display = 'none';
      stage2.style.display = 'block';

      const appendModalLog = (msg, isError = false) => {
        const time = new Date().toLocaleTimeString();
        const div = document.createElement('div');
        div.style.color = isError ? '#ef4444' : '#10b981';
        div.textContent = `[${time}] ${msg}`;
        modalLogConsole.appendChild(div);
        modalLogConsole.scrollTop = modalLogConsole.scrollHeight;
      };

      try {
        const result = await AuthService.purgeAllTestDataExceptSuperAdmin((stage, percent, msg) => {
          progressStageTitle.textContent = stage;
          progressPercent.textContent = `${percent}%`;
          progressBarFill.style.width = `${percent}%`;
          progressDetailText.textContent = msg;
          appendModalLog(msg);
        });

        // Display itemized result metrics
        resultSummary.style.display = 'block';
        const c = result.collectionCounts || {};
        resultMetricsGrid.innerHTML = `
          <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px;">👥 <strong>${result.deletedUsersCount}</strong> Usuarios elim.</div>
          <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px;">🏢 <strong>${result.deletedCompaniesCount}</strong> Empresas elim.</div>
          <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px;">📦 <strong>${c.productos || 0}</strong> Productos</div>
          <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px;">📂 <strong>${c.categorias || 0}</strong> Categorías</div>
          <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px;">🧾 <strong>${c.pedidos || 0}</strong> Pedidos</div>
          <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px;">🪑 <strong>${c.mesas || 0}</strong> Mesas</div>
          <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px;">📲 <strong>${c.codigos_qr || 0}</strong> Códigos QR</div>
          <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px;">🛡️ <strong>${result.keptProgrammersCount}</strong> Programadores</div>
        `;

        finishBtn.disabled = false;
        finishBtn.style.opacity = '1';
        finishBtn.textContent = '🎉 Entendido - Cerrar';
        finishBtn.addEventListener('click', closeModal);

        NotificationService.success('¡Reinicio para producción completado exitosamente!');
      } catch (err) {
        console.error('[SettingsView Modal] Error en purga:', err);
        appendModalLog(`💥 ERROR EN REINICIO: ${err.message || err}`, true);
        progressStageTitle.textContent = '❌ Error';
        progressStageTitle.style.color = '#ef4444';
        progressDetailText.textContent = `Proceso detenido: ${err.message || err}`;

        finishBtn.disabled = false;
        finishBtn.style.opacity = '1';
        finishBtn.textContent = 'Cerrar';
        finishBtn.classList.replace('btn-primary', 'btn-secondary');
        finishBtn.addEventListener('click', closeModal);
      }
    });
  }

  unmount() {
    this.layout.unmount();
    super.unmount();
  }
}


