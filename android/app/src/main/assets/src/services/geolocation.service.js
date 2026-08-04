import { FirestoreService } from './firestore.service.js';
import { GlobalStore } from '../core/state.js';
import { TimeService } from './time.service.js';
import { Modal } from '../components/ui/modal.js';
import { NotificationService } from './notification.service.js';

export class GeolocationService {
  static watchId = null;

  static async updateStatus(status) {
    const { currentUser } = GlobalStore.getState();
    if (!currentUser?.companyId || !currentUser?.uid) {
      throw new Error('No hay sesión activa para actualizar ubicación.');
    }

    await FirestoreService.updatePath(`${currentUser.companyId}/employee_locations/${currentUser.uid}`, {
      status,
      updatedAt: TimeService.timestamp()
    });
  }

  static startTracking({ status = 'DISPONIBLE', onUpdate, onError } = {}) {
    if (!navigator.geolocation) {
      const err = new Error('Este navegador no soporta geolocalización.');
      if (onError) onError(err);
      return null;
    }

    const { currentUser } = GlobalStore.getState();
    if (!currentUser?.companyId || !currentUser?.uid) {
      const err = new Error('No hay sesión activa para registrar ubicación.');
      if (onError) onError(err);
      return null;
    }

    // Exclude owner, manager, and super admin roles from tracking
    const allowedRoles = ['WAITER', 'CASHIER', 'KITCHEN'];
    if (!allowedRoles.includes(currentUser.role)) {
      const err = new Error('El seguimiento de ubicación no está habilitado para tu rol.');
      if (onError) onError(err);
      return null;
    }

    this.stopTracking();
    this.watchId = navigator.geolocation.watchPosition(async (position) => {
      const payload = {
        employeeId: currentUser.uid,
        displayName: currentUser.displayName || currentUser.email || '',
        email: currentUser.email || '',
        status,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        speed: position.coords.speed || 0,
        heading: position.coords.heading || null,
        consentGranted: true,
        updatedAt: TimeService.timestamp()
      };

      await FirestoreService.updatePath(`${currentUser.companyId}/employee_locations/${currentUser.uid}`, payload);
      await FirestoreService.create('employee_location_history', payload);
      if (onUpdate) onUpdate(payload);
    }, (err) => {
      // Immediately stop tracking and update settings on error (e.g. if GPS is disabled)
      // to prevent loop spam of error notifications.
      this.stopTracking();
      localStorage.setItem('ua_gps_enabled', 'false');
      window.dispatchEvent(new CustomEvent('ua_gps_changed', { detail: { active: false } }));

      if (onError) onError(err);
    }, {
      enableHighAccuracy: true,
      maximumAge: 0, // Request direct precise location (disable cached location)
      timeout: 15000
    });

    return this.watchId;
  }

  static stopTracking() {
    if (this.watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  /**
   * Auto-resume tracking if previously enabled, or prompt modal to employee if GPS is inactive.
   */
  static checkAndPromptGPS() {
    const { currentUser } = GlobalStore.getState();
    
    // Explicitly restrict GPS prompting/tracking to active operational employees only
    const validEmployeeRoles = ['WAITER', 'CASHIER', 'KITCHEN'];
    if (!currentUser || !validEmployeeRoles.includes(currentUser.role)) {
      return;
    }

    // Never prompt on customer-facing routes
    if (window.location.hash.startsWith('#/customer')) {
      return;
    }

    // If already actively watching, no action needed
    if (this.watchId) return;

    const isEnabled = localStorage.getItem('ua_gps_enabled') === 'true';
    if (isEnabled) {
      console.log('[GPS] Auto-resuming GPS tracking from previous session...');
      this.startTracking({
        status: 'DISPONIBLE',
        onUpdate: () => console.log('[GPS] Location updated.'),
        onError: (err) => console.warn('[GPS] Error:', err.message)
      });
      return;
    }

    // If not enabled and prompt was not dismissed in this session, show prompt modal
    if (!sessionStorage.getItem('ua_gps_prompt_dismissed')) {
      setTimeout(() => this.showGpsPromptModal(), 1200);
    }
  }

  /**
   * Renders a modal prompting the employee to activate GPS location.
   */
  static showGpsPromptModal() {
    const modal = new Modal({
      title: '📍 Activar Ubicación GPS',
      bodyHTML: `
        <div style="text-align: center; padding: var(--space-4);">
          <div style="font-size: 3rem; margin-bottom: var(--space-3); color: var(--color-accent);">🛰️</div>
          <h3 class="font-bold text-lg mb-2">Seguimiento de Ubicación Laboral</h3>
          <p class="text-secondary mb-4" style="font-size: 0.9rem; line-height: 1.5;">
            Para un mejor control del servicio y registro de atención en el establecimiento, se requiere activar tu ubicación GPS durante tu jornada laboral.
          </p>
          <div style="background: var(--color-bg-tertiary); border: 1px solid var(--color-border); padding: 12px; border-radius: var(--radius-md); text-align: left; font-size: 0.8rem; color: var(--color-text-secondary);">
            🔒 Tu ubicación sólo se actualiza mientras estás conectado al sistema. Puedes activarla o desactivarla en cualquier momento desde el botón en la barra superior.
          </div>
        </div>
      `,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-gps-dismiss">Omitir por ahora</button>
        <button class="btn btn-primary btn-sm" id="btn-gps-enable">📍 Activar GPS Ahora</button>
      `,
      size: 'md'
    });

    const el = modal.mount();
    document.body.appendChild(el);

    el.querySelector('#btn-gps-dismiss')?.addEventListener('click', () => {
      sessionStorage.setItem('ua_gps_prompt_dismissed', 'true');
      modal.close();
    });

    el.querySelector('#btn-gps-enable')?.addEventListener('click', () => {
      let notified = false;
      this.startTracking({
        status: 'DISPONIBLE',
        onUpdate: () => {
          if (!notified) {
            NotificationService.success('📍 Ubicación GPS activada correctamente.');
            notified = true;
          }
        },
        onError: (err) => NotificationService.error(err.message || 'No se pudo obtener la ubicación GPS.')
      });
      localStorage.setItem('ua_gps_enabled', 'true');
      modal.close();
      // Dispatch custom event so Header updates button state
      window.dispatchEvent(new CustomEvent('ua_gps_changed', { detail: { active: true } }));
    });
  }
}

