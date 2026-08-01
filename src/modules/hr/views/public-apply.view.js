/**
 * @file public-apply.view.js
 * @description Public Career & Job Application page accessible via /#/hr/apply/:companyId.
 * Renders company branding, active vacancies, custom landing sections, requested documents,
 * dynamic form fields, and submits applications directly to the company's HR candidate pool.
 */

import { Component } from '../../../core/component.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { ImageDisplay } from '../../../components/ui/image-display.js';
import { ImageUploader } from '../../../components/ui/image-uploader.js';
import { isModuleEnabled } from '../../../config/modules.config.js';

export class PublicApplyView extends Component {
  constructor(params = {}) {
    super(params);
    this.companyId = params.companyId || this._extractCompanyIdFromHash();

    this.state = {
      loading: true,
      company: null,
      pageConfig: {},
      vacancies: [],
      customFormFields: [],
      requestedDocuments: [],
      error: null,
      submitted: false,
      applicationId: null,
      selectedVacancyId: null,

      photoImageId: null,
      birthDate: '',
      computedAge: null
    };
  }

  _extractCompanyIdFromHash() {
    const hash = window.location.hash || '';
    const parts = hash.split('/');
    return parts[3] || parts[2] || '';
  }

  async afterMount() {
    await this.loadCompanyData();
  }

  async loadCompanyData() {
    if (!this.companyId) {
      this.setState({ loading: false, error: 'Identificador de empresa no proporcionado.' });
      return;
    }

    try {
      let companyData = await FirestoreService.readPath(`${this.companyId}`);
      if (!companyData) {
        companyData = await FirestoreService.readPath(`companies/${this.companyId}`);
      }

      if (!companyData) {
        this.setState({ loading: false, error: 'Empresa no encontrada o enlace inválido.' });
        return;
      }

      if (!isModuleEnabled(companyData, 'hrRecruitment')) {
        this.setState({
          loading: false,
          error: 'Esta empresa no tiene activo el módulo de reclutamiento de personal en este momento.'
        });
        return;
      }

      // Load config & data
      const pageConfig = (await FirestoreService.readPath(`${this.companyId}/hr_page_config`)) || {};
      const vacanciesRaw = await FirestoreService.readPath(`${this.companyId}/hr_vacancies`);
      const vacancies = vacanciesRaw ? Object.values(vacanciesRaw).filter(v => v.status === 'ACTIVA') : [];
      const fieldsRaw = await FirestoreService.readPath(`${this.companyId}/hr_form_fields`);
      const customFormFields = fieldsRaw ? Object.values(fieldsRaw) : [];
      const docsRaw = await FirestoreService.readPath(`${this.companyId}/hr_requested_documents`);
      const requestedDocuments = docsRaw ? Object.values(docsRaw) : [];

      this.setState({
        loading: false,
        company: companyData,
        pageConfig,
        vacancies,
        customFormFields,
        requestedDocuments
      });

      this.bindEvents();
    } catch (err) {
      console.error('[PublicApplyView] Error loading company:', err);
      this.setState({ loading: false, error: 'Error al conectar con la plataforma de empleo.' });
    }
  }

