/**
 * @file login.view.js
 * @description Login view — Premium full-screen auth page with email/password form.
 */

import { Component } from '../../../core/component.js';
import { AuthService } from '../../../services/auth.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { ErrorHandler } from '../../../core/error-handler.js';
import { GlobalStore } from '../../../core/state.js';
import { redirectUserDashboard } from '../../../core/middleware.js';
import { isValidEmail } from '../../../utils/validators.js';
import { APP_CONFIG } from '../../../config/app.config.js';

export class LoginView extends Component {
  constructor(params = {}) {
    super(params);
    this.state = { loading: false, errors: {} };
  }

  render() {
    const { loading } = this.state;

    return `
      <div class="login-page" style="
        min-height: 100vh;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-bg-primary);
        padding: var(--space-4);
      ">
        <!-- Background subtle gradient -->
        <div style="
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: radial-gradient(ellipse 80% 60% at 50% -20%, var(--color-accent-light), transparent);
          pointer-events: none;
          z-index: 0;
        "></div>

        <div class="animate-slide-up" style="
          width: 100%;
          max-width: 420px;
          position: relative;
          z-index: 1;
        ">
          <!-- Logo / Brand -->
          <div style="text-align: center; margin-bottom: var(--space-8);">
            <div style="
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: 56px;
              height: 56px;
              border-radius: var(--radius-lg);
              background: var(--color-accent);
              margin-bottom: var(--space-4);
              font-size: 1.75rem;
            ">🍽️</div>
            <h1 style="
              font-family: var(--font-display);
              font-size: 1.5rem;
              font-weight: 700;
              color: var(--color-text-primary);
              margin: 0 0 var(--space-1);
            ">${APP_CONFIG.name}</h1>
            <p style="color: var(--color-text-secondary); font-size: 0.875rem; margin: 0;">
              Accede a tu panel de administración
            </p>
          </div>

          <!-- Login Card -->
          <div class="card" style="padding: var(--space-6);">
            <form id="login-form" novalidate>
              <div class="form-group">
                <label class="form-label" for="login-email">Correo electrónico</label>
                <input
                  type="email"
                  id="login-email"
                  class="input input-md"
                  placeholder="correo@empresa.com"
                  autocomplete="email"
                  required
                />
                <p class="form-helper error" id="email-error" style="display: none;"></p>
              </div>

              <div class="form-group">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <label class="form-label" for="login-password">Contraseña</label>
                  <a href="#/forgot-password" style="font-size: 0.75rem; color: var(--color-accent); text-decoration: none;">
                    ¿Olvidaste tu contraseña?
                  </a>
                </div>
                <input
                  type="password"
                  id="login-password"
                  class="input input-md"
                  placeholder="••••••••"
                  autocomplete="current-password"
                  required
                />
                <p class="form-helper error" id="password-error" style="display: none;"></p>
              </div>

              <button
                type="submit"
                id="login-submit-btn"
                class="btn btn-primary btn-md w-full"
                style="width: 100%; margin-top: var(--space-2);"
                ${loading ? 'disabled' : ''}
              >
                ${loading ? 'Accediendo...' : 'Iniciar sesión'}
              </button>
            </form>
          </div>

          <!-- Demo hint -->
          <p style="text-align: center; font-size: 0.75rem; color: var(--color-text-tertiary); margin-top: var(--space-4);">
            Demo: admin@admin.com / cualquier contraseña
          </p>
        </div>
      </div>
    `;
  }

  afterMount() {
    const form = this.$('#login-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleLogin();
    });
  }

  async handleLogin() {
    const emailInput = this.$('#login-email');
    const passwordInput = this.$('#login-password');
    const submitBtn = this.$('#login-submit-btn');
    const emailError = this.$('#email-error');
    const passwordError = this.$('#password-error');

    const email = emailInput?.value.trim() || '';
    const password = passwordInput?.value || '';

    // Reset errors
    emailError.style.display = 'none';
    passwordError.style.display = 'none';
    emailInput?.classList.remove('input-error');
    passwordInput?.classList.remove('input-error');

    // Validate
    let isValid = true;

    if (!isValidEmail(email)) {
      emailError.textContent = 'Ingresa un correo electrónico válido';
      emailError.style.display = 'block';
      emailInput?.classList.add('input-error');
      isValid = false;
    }

    if (!password || password.length < 6) {
      passwordError.textContent = 'La contraseña debe tener al menos 6 caracteres';
      passwordError.style.display = 'block';
      passwordInput?.classList.add('input-error');
      isValid = false;
    }

    if (!isValid) return;

    // Submit
    submitBtn.disabled = true;
    submitBtn.textContent = 'Accediendo...';

    try {
      const user = await AuthService.login(email, password);
      NotificationService.success(`Bienvenido, ${user.displayName}`);

      // Redirect to role-based dashboard
      const { Router } = await import('../../../core/router.js');
      redirectUserDashboard(user.role, { navigate: (path) => { window.location.hash = path; } });
    } catch (error) {
      ErrorHandler.handleError(error, 'LoginView');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Iniciar sesión';
    }
  }
}
