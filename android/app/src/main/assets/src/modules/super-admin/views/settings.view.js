/**
 * @file settings.view.js
 * @description Global System Configuration View for Programmers (SUPER_ADMIN).
 *
 * Fixes applied:
 * - Uses FirestoreService.getCompanyConfig / updateCompanyConfig (now implemented)
 * - Uses AppearanceService.applyConfig for live previews that affect the REAL UI
 * - Adds 9 predefined theme presets with visual selector cards
 * - Removed "Facturación y Planes" tab (has its own dedicated module)
 * - All saves/loads are fully wired to Firebase RTDB at global/saas_config
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { AuthService } from '../../../services/auth.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { AppearanceService, THEMES } from '../../../services/appearance.service.js';
import { GlobalStore } from '../../../core/state.js';
import { TimeService } from '../../../services/time.service.js';
import { PushNotificationsCenterService } from '../../../services/push-notifications-center.service.js';
import { MobileNavConfigService, NAV_TAB_CATALOG, DEFAULT_NAV_TABS } from '../../../services/mobile-nav-config.service.js';

// Build the theme grid HTML from the THEMES dictionary
function buildThemeGrid() {
  return Object.entries(THEMES).map(([key, theme]) => `
    <div class="theme-preset-card" data-theme="${key}" title="${theme.label}" style="
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
      <span style="font-size: 0.65rem; font-weight: 600; text-align: center; color: var(--color-text-secondary); line-height:1.2;">
        ${theme.emoji || ''} ${theme.label}
      </span>
    </div>
  `).join('');
}

export class SettingsView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || 'global';
    this.config = {};

    this.layout = new PageLayout({
      title: 'Configuración del Sistema',
      subtitle: 'Administración central del SaaS: identidad visual, comportamiento global, copias de seguridad y mantenimiento.',
      contentHTML: `
        <style>
          /* Programmer Settings: Mobile Responsive */
          @media (max-width: 768px) {
            .settings-layout { grid-template-columns: 1fr !important; gap: var(--space-3) !important; }
            .settings-sidebar {
              flex-direction: row !important; overflow-x: auto !important; overflow-y: hidden !important;
              padding: var(--space-2) !important; gap: 6px !important; white-space: nowrap !important;
              scrollbar-width: none !important; position: static !important;
              border-bottom: 1px solid var(--color-border); border-radius: var(--radius-md) !important;
            }
            .settings-sidebar::-webkit-scrollbar { display: none !important; }
            .settings-tab-btn {
              flex-shrink: 0 !important; width: auto !important; padding: 7px 12px !important;
              font-size: 0.76rem !important; gap: 4px !important; border-radius: 20px !important;
              justify-content: center !important; text-align: center !important;
            }
            .settings-content-wrapper {
              padding: var(--space-3) !important; min-height: unset !important;
              overflow-x: hidden !important; max-width: 100% !important; box-sizing: border-box !important;
            }
            .settings-panel {
              overflow-x: hidden !important; max-width: 100% !important;
              min-width: 0 !important; word-break: break-word !important; overflow-wrap: break-word !important;
            }
            .settings-panel p, .settings-panel h3, .settings-panel h4, .settings-panel label {
              max-width: 100% !important; overflow-wrap: break-word !important; word-break: break-word !important;
            }
            .settings-panel input:not([type="checkbox"]):not([type="radio"]), .settings-panel select, .settings-panel textarea {
              max-width: 100% !important; width: 100% !important; box-sizing: border-box !important; min-width: 0 !important;
            }
            .settings-panel input[type="checkbox"].switch-input, .switch-input {
              width: 36px !important; min-width: 36px !important; max-width: 36px !important; height: 20px !important; flex-shrink: 0 !important;
            }
            .settings-card {
              padding: var(--space-3) !important; overflow-x: hidden !important;
              max-width: 100% !important; box-sizing: border-box !important;
            }
            .settings-grid-2, .settings-grid-3 { grid-template-columns: 1fr !important; }
            #global-settings-form { gap: var(--space-4) !important; }
          }
          @media (max-width: 480px) {
            .settings-tab-btn { padding: 6px 9px !important; font-size: 0.71rem !important; }
            .settings-content-wrapper { padding: var(--space-2) !important; border-radius: var(--radius-md) !important; }
            .settings-card { padding: var(--space-2) !important; }
          }
        </style>

        <div class="settings-layout">

          <!-- Left Tabs Sidebar -->
          <div class="settings-sidebar">
            <button type="button" class="settings-tab-btn active" data-tab="tab-identidad">ℹ️ Identidad del Sistema</button>
            <button type="button" class="settings-tab-btn" data-tab="tab-apariencia">🎨 Apariencia y Diseño</button>
            <button type="button" class="settings-tab-btn" data-tab="tab-general">⚙️ Configuración General</button>
            <button type="button" class="settings-tab-btn" data-tab="tab-respaldos">💾 Copias de Seguridad</button>
            <button type="button" class="settings-tab-btn" data-tab="tab-mantenimiento">🛠️ Modo Mantenimiento</button>
            <button type="button" class="settings-tab-btn" data-tab="tab-avanzado">⚡ Avanzado y Monitoreo</button>
            <button type="button" class="settings-tab-btn" data-tab="tab-mobile-nav">📱 Barra Móvil</button>
            <button type="button" class="settings-tab-btn" data-tab="tab-broadcasts" style="background: rgba(16,185,129,0.1); color: #10b981; border: 1px solid rgba(16,185,129,0.3); font-weight:700;">📢 Mensajes y APKs</button>
          </div>

          <!-- Right Content Panels -->
          <div class="settings-content-wrapper">
            <form id="global-settings-form" style="display: flex; flex-direction: column; gap: var(--space-6);">

              <!-- ══════════════════════════════════════════════════════════ -->
              <!-- 1. IDENTIDAD DEL SISTEMA                                  -->
              <!-- ══════════════════════════════════════════════════════════ -->
              <div class="settings-panel active" id="tab-identidad">
                <h3 class="text-lg font-bold">ℹ️ Identidad del Sistema</h3>
                <p class="text-xs text-secondary">Establece la marca de la plataforma SaaS y sus elementos visuales de identidad.</p>

                <div class="settings-card">
                  <div class="settings-card-title">Detalles de Marca</div>
                  <div class="settings-grid-2">
                    <div class="form-group">
                      <label class="form-label" for="saas-name-input">Nombre del Sistema</label>
                      <input type="text" id="saas-name-input" class="input input-md" />
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="saas-comm-name-input">Nombre Comercial</label>
                      <input type="text" id="saas-comm-name-input" class="input input-md" />
                    </div>
                  </div>
                  <div class="form-group">
                    <label class="form-label" for="saas-slogan-input">Eslogan</label>
                    <input type="text" id="saas-slogan-input" class="input input-md" />
                  </div>
                  <div class="form-group">
                    <label class="form-label" for="saas-desc-input">Descripción Corta</label>
                    <textarea id="saas-desc-input" class="input" style="height: 80px; padding: 10px;"></textarea>
                  </div>
                </div>

                <div class="settings-card">
                  <div class="settings-card-title">Elementos Visuales (URLs de Imagen)</div>
                  <div class="settings-grid-2">
                    <div class="form-group">
                      <label class="form-label" for="logo-main-input">Logo Tema Claro</label>
                      <input type="text" id="logo-main-input" class="input input-md" placeholder="https://…/logo.png" />
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="logo-dark-input">Logo Tema Oscuro</label>
                      <input type="text" id="logo-dark-input" class="input input-md" placeholder="https://…/logo-dark.png" />
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="favicon-input">Favicon (Ícono Navegador)</label>
                      <input type="text" id="favicon-input" class="input input-md" placeholder="https://…/favicon.ico" />
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="app-icon-input">Ícono Móvil (PWA)</label>
                      <input type="text" id="app-icon-input" class="input input-md" placeholder="https://…/icon-192.png" />
                    </div>
                  </div>
                  <div class="form-group">
                    <label class="form-label" for="login-bg-input">Imagen de Fondo del Login</label>
                    <input type="text" id="login-bg-input" class="input input-md" placeholder="https://…/login-bg.jpg" />
                  </div>
                </div>
              </div>

              <!-- ══════════════════════════════════════════════════════════ -->
              <!-- 2. APARIENCIA Y DISEÑO                                    -->
              <!-- ══════════════════════════════════════════════════════════ -->
              <div class="settings-panel" id="tab-apariencia">
                <h3 class="text-lg font-bold">🎨 Apariencia y Diseño</h3>
                <p class="text-xs text-secondary">Selecciona un tema prediseñado o personaliza cada color individualmente. Los cambios se aplican en tiempo real.</p>

                <!-- Theme Preset Grid -->
                <div class="settings-card">
                  <div class="settings-card-title">Temas Prediseñados</div>
                  <p class="text-xs text-secondary" style="margin: 0 0 10px 0;">Haz clic en un tema para aplicarlo de inmediato. Luego guarda para persistirlo en Firebase.</p>
                  <div id="theme-presets-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px;">
                    ${buildThemeGrid()}
                  </div>
                  <input type="hidden" id="theme-select" value="dark" />
                </div>

                <!-- Typography & Style -->
                <div class="settings-card">
                  <div class="settings-card-title">Tipografía y Estilo de Componentes</div>
                  <div class="settings-grid-2">
                    <div class="form-group">
                      <label class="form-label" for="font-family-select">Tipografía Principal</label>
                      <select id="font-family-select" class="input input-md">
                        <option value="Inter">Inter (Predeterminado SaaS)</option>
                        <option value="Outfit">Outfit</option>
                        <option value="Roboto">Roboto</option>
                        <option value="Poppins">Poppins</option>
                        <option value="system-ui">Sistema (Predeterminada)</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="font-size-select">Tamaño de Fuente Base</label>
                      <select id="font-size-select" class="input input-md">
                        <option value="12px">12px (Compacto)</option>
                        <option value="14px">14px (Predeterminado)</option>
                        <option value="16px">16px (Grande)</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="border-radius-input">Redondeo de Bordes (px)</label>
                      <input type="number" id="border-radius-input" class="input input-md" min="0" max="30" value="8" />
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="button-style-select">Estilo de Botones</label>
                      <select id="button-style-select" class="input input-md">
                        <option value="rounded">Redondeados</option>
                        <option value="pill">Píldora (Oval)</option>
                        <option value="flat">Recto / Cuadrado</option>
                      </select>
                    </div>
                  </div>
                </div>

                <!-- Custom Colors (visible when theme = custom) -->
                <div class="settings-card" id="custom-colors-panel">
                  <div class="settings-card-title">🎨 Colores Personalizados <span style="font-size:0.7rem; color: var(--color-accent); font-weight:500;">(Activo en modo "Personalizado")</span></div>
                  <p class="text-xs text-secondary" style="margin: 0 0 12px 0;">Modifica cada color individualmente. Selecciona el tema "Personalizado" para que estos valores se apliquen.</p>
                  <div class="settings-grid-3">
                    <div class="form-group">
                      <label class="form-label">Color Principal (Botones/Accent)</label>
                      <div class="color-picker-group">
                        <input type="color" id="primary-color-input" class="color-picker-input" value="#3b82f6" />
                        <span class="color-hex-text">#3b82f6</span>
                      </div>
                    </div>
                    <div class="form-group">
                      <label class="form-label">Color de Fondo Principal</label>
                      <div class="color-picker-group">
                        <input type="color" id="bg-color-input" class="color-picker-input" value="#0a0a0b" />
                        <span class="color-hex-text">#0a0a0b</span>
                      </div>
                    </div>
                    <div class="form-group">
                      <label class="form-label">Color de Tarjetas / Superficies</label>
                      <div class="color-picker-group">
                        <input type="color" id="card-color-input" class="color-picker-input" value="#16161a" />
                        <span class="color-hex-text">#16161a</span>
                      </div>
                    </div>
                    <div class="form-group">
                      <label class="form-label">Color del Menú Lateral</label>
                      <div class="color-picker-group">
                        <input type="color" id="sidebar-color-input" class="color-picker-input" value="#111113" />
                        <span class="color-hex-text">#111113</span>
                      </div>
                    </div>
                    <div class="form-group">
                      <label class="form-label">Color de Éxito (Verde)</label>
                      <div class="color-picker-group">
                        <input type="color" id="success-color-input" class="color-picker-input" value="#34d399" />
                        <span class="color-hex-text">#34d399</span>
                      </div>
                    </div>
                    <div class="form-group">
                      <label class="form-label">Color de Advertencia (Amarillo)</label>
                      <div class="color-picker-group">
                        <input type="color" id="warning-color-input" class="color-picker-input" value="#fbbf24" />
                        <span class="color-hex-text">#fbbf24</span>
                      </div>
                    </div>
                    <div class="form-group">
                      <label class="form-label">Color de Error / Peligro (Rojo)</label>
                      <div class="color-picker-group">
                        <input type="color" id="error-color-input" class="color-picker-input" value="#f87171" />
                        <span class="color-hex-text">#f87171</span>
                      </div>
                    </div>
                    <div class="form-group">
                      <label class="form-label">Color de Texto Principal</label>
                      <div class="color-picker-group">
                        <input type="color" id="text-color-input" class="color-picker-input" value="#ededef" />
                        <span class="color-hex-text">#ededef</span>
                      </div>
                    </div>
                    <div class="form-group">
                      <label class="form-label">Color de Texto Secundario</label>
                      <div class="color-picker-group">
                        <input type="color" id="text-sec-color-input" class="color-picker-input" value="#8b8c94" />
                        <span class="color-hex-text">#8b8c94</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Live Preview -->
                <div class="settings-card" style="border-color: rgba(124,117,255,0.3);">
                  <div class="settings-card-title">👁️ Vista Previa en Vivo</div>
                  <p class="text-xs text-secondary" style="margin: 0 0 10px 0;">Los cambios se aplican inmediatamente al sistema completo. Lo que ves ahora es la apariencia real.</p>
                  <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
                    <button type="button" class="btn btn-primary btn-sm">Botón Principal</button>
                    <button type="button" class="btn btn-secondary btn-sm">Botón Secundario</button>
                    <span style="color: var(--color-accent); font-size: 0.85rem; text-decoration: underline; cursor: pointer;">Enlace de ejemplo</span>
                    <span style="background: var(--color-success-light); color: var(--color-success); font-size: 0.75rem; padding: 3px 10px; border-radius: 12px; font-weight: 600;">Éxito</span>
                    <span style="background: var(--color-warning-light); color: var(--color-warning); font-size: 0.75rem; padding: 3px 10px; border-radius: 12px; font-weight: 600;">Advertencia</span>
                    <span style="background: var(--color-danger-light); color: var(--color-danger); font-size: 0.75rem; padding: 3px 10px; border-radius: 12px; font-weight: 600;">Error</span>
                  </div>
                  <div class="card" style="margin-top: 12px; padding: 12px;">
                    <p style="margin: 0; font-size: 0.82rem; color: var(--color-text-primary);">Ejemplo de tarjeta con texto principal</p>
                    <p style="margin: 4px 0 0 0; font-size: 0.75rem; color: var(--color-text-secondary);">Texto secundario en una tarjeta del sistema.</p>
                  </div>
                </div>
              </div>

              <!-- ══════════════════════════════════════════════════════════ -->
              <!-- 3. CONFIGURACIÓN GENERAL                                  -->
              <!-- ══════════════════════════════════════════════════════════ -->
              <div class="settings-panel" id="tab-general">
                <h3 class="text-lg font-bold">⚙️ Configuración General</h3>
                <p class="text-xs text-secondary">Ajusta la localización, moneda y comportamiento por defecto de toda la plataforma.</p>

                <div class="settings-card">
                  <div class="settings-card-title">Datos de la Empresa Propietaria</div>
                  <div class="form-group">
                    <label class="form-label" for="company-name-input">Nombre de la Empresa Propietaria del SaaS</label>
                    <input type="text" id="company-name-input" class="input input-md" placeholder="Ej. Ultra Software Group" />
                  </div>
                  <div class="form-group">
                    <label class="form-label" for="saas-branch-limit-input">Límite de Sucursales por Negocio</label>
                    <input type="number" id="saas-branch-limit-input" class="input input-md" min="1" max="50" value="5" />
                  </div>
                </div>

                <div class="settings-card">
                  <div class="settings-card-title">Localización y Fechas</div>
                  <div class="settings-grid-2">
                    <div class="form-group">
                      <label class="form-label" for="timezone-select">Zona Horaria Predeterminada</label>
                      <select id="timezone-select" class="input input-md">
                        <option value="America/Managua">America/Managua (GMT-6)</option>
                        <option value="America/Mexico_City">America/Mexico_City (GMT-6)</option>
                        <option value="America/Bogota">America/Bogota (GMT-5)</option>
                        <option value="America/Lima">America/Lima (GMT-5)</option>
                        <option value="America/Santiago">America/Santiago (GMT-3)</option>
                        <option value="America/Sao_Paulo">America/Sao_Paulo (GMT-3)</option>
                        <option value="America/New_York">America/New_York (GMT-5)</option>
                        <option value="Europe/Madrid">Europe/Madrid (GMT+1)</option>
                        <option value="UTC">UTC</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="language-select">Idioma del Sistema</label>
                      <select id="language-select" class="input input-md">
                        <option value="es">Español</option>
                        <option value="en">English (Inglés)</option>
                        <option value="pt">Português</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="date-format-select">Formato de Fecha</label>
                      <select id="date-format-select" class="input input-md">
                        <option value="DD/MM/YYYY">Día/Mes/Año (24/07/2026)</option>
                        <option value="YYYY-MM-DD">Año-Mes-Día (2026-07-24)</option>
                        <option value="MM/DD/YYYY">Mes/Día/Año (07/24/2026)</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="time-format-select">Formato de Hora</label>
                      <select id="time-format-select" class="input input-md">
                        <option value="24h">24 Horas (23:30)</option>
                        <option value="12h">12 Horas (11:30 PM)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div class="settings-card">
                  <div class="settings-card-title">Moneda y Decimales</div>
                  <div class="settings-grid-3">
                    <div class="form-group">
                      <label class="form-label" for="currency-select">Moneda Global</label>
                      <select id="currency-select" class="input input-md">
                        <option value="NIO">Córdoba (NIO)</option>
                        <option value="USD">Dólar (USD)</option>
                        <option value="EUR">Euro (EUR)</option>
                        <option value="MXN">Peso Mexicano (MXN)</option>
                        <option value="COP">Peso Colombiano (COP)</option>
                        <option value="BRL">Real Brasileño (BRL)</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="currency-symbol-input">Símbolo Monetario</label>
                      <input type="text" id="currency-symbol-input" class="input input-md" value="$" />
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="decimals-input">Decimales a Mostrar</label>
                      <input type="number" id="decimals-input" class="input input-md" min="0" max="4" value="2" />
                    </div>
                  </div>
                  <div class="form-group">
                    <label class="form-label" for="default-country-input">País Predeterminado</label>
                    <input type="text" id="default-country-input" class="input input-md" value="Nicaragua" />
                  </div>
                </div>
              </div>

              <!-- ══════════════════════════════════════════════════════════ -->
              <!-- 4. COPIAS DE SEGURIDAD                                    -->
              <!-- ══════════════════════════════════════════════════════════ -->
              <div class="settings-panel" id="tab-respaldos">
                <h3 class="text-lg font-bold">💾 Copias de Seguridad</h3>
                <p class="text-xs text-secondary">Exporta e importa datos en tiempo real de Firebase para prevención de desastres.</p>

                <div class="settings-card" style="background: rgba(59,130,246,0.04); border-color: rgba(59,130,246,0.3);">
                  <div class="settings-card-title" style="color: #60a5fa;">📥 Descargar Copia de Seguridad</div>
                  <p class="text-xs text-secondary">Descarga el volcado completo de Firebase en formato JSON.</p>
                  <button type="button" id="btn-download-backup-tab" class="btn btn-secondary btn-md" style="align-self: flex-start; border-color: #3b82f6; color: #60a5fa;">
                    📥 Descargar Respaldo JSON
                  </button>
                </div>

                <div class="settings-card" style="background: rgba(239,68,68,0.02); border-color: rgba(239,68,68,0.2);">
                  <div class="settings-card-title" style="color: #ef4444;">📤 Restaurar desde Archivo JSON</div>
                  <p class="text-xs text-secondary">⚠️ Sobrescribirá de forma irreversible toda la base de datos actual. Haz un respaldo antes de continuar.</p>
                  <div style="display: flex; gap: var(--space-3); align-items: center; flex-wrap: wrap;">
                    <input type="file" id="restore-backup-file" accept=".json" class="input" style="max-width: 320px; font-size: 0.8rem; padding: 4px;" />
                    <button type="button" id="btn-restore-backup" class="btn btn-danger btn-md" style="background: #dc2626; border-color: #dc2626;">
                      🔥 Ejecutar Restauración
                    </button>
                  </div>
                </div>

                <div class="settings-card">
                  <div class="settings-card-title">Respaldos Automáticos en la Nube</div>
                  <label class="switch-container">
                    <input type="checkbox" id="backup-auto-toggle" class="switch-input" />
                    <div>
                      <strong style="font-size:0.85rem; display:block;">Activar respaldos automáticos (Google Drive)</strong>
                      <span class="text-xs text-secondary">Carga automáticamente la base de datos a Google Drive diariamente.</span>
                    </div>
                  </label>
                  <div class="form-group" style="margin-top: 10px;">
                    <label class="form-label" for="backup-cron-input">Frecuencia (Cron Expression)</label>
                    <input type="text" id="backup-cron-input" class="input input-md" value="0 0 * * *" placeholder="0 0 * * * (Cada medianoche)" />
                  </div>
                </div>
              </div>

              <!-- ══════════════════════════════════════════════════════════ -->
              <!-- 5. MODO MANTENIMIENTO                                     -->
              <!-- ══════════════════════════════════════════════════════════ -->
              <div class="settings-panel" id="tab-mantenimiento">
                <h3 class="text-lg font-bold">🛠️ Modo Mantenimiento</h3>
                <p class="text-xs text-secondary">Bloquea temporalmente el acceso al sistema para todos los roles excepto Programadores.</p>

                <div class="settings-card" style="border-color: rgba(245,158,11,0.4); background: rgba(245,158,11,0.03);">
                  <div class="settings-card-title" style="color: #f59e0b;">🚧 Control de Modo Mantenimiento</div>
                  <label class="switch-container">
                    <input type="checkbox" id="mantenimiento-toggle-tab" class="switch-input" />
                    <div>
                      <strong style="font-size:0.85rem; display:block; color: #f59e0b;">Activar Bloqueo de Mantenimiento</strong>
                      <span class="text-xs text-secondary">Muestra un mensaje de mantenimiento a negocios, dueños y clientes. Los programadores conservan acceso total.</span>
                    </div>
                  </label>
                  <div class="form-group" style="margin-top: 10px;">
                    <label class="form-label" for="maint-message-input">Mensaje Personalizado</label>
                    <textarea id="maint-message-input" class="input" style="height: 100px; padding: 10px;" placeholder="Estamos actualizando el servidor. Regresaremos en unos minutos..."></textarea>
                  </div>
                </div>
              </div>

              <!-- ══════════════════════════════════════════════════════════ -->
              <!-- ═══════════════════════════════════════════════════════════ -->
              <!-- 6. AVANZADO Y MONITOREO                                    -->
              <!-- ═══════════════════════════════════════════════════════════ -->
              <div class="settings-panel" id="tab-avanzado">

                <!-- Header -->
                <div style="display:flex;flex-direction:column;gap:6px;padding-bottom:var(--space-4);border-bottom:1px solid var(--color-border);">
                  <h3 style="margin:0;font-size:1.1rem;font-weight:700;display:flex;align-items:center;gap:8px;">
                    <span style="width:34px;height:34px;background:rgba(124,117,255,0.15);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1rem;">⚡</span>
                    Avanzado y Monitoreo
                  </h3>
                  <p style="margin:0;font-size:0.82rem;color:var(--color-text-secondary);line-height:1.5;">Crea cuentas de administrador, configura el keep-alive del servidor y ejecuta el reinicio de base de datos antes de salir a producción.</p>
                </div>

                <!-- Crear Admin -->
                <div class="settings-card">
                  <div class="settings-card-title" style="color:var(--color-accent);">🔑 Crear Cuenta de Administrador</div>
                  <p style="font-size:0.8rem;color:var(--color-text-secondary);margin:0 0 12px 0;line-height:1.5;">Registra una nueva cuenta con rol de <strong style="color:var(--color-text-primary);">Programador</strong>. Tendrá acceso total al panel de control global del SaaS.</p>
                  <div style="display:flex;flex-direction:column;gap:12px;">
                    <div class="form-group" style="margin:0;">
                      <label class="form-label" for="sa-name">Nombre Completo</label>
                      <input type="text" id="sa-name" class="input input-md" placeholder="Ej: Carlos Administrador" autocomplete="off" />
                    </div>
                    <div class="form-group" style="margin:0;">
                      <label class="form-label" for="sa-email">Correo Electrónico</label>
                      <input type="email" id="sa-email" class="input input-md" placeholder="admin@empresa.com" autocomplete="off" />
                    </div>
                    <div class="form-group" style="margin:0;">
                      <label class="form-label" for="sa-password">Contraseña <span style="font-size:0.75rem;color:var(--color-text-tertiary);font-weight:400;">(mínimo 6 caracteres)</span></label>
                      <input type="password" id="sa-password" class="input input-md" placeholder="••••••••" minlength="6" autocomplete="new-password" />
                    </div>
                    <button type="button" id="btn-create-sa-action" class="btn btn-primary btn-sm" style="width:100%;margin-top:4px;">⚡ Registrar Administrador</button>
                  </div>
                </div>

                <!-- Keep-Alive / Cron Job -->
                <div class="settings-card">
                  <div class="settings-card-title">🕐 Keep-Alive del Servidor (Cron Job)</div>
                  <p style="font-size:0.8rem;color:var(--color-text-secondary);margin:0 0 12px 0;line-height:1.5;">Evita que el servidor en Render se quede inactivo. El sistema enviará una solicitud periódica a tu API para mantenerla siempre activa.</p>

                  <label class="switch-container" style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--color-bg-primary);border-radius:var(--radius-md);border:1px solid var(--color-border);cursor:pointer;">
                    <input type="checkbox" id="cron-enabled-toggle" class="switch-input" />
                    <div style="flex:1;">
                      <strong style="font-size:0.85rem;display:block;color:var(--color-text-primary);">Activar monitoreo keep-alive</strong>
                      <span style="font-size:0.75rem;color:var(--color-text-tertiary);">Se enviará un ping al servidor cada cierto tiempo</span>
                    </div>
                  </label>

                  <div class="form-group" style="margin-top:12px;margin-bottom:0;">
                    <label class="form-label" for="cron-endpoint-input">URL interna de tu API <span style="font-size:0.72rem;color:var(--color-text-tertiary);font-weight:400;">— generada automáticamente</span></label>
                    <input type="url" id="cron-endpoint-input" class="input input-md" readonly style="font-size:0.78rem;font-family:monospace;color:var(--color-text-secondary);" />
                    <div style="display:flex;gap:6px;margin-top:6px;">
                      <button type="button" id="btn-copy-cron-url" class="btn btn-secondary btn-xs" style="flex:1;">📋 Copiar URL</button>
                      <button type="button" id="btn-test-cron-url" class="btn btn-secondary btn-xs" style="flex:1;">🔁 Probar Ahora</button>
                    </div>
                  </div>

                  <div class="settings-grid-2" style="margin-top:12px;">
                    <div class="form-group" style="margin:0;">
                      <label class="form-label" for="cron-provider-input">Proveedor del cron</label>
                      <select id="cron-provider-input" class="input input-md">
                        <option value="cron-job.org">cron-job.org</option>
                        <option value="uptimerobot">UptimeRobot</option>
                        <option value="render-cron">Render Cron Job</option>
                        <option value="otro">Otro</option>
                      </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                      <label class="form-label" for="cron-interval-input">Intervalo <span style="font-size:0.72rem;color:var(--color-text-tertiary);">(minutos)</span></label>
                      <input type="number" id="cron-interval-input" class="input input-md" value="10" min="5" max="60" />
                    </div>
                  </div>

                  <div class="form-group" style="margin-top:12px;margin-bottom:0;">
                    <label class="form-label" for="cron-external-url-input">URL del proveedor externo <span style="font-size:0.72rem;color:var(--color-text-tertiary);font-weight:400;">— opcional</span></label>
                    <input type="url" id="cron-external-url-input" class="input input-md" placeholder="https://cron-job.org/tu-endpoint" />
                  </div>

                  <div class="form-group" style="margin-top:12px;margin-bottom:0;">
                    <label class="form-label" for="cron-token-input">Token de seguridad <span style="font-size:0.72rem;color:var(--color-text-tertiary);font-weight:400;">— opcional</span></label>
                    <input type="text" id="cron-token-input" class="input input-md" placeholder="Solo si configuraste CRON_JOB_TOKEN en el servidor" />
                  </div>

                  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--color-border);">
                    <span id="cron-last-run" style="font-size:0.75rem;color:var(--color-text-tertiary);font-family:monospace;">🕐 Sin ejecutar todavía</span>
                    <button type="button" id="btn-save-cron-settings" class="btn btn-secondary btn-sm">💾 Guardar Configuración Cron</button>
                  </div>
                </div>

                <!-- Reinicio Producción -->
                <div class="settings-card" style="border:1px solid rgba(239,68,68,0.35);background:rgba(239,68,68,0.03);">
                  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <span style="font-size:1rem;">💥</span>
                    <h3 style="margin:0;font-size:0.95rem;font-weight:700;color:#ef4444;flex:1;">Reinicio para Producción</h3>
                    <span style="font-size:0.65rem;padding:3px 8px;border-radius:12px;background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);font-weight:700;white-space:nowrap;">SOLO PROGRAMADOR</span>
                  </div>
                  <p style="font-size:0.8rem;color:var(--color-text-secondary);margin:8px 0 12px 0;line-height:1.5;">Elimina <strong style="color:#f87171;">todos los datos de prueba</strong> de Firebase (negocios, productos, pedidos, usuarios) antes de salir a producción real. Esta acción es <strong style="color:#f87171;">irreversible</strong>.</p>
                  <button type="button" id="btn-execute-purge" class="btn btn-danger btn-md" style="width:100%;background:#dc2626;border-color:#dc2626;font-weight:700;">🔥 Iniciar Asistente de Reinicio de Base de Datos</button>
                </div>
              </div>

              <!-- ═══════════════════════════════════════════════════════════ -->
              <!-- 7. BARRA DE NAVEGACIÓN MÓVIL                               -->
              <!-- ═══════════════════════════════════════════════════════════ -->
              <div class="settings-panel" id="tab-mobile-nav">

                <!-- Header -->
                <div style="display:flex;flex-direction:column;gap:6px;padding-bottom:var(--space-4);border-bottom:1px solid var(--color-border);">
                  <h3 style="margin:0;font-size:1.1rem;font-weight:700;display:flex;align-items:center;gap:8px;">
                    <span style="width:34px;height:34px;background:rgba(59,130,246,0.15);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1rem;">📱</span>
                    Barra de Navegación Móvil
                  </h3>
                  <p style="margin:0;font-size:0.82rem;color:var(--color-text-secondary);line-height:1.5;">Personaliza los <strong style="color:var(--color-text-primary);">5 botones</strong> que aparecen en la barra inferior de la app Android. Define qué módulos se muestran y en qué orden.</p>
                </div>

                <div class="settings-card">
                  <!-- Vista Previa -->
                  <div style="margin-bottom:16px;">
                    <p style="font-size:0.75rem;font-weight:700;color:var(--color-text-tertiary);text-transform:uppercase;letter-spacing:0.07em;margin:0 0 8px 0;">👁️ Vista previa en tiempo real</p>
                    <div id="sa-mnc-preview" style="display:flex;align-items:center;justify-content:space-around;background:rgba(10,12,20,0.95);border:1px solid var(--color-border);border-radius:14px;padding:10px 8px;gap:4px;min-height:60px;"></div>
                    <p style="font-size:0.72rem;color:var(--color-text-tertiary);margin:5px 0 0 0;text-align:center;">Así se verá la barra en el teléfono de los usuarios</p>
                  </div>

                  <div style="height:1px;background:var(--color-border);margin-bottom:16px;"></div>

                  <!-- Orden actual -->
                  <div style="margin-bottom:16px;">
                    <p style="font-size:0.75rem;font-weight:700;color:var(--color-text-tertiary);text-transform:uppercase;letter-spacing:0.07em;margin:0 0 6px 0;">
                      🔢 Orden actual <span id="sa-mnc-count" style="color:var(--color-accent);font-weight:700;font-size:0.78rem;">(0/5)</span>
                    </p>
                    <p style="font-size:0.78rem;color:var(--color-text-secondary);margin:0 0 10px 0;">Los botones se muestran en este orden en el teléfono. Puedes reordenarlos.</p>
                    <div id="sa-mnc-selected-list" style="display:flex;flex-direction:column;gap:8px;min-height:40px;"></div>
                  </div>

                  <div style="height:1px;background:var(--color-border);margin-bottom:16px;"></div>

                  <!-- Catálogo -->
                  <div style="margin-bottom:16px;">
                    <p style="font-size:0.75rem;font-weight:700;color:var(--color-text-tertiary);text-transform:uppercase;letter-spacing:0.07em;margin:0 0 6px 0;">📋 Botones disponibles para agregar</p>
                    <p style="font-size:0.78rem;color:var(--color-text-secondary);margin:0 0 10px 0;">Toca un botón para agregarlo a la barra. Máximo 5 seleccionados.</p>
                    <div id="sa-mnc-catalog" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;"></div>
                  </div>

                  <!-- Acciones -->
                  <div style="display:flex;flex-direction:column;gap:8px;padding-top:12px;border-top:1px solid var(--color-border);">
                    <button type="button" id="btn-sa-save-mobile-nav" class="btn btn-primary btn-md" style="width:100%;">💾 Guardar Configuración de Barra Móvil</button>
                    <button type="button" id="btn-sa-reset-mobile-nav" class="btn btn-secondary btn-sm" style="width:100%;color:var(--color-text-tertiary);">↩️ Restaurar botones predeterminados</button>
                  </div>
                </div>
              </div>

              <!-- ═══════════════════════════════════════════════════════════ -->
              <!-- 8. MENSAJES Y ACTUALIZACIONES DE APK                       -->
              <!-- ═══════════════════════════════════════════════════════════ -->
              <div class="settings-panel" id="tab-broadcasts">

                <!-- Header -->
                <div style="display:flex;flex-direction:column;gap:6px;padding-bottom:var(--space-4);border-bottom:1px solid rgba(16,185,129,0.25);overflow-x:hidden;max-width:100%;box-sizing:border-box;">
                  <h3 style="margin:0;font-size:1.1rem;font-weight:700;display:flex;align-items:center;gap:8px;">
                    <span style="width:34px;height:34px;background:rgba(16,185,129,0.15);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1rem;">📢</span>
                    <span style="color:#10b981;">Mensajes y Distribución de APK</span>
                  </h3>
                  <p style="margin:0;font-size:0.82rem;color:var(--color-text-secondary);line-height:1.5;">Envía notificaciones personalizadas a los dueños de negocio. Anuncia nuevas versiones de la app Android, avisos generales o mensajes directos a un negocio específico.</p>
                </div>

                <!-- Formulario -->
                <div class="settings-card" style="border:1px solid rgba(16,185,129,0.25);background:rgba(16,185,129,0.02);">
                  <div class="settings-card-title" style="color:#10b981;">🚀 Redactar y Enviar Comunicado</div>

                  <div id="bcast-form-wrapper" style="display:flex;flex-direction:column;gap:14px;min-width:0;overflow-x:hidden;">

                    <div class="form-group" style="margin:0;">
                      <label class="form-label" for="bcast-target-scope">🎯 ¿A quién enviarás el mensaje?</label>
                      <select id="bcast-target-scope" class="input input-md">
                        <option value="ALL_OWNERS">🌐 Todos los Dueños de Negocio</option>
                        <option value="SPECIFIC_COMPANY">🏪 Un Dueño Específico</option>
                        <option value="ALL_USERS">👥 Todos los Usuarios del Sistema</option>
                      </select>
                    </div>

                    <div class="form-group" id="bcast-company-select-group" style="display:none;margin:0;">
                      <label class="form-label" for="bcast-company-id">🏪 Selecciona el negocio destinatario</label>
                      <select id="bcast-company-id" class="input input-md">
                        <option value="">Cargando negocios registrados...</option>
                      </select>
                    </div>

                    <div class="form-group" style="margin:0;">
                      <label class="form-label" for="bcast-type">🏷️ ¿Qué tipo de comunicado es?</label>
                      <select id="bcast-type" class="input input-md">
                        <option value="APK_UPDATE">📲 Actualización de App Android (APK)</option>
                        <option value="ANNOUNCEMENT">📢 Aviso General / Comunicado Oficial</option>
                        <option value="DIRECT_MESSAGE">✉️ Mensaje Personalizado Directo</option>
                      </select>
                    </div>

                    <div class="form-group" style="margin:0;">
                      <label class="form-label" for="bcast-title">📌 Título de la notificación</label>
                      <input type="text" id="bcast-title" class="input input-md" placeholder="Ej: Nueva versión disponible — Ultra Admin v2.5.0" />
                    </div>

                    <div class="form-group" style="margin:0;">
                      <label class="form-label" for="bcast-body">📝 Contenido del mensaje</label>
                      <textarea id="bcast-body" class="input" style="height:90px;padding:10px;resize:vertical;" placeholder="Escribe el mensaje, las novedades de la actualización o el aviso que verán los dueños de negocio..."></textarea>
                    </div>

                    <!-- Campos APK -->
                    <div id="bcast-apk-fields-group" style="display:flex;flex-direction:column;gap:12px;overflow-x:hidden;padding:14px;background:rgba(16,185,129,0.06);border:1px dashed rgba(16,185,129,0.3);border-radius:10px;">
                      <p style="margin:0;font-size:0.78rem;font-weight:700;color:#10b981;">📱 Información del archivo APK Android</p>

                      <div class="settings-grid-2">
                        <div class="form-group" style="margin:0;">
                          <label class="form-label" for="bcast-apk-version">Versión del APK <span style="font-size:0.72rem;color:var(--color-text-tertiary);font-weight:400;">— opcional</span></label>
                          <input type="text" id="bcast-apk-version" class="input input-md" placeholder="Ej: v2.5.0" />
                        </div>
                        <div class="form-group" style="margin:0;">
                          <label class="form-label" for="bcast-action-label">Texto del botón de descarga</label>
                          <input type="text" id="bcast-action-label" class="input input-md" value="📥 Descargar Actualización APK" placeholder="Ej: Descargar APK v2.5.0" />
                        </div>
                      </div>

                      <div class="form-group" style="margin:0;">
                        <label class="form-label" for="bcast-apk-url">🔗 Enlace de descarga del APK (.apk)</label>
                        <input type="url" id="bcast-apk-url" class="input input-md" placeholder="https://mi-servidor.com/UltraAdmin-v2.5.0.apk" />
                        <p style="margin:4px 0 0 0;font-size:0.72rem;color:var(--color-text-tertiary);">El usuario verá un botón que abre este enlace para descargar el archivo directamente.</p>
                      </div>
                    </div>

                    <button type="button" id="btn-submit-broadcast" class="btn btn-primary btn-md" style="width:100%;background:linear-gradient(135deg,#10b981,#059669);border:none;font-weight:700;font-size:0.9rem;">🚀 Enviar Notificación</button>
                  </div>
                </div>

                <!-- Historial -->
                <div class="settings-card">
                  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
                    <div class="settings-card-title" style="margin:0;border:none;padding:0;">📜 Historial de Envíos</div>
                    <button type="button" id="btn-refresh-broadcast-history" class="btn btn-secondary btn-sm">🔄 Actualizar</button>
                  </div>
                  <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
                    <table style="width:100%;border-collapse:collapse;font-size:0.8rem;min-width:500px;">
                      <thead>
                        <tr style="border-bottom:2px solid var(--color-border);">
                          <th style="padding:8px 10px;color:var(--color-text-secondary);font-weight:600;text-align:left;">Fecha</th>
                          <th style="padding:8px 10px;color:var(--color-text-secondary);font-weight:600;text-align:left;">Tipo</th>
                          <th style="padding:8px 10px;color:var(--color-text-secondary);font-weight:600;text-align:left;">Título</th>
                          <th style="padding:8px 10px;color:var(--color-text-secondary);font-weight:600;text-align:left;">Destino</th>
                          <th style="padding:8px 10px;color:var(--color-text-secondary);font-weight:600;text-align:left;">Enviados</th>
                          <th style="padding:8px 10px;color:var(--color-text-secondary);font-weight:600;text-align:left;">APK / Link</th>
                        </tr>
                      </thead>
                      <tbody id="broadcast-history-table-body">
                        <tr>
                          <td colspan="6" style="padding:24px;text-align:center;color:var(--color-text-tertiary);font-size:0.82rem;">⏳ Cargando historial de envíos...</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>


              <!-- Form Actions Bar -->
              <div id="settings-actions-bar" style="display: flex; justify-content: flex-end; gap: var(--space-3); border-top: 1px solid rgba(255,255,255,0.06); padding-top: var(--space-4);">
                <button type="button" id="btn-cancel-settings" class="btn btn-secondary btn-md">Cancelar Cambios</button>
                <button type="submit" id="btn-save-settings" class="btn btn-primary btn-md">💾 Guardar Configuración</button>
              </div>

            </form>
          </div>
        </div>
      `
    });
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  mount() {
    const element = this.layout.mount();
    this.afterMount(element);
    this.loadSaaSSettings(element);
    this.loadMobileNavConfig(element);
    this.loadBroadcastCompanies(element);
    this.loadBroadcastHistory(element);
    return element;
  }

  afterMount(element) {
    const root = element || this.layout.element;
    if (!root) return;

    // 1. Tab switching
    const tabBtns = root.querySelectorAll('.settings-tab-btn');
    const panels  = root.querySelectorAll('.settings-panel');
    const actionsBar = root.querySelector('#settings-actions-bar');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = root.querySelector(`#${btn.dataset.tab}`);
        if (panel) panel.classList.add('active');
        // Hide save bar on advanced and broadcast tabs
        if (actionsBar) {
          actionsBar.style.display = ['tab-avanzado', 'tab-broadcasts', 'tab-mobile-nav'].includes(btn.dataset.tab) ? 'none' : 'flex';
        }
        if (btn.dataset.tab === 'tab-broadcasts') {
          this.loadBroadcastHistory(root);
        }
        // Reload mobile nav preview + catalog when switching to that tab
        if (btn.dataset.tab === 'tab-mobile-nav') {
          this.loadMobileNavConfig(root);
        }
      });
    });

    // 2. Theme preset cards
    const presetsGrid = root.querySelector('#theme-presets-grid');
    if (presetsGrid) {
      presetsGrid.addEventListener('click', e => {
        const card = e.target.closest('.theme-preset-card');
        if (!card) return;
        const themeName = card.dataset.theme;
        this._selectTheme(root, themeName);
      });
    }

    // 3. Custom color pickers — live apply when changed
    const colorInputs = root.querySelectorAll('.color-picker-input');
    colorInputs.forEach(input => {
      input.addEventListener('input', () => {
        const hexText = input.nextElementSibling;
        if (hexText) hexText.textContent = input.value.toUpperCase();
        // Only live-apply if current theme is 'custom'
        const currentTheme = root.querySelector('#theme-select')?.value;
        if (currentTheme === 'custom') {
          AppearanceService.applyConfig(this._readAppearanceFields(root));
        }
      });
    });

    // 4. Typography/style inputs — live apply
    ['#font-family-select', '#font-size-select', '#border-radius-input'].forEach(sel => {
      root.querySelector(sel)?.addEventListener('input', () => {
        AppearanceService.applyConfig(this._readAppearanceFields(root));
      });
    });

    // 5. Form save/cancel
    root.querySelector('#global-settings-form')?.addEventListener('submit', e => this.handleSaveSettings(e));
    root.querySelector('#btn-cancel-settings')?.addEventListener('click', () => {
      this.loadSaaSSettings(root);
      NotificationService.info('Cambios cancelados. Se restauraron los datos guardados.');
    });

    // 6. Backup & restore
    root.querySelector('#btn-download-backup-tab')?.addEventListener('click', () => this.handleDownloadBackup());
    root.querySelector('#btn-restore-backup')?.addEventListener('click', () => this.handleRestoreBackup());

    // 7. Advanced
    root.querySelector('#btn-create-sa-action')?.addEventListener('click', e => this.handleCreateSuperAdmin(e));
    root.querySelector('#btn-save-cron-settings')?.addEventListener('click', e => this.handleSaveCronSettings(e));
    root.querySelector('#btn-copy-cron-url')?.addEventListener('click', () => this.copyCronEndpoint());
    root.querySelector('#btn-test-cron-url')?.addEventListener('click', () => this.testCronEndpoint());
    root.querySelector('#btn-execute-purge')?.addEventListener('click', () => this.handleExecuteProductionReset());

    // 8. Broadcast & APK Updates
    const scopeSelect = root.querySelector('#bcast-target-scope');
    const companyGroup = root.querySelector('#bcast-company-select-group');
    if (scopeSelect && companyGroup) {
      scopeSelect.addEventListener('change', () => {
        companyGroup.style.display = scopeSelect.value === 'SPECIFIC_COMPANY' ? 'block' : 'none';
      });
    }

    root.querySelector('#btn-submit-broadcast')?.addEventListener('click', () => this.handleSendBroadcast(root));
    root.querySelector('#btn-refresh-broadcast-history')?.addEventListener('click', () => this.loadBroadcastHistory(root));
  }

  // ─── Theme selection ─────────────────────────────────────────────────────────

  _selectTheme(root, themeName) {
    // Update hidden input
    const themeInput = root.querySelector('#theme-select');
    if (themeInput) themeInput.value = themeName;

    // Update card selection styling
    root.querySelectorAll('.theme-preset-card').forEach(card => {
      const isActive = card.dataset.theme === themeName;
      card.style.borderColor = isActive ? 'var(--color-accent)' : 'transparent';
      card.style.background = isActive ? 'var(--color-accent-light)' : 'var(--color-bg-tertiary)';
    });

    // Populate custom color fields with preset defaults
    if (themeName !== 'custom') {
      const preset = AppearanceService.getThemeDefaults(themeName);
      this._fillColorFields(root, {
        primaryColor:  preset.accent,
        bgColor:       preset.bgPrimary,
        cardColor:     preset.surface,
        sidebarColor:  preset.sidebarBg,
        successColor:  preset.success,
        warningColor:  preset.warning,
        errorColor:    preset.danger,
        textColor:     preset.textPrimary,
        textSecColor:  preset.textSecondary,
      });
      // Apply to real UI immediately
      AppearanceService.applyThemePreset(themeName);
      AppearanceService._applyBodyClass(themeName);
    } else {
      // Apply custom colors from current form values
      AppearanceService.applyConfig(this._readAppearanceFields(root));
    }

    // Show/hide custom color panel
    const customPanel = root.querySelector('#custom-colors-panel');
    if (customPanel) {
      customPanel.style.opacity = themeName === 'custom' ? '1' : '0.5';
      customPanel.style.pointerEvents = themeName === 'custom' ? 'auto' : 'none';
    }
  }

  _fillColorFields(root, colors) {
    const map = {
      primaryColor:  '#primary-color-input',
      bgColor:       '#bg-color-input',
      cardColor:     '#card-color-input',
      sidebarColor:  '#sidebar-color-input',
      successColor:  '#success-color-input',
      warningColor:  '#warning-color-input',
      errorColor:    '#error-color-input',
      textColor:     '#text-color-input',
      textSecColor:  '#text-sec-color-input',
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

  _readAppearanceFields(root) {
    return {
      theme:         root.querySelector('#theme-select')?.value || 'dark',
      fontFamily:    root.querySelector('#font-family-select')?.value || 'Inter',
      fontSize:      root.querySelector('#font-size-select')?.value || '14px',
      borderRadius:  Number(root.querySelector('#border-radius-input')?.value || 8),
      buttonStyle:   root.querySelector('#button-style-select')?.value || 'rounded',
      primaryColor:  root.querySelector('#primary-color-input')?.value || '#3b82f6',
      bgColor:       root.querySelector('#bg-color-input')?.value || '#0a0a0b',
      cardColor:     root.querySelector('#card-color-input')?.value || '#16161a',
      sidebarColor:  root.querySelector('#sidebar-color-input')?.value || '#111113',
      successColor:  root.querySelector('#success-color-input')?.value || '#34d399',
      warningColor:  root.querySelector('#warning-color-input')?.value || '#fbbf24',
      errorColor:    root.querySelector('#error-color-input')?.value || '#f87171',
      textColor:     root.querySelector('#text-color-input')?.value || '#ededef',
      textSecColor:  root.querySelector('#text-sec-color-input')?.value || '#8b8c94',
    };
  }

  // ─── Firebase Load ───────────────────────────────────────────────────────────

  async loadSaaSSettings(element) {
    const root = element || this.layout.element;
    if (!root) return;

    try {
      console.log('[SettingsView] Cargando configuración global del SaaS y preferencias del programador...');
      const saasConfig = await FirestoreService.getSaaSConfig() || {};
      const { currentUser } = GlobalStore.getState();
      const progConfig = (currentUser?.uid ? await FirestoreService.getProgrammerPreferences(currentUser.uid) : null) || {};

      this.config = { ...saasConfig, ...progConfig };

      // Identidad Global
      this._setVal(root, '#saas-name-input',     saasConfig.saasName);
      this._setVal(root, '#saas-comm-name-input', saasConfig.saasCommercialName);
      this._setVal(root, '#saas-slogan-input',    saasConfig.saasSlogan);
      this._setVal(root, '#saas-desc-input',      saasConfig.saasDescription);
      this._setVal(root, '#logo-main-input',      saasConfig.logoMain);
      this._setVal(root, '#logo-dark-input',      saasConfig.logoDark);
      this._setVal(root, '#favicon-input',        saasConfig.favicon);
      this._setVal(root, '#app-icon-input',       saasConfig.appIcon);
      this._setVal(root, '#login-bg-input',       saasConfig.loginBg);

      // Apariencia Individual del Programador (fallback a saasConfig)
      const appearanceSource = Object.keys(progConfig).length > 0 ? progConfig : saasConfig;
      const savedTheme = appearanceSource.theme || 'dark';
      this._selectTheme(root, savedTheme);

      // Typography
      this._setVal(root, '#font-family-select', appearanceSource.fontFamily || 'Inter');
      this._setVal(root, '#font-size-select',   appearanceSource.fontSize || '14px');
      this._setVal(root, '#border-radius-input', appearanceSource.borderRadius ?? 8);
      this._setVal(root, '#button-style-select', appearanceSource.buttonStyle || 'rounded');

      // Custom colors
      this._fillColorFields(root, {
        primaryColor: appearanceSource.primaryColor,
        bgColor:      appearanceSource.bgColor,
        cardColor:    appearanceSource.cardColor,
        sidebarColor: appearanceSource.sidebarColor,
        successColor: appearanceSource.successColor,
        warningColor: appearanceSource.warningColor,
        errorColor:   appearanceSource.errorColor,
        textColor:    appearanceSource.textColor,
        textSecColor: appearanceSource.textSecColor,
      });

      // General
      this._setVal(root, '#company-name-input',      saasConfig.companyName);
      this._setVal(root, '#saas-branch-limit-input', saasConfig.branchLimit ?? 5);
      this._setVal(root, '#timezone-select',         saasConfig.timezone || 'America/Managua');
      this._setVal(root, '#language-select',         saasConfig.language || 'es');
      this._setVal(root, '#date-format-select',      saasConfig.dateFormat || 'DD/MM/YYYY');
      this._setVal(root, '#time-format-select',      saasConfig.timeFormat || '24h');
      this._setVal(root, '#currency-select',         saasConfig.currency || 'NIO');
      this._setVal(root, '#currency-symbol-input',   saasConfig.currencySymbol || 'C$');
      this._setVal(root, '#decimals-input',          saasConfig.decimals ?? 2);
      this._setVal(root, '#default-country-input',   saasConfig.defaultCountry || 'Nicaragua');

      // Copias
      this._setCheck(root, '#backup-auto-toggle', saasConfig.backupAutoEnabled);
      this._setVal(root,   '#backup-cron-input',  saasConfig.backupCron || '0 0 * * *');

      // Mantenimiento
      this._setCheck(root, '#mantenimiento-toggle-tab', saasConfig.maintenanceMode);
      this._setVal(root,   '#maint-message-input',      saasConfig.maintenanceMessage);

      // Cron / Advanced
      this.setCronEndpointValue(root, saasConfig.keepAliveCron);
      this._setCheck(root, '#cron-enabled-toggle',   saasConfig.keepAliveCron?.enabled);
      this._setVal(root,   '#cron-provider-input',   saasConfig.keepAliveCron?.provider || 'cron-job.org');
      this._setVal(root,   '#cron-interval-input',   saasConfig.keepAliveCron?.intervalMinutes || 10);
      this._setVal(root,   '#cron-external-url-input', saasConfig.keepAliveCron?.externalApiUrl);
      this._setVal(root,   '#cron-token-input',      saasConfig.keepAliveCron?.token);

      if (saasConfig.keepAliveCron?.lastTestAtLocal?.epochMs) {
        const el = root.querySelector('#cron-last-run');
        if (el) el.textContent = `Última prueba: ${TimeService.formatDate(saasConfig.keepAliveCron.lastTestAtLocal.epochMs, true)}`;
      }

      console.log('[SettingsView] ✅ Configuración cargada correctamente desde Firebase.');
    } catch (err) {
      console.warn('[SettingsView] Error cargando config:', err.message);
      this.setCronEndpointValue(root);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  _setVal(root, sel, value) {
    const el = root.querySelector(sel);
    if (el && value !== undefined && value !== null) el.value = value;
  }

  _setCheck(root, sel, value) {
    const el = root.querySelector(sel);
    if (el) el.checked = !!value;
  }

  // ─── Save Settings ───────────────────────────────────────────────────────────

  async handleSaveSettings(e) {
    e.preventDefault();
    const root = this.layout.element;
    if (!root) return;

    const saveBtn = root.querySelector('#btn-save-settings');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Guardando…'; }

    try {
      const { currentUser } = GlobalStore.getState();
      const programmerUid = currentUser?.uid;

      const existingSaas = await FirestoreService.getSaaSConfig() || {};
      const existingProg = programmerUid ? (await FirestoreService.getProgrammerPreferences(programmerUid) || {}) : {};

      const saasConfig = {
        ...existingSaas,
        // Identidad Global
        saasName:           root.querySelector('#saas-name-input')?.value.trim()       || 'Ultra Administrador',
        saasCommercialName: root.querySelector('#saas-comm-name-input')?.value.trim()  || 'Ultra Administrador',
        saasSlogan:         root.querySelector('#saas-slogan-input')?.value.trim()     || '',
        saasDescription:    root.querySelector('#saas-desc-input')?.value.trim()       || 'Plataforma SaaS desarrollada por ProLine System.',
        logoMain:           root.querySelector('#logo-main-input')?.value.trim()       || '/assets/logo_ultra_administrador.png',
        logoDark:           root.querySelector('#logo-dark-input')?.value.trim()       || '/assets/logo_ultra_administrador.png',
        favicon:            root.querySelector('#favicon-input')?.value.trim()         || '/assets/logo_ultra_administrador.png',
        appIcon:            root.querySelector('#app-icon-input')?.value.trim()        || '/assets/logo_ultra_administrador.png',
        loginBg:            root.querySelector('#login-bg-input')?.value.trim()        || '',
        // General
        companyName:    root.querySelector('#company-name-input')?.value.trim()   || 'ProLine System',
        branchLimit:    Number(root.querySelector('#saas-branch-limit-input')?.value || 5),
        timezone:       root.querySelector('#timezone-select')?.value             || 'America/Managua',
        language:       root.querySelector('#language-select')?.value             || 'es',
        dateFormat:     root.querySelector('#date-format-select')?.value          || 'DD/MM/YYYY',
        timeFormat:     root.querySelector('#time-format-select')?.value          || '24h',
        currency:       root.querySelector('#currency-select')?.value             || 'NIO',
        currencySymbol: root.querySelector('#currency-symbol-input')?.value.trim()|| 'C$',
        decimals:       Number(root.querySelector('#decimals-input')?.value || 2),
        defaultCountry: root.querySelector('#default-country-input')?.value.trim()|| 'Nicaragua',
        // Copias
        backupAutoEnabled: root.querySelector('#backup-auto-toggle')?.checked    || false,
        backupCron:        root.querySelector('#backup-cron-input')?.value.trim() || '0 0 * * *',
        // Mantenimiento
        maintenanceMode:    root.querySelector('#mantenimiento-toggle-tab')?.checked || false,
        maintenanceMessage: root.querySelector('#maint-message-input')?.value.trim() || '',
      };

      const progAppearance = {
        theme:        root.querySelector('#theme-select')?.value            || 'dark',
        fontFamily:   root.querySelector('#font-family-select')?.value      || 'Inter',
        fontSize:     root.querySelector('#font-size-select')?.value        || '14px',
        borderRadius: Number(root.querySelector('#border-radius-input')?.value || 8),
        buttonStyle:  root.querySelector('#button-style-select')?.value     || 'rounded',
        primaryColor: root.querySelector('#primary-color-input')?.value     || '#3b82f6',
        bgColor:      root.querySelector('#bg-color-input')?.value          || '#0a0a0b',
        cardColor:    root.querySelector('#card-color-input')?.value        || '#16161a',
        sidebarColor: root.querySelector('#sidebar-color-input')?.value     || '#111113',
        successColor: root.querySelector('#success-color-input')?.value     || '#34d399',
        warningColor: root.querySelector('#warning-color-input')?.value     || '#fbbf24',
        errorColor:   root.querySelector('#error-color-input')?.value       || '#f87171',
        textColor:    root.querySelector('#text-color-input')?.value        || '#ededef',
        textSecColor: root.querySelector('#text-sec-color-input')?.value    || '#8b8c94',
      };

      // Compute changed fields
      const saasChanged = {};
      Object.keys(saasConfig).forEach(key => {
        if (JSON.stringify(existingSaas[key]) !== JSON.stringify(saasConfig[key])) {
          saasChanged[key] = { before: existingSaas[key] ?? 'N/A', after: saasConfig[key] };
        }
      });

      const progChanged = {};
      Object.keys(progAppearance).forEach(key => {
        if (JSON.stringify(existingProg[key]) !== JSON.stringify(progAppearance[key])) {
          progChanged[key] = { before: existingProg[key] ?? 'N/A', after: progAppearance[key] };
        }
      });

      if (Object.keys(saasChanged).length === 0 && Object.keys(progChanged).length === 0) {
        NotificationService.info('No se detectaron cambios para guardar.');
        return;
      }

      // Double-confirm if enabling maintenance mode
      if (saasChanged.maintenanceMode && saasConfig.maintenanceMode === true) {
        const ok = confirm('⚠️ ¿Confirmas que deseas ACTIVAR el Modo Mantenimiento? Se bloqueará el acceso a los locales de forma inmediata.');
        if (!ok) {
          NotificationService.info('Guardado cancelado — Modo Mantenimiento no fue activado.');
          return;
        }
      }

      // 1. Persist Global SaaS config
      if (Object.keys(saasChanged).length > 0) {
        await FirestoreService.updateSaaSConfig(saasConfig);
        await FirestoreService.logAudit({
          action: 'GLOBAL_CONFIG_CHANGE',
          companyId: 'global',
          description: `Configuración global del SaaS actualizada. Campos: ${Object.keys(saasChanged).join(', ')}`,
          metadata: { changedFields: saasChanged }
        });
      }

      // 2. Persist Programmer personal appearance preferences
      if (programmerUid && Object.keys(progChanged).length > 0) {
        await FirestoreService.updateProgrammerPreferences(programmerUid, progAppearance);
        await FirestoreService.logAudit({
          action: 'PROGRAMMER_THEME_UPDATE',
          companyId: 'programmer',
          description: `El programador actualizó sus preferencias visuales personales [Tema: ${progAppearance.theme}].`,
          metadata: { changedFields: progChanged }
        });
      }

      this.config = { ...saasConfig, ...progAppearance };

      // 3. Apply to live UI
      AppearanceService.applyConfig(progAppearance);

      NotificationService.success('✅ Configuración guardada y aplicada correctamente.');
    } catch (err) {
      console.error('[SettingsView] Error al guardar:', err);
      NotificationService.error(`Error al guardar: ${err.message || err}`);
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Guardar Configuración'; }
    }
  }

  // ─── Cron / Keep Alive ───────────────────────────────────────────────────────

  setCronEndpointValue(root, keepAliveCron = {}) {
    const endpointInput = root.querySelector('#cron-endpoint-input');
    const token = keepAliveCron.token || '';
    const base  = `${window.location.origin}/api/cron/ping`;
    if (endpointInput) endpointInput.value = token ? `${base}?token=${encodeURIComponent(token)}` : base;
  }

  async handleSaveCronSettings(e) {
    e.preventDefault();
    const root = this.layout.element;
    if (!root) return;

    const saveBtn = root.querySelector('#btn-save-cron-settings');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Guar…'; }

    try {
      const enabled         = root.querySelector('#cron-enabled-toggle')?.checked || false;
      const provider        = root.querySelector('#cron-provider-input')?.value || 'cron-job.org';
      const intervalMinutes = Number(root.querySelector('#cron-interval-input')?.value || 10);
      const externalApiUrl  = root.querySelector('#cron-external-url-input')?.value.trim() || '';
      const token           = root.querySelector('#cron-token-input')?.value.trim() || '';
      const endpointUrl     = token
        ? `${window.location.origin}/api/cron/ping?token=${encodeURIComponent(token)}`
        : `${window.location.origin}/api/cron/ping`;

      const keepAliveCron = { enabled, provider, intervalMinutes, externalApiUrl, token, endpointUrl, renderKeepAlive: true, updatedAtLocal: TimeService.timestamp() };

      await FirestoreService.updateCompanyConfig('global', { keepAliveCron });
      await FirestoreService.logAudit({ action: 'GLOBAL_CRON_CONFIG_SAVE', companyId: 'global', description: `Cron job actualizado: ${provider}, cada ${intervalMinutes} min.`, metadata: keepAliveCron });

      this.setCronEndpointValue(root, keepAliveCron);
      NotificationService.success('Cron Job / Keep Alive guardado correctamente.');
    } catch (err) {
      console.error('[SettingsView] Error al guardar cron:', err);
      NotificationService.error(`Error: ${err.message}`);
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Guardar Cron'; }
    }
  }

  async copyCronEndpoint() {
    const root = this.layout.element;
    const endpoint = root?.querySelector('#cron-endpoint-input')?.value || `${window.location.origin}/api/cron/ping`;
    try { await navigator.clipboard.writeText(endpoint); } catch { /* fallback */ }
    NotificationService.success('URL del cron copiada al portapapeles.');
  }

  async testCronEndpoint() {
    const root    = this.layout.element;
    const endpoint = root?.querySelector('#cron-endpoint-input')?.value || `${window.location.origin}/api/cron/ping`;
    const statusEl = root?.querySelector('#cron-last-run');
    const testBtn  = root?.querySelector('#btn-test-cron-url');

    if (testBtn) { testBtn.disabled = true; testBtn.textContent = 'Probando…'; }
    try {
      const response = await fetch(endpoint, { method: 'GET' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const ts = TimeService.timestamp();
      if (statusEl) statusEl.textContent = `Última prueba: ${TimeService.formatDate(ts.epochMs, true)}`;
      const existing = await FirestoreService.getCompanyConfig('global');
      await FirestoreService.updateCompanyConfig('global', { keepAliveCron: { ...(existing?.keepAliveCron || {}), lastTestOk: true, lastTestAtLocal: ts } });
      NotificationService.success('API del cron respondió correctamente ✅');
    } catch (err) {
      if (statusEl) statusEl.textContent = `Última prueba: error (${err.message})`;
      NotificationService.error('La API del cron no respondió correctamente.');
    } finally {
      if (testBtn) { testBtn.disabled = false; testBtn.textContent = 'Probar'; }
    }
  }

  // ─── Backup & Restore ────────────────────────────────────────────────────────

  async handleDownloadBackup() {
    try {
      NotificationService.info('Generando copia de seguridad…');
      await AuthService.downloadDatabaseBackup();
      NotificationService.success('Respaldo descargado con éxito.');
    } catch (err) {
      NotificationService.error(`Error al generar respaldo: ${err.message}`);
    }
  }

  async handleRestoreBackup() {
    const root = this.layout.element;
    const fileInput = root?.querySelector('#restore-backup-file');
    if (!fileInput?.files[0]) { NotificationService.error('Selecciona un archivo JSON primero.'); return; }

    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const backupData = JSON.parse(e.target.result);
        if (!confirm('⚠️ ¿Restaurar la base de datos? Esto borrará toda la información actual de forma irreversible.')) return;
        const code = prompt('Escribe RESTAURAR-RESPALDO para confirmar:');
        if (code !== 'RESTAURAR-RESPALDO') { NotificationService.info('Restauración cancelada.'); return; }

        NotificationService.info('Restaurando base de datos…');
        const { db } = await import('../../../config/firebase.config.js');
        const { ref, set } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js');
        if (db) {
          await set(ref(db), backupData);
          await FirestoreService.logAudit({ action: 'GLOBAL_DATABASE_RESTORE', companyId: 'global', description: `DB restaurada desde archivo [${file.name}].` });
          NotificationService.success('Base de datos restaurada correctamente.');
          setTimeout(() => this.loadSaaSSettings(root), 1000);
        }
      } catch (err) { NotificationService.error(`Error de restauración: ${err.message}`); }
    };
    reader.readAsText(file);
  }

  // ─── Super Admin Creation ────────────────────────────────────────────────────

  async handleCreateSuperAdmin(e) {
    e.preventDefault();
    const root = this.layout.element;
    if (!root) return;

    const displayName = root.querySelector('#sa-name')?.value.trim();
    const email       = root.querySelector('#sa-email')?.value.trim();
    const password    = root.querySelector('#sa-password')?.value;
    const submitBtn   = root.querySelector('#btn-create-sa-action');

    if (!displayName || !email || !password) { NotificationService.error('Por favor completa todos los campos.'); return; }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Registrando…'; }

    try {
      await AuthService.createUser(email, password, { displayName, role: 'SUPER_ADMIN', companyId: 'global', branchId: 'global' });
      NotificationService.success(`Administrador "${displayName}" registrado exitosamente.`);
      root.querySelector('#sa-name').value  = '';
      root.querySelector('#sa-email').value = '';
      root.querySelector('#sa-password').value = '';
    } catch (err) {
      NotificationService.error(`Error: ${err.message}`);
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '⚡ Registrar Administrador'; }
    }
  }

  // ─── Production Reset Modal ──────────────────────────────────────────────────

  handleExecuteProductionReset() { this.openProductionResetModal(); }

  openProductionResetModal() {
    const old = document.getElementById('production-reset-modal');
    if (old) old.remove();

    document.body.insertAdjacentHTML('beforeend', `
      <div id="production-reset-modal" style="position:fixed;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;">
        <div class="card p-6" style="background:#111115;border:1px solid rgba(239,68,68,.4);border-radius:12px;width:100%;max-width:680px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 40px rgba(0,0,0,.8);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:12px;">
            <div>
              <h3 style="font-size:1.2rem;font-weight:700;color:#ef4444;margin:0;">💥 Reinicio Completo para Producción</h3>
              <p style="font-size:0.8rem;color:#9ca3af;margin-top:4px;">Exclusivo para usuarios Programador.</p>
            </div>
            <button id="modal-close-btn" style="background:transparent;border:none;color:#9ca3af;font-size:1.5rem;cursor:pointer;">&times;</button>
          </div>

          <div id="reset-stage-1">
            <div style="padding:14px;background:rgba(239,68,68,.08);border-radius:8px;border:1px solid rgba(239,68,68,.25);margin-bottom:16px;">
              <h4 style="color:#f87171;margin:0 0 6px;">⚠️ ELIMINACIÓN PERMANENTE</h4>
              <p style="font-size:0.78rem;color:#d1d5db;margin:0 0 8px;">Esta acción elimina todos los datos de prueba en Firebase:</p>
              <ul style="font-size:.75rem;color:#9ca3af;margin:0;padding-left:18px;display:grid;grid-template-columns:1fr 1fr;gap:4px;">
                <li>❌ Cuentas de clientes y empleados</li><li>❌ Empresas y sucursales</li>
                <li>❌ Productos y categorías</li><li>❌ Pedidos y facturas</li>
                <li>❌ Mesas y códigos QR</li><li>❌ Config de locales</li>
              </ul>
              <div style="margin-top:10px;font-size:.75rem;color:#10b981;font-weight:600;">🛡️ Se conservan: Cuentas de Programador y configuración del SaaS.</div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(59,130,246,.08);padding:12px;border-radius:8px;border:1px solid rgba(59,130,246,.2);margin-bottom:16px;">
              <div><strong style="font-size:.82rem;color:#60a5fa;display:block;">1. Genera un respaldo antes de continuar</strong><span style="font-size:.72rem;color:#9ca3af;">Descarga el JSON completo de Firebase.</span></div>
              <button id="modal-download-backup-btn" class="btn btn-secondary btn-sm" style="border-color:#3b82f6;color:#60a5fa;white-space:nowrap;">📥 Descargar Backup</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px;">
              <div>
                <label style="font-size:.8rem;font-weight:600;color:#e5e7eb;display:block;margin-bottom:6px;">2. Escribe <code style="background:rgba(239,68,68,.2);color:#f87171;padding:2px 6px;border-radius:4px;">REINICIAR-PRODUCCION</code> para confirmar:</label>
                <input type="text" id="modal-confirm-input" class="input input-md" placeholder="Escribe aquí la confirmación" style="width:100%;font-family:monospace;" />
              </div>
              <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:.78rem;color:#9ca3af;background:rgba(255,255,255,.03);padding:10px;border-radius:6px;border:1px solid rgba(255,255,255,.08);">
                <input type="checkbox" id="modal-confirm-checkbox" style="margin-top:2px;" />
                <span>Confirmo que he respaldado la información y deseo proceder con la purga de Firebase.</span>
              </label>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;">
              <button id="modal-cancel-btn" class="btn btn-secondary btn-md">Cancelar</button>
              <button id="modal-start-purge-btn" class="btn btn-danger btn-md" disabled style="opacity:.5;cursor:not-allowed;background:#dc2626;border-color:#dc2626;">🔥 Limpiar Firebase</button>
            </div>
          </div>

          <div id="reset-stage-2" style="display:none;">
            <div style="margin-bottom:16px;">
              <div style="display:flex;justify-content:space-between;font-size:.8rem;font-weight:600;margin-bottom:6px;">
                <span id="progress-stage-title" style="color:#60a5fa;">Iniciando…</span>
                <span id="progress-percent" style="color:#10b981;">0%</span>
              </div>
              <div style="width:100%;height:10px;background:rgba(255,255,255,.1);border-radius:5px;overflow:hidden;">
                <div id="progress-bar-fill" style="width:0%;height:100%;background:linear-gradient(90deg,#ef4444,#10b981);transition:width .3s;"></div>
              </div>
              <p id="progress-detail-text" style="font-size:.75rem;color:#9ca3af;margin-top:6px;font-family:monospace;">Preparando…</p>
            </div>
            <div id="modal-log-console" style="background:#090a0f;border:1px solid rgba(16,185,129,.3);border-radius:8px;padding:12px;font-family:monospace;font-size:.72rem;max-height:180px;overflow-y:auto;color:#10b981;margin-bottom:16px;">
              <div style="color:#6b7280;margin-bottom:4px;">=== PROCESO DE LIMPIEZA EN CURSO ===</div>
            </div>
            <div id="modal-result-summary" style="display:none;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.3);border-radius:8px;padding:14px;margin-bottom:16px;">
              <h4 style="color:#10b981;margin:0 0 10px;">🎉 ¡Reinicio Completado!</h4>
              <div id="result-metrics-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;font-size:.75rem;color:#e5e7eb;"></div>
            </div>
            <div style="display:flex;justify-content:flex-end;">
              <button id="modal-finish-btn" class="btn btn-primary btn-md" disabled style="opacity:.5;">Procesando…</button>
            </div>
          </div>
        </div>
      </div>
    `);

    const overlay        = document.getElementById('production-reset-modal');
    const closeModal     = () => overlay.remove();
    const confirmInput   = document.getElementById('modal-confirm-input');
    const confirmCheck   = document.getElementById('modal-confirm-checkbox');
    const startPurgeBtn  = document.getElementById('modal-start-purge-btn');
    const stage1         = document.getElementById('reset-stage-1');
    const stage2         = document.getElementById('reset-stage-2');
    const progressTitle  = document.getElementById('progress-stage-title');
    const progressPct    = document.getElementById('progress-percent');
    const progressBar    = document.getElementById('progress-bar-fill');
    const progressDetail = document.getElementById('progress-detail-text');
    const logConsole     = document.getElementById('modal-log-console');
    const resultSummary  = document.getElementById('modal-result-summary');
    const resultGrid     = document.getElementById('result-metrics-grid');
    const finishBtn      = document.getElementById('modal-finish-btn');

    document.getElementById('modal-close-btn').addEventListener('click', closeModal);
    document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
    document.getElementById('modal-download-backup-btn').addEventListener('click', () => this.handleDownloadBackup());

    const validate = () => {
      const valid = confirmInput.value.trim().toUpperCase() === 'REINICIAR-PRODUCCION' && confirmCheck.checked;
      startPurgeBtn.disabled = !valid;
      startPurgeBtn.style.opacity = valid ? '1' : '0.5';
      startPurgeBtn.style.cursor  = valid ? 'pointer' : 'not-allowed';
    };
    confirmInput.addEventListener('input', validate);
    confirmCheck.addEventListener('change', validate);

    startPurgeBtn.addEventListener('click', async () => {
      stage1.style.display = 'none';
      stage2.style.display = 'block';

      const appendLog = (msg, isError = false) => {
        const div = document.createElement('div');
        div.style.color = isError ? '#ef4444' : '#10b981';
        div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        logConsole.appendChild(div);
        logConsole.scrollTop = logConsole.scrollHeight;
      };

      try {
        const result = await AuthService.purgeAllTestDataExceptSuperAdmin((stage, pct, msg) => {
          progressTitle.textContent = stage;
          progressPct.textContent   = `${pct}%`;
          progressBar.style.width   = `${pct}%`;
          progressDetail.textContent = msg;
          appendLog(msg);
        });

        resultSummary.style.display = 'block';
        const c = result.collectionCounts || {};
        resultGrid.innerHTML = `
          <div style="background:rgba(0,0,0,.3);padding:8px;border-radius:4px;">👥 <strong>${result.deletedUsersCount}</strong> Usuarios</div>
          <div style="background:rgba(0,0,0,.3);padding:8px;border-radius:4px;">🏢 <strong>${result.deletedCompaniesCount}</strong> Empresas</div>
          <div style="background:rgba(0,0,0,.3);padding:8px;border-radius:4px;">📦 <strong>${c.productos || 0}</strong> Productos</div>
          <div style="background:rgba(0,0,0,.3);padding:8px;border-radius:4px;">🧾 <strong>${c.pedidos || 0}</strong> Pedidos</div>
          <div style="background:rgba(0,0,0,.3);padding:8px;border-radius:4px;">🪑 <strong>${c.mesas || 0}</strong> Mesas</div>
          <div style="background:rgba(0,0,0,.3);padding:8px;border-radius:4px;">🛡️ <strong>${result.keptProgrammersCount}</strong> Programadores</div>
        `;
        finishBtn.disabled = false;
        finishBtn.style.opacity = '1';
        finishBtn.textContent   = '🎉 Cerrar';
        finishBtn.addEventListener('click', closeModal);
        NotificationService.success('¡Reinicio de producción completado!');
      } catch (err) {
        appendLog(`💥 ERROR: ${err.message}`, true);
        progressTitle.textContent = '❌ Error';
        progressTitle.style.color = '#ef4444';
        finishBtn.disabled = false;
        finishBtn.style.opacity = '1';
        finishBtn.textContent = 'Cerrar';
        finishBtn.classList.replace('btn-primary', 'btn-secondary');
        finishBtn.addEventListener('click', closeModal);
      }
    });
  }

  // ─── Mobile Nav Personalization for Super Admin ──────────────────────────────

  async loadMobileNavConfig(root) {
    if (!root) return;
    const defaultTabs = DEFAULT_NAV_TABS || ['home', 'actions', 'create', 'notifications', 'more'];
    
    // Always render UI immediately with current state or default tabs
    const initialTabs = (this.mobileNavSelectedTabs && this.mobileNavSelectedTabs.length > 0)
      ? this.mobileNavSelectedTabs
      : [...defaultTabs];
    
    this.renderMobileNavUI(root, initialTabs);

    const { currentUser } = GlobalStore.getState();
    const uid = currentUser?.uid || AuthService.getCurrentUser()?.uid;
    if (!uid) return;

    try {
      const tabs = await MobileNavConfigService.load(uid);
      if (Array.isArray(tabs) && tabs.length > 0) {
        this.renderMobileNavUI(root, tabs);
      }
    } catch (err) {
      console.error('[SuperAdminSettings] Error loading mobile nav config:', err);
    }
  }

  renderMobileNavUI(root, selectedIds = []) {
    const previewEl = root.querySelector('#sa-mnc-preview');
    const selectedListEl = root.querySelector('#sa-mnc-selected-list');
    const catalogEl = root.querySelector('#sa-mnc-catalog');
    const countEl = root.querySelector('#sa-mnc-count');

    if (!previewEl || !selectedListEl || !catalogEl) return;

    this.mobileNavSelectedTabs = [...selectedIds];
    const role = 'SUPER_ADMIN';

    if (countEl) countEl.textContent = `(${selectedIds.length}/5 seleccionados)`;

    // 1. Preview
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

    // 2. Selected list
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
            <button type="button" class="btn btn-secondary btn-sm sa-mnc-btn-up" data-id="${id}" ${isFirst ? 'disabled style="opacity:0.3;"' : ''}>▲</button>
            <button type="button" class="btn btn-secondary btn-sm sa-mnc-btn-down" data-id="${id}" ${isLast ? 'disabled style="opacity:0.3;"' : ''}>▼</button>
            <button type="button" class="btn btn-secondary btn-sm sa-mnc-btn-remove" data-id="${id}" style="color:#ef4444; border-color:rgba(239,68,68,0.3);">✕</button>
          </div>
        </div>
      `;
    }).join('');

    // 3. Catalog
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
            : `<button type="button" class="btn btn-secondary btn-sm sa-mnc-btn-add" data-id="${tab.id}" ${selectedIds.length >= 5 ? 'disabled' : ''} style="font-size:0.7rem; padding:3px 8px;">+ Agregar</button>`
          }
        </div>
      `;
    }).join('');

    // Listeners
    selectedListEl.querySelectorAll('.sa-mnc-btn-up').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = selectedIds.indexOf(btn.dataset.id);
        if (idx > 0) {
          const newArr = [...selectedIds];
          [newArr[idx - 1], newArr[idx]] = [newArr[idx], newArr[idx - 1]];
          this.renderMobileNavUI(root, newArr);
        }
      });
    });

    selectedListEl.querySelectorAll('.sa-mnc-btn-down').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = selectedIds.indexOf(btn.dataset.id);
        if (idx >= 0 && idx < selectedIds.length - 1) {
          const newArr = [...selectedIds];
          [newArr[idx + 1], newArr[idx]] = [newArr[idx], newArr[idx + 1]];
          this.renderMobileNavUI(root, newArr);
        }
      });
    });

    selectedListEl.querySelectorAll('.sa-mnc-btn-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const newArr = selectedIds.filter(i => i !== btn.dataset.id);
        this.renderMobileNavUI(root, newArr);
      });
    });

    catalogEl.querySelectorAll('.sa-mnc-btn-add').forEach(btn => {
      btn.addEventListener('click', () => {
        if (selectedIds.length < 5 && !selectedIds.includes(btn.dataset.id)) {
          this.renderMobileNavUI(root, [...selectedIds, btn.dataset.id]);
        }
      });
    });

    const saveBtn = root.querySelector('#btn-sa-save-mobile-nav');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const { currentUser } = GlobalStore.getState();
        if (!currentUser?.uid) return;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando...';
        try {
          await MobileNavConfigService.save(currentUser.uid, this.mobileNavSelectedTabs);
          GlobalStore.set({ mobileNavConfig: this.mobileNavSelectedTabs });
          NotificationService.success('📱 Configuración de barra móvil guardada.');
        } catch (err) {
          NotificationService.error('Error al guardar barra móvil.');
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = '💾 Guardar Configuración Móvil';
        }
      };
    }

    const resetBtn = root.querySelector('#btn-sa-reset-mobile-nav');
    if (resetBtn) {
      resetBtn.onclick = async () => {
        const { currentUser } = GlobalStore.getState();
        if (!currentUser?.uid) return;
        if (!confirm('¿Restaurar valores predeterminados?')) return;
        await MobileNavConfigService.save(currentUser.uid, [...DEFAULT_NAV_TABS]);
        GlobalStore.set({ mobileNavConfig: [...DEFAULT_NAV_TABS] });
        this.renderMobileNavUI(root, [...DEFAULT_NAV_TABS]);
        NotificationService.success('Barra móvil restaurada a predeterminados.');
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROGRAMMER BROADCASTING & APK DISTRIBUTION HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  async loadBroadcastCompanies(parentEl) {
    const root = parentEl || this.layout.element;
    const select = root?.querySelector('#bcast-company-id');
    if (!select) return;

    try {
      const companies = await FirestoreService.listAllCompanies();
      if (!companies || companies.length === 0) {
        select.innerHTML = `<option value="">No hay empresas registradas</option>`;
        return;
      }

      select.innerHTML = companies
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .map(c => `<option value="${c.id}">${c.name || c.id} — ${c.ownerEmail ? `👤 ${c.ownerEmail}` : 'Sin correo registrado'}</option>`)
        .join('');
    } catch (err) {
      console.warn('[SettingsView] Error loading broadcast companies:', err.message);
      select.innerHTML = `<option value="">Error al cargar empresas</option>`;
    }
  }

  async loadBroadcastHistory(parentEl) {
    const root = parentEl || this.layout.element;
    const tbody = root?.querySelector('#broadcast-history-table-body');
    if (!tbody) return;

    try {
      const history = await PushNotificationsCenterService.getBroadcastHistory();
      if (!history || history.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" style="padding:24px; text-align:center; color:var(--color-text-tertiary);">
              ✨ Aún no has enviado comunicados o actualizaciones de APK.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = history.map(b => {
        const timeStr = b.sentAt ? TimeService.formatTime(b.sentAt) + ' ' + TimeService.formatDate(b.sentAt) : '—';
        const typeBadge = b.type === 'APK_UPDATE'
          ? '<span class="badge" style="background:#10b981; color:#fff; font-size:0.7rem; font-weight:700;">📲 Actualización APK</span>'
          : '<span class="badge" style="background:var(--color-accent); color:#fff; font-size:0.7rem; font-weight:700;">📢 Comunicado</span>';

        const apkInfo = b.apkUrl
          ? `<a href="${b.apkUrl}" target="_blank" style="color:#10b981; text-decoration:underline; font-weight:600;">🔗 Descargar APK (${b.version || 'v1.0'})</a>`
          : '<span style="color:var(--color-text-tertiary);">—</span>';

        return `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); font-size:0.8rem;">
            <td style="padding:10px 12px; color:var(--color-text-tertiary); white-space:nowrap;">${timeStr}</td>
            <td style="padding:10px 12px;">${typeBadge}</td>
            <td style="padding:10px 12px; font-weight:700; color:var(--color-text-primary);">${b.title || '—'}</td>
            <td style="padding:10px 12px; color:var(--color-text-secondary);">${b.targetScope || 'General'}</td>
            <td style="padding:10px 12px; font-weight:700; color:var(--color-accent);">${b.recipientsCount || 0} dueño(s)</td>
            <td style="padding:10px 12px;">${apkInfo}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.warn('[SettingsView] Error loading broadcast history:', err.message);
      tbody.innerHTML = `<tr><td colspan="6" style="padding:16px; text-align:center; color:var(--color-danger);">Error al cargar historial.</td></tr>`;
    }
  }

  async handleSendBroadcast(parentEl) {
    const root = parentEl || this.layout.element;
    const btn = root?.querySelector('#btn-submit-broadcast');

    const targetScope = root?.querySelector('#bcast-target-scope')?.value || 'ALL_OWNERS';
    const companyId   = root?.querySelector('#bcast-company-id')?.value || '';
    const type        = root?.querySelector('#bcast-type')?.value || 'APK_UPDATE';
    const title       = (root?.querySelector('#bcast-title')?.value || '').trim();
    const body        = (root?.querySelector('#bcast-body')?.value || '').trim();
    const version     = (root?.querySelector('#bcast-apk-version')?.value || '').trim();
    const apkUrl      = (root?.querySelector('#bcast-apk-url')?.value || '').trim();
    const actionLabel = (root?.querySelector('#bcast-action-label')?.value || '').trim() || '📥 Descargar Actualización APK';

    if (!title || !body) {
      alert('Por favor ingresa al menos el Título y el Mensaje de la notificación.');
      return;
    }

    if (type === 'APK_UPDATE' && !apkUrl) {
      if (!confirm('No has ingresado un enlace de descarga APK. ¿Deseas enviar el aviso de todos modos?')) {
        return;
      }
    }

    if (!confirm(`¿Confirmas el envío de este comunicado/actualización a ${targetScope === 'ALL_OWNERS' ? 'todos los dueños registrados' : 'el destinatario seleccionado'}?`)) {
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Enviando a Firebase...';
    }

    try {
      const result = await PushNotificationsCenterService.broadcastToOwners({
        targetScope,
        companyId,
        type,
        title,
        body,
        version,
        apkUrl,
        actionLabel
      });

      if (result.success) {
        NotificationService.success(`🚀 Comunicado enviado exitosamente a ${result.count} destinatario(s).`);
        // Reset form inputs
        if (root.querySelector('#bcast-title')) root.querySelector('#bcast-title').value = '';
        if (root.querySelector('#bcast-body')) root.querySelector('#bcast-body').value = '';
        if (root.querySelector('#bcast-apk-version')) root.querySelector('#bcast-apk-version').value = '';
        if (root.querySelector('#bcast-apk-url')) root.querySelector('#bcast-apk-url').value = '';

        // Reload history table
        await this.loadBroadcastHistory(root);
      } else {
        NotificationService.warning(result.message || 'No se enviaron notificaciones.');
      }
    } catch (err) {
      console.error('[SettingsView] Error sending broadcast:', err);
      NotificationService.error(`Error al enviar comunicado: ${err.message || err}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🚀 Enviar Notificación / Actualización APK';
      }
    }
  }

  // ─── Unmount ────────────────────────────────────────────────────────────────

  unmount() {
    this.layout.unmount();
    super.unmount();
  }
}
