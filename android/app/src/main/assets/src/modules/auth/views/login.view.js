/**
 * @file login.view.js
 * @description Login view — Premium full-screen auth page with email/password form.
 *             Also includes a hidden developer/superadmin registration panel
 *             protected by a secret access key.
 */

import { Component } from '../../../core/component.js';
import { AuthService } from '../../../services/auth.service.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { ErrorHandler } from '../../../core/error-handler.js';
import { GlobalStore } from '../../../core/state.js';
import { redirectUserDashboard } from '../../../core/middleware.js';
import { isValidEmail } from '../../../utils/validators.js';
import { APP_CONFIG } from '../../../config/app.config.js';
import { AnimationService } from '../../../services/animation.service.js';
import { SavedAccountsService } from '../../../services/saved-accounts.service.js';
import { getBusinessTypeOptions } from '../../../config/business-types.config.js';
import gsap from 'gsap';

export class LoginView extends Component {
  constructor(params = {}) {
    super(params);
    this.state = { loading: false, errors: {}, showOwnerRequestPanel: false, ownerRequesting: false };
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
          </div>

          <!-- Business Owner Request Panel Toggle Link -->
          <div style="text-align: center; margin-top: var(--space-4);">
            <button
              id="btn-toggle-owner-request"
              style="
                background: none;
                border: none;
                color: var(--color-accent, #8b5cf6);
                font-size: 0.82rem;
                font-weight: 600;
                cursor: pointer;
                opacity: 0.9;
                letter-spacing: 0.02em;
                transition: all 0.2s;
                padding: 6px 12px;
                border-radius: var(--radius-md);
              "
              onmouseover="this.style.opacity='1'; this.style.background='rgba(139,92,246,0.1)'"
              onmouseout="this.style.opacity='0.9'; this.style.background='none'"
              title="Solicitar registro para tu negocio"
            >
              🏢 ¿Quieres registrar tu negocio? Solicitar Cuenta
            </button>
          </div>

          <!-- Business Owner Request Panel (hidden by default) -->
          <div id="owner-request-panel" style="
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
                <span style="font-size: 1.4rem;">🏢</span>
                <div>
                  <h3 style="margin: 0; font-size: 0.95rem; color: var(--color-accent); font-weight: 700;">
                    Solicitud de Nuevo Dueño de Negocio
                  </h3>
                  <p style="margin: 0; font-size: 0.72rem; color: var(--color-text-tertiary);">
                    Un programador revisará y aprobará tu registro para activar tu acceso
                  </p>
                </div>
              </div>

              <!-- Success Alert (hidden by default) -->
              <div id="owner-req-success-alert" style="display: none; margin-bottom: var(--space-4); background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.4); border-radius: var(--radius-md); padding: var(--space-3); color: #22c55e; font-size: 0.82rem; text-align: center;">
                ✅ <strong>¡Solicitud Enviada con Éxito!</strong><br/>
                Un programador revisará tus datos y activará tu cuenta pronto.
              </div>

              <form id="owner-request-form" novalidate>
                <!-- Owner Name -->
                <div class="form-group" style="margin-bottom: var(--space-3);">
                  <label class="form-label" for="req-owner-name" style="font-size: 0.75rem;">
                    👤 Nombre Completo del Propietario
                  </label>
                  <input
                    type="text"
                    id="req-owner-name"
                    class="input input-md"
                    placeholder="Ej. Juan Pérez"
                    required
                  />
                  <p class="form-helper error" id="req-owner-name-error" style="display: none; font-size: 0.7rem;"></p>
                </div>

                <!-- Company Name -->
                <div class="form-group" style="margin-bottom: var(--space-3);">
                  <label class="form-label" for="req-company-name" style="font-size: 0.75rem;">
                    🏪 Nombre de la Empresa / Negocio
                  </label>
                  <input
                    type="text"
                    id="req-company-name"
                    class="input input-md"
                    placeholder="Ej. RestoBar El Portal"
                    required
                  />
                  <p class="form-helper error" id="req-company-name-error" style="display: none; font-size: 0.7rem;"></p>
                </div>

                <!-- Business Type -->
                <div class="form-group" style="margin-bottom: var(--space-3);">
                  <label class="form-label" for="req-business-type" style="font-size: 0.75rem;">
                    📌 Tipo de Negocio
                  </label>
                  <select
                    id="req-business-type"
                    class="input input-md"
                    style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); color: var(--color-text-primary);"
                  >
                    ${getBusinessTypeOptions()}
                  </select>
                </div>

                <!-- Email -->
                <div class="form-group" style="margin-bottom: var(--space-3);">
                  <label class="form-label" for="req-email" style="font-size: 0.75rem;">
                    📧 Correo Electrónico
                  </label>
                  <input
                    type="email"
                    id="req-email"
                    class="input input-md"
                    placeholder="propietario@empresa.com"
                    autocomplete="username"
                    required
                  />
                  <p class="form-helper error" id="req-email-error" style="display: none; font-size: 0.7rem;"></p>
                </div>

                <!-- Phone -->
                <div class="form-group" style="margin-bottom: var(--space-3);">
                  <label class="form-label" for="req-phone" style="font-size: 0.75rem;">
                    📞 Teléfono de Contacto
                  </label>
                  <input
                    type="tel"
                    id="req-phone"
                    class="input input-md"
                    placeholder="Ej. +505 8888 8888"
                    required
                  />
                  <p class="form-helper error" id="req-phone-error" style="display: none; font-size: 0.7rem;"></p>
                </div>

                <!-- Password -->
                <div class="form-group" style="margin-bottom: var(--space-4);">
                  <label class="form-label" for="req-password" style="font-size: 0.75rem;">
                    🔑 Contraseña Deseada (mín. 6 caracteres)
                  </label>
                  <div style="position: relative; display: flex; align-items: center;">
                    <input
                      type="password"
                      id="req-password"
                      class="input input-md"
                      placeholder="••••••••"
                      minlength="6"
                      autocomplete="new-password"
                      required
                      style="padding-right: 40px; width: 100%;"
                    />
                    <button
                      type="button"
                      id="btn-toggle-req-password"
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
                  <p class="form-helper error" id="req-password-error" style="display: none; font-size: 0.7rem;"></p>
                </div>

                <button
                  type="submit"
                  id="btn-submit-owner-req"
                  class="btn btn-primary btn-md"
                  style="width: 100%; background: linear-gradient(135deg, #7c3aed, #8b5cf6);"
                >
                  📩 Enviar Solicitud a Programador
                </button>
              </form>
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

    // ── Login Form Submission ────────────────────────────────────────────────
    const loginForm  = this.$('#login-form');
    const emailInput = this.$('#login-email');

    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleLogin();
      });
    }

    if (emailInput) {
      emailInput.addEventListener('input', () => {
        this.checkLockoutStatus(emailInput.value.trim());
      });
      emailInput.addEventListener('blur', () => {
        this.checkLockoutStatus(emailInput.value.trim());
      });
    }

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

    const reqPassInput = this.$('#req-password');
    const toggleReqPass = this.$('#btn-toggle-req-password');
    if (reqPassInput && toggleReqPass) {
      toggleReqPass.addEventListener('click', () => {
        const isPassword = reqPassInput.type === 'password';
        reqPassInput.type = isPassword ? 'text' : 'password';
        toggleReqPass.textContent = isPassword ? '🙈' : '👁️';
        toggleReqPass.title = isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña';
      });
    }

    // ── Business Owner Request Panel Toggle ──────────────────────────────────
    const toggleOwnerReqBtn = this.$('#btn-toggle-owner-request');
    const ownerReqPanel     = this.$('#owner-request-panel');

    if (toggleOwnerReqBtn && ownerReqPanel) {
      toggleOwnerReqBtn.addEventListener('click', () => {
        const isHidden = ownerReqPanel.style.display === 'none';
        ownerReqPanel.style.display = isHidden ? 'block' : 'none';
        toggleOwnerReqBtn.textContent = isHidden
          ? '✖ Cerrar Formulario'
          : '🏢 ¿Quieres registrar tu negocio? Solicitar Cuenta';
      });
    }

    // ── Business Owner Request Form Submission ──────────────────────────────
    const ownerReqForm = this.$('#owner-request-form');
    if (ownerReqForm) {
      ownerReqForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleOwnerRequestSubmit();
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
        SavedAccountsService.save(user, savePassword ? password : null, companyName);
      } else {
        SavedAccountsService.save(user, password, companyName);
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

  // ── Business Owner Request Handler ─────────────────────────────────────────
  async handleOwnerRequestSubmit() {
    const ownerNameInput    = this.$('#req-owner-name');
    const companyNameInput  = this.$('#req-company-name');
    const businessTypeInput = this.$('#req-business-type');
    const emailInput        = this.$('#req-email');
    const phoneInput        = this.$('#req-phone');
    const passInput         = this.$('#req-password');
    const submitBtn         = this.$('#btn-submit-owner-req');
    const successAlert      = this.$('#owner-req-success-alert');

    const ownerNameErr   = this.$('#req-owner-name-error');
    const companyNameErr = this.$('#req-company-name-error');
    const emailErr       = this.$('#req-email-error');
    const phoneErr       = this.$('#req-phone-error');
    const passErr        = this.$('#req-password-error');

    // Reset errors
    [ownerNameErr, companyNameErr, emailErr, phoneErr, passErr].forEach(el => el && (el.style.display = 'none'));
    if (successAlert) successAlert.style.display = 'none';

    const ownerName    = ownerNameInput?.value.trim() || '';
    const companyName  = companyNameInput?.value.trim() || '';
    const businessType = businessTypeInput?.value || 'Restaurante';
    const email        = emailInput?.value.trim() || '';
    const phone        = phoneInput?.value.trim() || '';
    const password     = passInput?.value || '';

    let isValid = true;

    if (!ownerName) {
      if (ownerNameErr) { ownerNameErr.textContent = 'Ingresa tu nombre completo'; ownerNameErr.style.display = 'block'; }
      isValid = false;
    }

    if (!companyName) {
      if (companyNameErr) { companyNameErr.textContent = 'Ingresa el nombre del negocio'; companyNameErr.style.display = 'block'; }
      isValid = false;
    }

    if (!isValidEmail(email)) {
      if (emailErr) { emailErr.textContent = 'Ingresa un correo electrónico válido'; emailErr.style.display = 'block'; }
      isValid = false;
    }

    if (!phone) {
      if (phoneErr) { phoneErr.textContent = 'Ingresa tu número de teléfono de contacto'; phoneErr.style.display = 'block'; }
      isValid = false;
    }

    if (!password || password.length < 6) {
      if (passErr) { passErr.textContent = 'La contraseña debe tener al menos 6 caracteres'; passErr.style.display = 'block'; }
      isValid = false;
    }

    if (!isValid) return;

    submitBtn.disabled    = true;
    submitBtn.textContent = '⏳ Enviando solicitud...';

    try {
      await FirestoreService.createPendingOwnerRequest({
        ownerName,
        companyName,
        businessType,
        email,
        phone,
        password
      });

      if (successAlert) successAlert.style.display = 'block';
      NotificationService.success('✅ Solicitud enviada exitosamente. El programador la revisará pronto.');

      // Clear form
      if (ownerNameInput)   ownerNameInput.value   = '';
      if (companyNameInput) companyNameInput.value = '';
      if (emailInput)        emailInput.value       = '';
      if (phoneInput)        phoneInput.value       = '';
      if (passInput)         passInput.value        = '';

    } catch (err) {
      console.error('[LoginView] Error al enviar solicitud de dueño:', err);
      if (passErr) {
        passErr.textContent   = err.message || 'Error al enviar la solicitud. Intenta nuevamente.';
        passErr.style.display = 'block';
      }
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = '📩 Enviar Solicitud a Programador';
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
