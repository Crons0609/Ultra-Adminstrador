/**
 * @file login.view.js
 * @description Enterprise SaaS Login View for Ultra Administrador.
 *              Displays direct Enterprise login form upon entry. Runs validation first, then triggers
 *              a Normal Vortex (Indigo/Cyan) on successful authentication before opening the Dashboard,
 *              or a Red Vortex (Crimson) on failed authentication while keeping the user on the login page.
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
import { SavedAccountsService } from '../../../services/saved-accounts.service.js';
import { getBusinessTypeOptions } from '../../../config/business-types.config.js';
import { VortexEngine } from '../../../utils/vortex-engine.js';
import gsap from 'gsap';

/**
 * Translates Firebase technical errors to user-friendly Spanish messages.
 * @param {Error|Object} error 
 * @returns {string}
 */
function getFriendlyAuthErrorMessage(error) {
  const code = (error?.code || error?.message || '').toLowerCase();

  if (code.includes('invalid-credential') || code.includes('user-not-found') || code.includes('wrong-password') || code.includes('invalid-email')) {
    return 'Credenciales incorrectas. Verifica tu correo y contraseña.';
  }
  if (code.includes('too-many-requests')) {
    return 'Demasiados intentos fallidos. Por favor espera unos momentos para intentar de nuevo.';
  }
  if (code.includes('user-disabled')) {
    return 'Esta cuenta ha sido deshabilitada. Contacta al administrador.';
  }
  if (code.includes('network') || code.includes('unavailable') || code.includes('offline')) {
    return 'Error de conexión a internet. Verifica tu red e intenta nuevamente.';
  }
  return 'No se pudo iniciar sesión. Verifica tus credenciales e intenta de nuevo.';
}

export class LoginView extends Component {
  constructor(params = {}) {
    super(params);
    this.state = {
      loading: false,
      errors: {},
      showOwnerRequestPanel: false,
      ownerRequesting: false
    };
    this.vortexEngine = null;
  }

