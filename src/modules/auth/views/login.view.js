/**
 * @file login.view.js
 * @description Login view — Premium full-screen auth page with email/password form.
 *             Also includes a hidden developer/superadmin registration panel
 *             protected by a secret access key.
 */

import { Component } from '../../../core/component.js';
import { AuthService } from '../../../services/auth.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { ErrorHandler } from '../../../core/error-handler.js';
import { GlobalStore } from '../../../core/state.js';
import { redirectUserDashboard } from '../../../core/middleware.js';
import { isValidEmail } from '../../../utils/validators.js';
import { APP_CONFIG } from '../../../config/app.config.js';
import { AnimationService } from '../../../services/animation.service.js';
import gsap from 'gsap';

// ─── Developer Registration Secret Key ───────────────────────────────────────
// Change this to any secret code only you know.
// Anyone who doesn't have this key cannot register a new SuperAdmin from login.
const DEV_SECRET_KEY = 'ultra-dev-2025';
// ─────────────────────────────────────────────────────────────────────────────

export class LoginView extends Component {
  constructor(params = {}) {
    super(params);
    this.state = { loading: false, errors: {}, showDevPanel: false, devRegistering: false };
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
        <!-- Three.js 3D Background Container -->
        <div id="three-bg-container" style="
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: radial-gradient(ellipse 80% 60% at 50% -20%, var(--color-accent-light), transparent);
          z-index: 0;
          overflow: hidden;
        "></div>

        <div class="login-card-anim" style="
          width: 100%;
          max-width: 420px;
          position: relative;
          z-index: 1;
        ">
          <!-- Logo / Brand -->
          <div style="text-align: center; margin-bottom: var(--space-8);">
            <div class="hero-logo" style="
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
            <h1 class="hero-title" style="
              font-family: var(--font-display);
              font-size: 1.5rem;
              font-weight: 700;
              color: var(--color-text-primary);
              margin: 0 0 var(--space-1);
            ">${APP_CONFIG.name}</h1>
            <p class="hero-subtitle" style="color: var(--color-text-secondary); font-size: 0.875rem; margin: 0;">
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

          <!-- Developer Panel Toggle Link -->
          <div style="text-align: center; margin-top: var(--space-4);">
            <button
              id="btn-toggle-dev-panel"
              style="
                background: none;
                border: none;
                color: var(--color-text-tertiary);
                font-size: 0.7rem;
                cursor: pointer;
                opacity: 0.4;
                letter-spacing: 0.05em;
                transition: opacity 0.2s;
                padding: 4px 8px;
              "
              onmouseover="this.style.opacity='1'"
              onmouseout="this.style.opacity='0.4'"
              title="Acceso para desarrolladores del sistema"
            >
              ⌨️ Acceso Programador
            </button>
          </div>

          <!-- Developer Registration Panel (hidden by default) -->
          <div id="dev-registration-panel" style="
            display: none;
            margin-top: var(--space-4);
            animation: slideDown 0.3s ease forwards;
          ">
            <div class="card" style="
              padding: var(--space-6);
              border: 1px solid rgba(139, 92, 246, 0.35);
              background: linear-gradient(135deg, rgba(139,92,246,0.08), rgba(0,0,0,0));
            ">
              <!-- Header -->
              <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-4);">
                <span style="font-size: 1.2rem;">🔐</span>
                <div>
                  <h3 style="margin: 0; font-size: 0.95rem; color: var(--color-accent); font-weight: 700;">
                    Registro de Programador
                  </h3>
                  <p style="margin: 0; font-size: 0.7rem; color: var(--color-text-tertiary);">
                    Acceso restringido al equipo de desarrollo
                  </p>
                </div>
              </div>

              <form id="dev-register-form" novalidate>
                <!-- Secret Key -->
                <div class="form-group" style="margin-bottom: var(--space-3);">
                  <label class="form-label" for="dev-secret" style="font-size: 0.75rem;">
                    🗝️ Clave Secreta de Acceso
                  </label>
                  <input
                    type="password"
                    id="dev-secret"
                    class="input input-md"
                    placeholder="Clave de programador"
                    autocomplete="off"
                    style="font-family: monospace; letter-spacing: 0.1em;"
                  />
                  <p class="form-helper error" id="dev-secret-error" style="display: none; font-size: 0.7rem;">
                    Clave incorrecta. Acceso denegado.
                  </p>
                </div>