  render() {
    const { loading, company, pageConfig, vacancies, customFormFields, requestedDocuments, error, submitted, applicationId, computedAge } = this.state;

    if (loading) {
      return `
        <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; background:#0f172a; color:#fff; font-family:sans-serif;">
          <div style="text-align:center;">
            <div style="width:44px; height:44px; border:4px solid #6366f1; border-top-color:transparent; border-radius:50%; margin:0 auto 16px; animation:spin 0.8s linear infinite;"></div>
            <p style="font-weight:600;">Cargando Portal de Empleo...</p>
          </div>
        </div>
      `;
    }

    if (error) {
      return `
        <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; background:#0f172a; color:#fff; font-family:sans-serif; padding:20px;">
          <div style="max-width:480px; text-align:center; background:rgba(30,41,59,0.9); border:1px solid rgba(239,68,68,0.3); border-radius:16px; padding:32px;">
            <span style="font-size:3rem; display:block; margin-bottom:12px;">🚫</span>
            <h2 style="font-size:1.4rem; font-weight:700; color:#f87171; margin-bottom:12px;">Solicitud no disponible</h2>
            <p style="color:#94a3b8; font-size:0.95rem;">${error}</p>
          </div>
        </div>
      `;
    }

    if (submitted) {
      return `
        <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; background:#0f172a; color:#fff; font-family:sans-serif; padding:20px;">
          <div style="max-width:540px; text-align:center; background:rgba(30,41,59,0.9); border:1px solid rgba(16,185,129,0.4); border-radius:20px; padding:40px; box-shadow:0 20px 40px rgba(0,0,0,0.5);">
            <span style="font-size:3.5rem; display:block; margin-bottom:16px;">🎉</span>
            <h1 style="font-size:1.6rem; font-weight:800; color:#34d399; margin-bottom:10px;">¡Solicitud Enviada con Éxito!</h1>
            <p style="color:#cbd5e1; font-size:0.95rem; line-height:1.6; margin-bottom:20px;">
              Tu información y expediente han sido registrados en la base de datos de reclutamiento de <strong>${company?.name || company?.informacion_local?.nombre || 'la empresa'}</strong>.
            </p>
            <div style="background:rgba(15,23,42,0.8); border:1px solid #334155; border-radius:12px; padding:16px; margin-bottom:24px; text-align:left;">
              <div style="font-size:0.8rem; color:#94a3b8;">EXPEDIENTE DE CANDIDATO:</div>
              <div style="font-family:monospace; font-size:1.2rem; font-weight:700; color:#a7f3d0;">${applicationId}</div>
            </div>
            <button onclick="window.location.reload()" class="btn btn-primary" style="background:#6366f1; border:none; padding:12px 24px; font-weight:700; border-radius:10px;">Enviar otra solicitud</button>
          </div>
        </div>
      `;
    }

    const companyName = company?.informacion_local?.nombre || company?.name || 'Portal de Empleo';

    return `
      <div class="public-apply-container" style="min-height:100vh; background:#0b0f19; color:#f1f5f9; font-family:'Inter', system-ui, sans-serif; padding:20px 12px 60px;">
        
        <!-- Header Banner -->
        <header style="max-width:840px; margin:0 auto 24px; background:linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%); border:1px solid #312e81; border-radius:20px; padding:28px 24px; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,0.4);">
          <div style="display:flex; justify-content:center; align-items:center; gap:12px; margin-bottom:12px;">
            ${company?.logoImageId ? ImageDisplay.renderTag(company.logoImageId, '', 'width:64px;height:64px;border-radius:12px;object-fit:cover;border:2px solid #6366f1;') : '<div style="width:64px;height:64px;border-radius:12px;background:#6366f1;display:flex;align-items:center;justify-content:center;font-size:2rem;">🏢</div>'}
          </div>
          <h1 style="font-size:1.7rem; font-weight:800; color:#fff; margin:0 0 6px;">${companyName}</h1>
          <p style="font-size:0.95rem; color:#a5b4fc; margin:0 0 14px;">${pageConfig.slogan || '¡Forma parte de nuestro equipo de trabajo!'}</p>
          <div style="display:inline-flex; align-items:center; gap:6px; background:rgba(99,102,241,0.15); border:1px solid rgba(99,102,241,0.3); padding:6px 14px; border-radius:20px; font-size:0.78rem; color:#c7d2fe;">
            <span>📋 ${pageConfig.welcomeText || 'Formulario de Solicitud Digital de Empleo'}</span>
          </div>
        </header>

        <!-- Company Story & Benefits Section (if enabled) -->
        ${pageConfig.secStory !== false && pageConfig.story ? `
          <div style="max-width:840px; margin:0 auto 20px; background:#1e293b; border:1px solid #334155; border-radius:16px; padding:20px;">
            <h3 style="font-size:1rem; font-weight:700; color:#818cf8; margin:0 0 8px;">🏢 Quiénes Somos</h3>
            <p style="font-size:0.88rem; color:#cbd5e1; line-height:1.5; margin:0;">${pageConfig.story}</p>
          </div>
        ` : ''}

        ${pageConfig.secBenefits !== false && pageConfig.benefits ? `
          <div style="max-width:840px; margin:0 auto 20px; background:#1e293b; border:1px solid #334155; border-radius:16px; padding:20px;">
            <h3 style="font-size:1rem; font-weight:700; color:#34d399; margin:0 0 8px;">⭐ Beneficios de Trabajar con Nosotros</h3>
            <p style="font-size:0.88rem; color:#cbd5e1; line-height:1.5; margin:0;">${pageConfig.benefits}</p>
          </div>
        ` : ''}

        <!-- Active Vacancies Section (if enabled & present) -->
        ${pageConfig.secVacancies !== false && vacancies.length > 0 ? `
          <div style="max-width:840px; margin:0 auto 24px;">
            <h3 style="font-size:1.1rem; font-weight:700; color:#fff; margin-bottom:12px;">💼 Vacantes Disponibles (${vacancies.length})</h3>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px;">
              ${vacancies.map(v => `
                <div style="background:#1e293b; border:1px solid #334155; border-radius:12px; padding:16px; display:flex; flex-direction:column; justify-content:space-between;">
                  <div>
                    <h4 style="font-size:0.95rem; font-weight:700; color:#fff; margin:0 0 4px;">${v.title}</h4>
                    <span style="font-size:0.75rem; color:#818cf8;">🏢 ${v.department || 'General'} · ⏱️ ${v.shift || 'Tiempo Completo'}</span>
                    <p style="font-size:0.8rem; color:#94a3b8; margin:8px 0; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${v.description || ''}</p>
                  </div>
                  <button class="btn btn-primary btn-sm btn-apply-vacancy" data-title="${v.title}" style="background:#6366f1; border:none; margin-top:8px; font-weight:600;">Aplicar a esta Vacante</button>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Main Form Wrapper -->
        <form id="hr-public-apply-form" style="max-width:840px; margin:0 auto; display:flex; flex-direction:column; gap:20px;">

          <!-- SECTION 1: Personal Info -->
          <div style="background:#1e293b; border:1px solid #334155; border-radius:16px; padding:24px;">
            <h3 style="font-size:1.1rem; font-weight:700; color:#818cf8; margin:0 0 16px;">👤 1. Información Personal</h3>

            <div style="margin-bottom:20px;" id="hr-photo-uploader-slot">
              <label style="font-weight:600; font-size:0.85rem; color:#cbd5e1; display:block; margin-bottom:8px;">Fotografía Reciente <span style="color:#ef4444;">*</span></label>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px;">
              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">Nombres <span style="color:#ef4444;">*</span></label>
                <input type="text" id="app-firstname" required class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" placeholder="Ej. Juan Carlos" />
              </div>
              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">Apellidos <span style="color:#ef4444;">*</span></label>
                <input type="text" id="app-lastname" required class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" placeholder="Ej. Pérez López" />
              </div>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px; margin-top:14px;">
              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">Fecha de Nacimiento <span style="color:#ef4444;">*</span></label>
                <input type="date" id="app-birthdate" required class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" />
              </div>
              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">Edad Calculada</label>
                <input type="text" id="app-age-display" readonly class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#34d399; font-weight:700; padding:10px; border-radius:8px;" value="${computedAge ? computedAge + ' años' : 'Selecciona fecha'}" />
              </div>
              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">Cédula / DNI <span style="color:#ef4444;">*</span></label>
                <input type="text" id="app-id-number" required class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" placeholder="Número de cédula" />
              </div>
            </div>
          </div>

          <!-- SECTION 2: Contact Info -->
          <div style="background:#1e293b; border:1px solid #334155; border-radius:16px; padding:24px;">
            <h3 style="font-size:1.1rem; font-weight:700; color:#818cf8; margin:0 0 16px;">📱 2. Contacto</h3>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px;">
              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">Correo Electrónico <span style="color:#ef4444;">*</span></label>
                <input type="email" id="app-email" required class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" placeholder="correo@ejemplo.com" />
              </div>
              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">Número de WhatsApp <span style="color:#ef4444;">*</span></label>
                <input type="tel" id="app-whatsapp" required class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" placeholder="+505 8888-8888" />
              </div>
            </div>
          </div>

          <!-- SECTION 3: Labor Aspirations -->
          <div style="background:#1e293b; border:1px solid #334155; border-radius:16px; padding:24px;">
            <h3 style="font-size:1.1rem; font-weight:700; color:#818cf8; margin:0 0 16px;">💼 3. Puesto al que Aplica</h3>
            <div>
              <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">Puesto / Cargo Deseado <span style="color:#ef4444;">*</span></label>
              <input type="text" id="app-position" required class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" placeholder="Ej. Cocinero, Cajero, Vendedor, Mecánico..." />
            </div>
          </div>

          <!-- SECTION 4: Custom Builder Fields (if present) -->
          ${customFormFields.length > 0 ? `
            <div style="background:#1e293b; border:1px solid #334155; border-radius:16px; padding:24px;">
              <h3 style="font-size:1.1rem; font-weight:700; color:#818cf8; margin:0 0 16px;">❓ 4. Preguntas Adicionales</h3>
              <div style="display:flex; flex-direction:column; gap:14px;">
                ${customFormFields.map((f, idx) => `
                  <div>
                    <label style="font-size:0.85rem; font-weight:600; color:#cbd5e1; display:block; margin-bottom:4px;">
                      ${idx + 1}. ${f.label} ${f.required ? '<span style="color:#ef4444;">*</span>' : ''}
                    </label>
                    ${f.type === 'yes_no' ? `
                      <select class="custom-builder-input input" data-fid="${f.id}" ${f.required ? 'required' : ''} style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;">
                        <option value="">Selecciona...</option>
                        <option value="SI">Sí</option>
                        <option value="NO">No</option>
                      </select>
                    ` : f.type === 'textarea' ? `
                      <textarea class="custom-builder-input input" data-fid="${f.id}" ${f.required ? 'required' : ''} rows="3" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;"></textarea>
                    ` : `
                      <input type="${f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}" class="custom-builder-input input" data-fid="${f.id}" ${f.required ? 'required' : ''} style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" />
                    `}
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Consent -->
          <div style="background:#1e293b; border:1px solid #334155; border-radius:16px; padding:24px;">
            <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer; font-size:0.85rem; color:#cbd5e1;">
              <input type="checkbox" id="app-consent" required style="width:18px; height:18px; margin-top:2px; accent-color:#6366f1;" />
              <span>Declaro que la información ingresada es verídica y autorizo a la empresa a verificar mis datos. <span style="color:#ef4444;">*</span></span>
            </label>
          </div>

          <div style="text-align:center;">
            <button type="submit" id="btn-submit-app" style="background:linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color:#fff; font-size:1.1rem; font-weight:800; padding:16px 40px; border-radius:12px; border:none; cursor:pointer; width:100%; max-width:400px; box-shadow:0 10px 20px rgba(99,102,241,0.4);">
              🚀 Enviar Solicitud de Empleo
            </button>
          </div>

        </form>
      </div>
    `;
  }

  bindEvents() {
    if (!this.element) return;

    // Photo uploader slot
    const slot = this.element.querySelector('#hr-photo-uploader-slot');
    if (slot) {
      this.uploader = new ImageUploader({
        preset: 'PROFILE',
        label: 'Fotografía Reciente (JPG, PNG, WEBP)',
        onImageUploaded: (imageId) => { this.state.photoImageId = imageId; },
        onImageRemoved: () => { this.state.photoImageId = null; }
      });
      slot.appendChild(this.uploader.mount());
    }

    // Auto age calculation
    const birthInput = this.element.querySelector('#app-birthdate');
    const ageDisplay = this.element.querySelector('#app-age-display');
    if (birthInput) {
      birthInput.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val) {
          const birth = new Date(val);
          const now = new Date();
          let age = now.getFullYear() - birth.getFullYear();
          const m = now.getMonth() - birth.getMonth();
          if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
          this.state.computedAge = age;
          if (ageDisplay) ageDisplay.value = `${age} años`;
        }
      });
    }

    // Apply button on vacancy cards
    this.element.querySelectorAll('.btn-apply-vacancy').forEach(btn => {
      btn.addEventListener('click', () => {
        const title = btn.getAttribute('data-title');
        const posInput = this.element.querySelector('#app-position');
        if (posInput) {
          posInput.value = title;
          posInput.scrollIntoView({ behavior: 'smooth' });
          posInput.focus();
        }
      });
    });

    // Form submit
    const form = this.element.querySelector('#hr-public-apply-form');
    if (form) form.addEventListener('submit', (e) => this.handleSubmit(e));
  }

  async handleSubmit(e) {
    e.preventDefault();

    if (!this.state.photoImageId) {
      alert('Por favor sube una fotografía reciente antes de enviar la solicitud.');
      return;
    }

    const submitBtn = this.element.querySelector('#btn-submit-app');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ Enviando Expediente...';
    }

    const customAns = {};
    this.element.querySelectorAll('.custom-builder-input').forEach(input => {
      const fid = input.getAttribute('data-fid');
      if (fid) customAns[fid] = input.value;
    });

    const candidateId = `cand_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const expCode = `EXP-RH-${Math.floor(100000 + Math.random() * 900000)}`;

    const payload = {
      id: candidateId,
      candidateId,
      expCode,
      companyId: this.companyId,
      status: 'NUEVO',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      photoImageId: this.state.photoImageId,
      firstName: this.element.querySelector('#app-firstname')?.value.trim() || '',
      lastName: this.element.querySelector('#app-lastname')?.value.trim() || '',
      displayName: `${this.element.querySelector('#app-firstname')?.value.trim() || ''} ${this.element.querySelector('#app-lastname')?.value.trim() || ''}`,
      birthDate: this.element.querySelector('#app-birthdate')?.value || '',
      age: this.state.computedAge || 0,
      idNumber: this.element.querySelector('#app-id-number')?.value.trim() || '',
      email: this.element.querySelector('#app-email')?.value.trim() || '',
      whatsapp: this.element.querySelector('#app-whatsapp')?.value.trim() || '',
      position: this.element.querySelector('#app-position')?.value.trim() || '',
      customAnswers: customAns
    };

    try {
      await FirestoreService.writePath(`${this.companyId}/hr_candidates/${candidateId}`, payload);
      this.setState({ submitted: true, applicationId: expCode });
    } catch (err) {
      console.error('[PublicApplyView] Error submitting application:', err);
      alert('Error al enviar solicitud. Intenta de nuevo.');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '🚀 Enviar Solicitud de Empleo';
      }
    }
  }
}