  render() {
    const { loading } = this.state;

    return `
      <div class="login-enterprise-page">
        <!-- Enterprise Tech Background -->
        <div class="tech-bg-container">
          <div class="tech-bg-grid"></div>
          <div class="tech-bg-halo tech-bg-halo-1"></div>
          <div class="tech-bg-halo tech-bg-halo-2"></div>
          <div class="tech-bg-halo tech-bg-halo-3"></div>
        </div>

        <!-- 2D Canvas Vortex Overlay -->
        <canvas id="vortex-canvas"></canvas>
        <div id="vortex-status-text" class="vortex-status-text"></div>

        <div class="login-content-wrapper">
          <!-- Enterprise Brand Header -->
          <div class="enterprise-brand-header">
            <div class="enterprise-logo-container">
              <img src="/assets/logo_ultra_administrador.png" 
                   alt="Ultra Administrador" 
                   onerror="if(!this.dataset.tried){this.dataset.tried='1';this.src='assets/logo_ultra_administrador.png';}else if(this.dataset.tried==='1'){this.dataset.tried='2';this.src='logo_ultra_administrador.png';}else if(this.dataset.tried==='2'){this.dataset.tried='3';this.src='/logo_ultra_administrador.png';}" />
            </div>
            <h1 class="enterprise-brand-title">${APP_CONFIG.name}</h1>
            <div class="enterprise-brand-badge">
              <span class="badge-dot"></span>
              Enterprise Control Platform
            </div>
            <p class="enterprise-brand-subtitle">Accede a tu panel de administración</p>
          </div>

          <!-- Enterprise Login Form Container (Direct Entrance) -->
          <div id="login-card-container" class="login-card-container">
            <div class="enterprise-card" id="main-enterprise-card">
              <!-- Security Badge Header -->
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.06);">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="color: #818cf8; font-size: 1.1rem;">🔒</span>
                  <span style="font-size: 0.8rem; font-weight: 700; color: #cbd5e1; letter-spacing: 0.05em; text-transform: uppercase;">
                    Autenticación Requerida
                  </span>
                </div>
                <span style="font-size: 0.7rem; color: #64748b; background: rgba(255,255,255,0.04); padding: 2px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.06);">
                  SSL 256-Bit
                </span>
              </div>

              <!-- Dynamic Lockout Alert Banner -->
              <div id="login-alert" style="display: none; margin-bottom: var(--space-4);"></div>

              <!-- Saved Accounts Quick Selector -->
              <div id="saved-accounts-login-container"></div>

              <form id="login-form" novalidate>
                <!-- Email Input -->
                <div class="enterprise-form-group">
                  <label class="enterprise-input-label" for="login-email">Correo Electrónico</label>
                  <div class="enterprise-input-wrapper">
                    <span class="enterprise-input-icon">✉️</span>
                    <input
                      type="email"
                      id="login-email"
                      class="enterprise-input"
                      placeholder="correo@empresa.com"
                      autocomplete="email"
                      required
                    />
                  </div>
                  <p class="form-helper error" id="email-error" style="display: none; font-size: 0.72rem; color: #f87171; margin-top: 4px;"></p>
                </div>

                <!-- Password Input -->
                <div class="enterprise-form-group">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <label class="enterprise-input-label" for="login-password" style="margin-bottom: 0;">Contraseña</label>
                    <a href="#/forgot-password" style="font-size: 0.75rem; color: #818cf8; text-decoration: none; font-weight: 500; transition: color 0.2s;" onmouseover="this.style.color='#a5b4fc'" onmouseout="this.style.color='#818cf8'">
                      ¿Olvidaste tu contraseña?
                    </a>
                  </div>
                  <div class="enterprise-input-wrapper">
                    <span class="enterprise-input-icon">🔑</span>
                    <input
                      type="password"
                      id="login-password"
                      class="enterprise-input"
                      placeholder="••••••••"
                      autocomplete="current-password"
                      required
                      style="padding-right: 44px;"
                    />
                    <button
                      type="button"
                      id="btn-toggle-password"
                      style="
                        position: absolute;
                        right: 8px;
                        background: transparent;
                        border: none;
                        color: #94a3b8;
                        cursor: pointer;
                        padding: 6px 8px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 1.05rem;
                        border-radius: 6px;
                        user-select: none;
                        transition: color 0.2s;
                      "
                      title="Mostrar contraseña"
                    >
                      👁️
                    </button>
                  </div>
                  <p class="form-helper error" id="password-error" style="display: none; font-size: 0.72rem; color: #f87171; margin-top: 4px;"></p>
                </div>

                <!-- Submit Button -->
                <button
                  type="submit"
                  id="login-submit-btn"
                  class="enterprise-submit-btn"
                  ${loading ? 'disabled' : ''}
                >
                  ${loading ? '<span class="animate-spin" style="display:inline-block">⏳</span> Validando credenciales...' : 'Iniciar Sesión'}
                </button>
              </form>
            </div>

            <!-- Business Owner Request Panel Toggle Button -->
            <div style="margin-top: 16px;">
              <button
                id="btn-toggle-owner-request"
                class="enterprise-secondary-btn"
                title="Solicitar registro para tu negocio"
              >
                <span>🏢</span>
                <span>¿Quieres registrar tu negocio? Solicitar Cuenta</span>
              </button>
            </div>

            <!-- Business Owner Request Form Panel (hidden by default) -->
            <div id="owner-request-panel" style="display: none; margin-top: 16px; animation: slideDown 0.3s ease forwards;">
              <div class="enterprise-card" style="background: rgba(15, 23, 42, 0.9); border-color: rgba(99, 102, 241, 0.3);">
                <!-- Header -->
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.08);">
                  <span style="font-size: 1.5rem;">🏢</span>
                  <div>
                    <h3 style="margin: 0; font-size: 0.95rem; color: #a5b4fc; font-weight: 700;">
                      Solicitud de Nuevo Dueño de Negocio
                    </h3>
                    <p style="margin: 2px 0 0 0; font-size: 0.73rem; color: #94a3b8;">
                      Un programador revisará y aprobará tu registro para activar tu acceso
                    </p>
                  </div>
                </div>

                <!-- Success Alert -->
                <div id="owner-req-success-alert" style="display: none; margin-bottom: 16px; background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.4); border-radius: 8px; padding: 12px; color: #4ade80; font-size: 0.82rem; text-align: center;">
                  ✅ <strong>¡Solicitud Enviada con Éxito!</strong><br/>
                  Un programador revisará tus datos y activará tu cuenta pronto.
                </div>

                <form id="owner-request-form" novalidate>
                  <!-- Owner Name -->
                  <div class="enterprise-form-group">
                    <label class="enterprise-input-label" for="req-owner-name">👤 Nombre Completo del Propietario</label>
                    <input
                      type="text"
                      id="req-owner-name"
                      class="enterprise-input"
                      placeholder="Ej. Juan Pérez"
                      style="padding-left: 14px;"
                      required
                    />
                    <p class="form-helper error" id="req-owner-name-error" style="display: none; font-size: 0.7rem; color: #f87171; margin-top: 4px;"></p>
                  </div>

                  <!-- Company Name -->
                  <div class="enterprise-form-group">
                    <label class="enterprise-input-label" for="req-company-name">🏪 Nombre de la Empresa / Negocio</label>
                    <input
                      type="text"
                      id="req-company-name"
                      class="enterprise-input"
                      placeholder="Ej. RestoBar El Portal"
                      style="padding-left: 14px;"
                      required
                    />
                    <p class="form-helper error" id="req-company-name-error" style="display: none; font-size: 0.7rem; color: #f87171; margin-top: 4px;"></p>
                  </div>

                  <!-- Business Type -->
                  <div class="enterprise-form-group">
                    <label class="enterprise-input-label" for="req-business-type">📌 Tipo de Negocio</label>
                    <select
                      id="req-business-type"
                      class="enterprise-input"
                      style="padding-left: 14px; background-color: rgba(15, 23, 42, 0.95); cursor: pointer;"
                    >
                      ${getBusinessTypeOptions()}
                    </select>
                  </div>

                  <!-- Email -->
                  <div class="enterprise-form-group">
                    <label class="enterprise-input-label" for="req-email">📧 Correo Electrónico</label>
                    <input
                      type="email"
                      id="req-email"
                      class="enterprise-input"
                      placeholder="propietario@empresa.com"
                      autocomplete="username"
                      style="padding-left: 14px;"
                      required
                    />
                    <p class="form-helper error" id="req-email-error" style="display: none; font-size: 0.7rem; color: #f87171; margin-top: 4px;"></p>
                  </div>

                  <!-- Phone -->
                  <div class="enterprise-form-group">
                    <label class="enterprise-input-label" for="req-phone">📞 Teléfono de Contacto</label>
                    <input
                      type="tel"
                      id="req-phone"
                      class="enterprise-input"
                      placeholder="Ej. +505 8888 8888"
                      style="padding-left: 14px;"
                      required
                    />
                    <p class="form-helper error" id="req-phone-error" style="display: none; font-size: 0.7rem; color: #f87171; margin-top: 4px;"></p>
                  </div>

                  <!-- Password -->
                  <div class="enterprise-form-group">
                    <label class="enterprise-input-label" for="req-password">🔑 Contraseña Deseada (mín. 6 caracteres)</label>
                    <div class="enterprise-input-wrapper">
                      <input
                        type="password"
                        id="req-password"
                        class="enterprise-input"
                        placeholder="••••••••"
                        minlength="6"
                        autocomplete="new-password"
                        required
                        style="padding-left: 14px; padding-right: 44px;"
                      />
                      <button
                        type="button"
                        id="btn-toggle-req-password"
                        style="
                          position: absolute;
                          right: 8px;
                          background: transparent;
                          border: none;
                          color: #94a3b8;
                          cursor: pointer;
                          padding: 6px;
                          font-size: 1rem;
                        "
                        title="Mostrar contraseña"
                      >
                        👁️
                      </button>
                    </div>
                    <p class="form-helper error" id="req-password-error" style="display: none; font-size: 0.7rem; color: #f87171; margin-top: 4px;"></p>
                  </div>

                  <button
                    type="submit"
                    id="btn-submit-owner-req"
                    class="enterprise-submit-btn"
                    style="background: linear-gradient(135deg, #7c3aed, #8b5cf6);"
                  >
                    📩 Enviar Solicitud a Programador
                  </button>
                </form>
              </div>
            </div>

            <!-- Footer -->
            <div class="enterprise-footer">
              <p style="margin: 0;">&copy; ${new Date().getFullYear()} <strong>Ultra Administrador</strong>. Todos los derechos reservados.</p>
              <p style="margin: 4px 0 0; opacity: 0.8;">Desarrollado por <strong style="color: #a78bfa;">ProLine System</strong></p>
            </div>

          </div>
        </div>
      </div>
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

    // ── 1. Initialize 2D Canvas Vortex Engine ───────────────────────────────
    const canvas = this.$('#vortex-canvas');
    const statusText = this.$('#vortex-status-text');
    if (canvas) {
      this.vortexEngine = new VortexEngine(canvas, statusText);
    }

    // GSAP Entrance animation for card and fields
    const card = this.$('#main-enterprise-card');
    if (card) {
      gsap.fromTo(card,
        { opacity: 0, y: 30, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'power3.out' }
      );
    }

    // ── 2. Login Form Submission & Validation Flow ─────────────────────────
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

    // ── 3. Password Visibility Toggles ──────────────────────────────────────
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

    // ── 4. Business Owner Request Panel Toggle ──────────────────────────────
    const toggleOwnerReqBtn = this.$('#btn-toggle-owner-request');
    const ownerReqPanel     = this.$('#owner-request-panel');

    if (toggleOwnerReqBtn && ownerReqPanel) {
      toggleOwnerReqBtn.addEventListener('click', () => {
        const isHidden = ownerReqPanel.style.display === 'none';
        ownerReqPanel.style.display = isHidden ? 'block' : 'none';
        toggleOwnerReqBtn.innerHTML = isHidden
          ? '<span>✖</span> <span>Cerrar Formulario</span>'
          : '<span>🏢</span> <span>¿Quieres registrar tu negocio? Solicitar Cuenta</span>';
      });
    }

    // ── 5. Business Owner Request Form Submission ───────────────────────────
    const ownerReqForm = this.$('#owner-request-form');
    if (ownerReqForm) {
      ownerReqForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleOwnerRequestSubmit();
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
          <div style="background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.4); border-radius: 10px; padding: 14px; text-align: center; color: #f87171;">
            <div style="font-size: 1.8rem; margin-bottom: 4px;">🔒</div>
            <strong style="font-size: 0.95rem; display: block; margin-bottom: 6px;">Cuenta Bloqueada Temporalmente</strong>
            <p style="margin: 0 0 10px 0; font-size: 0.8rem; line-height: 1.4; color: #cbd5e1;">
              Se han agotado los 8 intentos de acceso permitidos. Por favor, <strong>contacta al programador</strong> para restablecer tu acceso.
            </p>
            <button type="button" id="btn-recheck-lockout" class="enterprise-secondary-btn" style="margin-top: 6px; font-size: 0.75rem; padding: 8px 12px; width: 100%;">
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
              submitBtn.textContent = 'Iniciar Sesión';
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
        submitBtn.textContent = 'Iniciar Sesión';
      }
      const remainingPhase2 = 3 - state.attemptsPhase2;
      if (loginAlert) {
        loginAlert.style.display = 'block';
        loginAlert.innerHTML = `
          <div style="background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.4); border-radius: 10px; padding: 12px; text-align: center; color: #fbbf24; font-size: 0.82rem;">
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
      submitBtn.textContent = 'Iniciar Sesión';
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
            <div style="background: rgba(245,158,11,0.14); border: 1px solid rgba(245,158,11,0.4); border-radius: 10px; padding: 12px; text-align: center; color: #fbbf24; font-size: 0.82rem;">
              ⚠️ <strong>Límite de 5 intentos alcanzado</strong><br/>
              Por favor espera <strong style="font-size: 1.05rem; color: #fbbf24;">${remainingSec}s</strong> para intentar de nuevo.<br/>
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
          submitBtn.textContent = 'Iniciar Sesión';
        }
        this.checkLockoutStatus(email);
      }
    };

    updateTimer();
    this.countdownInterval = setInterval(updateTimer, 1000);
  }

  // ── Login Handler with Validation -> Authentication -> Vortex -> Result ──
  async handleLogin() {
    if (this.state.loading) return; // Prevent duplicate clicks

    const emailInput    = this.$('#login-email');
    const passwordInput = this.$('#login-password');
    const submitBtn     = this.$('#login-submit-btn');
    const emailError    = this.$('#email-error');
    const passwordError = this.$('#password-error');
    const card          = this.$('#main-enterprise-card');

    const email    = emailInput?.value.trim() || '';
    const password = passwordInput?.value || '';

    // Reset previous error indicators
    emailError.style.display    = 'none';
    passwordError.style.display = 'none';
    emailInput?.classList.remove('input-error');
    passwordInput?.classList.remove('input-error');
    if (card) card.classList.remove('card-error-state');

    // ── 1. STEP A: FORM VALIDATION (NO VORTEX FOR FORMAT ERRORS) ───────────
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

    // ── 2. STEP B: ENTER LOADING STATE ──────────────────────────────────────
    this.state.loading = true;
    submitBtn.disabled  = true;
    submitBtn.innerHTML = '<span class="animate-spin" style="display:inline-block">⏳</span> Validando credenciales...';

    // ── 3. STEP C: EXECUTE AUTHENTICATION ──────────────────────────────────
    try {
      const user = await AuthService.login(email, password);
      this.clearLockoutState(email);

      // Prompt / Save account details
      const isApk = !!(window.AndroidApp && typeof window.AndroidApp.isAndroidApp === 'function' && window.AndroidApp.isAndroidApp());
      const existing = SavedAccountsService.getByEmail(email);
      const companyName = GlobalStore.getState()?.currentCompany?.name || '';

      if (!existing?._enc) {
        const promptMsg = isApk
          ? '📱 ¿Deseas guardar los datos de este inicio de sesión en la aplicación para cambiar rápidamente entre tus perfiles?'
          : '🌐 ¿Deseas guardar la contraseña para cambiar automáticamente a esta cuenta desde el menú de usuario?';
        const savePassword = confirm(promptMsg);
        SavedAccountsService.save(user, savePassword ? password : null, companyName);
      } else {
        SavedAccountsService.save(user, password, companyName);
      }

      // ── 4. SUCCESS: NORMAL VORTEX -> DASHBOARD ───────────────────────────
      if (this.vortexEngine) {
        this.vortexEngine.startTransition({
          mode: 'success',
          durationMs: 1800,
          onComplete: () => {
            NotificationService.success(`Bienvenido, ${user.displayName || user.email}`);
            redirectUserDashboard(user.role, { navigate: (path) => { window.location.hash = path; } });
          }
        });
      } else {
        NotificationService.success(`Bienvenido, ${user.displayName || user.email}`);
        redirectUserDashboard(user.role, { navigate: (path) => { window.location.hash = path; } });
      }

    } catch (error) {
      console.error('[LoginView] Error en autenticación:', error);
      
      const now = Date.now();
      const state = this.getLockoutState(email) || {
        email,
        attemptsPhase1: 0,
        attemptsPhase2: 0,
        lockoutUntil: 0,
        isLockedOut: false
      };

      // Friendly Spanish message (no raw Firebase codes)
      const friendlyMsg = getFriendlyAuthErrorMessage(error);

      // Update lockout tracking logic
      if (state.attemptsPhase1 < 5 && !state.lockoutUntil) {
        state.attemptsPhase1 += 1;
        if (state.attemptsPhase1 >= 5) {
          state.lockoutUntil = now + 60000;
        }
        this.saveLockoutState(email, state);
      } else if (state.attemptsPhase1 >= 5 && state.attemptsPhase2 < 3) {
        state.attemptsPhase2 += 1;
        if (state.attemptsPhase2 >= 3) {
          state.isLockedOut = true;
          state.lockedAt = now;
        }
        this.saveLockoutState(email, state);
      }

      // ── 5. FAILURE: RED VORTEX -> RETURN TO LOGIN FORM (NO DASHBOARD) ────
      if (card) card.classList.add('card-error-state');

      if (this.vortexEngine) {
        this.vortexEngine.startTransition({
          mode: 'error',
          durationMs: 1800,
          onComplete: () => {
            this.state.loading = false;
            submitBtn.disabled  = false;
            submitBtn.textContent = 'Iniciar Sesión';

            if (state.isLockedOut || state.lockoutUntil > Date.now()) {
              this.checkLockoutStatus(email);
            } else {
              passwordError.textContent   = friendlyMsg;
              passwordError.style.display = 'block';
              passwordInput?.classList.add('input-error');
              passwordInput?.focus();
            }
          }
        });
      } else {
        this.state.loading = false;
        submitBtn.disabled  = false;
        submitBtn.textContent = 'Iniciar Sesión';
        passwordError.textContent   = friendlyMsg;
        passwordError.style.display = 'block';
        passwordInput?.classList.add('input-error');
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

    submitBtn.disabled  = true;
    submitBtn.innerHTML = '<span class="animate-spin" style="display:inline-block">⏳</span> Enviando solicitud...';

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
    if (this.vortexEngine) {
      this.vortexEngine.stop();
      this.vortexEngine = null;
    }
    super.unmount();
  }
}
