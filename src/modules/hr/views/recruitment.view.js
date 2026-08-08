/**
 * @file recruitment.view.js
 * @description Advanced HR & Recruitment Module Dashboard View for Business Owners and HR Managers.
 * Features 8 integrated tabs:
 * 1. Dashboard RH (KPIs & Recent Solicitudes)
 * 2. Candidatos (Talent Pool, Dossiers, 1-Click Hiring, WhatsApp Chat)
 * 3. Vacantes (Job Vacancies CRUD)
 * 4. Editor Web (Visual Landing Page Editor & Section Toggles)
 * 5. Código QR (Custom QR Generator, PNG/SVG Download & Printable Posters)
 * 6. Formularios (Visual Form Builder by Block Types)
 * 7. Documentos (Requested Documents Checklist Config)
 * 8. Configuración (Notifications & WhatsApp/Telegram Automation)
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { ImageDisplay } from '../../../components/ui/image-display.js';
import { ImageUploader } from '../../../components/ui/image-uploader.js';
import { Modal } from '../../../components/ui/modal.js';
import { TimeService } from '../../../services/time.service.js';
import { ref, set, update } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';
import { db } from '../../../config/firebase.config.js';

export const CANDIDATE_STATUSES = {
  NUEVO: { label: 'NUEVO', color: '#6366f1', bg: 'rgba(99,102,241,0.15)' },
  EN_REVISION: { label: 'En Revisión', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  PRESELECCIONADO: { label: 'Preseleccionado', color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)' },
  ENTREVISTA: { label: 'Entrevista', color: '#06b6d4', bg: 'rgba(6,182,212,0.15)' },
  APROBADO: { label: 'Aprobado', color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
  CONTRATADO: { label: 'Contratado', color: '#34d399', bg: 'rgba(52,211,153,0.2)' },
  RECHAZADO: { label: 'Rechazado', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  ARCHIVADO: { label: 'Archivado', color: '#64748b', bg: 'rgba(100,116,139,0.15)' }
};

export class RecruitmentView extends Component {
  constructor(params = {}) {
    super(params);

    const { currentUser, currentCompany } = GlobalStore.getState();
    this.currentUser = currentUser || {};
    this.currentCompany = currentCompany || {};
    this.companyId = currentCompany?.id || currentUser?.companyId || currentCompany?.companyId || '';

    this.publicApplyUrl = `${window.location.origin}/#/hr/apply/${this.companyId}`;

    this.state = {
      activeTab: 'dashboard', // 'dashboard' | 'candidates' | 'vacancies' | 'page-editor' | 'qr' | 'form-builder' | 'documents' | 'settings'
      candidates: [],
      filteredCandidates: [],
      vacancies: [],
      customFormFields: [],
      requestedDocuments: [],
      pageConfig: {},
      searchQuery: '',
      statusFilter: 'ALL',
      selectedCandidate: null,
      loading: true
    };

    this.layout = new PageLayout({
      title: '👥 Recursos Humanos (RH) & Reclutamiento',
      subtitle: 'Plataforma integral de talento, vacantes, editor de página pública y contratación',
      actionHTML: `
        <div style="display:flex; overflow-x:auto; -webkit-overflow-scrolling:touch; scrollbar-width:none; gap:6px; padding-bottom:4px; max-width:100%; scroll-snap-type:x mandatory;" id="hr-top-tab-actions">
          <button class="btn btn-secondary btn-xs hr-tab-btn" id="btn-tab-dashboard" style="font-weight:600; flex-shrink:0; scroll-snap-align:start; min-height:36px; padding:6px 12px; white-space:nowrap;">📊 Dashboard</button>
          <button class="btn btn-secondary btn-xs hr-tab-btn" id="btn-tab-candidates" style="font-weight:600; flex-shrink:0; scroll-snap-align:start; min-height:36px; padding:6px 12px; white-space:nowrap;">👥 Candidatos</button>
          <button class="btn btn-secondary btn-xs hr-tab-btn" id="btn-tab-vacancies" style="font-weight:600; flex-shrink:0; scroll-snap-align:start; min-height:36px; padding:6px 12px; white-space:nowrap;">💼 Vacantes</button>
          <button class="btn btn-secondary btn-xs hr-tab-btn" id="btn-tab-page-editor" style="font-weight:600; flex-shrink:0; scroll-snap-align:start; min-height:36px; padding:6px 12px; white-space:nowrap;">🎨 Editor Web</button>
          <button class="btn btn-secondary btn-xs hr-tab-btn" id="btn-tab-qr" style="font-weight:600; flex-shrink:0; scroll-snap-align:start; min-height:36px; padding:6px 12px; white-space:nowrap;">📲 Código QR</button>
          <button class="btn btn-secondary btn-xs hr-tab-btn" id="btn-tab-form-builder" style="font-weight:600; flex-shrink:0; scroll-snap-align:start; min-height:36px; padding:6px 12px; white-space:nowrap;">📝 Formularios</button>
          <button class="btn btn-secondary btn-xs hr-tab-btn" id="btn-tab-documents" style="font-weight:600; flex-shrink:0; scroll-snap-align:start; min-height:36px; padding:6px 12px; white-space:nowrap;">📄 Documentos</button>
        </div>
      `,
      contentHTML: `<div id="hr-recruitment-view-root" style="overflow-x:auto;"></div>`
    });

    this.listeners = [];
  }

  mount() {
    const element = this.layout.mount();
    this.element = element;
    this.afterMount(element);
    this.subscribeToData(element);
    this.renderActiveTabUI(element);
    return element;
  }

  afterMount(element) {
    const root = element || this.element || this.layout.element;
    this.bindHeaderTabs(root);
  }

  unmount() {
    // Cancel all Firebase real-time listeners.
    // listenToTenant/listenToPath return a string listenerId — NOT a function.
    // Must use FirestoreService.unsubscribe(id) to detach them from RTDB.
    this.listeners.forEach(id => {
      if (typeof id === 'string') {
        FirestoreService.unsubscribe(id);
      } else if (typeof id === 'function') {
        id(); // legacy fallback if any listener is an off() fn
      }
    });
    this.listeners = [];
    if (this.layout && typeof this.layout.unmount === 'function') {
      this.layout.unmount();
    }
    // Clear element references so orphaned callbacks cannot write to the DOM
    this.element = null;
    super.unmount();
  }

  bindHeaderTabs(element) {
    const root = element || this.element || this.layout.element;
    if (!root) return;

    const tabs = ['dashboard', 'candidates', 'vacancies', 'page-editor', 'qr', 'form-builder', 'documents'];
    tabs.forEach(t => {
      root.querySelector(`#btn-tab-${t}`)?.addEventListener('click', () => this.switchTab(t, root));
    });
  }

  switchTab(tabKey, element) {
    this.state.activeTab = tabKey;
    this.renderActiveTabUI(element);
  }

  subscribeToData(element) {
    const { currentUser, currentCompany } = GlobalStore.getState();
    if (!this.companyId) {
      this.companyId = currentCompany?.id || currentUser?.companyId || currentCompany?.companyId || '';
      this.publicApplyUrl = `${window.location.origin}/#/hr/apply/${this.companyId}`;
    }

    if (!this.companyId) {
      console.warn('[RecruitmentView] No companyId found in session.');
      this.state.loading = false;
      this.renderActiveTabUI(element);
      return;
    }

    // 1. Candidates real-time listener
    try {
      const unsubCandidates = FirestoreService.listenToTenant('hr_candidates', (data) => {
        const list = data ? Object.values(data) : [];
        list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        this.state.candidates = list;
        this.state.loading = false;
        this.applyFilters(element);
      });
      this.listeners.push(unsubCandidates);
    } catch (e) {
      console.warn('[RecruitmentView] Candidates listener warn:', e);
      this.state.loading = false;
      this.renderActiveTabUI(element);
    }

    // 2. Vacancies real-time listener
    try {
      const unsubVacancies = FirestoreService.listenToTenant('hr_vacancies', (data) => {
        this.state.vacancies = data ? Object.values(data) : [];
        if (this.state.activeTab === 'vacancies' || this.state.activeTab === 'dashboard') {
          this.renderActiveTabUI(element);
        }
      });
      this.listeners.push(unsubVacancies);
    } catch (e) {}

    // Load configs
    this.loadPageConfig();
    this.loadFormFields();
    this.loadRequestedDocuments();
  }

  async loadPageConfig() {
    try {
      const raw = await FirestoreService.readPath(`${this.companyId}/hr_page_config`);
      this.state.pageConfig = raw || {};
    } catch (e) {}
  }

  async loadFormFields() {
    try {
      const raw = await FirestoreService.readPath(`${this.companyId}/hr_form_fields`);
      this.state.customFormFields = raw ? Object.values(raw).sort((a, b) => a.order - b.order) : [];
    } catch (e) {}
  }

  async loadRequestedDocuments() {
    try {
      const raw = await FirestoreService.readPath(`${this.companyId}/hr_requested_documents`);
      this.state.requestedDocuments = raw ? Object.values(raw) : [
        { id: 'dni', name: 'Documento de Identidad (Cédula/DNI)', required: true },
        { id: 'police_record', name: 'Récord Policial', required: true },
        { id: 'cv', name: 'Curriculum Vitae (CV PDF)', required: true },
        { id: 'diploma', name: 'Títulos o Diplomas', required: false },
        { id: 'driver_license', name: 'Licencia de Conducir', required: false }
      ];
    } catch (e) {}
  }

  applyFilters(element) {
    const { candidates, searchQuery, statusFilter } = this.state;

    let result = candidates.filter(c => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q ||
        (c.displayName || '').toLowerCase().includes(q) ||
        (c.position || '').toLowerCase().includes(q) ||
        (c.city || '').toLowerCase().includes(q) ||
        (c.idNumber || '').toLowerCase().includes(q) ||
        (c.skills || []).some(s => s.toLowerCase().includes(q));

      const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    this.state.filteredCandidates = result;
    this.renderActiveTabUI(element);
  }

  renderActiveTabUI(element) {
    // Guard: this.element is nulled by unmount() — if null the view has been torn down
    if (this.element === null && !element) return;

    const root = element || this.element || this.layout.element;
    if (!root) return;

    // Guard: if element is no longer attached to the document (navigated away), do not write
    if (!root.isConnected) return;

    const container = root.querySelector('#hr-recruitment-view-root');
    if (!container) return;

    // Highlight active header button
    root.querySelectorAll('#hr-top-tab-actions button').forEach(b => {
      b.className = 'btn btn-secondary btn-xs';
      b.style.borderColor = 'var(--color-border)';
    });
    const activeBtn = root.querySelector(`#btn-tab-${this.state.activeTab}`);
    if (activeBtn) {
      activeBtn.className = 'btn btn-primary btn-xs';
      activeBtn.style.fontWeight = '700';
    }

    switch (this.state.activeTab) {
      case 'dashboard':
        container.innerHTML = this.renderDashboardTabHTML();
        this.bindDashboardEvents(container);
        break;
      case 'candidates':
        container.innerHTML = this.renderCandidatesTabHTML();
        this.bindCandidatesTabEvents(container);
        break;
      case 'vacancies':
        container.innerHTML = this.renderVacanciesTabHTML();
        this.bindVacanciesTabEvents(container);
        break;
      case 'page-editor':
        container.innerHTML = this.renderPageEditorTabHTML();
        this.bindPageEditorTabEvents(container);
        break;
      case 'qr':
        container.innerHTML = this.renderQRTabHTML();
        this.bindQRTabEvents(container);
        break;
      case 'form-builder':
        container.innerHTML = this.renderFormBuilderTabHTML();
        this.bindFormBuilderTabEvents(container);
        break;
      case 'documents':
        container.innerHTML = this.renderDocumentsTabHTML();
        this.bindDocumentsTabEvents(container);
        break;
      default:
        container.innerHTML = this.renderDashboardTabHTML();
    }
  }

  // ─── TAB 1: DASHBOARD RH ─────────────────────────────────────────────────────

  renderDashboardTabHTML() {
    const { candidates, vacancies, loading } = this.state;

    const total = candidates.length;
    const nuevos = candidates.filter(c => c.status === 'NUEVO').length;
    const revision = candidates.filter(c => c.status === 'EN_REVISION').length;
    const entrevistas = candidates.filter(c => c.status === 'ENTREVISTA' || c.status === 'PRESELECCIONADO').length;
    const contratados = candidates.filter(c => c.status === 'CONTRATADO' || c.status === 'APROBADO').length;
    const rechazados = candidates.filter(c => c.status === 'RECHAZADO').length;
    const vacantesActivas = vacancies.filter(v => v.status === 'ACTIVA').length;

    const recentCandidates = candidates.slice(0, 5);

    return `
      <!-- KPI Row -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:12px; margin-bottom:20px;">
        <div class="card p-3 text-center" style="border-left:4px solid #6366f1;">
          <span style="font-size:0.75rem; color:var(--color-text-secondary);">Postulaciones</span>
          <h3 style="font-size:1.4rem; font-weight:800; margin:4px 0 0; color:#6366f1;">${total}</h3>
        </div>
        <div class="card p-3 text-center" style="border-left:4px solid #38bdf8;">
          <span style="font-size:0.75rem; color:var(--color-text-secondary);">Nuevas</span>
          <h3 style="font-size:1.4rem; font-weight:800; margin:4px 0 0; color:#38bdf8;">${nuevos}</h3>
        </div>
        <div class="card p-3 text-center" style="border-left:4px solid #f59e0b;">
          <span style="font-size:0.75rem; color:var(--color-text-secondary);">En Revisión</span>
          <h3 style="font-size:1.4rem; font-weight:800; margin:4px 0 0; color:#f59e0b;">${revision}</h3>
        </div>
        <div class="card p-3 text-center" style="border-left:4px solid #06b6d4;">
          <span style="font-size:0.75rem; color:var(--color-text-secondary);">Entrevistas</span>
          <h3 style="font-size:1.4rem; font-weight:800; margin:4px 0 0; color:#06b6d4;">${entrevistas}</h3>
        </div>
        <div class="card p-3 text-center" style="border-left:4px solid #10b981;">
          <span style="font-size:0.75rem; color:var(--color-text-secondary);">Contratados</span>
          <h3 style="font-size:1.4rem; font-weight:800; margin:4px 0 0; color:#10b981;">${contratados}</h3>
        </div>
        <div class="card p-3 text-center" style="border-left:4px solid #8b5cf6;">
          <span style="font-size:0.75rem; color:var(--color-text-secondary);">Vacantes Activas</span>
          <h3 style="font-size:1.4rem; font-weight:800; margin:4px 0 0; color:#8b5cf6;">${vacantesActivas}</h3>
        </div>
      </div>

      <!-- Main Overview Content -->
      <div style="display:grid; grid-template-columns: 2fr 1fr; gap:20px;">
        
        <!-- Left: Recent Applications Table -->
        <div class="card p-5">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3 style="font-size:1.05rem; font-weight:700; margin:0; color:var(--color-text-primary);">📥 Últimas Postulaciones Recibidas</h3>
            <button class="btn btn-secondary btn-xs" onclick="document.querySelector('#btn-tab-candidates').click()">Ver Todos (${total})</button>
          </div>

          ${loading ? `<div class="text-center py-6 text-secondary">Cargando datos...</div>` : recentCandidates.length === 0 ? `
            <div class="text-center py-8 text-secondary">
              <span style="font-size:2.5rem; display:block; margin-bottom:8px;">📥</span>
              <p style="font-size:0.85rem;">No hay postulaciones recientes. Comparte tu Código QR para comenzar a recibir solicitudes.</p>
            </div>
          ` : `
            <div style="overflow-x:auto;">
              <table style="width:100%; border-collapse:collapse; font-size:0.82rem;">
                <thead>
                  <tr style="border-bottom:1px solid var(--color-border); text-align:left; color:var(--color-text-secondary);">
                    <th style="padding:8px;">Candidato</th>
                    <th style="padding:8px;">Puesto</th>
                    <th style="padding:8px;">Estado</th>
                    <th style="padding:8px;">Fecha</th>
                    <th style="padding:8px; text-align:right;">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  ${recentCandidates.map(c => {
                    const st = CANDIDATE_STATUSES[c.status] || CANDIDATE_STATUSES.NUEVO;
                    return `
                      <tr style="border-bottom:1px solid var(--color-border);">
                        <td style="padding:10px 8px; font-weight:600; color:var(--color-text-primary);">${c.displayName}</td>
                        <td style="padding:10px 8px; color:var(--color-accent);">${c.position || 'General'}</td>
                        <td style="padding:10px 8px;"><span class="badge" style="background:${st.bg}; color:${st.color}; font-size:0.7rem; padding:2px 8px; border-radius:10px;">${st.label}</span></td>
                        <td style="padding:10px 8px; color:var(--color-text-tertiary); font-size:0.75rem;">${c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ''}</td>
                        <td style="padding:10px 8px; text-align:right;">
                          <button class="btn btn-secondary btn-xs btn-view-candidate" data-id="${c.id}">👁️ Ver</button>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>

        <!-- Right: Quick QR & Portal Access Card -->
        <div style="display:flex; flex-direction:column; gap:16px;">
          <div class="card p-5 text-center" style="background:var(--color-bg-tertiary);">
            <span style="font-size:2rem; display:block; margin-bottom:6px;">📲</span>
            <h4 style="font-size:0.95rem; font-weight:700; margin:0 0 6px; color:var(--color-text-primary);">Página Pública de Reclutamiento</h4>
            <p style="font-size:0.78rem; color:var(--color-text-secondary); margin:0 0 12px;">Los postulantes escanean tu QR o entran al enlace directo.</p>
            
            <a href="${this.publicApplyUrl}" target="_blank" class="btn btn-primary btn-xs" style="width:100%; font-weight:700; margin-bottom:8px;">🌐 Abrir Página Pública</a>
            <button class="btn btn-secondary btn-xs" id="dash-btn-copy-link" style="width:100%;">📋 Copiar Enlace Directo</button>
          </div>

          <div class="card p-5">
            <h4 style="font-size:0.95rem; font-weight:700; margin:0 0 10px; color:var(--color-text-primary);">💼 Vacantes Activas (${vacantesActivas})</h4>
            ${vacancies.slice(0, 3).map(v => `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--color-border); font-size:0.8rem;">
                <span style="font-weight:600; color:var(--color-text-primary);">${v.title}</span>
                <span class="badge" style="font-size:0.65rem; background:rgba(16,185,129,0.15); color:#34d399;">${v.department || 'General'}</span>
              </div>
            `).join('')}
            <button class="btn btn-secondary btn-xs mt-3" style="width:100%;" onclick="document.querySelector('#btn-tab-vacancies').click()">+ Gestionar Vacantes</button>
          </div>
        </div>

      </div>
    `;
  }

  bindDashboardEvents(container) {
    container.querySelector('#dash-btn-copy-link')?.addEventListener('click', () => {
      navigator.clipboard.writeText(this.publicApplyUrl).then(() => NotificationService.success('¡Enlace público copiado!'));
    });

    container.querySelectorAll('.btn-view-candidate').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const cand = this.state.candidates.find(c => c.id === id);
        if (cand) this.openCandidateDossierModal(cand);
      });
    });
  }

  // ─── TAB 2: CANDIDATES ───────────────────────────────────────────────────────

  renderCandidatesTabHTML() {
    const { candidates, filteredCandidates, searchQuery, statusFilter, loading } = this.state;

    return `
      <!-- Search & Filters Bar -->
      <div class="card p-4 mb-4" style="display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between;">
        <div style="display:flex; gap:8px; flex:1; min-width:260px;">
          <input type="text" id="hr-search-input" class="input input-md" placeholder="🔍 Buscar candidato por nombre, puesto, cédula, habilidades..." value="${searchQuery}" style="flex:1;" />
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <label style="font-size:0.8rem; font-weight:600;">Filtrar Estado:</label>
          <select id="hr-status-filter" class="input input-md" style="background:var(--color-bg-secondary); border:1px solid var(--color-border); color:var(--color-text-primary);">
            <option value="ALL" ${statusFilter === 'ALL' ? 'selected' : ''}>Todos (${candidates.length})</option>
            ${Object.keys(CANDIDATE_STATUSES).map(st => `
              <option value="${st}" ${statusFilter === st ? 'selected' : ''}>${CANDIDATE_STATUSES[st].label}</option>
            `).join('')}
          </select>
        </div>
      </div>

      <!-- Candidates Cards Grid -->
      ${loading ? `<div class="text-center py-12 text-secondary">Cargando candidatos...</div>` : filteredCandidates.length === 0 ? `
        <div class="card p-12 text-center text-secondary">
          <span style="font-size:3rem; display:block; margin-bottom:12px;">📁</span>
          <h3 style="font-size:1.1rem; font-weight:700; color:var(--color-text-primary); margin-bottom:6px;">No hay candidatos registrados</h3>
          <p style="font-size:0.85rem; max-width:440px; margin:0 auto 16px;">Comparte el enlace público o Código QR de reclutamiento para recibir solicitudes.</p>
        </div>
      ` : `
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px;">
          ${filteredCandidates.map(c => this.renderCandidateCardHTML(c)).join('')}
        </div>
      `}
    `;
  }

  renderCandidateCardHTML(c) {
    const stConfig = CANDIDATE_STATUSES[c.status] || CANDIDATE_STATUSES.NUEVO;
    const dateFormatted = c.createdAt ? new Date(c.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    const phoneClean = (c.whatsapp || c.phoneAlt || '').replace(/\D/g, '');

    return `
      <div class="card p-4 hover-lift" style="display:flex; flex-direction:column; justify-content:space-between; gap:12px; border-top:3px solid ${stConfig.color};">
        <div>
          <div style="display:flex; gap:12px; align-items:flex-start; margin-bottom:10px;">
            <div style="flex-shrink:0;">
              ${ImageDisplay.renderTag(c.photoImageId, `https://ui-avatars.com/api/?name=${encodeURIComponent(c.displayName || 'C')}&background=6366f1&color=fff&size=50`, 'width:50px;height:50px;border-radius:10px;object-fit:cover;border:2px solid var(--color-border);', c.companyId)}
            </div>
            <div style="flex:1; overflow:hidden;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <h4 style="font-size:0.95rem; font-weight:700; margin:0; color:var(--color-text-primary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${c.displayName}</h4>
                <span class="badge" style="background:${stConfig.bg}; color:${stConfig.color}; font-size:0.68rem; font-weight:700; padding:2px 8px; border-radius:12px;">${stConfig.label}</span>
              </div>
              <span style="font-size:0.78rem; font-weight:600; color:var(--color-accent); display:block; margin-top:2px;">💼 ${c.position || 'Sin puesto'}</span>
              <span style="font-size:0.72rem; color:var(--color-text-tertiary);">📍 ${c.city || 'Nicaragua'} · 🎂 ${c.age ? c.age + ' años' : ''}</span>
            </div>
          </div>

          <div style="font-size:0.7rem; color:var(--color-text-tertiary); display:flex; justify-content:space-between; border-top:1px dashed var(--color-border); padding-top:6px;">
            <span>🆔 ${c.expCode || 'EXP-RH'}</span>
            <span>📅 ${dateFormatted}</span>
          </div>
        </div>

        <div style="display:flex; gap:6px; border-top:1px solid var(--color-border); padding-top:10px;">
          <button class="btn btn-secondary btn-xs btn-view-candidate" data-id="${c.id}" style="flex:1; font-weight:600;">👁️ Expediente</button>
          ${phoneClean ? `
            <a href="https://wa.me/${phoneClean}?text=${encodeURIComponent(`Hola ${c.firstName}, te saludamos de ${this.currentCompany.name || 'nuestra empresa'} con respecto a tu solicitud de empleo para ${c.position}.`)}" target="_blank" class="btn btn-success btn-xs" style="background:#25D366; border:none; color:#fff;" title="Chat por WhatsApp">💬</a>
          ` : ''}
          <button class="btn btn-primary btn-xs btn-hire-candidate" data-id="${c.id}" style="background:var(--color-success); border:none; font-weight:700;" title="Contratar candidato">💼 Contratar</button>
        </div>
      </div>
    `;
  }

  bindCandidatesTabEvents(container) {
    container.querySelector('#hr-search-input')?.addEventListener('input', (e) => {
      this.state.searchQuery = e.target.value;
      this.applyFilters();
    });

    container.querySelector('#hr-status-filter')?.addEventListener('change', (e) => {
      this.state.statusFilter = e.target.value;
      this.applyFilters();
    });

    container.querySelectorAll('.btn-view-candidate').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const cand = this.state.candidates.find(c => c.id === id);
        if (cand) this.openCandidateDossierModal(cand);
      });
    });

    container.querySelectorAll('.btn-hire-candidate').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const cand = this.state.candidates.find(c => c.id === id);
        if (cand) this.openHireCandidateModal(cand);
      });
    });
  }

  // ─── TAB 3: VACANCIES (VACANTES) ──────────────────────────────────────────────

  renderVacanciesTabHTML() {
    const { vacancies } = this.state;

    return `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <div class="card p-5" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <h3 style="font-size:1.1rem; font-weight:700; margin:0; color:var(--color-text-primary);">💼 Vacantes y Ofertas Laborales</h3>
            <p style="font-size:0.8rem; color:var(--color-text-secondary); margin:2px 0 0;">Publica puestos disponibles para que los postulantes apliquen directamente.</p>
          </div>
          <button id="btn-create-vacancy" class="btn btn-primary btn-sm" style="font-weight:700;">+ Nueva Vacante</button>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:16px;">
          ${vacancies.length === 0 ? `
            <div class="card p-8 text-center text-secondary" style="grid-column:1/-1;">
              <span style="font-size:2.5rem; display:block; margin-bottom:8px;">💼</span>
              <p>No tienes vacantes activas publicadas. Presiona "+ Nueva Vacante" para agregar una.</p>
            </div>
          ` : vacancies.map(v => `
            <div class="card p-4 hover-lift" style="display:flex; flex-direction:column; justify-space-between; border-left:4px solid ${v.status === 'ACTIVA' ? '#10b981' : '#64748b'};">
              <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
                  <h4 style="font-size:1rem; font-weight:700; margin:0; color:var(--color-text-primary);">${v.title}</h4>
                  <span class="badge" style="background:${v.status === 'ACTIVA' ? 'rgba(16,185,129,0.15)' : 'rgba(100,116,139,0.15)'}; color:${v.status === 'ACTIVA' ? '#34d399' : '#94a3b8'}; font-size:0.68rem;">${v.status || 'ACTIVA'}</span>
                </div>
                <span style="font-size:0.78rem; color:var(--color-accent); font-weight:600;">🏢 ${v.department || 'General'} · ⏱️ ${v.shift || 'Tiempo Completo'}</span>
                <p style="font-size:0.8rem; color:var(--color-text-secondary); margin:8px 0; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">${v.description || 'Sin descripción'}</p>
                ${v.salary ? `<span style="font-size:0.78rem; font-weight:700; color:#34d399;">💵 Salario: ${v.salary}</span>` : ''}
              </div>

              <div style="display:flex; gap:6px; margin-top:12px; border-top:1px solid var(--color-border); padding-top:10px;">
                <button class="btn btn-secondary btn-xs btn-edit-vacancy" data-id="${v.id}" style="flex:1;">✏️ Editar</button>
                <button class="btn btn-danger btn-xs btn-delete-vacancy" data-id="${v.id}">🗑️</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  bindVacanciesTabEvents(container) {
    container.querySelector('#btn-create-vacancy')?.addEventListener('click', () => this.openVacancyModal());

    container.querySelectorAll('.btn-edit-vacancy').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const vac = this.state.vacancies.find(v => v.id === id);
        if (vac) this.openVacancyModal(vac);
      });
    });

    container.querySelectorAll('.btn-delete-vacancy').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!confirm('¿Eliminar esta vacante?')) return;
        await FirestoreService.removePath(`${this.companyId}/hr_vacancies/${id}`);
        NotificationService.success('Vacante eliminada.');
      });
    });
  }

  openVacancyModal(vac = null) {
    const isEdit = !!vac;
    const formHTML = `
      <form id="form-vacancy" style="display:flex; flex-direction:column; gap:12px;">
        <div>
          <label class="form-label">Nombre / Título de la Vacante</label>
          <input type="text" id="vac-title" class="input input-md" value="${isEdit ? vac.title : ''}" required placeholder="Ej. Cajero de Turno Nocturno" />
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label class="form-label">Área / Departamento</label>
            <input type="text" id="vac-department" class="input input-md" value="${isEdit ? (vac.department || '') : ''}" placeholder="Ej. Operaciones, Ventas" />
          </div>
          <div>
            <label class="form-label">Jornada Laboral</label>
            <select id="vac-shift" class="input input-md" style="background:var(--color-bg-secondary); border:1px solid var(--color-border); color:var(--color-text-primary);">
              <option value="TIEMPO_COMPLETO" ${isEdit && vac.shift === 'TIEMPO_COMPLETO' ? 'selected' : ''}>Tiempo Completo</option>
              <option value="MEDIO_TIEMPO" ${isEdit && vac.shift === 'MEDIO_TIEMPO' ? 'selected' : ''}>Medio Tiempo</option>
              <option value="FINES_DE_SEMANA" ${isEdit && vac.shift === 'FINES_DE_SEMANA' ? 'selected' : ''}>Fines de Semana</option>
              <option value="NOCTURNO" ${isEdit && vac.shift === 'NOCTURNO' ? 'selected' : ''}>Nocturno</option>
            </select>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label class="form-label">Salario (opcional)</label>
            <input type="text" id="vac-salary" class="input input-md" value="${isEdit ? (vac.salary || '') : ''}" placeholder="Ej. C$ 10,000 / A convenir" />
          </div>
          <div>
            <label class="form-label">Estado de la Vacante</label>
            <select id="vac-status" class="input input-md" style="background:var(--color-bg-secondary); border:1px solid var(--color-border); color:var(--color-text-primary);">
              <option value="ACTIVA" ${!isEdit || vac.status === 'ACTIVA' ? 'selected' : ''}>ACTIVA (Publicada)</option>
              <option value="INACTIVA" ${isEdit && vac.status === 'INACTIVA' ? 'selected' : ''}>INACTIVA (Oculta)</option>
            </select>
          </div>
        </div>
        <div>
          <label class="form-label">Descripción y Requisitos del Puesto</label>
          <textarea id="vac-description" class="input input-md" rows="4" style="resize:vertical;" placeholder="Describe las responsabilidades, funciones y requisitos...">${isEdit ? (vac.description || '') : ''}</textarea>
        </div>
      </form>
    `;

    const modal = new Modal({
      title: isEdit ? 'Editar Vacante' : 'Crear Nueva Vacante de Empleo',
      bodyHTML: formHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="modal-cancel-vac">Cancelar</button>
        <button class="btn btn-primary btn-sm" id="modal-save-vac" style="font-weight:700;">${isEdit ? 'Guardar Cambios' : 'Publicar Vacante'}</button>
      `,
      size: 'md'
    });

    document.body.appendChild(modal.mount());
    modal.$('#modal-cancel-vac')?.addEventListener('click', () => modal.close());

    modal.$('#modal-save-vac')?.addEventListener('click', async () => {
      const title = modal.$('#vac-title')?.value.trim();
      if (!title) return;

      const payload = {
        id: isEdit ? vac.id : `vac_${Date.now()}`,
        title,
        department: modal.$('#vac-department')?.value.trim() || 'General',
        shift: modal.$('#vac-shift')?.value || 'TIEMPO_COMPLETO',
        salary: modal.$('#vac-salary')?.value.trim() || '',
        status: modal.$('#vac-status')?.value || 'ACTIVA',
        description: modal.$('#vac-description')?.value.trim() || '',
        createdAt: isEdit ? vac.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await set(ref(db, `${this.companyId}/hr_vacancies/${payload.id}`), payload);
      NotificationService.success(isEdit ? 'Vacante actualizada.' : 'Vacante publicada exitosamente.');
      modal.close();
    });
  }

  // ─── TAB 4: PAGE EDITOR (EDITOR VISUAL WEB) ──────────────────────────────────

  renderPageEditorTabHTML() {
    const p = this.state.pageConfig || {};

    return `
      <div style="max-width:840px; margin:0 auto; display:flex; flex-direction:column; gap:20px;">
        <div class="card p-5">
          <h3 style="font-size:1.1rem; font-weight:700; margin:0 0 6px; color:var(--color-text-primary);">🎨 Editor Visual de la Página de Reclutamiento</h3>
          <p style="font-size:0.8rem; color:var(--color-text-secondary); margin:0;">Personaliza la apariencia, eslogan, cultura y secciones visibles de tu portal de empleo público sin necesidad de programar.</p>
        </div>

        <form id="form-hr-page-editor" class="card p-5" style="display:flex; flex-direction:column; gap:16px;">
          <h4 style="font-size:0.95rem; font-weight:700; color:var(--color-accent); margin:0; border-bottom:1px solid var(--color-border); padding-bottom:8px;">1. Encabezado y Presentación</h4>
          
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div>
              <label class="form-label">Eslogan / Frase Principal</label>
              <input type="text" id="pe-slogan" class="input input-md" value="${p.slogan || '¡Únete a nuestro equipo de trabajo!'}" placeholder="Ej. Construye tu futuro con nosotros" />
            </div>
            <div>
              <label class="form-label">Texto de Bienvenida</label>
              <input type="text" id="pe-welcome" class="input input-md" value="${p.welcomeText || 'Buscamos talento para crecer juntos.'}" />
            </div>
          </div>

          <h4 style="font-size:0.95rem; font-weight:700; color:var(--color-accent); margin:12px 0 0; border-bottom:1px solid var(--color-border); padding-bottom:8px;">2. Cultura y Beneficios de la Empresa</h4>
          
          <div>
            <label class="form-label">Historia / Quiénes Somos</label>
            <textarea id="pe-story" class="input input-md" rows="3" style="resize:vertical;" placeholder="Describe brevemente la trayectoria de la empresa...">${p.story || ''}</textarea>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div>
              <label class="form-label">Misión</label>
              <textarea id="pe-mission" class="input input-md" rows="2" style="resize:vertical;">${p.mission || ''}</textarea>
            </div>
            <div>
              <label class="form-label">Visión</label>
              <textarea id="pe-vision" class="input input-md" rows="2" style="resize:vertical;">${p.vision || ''}</textarea>
            </div>
          </div>

          <div>
            <label class="form-label">Beneficios de Trabajar con Nosotros</label>
            <textarea id="pe-benefits" class="input input-md" rows="3" style="resize:vertical;" placeholder="Ej. Seguro médico, capacitaciones, excelente ambiente laboral...">${p.benefits || ''}</textarea>
          </div>

          <h4 style="font-size:0.95rem; font-weight:700; color:var(--color-accent); margin:12px 0 0; border-bottom:1px solid var(--color-border); padding-bottom:8px;">3. Secciones Visibles en la Página Pública</h4>
          
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
            ${[
              { id: 'secStory', label: '☑ Quiénes Somos / Historia' },
              { id: 'secBenefits', label: '☑ Beneficios de Empresa' },
              { id: 'secVacancies', label: '☑ Lista de Vacantes Activas' },
              { id: 'secForm', label: '☑ Formulario de Postulación' },
              { id: 'secFAQ', label: '☑ Preguntas Frecuentes' }
            ].map(sec => `
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.85rem;">
                <input type="checkbox" id="pe-${sec.id}" ${p[sec.id] !== false ? 'checked' : ''} style="accent-color:var(--color-accent);" />
                <span>${sec.label}</span>
              </label>
            `).join('')}
          </div>

          <div style="margin-top:16px; text-align:right;">
            <button type="submit" class="btn btn-primary btn-md" style="font-weight:700;">💾 Guardar Configuración Web</button>
          </div>
        </form>
      </div>
    `;
  }

  bindPageEditorTabEvents(container) {
    container.querySelector('#form-hr-page-editor')?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const payload = {
        slogan: container.querySelector('#pe-slogan')?.value.trim() || '',
        welcomeText: container.querySelector('#pe-welcome')?.value.trim() || '',
        story: container.querySelector('#pe-story')?.value.trim() || '',
        mission: container.querySelector('#pe-mission')?.value.trim() || '',
        vision: container.querySelector('#pe-vision')?.value.trim() || '',
        benefits: container.querySelector('#pe-benefits')?.value.trim() || '',
        secStory: container.querySelector('#pe-secStory')?.checked || false,
        secBenefits: container.querySelector('#pe-secBenefits')?.checked || false,
        secVacancies: container.querySelector('#pe-secVacancies')?.checked || false,
        secForm: container.querySelector('#pe-secForm')?.checked || false,
        secFAQ: container.querySelector('#pe-secFAQ')?.checked || false,
        updatedAt: new Date().toISOString()
      };

      await set(ref(db, `${this.companyId}/hr_page_config`), payload);
      this.state.pageConfig = payload;
      NotificationService.success('Página pública de reclutamiento actualizada correctamente.');
    });
  }

  // ─── TAB 5: QR CODE ──────────────────────────────────────────────────────────

  renderQRTabHTML() {
    const qrImgUrl = `https://quickchart.io/qr?text=${encodeURIComponent(this.publicApplyUrl)}&size=240&margin=1`;

    return `
      <div style="max-width:800px; margin:0 auto; display:flex; flex-direction:column; gap:20px;">
        <div class="card p-6 text-center" style="display:flex; flex-direction:column; align-items:center; gap:16px;">
          <h3 style="font-size:1.3rem; font-weight:800; color:var(--color-text-primary); margin:0;">
            📱 Código QR de Reclutamiento
          </h3>
          <p style="font-size:0.85rem; color:var(--color-text-secondary); max-width:540px; margin:0;">
            Escanea para acceder directamente a la página pública de empleo de <strong>${this.currentCompany.name || 'tu negocio'}</strong>.
          </p>

          <div style="background:#fff; padding:16px; border-radius:16px; border:2px solid var(--color-border); box-shadow:0 10px 25px rgba(0,0,0,0.2);">
            <img src="${qrImgUrl}" alt="QR Code RH" style="width:220px; height:220px; display:block;" />
          </div>

          <div style="width:100%; max-width:500px; background:var(--color-bg-tertiary); border:1px solid var(--color-border); padding:10px 14px; border-radius:10px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <span style="font-family:monospace; font-size:0.78rem; color:var(--color-accent); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">
              ${this.publicApplyUrl}
            </span>
            <button id="btn-copy-public-apply-url" class="btn btn-secondary btn-xs" style="font-weight:700; flex-shrink:0;">📋 Copiar Enlace</button>
          </div>

          <div style="display:flex; flex-wrap:wrap; gap:10px; justify-content:center; margin-top:8px;">
            <a href="${qrImgUrl}" download="QR_Reclutamiento_${this.companyId}.png" target="_blank" class="btn btn-primary btn-sm" style="font-weight:700; display:inline-flex; align-items:center; gap:6px;">
              📥 Descargar Imagen QR (PNG)
            </a>
            <button id="btn-print-hr-poster" class="btn btn-success btn-sm" style="font-weight:700; background:var(--color-success); border:none; color:#fff; display:inline-flex; align-items:center; gap:6px;">
              🖨️ Imprimir Cartel de Reclutamiento
            </button>
          </div>
        </div>
      </div>
    `;
  }

  bindQRTabEvents(container) {
    container.querySelector('#btn-copy-public-apply-url')?.addEventListener('click', () => {
      navigator.clipboard.writeText(this.publicApplyUrl).then(() => NotificationService.success('¡Enlace copiado!'));
    });

    container.querySelector('#btn-print-hr-poster')?.addEventListener('click', () => this.printHRPoster());
  }

  printHRPoster() {
    const compName = this.currentCompany.name || 'NUESTRO EQUIPO';
    const qrImgUrl = `https://quickchart.io/qr?text=${encodeURIComponent(this.publicApplyUrl)}&size=350&margin=1`;

    const printWin = window.open('', '_blank');
    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cartel de Reclutamiento - ${compName}</title>
        <style>
          @page { size: A4 portrait; margin: 0; }
          body { margin:0; padding:40px; font-family:sans-serif; text-align:center; background:#fff; color:#1e293b; display:flex; flex-direction:column; align-items:center; justify-content:space-between; height:90vh; }
          .title { font-size:42px; font-weight:900; color:#1e1b4b; text-transform:uppercase; margin:0; }
          .subtitle { font-size:24px; color:#4f46e5; font-weight:700; margin-top:8px; }
          .qr-box { border:4px solid #6366f1; border-radius:24px; padding:24px; display:inline-block; margin:20px 0; background:#fff; }
          .qr-img { width:320px; height:320px; display:block; }
          .instructions { font-size:22px; font-weight:700; color:#0f172a; margin-top:10px; }
        </style>
      </head>
      <body>
        <div>
          <div class="title">${compName}</div>
          <div class="subtitle">¡ESTAMOS CONTRATANDO PERSONAL!</div>
        </div>

        <div>
          <div class="instructions">📱 ESCANEA ESTE CÓDIGO QR PARA APLICAR</div>
          <p style="font-size:16px; color:#64748b;">Llena tu solicitud de empleo 100% digital desde tu teléfono celular</p>
          <div class="qr-box"><img src="${qrImgUrl}" class="qr-img" /></div>
        </div>

        <div style="font-size:14px; color:#64748b; border-top:2px solid #e2e8f0; padding-top:16px; width:100%;">
          Envía tus datos y expediente de forma segura · Sistema de Reclutamiento Digital
        </div>
        <script>window.onload = () => window.print();</script>
      </body>
      </html>
    `);
    printWin.document.close();
  }

  // ─── TAB 6: FORM BUILDER ─────────────────────────────────────────────────────

  renderFormBuilderTabHTML() {
    const { customFormFields } = this.state;

    return `
      <div style="max-width:800px; margin:0 auto; display:flex; flex-direction:column; gap:20px;">
        <div class="card p-5" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <h3 style="font-size:1.1rem; font-weight:700; margin:0; color:var(--color-text-primary);">📝 Constructor Dinámico de Formularios</h3>
            <p style="font-size:0.8rem; color:var(--color-text-secondary); margin:2px 0 0;">Agrega bloques de preguntas adicionales para personalizar tu formulario de empleo.</p>
          </div>
          <button id="btn-add-form-field" class="btn btn-primary btn-sm" style="font-weight:700;">+ Agregar Campo</button>
        </div>

        <div class="card p-5">
          ${customFormFields.length === 0 ? `
            <div class="text-center py-8 text-secondary">
              <span style="font-size:2rem; display:block; margin-bottom:8px;">🛠️</span>
              <p style="font-size:0.85rem;">No has agregado campos personalizados. Los candidatos responderán el formulario base.</p>
            </div>
          ` : `
            <div style="display:flex; flex-direction:column; gap:12px;">
              ${customFormFields.map((f, idx) => `
                <div style="display:flex; align-items:center; justify-content:space-between; background:var(--color-bg-tertiary); padding:12px 16px; border-radius:10px; border:1px solid var(--color-border);">
                  <div>
                    <span style="font-size:0.85rem; font-weight:700; color:var(--color-text-primary);">${idx + 1}. ${f.label} ${f.required ? '<span style="color:var(--color-danger);">*</span>' : ''}</span>
                    <span style="font-size:0.72rem; color:var(--color-text-tertiary); display:block;">Tipo: ${f.type}</span>
                  </div>
                  <button class="btn btn-danger btn-xs btn-del-field" data-id="${f.id}">🗑️</button>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;
  }

  bindFormBuilderTabEvents(container) {
    container.querySelector('#btn-add-form-field')?.addEventListener('click', () => {
      this.openAddFieldModal();
    });

    container.querySelectorAll('.btn-del-field').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        await FirestoreService.removePath(`${this.companyId}/hr_form_fields/${id}`);
        NotificationService.success('Campo eliminado.');
        await this.loadFormFields();
        this.renderActiveTabUI();
      });
    });
  }

  openAddFieldModal() {
    const formHTML = `
      <form id="form-add-field" style="display:flex; flex-direction:column; gap:12px;">
        <div>
          <label class="form-label">Etiqueta del Campo / Pregunta</label>
          <input type="text" id="ff-label" class="input input-md" placeholder="Ej. ¿Cuenta con vehículo propio?" required />
        </div>
        <div>
          <label class="form-label">Tipo de Campo</label>
          <select id="ff-type" class="input input-md" style="background:var(--color-bg-secondary); border:1px solid var(--color-border); color:var(--color-text-primary);">
            <option value="text">Texto Corto</option>
            <option value="textarea">Área de Texto (Largo)</option>
            <option value="yes_no">Sí / No</option>
            <option value="number">Número</option>
            <option value="date">Fecha</option>
          </select>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" id="ff-required" checked style="accent-color:var(--color-accent);" />
          <label for="ff-required" style="font-size:0.85rem;">Campo obligatorio</label>
        </div>
      </form>
    `;

    const modal = new Modal({
      title: 'Agregar Campo al Formulario',
      bodyHTML: formHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="modal-cancel-ff">Cancelar</button>
        <button class="btn btn-primary btn-sm" id="modal-save-ff" style="font-weight:700;">Guardar Campo</button>
      `,
      size: 'sm'
    });

    document.body.appendChild(modal.mount());
    modal.$('#modal-cancel-ff')?.addEventListener('click', () => modal.close());

    modal.$('#modal-save-ff')?.addEventListener('click', async () => {
      const label = modal.$('#ff-label')?.value.trim();
      const type = modal.$('#ff-type')?.value;
      const required = modal.$('#ff-required')?.checked || false;

      if (!label) return;

      const fid = `ff_${Date.now()}`;
      const order = this.state.customFormFields.length + 1;

      await set(ref(db, `${this.companyId}/hr_form_fields/${fid}`), {
        id: fid,
        label,
        type,
        required,
        order,
        createdAt: new Date().toISOString()
      });

      NotificationService.success('Campo agregado al formulario.');
      modal.close();
      await this.loadFormFields();
      this.renderActiveTabUI();
    });
  }

  // ─── TAB 7: DOCUMENTS ────────────────────────────────────────────────────────

  renderDocumentsTabHTML() {
    const { requestedDocuments } = this.state;

    return `
      <div style="max-width:800px; margin:0 auto; display:flex; flex-direction:column; gap:20px;">
        <div class="card p-5">
          <h3 style="font-size:1.1rem; font-weight:700; margin:0 0 6px; color:var(--color-text-primary);">📄 Documentos Solicitados a Candidatos</h3>
          <p style="font-size:0.8rem; color:var(--color-text-secondary); margin:0;">Selecciona qué documentos deberán adjuntar las personas al postularse.</p>
        </div>

        <form id="form-hr-docs" class="card p-5" style="display:flex; flex-direction:column; gap:14px;">
          ${requestedDocuments.map((doc, idx) => `
            <div style="display:flex; align-items:center; justify-content:space-between; background:var(--color-bg-tertiary); padding:12px 16px; border-radius:10px; border:1px solid var(--color-border);">
              <span style="font-weight:600; font-size:0.88rem;">${doc.name}</span>
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.8rem;">
                <input type="checkbox" class="doc-req-cb" data-id="${doc.id}" ${doc.required ? 'checked' : ''} style="accent-color:var(--color-accent);" />
                <span>Obligatorio</span>
              </label>
            </div>
          `).join('')}

          <div style="margin-top:16px; text-align:right;">
            <button type="submit" class="btn btn-primary btn-md" style="font-weight:700;">💾 Guardar Lista de Documentos</button>
          </div>
        </form>
      </div>
    `;
  }

  bindDocumentsTabEvents(container) {
    container.querySelector('#form-hr-docs')?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const list = this.state.requestedDocuments.map(doc => {
        const cb = container.querySelector(`.doc-req-cb[data-id="${doc.id}"]`);
        return {
          ...doc,
          required: cb ? cb.checked : false
        };
      });

      const docsObj = {};
      list.forEach(d => { docsObj[d.id] = d; });

      await set(ref(db, `${this.companyId}/hr_requested_documents`), docsObj);
      this.state.requestedDocuments = list;
      NotificationService.success('Lista de documentos requeridos actualizada.');
    });
  }

  // ─── DOSSIER & HIRE MODALS ───────────────────────────────────────────────────

  openCandidateDossierModal(cand) {
    this.state.selectedCandidate = cand;
    const stConfig = CANDIDATE_STATUSES[cand.status] || CANDIDATE_STATUSES.NUEVO;

    const docsHTML = (cand.documents && Object.keys(cand.documents).length > 0)
      ? Object.entries(cand.documents).map(([docId, imgId]) => {
          const docDef = this.state.requestedDocuments.find(d => d.id === docId);
          const docName = docDef ? docDef.name : docId;
          return `
            <div style="background:var(--color-bg-primary); padding:10px; border-radius:8px; border:1px solid var(--color-border); display:flex; flex-direction:column; gap:6px;">
              <span style="font-size:0.78rem; font-weight:600; color:var(--color-text-secondary);">${docName}</span>
              ${ImageDisplay.renderTag(imgId, '', 'width:100%; max-height:120px; object-fit:cover; border-radius:6px; border:1px solid var(--color-border);', cand.companyId)}
            </div>
          `;
        }).join('')
      : '<span style="font-size:0.8rem; color:var(--color-text-tertiary);">No hay documentos adjuntos.</span>';

    const experiencesHTML = (cand.experiences && cand.experiences.length > 0)
      ? cand.experiences.map(e => `
          <div style="font-size:0.8rem; padding:8px 0; border-bottom:1px solid var(--color-border);">
            <strong style="color:var(--color-text-primary);">${e.position || 'Puesto'}</strong> en <span>${e.company || 'Empresa'}</span>
            ${e.period ? `<span style="color:var(--color-text-tertiary); font-size:0.75rem; display:block;">⏱️ ${e.period}</span>` : ''}
            ${e.desc ? `<p style="font-size:0.78rem; color:var(--color-text-secondary); margin:4px 0 0;">${e.desc}</p>` : ''}
          </div>
        `).join('')
      : '<span style="font-size:0.8rem; color:var(--color-text-tertiary);">Sin experiencia agregada.</span>';

    const educationHTML = (cand.education && cand.education.length > 0)
      ? cand.education.map(e => `
          <div style="font-size:0.8rem; padding:8px 0; border-bottom:1px solid var(--color-border);">
            <strong style="color:var(--color-text-primary);">${e.degree || 'Estudio'}</strong>
            <span style="color:var(--color-text-secondary); display:block; font-size:0.78rem;">🏫 ${e.institution || 'Institución'}</span>
          </div>
        `).join('')
      : '<span style="font-size:0.8rem; color:var(--color-text-tertiary);">Sin educación agregada.</span>';

    const customAnsHTML = (cand.customAnswers && Object.keys(cand.customAnswers).length > 0)
      ? Object.entries(cand.customAnswers).map(([fid, val]) => {
          const fDef = this.state.customFormFields.find(f => f.id === fid);
          const label = fDef ? fDef.label : fid;
          return `<div style="font-size:0.8rem;"><strong>${label}:</strong> <span style="color:var(--color-accent);">${val || 'N/R'}</span></div>`;
        }).join('')
      : '<span style="font-size:0.8rem; color:var(--color-text-tertiary);">Sin preguntas adicionales.</span>';

    const bodyHTML = `
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div style="display:flex; gap:16px; align-items:center; background:var(--color-bg-tertiary); padding:16px; border-radius:12px; border:1px solid var(--color-border);">
          ${ImageDisplay.renderTag(cand.photoImageId, `https://ui-avatars.com/api/?name=${encodeURIComponent(cand.displayName || 'C')}&background=6366f1&color=fff&size=70`, 'width:70px;height:70px;border-radius:12px;object-fit:cover;border:2px solid var(--color-border);', cand.companyId)}
          <div style="flex:1;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <h3 style="font-size:1.1rem; font-weight:800; margin:0; color:var(--color-text-primary);">${cand.displayName}</h3>
              <span class="badge" style="background:${stConfig.bg}; color:${stConfig.color}; font-size:0.75rem; font-weight:700; padding:4px 10px; border-radius:12px;">${stConfig.label}</span>
            </div>
            <p style="font-size:0.85rem; font-weight:600; color:var(--color-accent); margin:2px 0 4px;">💼 ${cand.position || 'Sin puesto'}</p>
            <p style="font-size:0.75rem; color:var(--color-text-tertiary); margin:0;">
              🆔 ${cand.expCode || 'EXP-RH'} · 🎂 Fecha Nac: ${cand.birthDate || 'N/D'} (${cand.age ? cand.age + ' años' : ''})
            </p>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:12px; background:var(--color-bg-secondary); padding:12px; border-radius:10px; border:1px solid var(--color-border);">
          <label style="font-weight:600; font-size:0.85rem;">Estado del Proceso:</label>
          <select id="cand-modal-status-select" class="input input-sm" style="flex:1; background:var(--color-bg-primary); color:var(--color-text-primary); border:1px solid var(--color-border); border-radius:6px; font-weight:600;">
            ${Object.keys(CANDIDATE_STATUSES).map(st => `
              <option value="${st}" ${cand.status === st ? 'selected' : ''}>${CANDIDATE_STATUSES[st].label}</option>
            `).join('')}
          </select>
          <button id="cand-modal-btn-update-status" class="btn btn-primary btn-xs" style="font-weight:700;">Actualizar Estado</button>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div style="background:var(--color-bg-tertiary); padding:14px; border-radius:10px; border:1px solid var(--color-border);">
              <h5 style="font-size:0.85rem; font-weight:700; color:var(--color-accent); margin:0 0 8px;">📱 Contacto</h5>
              <div style="font-size:0.8rem; display:flex; flex-direction:column; gap:4px;">
                <span>📧 <strong>Email:</strong> ${cand.email || 'N/D'}</span>
                <span>💬 <strong>WhatsApp:</strong> ${cand.whatsapp || 'N/D'}</span>
                <span>📞 <strong>Tel. Alt:</strong> ${cand.phoneAlt || 'N/D'}</span>
                <span>🚨 <strong>Emergencia:</strong> ${cand.emergencyName || 'N/D'} (${cand.emergencyPhone || ''})</span>
              </div>
            </div>

            <div style="background:var(--color-bg-tertiary); padding:14px; border-radius:10px; border:1px solid var(--color-border);">
              <h5 style="font-size:0.85rem; font-weight:700; color:var(--color-accent); margin:0 0 8px;">🆔 Datos Personales</h5>
              <div style="font-size:0.8rem; display:flex; flex-direction:column; gap:4px;">
                <span>🪪 <strong>Cédula:</strong> ${cand.idNumber || 'N/D'}</span>
                <span>🇳🇮 <strong>Nacionalidad:</strong> ${cand.nationality || 'Nicaragüense'}</span>
                <span>📍 <strong>Ubicación:</strong> ${cand.municipality || ''}, ${cand.department || ''}, ${cand.country || ''}</span>
                <span>🏠 <strong>Dirección:</strong> ${cand.address || 'N/D'}</span>
              </div>
            </div>

            <div style="background:var(--color-bg-tertiary); padding:14px; border-radius:10px; border:1px solid var(--color-border);">
              <h5 style="font-size:0.85rem; font-weight:700; color:var(--color-accent); margin:0 0 8px;">🛠️ Experiencia Laboral</h5>
              ${experiencesHTML}
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:12px;">
            <div style="background:var(--color-bg-tertiary); padding:14px; border-radius:10px; border:1px solid var(--color-border);">
              <h5 style="font-size:0.85rem; font-weight:700; color:var(--color-accent); margin:0 0 8px;">💼 Aspiración Laboral</h5>
              <div style="font-size:0.8rem; display:flex; flex-direction:column; gap:4px;">
                <span>⏱️ <strong>Jornada:</strong> ${cand.shift || 'Tiempo Completo'}</span>
                <span>💵 <strong>Salario:</strong> ${cand.desiredSalary || 'A convenir'}</span>
                <span>📅 <strong>Disponible:</strong> ${cand.startDate || 'De inmediato'}</span>
              </div>
            </div>

            <div style="background:var(--color-bg-tertiary); padding:14px; border-radius:10px; border:1px solid var(--color-border);">
              <h5 style="font-size:0.85rem; font-weight:700; color:var(--color-accent); margin:0 0 8px;">🎓 Educación</h5>
              ${educationHTML}
            </div>

            <div style="background:var(--color-bg-tertiary); padding:14px; border-radius:10px; border:1px solid var(--color-border);">
              <h5 style="font-size:0.85rem; font-weight:700; color:var(--color-accent); margin:0 0 8px;">⚡ Habilidades</h5>
              <div style="display:flex; flex-wrap:wrap; gap:4px;">
                ${(cand.skills || []).length > 0 ? cand.skills.map(s => `
                  <span style="font-size:0.72rem; background:var(--color-bg-secondary); color:var(--color-text-primary); padding:2px 8px; border-radius:4px;">${s}</span>
                `).join('') : '<span style="font-size:0.78rem; color:var(--color-text-tertiary);">Sin habilidades.</span>'}
              </div>
            </div>

            <div style="background:var(--color-bg-tertiary); padding:14px; border-radius:10px; border:1px solid var(--color-border);">
              <h5 style="font-size:0.85rem; font-weight:700; color:var(--color-accent); margin:0 0 8px;">❓ Respuestas Adicionales</h5>
              <div style="display:flex; flex-direction:column; gap:4px;">
                ${customAnsHTML}
              </div>
            </div>
          </div>
        </div>

        <div style="background:var(--color-bg-tertiary); padding:14px; border-radius:10px; border:1px solid var(--color-border);">
          <h5 style="font-size:0.85rem; font-weight:700; color:var(--color-accent); margin:0 0 8px;">📄 Documentación Adjunta</h5>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px;">
            ${docsHTML}
          </div>
        </div>

        <div style="display:flex; gap:10px; background:var(--color-bg-secondary); padding:12px; border-radius:10px;">
          <button id="modal-btn-hire-now" class="btn btn-success btn-sm" style="flex:1; font-weight:700; background:var(--color-success); color:#fff; border:none;">💼 CONTRATAR CANDIDATO</button>
          <a href="https://wa.me/${(cand.whatsapp || '').replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${cand.firstName}, te saludamos de ${this.currentCompany.name || 'nuestra empresa'}. Quisiéramos agendar una entrevista contigo para el puesto de ${cand.position}.`)}" target="_blank" class="btn btn-sm" style="background:#25D366; color:#fff; font-weight:700; border:none; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">💬 WhatsApp</a>
          <button id="modal-btn-delete-cand" class="btn btn-danger btn-sm" style="font-weight:600;">🗑️ Eliminar</button>
        </div>
      </div>
    `;

    this.modalInstance = new Modal({
      title: `Expediente: ${cand.displayName}`,
      bodyHTML: bodyHTML,
      footerHTML: `<button class="btn btn-secondary btn-sm" id="modal-close-dossier">Cerrar Expediente</button>`,
      size: 'lg'
    });

    document.body.appendChild(this.modalInstance.mount());

    this.modalInstance.$('#modal-close-dossier')?.addEventListener('click', () => this.modalInstance.close());

    this.modalInstance.$('#cand-modal-btn-update-status')?.addEventListener('click', async () => {
      const newStatus = this.modalInstance.$('#cand-modal-status-select').value;
      await this.updateCandidateStatus(cand.id, newStatus);
      this.modalInstance.close();
    });

    this.modalInstance.$('#modal-btn-hire-now')?.addEventListener('click', () => {
      this.modalInstance.close();
      this.openHireCandidateModal(cand);
    });

    this.modalInstance.$('#modal-btn-delete-cand')?.addEventListener('click', async () => {
      if (!confirm(`¿Eliminar el expediente de ${cand.displayName}?`)) return;
      await FirestoreService.removePath(`${this.companyId}/hr_candidates/${cand.id}`);
      NotificationService.success('Expediente eliminado.');
      this.modalInstance.close();
    });
  }

  async updateCandidateStatus(candId, newStatus) {
    try {
      await update(ref(db, `${this.companyId}/hr_candidates/${candId}`), {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      NotificationService.success(`Estado actualizado a "${CANDIDATE_STATUSES[newStatus]?.label || newStatus}".`);
    } catch (e) {
      NotificationService.error('Error al actualizar estado.');
    }
  }

  openHireCandidateModal(cand) {
    const formHTML = `
      <form id="hr-hire-form" style="display:flex; flex-direction:column; gap:12px;">
        <div style="background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.3); color:#34d399; padding:10px 14px; border-radius:8px; font-size:0.82rem;">
          🎉 Se creará automáticamente la cuenta de empleado para <strong>${cand.displayName}</strong>.
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label class="form-label">Nombre Completo</label>
            <input type="text" id="hire-name" class="input input-md" value="${cand.displayName}" required />
          </div>
          <div>
            <label class="form-label">Correo Electrónico</label>
            <input type="email" id="hire-email" class="input input-md" value="${cand.email}" required />
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label class="form-label">Rol en el Sistema</label>
            <select id="hire-role" class="input input-md" style="background:var(--color-bg-secondary); border:1px solid var(--color-border); color:var(--color-text-primary);">
              <option value="CASHIER">Cajero</option>
              <option value="WAITER">Mesero / Atendedor</option>
              <option value="KITCHEN">Cocinero / Chef</option>
              <option value="MANAGER">Gerente de Área</option>
            </select>
          </div>
          <div>
            <label class="form-label">Puesto / Cargo Oficial</label>
            <input type="text" id="hire-custom-role" class="input input-md" value="${cand.position}" required />
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label class="form-label">Teléfono de Contacto</label>
            <input type="text" id="hire-phone" class="input input-md" value="${cand.whatsapp || cand.phoneAlt || ''}" />
          </div>
          <div>
            <label class="form-label">Contraseña Inicial</label>
            <input type="text" id="hire-password" class="input input-md" value="Pass1234!" required />
          </div>
        </div>
      </form>
    `;

    const modal = new Modal({
      title: `Contratar Candidato: ${cand.displayName}`,
      bodyHTML: formHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="modal-cancel-hire">Cancelar</button>
        <button class="btn btn-success btn-sm" id="modal-confirm-hire" style="font-weight:700; background:var(--color-success); color:#fff; border:none;">✅ Confirmar Contratación</button>
      `,
      size: 'md'
    });

    document.body.appendChild(modal.mount());
    modal.$('#modal-cancel-hire')?.addEventListener('click', () => modal.close());

    modal.$('#modal-confirm-hire')?.addEventListener('click', async () => {
      const name = modal.$('#hire-name')?.value.trim();
      const email = modal.$('#hire-email')?.value.trim();
      const role = modal.$('#hire-role')?.value;
      const customRole = modal.$('#hire-custom-role')?.value.trim();
      const phone = modal.$('#hire-phone')?.value.trim();
      const password = modal.$('#hire-password')?.value.trim();

      if (!name || !email || !password) return;

      try {
        const newUid = `emp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const employeePayload = {
          uid: newUid,
          companyId: this.companyId,
          branchId: 'main',
          displayName: name,
          email,
          role,
          customRole,
          phone,
          status: 'ACTIVE',
          createdAt: Date.now(),
          createdAtLocal: TimeService.timestamp(),
          imageId: cand.photoImageId || null,
          candidateId: cand.id
        };

        await set(ref(db, `${this.companyId}/employees/${newUid}`), employeePayload);
        await set(ref(db, `users/${newUid}`), employeePayload);
        await update(ref(db, `${this.companyId}/hr_candidates/${cand.id}`), {
          status: 'CONTRATADO',
          hiredAt: new Date().toISOString(),
          employeeUid: newUid
        });

        NotificationService.success(`🎉 ¡${name} ha sido contratado(a) como nuevo empleado!`);
        modal.close();
      } catch (err) {
        NotificationService.error('Error al registrar contratación.');
      }
    });
  }
}