                <!-- Name -->
                <div class="form-group" style="margin-bottom: var(--space-3);">
                  <label class="form-label" for="dev-name" style="font-size: 0.75rem;">
                    Nombre Completo
                  </label>
                  <input
                    type="text"
                    id="dev-name"
                    class="input input-md"
                    placeholder="Ej. Desarrollador Principal"
                    autocomplete="off"
                  />
                </div>

                <!-- Email -->
                <div class="form-group" style="margin-bottom: var(--space-3);">
                  <label class="form-label" for="dev-email" style="font-size: 0.75rem;">
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    id="dev-email"
                    class="input input-md"
                    placeholder="dev@tudominio.com"
                    autocomplete="off"
                  />
                  <p class="form-helper error" id="dev-email-error" style="display: none; font-size: 0.7rem;"></p>
                </div>

                <!-- Password -->
                <div class="form-group" style="margin-bottom: var(--space-4);">
                  <label class="form-label" for="dev-password" style="font-size: 0.75rem;">
                    Contraseña (mín. 8 caracteres)
                  </label>
                  <input
                    type="password"
                    id="dev-password"
                    class="input input-md"
                    placeholder="••••••••"
                    minlength="8"
                    autocomplete="new-password"
                  />
                  <p class="form-helper error" id="dev-password-error" style="display: none; font-size: 0.7rem;"></p>
                </div>

                <button
                  type="submit"
                  id="btn-dev-register"
                  class="btn btn-primary btn-md"
                  style="width: 100%; background: linear-gradient(135deg, #7c3aed, #8b5cf6);"
                >
                  ⚡ Crear Cuenta SuperAdmin
                </button>
              </form>
            </div>
          </div>

        </div>
      </div>

