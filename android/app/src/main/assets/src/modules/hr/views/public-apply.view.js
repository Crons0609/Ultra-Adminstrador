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
import { I18nService } from '../../../services/i18n.service.js';

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
      isSubmitting: false,
      applicationId: null,
      selectedVacancyId: null,

      photoImageId: null,
      docImageIds: {}, // { docId: imageId }
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
      this.setState({ loading: false, error: I18nService.t('hr_pub_no_id_error') });
      return;
    }

    try {
      let companyData = await FirestoreService.readPath(`${this.companyId}`);
      if (!companyData) {
        companyData = await FirestoreService.readPath(`companies/${this.companyId}`);
      }

      if (!companyData) {
        this.setState({ loading: false, error: I18nService.t('hr_pub_not_found_error') });
        return;
      }

      if (!isModuleEnabled(companyData, 'hrRecruitment')) {
        this.setState({
          loading: false,
          error: I18nService.t('hr_pub_module_disabled')
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
      const requestedDocuments = docsRaw ? Object.values(docsRaw) : [
        { id: 'dni', name: I18nService.t('hr_doc_id'), required: true },
        { id: 'police_record', name: I18nService.t('hr_doc_police'), required: true },
        { id: 'cv', name: I18nService.t('hr_doc_cv'), required: true },
        { id: 'diploma', name: I18nService.t('hr_doc_diploma'), required: false }
      ];

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
      this.setState({ loading: false, error: I18nService.t('hr_pub_server_error') });
    }
  }

  render() {
    const { loading, company, pageConfig, vacancies, customFormFields, requestedDocuments, error, submitted, applicationId, isSubmitting } = this.state;

    if (loading) {
      return `
        <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; background:#0f172a; color:#fff; font-family:sans-serif;">
          <div style="text-align:center;">
            <div style="width:44px; height:44px; border:4px solid #6366f1; border-top-color:transparent; border-radius:50%; margin:0 auto 16px; animation:spin 0.8s linear infinite;"></div>
            <p style="font-weight:600;">${I18nService.t('hr_pub_loading')}</p>
          </div>
        </div>
      `;
    }

    if (error) {
      return `
        <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; background:#0f172a; color:#fff; font-family:sans-serif; padding:20px;">
          <div style="max-width:480px; text-align:center; background:rgba(30,41,59,0.9); border:1px solid rgba(239,68,68,0.3); border-radius:16px; padding:32px;">
            <span style="font-size:3rem; display:block; margin-bottom:12px;">🚫</span>
            <h2 style="font-size:1.4rem; font-weight:700; color:#f87171; margin-bottom:12px;">${I18nService.t('hr_pub_not_available_title')}</h2>
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
            <h1 style="font-size:1.6rem; font-weight:800; color:#34d399; margin-bottom:10px;">${I18nService.t('hr_pub_success_title')}</h1>
            <p style="color:#cbd5e1; font-size:0.95rem; line-height:1.6; margin-bottom:20px;">
              ${I18nService.t('hr_pub_success_desc', { company: company?.name || company?.informacion_local?.nombre || I18nService.t('bill_company') })}
            </p>
            <div style="background:rgba(15,23,42,0.8); border:1px solid #334155; border-radius:12px; padding:16px; margin-bottom:24px; text-align:left;">
              <div style="font-size:0.8rem; color:#94a3b8;">${I18nService.t('hr_pub_expediente_label')}</div>
              <div style="font-family:monospace; font-size:1.2rem; font-weight:700; color:#a7f3d0;">${applicationId}</div>
            </div>
            <button onclick="window.location.reload()" class="btn btn-primary" style="background:#6366f1; border:none; padding:12px 24px; font-weight:700; border-radius:10px; cursor:pointer;">${I18nService.t('hr_pub_send_another')}</button>
          </div>
        </div>
      `;
    }

    const companyName = company?.informacion_local?.nombre || company?.name || I18nService.t('ii_official_business');

    return `
      <div class="public-apply-container" style="min-height:100vh; background:#0b0f19; color:#f1f5f9; font-family:'Inter', system-ui, sans-serif; padding:20px 12px 60px;">
        
        <!-- Header Banner -->
        <header style="max-width:840px; margin:0 auto 24px; background:linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%); border:1px solid #312e81; border-radius:20px; padding:28px 24px; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,0.4);">
          <div style="display:flex; justify-content:center; align-items:center; gap:12px; margin-bottom:12px;">
            ${company?.logoImageId ? ImageDisplay.renderTag(company.logoImageId, '', 'width:64px;height:64px;border-radius:12px;object-fit:cover;border:2px solid #6366f1;') : '<div style="width:64px;height:64px;border-radius:12px;background:#6366f1;display:flex;align-items:center;justify-content:center;font-size:2rem;">🏢</div>'}
          </div>
          <h1 style="font-size:1.7rem; font-weight:800; color:#fff; margin:0 0 6px;">${companyName}</h1>
          <p style="font-size:0.95rem; color:#a5b4fc; margin:0 0 14px;">${pageConfig.slogan || I18nService.t('hr_pub_slogan_fallback')}</p>
          <div style="display:inline-flex; align-items:center; gap:6px; background:rgba(99,102,241,0.15); border:1px solid rgba(99,102,241,0.3); padding:6px 14px; border-radius:20px; font-size:0.78rem; color:#c7d2fe;">
            <span>📋 ${pageConfig.welcomeText || I18nService.t('hr_pub_welcome_fallback')}</span>
          </div>
        </header>

        <!-- Company Story & Benefits Section (if enabled) -->
        ${pageConfig.secStory !== false && pageConfig.story ? `
          <div style="max-width:840px; margin:0 auto 20px; background:#1e293b; border:1px solid #334155; border-radius:16px; padding:20px;">
            <h3 style="font-size:1rem; font-weight:700; color:#818cf8; margin:0 0 8px;">${I18nService.t('hr_pub_who_we_are')}</h3>
            <p style="font-size:0.88rem; color:#cbd5e1; line-height:1.5; margin:0;">${pageConfig.story}</p>
          </div>
        ` : ''}

        ${pageConfig.secBenefits !== false && pageConfig.benefits ? `
          <div style="max-width:840px; margin:0 auto 20px; background:#1e293b; border:1px solid #334155; border-radius:16px; padding:20px;">
            <h3 style="font-size:1rem; font-weight:700; color:#34d399; margin:0 0 8px;">${I18nService.t('hr_pub_benefits_title')}</h3>
            <p style="font-size:0.88rem; color:#cbd5e1; line-height:1.5; margin:0;">${pageConfig.benefits}</p>
          </div>
        ` : ''}

        <!-- Active Vacancies Section (if enabled & present) -->
        ${pageConfig.secVacancies !== false && vacancies.length > 0 ? `
          <div style="max-width:840px; margin:0 auto 24px;">
            <h3 style="font-size:1.1rem; font-weight:700; color:#fff; margin-bottom:12px;">💼 ${I18nService.t('hr_pub_vacancies_title', { count: vacancies.length })}</h3>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px;">
              ${vacancies.map(v => `
                <div style="background:#1e293b; border:1px solid #334155; border-radius:12px; padding:16px; display:flex; flex-direction:column; justify-content:space-between;">
                  <div>
                    <h4 style="font-size:0.95rem; font-weight:700; color:#fff; margin:0 0 4px;">${v.title}</h4>
                    <span style="font-size:0.75rem; color:#818cf8;">🏢 ${v.department || I18nService.t('inv_category_others')} · ⏱️ ${v.shift || I18nService.t('hr_shift_full_time')}</span>
                    <p style="font-size:0.8rem; color:#94a3b8; margin:8px 0; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${v.description || ''}</p>
                  </div>
                  <button type="button" class="btn btn-primary btn-sm btn-apply-vacancy" data-title="${v.title}" style="background:#6366f1; border:none; margin-top:8px; font-weight:600; cursor:pointer;">${I18nService.t('hr_pub_apply_to_vacancy')}</button>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Main Form Wrapper -->
        <form id="hr-public-apply-form" style="max-width:840px; margin:0 auto; display:flex; flex-direction:column; gap:20px;">

          <!-- SECTION 1: Personal Info -->
          <div style="background:#1e293b; border:1px solid #334155; border-radius:16px; padding:24px;">
            <h3 style="font-size:1.1rem; font-weight:700; color:#818cf8; margin:0 0 16px;">${I18nService.t('hr_pub_sec1_title')}</h3>

            <div style="margin-bottom:20px;" id="hr-photo-uploader-slot">
              <label style="font-weight:600; font-size:0.85rem; color:#cbd5e1; display:block; margin-bottom:8px;">${I18nService.t('hr_pub_photo_label')} <span style="color:#ef4444;">*</span></label>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px;">
              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">${I18nService.t('hr_pub_firstname')} <span style="color:#ef4444;">*</span></label>
                <input type="text" id="app-firstname" required class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" placeholder="Ej. Juan Carlos" />
              </div>
              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">${I18nService.t('hr_pub_lastname')} <span style="color:#ef4444;">*</span></label>
                <input type="text" id="app-lastname" required class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" placeholder="Ej. Pérez López" />
              </div>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px; margin-top:14px;">
              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">${I18nService.t('hr_pub_birthdate')} <span style="color:#ef4444;">*</span></label>
                <input type="date" id="app-birthdate" required class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" />
              </div>
              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">${I18nService.t('hr_pub_age_computed')}</label>
                <input type="text" id="app-age-display" readonly class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#34d399; font-weight:700; padding:10px; border-radius:8px;" value="${I18nService.t('hr_pub_select_date')}" />
              </div>
              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">${I18nService.t('hr_pub_id_number')} <span style="color:#ef4444;">*</span></label>
                <input type="text" id="app-id-number" required class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" placeholder="${I18nService.t('ii_no_id_error').replace('Provisto.', '')}" />
              </div>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin-top:14px;">
              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">${I18nService.t('hr_pub_nationality')}</label>
                <input type="text" id="app-nationality" class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" placeholder="Nicaragüense" value="Nicaragüense" />
              </div>
              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">${I18nService.t('hr_pub_country')}</label>
                <input type="text" id="app-country" class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" placeholder="Nicaragua" value="Nicaragua" />
              </div>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin-top:14px;">
              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">${I18nService.t('hr_pub_dept_state')}</label>
                <input type="text" id="app-department" class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" placeholder="Ej. Managua" />
              </div>
              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">${I18nService.t('hr_pub_city_muni')}</label>
                <input type="text" id="app-municipality" class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" placeholder="Ej. Managua" />
              </div>
            </div>

            <div style="margin-top:14px;">
              <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">${I18nService.t('hr_pub_address')}</label>
              <textarea id="app-address" class="input" rows="2" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px; resize:vertical;" placeholder="${I18nService.t('hr_pub_address_placeholder')}"></textarea>
            </div>
          </div>

          <!-- SECTION 2: Contact Info -->
          <div style="background:#1e293b; border:1px solid #334155; border-radius:16px; padding:24px;">
            <h3 style="font-size:1.1rem; font-weight:700; color:#818cf8; margin:0 0 16px;">${I18nService.t('hr_pub_sec2_title')}</h3>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px;">
              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">${I18nService.t('hr_pub_email')} <span style="color:#ef4444;">*</span></label>
                <input type="email" id="app-email" required class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" placeholder="correo@ejemplo.com" />
              </div>
              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">${I18nService.t('hr_pub_whatsapp')} <span style="color:#ef4444;">*</span></label>
                <input type="tel" id="app-whatsapp" required class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" placeholder="+505 8888-8888" />
              </div>
              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">${I18nService.t('hr_pub_phone_alt')}</label>
                <input type="tel" id="app-phone-alt" class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" placeholder="Convencional o celular" />
              </div>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin-top:14px;">
              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">${I18nService.t('hr_pub_emergency_contact')}</label>
                <input type="text" id="app-emergency-name" class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" placeholder="Nombre de familiar" />
              </div>
              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">${I18nService.t('hr_pub_emergency_phone')}</label>
                <input type="tel" id="app-emergency-phone" class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" placeholder="+505 8888-0000" />
              </div>
            </div>
          </div>

          <!-- SECTION 3: Labor Aspirations -->
          <div style="background:#1e293b; border:1px solid #334155; border-radius:16px; padding:24px;">
            <h3 style="font-size:1.1rem; font-weight:700; color:#818cf8; margin:0 0 16px;">${I18nService.t('hr_pub_sec3_title')}</h3>
            
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px;">
              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">${I18nService.t('hr_pub_position_desired')} <span style="color:#ef4444;">*</span></label>
                <input type="text" id="app-position" required class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" placeholder="Ej. Cocinero, Cajero, Vendedor..." />
              </div>

              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">${I18nService.t('hr_pub_shift_preferred')}</label>
                <select id="app-shift" class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;">
                  <option value="TIEMPO_COMPLETO">${I18nService.t('hr_shift_full_time')}</option>
                  <option value="MEDIO_TIEMPO">${I18nService.t('hr_shift_part_time')}</option>
                  <option value="FINES_DE_SEMANA">${I18nService.t('hr_shift_weekends')}</option>
                  <option value="NOCTURNO">${I18nService.t('hr_shift_night')}</option>
                </select>
              </div>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px; margin-top:14px;">
              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">${I18nService.t('hr_pub_desired_salary')}</label>
                <input type="text" id="app-desired-salary" class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" placeholder="Ej. C$ 12,000 / mes" />
              </div>
              <div>
                <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">${I18nService.t('hr_pub_start_date')}</label>
                <input type="text" id="app-start-date" class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" placeholder="Inmediato / En 2 semanas" value="Inmediato" />
              </div>
            </div>
          </div>

          <!-- SECTION 4: Work Experience (Dynamic List) -->
          <div style="background:#1e293b; border:1px solid #334155; border-radius:16px; padding:24px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <h3 style="font-size:1.1rem; font-weight:700; color:#818cf8; margin:0;">${I18nService.t('hr_pub_sec4_title')}</h3>
              <button type="button" id="btn-add-experience" class="btn btn-secondary btn-sm" style="background:#312e81; color:#c7d2fe; border:1px solid #4338ca; font-weight:600; cursor:pointer;">${I18nService.t('hr_pub_add_experience')}</button>
            </div>
            <div id="experience-list-container" style="display:flex; flex-direction:column; gap:12px;">
              <p style="font-size:0.82rem; color:#94a3b8; margin:0;" id="empty-experience-msg">${I18nService.t('hr_pub_no_experience')}</p>
            </div>
          </div>

          <!-- SECTION 5: Education & Studies (Dynamic List) -->
          <div style="background:#1e293b; border:1px solid #334155; border-radius:16px; padding:24px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <h3 style="font-size:1.1rem; font-weight:700; color:#818cf8; margin:0;">${I18nService.t('hr_pub_sec5_title')}</h3>
              <button type="button" id="btn-add-education" class="btn btn-secondary btn-sm" style="background:#312e81; color:#c7d2fe; border:1px solid #4338ca; font-weight:600; cursor:pointer;">${I18nService.t('hr_pub_add_education')}</button>
            </div>
            <div id="education-list-container" style="display:flex; flex-direction:column; gap:12px;">
              <p style="font-size:0.82rem; color:#94a3b8; margin:0;" id="empty-education-msg">${I18nService.t('hr_pub_no_education')}</p>
            </div>
          </div>

          <!-- SECTION 6: Languages & Skills -->
          <div style="background:#1e293b; border:1px solid #334155; border-radius:16px; padding:24px;">
            <h3 style="font-size:1.1rem; font-weight:700; color:#818cf8; margin:0 0 16px;">${I18nService.t('hr_pub_sec6_title')}</h3>
            <div>
              <label style="font-size:0.8rem; color:#cbd5e1; display:block; margin-bottom:4px;">${I18nService.t('hr_pub_skills_label')}</label>
              <input type="text" id="app-skills-input" class="input" style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;" placeholder="Ej. Atención al Cliente, Trabajo en Equipo, Excel, Caja Chica" />
            </div>
          </div>

          <!-- SECTION 7: Document Checklist Uploads -->
          <div style="background:#1e293b; border:1px solid #334155; border-radius:16px; padding:24px;">
            <h3 style="font-size:1.1rem; font-weight:700; color:#818cf8; margin:0 0 16px;">${I18nService.t('hr_pub_sec7_title')}</h3>
            <p style="font-size:0.8rem; color:#cbd5e1; margin-bottom:16px;">${I18nService.t('hr_pub_docs_desc')}</p>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px;" id="requested-docs-uploaders-grid">
              <!-- Dynamically populated in bindEvents -->
            </div>
          </div>

          <!-- SECTION 8: Custom Builder Fields (if present) -->
          ${customFormFields.length > 0 ? `
            <div style="background:#1e293b; border:1px solid #334155; border-radius:16px; padding:24px;">
              <h3 style="font-size:1.1rem; font-weight:700; color:#818cf8; margin:0 0 16px;">${I18nService.t('hr_pub_sec8_title')}</h3>
              <div style="display:flex; flex-direction:column; gap:14px;">
                ${customFormFields.map((f, idx) => `
                  <div>
                    <label style="font-size:0.85rem; font-weight:600; color:#cbd5e1; display:block; margin-bottom:4px;">
                      ${idx + 1}. ${f.label} ${f.required ? '<span style="color:#ef4444;">*</span>' : ''}
                    </label>
                    ${f.type === 'yes_no' ? `
                      <select class="custom-builder-input input" data-fid="${f.id}" ${f.required ? 'required' : ''} style="width:100%; background:#0f172a; border:1px solid #334155; color:#fff; padding:10px; border-radius:8px;">
                        <option value="">${I18nService.t('select')}...</option>
                        <option value="SI">${I18nService.t('yes')}</option>
                        <option value="NO">${I18nService.t('no')}</option>
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
              <span>${I18nService.t('hr_pub_consent')} <span style="color:#ef4444;">*</span></span>
            </label>
          </div>

          <div style="text-align:center;">
            <button type="submit" id="btn-submit-app" ${isSubmitting ? 'disabled' : ''} style="background:linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color:#fff; font-size:1.1rem; font-weight:800; padding:16px 40px; border-radius:12px; border:none; cursor:pointer; width:100%; max-width:400px; box-shadow:0 10px 20px rgba(99,102,241,0.4);">
              ${isSubmitting ? I18nService.t('hr_pub_sending_expediente') : I18nService.t('hr_pub_submit_btn')}
            </button>
          </div>

        </form>
      </div>
    `;
  }
  }

  bindEvents() {
    if (!this.element) return;

    // Photo uploader slot
    const photoSlot = this.element.querySelector('#hr-photo-uploader-slot');
    if (photoSlot) {
      this.photoUploader = new ImageUploader({
        preset: 'PROFILE',
        label: I18nService.t('hr_pub_photo_preset'),
        onImageUploaded: (imageId) => { this.state.photoImageId = imageId; },
        onImageRemoved: () => { this.state.photoImageId = null; }
      });
      photoSlot.appendChild(this.photoUploader.mount());
    }

    // Requested docs uploaders
    const docsGrid = this.element.querySelector('#requested-docs-uploaders-grid');
    if (docsGrid) {
      this.state.requestedDocuments.forEach(doc => {
        const itemDiv = document.createElement('div');
        itemDiv.style.cssText = 'background:#0f172a; border:1px solid #334155; border-radius:10px; padding:12px;';
        
        const label = document.createElement('label');
        label.style.cssText = 'font-size:0.8rem; font-weight:600; color:#cbd5e1; display:block; margin-bottom:6px;';
        label.innerHTML = `${doc.name} ${doc.required ? '<span style="color:#ef4444;">*</span>' : ''}`;
        itemDiv.appendChild(label);

        const uploader = new ImageUploader({
          preset: 'DOCUMENT',
          label: I18nService.t('hr_pub_attach_doc'),
          onImageUploaded: (imageId) => { this.state.docImageIds[doc.id] = imageId; },
          onImageRemoved: () => { delete this.state.docImageIds[doc.id]; }
        });
        itemDiv.appendChild(uploader.mount());
        docsGrid.appendChild(itemDiv);
      });
    }

    // Plain Date of Birth handling without timezone drift
    const birthInput = this.element.querySelector('#app-birthdate');
    const ageDisplay = this.element.querySelector('#app-age-display');
    if (birthInput) {
      birthInput.addEventListener('change', (e) => {
        const val = e.target.value; // "YYYY-MM-DD"
        if (val && val.includes('-')) {
          const parts = val.split('-').map(Number);
          if (parts.length === 3) {
            const [y, m, d] = parts;
            const today = new Date();
            let age = today.getFullYear() - y;
            const currentMonth = today.getMonth() + 1;
            const currentDay = today.getDate();
            if (currentMonth < m || (currentMonth === m && currentDay < d)) {
              age--;
            }
            this.state.computedAge = Math.max(0, age);
            if (ageDisplay) ageDisplay.value = `${this.state.computedAge} ${I18nService.t('dash_months')[11].toLowerCase()}s`;
          }
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

    // Dynamic Experience List
    const addExpBtn = this.element.querySelector('#btn-add-experience');
    if (addExpBtn) {
      addExpBtn.addEventListener('click', () => this.addExperienceItem());
    }

    // Dynamic Education List
    const addEduBtn = this.element.querySelector('#btn-add-education');
    if (addEduBtn) {
      addEduBtn.addEventListener('click', () => this.addEducationItem());
    }

    // Form submit
    const form = this.element.querySelector('#hr-public-apply-form');
    if (form) form.addEventListener('submit', (e) => this.handleSubmit(e));
  }

  addExperienceItem() {
    const container = this.element.querySelector('#experience-list-container');
    const emptyMsg = this.element.querySelector('#empty-experience-msg');
    if (emptyMsg) emptyMsg.style.display = 'none';

    const itemId = `exp_${Date.now()}`;
    const div = document.createElement('div');
    div.id = itemId;
    div.className = 'exp-item-card';
    div.style.cssText = 'background:#0f172a; border:1px solid #334155; border-radius:10px; padding:14px; position:relative;';

    div.innerHTML = `
      <button type="button" class="btn-remove-item" style="position:absolute; top:10px; right:10px; background:transparent; border:none; color:#ef4444; font-size:1.1rem; cursor:pointer;">&times;</button>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:8px;">
        <div>
          <label style="font-size:0.75rem; color:#cbd5e1; display:block;">${I18nService.t('hr_pub_company_label')}</label>
          <input type="text" class="exp-company input" style="width:100%; background:#1e293b; border:1px solid #334155; color:#fff; padding:6px; border-radius:6px; font-size:0.8rem;" placeholder="Nombre de empresa" />
        </div>
        <div>
          <label style="font-size:0.75rem; color:#cbd5e1; display:block;">${I18nService.t('hr_pub_position_label')}</label>
          <input type="text" class="exp-position input" style="width:100%; background:#1e293b; border:1px solid #334155; color:#fff; padding:6px; border-radius:6px; font-size:0.8rem;" placeholder="Cargo desempeñado" />
        </div>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <div>
          <label style="font-size:0.75rem; color:#cbd5e1; display:block;">${I18nService.t('hr_pub_period_label')}</label>
          <input type="text" class="exp-period input" style="width:100%; background:#1e293b; border:1px solid #334155; color:#fff; padding:6px; border-radius:6px; font-size:0.8rem;" placeholder="Ej. 2022 - 2024 (2 años)" />
        </div>
        <div>
          <label style="font-size:0.75rem; color:#cbd5e1; display:block;">${I18nService.t('hr_pub_functions_label')}</label>
          <input type="text" class="exp-desc input" style="width:100%; background:#1e293b; border:1px solid #334155; color:#fff; padding:6px; border-radius:6px; font-size:0.8rem;" placeholder="Principales tareas" />
        </div>
      </div>
    `;

    div.querySelector('.btn-remove-item').addEventListener('click', () => {
      div.remove();
      if (container.querySelectorAll('.exp-item-card').length === 0 && emptyMsg) {
        emptyMsg.style.display = 'block';
      }
    });

    container.appendChild(div);
  }

  addEducationItem() {
    const container = this.element.querySelector('#education-list-container');
    const emptyMsg = this.element.querySelector('#empty-education-msg');
    if (emptyMsg) emptyMsg.style.display = 'none';

    const itemId = `edu_${Date.now()}`;
    const div = document.createElement('div');
    div.id = itemId;
    div.className = 'edu-item-card';
    div.style.cssText = 'background:#0f172a; border:1px solid #334155; border-radius:10px; padding:14px; position:relative;';

    div.innerHTML = `
      <button type="button" class="btn-remove-item" style="position:absolute; top:10px; right:10px; background:transparent; border:none; color:#ef4444; font-size:1.1rem; cursor:pointer;">&times;</button>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <div>
          <label style="font-size:0.75rem; color:#cbd5e1; display:block;">${I18nService.t('hr_pub_institution_label')}</label>
          <input type="text" class="edu-inst input" style="width:100%; background:#1e293b; border:1px solid #334155; color:#fff; padding:6px; border-radius:6px; font-size:0.8rem;" placeholder="Nombre de institución" />
        </div>
        <div>
          <label style="font-size:0.75rem; color:#cbd5e1; display:block;">${I18nService.t('hr_pub_degree_label')}</label>
          <input type="text" class="edu-degree input" style="width:100%; background:#1e293b; border:1px solid #334155; color:#fff; padding:6px; border-radius:6px; font-size:0.8rem;" placeholder="Ej. Bachiller, Licenciatura..." />
        </div>
      </div>
    `;

    div.querySelector('.btn-remove-item').addEventListener('click', () => {
      div.remove();
      if (container.querySelectorAll('.edu-item-card').length === 0 && emptyMsg) {
        emptyMsg.style.display = 'block';
      }
    });

    container.appendChild(div);
  }

  async handleSubmit(e) {
    e.preventDefault();

    if (this.state.isSubmitting) return;

    if (!this.state.photoImageId) {
      alert(I18nService.t('hr_pub_error_photo'));
      return;
    }

    // Validate required requested documents
    for (const doc of this.state.requestedDocuments) {
      if (doc.required && !this.state.docImageIds[doc.id]) {
        alert(I18nService.t('hr_pub_error_doc', { name: doc.name }));
        return;
      }
    }

    const submitBtn = this.element.querySelector('#btn-submit-app');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = I18nService.t('hr_pub_sending_expediente');
    }
    this.state.isSubmitting = true;

    // Gather Custom Builder Answers
    const customAns = {};
    this.element.querySelectorAll('.custom-builder-input').forEach(input => {
      const fid = input.getAttribute('data-fid');
      if (fid) customAns[fid] = input.value;
    });

    // Gather Experiences
    const experiences = [];
    this.element.querySelectorAll('.exp-item-card').forEach(card => {
      const company = card.querySelector('.exp-company')?.value.trim();
      const position = card.querySelector('.exp-position')?.value.trim();
      const period = card.querySelector('.exp-period')?.value.trim();
      const desc = card.querySelector('.exp-desc')?.value.trim();
      if (company || position) {
        experiences.push({ company, position, period, desc });
      }
    });

    // Gather Education
    const education = [];
    this.element.querySelectorAll('.edu-item-card').forEach(card => {
      const inst = card.querySelector('.edu-inst')?.value.trim();
      const degree = card.querySelector('.edu-degree')?.value.trim();
      if (inst || degree) {
        education.push({ institution: inst, degree });
      }
    });

    // Skills
    const skillsRaw = this.element.querySelector('#app-skills-input')?.value || '';
    const skills = skillsRaw.split(',').map(s => s.trim()).filter(Boolean);

    const candidateId = `cand_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const expCode = `EXP-RH-${Math.floor(100000 + Math.random() * 900000)}`;
    const birthDateVal = this.element.querySelector('#app-birthdate')?.value || '';

    const payload = {
      id: candidateId,
      candidateId,
      expCode,
      companyId: this.companyId,
      status: 'NUEVO',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      photoImageId: this.state.photoImageId,
      documents: this.state.docImageIds,
      firstName: this.element.querySelector('#app-firstname')?.value.trim() || '',
      lastName: this.element.querySelector('#app-lastname')?.value.trim() || '',
      displayName: `${this.element.querySelector('#app-firstname')?.value.trim() || ''} ${this.element.querySelector('#app-lastname')?.value.trim() || ''}`,
      birthDate: birthDateVal,
      age: this.state.computedAge || 0,
      idNumber: this.element.querySelector('#app-id-number')?.value.trim() || '',
      nationality: this.element.querySelector('#app-nationality')?.value.trim() || 'Nicaragüense',
      country: this.element.querySelector('#app-country')?.value.trim() || 'Nicaragua',
      department: this.element.querySelector('#app-department')?.value.trim() || '',
      municipality: this.element.querySelector('#app-municipality')?.value.trim() || '',
      address: this.element.querySelector('#app-address')?.value.trim() || '',

      email: this.element.querySelector('#app-email')?.value.trim() || '',
      whatsapp: this.element.querySelector('#app-whatsapp')?.value.trim() || '',
      phoneAlt: this.element.querySelector('#app-phone-alt')?.value.trim() || '',
      emergencyName: this.element.querySelector('#app-emergency-name')?.value.trim() || '',
      emergencyPhone: this.element.querySelector('#app-emergency-phone')?.value.trim() || '',

      position: this.element.querySelector('#app-position')?.value.trim() || '',
      shift: this.element.querySelector('#app-shift')?.value || 'TIEMPO_COMPLETO',
      desiredSalary: this.element.querySelector('#app-desired-salary')?.value.trim() || '',
      startDate: this.element.querySelector('#app-start-date')?.value.trim() || 'Inmediato',

      experiences,
      education,
      skills,
      customAnswers: customAns
    };

    try {
      // Primary candidate pool path
      await FirestoreService.writePath(`${this.companyId}/hr_candidates/${candidateId}`, payload);
      // Dual write to central companies tree for tenant isolation safety
      await FirestoreService.writePath(`companies/${this.companyId}/hr_candidates/${candidateId}`, payload);

      this.setState({ submitted: true, applicationId: expCode, isSubmitting: false });
    } catch (err) {
      console.error('[PublicApplyView] Error submitting application:', err);
      alert(I18nService.t('hr_pub_error_submit', { error: err.message }));
      this.state.isSubmitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = I18nService.t('hr_pub_submit_btn');
      }
    }
  }
}
