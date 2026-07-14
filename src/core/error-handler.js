/**
 * @file error-handler.js
 * @description Centralized error handler to catch exceptions, database issues, or network failures.
 */

import { NotificationService } from '../services/notification.service.js';

export class ErrorHandler {
  /**
   * Log error details to console and show warning UI message.
   * @param {Error|string} error 
   * @param {string} context - Where the error happened, e.g., 'AuthService'
   */
  static handleError(error, context = 'Application') {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';

    console.error(`[Error][${context}]: ${errorMessage}`, errorStack);

    // Dynamic error translation for common firebase issues
    let friendlyMessage = 'Ocurrió un error inesperado. Inténtelo más tarde.';
    
    if (errorMessage.includes('permission-denied')) {
      friendlyMessage = 'No tiene permisos suficientes para realizar esta acción.';
    } else if (errorMessage.includes('network-request-failed')) {
      friendlyMessage = 'Fallo de conexión. Revise su acceso a internet.';
    } else if (errorMessage.includes('auth/user-not-found') || errorMessage.includes('auth/wrong-password')) {
      friendlyMessage = 'Credenciales inválidas. Revise su correo y contraseña.';
    } else if (errorMessage.includes('auth/email-already-in-use')) {
      friendlyMessage = 'Este correo electrónico ya está registrado.';
    }

    // Try to trigger toast notification
    try {
      NotificationService.error(friendlyMessage);
    } catch (notificationError) {
      // Fallback alert if NotificationService is not ready
      alert(`Error [${context}]: ${friendlyMessage}`);
    }

    // Optional: Send report log to Firestore or Cloud Functions in production
    this.reportErrorToBackend(errorMessage, context, errorStack);
  }

  /**
   * Send error report to Firebase analytics or DB (for SuperAdmin debugging).
   */
  static async reportErrorToBackend(message, context, stack) {
    // This will be implemented in DB/Firestore Phase
    // For now we just print to console
    const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    if (isProduction) {
      console.log('Reporting error to centralized logs...', { message, context });
    }
  }
}
