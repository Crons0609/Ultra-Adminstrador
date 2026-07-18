import { FirestoreService } from './firestore.service.js';
import { GlobalStore } from '../core/state.js';
import { TimeService } from './time.service.js';

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
      if (onError) onError(err);
    }, {
      enableHighAccuracy: true,
      maximumAge: 30000,
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
}
