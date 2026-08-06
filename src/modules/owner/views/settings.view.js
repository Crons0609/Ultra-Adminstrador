import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { GlobalStore } from '../../../core/state.js';
import { AuthService } from '../../../services/auth.service.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { ImageStorageService } from '../../../services/image-storage.service.js';
import { TimeService } from '../../../services/time.service.js';

import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updateEmail,
  updatePassword,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { auth, db } from '../../../config/firebase.config.js';
import { ref, get, update, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';
import { AppearanceService, THEMES } from '../../../services/appearance.service.js';
import { MobileNavConfigService, NAV_TAB_CATALOG, DEFAULT_NAV_TABS } from '../../../services/mobile-nav-config.service.js';

// Build the theme grid HTML for Business Owners
function buildOwnerThemeGrid() {
  return Object.entries(THEMES).map(([key, theme]) => `
    <div class="owner-theme-preset-card" data-theme="${key}" title="${theme.label}" style="
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      padding: 10px 8px; border-radius: 10px; cursor: pointer;
      border: 2px solid transparent; transition: all 0.2s ease;
      background: var(--color-bg-tertiary);
    ">
      <div style="
        width: 52px; height: 34px; border-radius: 6px; overflow: hidden;
        border: 1px solid rgba(255,255,255,0.15);
        display: flex; gap: 2px; padding: 3px;
        background: ${theme.bgPrimary || '#0a0a0b'};
      ">
        <div style="flex: 0.7; border-radius: 3px; background: ${theme.sidebarBg || '#111'}"></div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 2px;">
          <div style="height: 8px; border-radius: 2px; background: ${theme.surface || '#16161a'}"></div>
          <div style="flex: 1; border-radius: 2px; background: ${theme.accent || '#7c75ff'}; opacity:0.8"></div>
        </div>
      </div>
      <span style="font-size: 0.65rem; font-weight: 600; text-align: center; color: var(--color-text-secondary); line-height: 1.2;">
        ${theme.emoji || ''} ${theme.label}
      </span>
    </div>
  `).join('');
}

export class SettingsView extends Component {
  constructor(params = {}) {
    super(params);

    const { currentUser } = GlobalStore.getState();
    this.currentUser = currentUser || {};
    this.companyId = this.currentUser.companyId || '';
    this.uid = this.currentUser.uid || '';

    // Guard safety
    if (!this.companyId || this.currentUser.role !== 'OWNER') {
      console.warn('[SettingsView] Access restricted. Owner role required.');
    }

    this.state = {
      activeTab: 'account', // 'account' | 'employees' | 'preferences'
      employees: [],
      filteredEmployees: [],
      searchQuery: '',
      ownerProfile: {},
      preferences: {
        language: 'es',
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '24h',
        timezone: 'America/Managua',
        systemNotifications: true,
        emailNotifications: true,
        alertSounds: true,
        theme: 'theme-dark'
      }
    };

    this.layout = new PageLayout({
      title: 'Ajustes de la Cuenta y del Panel',
      subtitle: 'Administra tu perfil de dueño, las preferencias visuales de tu panel y el personal de tu negocio de manera autónoma.',
      actionHTML: `
        <span class="badge" style="font-size: 0.75rem; padding: 4px 10px; border: 1px solid var(--color-border); display: flex; align-items: center; gap: 4px; background: rgba(139, 92, 246, 0.1); color: var(--color-accent);">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: var(--color-accent); display: inline-block; animation: pulse 2s infinite;"></span>
          Panel del Propietario
        </span>
      `,
      contentHTML: `
        <style>
          /* Settings Specific Modern Styles */
          .settings-tabs {
            display: flex;
            gap: var(--space-2);
            border-bottom: 1px solid var(--color-border);
            margin-bottom: var(--space-6);
            overflow-x: auto;
            padding-bottom: 2px;
          }
          .settings-tab-btn {
            background: transparent;
            border: none;
            border-bottom: 2px solid transparent;
            color: var(--color-text-secondary);
            padding: var(--space-3) var(--space-4);
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            white-space: nowrap;
            transition: all var(--transition-fast);
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .settings-tab-btn:hover {
            color: var(--color-text-primary);
            background: rgba(255, 255, 255, 0.02);
            border-radius: var(--radius-md) var(--radius-md) 0 0;
          }
          .settings-tab-btn.active {
            color: var(--color-accent);
            border-bottom-color: var(--color-accent);
          }
          .profile-avatar-container {
            position: relative;
            width: 110px;
            height: 110px;
            margin: 0 auto var(--space-4);
            border-radius: 50%;
            overflow: hidden;
            border: 3px solid var(--color-accent);
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
            background: var(--color-bg-tertiary);
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .profile-avatar-img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .profile-avatar-placeholder {
            font-size: 2.5rem;
            font-weight: 700;
            color: var(--color-accent);
          }
          .profile-avatar-overlay {
            position: absolute;
            inset: 0;
            background: rgba(0,0,0,0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            font-size: 0.72rem;
            font-weight: 600;
            opacity: 0;
            cursor: pointer;
            transition: opacity var(--transition-fast);
            text-align: center;
            padding: 4px;
          }
          .profile-avatar-container:hover .profile-avatar-overlay {
            opacity: 1;
          }
          .settings-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
            gap: var(--space-6);
          }
          .form-card {
            background: var(--color-bg-secondary);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-lg);
            padding: var(--space-5);
          }
          .card-title-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 1.05rem;
            font-weight: 700;
            color: var(--color-text-primary);
            margin-bottom: var(--space-4);
          }
          /* Custom Table Design */
          .emp-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.85rem;
          }
          .emp-table th {
            padding: var(--space-3) var(--space-4);
            color: var(--color-text-secondary);
            font-weight: 600;
            text-align: left;
            border-bottom: 2px solid var(--color-border);
          }
          .emp-table td {
            padding: var(--space-3) var(--space-4);
            border-bottom: 1px solid var(--color-border);
            vertical-align: middle;
          }
          .emp-table tr:hover {
            background: rgba(255, 255, 255, 0.01);
          }
          /* Search Box Style */
          .search-wrapper {
            position: relative;
            flex: 1;
            min-width: 250px;
          }
          .search-icon {
            position: absolute;
            left: 12px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--color-text-tertiary);
            pointer-events: none;
          }
          .search-input {
            width: 100%;
            padding-left: 36px !important;
          }
          .pulse-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            display: inline-block;
          }
          .theme-preview-box {
            width: 100%;
            height: 70px;
            border-radius: var(--radius-md);
            border: 2px solid var(--color-border);
            margin-top: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-weight: 600;
            font-size: 0.8rem;
            transition: all var(--transition-fast);
          }
          .theme-preview-box:hover {
            transform: translateY(-2px);
          }
          .theme-preview-dark {
            background: #0d0e12;
            color: #f8fafc;
            border-color: #8b5cf6;
          }
          .theme-preview-light {
            background: #f8fafc;
            color: #0d0e12;
            border-color: #cbd5e1;
          }
          @keyframes pulse {
            0% { transform: scale(0.95); opacity: 0.5; }
            50% { transform: scale(1.05); opacity: 1; }
            100% { transform: scale(0.95); opacity: 0.5; }
          }

          /* ── Owner Settings: Mobile Responsive ── */
          @media (max-width: 768px) {
            /* Grilla de tarjetas: columna única */
            .settings-grid {
              grid-template-columns: 1fr !important;
            }
            /* Tabs horizontales: scroll suave tipo chips */
            .settings-tabs {
              overflow-x: auto !important;
              overflow-y: hidden !important;
              scroll-snap-type: x mandatory;
              -webkit-overflow-scrolling: touch;
              scrollbar-width: none !important;
              padding-bottom: 4px !important;
              gap: 4px !important;
            }
            .settings-tabs::-webkit-scrollbar { display: none !important; }
            .settings-tab-btn {
              flex-shrink: 0 !important;
              scroll-snap-align: start;
              padding: 8px 14px !important;
              font-size: 0.8rem !important;
              white-space: nowrap !important;
            }
            /* Cards: padding reducido */
            .form-card {
              padding: var(--space-3) !important;
            }
            /* Controles de empleados: apilar verticalmente */
            .d-flex.justify-content-between.align-items-center {
              flex-direction: column !important;
              align-items: flex-start !important;
              gap: var(--space-3) !important;
            }
            .d-flex.gap-2.flex-wrap {
              width: 100% !important;
            }
            /* Search box: ancho completo */
            .search-wrapper {
              min-width: unset !important;
              width: 100% !important;
            }
            /* Tabla de empleados: scroll horizontal */
            .emp-table {
              display: block;
              overflow-x: auto;
              -webkit-overflow-scrolling: touch;
            }
            /* Grid de theme preview */
            .owner-theme-preset-card {
              padding: 8px 6px !important;
            }
          }
          @media (max-width: 480px) {
            .settings-tab-btn {
              padding: 6px 10px !important;
              font-size: 0.75rem !important;
            }
            .form-card {
              padding: var(--space-2) !important;
              border-radius: var(--radius-md) !important;
            }
            .settings-tabs {
              margin-bottom: var(--space-4) !important;
            }
          }
        </style>

        <div style="display: flex; flex-direction: column; gap: var(--space-4);">
          <!-- Navigation Tabs -->
          <div class="settings-tabs" id="settings-tab-nav">
            <button class="settings-tab-btn active" data-tab="account">
              👤 Mi Cuenta
            </button>
            <button class="settings-tab-btn" data-tab="employees">
              👥 Gestión de Empleados
            </button>
            <button class="settings-tab-btn" data-tab="preferences">
              ⚙️ Preferencias del Dashboard
            </button>
            <button class="settings-tab-btn" data-tab="location">
              📍 Ubicación del Establecimiento
            </button>
            <button class="settings-tab-btn" data-tab="mobile-nav">
              📱 Barra Móvil
            </button>
          </div>

          <!-- TAB CONTENT: ACCOUNT -->
          <div class="tab-content-panel" id="panel-tab-account">
            <div class="settings-grid">
              
              <!-- Profile Info Column -->
              <div class="form-card animate-fade-in">
                <span class="card-title-badge">👤 Información Personal</span>
                
                <form id="owner-profile-form" style="display:flex; flex-direction:column; gap: var(--space-3);">
                  <!-- Photo Upload Widget -->
                  <div style="text-align: center;">
                    <div class="profile-avatar-container" id="avatar-click-zone" style="position:relative;width:90px;height:90px;border-radius:50%;overflow:hidden;margin:0 auto;border:3px solid var(--color-accent);cursor:pointer;">
                      <img class="profile-avatar-img" id="owner-avatar-preview" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none';document.getElementById('owner-avatar-placeholder').style.display='flex';" />
                      <div class="profile-avatar-placeholder" id="owner-avatar-placeholder" style="width:100%;height:100%;background:var(--color-bg-tertiary);display:flex;align-items:center;justify-content:center;font-size:2rem;">U</div>
                      <div class="profile-avatar-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:#fff;font-size:0.7rem;font-weight:600;opacity:0;transition:opacity 0.2s;" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=0">Cambiar<br>Foto</div>
                    </div>
                    <input type="file" id="avatar-file-input" accept="image/jpeg,image/png,image/webp" style="display:none;" />
                    <input type="hidden" id="owner-photo-imageId" />
                    <p class="text-xs text-secondary" style="margin-top:6px;">Haz clic para cambiar tu foto de perfil (JPG, PNG, WEBP)</p>
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="owner-name-input">Nombre Completo</label>
                    <input type="text" id="owner-name-input" class="input input-md" placeholder="Nombre completo" required />
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="owner-phone-input">Número de Teléfono</label>
                    <input type="text" id="owner-phone-input" class="input input-md" placeholder="+505 8888-8888" />
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="owner-info-input">Información Personal / Dirección</label>
                    <textarea id="owner-info-input" class="input" style="min-height: 80px; padding: 10px; resize: vertical;" placeholder="Dirección de contacto, notas personales, etc."></textarea>
                  </div>

                  <button type="submit" id="btn-save-profile" class="btn btn-primary btn-md" style="align-self: flex-start; margin-top: var(--space-2);">
                    Guardar Perfil
                  </button>
                </form>
              </div>

              <!-- Security, Credentials & Password Column -->
              <div class="form-card animate-fade-in">
                <span class="card-title-badge">🔒 Seguridad y Credenciales</span>
                <p class="text-xs text-secondary mb-4">Actualiza tu correo electrónico de acceso o cambia la contraseña directamente. Para realizar estos cambios se requiere ingresar tu contraseña actual.</p>

                <form id="owner-credentials-form" style="display:flex; flex-direction:column; gap: var(--space-3);">
                  <div class="form-group">
                    <label class="form-label" for="owner-email-input">Correo Electrónico Actual</label>
                    <input type="email" id="owner-email-input" class="input input-md" placeholder="correo@negocio.com" required />
                  </div>

                  <div class="form-group" style="border-bottom: 1px dashed var(--color-border); padding-bottom: var(--space-3);">
                    <label class="form-label" for="owner-current-password">Contraseña Actual <span class="form-label-required"></span></label>
                    <input type="password" id="owner-current-password" class="input input-md" placeholder="Requerido para aplicar cambios sensibles" required />
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="owner-new-email-input">Nuevo Correo (opcional)</label>
                    <input type="email" id="owner-new-email-input" class="input input-md" placeholder="Ingresa si deseas cambiar tu correo" />
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="owner-new-password">Nueva Contraseña (mín. 6 caracteres)</label>
                    <input type="password" id="owner-new-password" class="input input-md" placeholder="Ingresa para cambiar contraseña" minlength="6" autocomplete="new-password" />
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="owner-confirm-password">Confirmar Nueva Contraseña</label>
                    <input type="password" id="owner-confirm-password" class="input input-md" placeholder="Confirmación de contraseña" autocomplete="new-password" />
                  </div>

                  <div style="display:flex; flex-direction:column; gap: var(--space-2); margin-top: var(--space-2);">
                    <button type="submit" id="btn-update-credentials" class="btn btn-accent btn-md" style="align-self: flex-start;">
                      Actualizar Credenciales
                    </button>
                    <button type="button" id="btn-logout-others" class="btn btn-secondary btn-sm" style="align-self: flex-start; margin-top: var(--space-1); border-color: var(--color-danger); color: #f87171;">
                      🚪 Cerrar otras sesiones activas
                    </button>
                  </div>
                </form>
              </div>

            </div>
          </div>

          <!-- TAB CONTENT: EMPLOYEES -->
          <div class="tab-content-panel" id="panel-tab-employees" style="display:none;">
            <div class="card p-5 animate-fade-in">
              
              <!-- List Controls -->
              <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
                <div>
                  <h3 class="text-lg font-bold" style="margin:0;">👥 Administración de Empleados</h3>
                  <p class="text-secondary" style="font-size:0.8rem; margin-top:4px;">Gestiona los meseros, cocineros, cajeros y gerentes exclusivos de tu negocio.</p>
                </div>
                
                <div class="d-flex gap-2 flex-wrap" style="align-items: center;">
                  <div class="search-wrapper">
                    <span class="search-icon">🔍</span>
                    <input type="text" id="employee-search-box" class="input input-md search-input" placeholder="Buscar por nombre o correo..." />
                  </div>
                  <button class="btn btn-primary btn-md" id="btn-add-worker">
                    + Registrar Empleado
                  </button>
                </div>
              </div>

              <!-- Employees Table -->
              <div style="overflow-x: auto; border: 1px solid var(--color-border); border-radius: var(--radius-md);">
                <table class="emp-table">
                  <thead>
                    <tr>
                      <th>Empleado</th>
                      <th>Contacto</th>
                      <th>Cargo / Puesto</th>
                      <th>Permisos de Sistema</th>
                      <th>Estado</th>
                      <th style="text-align: right;">Acciones</th>
                    </tr>
                  </thead>
                  <tbody id="employees-list-tbody">
                    <tr>
                      <td colspan="6" style="padding: 32px; text-align: center; color: var(--color-text-tertiary);">
                        ⏳ Cargando lista de empleados...
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

            </div>
          </div>

          <!-- TAB CONTENT: PREFERENCES -->
          <div class="tab-content-panel" id="panel-tab-preferences" style="display:none;">
            <div class="settings-grid">
              
              <!-- Dashboard Display Preferences -->
              <div class="form-card animate-fade-in">
                <span class="card-title-badge">⚙️ Personalización del Panel</span>
                
                <form id="owner-preferences-form" style="display:flex; flex-direction:column; gap: var(--space-4);">
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
                    <div class="form-group">
                      <label class="form-label" for="pref-lang-select">Idioma</label>
                      <select id="pref-lang-select" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
                        <option value="es">Español 🇪🇸</option>
                        <option value="en">English 🇺🇸</option>
                      </select>
                    </div>

                    <div class="form-group">
                      <label class="form-label" for="pref-timezone-select">Zona Horaria</label>
                      <select id="pref-timezone-select" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
                        <option value="America/Managua">Managua (GMT-6)</option>
                        <option value="America/Mexico_City">CDMX (GMT-6)</option>
                        <option value="America/Bogota">Bogotá (GMT-5)</option>
                        <option value="America/New_York">Nueva York (GMT-5)</option>
                        <option value="Europe/Madrid">Madrid (GMT+1)</option>
                      </select>
                    </div>
                  </div>

                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
                    <div class="form-group">
                      <label class="form-label" for="pref-date-select">Formato de Fecha</label>
                      <select id="pref-date-select" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
                        <option value="DD/MM/YYYY">DD/MM/YYYY (Ej. 23/07/2026)</option>
                        <option value="MM/DD/YYYY">MM/DD/YYYY (Ej. 07/23/2026)</option>
                        <option value="YYYY-MM-DD">YYYY-MM-DD (Ej. 2026-07-23)</option>
                      </select>
                    </div>

                    <div class="form-group">
                      <label class="form-label" for="pref-time-select">Formato de Hora</label>
                      <select id="pref-time-select" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
                        <option value="24h">24 Horas (Ej. 14:30)</option>
                        <option value="12h">12 Horas AM/PM (Ej. 02:30 PM)</option>
                      </select>
                    </div>
                  </div>

                  <!-- Visual Themes & Business Appearance Section -->
                  <div style="border-top: 1px dashed var(--color-border); padding-top: var(--space-4); margin-top: var(--space-2); display: flex; flex-direction: column; gap: var(--space-4);">
                    <div>
                      <label class="form-label" style="font-weight: 700; font-size: 0.95rem; display: flex; align-items: center; gap: 8px; color: var(--color-text-primary);">
                        🎨 Apariencia y Tema de tu Negocio
                      </label>
                      <span class="text-xs text-secondary">Elige la apariencia que mejor represente a tu negocio. Se aplicará a tu panel y al de todos tus empleados.</span>
                    </div>

                    <!-- Theme Preset Grid (22 Presets) -->
                    <div id="owner-theme-presets-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px;">
                      ${buildOwnerThemeGrid()}
                    </div>
                    <input type="hidden" id="owner-theme-select" value="dark" />

                    <!-- Typography & Components Style -->
                    <div style="background: var(--color-bg-tertiary); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--color-border); display: flex; flex-direction: column; gap: 10px;">
                      <span style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-primary);">Tipografía y Bordes</span>
                      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
                        <div class="form-group">
                          <label class="form-label" for="owner-font-family-select" style="font-size: 0.75rem;">Fuente</label>
                          <select id="owner-font-family-select" class="input input-md" style="font-size: 0.78rem;">
                            <option value="Inter">Inter</option>
                            <option value="Outfit">Outfit</option>
                            <option value="Roboto">Roboto</option>
                            <option value="Poppins">Poppins</option>
                          </select>
                        </div>
                        <div class="form-group">
                          <label class="form-label" for="owner-font-size-select" style="font-size: 0.75rem;">Tamaño Fuente</label>
                          <select id="owner-font-size-select" class="input input-md" style="font-size: 0.78rem;">
                            <option value="12px">Compacto (12px)</option>
                            <option value="14px">Normal (14px)</option>
                            <option value="16px">Grande (16px)</option>
                          </select>
                        </div>
                        <div class="form-group">
                          <label class="form-label" for="owner-border-radius-input" style="font-size: 0.75rem;">Redondeo (px)</label>
                          <input type="number" id="owner-border-radius-input" class="input input-md" min="0" max="24" value="8" style="font-size: 0.78rem;" />
                        </div>
                      </div>
                    </div>

                    <!-- Custom Colors Panel (when theme = custom) -->
                    <div id="owner-custom-colors-panel" style="background: var(--color-bg-tertiary); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--color-border); display: flex; flex-direction: column; gap: 10px; opacity: 0.5; pointer-events: none;">
                      <span style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-primary);">Colores Personalizados <span style="font-size:0.7rem; color:var(--color-accent);">(Modo "Personalizado")</span></span>
                      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px;">
                        <div class="form-group">
                          <label class="form-label" style="font-size:0.7rem;">Color Principal</label>
                          <div class="color-picker-group" style="padding: 2px 6px;">
                            <input type="color" id="owner-primary-color-input" class="color-picker-input" value="#7c75ff" style="width:24px; height:24px;" />
                            <span class="color-hex-text" style="font-size:0.75rem;">#7C75FF</span>
                          </div>
                        </div>
                        <div class="form-group">
                          <label class="form-label" style="font-size:0.7rem;">Fondo Principal</label>
                          <div class="color-picker-group" style="padding: 2px 6px;">
                            <input type="color" id="owner-bg-color-input" class="color-picker-input" value="#0a0a0b" style="width:24px; height:24px;" />
                            <span class="color-hex-text" style="font-size:0.75rem;">#0A0A0B</span>
                          </div>
                        </div>
                        <div class="form-group">
                          <label class="form-label" style="font-size:0.7rem;">Tarjetas</label>
                          <div class="color-picker-group" style="padding: 2px 6px;">
                            <input type="color" id="owner-card-color-input" class="color-picker-input" value="#16161a" style="width:24px; height:24px;" />
                            <span class="color-hex-text" style="font-size:0.75rem;">#16161A</span>
                          </div>
                        </div>
                        <div class="form-group">
                          <label class="form-label" style="font-size:0.7rem;">Menú Lateral</label>
                          <div class="color-picker-group" style="padding: 2px 6px;">
                            <input type="color" id="owner-sidebar-color-input" class="color-picker-input" value="#111113" style="width:24px; height:24px;" />
                            <span class="color-hex-text" style="font-size:0.75rem;">#111113</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Live Preview Box -->
                    <div style="padding: 10px; border-radius: var(--radius-md); border: 1px dashed var(--color-accent); background: rgba(124,117,255,0.04); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                      <span style="font-size: 0.78rem; font-weight: 600; color: var(--color-text-primary);">👁️ Vista Previa en Vivo</span>
                      <div style="display: flex; gap: 6px; align-items: center;">
                        <button type="button" class="btn btn-primary btn-xs">Botón Principal</button>
                        <span style="background: var(--color-success-light); color: var(--color-success); font-size: 0.7rem; padding: 2px 8px; border-radius: 10px; font-weight: 600;">Éxito</span>
                        <span style="background: var(--color-accent-light); color: var(--color-accent); font-size: 0.7rem; padding: 2px 8px; border-radius: 10px; font-weight: 600;">Destacado</span>
                      </div>
                    </div>
                  </div>

                  <button type="submit" id="btn-save-preferences" class="btn btn-primary btn-md" style="align-self: flex-start; margin-top: var(--space-2);">
                    💾 Guardar Preferencias del Negocio
                  </button>
                </form>
              </div>

              <!-- Notifications Alert System Card -->
              <div class="form-card animate-fade-in">
                <span class="card-title-badge">🔔 Notificaciones y Alertas</span>
                
                <form id="owner-alerts-form" style="display:flex; flex-direction:column; gap: var(--space-4);">
                  <div class="form-group">
                    <label class="switch-container">
                      <input type="checkbox" id="alert-system-toggle" class="switch-input" checked />
                      <div>
                        <strong style="font-size:0.85rem; display:block;">Notificaciones del Sistema</strong>
                        <span class="text-xs text-secondary">Mostrar alertas instantáneas en la esquina de la pantalla.</span>
                      </div>
                    </label>
                  </div>

                  <div class="form-group">
                    <label class="switch-container">
                      <input type="checkbox" id="alert-email-toggle" class="switch-input" checked />
                      <div>
                        <strong style="font-size:0.85rem; display:block;">Notificaciones por Correo</strong>
                        <span class="text-xs text-secondary">Recibir resúmenes diarios, alertas de stock mínimo y reportes financieros.</span>
                      </div>
                    </label>
                  </div>

                  <div class="form-group">
                    <label class="switch-container">
                      <input type="checkbox" id="alert-sounds-toggle" class="switch-input" checked />
                      <div>
                        <strong style="font-size:0.85rem; display:block;">Alertas Sonoras y Alarmas</strong>
                        <span class="text-xs text-secondary">Emitir un sonido breve cada vez que ingrese un nuevo pedido del cliente.</span>
                      </div>
                    </label>
                  </div>

                  <button type="submit" id="btn-save-alerts" class="btn btn-accent btn-md" style="align-self: flex-start; margin-top: var(--space-2);">
                    Guardar Configuración de Alertas
                  </button>
                </form>
              </div>

            </div>
          </div>

          <!-- TAB CONTENT: LOCATION -->
          <div class="tab-content-panel" id="panel-tab-location" style="display:none;">
            <div class="settings-grid" style="grid-template-columns:1fr;">
              <div class="form-card animate-fade-in">
                <span class="card-title-badge">📍 Ubicación del Establecimiento</span>
                <p class="text-xs text-secondary" style="margin-bottom:var(--space-4);">
                  Configura la dirección física de tu negocio. Esta información se guardará en la nube y estará disponible en cualquier dispositivo, sesión o navegador.
                </p>

                <form id="owner-location-form" style="display:flex; flex-direction:column; gap:var(--space-4);">

                  <!-- Map container -->
                  <div style="position:relative;">
                    <div id="owner-location-map" style="width:100%; height:280px; border-radius:var(--radius-md); border:1px solid var(--color-border); background:var(--color-bg-tertiary); overflow:hidden;"></div>
                    <div id="owner-location-map-placeholder" style="display:flex; align-items:center; justify-content:center; gap:8px; position:absolute; inset:0; background:var(--color-bg-tertiary); border-radius:var(--radius-md); border:1px solid var(--color-border); color:var(--color-text-secondary); font-size:0.85rem;">
                      <span>🗺️</span> <span>El mapa aparecerá al activar la pestaña</span>
                    </div>
                    <button type="button" id="btn-detect-gps" class="btn btn-secondary btn-sm" style="position:absolute; top:10px; right:10px; z-index:500; display:flex; align-items:center; gap:4px; box-shadow:0 2px 8px rgba(0,0,0,0.3);">
                      📡 Detectar mi ubicación GPS
                    </button>
                  </div>

                  <!-- Coordinates (auto-filled from map) -->
                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">
                    <div class="form-group">
                      <label class="form-label" for="loc-lat-input">Latitud</label>
                      <input type="number" id="loc-lat-input" class="input input-md" step="0.000001" placeholder="12.345678" />
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="loc-lng-input">Longitud</label>
                      <input type="number" id="loc-lng-input" class="input input-md" step="0.000001" placeholder="-86.123456" />
                    </div>
                  </div>

                  <!-- Address fields -->
                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">
                    <div class="form-group">
                      <label class="form-label" for="loc-country-input">País</label>
                      <input type="text" id="loc-country-input" class="input input-md" placeholder="Nicaragua" />
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="loc-department-input">Departamento / Estado</label>
                      <input type="text" id="loc-department-input" class="input input-md" placeholder="Managua" />
                    </div>
                  </div>

                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">
                    <div class="form-group">
                      <label class="form-label" for="loc-municipality-input">Municipio / Ciudad</label>
                      <input type="text" id="loc-municipality-input" class="input input-md" placeholder="Managua" />
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="loc-postalcode-input">Código Postal</label>
                      <input type="text" id="loc-postalcode-input" class="input input-md" placeholder="10001" />
                    </div>
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="loc-address-input">Dirección Exacta</label>
                    <input type="text" id="loc-address-input" class="input input-md" placeholder="Calle principal, #123" />
                  </div>

                  <div class="form-group">
                    <label class="form-label" for="loc-reference-input">Punto de Referencia</label>
                    <textarea id="loc-reference-input" class="input" style="min-height:70px; padding:10px; resize:vertical;" placeholder="Frente al parque central, 2 cuadras al norte del mercado..."></textarea>
                  </div>

                  <!-- Last saved indicator -->
                  <div id="loc-saved-indicator" style="display:none; padding:10px var(--space-3); background:rgba(22,163,74,0.1); border:1px solid rgba(22,163,74,0.3); border-radius:var(--radius-md); font-size:0.82rem; color:#4ade80; display:flex; align-items:center; gap:8px;">
                    ✅ <span id="loc-saved-text">Ubicación guardada</span>
                  </div>

                  <div style="display:flex; gap:var(--space-3); flex-wrap:wrap;">
                    <button type="submit" id="btn-save-location" class="btn btn-primary btn-md" style="display:flex; align-items:center; gap:6px;">
                      💾 Guardar Ubicación
                    </button>
                    <button type="button" id="btn-clear-location" class="btn btn-secondary btn-sm" style="color:#f87171; border-color:#f87171;">
                      🗑️ Limpiar
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>

          <!-- TAB CONTENT: MOBILE NAV CUSTOMIZATION -->
          <div class="tab-content-panel" id="panel-tab-mobile-nav" style="display:none;">
            <div class="form-card animate-fade-in" style="max-width:680px; margin:0 auto;">
              <span class="card-title-badge">📱 Personalizar Barra de Navegación Móvil</span>
              <p style="font-size:0.82rem; color:var(--color-text-secondary); margin:8px 0 20px;">Elige hasta <strong>5 botones</strong> y ordénalos según tu flujo de trabajo. Solo se muestran las opciones disponibles para tu rol.</p>

              <!-- LIVE PREVIEW -->
              <div style="margin-bottom:20px;">
                <p style="font-size:0.78rem; font-weight:600; color:var(--color-text-tertiary); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:8px;">Vista Previa</p>
                <div id="mnc-preview" style="display:flex; align-items:center; justify-content:space-around; background:rgba(18,20,29,0.9); border:1px solid var(--color-border); border-radius:14px; padding:10px 8px; gap:4px;"></div>
              </div>

              <!-- SELECTED TABS (ordered) -->
              <div style="margin-bottom:20px;">
                <p style="font-size:0.78rem; font-weight:600; color:var(--color-text-tertiary); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:10px;">🔢 Orden actual <span id="mnc-count" style="color:var(--color-accent); font-size:0.72rem;">(0/5)</span></p>
                <div id="mnc-selected-list" style="display:flex; flex-direction:column; gap:8px;"></div>
              </div>

              <!-- AVAILABLE TABS catalog -->
              <div style="margin-bottom:24px;">
                <p style="font-size:0.78rem; font-weight:600; color:var(--color-text-tertiary); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:10px;">📋 Botones disponibles</p>
                <div id="mnc-catalog" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(170px,1fr)); gap:8px;"></div>
              </div>

              <!-- ACTIONS -->
              <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <button id="btn-save-mobile-nav" class="btn btn-primary btn-md" style="display:flex;align-items:center;gap:6px;">💾 Guardar Configuración</button>
                <button id="btn-reset-mobile-nav" class="btn btn-secondary btn-sm" style="color:var(--color-text-tertiary);">↩️ Restaurar predeterminados</button>
              </div>
            </div>
          </div>

        </div>
      `
    });

    this.listeners = [];
  }

  mount() {
    const element = this.layout.mount();
    this.afterMount(element);

    // Initial load
    this.loadOwnerProfile(element);
    this.loadEmployeesList(element);
    this.loadEstablishmentLocation(element);
    this.loadMobileNavConfig(element);

    return element;
  }

  afterMount(element) {
    const root = element || this.layout.element;
    if (!root) return;

    // 1. Tab Navigation Click Handler
    const tabsContainer = root.querySelector('#settings-tab-nav');
    if (tabsContainer) {
      tabsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.settings-tab-btn');
        if (!btn) return;

        const selectedTab = btn.getAttribute('data-tab');
        this.state.activeTab = selectedTab;

        // Toggle buttons active class
        tabsContainer.querySelectorAll('.settings-tab-btn').forEach(b => {
          b.classList.toggle('active', b === btn);
        });

        // Toggle content panels
        root.querySelectorAll('.tab-content-panel').forEach(panel => {
          const panelId = panel.getAttribute('id');
          if (panelId === `panel-tab-${selectedTab}`) {
            panel.style.display = 'block';
          } else {
            panel.style.display = 'none';
          }
        });

        // Trigger dynamic queries if switching tab
        if (selectedTab === 'employees') {
          this.loadEmployeesList(root);
        }
        if (selectedTab === 'location') {
          this.loadEstablishmentLocation(root);
        }
        if (selectedTab === 'mobile-nav') {
          this.loadMobileNavConfig(root);
        }
      });
    }

    // 2. Profile Photo Upload Handler
    const clickZone = root.querySelector('#avatar-click-zone');
    const fileInput = root.querySelector('#avatar-file-input');
    if (clickZone && fileInput) {
      clickZone.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => this.handleAvatarUpload(e, root));
    }

    // 3. Profile Form Submission
    const profileForm = root.querySelector('#owner-profile-form');
    if (profileForm) {
      profileForm.addEventListener('submit', (e) => this.handleSaveProfile(e, root));
    }

    // 4. Credentials and Password Form Submission
    const credentialsForm = root.querySelector('#owner-credentials-form');
    if (credentialsForm) {
      credentialsForm.addEventListener('submit', (e) => this.handleUpdateCredentials(e, root));
    }

    // 5. Logout other sessions
    const logoutOthersBtn = root.querySelector('#btn-logout-others');
    if (logoutOthersBtn) {
      logoutOthersBtn.addEventListener('click', () => this.handleLogoutOthers(root));
    }

    // 6. Employees Search Handler
    const searchBox = root.querySelector('#employee-search-box');
    if (searchBox) {
      searchBox.addEventListener('input', (e) => {
        this.state.searchQuery = e.target.value.trim().toLowerCase();
        this.filterEmployees(root);
      });
    }

    // 7. Add Employee Button Modal
    const addWorkerBtn = root.querySelector('#btn-add-worker');
    if (addWorkerBtn) {
      addWorkerBtn.addEventListener('click', () => this.openAddEmployeeModal(root));
    }

    // 8. Preference Form Submission
    const prefForm = root.querySelector('#owner-preferences-form');
    if (prefForm) {
      prefForm.addEventListener('submit', (e) => this.handleSavePreferences(e, root));
    }

    // 9. Alert System Form Submission
    const alertsForm = root.querySelector('#owner-alerts-form');
    if (alertsForm) {
      alertsForm.addEventListener('submit', (e) => this.handleSaveAlertsConfig(e, root));
    }

    // 10. Visual Theme selection grid & pickers
    const themeGrid = root.querySelector('#owner-theme-presets-grid');
    if (themeGrid) {
      themeGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.owner-theme-preset-card');
        if (!card) return;
        this.selectOwnerTheme(card.dataset.theme, root);
      });
    }

    // Color pickers live preview
    root.querySelectorAll('.color-picker-input').forEach(input => {
      input.addEventListener('input', () => {
        const hexText = input.nextElementSibling;
        if (hexText) hexText.textContent = input.value.toUpperCase();
        if (root.querySelector('#owner-theme-select')?.value === 'custom') {
          AppearanceService.applyConfig(this.readOwnerAppearanceFields(root));
        }
      });
    });

    // Typography & Radii live preview
    ['#owner-font-family-select', '#owner-font-size-select', '#owner-border-radius-input'].forEach(sel => {
      root.querySelector(sel)?.addEventListener('input', () => {
        AppearanceService.applyConfig(this.readOwnerAppearanceFields(root));
      });
    });

    // 11. Location Form Submission
    const locationForm = root.querySelector('#owner-location-form');
    if (locationForm) {
      locationForm.addEventListener('submit', (e) => this.handleSaveLocation(e, root));
    }

    // 12. Clear location
    const clearLocBtn = root.querySelector('#btn-clear-location');
    if (clearLocBtn) {
      clearLocBtn.addEventListener('click', () => {
        ['#loc-lat-input','#loc-lng-input','#loc-country-input','#loc-department-input',
         '#loc-municipality-input','#loc-postalcode-input','#loc-address-input','#loc-reference-input'].forEach(sel => {
          const el = root.querySelector(sel);
          if (el) el.value = '';
        });
        const indicator = root.querySelector('#loc-saved-indicator');
        if (indicator) indicator.style.display = 'none';
      });
    }

    // 13. GPS Detection Button
    const gpsBtn = root.querySelector('#btn-detect-gps');
    if (gpsBtn) {
      gpsBtn.addEventListener('click', () => {
        if (!navigator.geolocation) {
          NotificationService.warning('Tu navegador no soporta GPS.');
          return;
        }
        gpsBtn.textContent = '⏳ Detectando...';
        gpsBtn.disabled = true;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = parseFloat(pos.coords.latitude.toFixed(6));
            const lng = parseFloat(pos.coords.longitude.toFixed(6));
            const latEl = root.querySelector('#loc-lat-input');
            const lngEl = root.querySelector('#loc-lng-input');
            if (latEl) latEl.value = lat;
            if (lngEl) lngEl.value = lng;
            gpsBtn.textContent = '📡 Detectar mi ubicación GPS';
            gpsBtn.disabled = false;
            // Move Leaflet marker if map is ready
            if (this._locMap && this._locMarker) {
              this._locMap.setView([lat, lng], 16);
              this._locMarker.setLatLng([lat, lng]);
            }
            NotificationService.success(`Posición GPS: ${lat}, ${lng}`);
          },
          (err) => {
            gpsBtn.textContent = '📡 Detectar mi ubicación GPS';
            gpsBtn.disabled = false;
            NotificationService.error('No se pudo obtener el GPS: ' + err.message);
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA ACTIONS: UBICACIÓN DEL ESTABLECIMIENTO
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Load establishment location from Firebase RTDB (/{companyId}/informacion_local/location)
   * and populate form fields + initialize Leaflet map.
   */
  async loadEstablishmentLocation(root) {
    if (!db || !this.companyId) return;
    try {
      const locRef = ref(db, `${this.companyId}/informacion_local/location`);
      const snap = await get(locRef);
      const loc = snap.exists() ? snap.val() : null;

      const fill = (selector, value) => {
        const el = root.querySelector(selector);
        if (el && value !== undefined && value !== null) el.value = value;
      };

      // Try flat fields from informacion_local (written by firestore.service.js)
      let flatSnap = null;
      try {
        const flatRef = ref(db, `${this.companyId}/informacion_local`);
        flatSnap = await get(flatRef);
      } catch (_) {}
      const flat = (flatSnap && flatSnap.exists()) ? flatSnap.val() : {};

      // Try root company registry node /companies/{companyId} as fallback
      let compSnap = null;
      try {
        const compRef = ref(db, `companies/${this.companyId}`);
        compSnap = await get(compRef);
      } catch (_) {}
      const comp = (compSnap && compSnap.exists()) ? compSnap.val() : {};

      const currentComp = GlobalStore.getState().currentCompany || {};

      // Merge across all storage nodes with fallback hierarchy
      const merged = {
        latitude:     loc?.latitude     ?? loc?.lat          ?? comp.location?.latitude  ?? currentComp.location?.latitude  ?? '',
        longitude:    loc?.longitude    ?? loc?.lng          ?? comp.location?.longitude ?? currentComp.location?.longitude ?? '',
        country:      loc?.country      ?? flat.pais         ?? flat.country  ?? comp.country    ?? currentComp.country    ?? 'Nicaragua',
        department:   loc?.department   ?? flat.estado       ?? flat.state    ?? comp.state      ?? currentComp.state      ?? '',
        municipality: loc?.municipality ?? flat.municipio    ?? flat.city     ?? comp.city       ?? currentComp.city       ?? '',
        postalCode:   loc?.postalCode   ?? flat.codigoPostal ?? flat.postalCode ?? flat.zip     ?? comp.postalCode ?? currentComp.postalCode ?? '',
        address:      loc?.address      ?? flat.direccion    ?? comp.address  ?? currentComp.address  ?? '',
        reference:    loc?.reference    ?? '',
        updatedAt:    loc?.updatedAt    ?? comp.updatedAt    ?? ''
      };

      // Always populate fields
      fill('#loc-lat-input',         merged.latitude);
      fill('#loc-lng-input',         merged.longitude);
      fill('#loc-country-input',     merged.country);
      fill('#loc-department-input',  merged.department);
      fill('#loc-municipality-input',merged.municipality);
      fill('#loc-postalcode-input',  merged.postalCode);
      fill('#loc-address-input',     merged.address);
      fill('#loc-reference-input',   merged.reference);

      const hasAnyData = Boolean(merged.country || merged.department || merged.municipality || merged.postalCode || merged.address || merged.latitude);

      // Show saved indicator
      const indicator = root.querySelector('#loc-saved-indicator');
      const savedText = root.querySelector('#loc-saved-text');
      if (indicator && hasAnyData) indicator.style.display = 'flex';
      if (savedText && hasAnyData) {
        if (merged.updatedAt) {
          const d = new Date(merged.updatedAt);
          savedText.textContent = `Ubicación guardada el ${d.toLocaleDateString()} a las ${d.toLocaleTimeString()}`;
        } else {
          savedText.textContent = 'Datos de ubicación cargados desde la nube ✅';
        }
      }

      // Initialize Leaflet map
      await this._initLocationMap(root, loc);
    } catch (err) {
      console.error('[SettingsView] Error loading location:', err);
    }
  }

  /**
   * Initialize (or refresh) the Leaflet map inside the location tab.
   * If a location already exists, centers on it; otherwise defaults to Managua, Nicaragua.
   */
  async _initLocationMap(root, existingLoc) {
    const mapEl = root.querySelector('#owner-location-map');
    const placeholder = root.querySelector('#owner-location-map-placeholder');
    if (!mapEl) return;

    // Hide placeholder
    if (placeholder) placeholder.style.display = 'none';

    const defaultLat = existingLoc?.latitude ?? existingLoc?.lat ?? 12.1328;
    const defaultLng = existingLoc?.longitude ?? existingLoc?.lng ?? -86.2982;
    const defaultZoom = existingLoc ? 15 : 12;

    // Load Leaflet if not already loaded
    if (typeof window.L === 'undefined') {
      await new Promise((resolve, reject) => {
        if (document.getElementById('leaflet-css')) { resolve(); return; }
        const css = document.createElement('link');
        css.id = 'leaflet-css';
        css.rel = 'stylesheet';
        css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(css);

        const s = document.createElement('script');
        s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    // If map instance already exists, destroy it first
    if (this._locMap) {
      try { this._locMap.remove(); } catch (_) {}
      this._locMap = null;
      this._locMarker = null;
    }

    const L = window.L;
    const map = L.map(mapEl).setView([defaultLat, defaultLng], defaultZoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    const marker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(map);
    marker.bindPopup('📍 Arrastra el pin para ajustar la ubicación').openPopup();

    // When marker is dragged, update coordinate inputs
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      const latEl = root.querySelector('#loc-lat-input');
      const lngEl = root.querySelector('#loc-lng-input');
      if (latEl) latEl.value = parseFloat(pos.lat.toFixed(6));
      if (lngEl) lngEl.value = parseFloat(pos.lng.toFixed(6));
    });

    // Clicking on map moves the marker
    map.on('click', (e) => {
      marker.setLatLng(e.latlng);
      const latEl = root.querySelector('#loc-lat-input');
      const lngEl = root.querySelector('#loc-lng-input');
      if (latEl) latEl.value = parseFloat(e.latlng.lat.toFixed(6));
      if (lngEl) lngEl.value = parseFloat(e.latlng.lng.toFixed(6));
    });

    this._locMap = map;
    this._locMarker = marker;

    // Force resize to render correctly (lazy tab rendering fix)
    setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 150);
  }

  /**
   * Save establishment location to Firebase RTDB.
   * Path: /{companyId}/informacion_local/location
   * Also updates companies/{companyId}/location for the company registry.
   */
  async handleSaveLocation(e, root) {
    e.preventDefault();

    const getVal = (sel) => {
      const el = root.querySelector(sel);
      return el ? el.value.trim() : '';
    };

    const latRaw = getVal('#loc-lat-input');
    const lngRaw = getVal('#loc-lng-input');
    const lat = (latRaw && !isNaN(parseFloat(latRaw))) ? parseFloat(latRaw) : null;
    const lng = (lngRaw && !isNaN(parseFloat(lngRaw))) ? parseFloat(lngRaw) : null;

    const country = getVal('#loc-country-input');
    const department = getVal('#loc-department-input');
    const municipality = getVal('#loc-municipality-input');
    const postalCode = getVal('#loc-postalcode-input') || getVal('#loc-zip-input');
    const address = getVal('#loc-address-input');
    const reference = getVal('#loc-reference-input');

    if (!department && !municipality && !address && !country && lat === null) {
      NotificationService.error('Ingresa al menos el departamento, municipio, dirección o coordenadas GPS.');
      return;
    }

    const saveBtn = root.querySelector('#btn-save-location');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ Guardando...'; }

    const locationData = {
      latitude: lat,
      longitude: lng,
      country,
      department,
      municipality,
      postalCode,
      address,
      reference,
      updatedAt: new Date().toISOString()
    };

    try {
      const updates = {};
      // 1. Primary: location sub-node (new canonical format)
      updates[`${this.companyId}/informacion_local/location`] = locationData;
      // 2. Sync flat fields in informacion_local (used by firestore.service.js & Super-Admin)
      updates[`${this.companyId}/informacion_local/pais`]          = country;
      updates[`${this.companyId}/informacion_local/estado`]         = department;
      updates[`${this.companyId}/informacion_local/municipio`]      = municipality;
      updates[`${this.companyId}/informacion_local/codigoPostal`]   = postalCode;
      updates[`${this.companyId}/informacion_local/direccion`]      = address;
      // 3. Secondary: company registry node (for Super Admin and multi-tenant reads)
      updates[`companies/${this.companyId}/location`]               = locationData;
      updates[`companies/${this.companyId}/country`]                = country;
      updates[`companies/${this.companyId}/city`]                   = municipality;
      updates[`companies/${this.companyId}/state`]                  = department;
      updates[`companies/${this.companyId}/postalCode`]             = postalCode;

      // 4. Sync main branch address info
      updates[`${this.companyId}/branches/main/country`]    = country;
      updates[`${this.companyId}/branches/main/state`]      = department;
      updates[`${this.companyId}/branches/main/city`]       = municipality;
      updates[`${this.companyId}/branches/main/postalCode`] = postalCode;
      updates[`${this.companyId}/branches/main/address`]    = address;

      // Save to local cache first for immediate offline availability
      await LocalStorageDBService.setCache(`${this.companyId}/informacion_local/location`, locationData);

      if (db && navigator.onLine) {
        try {
          await update(ref(db), updates);
        } catch (netErr) {
          console.warn('[SettingsView] Online location update failed, queuing offline:', netErr.message);
          await OfflineSyncService.write('update', `${this.companyId}/informacion_local/location`, locationData, 'Guardar Ubicación');
        }
      } else {
        await OfflineSyncService.write('update', `${this.companyId}/informacion_local/location`, locationData, 'Guardar Ubicación');
      }

      // Update GlobalStore in real-time
      const { currentCompany } = GlobalStore.getState();
      if (currentCompany) {
        GlobalStore.set({
          currentCompany: {
            ...currentCompany,
            location: locationData,
            country,
            state: department,
            city: municipality,
            postalCode
          }
        });
      }

      // Show success indicator
      const indicator = root.querySelector('#loc-saved-indicator');
      const savedText = root.querySelector('#loc-saved-text');
      if (indicator) indicator.style.display = 'flex';
      if (savedText) savedText.textContent = 'Ubicación guardada correctamente ✅';

      NotificationService.success('📍 Ubicación del establecimiento guardada.');
    } catch (err) {
      console.error('[SettingsView] Error saving location:', err);
      NotificationService.error('Error al guardar la ubicación: ' + err.message);
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Guardar Ubicación'; }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA ACTIONS: MI CUENTA
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Load owner profile from Firebase RTDB and current session
   */
  async loadOwnerProfile(root) {
    if (!this.uid) return;

    try {
      let val = null;

      if (db && navigator.onLine) {
        try {
          const userRef = ref(db, `users/${this.uid}`);
          const snap = await get(userRef);
          if (snap.exists()) {
            val = snap.val() || {};
            await LocalStorageDBService.setCache(`users/${this.uid}`, val);
          }
        } catch (e) {
          console.warn('[SettingsView] RTDB user read failed, falling back to cache:', e.message);
        }
      }

      if (!val) {
        val = await LocalStorageDBService.getCache(`users/${this.uid}`);
      }

      if (!val) {
        const { currentUser } = GlobalStore.getState();
        if (currentUser && currentUser.uid === this.uid) {
          val = currentUser;
        }
      }

      if (val) {
        this.state.ownerProfile = val;

        const nameInput = root.querySelector('#owner-name-input');
        const phoneInput = root.querySelector('#owner-phone-input');
        const infoInput = root.querySelector('#owner-info-input');
        const emailInput = root.querySelector('#owner-email-input');
        const imageIdInput = root.querySelector('#owner-photo-imageId');

        if (nameInput) nameInput.value = val.displayName || this.currentUser.displayName || '';
        if (phoneInput) phoneInput.value = val.phone || val.telefono || '';
        if (infoInput) infoInput.value = val.personalInfo || '';
        if (emailInput) emailInput.value = val.email || this.currentUser.email || '';
        if (imageIdInput && val.avatarImageId) imageIdInput.value = val.avatarImageId;

        // Resolve avatar image via ImageStorageService (cache-first)
        let previewUrl = '';
        if (val.avatarImageId) {
          previewUrl = await ImageStorageService.getImageUrl(val.avatarImageId).catch(() => '') || '';
        } else if (val.photoURL) {
          previewUrl = val.photoURL;
        }
        this.renderAvatarPreview(previewUrl, val.displayName || this.currentUser.displayName || '', root);

        // Load visual and general preferences
        if (val.preferences) {
          this.state.preferences = { ...this.state.preferences, ...val.preferences };
          this.populatePreferencesForm(root);
          this.applyVisualPreferences(this.state.preferences.theme);
        }
      }
    } catch (err) {
      console.error('[SettingsView] Error loading owner profile:', err);
    }
  }

  renderAvatarPreview(photoURL, name, root) {
    const imgEl = root.querySelector('#owner-avatar-preview');
    const placeholderEl = root.querySelector('#owner-avatar-placeholder');

    if (photoURL && imgEl && placeholderEl) {
      imgEl.src = photoURL;
      imgEl.style.display = 'block';
      placeholderEl.style.display = 'none';
    } else if (imgEl && placeholderEl) {
      imgEl.style.display = 'none';
      placeholderEl.style.display = 'flex';
      placeholderEl.textContent = (name || 'U')[0].toUpperCase();
    }
  }

  async handleAvatarUpload(e, root) {
    const file = e.target.files[0];
    if (!file) return;

    // Validate format via ImageStorageService
    const val = ImageStorageService.validateFormat(file);
    if (!val.valid) {
      NotificationService.error(val.error);
      return;
    }

    // Show loading state on the avatar zone
    const clickZone = root.querySelector('#avatar-click-zone');
    if (clickZone) clickZone.style.opacity = '0.5';

    try {
      const existingImageId = root.querySelector('#owner-photo-imageId')?.value?.trim();
      let imageId;

      if (existingImageId) {
        NotificationService.info('🗑️ Eliminando foto anterior de Firebase...');
        const deleted = await ImageStorageService.deleteImage(existingImageId);
        if (deleted) {
          NotificationService.success('🗑️ Foto anterior eliminada de Firebase correctamente.');
        } else {
          console.warn('[SettingsView] Old image deletion returned false — proceeding to upload anyway.');
        }
        NotificationService.info('⬆️ Procesando y guardando nueva foto de perfil...');
        imageId = await ImageStorageService.uploadImage(file, 'PROFILE');
      } else {
        NotificationService.info('⬆️ Procesando y guardando foto de perfil...');
        imageId = await ImageStorageService.uploadImage(file, 'PROFILE');
      }


      // ✅ PERSIST avatarImageId to Firebase RTDB immediately (no need to wait for "Guardar Perfil")
      const avatarUpdates = {};
      avatarUpdates[`users/${this.uid}/avatarImageId`] = imageId;
      avatarUpdates[`${this.companyId}/employees/${this.uid}/avatarImageId`] = imageId;
      await update(ref(db), avatarUpdates);

      // Store imageId in hidden input so handleSaveProfile also sees it
      const imageIdInput = root.querySelector('#owner-photo-imageId');
      if (imageIdInput) imageIdInput.value = imageId;

      // Build ObjectURL and update preview
      const objectUrl = await ImageStorageService.getImageUrl(imageId);
      const name = root.querySelector('#owner-name-input')?.value || this.currentUser.displayName || 'U';
      this.renderAvatarPreview(objectUrl || '', name, root);

      NotificationService.success('✅ Foto de perfil guardada. Se mostrará en cada sesión.');
    } catch (err) {
      console.error('[SettingsView] Error uploading photo:', err);
      NotificationService.error('Error al procesar la imagen. Intenta con otro archivo.');
    } finally {
      if (clickZone) clickZone.style.opacity = '1';
    }
  }


  async handleSaveProfile(e, root) {
    e.preventDefault();

    const saveBtn = root.querySelector('#btn-save-profile');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando...';
    }

    const displayName = root.querySelector('#owner-name-input').value.trim();
    const phone = root.querySelector('#owner-phone-input').value.trim();
    const personalInfo = root.querySelector('#owner-info-input').value.trim();
    const avatarImageId = root.querySelector('#owner-photo-imageId')?.value?.trim() || null;

    try {
      const timestamp = Date.now();
      const updates = {};
      
      updates[`users/${this.uid}/displayName`] = displayName;
      updates[`users/${this.uid}/phone`] = phone;
      updates[`users/${this.uid}/personalInfo`] = personalInfo;
      if (avatarImageId) updates[`users/${this.uid}/avatarImageId`] = avatarImageId;
      updates[`users/${this.uid}/updatedAt`] = serverTimestamp();

      // Update in employees too
      if (this.companyId) {
        updates[`${this.companyId}/employees/${this.uid}/displayName`] = displayName;
        if (avatarImageId) updates[`${this.companyId}/employees/${this.uid}/avatarImageId`] = avatarImageId;
        updates[`${this.companyId}/employees/${this.uid}/phone`] = phone;
      }

      // Update current Firebase user profile if online
      const firebaseUser = auth?.currentUser;
      if (firebaseUser && navigator.onLine) {
        try {
          await updateProfile(firebaseUser, { displayName });
        } catch (_) {}
      }

      // 1. Update IndexedDB cache for current user session immediately
      const profileUpdates = {
        displayName,
        phone,
        personalInfo,
        ...(avatarImageId ? { avatarImageId } : {})
      };
      const existing = (await LocalStorageDBService.getCache(`users/${this.uid}`)) || {};
      const updatedUser = { ...existing, ...profileUpdates };
      await LocalStorageDBService.setCache(`users/${this.uid}`, updatedUser);

      // 2. Update active session in GlobalStore & LocalStorageDBService
      const { currentUser } = GlobalStore.getState();
      if (currentUser && currentUser.uid === this.uid) {
        const newSession = { ...currentUser, ...updatedUser };
        GlobalStore.set({ currentUser: newSession });
        await LocalStorageDBService.setCache('user_session', newSession);
        await LocalStorageDBService.setUserSession(newSession);
      }

      if (db && navigator.onLine) {
        try {
          await update(ref(db), updates);
        } catch (netErr) {
          console.warn('[SettingsView] Online profile update failed, queuing offline:', netErr.message);
          await OfflineSyncService.write('update', `users/${this.uid}`, profileUpdates, 'Actualizar Perfil');
        }
      } else {
        await OfflineSyncService.write('update', `users/${this.uid}`, profileUpdates, 'Actualizar Perfil');
      }

      // Audit Log
      await FirestoreService.logAudit({
        action: 'OWNER_UPDATE_PROFILE',
        companyId: this.companyId,
        description: `El usuario actualizó sus datos personales de cuenta.`
      }).catch(() => {});

      NotificationService.success('✅ Perfil de usuario guardado localmente y sincronizado.');
    } catch (err) {
      console.error('[SettingsView] Error saving profile:', err);
      NotificationService.error('Error al guardar perfil: ' + err.message);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Guardar Perfil';
      }
    }
  }

  async handleUpdateCredentials(e, root) {
    e.preventDefault();

    const emailInput = root.querySelector('#owner-email-input');
    const currentPassInput = root.querySelector('#owner-current-password');
    const newEmailInput = root.querySelector('#owner-new-email-input');
    const newPassInput = root.querySelector('#owner-new-password');
    const confirmPassInput = root.querySelector('#owner-confirm-password');
    const updateBtn = root.querySelector('#btn-update-credentials');

    const currentPassword = currentPassInput.value;
    const newEmail = newEmailInput.value.trim();
    const newPassword = newPassInput.value;
    const confirmPassword = confirmPassInput.value;

    if (!currentPassword) {
      NotificationService.error('Se requiere la contraseña actual para guardar cambios de credenciales.');
      return;
    }

    if (newPassword && newPassword.length < 6) {
      NotificationService.error('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      NotificationService.error('La confirmación de la contraseña no coincide con la nueva contraseña.');
      return;
    }

    if (updateBtn) {
      updateBtn.disabled = true;
      updateBtn.textContent = 'Actualizando credenciales...';
    }

    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) throw new Error('Sesión de usuario no encontrada.');

      // Step 1: Reauthenticate owner user
      console.log('[SettingsView] Reautenticando propietario con contraseña actual...');
      const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
      await reauthenticateWithCredential(firebaseUser, credential);
      console.log('[SettingsView] Reautenticación exitosa.');

      const updates = {};
      let emailChanged = false;
      let passwordChanged = false;

      // Step 2: Change email if specified
      if (newEmail && newEmail !== firebaseUser.email) {
        console.log('[SettingsView] Actualizando correo en Firebase Auth a:', newEmail);
        await updateEmail(firebaseUser, newEmail);
        updates[`users/${this.uid}/email`] = newEmail;
        updates[`${this.companyId}/employees/${this.uid}/email`] = newEmail;
        updates[`companies/${this.companyId}/ownerEmail`] = newEmail;
        updates[`${this.companyId}/informacion_local/correo`] = newEmail;
        emailChanged = true;
      }

      // Step 3: Change password if specified
      if (newPassword) {
        console.log('[SettingsView] Actualizando contraseña en Firebase Auth...');
        await updatePassword(firebaseUser, newPassword);
        updates[`users/${this.uid}/storedPassword`] = newPassword;
        updates[`${this.companyId}/employees/${this.uid}/storedPassword`] = newPassword;
        updates[`companies/${this.companyId}/ownerPassword`] = newPassword;
        passwordChanged = true;
      }

      if (emailChanged || passwordChanged) {
        updates[`users/${this.uid}/updatedAt`] = serverTimestamp();
        await update(ref(db), updates);

        // Audit Log
        await FirestoreService.logAudit({
          action: 'OWNER_UPDATE_CREDENTIALS',
          companyId: this.companyId,
          description: `El dueño actualizó sus credenciales de seguridad. Correo cambiado: ${emailChanged}, Contraseña cambiada: ${passwordChanged}.`
        });

        // Update GlobalStore email
        if (emailChanged) {
          const updatedUser = { ...this.currentUser, email: newEmail };
          GlobalStore.set({ currentUser: updatedUser });
          emailInput.value = newEmail;
        }

        newEmailInput.value = '';
        newPassInput.value = '';
        confirmPassInput.value = '';
        currentPassInput.value = '';

        NotificationService.success('Credenciales de acceso actualizadas con éxito.');
      } else {
        NotificationService.info('No se especificaron cambios en correo o contraseña.');
      }

    } catch (err) {
      console.error('[SettingsView] Error updating credentials:', err);
      let errMsg = err.message || err;
      if (err.code === 'auth/wrong-password') {
        errMsg = 'La contraseña actual ingresada es incorrecta.';
      } else if (err.code === 'auth/invalid-credential') {
        errMsg = 'Credencial de acceso incorrecta o inválida.';
      } else if (err.code === 'auth/email-already-in-use') {
        errMsg = 'El correo electrónico ya está siendo usado por otra cuenta.';
      }
      NotificationService.error(`Fallo en seguridad: ${errMsg}`);
    } finally {
      if (updateBtn) {
        updateBtn.disabled = false;
        updateBtn.textContent = 'Actualizar Credenciales';
      }
    }
  }

  async handleLogoutOthers(root) {
    if (!confirm('¿Deseas cerrar las sesiones activas en otros navegadores o dispositivos?')) return;

    try {
      // Firebase Client Auth SDK does not natively support token revocation/session management from client side,
      // but we register the intent in audit logs and update a session revocation timestamp to synchronize clients.
      const timestamp = Date.now();
      await update(ref(db, `users/${this.uid}`), {
        forceRevocationBefore: timestamp,
        updatedAt: serverTimestamp()
      });

      await FirestoreService.logAudit({
        action: 'OWNER_REVOKE_SESSIONS',
        companyId: this.companyId,
        description: `El dueño solicitó revocar todas las sesiones activas en otros dispositivos.`
      });

      NotificationService.success('Se ha solicitado el cierre de sesiones en otros dispositivos.');
    } catch (err) {
      console.error('[SettingsView] Error revoking sessions:', err);
      NotificationService.error('Error al solicitar cierre de sesiones.');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA ACTIONS: GESTIÓN DE EMPLEADOS
  // ═══════════════════════════════════════════════════════════════════════════

  getSYSTEM_PERMISSIONS() {
    return [
      // Restaurante / Alimentos
      { key: 'tomar_pedidos', label: '🍽️ Tomar pedidos' },
      { key: 'editar_pedidos', label: '📝 Editar pedidos' },
      { key: 'cancelar_pedidos', label: '❌ Cancelar pedidos' },
      { key: 'cobrar_pedidos', label: '💵 Cobrar pedidos' },
      { key: 'administrar_caja', label: '🏦 Administrar caja' },
      { key: 'administrar_mesas', label: '📍 Administrar mesas' },
      { key: 'gestionar_reservas', label: '📅 Gestionar reservas' },

      // Servicios Múltiples / Citas / Rentas
      { key: 'gestionar_servicios', label: '🛠️ Gestionar servicios / tareas' },
      { key: 'gestionar_citas', label: '🗓️ Gestionar citas y agenda' },
      { key: 'gestionar_alquileres', label: '🔑 Gestionar alquileres y rentas' },
      { key: 'gestionar_vehiculos', label: '🚗 Gestionar vehículos / delivery' },
      { key: 'gestionar_herramientas', label: '🔧 Gestionar herramientas y equipos' },
      { key: 'gestionar_clientes', label: '👥 Gestionar clientes' },
      { key: 'registrar_ubicacion_clientes', label: '📍 Registrar ubicación de clientes' },

      // Operaciones Generales
      { key: 'ver_reportes', label: '📊 Ver reportes' },
      { key: 'gestionar_productos', label: '📦 Gestionar productos y catálogo' },
      { key: 'gestionar_categorias', label: '📁 Gestionar categorías' },
      { key: 'gestionar_inventario', label: '🗄️ Gestionar inventario / stock' },
      { key: 'administrar_empleados', label: '👥 Administrar empleados' },
      { key: 'ver_estadisticas', label: '📈 Ver estadísticas' },
      { key: 'configurar_impresoras', label: '🖨️ Configurar impresoras' },
      { key: 'recibir_notificaciones', label: '🔔 Recibir notificaciones' },
      { key: 'administrar_promociones', label: '🏷️ Administrar promociones' }
    ];
  }

  renderPermissionsCheckboxes(existingPermissions = {}) {
    return this.getSYSTEM_PERMISSIONS().map(p => {
      const isChecked = existingPermissions[p.key] === true ? 'checked' : '';
      return `
        <label style="display:flex; align-items:center; gap:8px; font-size:0.75rem; background:rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 6px 10px; border-radius: 6px; cursor:pointer; user-select:none;">
          <input type="checkbox" class="permission-chk-input" data-permission="${p.key}" ${isChecked} style="cursor:pointer;" />
          <span style="color:var(--color-text-secondary);">${p.label}</span>
        </label>
      `;
    }).join('');
  }

  setupModalCargoListeners(modalOverlay, selectId, customContainerId, customInputId) {
    const select = modalOverlay.querySelector(`#${selectId}`);
    const customContainer = modalOverlay.querySelector(`#${customContainerId}`);
    const customInput = modalOverlay.querySelector(`#${customInputId}`);

    const updateUI = (isUserChange = false) => {
      const val = select.value;
      if (val === 'CUSTOM') {
        customContainer.style.display = 'block';
        customInput.required = true;
      } else {
        customContainer.style.display = 'none';
        customInput.required = false;
        if (isUserChange) customInput.value = '';
      }
      if (isUserChange) {
        this.applyPermissionPresets(val, modalOverlay);
      }
    };

    select.addEventListener('change', () => updateUI(true));
    // Initial load
    updateUI(false);
  }

  applyPermissionPresets(roleValue, modalEl) {
    const checkboxes = modalEl.querySelectorAll('.permission-chk-input');
    const presets = {
      MANAGER: {
        tomar_pedidos: true, editar_pedidos: true, cancelar_pedidos: true, cobrar_pedidos: true,
        administrar_caja: true, ver_reportes: true, gestionar_productos: true, gestionar_categorias: true,
        gestionar_inventario: true, administrar_empleados: true, administrar_mesas: true, gestionar_reservas: true,
        ver_estadisticas: true, configurar_impresoras: true, recibir_notificaciones: true, administrar_promociones: true,
        gestionar_clientes: true
      },
      WAITER: {
        tomar_pedidos: true, editar_pedidos: true, recibir_notificaciones: true
      },
      CASHIER: {
        cobrar_pedidos: true, administrar_caja: true, recibir_notificaciones: true
      },
      KITCHEN: {
        recibir_notificaciones: true
      },
      CUSTOM: {} // Starts empty
    };

    const selectedPreset = presets[roleValue] || {};
    checkboxes.forEach(chk => {
      const key = chk.getAttribute('data-permission');
      chk.checked = selectedPreset[key] === true;
    });
  }

  extractModalPermissions(modalEl) {
    const permissions = {};
    modalEl.querySelectorAll('.permission-chk-input').forEach(chk => {
      const key = chk.getAttribute('data-permission');
      permissions[key] = chk.checked;
    });
    return permissions;
  }

  /**
   * Load employees belonging to the company
   */
  async loadEmployeesList(root) {
    if (!db || !this.companyId) return;

    try {
      const employees = await FirestoreService.getCompanyEmployees(this.companyId);

      // Filter out OWNER and SUPER_ADMIN roles, as owner cannot administer them
      const list = employees
        .filter(emp => emp.role !== 'OWNER' && emp.role !== 'SUPER_ADMIN')
        .map(emp => ({
          uid: emp.uid || emp.id,
          id: emp.uid || emp.id,
          displayName: emp.displayName || 'Empleado sin nombre',
          email: emp.email || '',
          phone: emp.phone || emp.telefono || '—',
          role: emp.role || 'WAITER',
          customRole: emp.customRole || '',
          active: emp.active !== false,
          permissions: emp.permissions || {}
        }));

      this.state.employees = list;
      this.filterEmployees(root);
    } catch (err) {
      console.error('[SettingsView] Error loading employees:', err);
      NotificationService.error('Fallo al obtener empleados de la base de datos.');
    }
  }

  filterEmployees(root) {
    const query = this.state.searchQuery;
    if (query) {
      this.state.filteredEmployees = this.state.employees.filter(emp =>
        emp.displayName.toLowerCase().includes(query) ||
        emp.email.toLowerCase().includes(query) ||
        (emp.customRole || '').toLowerCase().includes(query)
      );
    } else {
      this.state.filteredEmployees = [...this.state.employees];
    }
    this.renderEmployeesTable(root);
  }

  renderEmployeesTable(root) {
    const tbody = root.querySelector('#employees-list-tbody');
    if (!tbody) return;

    const list = this.state.filteredEmployees;

    if (list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 24px; text-align: center; color: var(--color-text-tertiary);">
            No se encontraron empleados registrados.
          </td>
        </tr>
      `;
      return;
    }

    const roleLabels = {
      MANAGER: 'Gerente / Admin',
      CASHIER: 'Cajero',
      WAITER: 'Mesero / Salonero',
      KITCHEN: 'Cocinero / Chef'
    };

    tbody.innerHTML = list.map(emp => {
      const displayCargo = emp.customRole || roleLabels[emp.role] || emp.role;
      const cargoLabel = `<span class="badge" style="background: rgba(255,255,255,0.04); border: 1px solid var(--color-border); color: var(--color-text-primary); font-size:0.75rem;">${this.escapeHTML(displayCargo)}</span>`;

      const statusBadge = emp.active
        ? `<span style="display:inline-flex; align-items:center; gap:4px; font-size: 0.72rem; font-weight: 600; padding: 2px 8px; border-radius:12px; background: rgba(16,185,129,0.15); color: #34d399; border: 1px solid rgba(16,185,129,0.25);">
             <span class="pulse-dot" style="background:#10b981;"></span> Activo
           </span>`
        : `<span style="display:inline-flex; align-items:center; gap:4px; font-size: 0.72rem; font-weight: 600; padding: 2px 8px; border-radius:12px; background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.25);">
             <span class="pulse-dot" style="background:#ef4444;"></span> Inactivo
           </span>`;

      return `
        <tr style="border-bottom: 1px solid var(--color-border-primary, rgba(255,255,255,0.05));">
          <td style="padding: 10px 14px; font-weight: 600; color: var(--color-text-primary);">${this.escapeHTML(emp.displayName)}</td>
          <td style="padding: 10px 14px;">
            <div style="font-size:0.8rem; color:var(--color-text-secondary); font-family:monospace;">${this.escapeHTML(emp.email)}</div>
            <div style="font-size:0.72rem; color:var(--color-text-tertiary);">${this.escapeHTML(emp.phone)}</div>
          </td>
          <td style="padding: 10px 14px;">${cargoLabel}</td>
          <td style="padding: 10px 14px; font-weight: 500; color: var(--color-accent); font-size: 0.8rem;">
            ${roleLabels[emp.role] || emp.role}
          </td>
          <td style="padding: 10px 14px;">
            ${statusBadge}
          </td>
          <td style="padding: 10px 14px; text-align: right;">
            <div style="display: inline-flex; gap: 4px;">
              <button class="btn btn-secondary btn-xs btn-edit-worker" data-uid="${emp.uid}" title="Editar Info">✏️ Editar</button>
              <button class="btn btn-secondary btn-xs btn-key-worker" data-uid="${emp.uid}" title="Cambiar Contraseña">🔑 Clave</button>
              <button class="btn btn-danger btn-xs btn-delete-worker" data-uid="${emp.uid}" style="background:rgba(239,68,68,0.1); color:#f87171; border-color:rgba(239,68,68,0.2);" title="Dar de baja">🗑️ Baja</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Bind Action Listeners
    tbody.querySelectorAll('.btn-edit-worker').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const uid = e.target.getAttribute('data-uid');
        this.openEditEmployeeModal(uid, root);
      });
    });

    tbody.querySelectorAll('.btn-key-worker').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const uid = e.target.getAttribute('data-uid');
        this.openResetEmployeePasswordModal(uid, root);
      });
    });

    tbody.querySelectorAll('.btn-delete-worker').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const uid = e.target.getAttribute('data-uid');
        this.handleDeleteEmployee(uid, root);
      });
    });
  }

  openAddEmployeeModal(root) {
    // Check if modal container exists
    let modalOverlay = document.getElementById('settings-worker-modal');
    if (modalOverlay) modalOverlay.remove();

    const rolesSelectOptions = `
      <option value="WAITER">Mesero / Salonero</option>
      <option value="KITCHEN">Cocinero / Chef</option>
      <option value="CASHIER">Cajero</option>
      <option value="MANAGER">Gerente / Administrador</option>
      <option value="CUSTOM">Cargo Personalizado...</option>
    `;

    const modalHTML = `
      <div id="settings-worker-modal" class="modal-overlay" style="position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 16px;">
        <div class="card p-6" style="background: #111115; border: 1px solid var(--color-border); border-radius: 12px; width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto; box-shadow: 0 15px 30px rgba(0,0,0,0.5); color: var(--color-text-primary);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 12px;">
            <h3 class="text-md font-bold" style="margin: 0;">👥 Registrar Nuevo Trabajador</h3>
            <button id="close-worker-modal-btn" style="background: transparent; border: none; color: #9ca3af; font-size: 1.5rem; cursor: pointer; line-height: 1;">&times;</button>
          </div>
          
          <form id="add-worker-form" style="display:flex; flex-direction:column; gap: var(--space-3);">
            <div class="form-group">
              <label class="form-label" for="add-w-name">Nombre Completo <span class="form-label-required"></span></label>
              <input type="text" id="add-w-name" class="input input-md" placeholder="Ej. Carlos Torres" required />
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
              <div class="form-group">
                <label class="form-label" for="add-w-role">Cargo / Rol <span class="form-label-required"></span></label>
                <select id="add-w-role" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
                  ${rolesSelectOptions}
                </select>
              </div>
              <div class="form-group" id="add-w-custom-container" style="display:none;">
                <label class="form-label" for="add-w-custom">Especificar Cargo <span class="form-label-required"></span></label>
                <input type="text" id="add-w-custom" class="input input-md" placeholder="Ej. Bartender, Recepcionista" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="add-w-phone">Teléfono</label>
              <input type="text" id="add-w-phone" class="input input-md" placeholder="Ej. +505 8888-8888" />
            </div>

            <div class="form-group">
              <label class="form-label" for="add-w-email">Correo Electrónico <span class="form-label-required"></span></label>
              <input type="email" id="add-w-email" class="input input-md" placeholder="empleado@correo.com" required />
            </div>

            <div class="form-group">
              <label class="form-label" for="add-w-pass">Contraseña Inicial <span class="form-label-required"></span></label>
              <input type="password" id="add-w-pass" class="input input-md" placeholder="Min. 6 caracteres" minlength="6" required />
            </div>

            <!-- Permisos checklist -->
            <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px; margin-top: 4px;">
              <label class="form-label" style="font-weight: 700; margin-bottom: 8px; display: block; color: var(--color-accent);">🔑 Permisos del Sistema</label>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; max-height: 180px; overflow-y: auto; padding-right: 4px;">
                ${this.renderPermissionsCheckboxes()}
              </div>
            </div>

            <div style="display: flex; gap: var(--space-3); justify-content: flex-end; margin-top: var(--space-3); border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px;">
              <button type="button" id="btn-cancel-add-w" class="btn btn-secondary btn-sm">Cancelar</button>
              <button type="submit" id="btn-submit-add-w" class="btn btn-primary btn-sm">Registrar Empleado</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const overlay = document.getElementById('settings-worker-modal');
    const form = document.getElementById('add-worker-form');
    const closeBtn = document.getElementById('close-worker-modal-btn');
    const cancelBtn = document.getElementById('btn-cancel-add-w');
    const submitBtn = document.getElementById('btn-submit-add-w');

    const closeModal = () => overlay.remove();

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    // Setup Presets and Cargo toggler
    this.setupModalCargoListeners(overlay, 'add-w-role', 'add-w-custom-container', 'add-w-custom');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const displayName = document.getElementById('add-w-name').value.trim();
      const roleSelectVal = document.getElementById('add-w-role').value;
      const customRoleInputVal = document.getElementById('add-w-custom').value.trim();
      const phone = document.getElementById('add-w-phone').value.trim();
      const email = document.getElementById('add-w-email').value.trim();
      const password = document.getElementById('add-w-pass').value;

      // Extract checkboxes permissions
      const permissions = this.extractModalPermissions(overlay);

      // Determine role & customRole
      const role = roleSelectVal === 'CUSTOM' ? 'WAITER' : roleSelectVal;
      const customRole = roleSelectVal === 'CUSTOM' ? customRoleInputVal : '';

      submitBtn.disabled = true;
      submitBtn.textContent = 'Creando cuenta...';

      try {
        console.log('[SettingsView] Creando cuenta del empleado:', email);
        const uid = await AuthService.createUser(email, password, {
          displayName,
          role,
          customRole,
          companyId: this.companyId,
          branchId: 'main',
          permissions
        });

        // Save phone details to user profile in RTDB if defined
        if (phone && db) {
          await update(ref(db, `users/${uid}`), { phone });
          await update(ref(db, `${this.companyId}/employees/${uid}`), { phone });
        }

        // Audit Log
        await FirestoreService.logAudit({
          action: 'OWNER_ADD_EMPLOYEE',
          companyId: this.companyId,
          description: `El dueño registró al empleado ${displayName} (${email}) con cargo de ${customRole || role}.`
        });

        NotificationService.success(`Empleado "${displayName}" registrado exitosamente.`);
        closeModal();
        this.loadEmployeesList(root);
      } catch (err) {
        console.error('[SettingsView] Error creating employee:', err);
        alert(`Error al registrar el empleado: ${err.message || err}`);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Registrar Empleado';
      }
    });
  }

  openEditEmployeeModal(uid, root) {
    const emp = this.state.employees.find(e => e.uid === uid);
    if (!emp) return;

    let modalOverlay = document.getElementById('settings-worker-edit-modal');
    if (modalOverlay) modalOverlay.remove();

    const isCustom = emp.customRole ? true : false;
    const rolesSelectOptions = `
      <option value="WAITER" ${(!isCustom && emp.role === 'WAITER') ? 'selected' : ''}>Mesero / Salonero</option>
      <option value="KITCHEN" ${(!isCustom && emp.role === 'KITCHEN') ? 'selected' : ''}>Cocinero / Chef</option>
      <option value="CASHIER" ${(!isCustom && emp.role === 'CASHIER') ? 'selected' : ''}>Cajero</option>
      <option value="MANAGER" ${(!isCustom && emp.role === 'MANAGER') ? 'selected' : ''}>Gerente / Administrador</option>
      <option value="CUSTOM" ${isCustom ? 'selected' : ''}>Cargo Personalizado...</option>
    `;

    const modalHTML = `
      <div id="settings-worker-edit-modal" class="modal-overlay" style="position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 16px;">
        <div class="card p-6" style="background: #111115; border: 1px solid var(--color-border); border-radius: 12px; width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto; box-shadow: 0 15px 30px rgba(0,0,0,0.5); color: var(--color-text-primary);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 12px;">
            <h3 class="text-md font-bold" style="margin: 0;">✏️ Editar Información de Empleado</h3>
            <button id="close-worker-edit-modal-btn" style="background: transparent; border: none; color: #9ca3af; font-size: 1.5rem; cursor: pointer; line-height: 1;">&times;</button>
          </div>
          
          <form id="edit-worker-form" style="display:flex; flex-direction:column; gap: var(--space-3);">
            <div class="form-group">
              <label class="form-label" for="edit-w-name">Nombre Completo <span class="form-label-required"></span></label>
              <input type="text" id="edit-w-name" class="input input-md" value="${this.escapeHTML(emp.displayName)}" required />
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
              <div class="form-group">
                <label class="form-label" for="edit-w-role">Cargo / Rol</label>
                <select id="edit-w-role" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
                  ${rolesSelectOptions}
                </select>
              </div>
              <div class="form-group" id="edit-w-custom-container" style="display:${isCustom ? 'block' : 'none'};">
                <label class="form-label" for="edit-w-custom">Especificar Cargo <span class="form-label-required"></span></label>
                <input type="text" id="edit-w-custom" class="input input-md" value="${isCustom ? this.escapeHTML(emp.customRole) : ''}" placeholder="Ej. Bartender, Recepcionista" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="edit-w-phone">Teléfono</label>
              <input type="text" id="edit-w-phone" class="input input-md" value="${this.escapeHTML(emp.phone === '—' ? '' : emp.phone)}" placeholder="Ej. +505 8888-8888" />
            </div>

            <div class="form-group">
              <label class="form-label" for="edit-w-email">Correo Electrónico</label>
              <input type="email" id="edit-w-email" class="input input-md" value="${this.escapeHTML(emp.email)}" required />
            </div>

            <div class="form-group">
              <label class="switch-container">
                <input type="checkbox" id="edit-w-active" class="switch-input" ${emp.active ? 'checked' : ''} />
                <div>
                  <strong style="font-size:0.85rem; display:block;">Estado de la cuenta</strong>
                  <span class="text-xs text-secondary">Activar o suspender el acceso de este trabajador.</span>
                </div>
              </label>
            </div>

            <!-- Permisos checklist -->
            <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px; margin-top: 4px;">
              <label class="form-label" style="font-weight: 700; margin-bottom: 8px; display: block; color: var(--color-accent);">🔑 Permisos del Sistema</label>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; max-height: 180px; overflow-y: auto; padding-right: 4px;">
                ${this.renderPermissionsCheckboxes(emp.permissions)}
              </div>
            </div>

            <div style="display: flex; gap: var(--space-3); justify-content: flex-end; margin-top: var(--space-3); border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px;">
              <button type="button" id="btn-cancel-edit-w" class="btn btn-secondary btn-sm">Cancelar</button>
              <button type="submit" id="btn-submit-edit-w" class="btn btn-primary btn-sm">Guardar Cambios</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const overlay = document.getElementById('settings-worker-edit-modal');
    const form = document.getElementById('edit-worker-form');
    const closeBtn = document.getElementById('close-worker-edit-modal-btn');
    const cancelBtn = document.getElementById('btn-cancel-edit-w');
    const submitBtn = document.getElementById('btn-submit-edit-w');

    const closeModal = () => overlay.remove();

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    // Setup Presets and Cargo toggler
    this.setupModalCargoListeners(overlay, 'edit-w-role', 'edit-w-custom-container', 'edit-w-custom');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const displayName = document.getElementById('edit-w-name').value.trim();
      const roleSelectVal = document.getElementById('edit-w-role').value;
      const customRoleInputVal = document.getElementById('edit-w-custom').value.trim();
      const phone = document.getElementById('edit-w-phone').value.trim();
      const email = document.getElementById('edit-w-email').value.trim();
      const active = document.getElementById('edit-w-active').checked;

      // Extract checkboxes permissions
      const permissions = this.extractModalPermissions(overlay);

      // Determine role & customRole
      const role = roleSelectVal === 'CUSTOM' ? 'WAITER' : roleSelectVal;
      const customRole = roleSelectVal === 'CUSTOM' ? customRoleInputVal : '';

      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando cambios...';

      try {
        const timestamp = Date.now();
        const updates = {};
        
        updates[`users/${uid}/displayName`] = displayName;
        updates[`users/${uid}/email`] = email;
        updates[`users/${uid}/role`] = role;
        updates[`users/${uid}/customRole`] = customRole;
        updates[`users/${uid}/phone`] = phone;
        updates[`users/${uid}/status`] = active ? 'ACTIVE' : 'DISABLED';
        updates[`users/${uid}/disabled`] = !active;
        updates[`users/${uid}/permissions`] = permissions;
        updates[`users/${uid}/updatedAt`] = timestamp;

        // Company employees update
        updates[`${this.companyId}/employees/${uid}/displayName`] = displayName;
        updates[`${this.companyId}/employees/${uid}/email`] = email;
        updates[`${this.companyId}/employees/${uid}/role`] = role;
        updates[`${this.companyId}/employees/${uid}/customRole`] = customRole;
        updates[`${this.companyId}/employees/${uid}/phone`] = phone;
        updates[`${this.companyId}/employees/${uid}/active`] = active;
        updates[`${this.companyId}/employees/${uid}/permissions`] = permissions;
        updates[`${this.companyId}/employees/${uid}/updatedAt`] = timestamp;

        if (db) {
          await update(ref(db), updates);
        }

        // Audit Log
        await FirestoreService.logAudit({
          action: 'OWNER_EDIT_EMPLOYEE',
          companyId: this.companyId,
          description: `El dueño editó el perfil del empleado ${displayName} (${email}). Rol: ${role}, Cargo: ${customRole || 'Predefinido'}, Activo: ${active}.`
        });

        NotificationService.success(`Datos del empleado "${displayName}" actualizados.`);
        closeModal();
        this.loadEmployeesList(root);
      } catch (err) {
        console.error('[SettingsView] Error editing worker profile:', err);
        alert(`Error al guardar cambios del empleado: ${err.message || err}`);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar Cambios';
      }
    });
  }

  openResetEmployeePasswordModal(uid, root) {
    const emp = this.state.employees.find(e => e.uid === uid);
    if (!emp) return;

    let modalOverlay = document.getElementById('settings-worker-pass-modal');
    if (modalOverlay) modalOverlay.remove();

    const modalHTML = `
      <div id="settings-worker-pass-modal" class="modal-overlay" style="position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 16px;">
        <div class="card p-6" style="background: #111115; border: 1px solid var(--color-border); border-radius: 12px; width: 100%; max-width: 440px; box-shadow: 0 15px 30px rgba(0,0,0,0.5); color: var(--color-text-primary);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 12px;">
            <h3 class="text-md font-bold" style="margin: 0; color:#60a5fa;">🔑 Cambiar Clave de Empleado</h3>
            <button id="close-worker-pass-modal-btn" style="background: transparent; border: none; color: #9ca3af; font-size: 1.5rem; cursor: pointer; line-height: 1;">&times;</button>
          </div>

          <p class="text-xs text-secondary mb-4">
            Estás modificando la clave de: <strong>${this.escapeHTML(emp.displayName)}</strong> (${emp.email}).<br>
            Elige uno de los métodos seguros de restablecimiento:
          </p>

          <!-- Opción A: Correo de restablecimiento -->
          <div style="background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 6px; padding: 12px; margin-bottom: 16px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
            <div style="flex:1;">
              <strong style="font-size:0.8rem; color:#60a5fa; display:block;">Método 1: Restablecer por Correo</strong>
              <span style="font-size:0.72rem; color:var(--color-text-secondary);">Envía un correo oficial de recuperación de Firebase.</span>
            </div>
            <button type="button" id="btn-send-recovery-email" class="btn btn-secondary btn-sm" style="border-color:#3b82f6; color:#60a5fa; white-space:nowrap;">Enviar Correo</button>
          </div>

          <!-- Opción B: Contraseña temporal escrita manual -->
          <form id="temp-password-form" style="display:flex; flex-direction:column; gap: var(--space-3); border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 12px;">
            <strong style="font-size:0.8rem; display:block;">Método 2: Establecer Contraseña Temporal</strong>
            
            <div class="form-group">
              <label class="form-label" for="temp-pass-input">Nueva Contraseña Temporal (mín. 6 caracteres)</label>
              <input type="password" id="temp-pass-input" class="input input-md" placeholder="Contraseña provisoria" minlength="6" required />
            </div>

            <div style="display: flex; gap: var(--space-3); justify-content: flex-end; margin-top: var(--space-2);">
              <button type="button" id="btn-cancel-pass-w" class="btn btn-secondary btn-sm">Cancelar</button>
              <button type="submit" id="btn-submit-pass-w" class="btn btn-primary btn-sm">Guardar Nueva Clave</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const overlay = document.getElementById('settings-worker-pass-modal');
    const closeBtn = document.getElementById('close-worker-pass-modal-btn');
    const cancelBtn = document.getElementById('btn-cancel-pass-w');
    const sendEmailBtn = document.getElementById('btn-send-recovery-email');
    const tempForm = document.getElementById('temp-password-form');
    const submitBtn = document.getElementById('btn-submit-pass-w');

    const closeModal = () => overlay.remove();

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    // Option A: Send email reset
    sendEmailBtn.addEventListener('click', async () => {
      sendEmailBtn.disabled = true;
      sendEmailBtn.textContent = 'Enviando...';
      try {
        await AuthService.sendPasswordReset(emp.email);
        NotificationService.success(`Correo de recuperación enviado a ${emp.email}.`);
        closeModal();
      } catch (err) {
        console.error('[SettingsView] Password reset email failed:', err);
        alert(`Error al enviar correo: ${err.message || err}`);
        sendEmailBtn.disabled = false;
        sendEmailBtn.textContent = 'Enviar Correo';
      }
    });

    // Option B: Set manual password
    tempForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPassword = document.getElementById('temp-pass-input').value;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando clave...';

      try {
        console.log('[SettingsView] Actualizando storedPassword para empleado UID:', uid);
        await AuthService.updateUserStoredPassword(uid, newPassword, this.companyId);

        // Audit Log
        await FirestoreService.logAudit({
          action: 'OWNER_RESET_EMPLOYEE_PASSWORD',
          companyId: this.companyId,
          description: `El dueño asignó una contraseña temporal para el empleado ${emp.displayName} (${emp.email}).`
        });

        NotificationService.success(`Contraseña establecida correctamente para ${emp.displayName}.`);
        closeModal();
      } catch (err) {
        console.error('[SettingsView] Temp password set failed:', err);
        alert(`Error al definir contraseña: ${err.message || err}`);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar Nueva Clave';
      }
    });
  }

  async handleDeleteEmployee(uid, root) {
    const emp = this.state.employees.find(e => e.uid === uid);
    if (!emp) return;

    if (!confirm(`⚠️ ¿Estás completamente seguro de que deseas eliminar permanentemente a "${emp.displayName}" (${emp.email}) de tu negocio?\n\nEsta acción no se puede deshacer.`)) {
      return;
    }

    try {
      console.log('[SettingsView] Eliminando empleado del tenant y perfil global:', uid);
      
      // Remove from company employees node in RTDB
      await FirestoreService.removeEmployeeFromCompany(this.companyId, uid);

      // Clean or deactivate user profile under /users/
      if (db) {
        await update(ref(db, `users/${uid}`), {
          companyId: null, // Orphaned/unlinked from company
          role: 'CUSTOMER', // Downgraded system privileges
          status: 'DISABLED',
          updatedAt: serverTimestamp()
        });
      }

      // Audit Log
      await FirestoreService.logAudit({
        action: 'OWNER_DELETE_EMPLOYEE',
        companyId: this.companyId,
        description: `El dueño eliminó al empleado ${emp.displayName} (${emp.email}) de su negocio.`
      });

      NotificationService.success(`El empleado "${emp.displayName}" ha sido dado de baja exitosamente.`);
      this.loadEmployeesList(root);
    } catch (err) {
      console.error('[SettingsView] Error deleting employee:', err);
      NotificationService.error(`Error al dar de baja al empleado: ${err.message || err}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA ACTIONS: PREFERENCIAS DEL DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════

  selectOwnerTheme(themeName, root) {
    const themeInput = root.querySelector('#owner-theme-select');
    if (themeInput) themeInput.value = themeName;

    // Highlight active card
    root.querySelectorAll('.owner-theme-preset-card').forEach(card => {
      const isActive = card.dataset.theme === themeName;
      card.style.borderColor = isActive ? 'var(--color-accent)' : 'transparent';
      card.style.background = isActive ? 'var(--color-accent-light)' : 'var(--color-bg-tertiary)';
    });

    // Custom colors panel toggle
    const customPanel = root.querySelector('#owner-custom-colors-panel');
    if (customPanel) {
      customPanel.style.opacity = themeName === 'custom' ? '1' : '0.5';
      customPanel.style.pointerEvents = themeName === 'custom' ? 'auto' : 'none';
    }

    // Apply live
    if (themeName !== 'custom') {
      const preset = AppearanceService.getThemeDefaults(themeName);
      this.fillOwnerColorFields(root, {
        primaryColor: preset.accent,
        bgColor: preset.bgPrimary,
        cardColor: preset.surface,
        sidebarColor: preset.sidebarBg,
      });
      AppearanceService.applyThemePreset(themeName);
      AppearanceService._applyBodyClass(themeName);
    } else {
      AppearanceService.applyConfig(this.readOwnerAppearanceFields(root));
    }
  }

  fillOwnerColorFields(root, colors = {}) {
    const map = {
      primaryColor: '#owner-primary-color-input',
      bgColor: '#owner-bg-color-input',
      cardColor: '#owner-card-color-input',
      sidebarColor: '#owner-sidebar-color-input',
    };
    Object.entries(map).forEach(([key, sel]) => {
      if (!colors[key]) return;
      const input = root.querySelector(sel);
      if (input) {
        input.value = colors[key];
        const hexText = input.nextElementSibling;
        if (hexText) hexText.textContent = colors[key].toUpperCase();
      }
    });
  }

  readOwnerAppearanceFields(root) {
    return {
      theme:        root.querySelector('#owner-theme-select')?.value || 'dark',
      fontFamily:   root.querySelector('#owner-font-family-select')?.value || 'Inter',
      fontSize:     root.querySelector('#owner-font-size-select')?.value || '14px',
      borderRadius: Number(root.querySelector('#owner-border-radius-input')?.value || 8),
      primaryColor: root.querySelector('#owner-primary-color-input')?.value || '#7c75ff',
      bgColor:      root.querySelector('#owner-bg-color-input')?.value || '#0a0a0b',
      cardColor:    root.querySelector('#owner-card-color-input')?.value || '#16161a',
      sidebarColor: root.querySelector('#owner-sidebar-color-input')?.value || '#111113',
    };
  }

  async populatePreferencesForm(root) {
    const langSelect = root.querySelector('#pref-lang-select');
    const timezoneSelect = root.querySelector('#pref-timezone-select');
    const dateSelect = root.querySelector('#pref-date-select');
    const timeSelect = root.querySelector('#pref-time-select');
    const alertSystem = root.querySelector('#alert-system-toggle');
    const alertEmail = root.querySelector('#alert-email-toggle');
    const alertSounds = root.querySelector('#alert-sounds-toggle');

    const p = this.state.preferences;

    if (langSelect) langSelect.value = p.language || 'es';
    if (timezoneSelect) timezoneSelect.value = p.timezone || 'America/Managua';
    if (dateSelect) dateSelect.value = p.dateFormat || 'DD/MM/YYYY';
    if (timeSelect) timeSelect.value = p.timeFormat || '24h';
    if (alertSystem) alertSystem.checked = p.systemNotifications !== false;
    if (alertEmail) alertEmail.checked = p.emailNotifications !== false;
    if (alertSounds) alertSounds.checked = p.alertSounds !== false;

    // Fetch company-specific appearance config from Firebase
    try {
      const companyConfig = await FirestoreService.getCompanyConfig(this.companyId);
      if (companyConfig) {
        const theme = companyConfig.theme || 'dark';
        this.selectOwnerTheme(theme, root);
        if (root.querySelector('#owner-font-family-select')) root.querySelector('#owner-font-family-select').value = companyConfig.fontFamily || 'Inter';
        if (root.querySelector('#owner-font-size-select')) root.querySelector('#owner-font-size-select').value = companyConfig.fontSize || '14px';
        if (root.querySelector('#owner-border-radius-input')) root.querySelector('#owner-border-radius-input').value = companyConfig.borderRadius ?? 8;
        this.fillOwnerColorFields(root, {
          primaryColor: companyConfig.primaryColor,
          bgColor: companyConfig.bgColor,
          cardColor: companyConfig.cardColor,
          sidebarColor: companyConfig.sidebarColor,
        });
      } else {
        this.selectOwnerTheme('dark', root);
      }
    } catch {
      this.selectOwnerTheme('dark', root);
    }
  }

  async handleSavePreferences(e, root) {
    e.preventDefault();

    const { currentUser } = GlobalStore.getState();
    const canEdit = currentUser?.role === 'OWNER' ||
                    currentUser?.role === 'SUPER_ADMIN' ||
                    currentUser?.permissions?.modificar_apariencia === true;

    if (!canEdit) {
      NotificationService.error('No tienes permisos suficientes para modificar la identidad visual del negocio.');
      return;
    }

    const saveBtn = root.querySelector('#btn-save-preferences');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando...';
    }

    const language = root.querySelector('#pref-lang-select').value;
    const timezone = root.querySelector('#pref-timezone-select').value;
    const dateFormat = root.querySelector('#pref-date-select').value;
    const timeFormat = root.querySelector('#pref-time-select').value;
    const appearance = this.readOwnerAppearanceFields(root);

    try {
      this.state.preferences = {
        ...this.state.preferences,
        language,
        timezone,
        dateFormat,
        timeFormat,
        theme: appearance.theme
      };

      const existingConfig = (this.companyId ? await FirestoreService.getBusinessSettings(this.companyId) : null) || {};

      const changedFields = {};
      Object.keys(appearance).forEach(key => {
        if (JSON.stringify(existingConfig[key]) !== JSON.stringify(appearance[key])) {
          changedFields[key] = { before: existingConfig[key] ?? 'N/A', after: appearance[key] };
        }
      });

      // 1. Save company appearance config under business_settings/{companyId} in Firebase RTDB
      if (this.companyId) {
        await FirestoreService.updateBusinessSettings(this.companyId, appearance);
      }

      // 2. Save user preferences
      if (db && this.uid) {
        await update(ref(db, `users/${this.uid}/preferences`), this.state.preferences);
      }

      // 3. Apply live to current session
      AppearanceService.applyConfig(appearance);

      // 4. Audit Log
      await FirestoreService.logAudit({
        action: 'BUSINESS_THEME_UPDATE',
        companyId: this.companyId,
        description: `El usuario (${currentUser?.email || this.uid}) actualizó la identidad visual del negocio [Tema: ${appearance.theme}].`,
        metadata: { changedFields }
      });

      NotificationService.success('✅ ¡Apariencia e identidad visual de tu negocio guardadas con éxito!');
    } catch (err) {
      console.error('[SettingsView] Error saving preferences:', err);
      NotificationService.error('Error al guardar preferencias en la base de datos.');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Guardar Preferencias del Negocio';
      }
    }
  }

  async handleSaveAlertsConfig(e, root) {
    e.preventDefault();

    const saveBtn = root.querySelector('#btn-save-alerts');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando...';
    }

    const systemNotifications = root.querySelector('#alert-system-toggle').checked;
    const emailNotifications = root.querySelector('#alert-email-toggle').checked;
    const alertSounds = root.querySelector('#alert-sounds-toggle').checked;

    try {
      this.state.preferences = {
        ...this.state.preferences,
        systemNotifications,
        emailNotifications,
        alertSounds
      };

      if (db && this.uid) {
        await update(ref(db, `users/${this.uid}/preferences`), this.state.preferences);
      }

      // Audit Log
      await FirestoreService.logAudit({
        action: 'OWNER_SAVE_ALERTS_CONFIG',
        companyId: this.companyId,
        description: `El dueño actualizó sus configuraciones de notificaciones y alertas sonoras.`
      });

      NotificationService.success('Configuración de alertas guardada exitosamente.');
    } catch (err) {
      console.error('[SettingsView] Error saving alert settings:', err);
      NotificationService.error('Error al guardar configuración de alertas.');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar Configuración de Alertas';
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSONALIZACIÓN DE BARRA DE NAVEGACIÓN MÓVIL
  // ═══════════════════════════════════════════════════════════════════════════

  async loadMobileNavConfig(root) {
    if (!root) return;
    try {
      const tabs = await MobileNavConfigService.load(this.uid);
      this.state.mobileNavSelectedTabs = tabs;
      this.renderMobileNavUI(root, tabs);
    } catch (err) {
      console.error('[SettingsView] Error loading mobile nav config:', err);
      this.renderMobileNavUI(root, [...DEFAULT_NAV_TABS]);
    }
  }

  renderMobileNavUI(root, selectedIds = []) {
    const previewEl = root.querySelector('#mnc-preview');
    const selectedListEl = root.querySelector('#mnc-selected-list');
    const catalogEl = root.querySelector('#mnc-catalog');
    const countEl = root.querySelector('#mnc-count');

    if (!previewEl || !selectedListEl || !catalogEl) return;

    this.state.mobileNavSelectedTabs = [...selectedIds];
    const role = this.currentUser.role || 'OWNER';

    if (countEl) {
      countEl.textContent = `(${selectedIds.length}/5 seleccionados)`;
    }

    // 1. Live Preview
    previewEl.innerHTML = selectedIds.map(id => {
      const tab = MobileNavConfigService.getTabById(id);
      if (!tab) return '';
      return `
        <div style="display:flex; flex-direction:column; align-items:center; gap:2px; font-size:0.65rem; color:var(--color-accent); font-weight:600;">
          <span style="font-size:1.1rem; line-height:1;">${tab.emoji}</span>
          <span>${tab.label}</span>
        </div>
      `;
    }).join('');

    // 2. Selected Tabs List
    if (selectedIds.length === 0) {
      selectedListEl.innerHTML = `<p style="font-size:0.8rem; color:var(--color-text-tertiary); text-align:center; padding:12px; border:1px dashed var(--color-border); border-radius:8px;">No has seleccionado ningún botón. Agrega al menos 1 del catálogo abajo.</p>`;
    } else {
      selectedListEl.innerHTML = selectedIds.map((id, index) => {
        const tab = MobileNavConfigService.getTabById(id);
        if (!tab) return '';
        const isFirst = index === 0;
        const isLast = index === selectedIds.length - 1;

        return `
          <div style="display:flex; align-items:center; justify-content:space-between; background:var(--color-bg-tertiary); border:1px solid var(--color-border); padding:8px 12px; border-radius:10px; gap:10px;">
            <div style="display:flex; align-items:center; gap:10px; flex:1;">
              <span style="font-size:1.2rem;">${tab.emoji}</span>
              <div style="display:flex; flex-direction:column;">
                <span style="font-size:0.85rem; font-weight:700; color:var(--color-text-primary);">${index + 1}. ${tab.label}</span>
                <span style="font-size:0.7rem; color:var(--color-text-tertiary);">${tab.description}</span>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:4px;">
              <button type="button" class="btn btn-secondary btn-sm mnc-btn-up" data-id="${id}" ${isFirst ? 'disabled style="opacity:0.3;"' : ''} title="Mover arriba">▲</button>
              <button type="button" class="btn btn-secondary btn-sm mnc-btn-down" data-id="${id}" ${isLast ? 'disabled style="opacity:0.3;"' : ''} title="Mover abajo">▼</button>
              <button type="button" class="btn btn-secondary btn-sm mnc-btn-remove" data-id="${id}" style="color:#ef4444; border-color:rgba(239,68,68,0.3);" title="Quitar">✕</button>
            </div>
          </div>
        `;
      }).join('');
    }

    // 3. Available Catalog
    const roleCatalog = MobileNavConfigService.getAvailableTabsForRole(role);
    catalogEl.innerHTML = roleCatalog.map(tab => {
      const isSelected = selectedIds.includes(tab.id);
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; background:${isSelected ? 'rgba(99,102,241,0.06)' : 'var(--color-bg-secondary)'}; border:1px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-border)'}; padding:8px 10px; border-radius:10px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:1.1rem;">${tab.emoji}</span>
            <span style="font-size:0.8rem; font-weight:600; color:${isSelected ? 'var(--color-accent)' : 'var(--color-text-primary)'};">${tab.label}</span>
          </div>
          ${isSelected 
            ? `<span style="font-size:0.7rem; color:var(--color-accent); font-weight:700;">✓ Activo</span>`
            : `<button type="button" class="btn btn-secondary btn-sm mnc-btn-add" data-id="${tab.id}" ${selectedIds.length >= 5 ? 'disabled title="Máximo 5 botones"' : ''} style="font-size:0.7rem; padding:3px 8px;">+ Agregar</button>`
          }
        </div>
      `;
    }).join('');

    // Bind item action listeners
    selectedListEl.querySelectorAll('.mnc-btn-up').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const idx = selectedIds.indexOf(id);
        if (idx > 0) {
          const newArr = [...selectedIds];
          [newArr[idx - 1], newArr[idx]] = [newArr[idx], newArr[idx - 1]];
          this.renderMobileNavUI(root, newArr);
        }
      });
    });

    selectedListEl.querySelectorAll('.mnc-btn-down').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const idx = selectedIds.indexOf(id);
        if (idx >= 0 && idx < selectedIds.length - 1) {
          const newArr = [...selectedIds];
          [newArr[idx + 1], newArr[idx]] = [newArr[idx], newArr[idx + 1]];
          this.renderMobileNavUI(root, newArr);
        }
      });
    });

    selectedListEl.querySelectorAll('.mnc-btn-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const newArr = selectedIds.filter(i => i !== id);
        this.renderMobileNavUI(root, newArr);
      });
    });

    catalogEl.querySelectorAll('.mnc-btn-add').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (selectedIds.length < 5 && !selectedIds.includes(id)) {
          const newArr = [...selectedIds, id];
          this.renderMobileNavUI(root, newArr);
        }
      });
    });

    // Save & Reset Buttons
    const saveBtn = root.querySelector('#btn-save-mobile-nav');
    if (saveBtn) {
      saveBtn.onclick = () => this.handleSaveMobileNav(root);
    }

    const resetBtn = root.querySelector('#btn-reset-mobile-nav');
    if (resetBtn) {
      resetBtn.onclick = () => this.handleResetMobileNav(root);
    }
  }

  async handleSaveMobileNav(root) {
    const selectedIds = this.state.mobileNavSelectedTabs || [];
    if (selectedIds.length === 0) {
      NotificationService.warning('Debes seleccionar al menos 1 botón para la barra móvil.');
      return;
    }

    const saveBtn = root.querySelector('#btn-save-mobile-nav');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando...';
    }

    try {
      await MobileNavConfigService.save(this.uid, selectedIds);
      GlobalStore.set({ mobileNavConfig: selectedIds });
      NotificationService.success('📱 ¡Barra de navegación móvil personalizada guardada con éxito!');
    } catch (err) {
      console.error('[SettingsView] Error saving mobile nav config:', err);
      NotificationService.error('Error al guardar configuración de barra móvil.');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Guardar Configuración';
      }
    }
  }

  async handleResetMobileNav(root) {
    if (!confirm('¿Deseas restaurar los botones predeterminados de la barra móvil?')) return;
    try {
      const defaultTabs = [...DEFAULT_NAV_TABS];
      await MobileNavConfigService.save(this.uid, defaultTabs);
      GlobalStore.set({ mobileNavConfig: defaultTabs });
      this.renderMobileNavUI(root, defaultTabs);
      NotificationService.success('Barra móvil restaurada a los valores predeterminados.');
    } catch (err) {
      console.error('[SettingsView] Error resetting mobile nav config:', err);
      NotificationService.error('Error al restaurar valores predeterminados.');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUXILIARY UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  escapeHTML(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.layout.unmount();
    super.unmount();
  }
}
