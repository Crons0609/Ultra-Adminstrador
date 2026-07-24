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
        <div class="settings-layout">

          <!-- Left Tabs Sidebar -->
          <div class="settings-sidebar">
            <button type="button" class="settings-tab-btn active" data-tab="tab-identidad">ℹ️ Identidad del Sistema</button>
            <button type="button" class="settings-tab-btn" data-tab="tab-apariencia">🎨 Apariencia y Diseño</button>
            <button type="button" class="settings-tab-btn" data-tab="tab-general">⚙️ Configuración General</button>
            <button type="button" class="settings-tab-btn" data-tab="tab-respaldos">💾 Copias de Seguridad</button>
            <button type="button" class="settings-tab-btn" data-tab="tab-mantenimiento">🛠️ Modo Mantenimiento</button>
            <button type="button" class="settings-tab-btn" data-tab="tab-avanzado">⚡ Avanzado y Monitoreo</button>
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
              <!-- 6. AVANZADO Y MONITOREO                                   -->
              <!-- ══════════════════════════════════════════════════════════ -->
              <div class="settings-panel" id="tab-avanzado">
                <h3 class="text-lg font-bold">⚡ Avanzado y Monitoreo</h3>
                <p class="text-xs text-secondary">Registrar administradores, keep-alive para Render y reinicio de producción.</p>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-6); align-items: start;">
                  <!-- Create SuperAdmin -->
                  <div class="settings-card">
                    <div class="settings-card-title" style="color: var(--color-accent);">🔑 Crear Administrador del Sistema</div>
                    <p class="text-xs text-secondary">Registra una nueva cuenta de Programador con acceso total al panel de control global.</p>
                    <div class="form-group mb-2">
                      <label class="form-label" for="sa-name">Nombre Completo</label>
                      <input type="text" id="sa-name" class="input input-md" placeholder="Ej. Administrador Principal" />
                    </div>
                    <div class="form-group mb-2">
                      <label class="form-label" for="sa-email">Correo Electrónico</label>
                      <input type="email" id="sa-email" class="input input-md" placeholder="ejemplo@correo.com" />
                    </div>
                    <div class="form-group mb-3">
                      <label class="form-label" for="sa-password">Contraseña (mín. 6 caracteres)</label>
                      <input type="password" id="sa-password" class="input input-md" placeholder="••••••" minlength="6" />
                    </div>
                    <button type="button" id="btn-create-sa-action" class="btn btn-primary btn-sm" style="width: 100%;">
                      ⚡ Registrar Administrador
                    </button>
                  </div>

                  <!-- Cron Job / Keep Alive -->
                  <div class="settings-card">
                    <div class="settings-card-title">Uptime Cron Job / Keep Alive (Render)</div>
                    <label class="switch-container">
                      <input type="checkbox" id="cron-enabled-toggle" class="switch-input" />
                      <div>
                        <strong style="font-size:0.85rem; display:block;">Activar monitoreo keep alive</strong>
                      </div>
                    </label>
                    <div class="form-group" style="margin-top: 8px;">
                      <label class="form-label" for="cron-endpoint-input">API interna del cron job</label>
                      <div style="display:flex; gap:6px; align-items:center;">
                        <input type="url" id="cron-endpoint-input" class="input input-md" readonly style="flex:1; font-size: 0.72rem;" />
                        <button type="button" id="btn-copy-cron-url" class="btn btn-secondary btn-xs">Copiar</button>
                        <button type="button" id="btn-test-cron-url" class="btn btn-secondary btn-xs">Probar</button>
                      </div>
                    </div>
                    <div class="settings-grid-2">
                      <div class="form-group">
                        <label class="form-label" for="cron-provider-input">Proveedor</label>
                        <select id="cron-provider-input" class="input input-md">
                          <option value="cron-job.org">cron-job.org</option>
                          <option value="uptimerobot">UptimeRobot</option>
                          <option value="render-cron">Render Cron Job</option>
                          <option value="otro">Otro</option>
                        </select>
                      </div>
                      <div class="form-group">
                        <label class="form-label" for="cron-interval-input">Intervalo (Minutos)</label>
                        <input type="number" id="cron-interval-input" class="input input-md" value="10" min="5" max="60" />
                      </div>
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="cron-external-url-input">URL del proveedor externo (opcional)</label>
                      <input type="url" id="cron-external-url-input" class="input input-md" placeholder="https://cron-job.org/…" />
                    </div>
                    <div class="form-group">
                      <label class="form-label" for="cron-token-input">Token opcional</label>
                      <input type="text" id="cron-token-input" class="input input-md" placeholder="Solo si configuras CRON_JOB_TOKEN" />
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                      <span id="cron-last-run" class="text-xs text-secondary" style="font-family: monospace;">Última prueba: sin ejecutar</span>
                      <button type="button" id="btn-save-cron-settings" class="btn btn-secondary btn-xs">Guardar Cron</button>
                    </div>
                  </div>
                </div>

                <!-- Production Reset -->
                <div class="settings-card" style="border: 1px solid rgba(239,68,68,0.4); background: rgba(239,68,68,0.03); margin-top: 10px;">
                  <h3 class="text-md font-semibold" style="color: #ef4444; display: flex; align-items: center; gap: 8px; margin: 0 0 8px 0;">
                    <span>💥 Reinicio para Producción</span>
                    <span style="font-size: 0.65rem; padding: 2px 8px; border-radius: 12px; background: rgba(239,68,68,0.2); color: #f87171; border: 1px solid rgba(239,68,68,0.3); font-weight: 600;">EXCLUSIVO PROGRAMADOR</span>
                  </h3>
                  <p class="text-xs text-secondary" style="margin: 0 0 10px 0;">Limpia Firebase eliminando todos los datos de prueba (negocios, productos, pedidos, usuarios de prueba) para iniciar producción.</p>
                  <button type="button" id="btn-execute-purge" class="btn btn-danger btn-md" style="background: #dc2626; border-color: #dc2626; font-weight: 600;">
                    🔥 Iniciar Asistente de Reinicio de Base de Datos
                  </button>
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
        // Hide save bar on advanced tab
        if (actionsBar) {
          actionsBar.style.display = btn.dataset.tab === 'tab-avanzado' ? 'none' : 'flex';
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
      console.log('[SettingsView] Cargando configuración global del SaaS...');
      const config = await FirestoreService.getCompanyConfig('global');

      if (config) {
        this.config = config;

        // Identidad
        this._setVal(root, '#saas-name-input',     config.saasName);
        this._setVal(root, '#saas-comm-name-input', config.saasCommercialName);
        this._setVal(root, '#saas-slogan-input',    config.saasSlogan);
        this._setVal(root, '#saas-desc-input',      config.saasDescription);
        this._setVal(root, '#logo-main-input',      config.logoMain);
        this._setVal(root, '#logo-dark-input',      config.logoDark);
        this._setVal(root, '#favicon-input',        config.favicon);
        this._setVal(root, '#app-icon-input',       config.appIcon);
        this._setVal(root, '#login-bg-input',       config.loginBg);

        // Apariencia — select preset card
        const savedTheme = config.theme || 'dark';
        this._selectTheme(root, savedTheme);

        // Typography
        this._setVal(root, '#font-family-select', config.fontFamily || 'Inter');
        this._setVal(root, '#font-size-select',   config.fontSize || '14px');
        this._setVal(root, '#border-radius-input', config.borderRadius ?? 8);
        this._setVal(root, '#button-style-select', config.buttonStyle || 'rounded');

        // Custom colors
        this._fillColorFields(root, {
          primaryColor: config.primaryColor,
          bgColor:      config.bgColor,
          cardColor:    config.cardColor,
          sidebarColor: config.sidebarColor,
          successColor: config.successColor,
          warningColor: config.warningColor,
          errorColor:   config.errorColor,
          textColor:    config.textColor,
          textSecColor: config.textSecColor,
        });

        // General
        this._setVal(root, '#company-name-input',      config.companyName);
        this._setVal(root, '#saas-branch-limit-input', config.branchLimit ?? 5);
        this._setVal(root, '#timezone-select',         config.timezone || 'America/Managua');
        this._setVal(root, '#language-select',         config.language || 'es');
        this._setVal(root, '#date-format-select',      config.dateFormat || 'DD/MM/YYYY');
        this._setVal(root, '#time-format-select',      config.timeFormat || '24h');
        this._setVal(root, '#currency-select',         config.currency || 'NIO');
        this._setVal(root, '#currency-symbol-input',   config.currencySymbol || 'C$');
        this._setVal(root, '#decimals-input',          config.decimals ?? 2);
        this._setVal(root, '#default-country-input',   config.defaultCountry || 'Nicaragua');

        // Copias
        this._setCheck(root, '#backup-auto-toggle', config.backupAutoEnabled);
        this._setVal(root,   '#backup-cron-input',  config.backupCron || '0 0 * * *');

        // Mantenimiento
        this._setCheck(root, '#mantenimiento-toggle-tab', config.maintenanceMode);
        this._setVal(root,   '#maint-message-input',      config.maintenanceMessage);

        // Cron / Advanced
        this.setCronEndpointValue(root, config.keepAliveCron);
        this._setCheck(root, '#cron-enabled-toggle',   config.keepAliveCron?.enabled);
        this._setVal(root,   '#cron-provider-input',   config.keepAliveCron?.provider || 'cron-job.org');
        this._setVal(root,   '#cron-interval-input',   config.keepAliveCron?.intervalMinutes || 10);
        this._setVal(root,   '#cron-external-url-input', config.keepAliveCron?.externalApiUrl);
        this._setVal(root,   '#cron-token-input',      config.keepAliveCron?.token);

        if (config.keepAliveCron?.lastTestAtLocal?.epochMs) {
          const el = root.querySelector('#cron-last-run');
          if (el) el.textContent = `Última prueba: ${TimeService.formatDate(config.keepAliveCron.lastTestAtLocal.epochMs, true)}`;
        }

        console.log('[SettingsView] ✅ Configuración cargada correctamente desde Firebase.');
      } else {
        this.setCronEndpointValue(root);
        this._selectTheme(root, 'dark');
        console.log('[SettingsView] ℹ️ No hay configuración guardada aún en Firebase.');
      }
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
      const existingConfig = await FirestoreService.getCompanyConfig('global') || {};

      const newConfig = {
        ...existingConfig,
        // Identidad
        saasName:           root.querySelector('#saas-name-input')?.value.trim()       || 'Ultra Administrador',
        saasCommercialName: root.querySelector('#saas-comm-name-input')?.value.trim()  || '',
        saasSlogan:         root.querySelector('#saas-slogan-input')?.value.trim()     || '',
        saasDescription:    root.querySelector('#saas-desc-input')?.value.trim()       || '',
        logoMain:           root.querySelector('#logo-main-input')?.value.trim()       || '',
        logoDark:           root.querySelector('#logo-dark-input')?.value.trim()       || '',
        favicon:            root.querySelector('#favicon-input')?.value.trim()         || '',
        appIcon:            root.querySelector('#app-icon-input')?.value.trim()        || '',
        loginBg:            root.querySelector('#login-bg-input')?.value.trim()        || '',
        // Apariencia
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
        // General
        companyName:    root.querySelector('#company-name-input')?.value.trim()   || '',
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

      // Compute changed fields for audit log
      const changedFields = {};
      Object.keys(newConfig).forEach(key => {
        if (key === 'keepAliveCron') return;
        if (JSON.stringify(existingConfig[key]) !== JSON.stringify(newConfig[key])) {
          changedFields[key] = { before: existingConfig[key] ?? 'N/A', after: newConfig[key] };
        }
      });

      const activeTabBtn = root.querySelector('.settings-tab-btn.active');
      const categoryName = activeTabBtn ? activeTabBtn.textContent.trim() : 'General';

      if (Object.keys(changedFields).length === 0) {
        NotificationService.info('No se detectaron cambios para guardar.');
        return;
      }

      // Double-confirm if enabling maintenance mode
      if (changedFields.maintenanceMode && newConfig.maintenanceMode === true) {
        const ok = confirm('⚠️ ¿Confirmas que deseas ACTIVAR el Modo Mantenimiento? Se bloqueará el acceso a los locales de forma inmediata.');
        if (!ok) {
          NotificationService.info('Guardado cancelado — Modo Mantenimiento no fue activado.');
          return;
        }
      }

      // 1. Persist to Firebase
      await FirestoreService.updateCompanyConfig('global', newConfig);
      this.config = newConfig;

      // 2. Apply to the live UI immediately
      AppearanceService.applyConfig(newConfig);

      // 3. Audit log
      await FirestoreService.logAudit({
        action: 'GLOBAL_CONFIG_CHANGE',
        companyId: 'global',
        description: `Config global actualizada en [${categoryName}]. Campos: ${Object.keys(changedFields).join(', ')}`,
        metadata: { category: categoryName, changedFields }
      });

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

  // ─── Unmount ────────────────────────────────────────────────────────────────

  unmount() {
    this.layout.unmount();
    super.unmount();
  }
}
