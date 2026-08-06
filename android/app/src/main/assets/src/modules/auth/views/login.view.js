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
import { SavedAccountsService } from '../../../services/saved-accounts.service.js';
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
              width: 84px;
              height: 84px;
              border-radius: var(--radius-xl);
              background: rgba(255,255,255,0.03);
              border: 1px solid rgba(255,255,255,0.1);
              padding: 10px;
              margin-bottom: var(--space-3);
              box-shadow: 0 8px 24px rgba(0,0,0,0.3);
            ">
              <img src="/assets/logo_ultra_administrador.png" 
                   alt="Ultra Administrador" 
                   onerror="if(!this.dataset.tried){this.dataset.tried='1';this.src='assets/logo_ultra_administrador.png';}else if(this.dataset.tried==='1'){this.dataset.tried='2';this.src='logo_ultra_administrador.png';}else if(this.dataset.tried==='2'){this.dataset.tried='3';this.src='/logo_ultra_administrador.png';}" 
                   style="width: 100%; height: 100%; object-fit: contain;" />
            </div>
            <h1 class="hero-title" style="
              font-family: var(--font-display);
              font-size: 1.6rem;
              font-weight: 800;
              color: var(--color-text-primary);
              margin: 0 0 var(--space-1);
              letter-spacing: -0.02em;
            ">${APP_CONFIG.name}</h1>
            <p class="hero-subtitle" style="color: var(--color-text-secondary); font-size: 0.85rem; margin: 0;">
              Accede a tu panel de administración
            </p>
          </div>

          <!-- Login Card -->
          <div class="card" style="padding: var(--space-6);">
            <!-- Dynamic Lockout Alert Banner -->
            <div id="login-alert" style="display: none; margin-bottom: var(--space-4);"></div>

            <!-- Saved Accounts Quick Selector -->
            <div id="saved-accounts-login-container"></div>

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
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <label class="form-label" for="login-password" style="margin-bottom: 0;">Contraseña</label>
                  <a href="#/forgot-password" style="font-size: 0.75rem; color: var(--color-accent); text-decoration: none;">
                    ¿Olvidaste tu contraseña?
                  </a>
                </div>
                <div style="position: relative; display: flex; align-items: center;">
                  <input
                    type="password"
                    id="login-password"
                    class="input input-md"
                    placeholder="••••••••"
                    autocomplete="current-password"
                    required
                    style="padding-right: 42px; width: 100%;"
                  />
                  <button
                    type="button"
                    id="btn-toggle-password"
                    style="
                      position: absolute;
                      right: 8px;
                      background: transparent;
                      border: none;
                      color: var(--color-text-secondary);
                      cursor: pointer;
                      padding: 6px 8px;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      font-size: 1.1rem;
                      border-radius: var(--radius-sm);
                      user-select: none;
                      transition: color 0.2s;
                    "
                    title="Mostrar contraseña"
                  >
                    👁️
                  </button>
                </div>
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

            <!-- Join as Business Owner Link -->
            <div style="text-align: center; margin-top: var(--space-5); padding-top: var(--space-4); border-top: 1px solid rgba(255,255,255,0.06);">
              <p style="font-size: 0.8rem; color: var(--color-text-tertiary); margin-bottom: 8px;">¿Eres dueño de un negocio y quieres unirte?</p>
              <button
                id="btn-show-owner-join"
                style="
                  background: none;
                  border: none;
                  color: var(--color-accent);
                  font-size: 0.85rem;
                  font-weight: 700;
                  cursor: pointer;
                  text-decoration: underline;
                "
              >
                Registrar mi Negocio
              </button>
            </div>
          </div>

          <!-- Business Owner Request Panel (hidden by default) -->
          <div id="owner-join-panel" style="
            display: none;
            margin-top: var(--space-4);
            animation: slideDown 0.3s ease forwards;
          ">
            <div class="card" style="
              padding: var(--space-6);
              border: 1px solid rgba(16, 185, 129, 0.35);
              background: linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(0,0,0,0));
            ">
              <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-4);">
                <span style="font-size: 1.2rem;">🏢</span>
                <div>
                  <h3 style="margin: 0; font-size: 0.95rem; color: #10b981; font-weight: 700;">
                    Solicitud de Nuevo Negocio
                  </h3>
                  <p style="margin: 0; font-size: 0.7rem; color: var(--color-text-tertiary);">
                    Tu solicitud será revisada por nuestro equipo técnico
                  </p>
                </div>
                <button id="btn-close-owner-join" style="margin-left: auto; background:none; border:none; color:#9ca3af; cursor:pointer; font-size:1.2rem;">&times;</button>
              </div>

              <form id="owner-join-form" novalidate>
                <div class="form-group" style="margin-bottom: var(--space-3);">
                  <label class="form-label" for="join-biz-name" style="font-size: 0.75rem;">Nombre del Negocio</label>
                  <input type="text" id="join-biz-name" class="input input-md" placeholder="Ej. Restaurante La Parrilla" required />
                </div>
                <div class="form-group" style="margin-bottom: var(--space-3);">
                  <label class="form-label" for="join-owner-name" style="font-size: 0.75rem;">Nombre del Propietario</label>
                  <input type="text" id="join-owner-name" class="input input-md" placeholder="Tu nombre completo" required />
                </div>
                <div class="form-group" style="margin-bottom: var(--space-3);">
                  <label class="form-label" for="join-email" style="font-size: 0.75rem;">Correo Electrónico</label>
                  <input type="email" id="join-email" class="input input-md" placeholder="tu@correo.com" required />
                </div>
                <div class="form-group" style="margin-bottom: var(--space-4);">
                  <label class="form-label" for="join-phone" style="font-size: 0.75rem;">Teléfono de Contacto</label>
                  <input type="tel" id="join-phone" class="input input-md" placeholder="+505 8888-8888" required />
                </div>

                <button
                  type="submit"
                  id="btn-submit-owner-join"
                  class="btn btn-primary btn-md"
                  style="width: 100%; background: linear-gradient(135deg, #10b981, #059669);"
                >
                  Enviar Solicitud de Registro
                </button>
              </form>
            </div>
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
                  <div style="position: relative; display: flex; align-items: center;">
                    <input
                      type="password"
                      id="dev-password"
                      class="input input-md"
                      placeholder="••••••••"
                      minlength="8"
                      autocomplete="new-password"
                      style="padding-right: 40px; width: 100%;"
                    />
                    <button
                      type="button"
                      id="btn-toggle-dev-password"
                      style="
                        position: absolute;
                        right: 8px;
                        background: transparent;
                        border: none;
                        color: var(--color-text-secondary);
                        cursor: pointer;
                        padding: 4px 6px;
                        font-size: 1rem;
                      "
                      title="Mostrar contraseña"
                    >
                      👁️
                    </button>
                  </div>
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

              <!-- Unlock tool for testing -->
              <div style="border-top: 1px dashed rgba(139,92,246,0.3); margin-top: 14px; padding-top: 10px; text-align: center;">
                <button
                  type="button"
                  id="btn-dev-unlock-account"
                  class="btn btn-secondary btn-sm"
                  style="font-size: 0.7rem; padding: 3px 8px; opacity: 0.8;"
                >
                  🔓 Desbloquear Intentos de Cuenta
                </button>
              </div>
            </div>
          </div>

          <!-- Login Footer Copyright -->
          <div style="text-align: center; margin-top: var(--space-6); font-size: 0.75rem; color: var(--color-text-tertiary);">
            <p style="margin: 0;">&copy; ${new Date().getFullYear()} <strong>Ultra Administrador</strong>. Todos los derechos reservados.</p>
            <p style="margin: 2px 0 0; opacity: 0.75;">Desarrollado por <strong style="color: var(--color-accent-light, #a78bfa);">ProLine System</strong></p>
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

    // ── Password Visibility Toggles ─────────────────────────────────────────
    const loginPassInput = this.$('#login-password');
    const toggleLoginPass = this.$('#btn-toggle-password');
    if (loginPassInput && toggleLoginPass) {
      toggleLoginPass.addEventListener('click', () => {
        const isPassword = loginPassInput.type === 'password';
        loginPassInput.type = isPassword ? 'text' : 'password';
        toggleLoginPass.textContent = isPassword ? '🙈' : '👁️';
        toggleLoginPass.title = isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña';
      });
    }

    const devPassInput = this.$('#dev-password');
    const toggleDevPass = this.$('#btn-toggle-dev-password');
    if (devPassInput && toggleDevPass) {
      toggleDevPass.addEventListener('click', () => {
        const isPassword = devPassInput.type === 'password';
        devPassInput.type = isPassword ? 'text' : 'password';
        toggleDevPass.textContent = isPassword ? '🙈' : '👁️';
        toggleDevPass.title = isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña';
      });
    }

    // ── Email Lockout Monitoring & URL Pre-fill ─────────────────────────────
    const emailInput = this.$('#login-email');
    const passInput  = this.$('#login-password');

    // Pre-fill email from URL if present (e.g., #/login?email=foo@bar.com)
    const hashQuery = window.location.hash.split('?')[1] || '';
    const urlParams = new URLSearchParams(hashQuery);
    const prefilledEmail = urlParams.get('email');
    if (prefilledEmail && emailInput) {
      emailInput.value = decodeURIComponent(prefilledEmail);
      this.checkLockoutStatus(emailInput.value);
    }

    if (emailInput) {
      const handleEmailChange = () => {
        const email = emailInput.value.trim();
        this.checkLockoutStatus(email);
      };
      emailInput.addEventListener('input', handleEmailChange);
      emailInput.addEventListener('blur', handleEmailChange);
      if (emailInput.value) handleEmailChange();
    }

    // ── Render Saved Accounts Quick Selector ─────────────────────────────────
    const savedAccounts = SavedAccountsService.getAll();
    const savedContainer = this.$('#saved-accounts-login-container');
    if (savedContainer && savedAccounts.length > 0) {
      savedContainer.innerHTML = `
        <div style="
          padding: 8px 12px; margin-bottom: 14px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
          border-radius: var(--radius-md);
        ">
          <div style="font-size: 0.72rem; color: var(--color-text-tertiary); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">
            Cuentas guardadas
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${savedAccounts.map(acc => `
              <button type="button" class="btn-saved-acc-chip" data-email="${acc.email}" style="
                display: inline-flex; align-items: center; gap: 6px;
                background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
                border-radius: 20px; padding: 4px 10px; cursor: pointer; color: var(--color-text-primary);
                font-size: 0.78rem; transition: background 0.2s;
              " onmouseover="this.style.background='rgba(139,92,246,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.06)'">
                <span style="width: 20px; height: 20px; border-radius: 50%; background: linear-gradient(135deg, #0891b2, #06b6d4); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.7rem;">${acc.initial}</span>
                <span>${acc.displayName}</span>
              </button>
            `).join('')}
          </div>
        </div>
      `;

      savedContainer.querySelectorAll('.btn-saved-acc-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          const email = btn.dataset.email;
          if (emailInput) {
            emailInput.value = email;
            this.checkLockoutStatus(email);
          }
          const savedPass = SavedAccountsService.getPassword(email);
          if (savedPass && passInput) {
            passInput.value = savedPass;
          } else if (passInput) {
            passInput.focus();
          }
        });
      });
    }

    // ── Login Form Submission ────────────────────────────────────────────────
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

    // ── Dev Unlock Tool Button ───────────────────────────────────────────────
    const unlockBtn = this.$('#btn-dev-unlock-account');
    if (unlockBtn) {
      unlockBtn.addEventListener('click', () => {
        const email = (emailInput?.value || '').trim();
        if (!email) {
          alert('Escribe el correo electrónico que deseas desbloquear en el campo de Login.');
          emailInput?.focus();
          return;
        }
        this.clearLockoutState(email);
        this.checkLockoutStatus(email);
        NotificationService.success(`Intentos reiniciados para: ${email}`);
      });
    }

    // ── Business Owner Join Panel Handlers ──────────────────────────────────
    const showJoinBtn = this.$('#btn-show-owner-join');
    const closeJoinBtn = this.$('#btn-close-owner-join');
    const joinPanel = this.$('#owner-join-panel');
    const joinForm = this.$('#owner-join-form');

    if (showJoinBtn && joinPanel) {
      showJoinBtn.addEventListener('click', () => {
        joinPanel.style.display = 'block';
        gsap.fromTo(joinPanel, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 });
        showJoinBtn.parentElement.style.display = 'none';
      });
    }

    if (closeJoinBtn && joinPanel) {
      closeJoinBtn.addEventListener('click', () => {
        joinPanel.style.display = 'none';
        if (showJoinBtn) showJoinBtn.parentElement.style.display = 'block';
      });
    }

    if (joinForm) {
      joinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleOwnerJoinSubmit();
      });
    }
  }

  async handleOwnerJoinSubmit() {
    const bizNameInput = this.$('#join-biz-name');
    const ownerNameInput = this.$('#join-owner-name');
    const emailInput = this.$('#join-email');
    const phoneInput = this.$('#join-phone');
    const submitBtn = this.$('#btn-submit-owner-join');

    const bizName = bizNameInput.value.trim();
    const ownerName = ownerNameInput.value.trim();
    const email = emailInput.value.trim();
    const phone = phoneInput.value.trim();

    if (!bizName || !ownerName || !email || !phone) {
      NotificationService.warn('Por favor completa todos los campos.');
      return;
    }

    if (!isValidEmail(email)) {
      NotificationService.error('Ingresa un correo electrónico válido.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando solicitud...';

    try {
      // Use FirestoreService to save a pending request
      // Since it's public, we might need a non-auth write path
      await AuthService.submitBusinessJoinRequest({
        bizName,
        ownerName,
        email,
        phone,
        status: 'PENDING',
        requestedAt: Date.now()
      });

      NotificationService.success('¡Solicitud enviada! Un programador revisará tu registro pronto.', 6000);

      // Close panel and reset form
      this.$('#owner-join-panel').style.display = 'none';
      this.$('#btn-show-owner-join').parentElement.style.display = 'block';
      this.$('#owner-join-form').reset();

    } catch (err) {
      console.error('[LoginView] Error submitting join request:', err);
      NotificationService.error('Error al enviar la solicitud. Intenta de nuevo más tarde.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar Solicitud de Registro';
    }
  }

  // ── Lockout Storage Helpers ───────────────────────────────────────────────
  getLockoutKey(email) {
    return `ultra_login_lockout_${(email || '').toLowerCase().trim()}`;
  }

  getLockoutState(email) {
    if (!email) return null;
    try {
      const raw = localStorage.getItem(this.getLockoutKey(email));
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  saveLockoutState(email, state) {
    if (!email) return;
    try {
      localStorage.setItem(this.getLockoutKey(email), JSON.stringify(state));
    } catch (_) {}
  }

  clearLockoutState(email) {
    if (!email) return;
    try {
      localStorage.removeItem(this.getLockoutKey(email));
      if (this.countdownInterval) {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
      }
    } catch (_) {}
  }

  /**
   * Evaluates current lockout state for a given email address and updates UI.
   * @param {string} email
   * @returns {Object} { blocked: boolean, reason?: string }
   */
  checkLockoutStatus(email) {
    const loginAlert = this.$('#login-alert');
    const submitBtn  = this.$('#login-submit-btn');
    const passwordInput = this.$('#login-password');

    if (!email || !isValidEmail(email)) {
      if (loginAlert) loginAlert.style.display = 'none';
      if (submitBtn && !this.state.loading) submitBtn.disabled = false;
      if (passwordInput) passwordInput.disabled = false;
      return { blocked: false };
    }

    const state = this.getLockoutState(email);
    if (!state) {
      if (loginAlert) loginAlert.style.display = 'none';
      if (submitBtn && !this.state.loading) submitBtn.disabled = false;
      if (passwordInput) passwordInput.disabled = false;
      return { blocked: false };
    }

    // 1. Check permanent account lockout (all 8 attempts failed)
    if (state.isLockedOut) {
      if (loginAlert) {
        loginAlert.style.display = 'block';
        loginAlert.innerHTML = `
          <div style="background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.4); border-radius: var(--radius-md); padding: var(--space-4); text-align: center; color: var(--color-danger, #ef4444);">
            <div style="font-size: 1.8rem; margin-bottom: 4px;">🔒</div>
            <strong style="font-size: 0.95rem; display: block; margin-bottom: 6px;">Cuenta Bloqueada Temporalmente</strong>
            <p style="margin: 0 0 10px 0; font-size: 0.8rem; line-height: 1.4; color: var(--color-text-primary);">
              Se han agotado los 8 intentos de acceso permitidos. Por favor, <strong>contacta al programador</strong> para restablecer tu acceso.
            </p>
            <button type="button" id="btn-recheck-lockout" class="btn btn-secondary btn-xs" style="margin-top: 6px; font-size: 0.75rem; padding: 6px 12px; width: 100%; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #fff; border-radius: 6px;">
              🔄 ¿Ya te cambiaron la contraseña? Haz clic para desbloquear
            </button>
          </div>
        `;

        const recheckBtn = loginAlert.querySelector('#btn-recheck-lockout');
        if (recheckBtn) {
          recheckBtn.addEventListener('click', async () => {
            recheckBtn.disabled = true;
            recheckBtn.textContent = '⏳ Verificando...';
            this.clearLockoutState(email);
            await AuthService.unlockUserAccount(email);
            if (passwordInput) passwordInput.disabled = false;
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = 'Iniciar sesión';
            }
            this.checkLockoutStatus(email);
            NotificationService.success('Cuenta desbloqueada. Ya puedes ingresar tu nueva contraseña.');
          });
        }
      }
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '🔒 Cuenta Bloqueada';
      }
      if (passwordInput) passwordInput.disabled = true;
      return { blocked: true, reason: 'locked' };
    }

    // 2. Check 1-minute timer lockout (5 attempts failed)
    const now = Date.now();
    if (state.lockoutUntil && state.lockoutUntil > now) {
      this.startCountdownTimer(email, state.lockoutUntil);
      return { blocked: true, reason: 'timer' };
    }

    // 3. Timer completed — user is in Phase 2 (3 secondary attempts remaining)
    if (state.attemptsPhase1 >= 5 && state.attemptsPhase2 < 3) {
      if (passwordInput) passwordInput.disabled = false;
      if (submitBtn && !this.state.loading) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Iniciar sesión';
      }
      const remainingPhase2 = 3 - state.attemptsPhase2;
      if (loginAlert) {
        loginAlert.style.display = 'block';
        loginAlert.innerHTML = `
          <div style="background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.4); border-radius: var(--radius-md); padding: var(--space-3); text-align: center; color: #f59e0b; font-size: 0.82rem;">
            ℹ️ Tiempo de espera finalizado. Te quedan <strong style="font-size: 0.9rem;">${remainingPhase2} intento(s) final(es)</strong>.
          </div>
        `;
      }
      return { blocked: false, remaining: remainingPhase2 };
    }

    if (loginAlert) loginAlert.style.display = 'none';
    if (passwordInput) passwordInput.disabled = false;
    if (submitBtn && !this.state.loading) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Iniciar sesión';
    }

    return { blocked: false };
  }

  /**
   * Starts a live 1-second countdown timer during the 1-minute lockout period.
   * @param {string} email
   * @param {number} lockoutUntil - Timestamp ms
   */
  startCountdownTimer(email, lockoutUntil) {
    if (this.countdownInterval) clearInterval(this.countdownInterval);

    const loginAlert    = this.$('#login-alert');
    const submitBtn     = this.$('#login-submit-btn');
    const passwordInput = this.$('#login-password');

    const updateTimer = () => {
      const now = Date.now();
      const remainingSec = Math.max(0, Math.ceil((lockoutUntil - now) / 1000));

      if (remainingSec > 0) {
        if (passwordInput) passwordInput.disabled = true;
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = `Esperar ${remainingSec}s...`;
        }
        if (loginAlert) {
          loginAlert.style.display = 'block';
          loginAlert.innerHTML = `
            <div style="background: rgba(245,158,11,0.14); border: 1px solid rgba(245,158,11,0.4); border-radius: var(--radius-md); padding: var(--space-3); text-align: center; color: #f59e0b; font-size: 0.82rem;">
              ⚠️ <strong>Límite de 5 intentos alcanzado</strong><br/>
              Por favor espera <strong style="font-size: 1.05rem; color: #f59e0b;">${remainingSec}s</strong> para intentar de nuevo.<br/>
              <span style="font-size: 0.72rem; opacity: 0.85;">(Tendrás 3 intentos finales tras la espera)</span>
            </div>
          `;
        }
      } else {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
        if (passwordInput) passwordInput.disabled = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Iniciar sesión';
        }
        this.checkLockoutStatus(email);
      }
    };

    updateTimer();
    this.countdownInterval = setInterval(updateTimer, 1000);
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

    // Check if user is locked out before attempting login
    const status = this.checkLockoutStatus(email);
    if (status.blocked) {
      return;
    }

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Accediendo...';

    try {
      const user = await AuthService.login(email, password);
      this.clearLockoutState(email);

      // Prompt to save account credentials for fast switching
      const isApk = !!(window.AndroidApp && typeof window.AndroidApp.isAndroidApp === 'function' && window.AndroidApp.isAndroidApp());
      const existing = SavedAccountsService.getByEmail(email);
      const companyName = GlobalStore.getState()?.currentCompany?.name || '';

      // If password is not saved yet, prompt the user
      if (!existing?._enc) {
        const promptMsg = isApk
          ? '📱 ¿Deseas guardar los datos de este inicio de sesión en la aplicación para cambiar rápidamente entre tus perfiles?'
          : '🌐 ¿Deseas guardar la contraseña para cambiar automáticamente a esta cuenta desde el menú de usuario?';
        const savePassword = confirm(promptMsg);
        await SavedAccountsService.save(user, savePassword ? password : null, companyName);
      } else {
        await SavedAccountsService.save(user, password, companyName);
      }

      NotificationService.success(`Bienvenido, ${user.displayName}`);
      redirectUserDashboard(user.role, { navigate: (path) => { window.location.hash = path; } });
    } catch (error) {
      console.error('[LoginView] Error en inicio de sesión:', error);
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Iniciar sesión';

      const now = Date.now();
      const state = this.getLockoutState(email) || {
        email,
        attemptsPhase1: 0,
        attemptsPhase2: 0,
        lockoutUntil: 0,
        isLockedOut: false
      };

      // ── Handle Lockout Logic on Failed Attempt ───────────────────────────
      if (state.attemptsPhase1 < 5 && !state.lockoutUntil) {
        state.attemptsPhase1 += 1;

        if (state.attemptsPhase1 < 5) {
          const remaining = 5 - state.attemptsPhase1;
          passwordError.textContent = `Credenciales incorrectas. Te quedan ${remaining} intento(s).`;
          passwordError.style.display = 'block';
          this.saveLockoutState(email, state);
        } else {
          // 5th failed attempt -> 1-minute timer lockout
          state.lockoutUntil = now + 60000;
          this.saveLockoutState(email, state);
          passwordError.style.display = 'none';
          this.startCountdownTimer(email, state.lockoutUntil);
        }
      } else if (state.attemptsPhase1 >= 5 && state.attemptsPhase2 < 3) {
        state.attemptsPhase2 += 1;

        if (state.attemptsPhase2 < 3) {
          const remaining = 3 - state.attemptsPhase2;
          passwordError.textContent = `Credenciales incorrectas. Te quedan ${remaining} intento(s) finales antes del bloqueo.`;
          passwordError.style.display = 'block';
          this.saveLockoutState(email, state);
        } else {
          // 3rd attempt in Phase 2 failed (total 8 failed attempts) -> Permanent account lock
          state.isLockedOut = true;
          state.lockedAt = now;
          this.saveLockoutState(email, state);
          passwordError.style.display = 'none';
          this.checkLockoutStatus(email);
          NotificationService.error('Cuenta bloqueada temporalmente por seguridad.');
        }
      } else {
        ErrorHandler.handleError(error, 'LoginView');
      }
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
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    if (typeof this.cleanupThree === 'function') {
      this.cleanupThree();
    }
    super.unmount();
  }
}