      <style>
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
      </style>
    `;
  }

  afterMount() {
    // If user is already authenticated, redirect them automatically to their dashboard
    const currentUser = GlobalStore.getState().currentUser;
    if (currentUser) {
      console.log('[LoginView] User is already authenticated. Redirecting to dashboard...');
      redirectUserDashboard(currentUser.role, { navigate: (path) => { window.location.hash = path; } });
      return;
    }

    // ── Three.js & GSAP Premium Animations ───────────────────────────────────
    this.cleanupThree = AnimationService.initThreeDBackground(this.$('#three-bg-container'));

    // Hero & Form elements entry stagger animation with GSAP
    gsap.fromTo(this.$('.hero-logo'),
      { scale: 0, rotation: -45, opacity: 0 },
      { scale: 1, rotation: 0, opacity: 1, duration: 0.8, ease: 'back.out(1.7)' }
    );

    gsap.fromTo([this.$('.hero-title'), this.$('.hero-subtitle')],
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.7, stagger: 0.12, ease: 'power3.out', delay: 0.2 }
    );

    gsap.fromTo(this.$('.login-card-anim'),
      { opacity: 0, y: 40, scale: 0.97 },
      { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: 'power4.out', delay: 0.4 }
    );

    gsap.fromTo(this.$$('#login-form .form-group'),
      { opacity: 0, y: 15 },
      { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: 'power2.out', delay: 0.6 }
    );

    gsap.fromTo(this.$('#login-submit-btn'),
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', delay: 0.8 }
    );

    // ── Login Form ──────────────────────────────────────────────────────────
    const form = this.$('#login-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleLogin();
      });
    }

    // ── Developer Panel Toggle ──────────────────────────────────────────────
    const toggleBtn = this.$('#btn-toggle-dev-panel');
    const devPanel  = this.$('#dev-registration-panel');

    if (toggleBtn && devPanel) {
      toggleBtn.addEventListener('click', () => {
        const isHidden = devPanel.style.display === 'none';
        devPanel.style.display = isHidden ? 'block' : 'none';
        toggleBtn.style.opacity = isHidden ? '1' : '0.4';
        toggleBtn.textContent   = isHidden ? '✖ Cerrar Panel' : '⌨️ Acceso Programador';
      });
    }

    // ── Developer Registration Form ─────────────────────────────────────────
    const devForm = this.$('#dev-register-form');
    if (devForm) {
      devForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleDevRegister();
      });
    }
  }

  // ── Login Handler ─────────────────────────────────────────────────────────
  async handleLogin() {
    const emailInput    = this.$('#login-email');
    const passwordInput = this.$('#login-password');
    const submitBtn     = this.$('#login-submit-btn');
    const emailError    = this.$('#email-error');
    const passwordError = this.$('#password-error');

    const email    = emailInput?.value.trim() || '';
    const password = passwordInput?.value || '';

    emailError.style.display    = 'none';
    passwordError.style.display = 'none';
    emailInput?.classList.remove('input-error');
    passwordInput?.classList.remove('input-error');

    let isValid = true;

    if (!isValidEmail(email)) {
      emailError.textContent    = 'Ingresa un correo electrónico válido';
      emailError.style.display  = 'block';
      emailInput?.classList.add('input-error');
      isValid = false;
    }

    if (!password || password.length < 6) {
      passwordError.textContent   = 'La contraseña debe tener al menos 6 caracteres';
      passwordError.style.display = 'block';
      passwordInput?.classList.add('input-error');
      isValid = false;
    }

    if (!isValid) return;

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Accediendo...';

    try {
      const user = await AuthService.login(email, password);
      NotificationService.success(`Bienvenido, ${user.displayName}`);
      redirectUserDashboard(user.role, { navigate: (path) => { window.location.hash = path; } });
    } catch (error) {
      ErrorHandler.handleError(error, 'LoginView');
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Iniciar sesión';
    }
  }

  // ── Developer Registration Handler ────────────────────────────────────────
  async handleDevRegister() {
    const secretInput   = this.$('#dev-secret');
    const nameInput     = this.$('#dev-name');
    const emailInput    = this.$('#dev-email');
    const passInput     = this.$('#dev-password');
    const submitBtn     = this.$('#btn-dev-register');
    const secretError   = this.$('#dev-secret-error');
    const emailError    = this.$('#dev-email-error');
    const passError     = this.$('#dev-password-error');

    // Reset errors
    [secretError, emailError, passError].forEach(el => el && (el.style.display = 'none'));

    const secret   = secretInput?.value || '';
    const name     = nameInput?.value.trim() || 'Programador';
    const email    = emailInput?.value.trim() || '';
    const password = passInput?.value || '';

    let isValid = true;

    // 1. Validate secret key
    if (secret !== DEV_SECRET_KEY) {
      secretError.style.display = 'block';
      secretInput?.classList.add('input-error');
      secretInput?.focus();
      isValid = false;
    }

    // 2. Validate email
    if (!isValidEmail(email)) {
      emailError.textContent   = 'Ingresa un correo electrónico válido';
      emailError.style.display = 'block';
      emailInput?.classList.add('input-error');
      isValid = false;
    }

    // 3. Validate password length
    if (!password || password.length < 8) {
      passError.textContent   = 'La contraseña debe tener al menos 8 caracteres';
      passError.style.display = 'block';
      passInput?.classList.add('input-error');
      isValid = false;
    }

    if (!isValid) return;

    submitBtn.disabled    = true;
    submitBtn.textContent = '⚙️ Registrando en la nube...';

    try {
      await AuthService.createUser(email, password, {
        displayName: name,
        role: 'SUPER_ADMIN',
        companyId: 'global',
        branchId: 'global'
      });

      NotificationService.success(`✅ Cuenta "${name}" creada. Ya puedes iniciar sesión.`);

      // Auto-fill login form with new credentials
      const loginEmailInput = this.$('#login-email');
      if (loginEmailInput) loginEmailInput.value = email;

      // Close dev panel
      const devPanel  = this.$('#dev-registration-panel');
      const toggleBtn = this.$('#btn-toggle-dev-panel');
      if (devPanel)  devPanel.style.display  = 'none';
      if (toggleBtn) toggleBtn.textContent   = '⌨️ Acceso Programador';

      // Clear dev form
      nameInput  && (nameInput.value  = '');
      emailInput && (emailInput.value = '');
      passInput  && (passInput.value  = '');
      secretInput && (secretInput.value = '');

    } catch (err) {
      const message = err.message || 'Error desconocido al registrar la cuenta.';
      passError.textContent   = message;
      passError.style.display = 'block';
      console.error('[LoginView] Dev register error:', err);
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = '⚡ Crear Cuenta SuperAdmin';
    }
  }

  unmount() {
    if (typeof this.cleanupThree === 'function') {
      this.cleanupThree();
    }
    super.unmount();
  }
}
