/**
 * @file landing.view.js
 * @description SuperAdmin Landing Page Editor View.
 * Allows programmers (SUPER_ADMIN) to dynamically modify the text and links of the public landing page.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { NotificationService } from '../../../services/notification.service.js';
import { FirestoreService } from '../../../services/firestore.service.js';

export class LandingView extends Component {
  constructor(params = {}) {
    super(params);

    this.config = {};

    this.layout = new PageLayout({
      title: 'Editor de Landing Page',
      subtitle: 'Administración del portal público: edita los textos, contadores, llamadas a la acción y enlaces de contacto.',
      actionHTML: `
        <button type="button" data-open-landing class="btn btn-primary btn-sm" style="display: inline-flex; align-items: center; gap: 8px; font-weight: 600; text-decoration: none; padding: 8px 18px; border-radius: 8px; background: linear-gradient(135deg, #6366f1, #4f46e5); color: #ffffff; border: none; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35); cursor: pointer; transition: all 0.2s ease;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          👁️ Ver Página Web
        </button>
      `,
      contentHTML: `
        <style>
          .landing-editor-card {
            background: var(--color-bg-secondary, #111115) !important;
            border: 1px solid var(--color-border, rgba(255,255,255,0.1)) !important;
            border-radius: 16px !important;
            padding: var(--space-5, 24px) !important;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3) !important;
          }
          #landing-editor-form input:not([type="checkbox"]):not([type="radio"]),
          #landing-editor-form textarea,
          #landing-editor-form select {
            background-color: #1a1a24 !important;
            color: #ffffff !important;
            border: 1px solid rgba(255,255,255,0.15) !important;
            border-radius: 8px !important;
            padding: 11px 14px !important;
            font-size: 0.9rem !important;
            font-family: inherit !important;
            width: 100% !important;
            box-sizing: border-box !important;
            transition: all 0.2s ease !important;
          }
          #landing-editor-form input:focus,
          #landing-editor-form textarea:focus {
            border-color: #6366f1 !important;
            background-color: #212130 !important;
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.3) !important;
            outline: none !important;
          }
          #landing-editor-form label.form-label {
            color: #94a3b8 !important;
            font-size: 0.83rem !important;
            font-weight: 600 !important;
            margin-bottom: 6px !important;
            display: block !important;
            letter-spacing: 0.01em !important;
          }
          #landing-editor-form ::placeholder {
            color: rgba(255, 255, 255, 0.3) !important;
          }
          .editor-section-box {
            border-bottom: 1px solid rgba(255,255,255,0.08);
            padding-bottom: 24px;
            margin-bottom: 24px;
          }
          .editor-section-title {
            font-family: var(--font-heading, inherit);
            font-size: 1.1rem;
            font-weight: 700;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
        </style>

        <!-- Banner de vista previa -->
        <div style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(14, 165, 233, 0.1)); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 12px; padding: 14px 20px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 1.4rem;">🌐</span>
            <div>
              <strong style="color: #ffffff; font-size: 0.95rem; display: block;">Editor en Vivo de la Landing Page</strong>
              <span style="color: #94a3b8; font-size: 0.8rem;">Los cambios guardados se reflejan inmediatamente en la página web pública de ventas.</span>
            </div>
          </div>
          <button type="button" data-open-landing class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 6px; text-decoration: none; padding: 7px 14px; font-size: 0.82rem; border-radius: 6px; cursor: pointer;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Abrir Landing Page
          </button>
        </div>

        <div class="landing-editor-card">
          <form id="landing-editor-form" style="display: flex; flex-direction: column;">
            
            <!-- ── SECCIÓN HERO ── -->
            <div class="editor-section-box">
              <h3 class="editor-section-title" style="color: #818cf8;">
                <span>🎯</span> Sección Hero (Portada)
              </h3>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div style="grid-column: span 2;">
                  <label class="form-label" for="hero-title-input">Título del Hero (Soporta etiquetas HTML/decoración)</label>
                  <input type="text" id="hero-title-input" class="form-control" placeholder="El sistema que transforma tu negocio por completo" required />
                </div>
                <div style="grid-column: span 2;">
                  <label class="form-label" for="hero-subtitle-input">Subtítulo del Hero</label>
                  <textarea id="hero-subtitle-input" class="form-control" rows="3" placeholder="Más de 41 módulos integrados para gestionar tu empresa desde un solo lugar." required style="resize: vertical;"></textarea>
                </div>
                <div>
                  <label class="form-label" for="hero-cta-input">Texto del Botón CTA (Hero)</label>
                  <input type="text" id="hero-cta-input" class="form-control" placeholder="Solicitar Demo Gratis" required />
                </div>
                <div>
                  <label class="form-label" for="hero-modules-input">Límite de Módulos (Contador Animado)</label>
                  <input type="number" id="hero-modules-input" class="form-control" min="1" max="200" placeholder="41" required />
                </div>
              </div>
            </div>

            <!-- ── SECCIÓN COMPARATIVA ── -->
            <div class="editor-section-box">
              <h3 class="editor-section-title" style="color: #38bdf8;">
                <span>🏆</span> Comparación vs Competidores
              </h3>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div>
                  <label class="form-label" for="comp-shopify-input">Módulos estimados Shopify</label>
                  <input type="text" id="comp-shopify-input" class="form-control" placeholder="~15 (con apps)" required />
                </div>
                <div>
                  <label class="form-label" for="comp-treinta-input">Módulos estimados Treinta</label>
                  <input type="text" id="comp-treinta-input" class="form-control" placeholder="~12" required />
                </div>
              </div>
            </div>

            <!-- ── SECCIÓN CONTACTO ── -->
            <div class="editor-section-box">
              <h3 class="editor-section-title" style="color: #34d399;">
                <span>💬</span> WhatsApp y Enlaces de Contacto
              </h3>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div>
                  <label class="form-label" for="whatsapp-number-input">Número de WhatsApp (con código de país, sin +)</label>
                  <input type="text" id="whatsapp-number-input" class="form-control" placeholder="50500000000" required />
                </div>
                <div>
                  <label class="form-label" for="whatsapp-cta-input">Texto del Botón Principal inferior (CTA)</label>
                  <input type="text" id="whatsapp-cta-input" class="form-control" placeholder="Solicitar Demo por WhatsApp" required />
                </div>
                <div style="grid-column: span 2;">
                  <label class="form-label" for="whatsapp-message-input">Mensaje predeterminado de WhatsApp</label>
                  <input type="text" id="whatsapp-message-input" class="form-control" placeholder="¡Hola! Me interesa conocer más sobre Ultra Administrador..." required />
                </div>
              </div>
            </div>

            <!-- ── SECCIÓN PRICING/FOOTER ── -->
            <div style="margin-bottom: 24px;">
              <h3 class="editor-section-title" style="color: #fbbf24;">
                <span>💰</span> Pricing &amp; Notas del Sistema
              </h3>
              <div style="display: grid; grid-template-columns: 1fr; gap: 16px;">
                <div>
                  <label class="form-label" for="pricing-disclaimer-input">Nota de descargo (Disclaimer inferior)</label>
                  <input type="text" id="pricing-disclaimer-input" class="form-control" placeholder="Sin compromisos · Demo 100% gratuita · Respuesta en menos de 1 hora" required />
                </div>
              </div>
            </div>

            <!-- ── ACCIONES ── -->
            <div style="display: flex; justify-content: flex-end; gap: 12px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.08);">
              <button type="button" class="btn btn-secondary btn-sm" id="btn-reset-landing" style="padding: 10px 22px; border-radius: 8px;">Restablecer Predeterminados</button>
              <button type="submit" class="btn btn-primary btn-sm" id="btn-save-landing" style="padding: 10px 28px; border-radius: 8px; background: #6366f1; color: #fff; font-weight: 700; border: none; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);">Guardar Cambios</button>
            </div>

          </form>
        </div>
      `
    });
  }

  getDefaultConfig() {
    return {
      heroTitle: 'El sistema que transforma tu negocio por completo',
      heroSubtitle: 'Más de 41 módulos integrados para gestionar tu empresa desde un solo lugar. Finanzas, inventario, punto de venta, RRHH, WhatsApp, Telegram y mucho más. Diseñado para crecer contigo.',
      heroCtaText: 'Solicitar Demo Gratis',
      heroModulesLimit: 41,
      compShopifyModules: '~15 (con apps)',
      compTreintaModules: '~12',
      whatsappNumber: '50500000000',
      whatsappCtaText: 'Solicitar Demo por WhatsApp',
      whatsappMessage: '¡Hola! Me interesa conocer más sobre Ultra Administrador 🚀',
      pricingDisclaimer: 'Sin compromisos · Demo 100% gratuita · Respuesta en menos de 1 hora'
    };
  }

  getLandingPreviewUrl() {
    const pathname = window.location.pathname;
    if (pathname.includes('/public/')) {
      return pathname.substring(0, pathname.indexOf('/public/')) + '/public/landing/index.html';
    }
    return '/landing/index.html';
  }

  async loadLandingSettings(element) {
    const root = element || this.layout.element;
    if (!root) return;

    try {
      console.log('[LandingView] Cargando configuración de landing page...');
      const landingConfig = await FirestoreService.getLandingConfig();
      
      // Fallback to default configs if empty
      this.config = landingConfig && Object.keys(landingConfig).length > 0
        ? { ...this.getDefaultConfig(), ...landingConfig }
        : this.getDefaultConfig();

      // Populate input values
      this._setVal(root, '#hero-title-input', this.config.heroTitle);
      this._setVal(root, '#hero-subtitle-input', this.config.heroSubtitle);
      this._setVal(root, '#hero-cta-input', this.config.heroCtaText);
      this._setVal(root, '#hero-modules-input', this.config.heroModulesLimit);
      this._setVal(root, '#comp-shopify-input', this.config.compShopifyModules);
      this._setVal(root, '#comp-treinta-input', this.config.compTreintaModules);
      this._setVal(root, '#whatsapp-number-input', this.config.whatsappNumber);
      this._setVal(root, '#whatsapp-cta-input', this.config.whatsappCtaText);
      this._setVal(root, '#whatsapp-message-input', this.config.whatsappMessage);
      this._setVal(root, '#pricing-disclaimer-input', this.config.pricingDisclaimer);

      console.log('[LandingView] ✅ Configuración de landing cargada correctamente.');
    } catch (err) {
      console.warn('[LandingView] Error cargando configuración:', err.message);
      NotificationService.error('No se pudo cargar la configuración de la Landing Page.');
    }
  }

  _setVal(root, sel, value) {
    const el = root.querySelector(sel);
    if (el && value !== undefined && value !== null) el.value = value;
  }

  async handleSaveLanding(e) {
    e.preventDefault();
    const root = this.layout.element;
    if (!root) return;

    const saveBtn = root.querySelector('#btn-save-landing');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando…';
    }

    try {
      const payload = {
        heroTitle: root.querySelector('#hero-title-input')?.value.trim(),
        heroSubtitle: root.querySelector('#hero-subtitle-input')?.value.trim(),
        heroCtaText: root.querySelector('#hero-cta-input')?.value.trim(),
        heroModulesLimit: Number(root.querySelector('#hero-modules-input')?.value || 41),
        compShopifyModules: root.querySelector('#comp-shopify-input')?.value.trim(),
        compTreintaModules: root.querySelector('#comp-treinta-input')?.value.trim(),
        whatsappNumber: root.querySelector('#whatsapp-number-input')?.value.trim(),
        whatsappCtaText: root.querySelector('#whatsapp-cta-input')?.value.trim(),
        whatsappMessage: root.querySelector('#whatsapp-message-input')?.value.trim(),
        pricingDisclaimer: root.querySelector('#pricing-disclaimer-input')?.value.trim()
      };

      await FirestoreService.updateLandingConfig(payload);
      NotificationService.success('✅ Configuración de Landing Page guardada exitosamente.');
      
      // Log audit
      await FirestoreService.logAudit({
        action: 'LANDING_PAGE_UPDATE',
        description: 'La landing page pública fue actualizada por el programador.'
      });
      
    } catch (err) {
      console.error('[LandingView] Error guardando config:', err);
      NotificationService.error('No se pudieron guardar los cambios: ' + err.message);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar Cambios';
      }
    }
  }

  handleResetLanding() {
    if (!confirm('¿Estás seguro de que deseas restablecer los textos de la Landing Page a los valores predeterminados?')) return;
    
    const root = this.layout.element;
    if (!root) return;
    
    const defaults = this.getDefaultConfig();
    this._setVal(root, '#hero-title-input', defaults.heroTitle);
    this._setVal(root, '#hero-subtitle-input', defaults.heroSubtitle);
    this._setVal(root, '#hero-cta-input', defaults.heroCtaText);
    this._setVal(root, '#hero-modules-input', defaults.heroModulesLimit);
    this._setVal(root, '#comp-shopify-input', defaults.compShopifyModules);
    this._setVal(root, '#comp-treinta-input', defaults.compTreintaModules);
    this._setVal(root, '#whatsapp-number-input', defaults.whatsappNumber);
    this._setVal(root, '#whatsapp-cta-input', defaults.whatsappCtaText);
    this._setVal(root, '#whatsapp-message-input', defaults.whatsappMessage);
    this._setVal(root, '#pricing-disclaimer-input', defaults.pricingDisclaimer);
    
    NotificationService.info('Valores restablecidos en el formulario. Recuerda hacer clic en "Guardar Cambios" para aplicarlos.');
  }

  mount() {
    const element = this.layout.mount();
    this.loadLandingSettings(element);
    this.afterMount();
    return element;
  }

  afterMount() {
    const form = this.layout.$('#landing-editor-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleSaveLanding(e));
    }

    const resetBtn = this.layout.$('#btn-reset-landing');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.handleResetLanding());
    }

    // Dynamic landing page preview open handler
    const previewBtns = this.layout.$$('[data-open-landing]');
    previewBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const url = this.getLandingPreviewUrl();
        window.open(url, '_blank');
      });
    });
  }

  unmount() {
    super.unmount();
  }
}
