/**
 * @file forgot-password.view.js
 * @description Password recovery view for email reset requests.
 */

import { Component } from '../../../core/component.js';
import { AuthService } from '../../../services/auth.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { ErrorHandler } from '../../../core/error-handler.js';
import { isValidEmail } from '../../../utils/validators.js';

export class ForgotPasswordView extends Component {
  constructor(params = {}) {
    super(params);
    this.state = { loading: false, sent: false };
  }

  render() {
    const { loading, sent } = this.state;

    if (sent) {
      return `
        <div class="login-page" style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--color-bg-primary); padding: var(--space-4);">
          <div class="animate-scale-up card" style="max-width: 420px; width: 100%; padding: var(--space-8); text-align: center;">
            <div style="font-size: 3rem; margin-bottom: var(--space-4);">📧</div>
            <h2 style="font-family: var(--font-display); font-weight: 700; margin-bottom: var(--space-2);">Revisa tu correo</h2>
            <p style="color: var(--color-text-secondary); font-size: 0.875rem; margin-bottom: var(--space-6);">
              Hemos enviado un enlace de recuperación a tu correo. Por favor revisa también tu carpeta de spam.
            </p>
            <a href="#/login" class="btn btn-secondary btn-md" style="display: block;">
              Volver al inicio de sesión
            </a>
          </div>
        </div>
      `;
    }

    return `
      <div class="login-page" style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--color-bg-primary); padding: var(--space-4);">
        <div style="width: 100%; max-width: 420px;" class="animate-slide-up">
          <div style="text-align: center; margin-bottom: var(--space-8);">
            <h1 style="font-family: var(--font-display); font-size: 1.5rem; font-weight: 700; color: var(--color-text-primary); margin-bottom: var(--space-2);">Recuperar contraseña</h1>
            <p style="color: var(--color-text-secondary); font-size: 0.875rem;">Ingresa tu correo y te enviaremos un enlace de recuperación.</p>
          </div>
          <div class="card" style="padding: var(--space-6);">
            <form id="forgot-form">
              <div class="form-group">
                <label class="form-label" for="forgot-email">Correo electrónico</label>
                <input type="email" id="forgot-email" class="input input-md" placeholder="correo@empresa.com" />
                <p class="form-helper error" id="forgot-email-error" style="display: none;"></p>
              </div>
              <button type="submit" id="forgot-submit-btn" class="btn btn-primary btn-md" style="width: 100%;" ${loading ? 'disabled' : ''}>
                ${loading ? 'Enviando...' : 'Enviar enlace'}
              </button>
            </form>
            <div style="text-align: center; margin-top: var(--space-4);">
              <a href="#/login" style="font-size: 0.875rem; color: var(--color-accent); text-decoration: none;">← Volver al inicio</a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  afterMount() {
    const form = this.$('#forgot-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = this.$('#forgot-email')?.value.trim() || '';
      const emailError = this.$('#forgot-email-error');
      const submitBtn = this.$('#forgot-submit-btn');

      emailError.style.display = 'none';

      if (!isValidEmail(email)) {
        emailError.textContent = 'Ingresa un correo válido';
        emailError.style.display = 'block';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';

      try {
        await AuthService.sendPasswordReset(email);
        this.setState({ sent: true });
      } catch (error) {
        ErrorHandler.handleError(error, 'ForgotPasswordView');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar enlace';
      }
    });
  }
}
