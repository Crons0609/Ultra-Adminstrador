import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { GlobalStore } from '../../../core/state.js';
import { NotificationService } from '../../../services/notification.service.js';
import { TimeService } from '../../../services/time.service.js';
import { StorageService } from '../../../services/storage.service.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { Modal } from '../../../components/ui/modal.js';

export class ClientAssignmentsView extends Component {
  constructor(params = {}) {
    super(params);

    const { currentUser } = GlobalStore.getState();
    this.currentUser = currentUser || {};
    this.companyId = this.currentUser.companyId || '';
    this.uid = this.currentUser.uid || '';

    this.state = {
      activeTab: 'active', // 'active' | 'history' | 'register-client' | 'gps-location'
      assignments: [],
      authRequests: [],
      pendingClients: [], 
      pendingLocations: [], // Location requests sent by this employee
      clientsCatalog: [], // All clients loaded to support search lookup
      filters: {
        searchQuery: '',
        status: 'ALL',
        priority: 'ALL',
        dateAssigned: '',
        dateScheduled: ''
      },
      newClientForm: {
        displayName: '',
        companyName: '',
        phone: '',
        phoneSecondary: '',
        email: '',
        address: '',
        city: '',
        department: '',
        reference: '',
        observations: '',
        serviceType: '',
        problemDescription: '',
        installedEquipment: '',
        priority: 'Media',
        gps: null
      },
      confirmingNewClient: false,
      
      // GPS Location tab state
      gpsSelectedClientId: '',
      gpsCapturedData: null, // { lat, lng, accuracy, capturedAt }
      gpsObservations: '',
      confirmingGpsLocation: false
    };

    this.layout = new PageLayout({
      title: 'Clientes Asignados',
      subtitle: 'Revisa tu agenda de servicios, consulta especificaciones y reporta progresos.',
      actionHTML: `
        <span class="badge" style="font-size: 0.72rem; padding: 4px 10px; border: 1px solid var(--color-border); background: rgba(59, 130, 246, 0.1); color: var(--color-info); display: flex; align-items: center; gap: 6px;">
          <span style="width: 8px; height: 8px; background: var(--color-info); border-radius: 50%; display: inline-block; animation: pulse 2s infinite;"></span>
          Técnico: ${this.currentUser.displayName || 'Personal'}
        </span>
      `,
      contentHTML: `
        <style>
          .assign-tabs {
            display: flex;
            gap: var(--space-2);
            border-bottom: 1px solid var(--color-border);
            margin-bottom: var(--space-5);
            overflow-x: auto;
          }
          .assign-tab-btn {
            background: transparent;
            border: none;
            border-bottom: 2px solid transparent;
            color: var(--color-text-secondary);
            padding: var(--space-3) var(--space-4);
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            transition: all var(--transition-fast);
            display: flex;
            align-items: center;
            gap: 8px;
            white-space: nowrap;
          }
          .assign-tab-btn:hover {
            color: var(--color-text-primary);
          }
          .assign-tab-btn.active {
            color: var(--color-accent);
            border-bottom-color: var(--color-accent);
          }
          .job-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: var(--space-4);
          }
          @media (min-width: 768px) {
            .job-grid { grid-template-columns: 1fr 1fr; }
          }
          .job-card {
            background: var(--color-bg-secondary);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-lg);
            padding: var(--space-5);
            display: flex;
            flex-direction: column;
            gap: 12px;
            position: relative;
            transition: all var(--transition-normal);
          }
          .job-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
            border-color: rgba(255, 255, 255, 0.08);
          }
          .job-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          .job-client-name {
            font-size: 1.1rem;
            font-weight: 700;
            color: var(--color-text-primary);
          }
          .job-desc {
            font-size: 0.82rem;
            color: var(--color-text-secondary);
            background: rgba(255, 255, 255, 0.02);
            border-radius: var(--radius-md);
            padding: 10px 12px;
            border: 1px dashed rgba(255, 255, 255, 0.05);
            min-height: 50px;
          }
          .job-meta-item {
            display: flex;
            font-size: 0.78rem;
            color: var(--color-text-secondary);
            gap: 8px;
            align-items: center;
          }
          .job-meta-icon {
            font-size: 1rem;
            width: 18px;
            text-align: center;
          }
          .contact-bar {
            display: flex;
            gap: 6px;
            margin-top: var(--space-2);
          }
          .contact-btn {
            flex: 1;
            text-align: center;
            padding: 6px 0;
            font-size: 0.72rem;
            font-weight: 700;
            border-radius: var(--radius-md);
            text-decoration: none;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            transition: opacity 0.2s;
          }
          .contact-btn:hover {
            opacity: 0.85;
          }
          .form-section-title {
            font-size: 0.95rem;
            font-weight: 700;
            color: var(--color-accent);
            margin: var(--space-4) 0 var(--space-2);
            border-bottom: 1px solid rgba(255,255,255,0.05);
            padding-bottom: 2px;
          }
        </style>

        <div class="assign-tabs">
          <button class="assign-tab-btn ${this.state.activeTab === 'active' ? 'active' : ''}" data-tab="active">⚡ Trabajos Activos</button>
          <button class="assign-tab-btn ${this.state.activeTab === 'history' ? 'active' : ''}" data-tab="history">📚 Historial de Trabajos</button>
          <button class="assign-tab-btn ${this.state.activeTab === 'register-client' ? 'active' : ''}" data-tab="register-client">➕ Registrar Cliente</button>
          <button class="assign-tab-btn ${this.state.activeTab === 'gps-location' ? 'active' : ''}" data-tab="gps-location">📍 Registrar Ubicación GPS</button>
        </div>

        <div id="waiter-filter-bar" style="margin-bottom: 20px;"></div>
        <div id="jobs-container" class="job-grid animate-fade-in"></div>
      `
    });

    this.dbUnsubscribe = null;
    this.authRequestsUnsubscribe = null;
    this.pendingClientsUnsubscribe = null;
    this.pendingLocationsUnsubscribe = null;
    this.timerInterval = null;
    this.maps = {};
  }

  async mount() {
    const element = this.layout.mount();
    this.container = element.querySelector('#jobs-container');
    this.filterBar = element.querySelector('#waiter-filter-bar');

    this.setupTabListeners(element);
    this.bindActionEvents(element);

    await this.loadMyAssignments();
    this.subscribeToAssignments();
    
    this.startCountdownTicker();

    return element;
  }

  setupTabListeners(element) {
    element.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('.assign-tab-btn');
      if (tabBtn) {
        const tab = tabBtn.getAttribute('data-tab');
        element.querySelectorAll('.assign-tab-btn').forEach(btn => btn.classList.remove('active'));
        tabBtn.classList.add('active');
        this.state.activeTab = tab;
        
        // Reset filters
        this.state.filters = {
          searchQuery: '',
          status: 'ALL',
          priority: 'ALL',
          dateAssigned: '',
          dateScheduled: ''
        };
        this.state.confirmingNewClient = false;
        this.state.confirmingGpsLocation = false;
        this.state.gpsSelectedClientId = '';
        this.state.gpsCapturedData = null;
        
        this.renderFilters();
        this.renderAssignments();
      }
    });
  }

  async loadMyAssignments() {
    try {
      const { db } = await import('../../../config/firebase.config.js');
      const { ref, get } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js');

      if (!db || !this.companyId) return;

      // Load assignments
      const snapshot = await get(ref(db, `${this.companyId}/assignments`));
      if (snapshot.exists()) {
        const data = snapshot.val();
        this.state.assignments = Object.keys(data)
          .map(k => ({ id: k, ...data[k] }))
          .filter(a => a.employeeId === this.uid)
          .sort((a, b) => b.assignedAt - a.assignedAt);
      }

      // Load auth requests
      const reqSnapshot = await get(ref(db, `${this.companyId}/auth_requests`));
      if (reqSnapshot.exists()) {
        const data = reqSnapshot.val();
        this.state.authRequests = Object.keys(data)
          .map(k => ({ id: k, ...data[k] }))
          .filter(r => r.employeeId === this.uid);
      }

      // Load pending clients
      const pcSnapshot = await get(ref(db, `${this.companyId}/pending_clients`));
      if (pcSnapshot.exists()) {
        const data = pcSnapshot.val();
        this.state.pendingClients = Object.keys(data)
          .map(k => ({ id: k, ...data[k] }))
          .filter(r => r.employeeId === this.uid)
          .sort((a, b) => b.createdAt - a.createdAt);
      }

      // Load clients catalog (all clients to support search lookup in GPS tab)
      const clientsSnapshot = await get(ref(db, `${this.companyId}/clients`));
      if (clientsSnapshot.exists()) {
        const data = clientsSnapshot.val();
        this.state.clientsCatalog = Object.keys(data).map(k => ({ id: k, ...data[k] }));
      }

      // Load pending locations
      const plSnapshot = await get(ref(db, `${this.companyId}/pending_locations`));
      if (plSnapshot.exists()) {
        const data = plSnapshot.val();
        this.state.pendingLocations = Object.keys(data)
          .map(k => ({ id: k, ...data[k] }))
          .filter(r => r.employeeId === this.uid)
          .sort((a, b) => b.capturedAt - a.capturedAt);
      }

      this.renderFilters();
      this.renderAssignments();
    } catch (e) {
      console.error(e);
    }
  }

  subscribeToAssignments() {
    import('../../../config/firebase.config.js').then(({ db }) => {
      import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js').then(({ ref, onValue }) => {
        if (!db || !this.companyId) return;

        this.dbUnsubscribe = onValue(ref(db, `${this.companyId}/assignments`), (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.val();
            this.state.assignments = Object.keys(data)
              .map(k => ({ id: k, ...data[k] }))
              .filter(a => a.employeeId === this.uid)
              .sort((a, b) => b.assignedAt - a.assignedAt);
          } else {
            this.state.assignments = [];
          }
          if (this.state.activeTab === 'active' || this.state.activeTab === 'history') {
            this.renderAssignments();
          }
        });

        this.authRequestsUnsubscribe = onValue(ref(db, `${this.companyId}/auth_requests`), (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.val();
            this.state.authRequests = Object.keys(data)
              .map(k => ({ id: k, ...data[k] }))
              .filter(r => r.employeeId === this.uid);
          } else {
            this.state.authRequests = [];
          }
          if (this.state.activeTab === 'active' || this.state.activeTab === 'history') {
            this.renderAssignments();
          }
        });

        this.pendingClientsUnsubscribe = onValue(ref(db, `${this.companyId}/pending_clients`), (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.val();
            this.state.pendingClients = Object.keys(data)
              .map(k => ({ id: k, ...data[k] }))
              .filter(r => r.employeeId === this.uid)
              .sort((a, b) => b.createdAt - a.createdAt);
          } else {
            this.state.pendingClients = [];
          }
          if (this.state.activeTab === 'register-client') {
            this.renderAssignments();
          }
        });

        // Realtime listener for pending locations
        this.pendingLocationsUnsubscribe = onValue(ref(db, `${this.companyId}/pending_locations`), (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.val();
            this.state.pendingLocations = Object.keys(data)
              .map(k => ({ id: k, ...data[k] }))
              .filter(r => r.employeeId === this.uid)
              .sort((a, b) => b.capturedAt - a.capturedAt);
          } else {
            this.state.pendingLocations = [];
          }
          if (this.state.activeTab === 'gps-location') {
            this.renderAssignments();
          }
        });
      });
    });
  }

  renderFilters() {
    const f = this.state.filters;
    const isHistory = this.state.activeTab === 'history';
    const isRegister = this.state.activeTab === 'register-client';
    const isGps = this.state.activeTab === 'gps-location';

    if (isRegister || isGps) {
      this.filterBar.innerHTML = '';
      return;
    }

    const statusSelectHTML = isHistory ? `
      <select id="filt-status" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-primary);">
        <option value="ALL" ${f.status === 'ALL' ? 'selected' : ''}>Todos los Estados</option>
        <option value="Finalizado" ${f.status === 'Finalizado' ? 'selected' : ''}>Finalizados</option>
        <option value="Cancelado" ${f.status === 'Cancelado' ? 'selected' : ''}>Cancelados</option>
      </select>
    ` : `
      <select id="filt-status" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-primary);">
        <option value="ALL" ${f.status === 'ALL' ? 'selected' : ''}>Todos los Estados</option>
        <option value="Pendiente" ${f.status === 'Pendiente' ? 'selected' : ''}>Pendientes</option>
        <option value="En proceso" ${f.status === 'En proceso' ? 'selected' : ''}>En Proceso</option>
      </select>
    `;

    this.filterBar.innerHTML = `
      <div style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr; gap:10px; flex-wrap:wrap;">
        <input type="text" id="filt-search" class="input input-md" placeholder="Buscar cliente o servicio..." value="${f.searchQuery}" />
        ${statusSelectHTML}
        <select id="filt-priority" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-primary);">
          <option value="ALL" ${f.priority === 'ALL' ? 'selected' : ''}>Todas las Prioridades</option>
          <option value="Baja" ${f.priority === 'Baja' ? 'selected' : ''}>🟢 Baja</option>
          <option value="Media" ${f.priority === 'Media' ? 'selected' : ''}>🟡 Media</option>
          <option value="Alta" ${f.priority === 'Alta' ? 'selected' : ''}>🟠 Alta</option>
          <option value="Urgente" ${f.priority === 'Urgente' ? 'selected' : ''}>🔴 Urgente</option>
        </select>
        <input type="date" id="filt-assigned" class="input input-md" style="font-size:0.75rem;" value="${f.dateAssigned}" title="Filtrar por fecha de asignación" />
        <input type="date" id="filt-scheduled" class="input input-md" style="font-size:0.75rem;" value="${f.dateScheduled}" title="Filtrar por fecha programada" />
      </div>
    `;

    // Bind filters
    const bindFilter = (id, stateKey) => {
      this.filterBar.querySelector(`#${id}`)?.addEventListener('input', (e) => {
        this.state.filters[stateKey] = e.target.value;
        this.renderAssignments();
      });
    };

    bindFilter('filt-search', 'searchQuery');
    bindFilter('filt-status', 'status');
    bindFilter('filt-priority', 'priority');
    bindFilter('filt-assigned', 'dateAssigned');
    bindFilter('filt-scheduled', 'dateScheduled');
  }

  renderAssignments() {
    if (!this.container) return;

    if (this.state.activeTab === 'register-client') {
      this.renderRegisterClientTab();
      return;
    }

    if (this.state.activeTab === 'gps-location') {
      this.renderGpsLocationTab();
      return;
    }

    const list = this.getFilteredAssignments();

    if (list.length === 0) {
      this.container.innerHTML = `
        <div class="card p-10 text-center text-secondary" style="grid-column: 1 / -1; max-width: 500px; margin: 30px auto;">
          <div style="font-size:3rem; margin-bottom:10px;">📭</div>
          <h4 class="font-bold">No se encontraron tareas</h4>
          <p class="text-xs mt-1">Prueba a limpiar los filtros o ajustar el término de búsqueda.</p>
        </div>
      `;
      return;
    }

    this.container.innerHTML = list.map(asg => {
      const prioColor = {
        Baja: 'var(--color-success)',
        Media: 'var(--color-warning)',
        Alta: '#ea580c',
        Urgente: 'var(--color-error)'
      }[asg.priority] || 'var(--color-text-secondary)';

      const statusBadge = {
        Pendiente: '<span class="badge" style="background:rgba(234, 179, 8, 0.1); color:var(--color-warning); font-size:0.7rem;">Pendiente</span>',
        'En proceso': '<span class="badge" style="background:rgba(59, 130, 246, 0.1); color:var(--color-info); font-size:0.7rem;">En Proceso</span>',
        Finalizado: '<span class="badge" style="background:rgba(34, 197, 94, 0.1); color:var(--color-success); font-size:0.7rem;">Finalizado</span>',
        Cancelado: '<span class="badge" style="background:rgba(239, 68, 68, 0.1); color:var(--color-error); font-size:0.7rem;">Cancelado</span>'
      }[asg.status] || `<span class="badge">${asg.status}</span>`;

      const scheduledStr = asg.scheduledDate 
        ? `📅 Programado: ${TimeService.formatDate(asg.scheduledDate)} a las ${asg.scheduledTime || '—'}`
        : '📅 Programado: Sin programar';

      const executionHTML = asg.completedAt && asg.status === 'Finalizado'
        ? `
          <div class="job-meta-item" style="color:var(--color-success); font-weight:700;">
            <span class="job-meta-icon">⏳</span>
            <span><strong>Duración de Ejecución:</strong> ${this.formatExecutionTime(asg.assignedAt, asg.completedAt)}</span>
          </div>
        `
        : '';

      const activeRequest = this.state.authRequests.find(r => r.clientId === asg.clientId && r.assignmentId === asg.id);
      let authModuleHTML = '';

      if (asg.status !== 'Finalizado' && asg.status !== 'Cancelado') {
        if (!activeRequest) {
          authModuleHTML = `
            <div style="background: rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:8px 12px; border-radius:6px; font-size:0.78rem; display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
              <span class="text-secondary">🔑 Acceso a Credenciales Sensibles</span>
              <button class="btn btn-secondary btn-xs btn-request-creds" data-client-id="${asg.clientId}" data-asg-id="${asg.id}">Solicitar</button>
            </div>
          `;
        } else if (activeRequest.status === 'Pendiente') {
          authModuleHTML = `
            <div style="background: rgba(234,179,8,0.05); border:1px solid rgba(234,179,8,0.15); padding:8px 12px; border-radius:6px; font-size:0.78rem; margin-top:6px; color:var(--color-warning); font-weight:700;">
              ⏳ Solicitud de credenciales pendiente de aprobación por el dueño...
            </div>
          `;
        } else if (activeRequest.status === 'Aprobado') {
          const expiresAt = activeRequest.expiresAt || 0;
          const remainSecs = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
          
          if (remainSecs > 0) {
            const min = Math.floor(remainSecs / 60);
            const sec = remainSecs % 60;
            const clockStr = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

            const credsData = activeRequest.approvedData || {};
            const labelMap = {
              dvrUser: 'Usuario DVR',
              dvrPassword: 'Clave DVR',
              nvrUser: 'Usuario NVR',
              nvrPassword: 'Clave NVR'
            };

            const credsFieldsHTML = Object.keys(credsData).map(key => `
              <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.03); padding:4px 0;">
                <span class="text-secondary">${labelMap[key] || key}:</span>
                <div style="display:flex; align-items:center; gap:8px;">
                  <strong style="color:var(--color-accent); font-family:monospace;">${credsData[key]}</strong>
                  <button class="btn btn-secondary btn-xs btn-copy-cred" data-val="${credsData[key]}" style="padding:1px 5px; font-size:0.65rem;">Copiar</button>
                </div>
              </div>
            `).join('');

            authModuleHTML = `
              <div style="background: rgba(34,197,94,0.05); border:1px solid rgba(34,197,94,0.15); padding:10px 12px; border-radius:6px; font-size:0.78rem; margin-top:6px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:4px;">
                  <strong style="color:var(--color-success);">🔑 Credenciales Aprobadas</strong>
                  <span class="badge" style="background:rgba(34,197,94,0.15); color:var(--color-success); font-family:monospace;" id="countdown-${activeRequest.id}">${clockStr}</span>
                </div>
                <div>
                  ${credsFieldsHTML}
                </div>
                <button class="btn btn-danger btn-xs w-100 btn-close-access" data-id="${activeRequest.id}" style="margin-top:10px;">Cerrar Acceso Temporal</button>
              </div>
            `;
          } else {
            authModuleHTML = `
              <div style="background: rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:8px 12px; border-radius:6px; font-size:0.78rem; display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                <span class="text-secondary">🔑 Acceso Expirado. Solicitar de nuevo</span>
                <button class="btn btn-secondary btn-xs btn-request-creds" data-client-id="${asg.clientId}" data-asg-id="${asg.id}">Solicitar</button>
              </div>
            `;
          }
        }
      }

      let actionHTML = '';
      if (asg.status === 'Pendiente') {
        actionHTML = `<button class="btn btn-info btn-sm w-100 btn-start-job" data-id="${asg.id}">🚀 Iniciar Trabajo</button>`;
      } else if (asg.status === 'En proceso') {
        actionHTML = `<button class="btn btn-success btn-sm w-100 btn-finish-job" data-id="${asg.id}">✅ Finalizar Trabajo</button>`;
      } else {
        actionHTML = `
          <div style="font-size:0.75rem; color:var(--color-success); text-align:center; font-weight:700; background:rgba(34,197,94,0.05); padding:6px; border-radius:6px; border:1px solid rgba(34,197,94,0.15);">
            🎉 Completado/Cancelado
          </div>
        `;
      }

      const phoneClean = asg.clientPhone ? asg.clientPhone.replace(/[^\d+]/g, '') : '';
      const whatsappMsg = encodeURIComponent(`Hola ${asg.clientName}, te saluda soporte técnico de ${this.currentUser.displayName}. Estoy asignado a tu servicio: ${asg.description.substring(0, 50)}...`);
      
      const contactBarHTML = asg.status !== 'Finalizado' && asg.status !== 'Cancelado' ? `
        <div class="contact-bar">
          <a class="contact-btn" href="tel:${phoneClean}" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--color-text-primary);">📞 Llamar</a>
          <a class="contact-btn" href="https://wa.me/${phoneClean.replace('+', '')}?text=${whatsappMsg}" target="_blank" rel="noopener" style="background: #25d366; color: #fff;">💬 WhatsApp</a>
        </div>
      ` : '';

      return `
        <div class="job-card animate-fade-in" style="border-left: 4px solid ${prioColor};">
          <div class="job-header">
            <div>
              <div class="job-client-name">${asg.clientName}</div>
              ${asg.companyName ? `<div style="font-size:0.75rem; color:var(--color-accent); font-weight:600; margin-top:2px;">🏢 ${asg.companyName}</div>` : ''}
              <div style="font-size:0.7rem; color:var(--color-text-secondary); margin-top:2px;">Asignado: ${TimeService.formatDate(asg.assignedAt)}</div>
            </div>
            <div>
              ${statusBadge}
            </div>
          </div>

          <div class="job-desc">
            <strong style="color:var(--color-text-primary);">Servicio: ${asg.description}</strong>
          </div>

          <div style="display:flex; flex-direction:column; gap:6px;">
            <div class="job-meta-item">
              <span class="job-meta-icon">📞</span>
              <span><strong>Teléfono:</strong> ${asg.clientPhone || '—'}</span>
            </div>
            <div class="job-meta-item">
              <span class="job-meta-icon">📍</span>
              <span><strong>Dirección:</strong> ${asg.clientAddress || '—'}</span>
            </div>
            <div class="job-meta-item">
              <span class="job-meta-icon">⏰</span>
              <span>${scheduledStr}</span>
            </div>
            ${executionHTML}
          </div>

          ${contactBarHTML}
          ${authModuleHTML}

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px; border-top:1px solid rgba(255,255,255,0.03); padding-top:8px;">
            <button class="btn btn-secondary btn-xs btn-view-technical" data-client-id="${asg.clientId}">📋 Ficha Técnica</button>
            <span style="font-size:0.75rem; color:${prioColor}; font-weight:700;">Prioridad: ${asg.priority}</span>
          </div>

          <div style="margin-top:auto; padding-top:6px; border-top:1px solid rgba(255,255,255,0.05);">
            ${actionHTML}
          </div>
        </div>
      `;
    }).join('');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REGISTER CLIENT TAB (EMPLOYEE PRE-REGISTRATION)
  // ═══════════════════════════════════════════════════════════════════════════

  renderRegisterClientTab() {
    if (this.state.confirmingNewClient) {
      this.renderConfirmationScreen();
      return;
    }

    const formVal = this.state.newClientForm;

    const trackingRows = this.state.pendingClients.map(c => {
      const badge = {
        Pendiente: '<span class="badge" style="background:rgba(234,179,8,0.1); color:var(--color-warning);">Pendiente</span>',
        Aprobada: '<span class="badge" style="background:rgba(34,197,94,0.1); color:var(--color-success);">Aprobada</span>',
        Rechazada: '<span class="badge" style="background:rgba(239,68,68,0.1); color:var(--color-error);">Rechazada</span>'
      }[c.status] || `<span class="badge">${c.status}</span>`;

      return `
        <tr style="border-bottom:1px solid var(--color-border); font-size:0.75rem;">
          <td style="padding:8px;"><strong>${c.displayName}</strong></td>
          <td style="padding:8px; color:var(--color-text-secondary);">${TimeService.formatDate(c.createdAt)}</td>
          <td style="padding:8px;">${c.serviceType}</td>
          <td style="padding:8px;">${badge}</td>
          <td style="padding:8px; color:var(--color-text-secondary); font-size:0.7rem; max-width:200px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${c.comment || ''}">
            ${c.comment || '—'}
          </td>
        </tr>
      `;
    }).join('');

    this.container.innerHTML = `
      <div style="display:grid; grid-template-columns: 2fr 1fr; gap:20px; grid-column:1 / -1; align-items:flex-start;">
        <div class="card p-6 animate-fade-in">
          <h3 class="text-md font-bold mb-4">➕ Registrar Nuevo Cliente (Petición de Aprobación)</h3>
          
          <form id="emp-new-client-form" style="display:flex; flex-direction:column; gap:12px;">
            <div class="form-section-title">👤 Datos del Cliente</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div class="form-group">
                <label class="form-label" for="reg-name">Nombre Completo <span class="form-label-required"></span></label>
                <input type="text" id="reg-name" class="input input-md" placeholder="Ej. Pedro Gómez" value="${formVal.displayName}" required />
              </div>
              <div class="form-group">
                <label class="form-label" for="reg-company">Empresa (Opcional)</label>
                <input type="text" id="reg-company" class="input input-md" placeholder="Ej. Comercial Gómez" value="${formVal.companyName}" />
              </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div class="form-group">
                <label class="form-label" for="reg-phone">Teléfono Principal <span class="form-label-required"></span></label>
                <input type="text" id="reg-phone" class="input input-md" placeholder="Ej. 8888-8888" value="${formVal.phone}" required />
              </div>
              <div class="form-group">
                <label class="form-label" for="reg-phone-sec">Teléfono Secundario (Opcional)</label>
                <input type="text" id="reg-phone-sec" class="input input-md" placeholder="Ej. 2222-2222" value="${formVal.phoneSecondary}" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="reg-email">Correo Electrónico <span class="form-label-required"></span></label>
              <input type="email" id="reg-email" class="input input-md" placeholder="cliente@correo.com" value="${formVal.email}" required />
            </div>

            <div class="form-section-title">📍 Ubicación del Cliente</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div class="form-group">
                <label class="form-label" for="reg-city">Ciudad / Municipio <span class="form-label-required"></span></label>
                <input type="text" id="reg-city" class="input input-md" placeholder="Ej. Managua" value="${formVal.city}" required />
              </div>
              <div class="form-group">
                <label class="form-label" for="reg-dept">Departamento / Provincia <span class="form-label-required"></span></label>
                <input type="text" id="reg-dept" class="input input-md" placeholder="Ej. Managua" value="${formVal.department}" required />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="reg-address">Dirección Completa <span class="form-label-required"></span></label>
              <input type="text" id="reg-address" class="input input-md" value="${formVal.address}" required />
            </div>

            <div class="form-group">
              <label class="form-label" for="reg-ref">Referencia de Ubicación <span class="form-label-required"></span></label>
              <input type="text" id="reg-ref" class="input input-md" value="${formVal.reference}" required />
            </div>

            <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:12px; border-radius:8px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <strong style="font-size:0.8rem; color:var(--color-text-primary);">📍 Ubicación GPS del Dispositivo</strong>
                <button type="button" class="btn btn-secondary btn-xs" id="btn-get-gps">🌍 Obtener ubicación actual</button>
              </div>
              <div id="gps-coords-display" style="font-size:0.75rem; color:var(--color-text-secondary);">
                ${formVal.gps 
                  ? `Latitud: <strong>${formVal.gps.lat}</strong>, Longitud: <strong>${formVal.gps.lng}</strong>`
                  : '⚠️ Sin coordenadas GPS capturadas.'}
              </div>
              <div id="waiter-preview-map" style="height: 180px; border-radius: 6px; border:1px solid var(--color-border); margin-top:10px; display:${formVal.gps ? 'block' : 'none'}; z-index:5;"></div>
            </div>

            <div class="form-section-title">🛠️ Servicio</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div class="form-group">
                <label class="form-label" for="reg-service">Tipo de Servicio <span class="form-label-required"></span></label>
                <input type="text" id="reg-service" class="input input-md" value="${formVal.serviceType}" required />
              </div>
              <div class="form-group">
                <label class="form-label" for="reg-priority">Prioridad <span class="form-label-required"></span></label>
                <select id="reg-priority" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-primary);">
                  <option value="Baja">Baja</option>
                  <option value="Media" selected>Media</option>
                  <option value="Alta">Alta</option>
                  <option value="Urgente">Urgente</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="reg-desc">Descripción del Trabajo <span class="form-label-required"></span></label>
              <textarea id="reg-desc" class="input" style="height:60px; padding:10px;" required>${formVal.problemDescription}</textarea>
            </div>

            <div class="form-group">
              <label class="form-label" for="reg-equip">Equipos Instalados (Opcional)</label>
              <input type="text" id="reg-equip" class="input input-md" value="${formVal.installedEquipment}" />
            </div>

            <div style="display:flex; justify-content:flex-end;">
              <button type="submit" class="btn btn-primary">Siguiente: Previsualizar</button>
            </div>
          </form>
        </div>

        <div class="card p-5">
          <h3 class="text-xs font-bold uppercase tracking-wider mb-4" style="color:var(--color-accent);">Historial de Peticiones</h3>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; text-align:left;">
              <thead>
                <tr style="border-bottom:1px solid var(--color-border); color:var(--color-text-secondary); font-size:0.7rem; font-weight:700;">
                  <th style="padding:6px 4px;">Cliente</th>
                  <th style="padding:6px 4px;">Fecha</th>
                  <th style="padding:6px 4px;">Estado</th>
                </tr>
              </thead>
              <tbody>
                ${trackingRows || '<tr><td colspan="3" style="text-align:center; padding:15px; color:var(--color-text-secondary); font-size:0.7rem;">Ninguna petición.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    this.container.querySelector('#btn-get-gps')?.addEventListener('click', () => this.triggerGPSCapture());

    const form = this.container.querySelector('#emp-new-client-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.state.newClientForm = {
        displayName: form.querySelector('#reg-name').value.trim(),
        companyName: form.querySelector('#reg-company').value.trim(),
        phone: form.querySelector('#reg-phone').value.trim(),
        phoneSecondary: form.querySelector('#reg-phone-sec').value.trim(),
        email: form.querySelector('#reg-email').value.trim(),
        address: form.querySelector('#reg-address').value.trim(),
        city: form.querySelector('#reg-city').value.trim(),
        department: form.querySelector('#reg-dept').value.trim(),
        reference: form.querySelector('#reg-ref').value.trim(),
        observations: form.querySelector('#reg-equip').value.trim(), // simple notes mapping
        serviceType: form.querySelector('#reg-service').value.trim(),
        problemDescription: form.querySelector('#reg-desc').value.trim(),
        installedEquipment: form.querySelector('#reg-equip').value.trim(),
        priority: form.querySelector('#reg-priority').value,
        gps: this.state.newClientForm.gps
      };
      this.state.confirmingNewClient = true;
      this.renderAssignments();
    });

    if (formVal.gps) {
      this.loadLeaflet().then(() => this.initMap('waiter-preview-map', formVal.gps.lat, formVal.gps.lng));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //📍 REGISTER/UPDATE CLIENT GPS TAB (EMPLOYEE ACTION SCREEN)
  // ═══════════════════════════════════════════════════════════════════════════

  renderGpsLocationTab() {
    const hasPerm = this.currentUser.permissions?.registrar_ubicacion_clientes === true;

    if (!hasPerm) {
      this.container.innerHTML = `
        <div class="card p-8 text-center" style="grid-column:1 / -1; max-width:600px; margin: 30px auto; border:1px solid rgba(239,68,68,0.2); background:rgba(239,68,68,0.02);">
          <div style="font-size:3rem; margin-bottom:12px;">⚠️</div>
          <h4 class="font-bold text-md" style="color:var(--color-error);">Acceso Restringido</h4>
          <p class="text-secondary text-sm mt-2">
            No tienes el permiso <strong>"Registrar ubicación de clientes"</strong> asignado a tu cuenta. Solicita la activación de este permiso al propietario del negocio.
          </p>
        </div>
      `;
      return;
    }

    if (this.state.confirmingGpsLocation) {
      this.renderGpsConfirmationScreen();
      return;
    }

    // Filter clients catalog to show ONLY clients assigned to this employee's assignments!
    const assignedClientIds = new Set(this.state.assignments.map(a => a.clientId));
    const myClients = this.state.clientsCatalog.filter(c => assignedClientIds.has(c.id));

    const clientOptionsHTML = myClients.map(c => `
      <option value="${c.id}" ${this.state.gpsSelectedClientId === c.id ? 'selected' : ''}>
        ${c.displayName} ${c.companyName ? `(${c.companyName})` : ''} — Tel: ${c.phone}
      </option>
    `).join('');

    // Summary details of selected client
    let clientCardHTML = '';
    const selectedClient = myClients.find(c => c.id === this.state.gpsSelectedClientId);

    if (selectedClient) {
      const activeJob = this.state.assignments.find(a => a.clientId === selectedClient.id && a.status !== 'Finalizado');
      const hasGps = selectedClient.gps ? '🟢 Sí' : '⚪ No registrada';
      
      clientCardHTML = `
        <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:12px; border-radius:8px; display:flex; flex-direction:column; gap:8px; font-size:0.8rem;">
          <div><span class="text-secondary">Cliente:</span> <strong>${selectedClient.displayName}</strong></div>
          ${selectedClient.companyName ? `<div><span class="text-secondary">Empresa:</span> <strong>${selectedClient.companyName}</strong></div>` : ''}
          <div><span class="text-secondary">Teléfono:</span> <strong>${selectedClient.phone}</strong></div>
          <div><span class="text-secondary">Dirección:</span> <strong>${selectedClient.address || '—'}</strong></div>
          <div><span class="text-secondary">Ubicación GPS Oficial:</span> <strong>${hasGps}</strong></div>
          ${activeJob ? `
            <div style="margin-top:6px; padding:6px; background:rgba(59,130,246,0.05); border:1px solid rgba(59,130,246,0.15); border-radius:6px;">
              ⚡ Servicio Activo: <strong>${activeJob.description}</strong> (${activeJob.status})
            </div>
          ` : ''}
        </div>
      `;
    }

    // Historical list of location updates submitted by employee
    const locationsRows = this.state.pendingLocations.map(l => {
      const badge = {
        Pendiente: '<span class="badge" style="background:rgba(234,179,8,0.1); color:var(--color-warning);">Pendiente</span>',
        Aprobado: '<span class="badge" style="background:rgba(34,197,94,0.1); color:var(--color-success);">Aprobado</span>',
        Rechazado: '<span class="badge" style="background:rgba(239,68,68,0.1); color:var(--color-error);">Rechazado</span>'
      }[l.status] || `<span class="badge">${l.status}</span>`;

      return `
        <tr style="border-bottom:1px solid var(--color-border); font-size:0.75rem;">
          <td style="padding:8px;"><strong>${l.clientName}</strong></td>
          <td style="padding:8px; font-family:monospace; color:var(--color-accent);">${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}</td>
          <td style="padding:8px; color:var(--color-text-secondary);">${TimeService.formatDate(l.capturedAt)}</td>
          <td style="padding:8px;">${badge}</td>
          <td style="padding:8px; color:var(--color-text-secondary); font-size:0.7rem; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${l.comment || '—'}
          </td>
        </tr>
      `;
    }).join('');

    this.container.innerHTML = `
      <div style="display:grid; grid-template-columns: 2fr 1fr; gap:20px; grid-column:1 / -1; align-items:flex-start;">
        
        <!-- Action Card -->
        <div class="card p-6 animate-fade-in">
          <h3 class="text-md font-bold mb-4">📍 Registrar o Actualizar Ubicación GPS de Cliente</h3>
          
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div class="form-group">
              <label class="form-label" for="gps-client-select">Selecciona el Cliente Asignado <span class="form-label-required"></span></label>
              <select id="gps-client-select" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-primary);">
                <option value="" disabled selected>Escoge un cliente...</option>
                ${clientOptionsHTML}
              </select>
            </div>

            <div id="gps-client-summary-card">
              ${clientCardHTML}
            </div>

            <!-- GPS Capture Module -->
            <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:12px; border-radius:8px; margin-top:6px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <strong style="font-size:0.8rem; color:var(--color-text-primary);">📍 GPS del Dispositivo</strong>
                <button type="button" class="btn btn-primary btn-xs" id="btn-gps-capture-action" ${!selectedClient ? 'disabled' : ''}>🌍 Capturar Ubicación Actual</button>
              </div>

              <div id="gps-action-coords-display" style="font-size:0.75rem; color:var(--color-text-secondary);">
                ${this.state.gpsCapturedData 
                  ? `Latitud: <strong>${this.state.gpsCapturedData.lat}</strong>, Longitud: <strong>${this.state.gpsCapturedData.lng}</strong> (Precisión: ${this.state.gpsCapturedData.accuracy}m)`
                  : '⚠️ No se han capturado coordenadas GPS.'}
              </div>

              <div id="gps-action-preview-map" style="height: 180px; border-radius: 6px; border:1px solid var(--color-border); margin-top:10px; display:${this.state.gpsCapturedData ? 'block' : 'none'}; z-index:5;"></div>
            </div>

            <div class="form-group">
              <label class="form-label" for="gps-obs-input">Observaciones de Campo (Opcional)</label>
              <textarea id="gps-obs-input" class="input" style="height:60px; padding:10px;" placeholder="Ej. El medidor está en el poste frente a la cochera.">${this.state.gpsObservations}</textarea>
            </div>

            <div style="display:flex; justify-content:flex-end; margin-top:10px;">
              <button class="btn btn-primary" id="btn-gps-confirm-next" ${!this.state.gpsCapturedData || !selectedClient ? 'disabled' : ''}>Siguiente: Confirmar Ubicación</button>
            </div>
          </div>
        </div>

        <!-- History/Logs Side Card -->
        <div class="card p-5">
          <h3 class="text-xs font-bold uppercase tracking-wider mb-4" style="color:var(--color-accent);">Historial de Ubicaciones</h3>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; text-align:left;">
              <thead>
                <tr style="border-bottom:1px solid var(--color-border); color:var(--color-text-secondary); font-size:0.7rem; font-weight:700;">
                  <th style="padding:6px 4px;">Cliente</th>
                  <th style="padding:6px 4px;">Coords</th>
                  <th style="padding:6px 4px;">Fecha</th>
                  <th style="padding:6px 4px;">Estado</th>
                  <th style="padding:6px 4px;">Comentario</th>
                </tr>
              </thead>
              <tbody>
                ${locationsRows || '<tr><td colspan="5" style="text-align:center; padding:15px; color:var(--color-text-secondary); font-size:0.7rem;">Ninguna ubicación registrada.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Dropdown change trigger
    this.container.querySelector('#gps-client-select')?.addEventListener('change', (e) => {
      this.state.gpsSelectedClientId = e.target.value;
      this.state.gpsCapturedData = null;
      this.renderAssignments();
    });

    // Capture GPS coordinates trigger
    this.container.querySelector('#btn-gps-capture-action')?.addEventListener('click', () => {
      this.triggerGpsActionCapture();
    });

    // Go to GPS confirmation screen
    this.container.querySelector('#btn-gps-confirm-next')?.addEventListener('click', () => {
      this.state.gpsObservations = this.container.querySelector('#gps-obs-input').value.trim();
      this.state.confirmingGpsLocation = true;
      this.renderAssignments();
    });

    // Re-init map
    if (this.state.gpsCapturedData) {
      this.loadLeaflet().then(() => {
        this.initMap('gps-action-preview-map', this.state.gpsCapturedData.lat, this.state.gpsCapturedData.lng);
      });
    }
  }

  triggerGpsActionCapture() {
    const display = this.container.querySelector('#gps-action-coords-display');
    if (!navigator.geolocation) {
      alert('La geolocalización no está soportada.');
      return;
    }

    display.innerHTML = '⚡ Adquiriendo precisión del satélite...';

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = Math.round(position.coords.accuracy || 0);
        const timestamp = Date.now();

        this.state.gpsCapturedData = {
          lat,
          lng,
          accuracy,
          capturedAt: timestamp
        };

        display.innerHTML = `Latitud: <strong>${lat}</strong>, Longitud: <strong>${lng}</strong> (Precisión: ${accuracy} metros)`;

        const mapContainer = this.container.querySelector('#gps-action-preview-map');
        mapContainer.style.display = 'block';

        this.loadLeaflet().then(() => {
          this.initMap('gps-action-preview-map', lat, lng);
        });

        const nextBtn = this.container.querySelector('#btn-gps-confirm-next');
        if (nextBtn) nextBtn.disabled = false;
      },
      (error) => {
        console.error(error);
        alert(`Error al geolocalizar: ${error.message}`);
        display.innerHTML = '⚠️ Error de geolocalización.';
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  renderGpsConfirmationScreen() {
    const client = this.state.clientsCatalog.find(c => c.id === this.state.gpsSelectedClientId);
    const gps = this.state.gpsCapturedData;

    this.container.innerHTML = `
      <div class="card p-6 animate-fade-in" style="max-width:650px; margin:0 auto; grid-column:1 / -1;">
        <h3 class="text-md font-bold mb-4" style="color:var(--color-accent); border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:6px;">📍 Confirmar Envío de Ubicación GPS</h3>
        
        <div style="display:flex; flex-direction:column; gap:12px; font-size:0.85rem; color:var(--color-text-primary); margin-bottom:20px;">
          <div>
            <span class="text-secondary" style="font-size:0.75rem; display:block;">Cliente Seleccionado:</span>
            <strong>${client?.displayName}</strong>
          </div>
          <div>
            <span class="text-secondary" style="font-size:0.75rem; display:block;">Teléfono:</span>
            <strong>${client?.phone}</strong>
          </div>
          <div>
            <span class="text-secondary" style="font-size:0.75rem; display:block;">Coordenadas Capturadas:</span>
            Latitud: <strong>${gps.lat}</strong>, Longitud: <strong>${gps.lng}</strong> (Precisión: ${gps.accuracy}m)
          </div>
          <div>
            <span class="text-secondary" style="font-size:0.75rem; display:block;">Fecha y Hora de Captura:</span>
            <strong>${TimeService.formatDate(gps.capturedAt, true)}</strong>
          </div>
          ${this.state.gpsObservations ? `
            <div>
              <span class="text-secondary" style="font-size:0.75rem; display:block;">Observaciones de Campo:</span>
              <div style="background:rgba(255,255,255,0.02); padding:8px; border-radius:4px; border:1px solid rgba(255,255,255,0.05);">${this.state.gpsObservations}</div>
            </div>
          ` : ''}

          <div>
            <span class="text-secondary" style="font-size:0.75rem; display:block; margin-bottom:6px;">Mapa de Previsualización:</span>
            <div id="gps-confirm-preview-map" style="height:180px; border-radius:6px; border:1px solid var(--color-border); z-index:5;"></div>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.05); padding-top:10px;">
          <button class="btn btn-secondary btn-sm" id="btn-gps-confirm-back">Cancel / Re-capturar</button>
          <button class="btn btn-primary btn-sm" id="btn-gps-confirm-submit">🚀 Enviar para Aprobación</button>
        </div>
      </div>
    `;

    this.container.querySelector('#btn-gps-confirm-back')?.addEventListener('click', () => {
      this.state.confirmingGpsLocation = false;
      this.renderAssignments();
    });

    this.container.querySelector('#btn-gps-confirm-submit')?.addEventListener('click', async () => {
      const submitBtn = this.container.querySelector('#btn-gps-confirm-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando ubicación...';

      try {
        const { db } = await import('../../../config/firebase.config.js');
        const { ref, push, set } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js');

        if (db) {
          const locRef = push(ref(db, `${this.companyId}/pending_locations`));
          const locId = locRef.key;

          const locationRequestData = {
            id: locId,
            clientId: client.id,
            clientName: client.displayName,
            employeeId: this.uid,
            employeeName: this.currentUser.displayName || 'Técnico',
            lat: gps.lat,
            lng: gps.lng,
            accuracy: gps.accuracy,
            capturedAt: gps.capturedAt,
            status: 'Pendiente',
            observations: this.state.gpsObservations,
            comment: ''
          };

          await set(locRef, locationRequestData);

          // Notify Owner
          const notifRef = push(ref(db, `${this.companyId}/notifications`));
          await set(notifRef, {
            id: notifRef.key,
            toUid: 'OWNER',
            title: '📍 Nueva Ubicación Pendiente',
            message: `El empleado ${this.currentUser.displayName} envió una actualización de coordenadas para el cliente "${client.displayName}"`,
            timestamp: Date.now(),
            read: false
          });

          // Log Audit Trace
          await FirestoreService.logAudit({
            action: 'EMPLOYEE_SUBMIT_LOCATION_UPDATE',
            companyId: this.companyId,
            description: `El empleado ${this.currentUser.displayName} (${this.currentUser.email}) registró ubicación GPS para el cliente "${client.displayName}" (Coordenadas: [${gps.lat}, ${gps.lng}], Precisión: ${gps.accuracy}m).`
          });
        }

        NotificationService.success('Ubicación enviada para aprobación del dueño.');
        this.state.confirmingGpsLocation = false;
        this.state.gpsSelectedClientId = '';
        this.state.gpsCapturedData = null;
        this.state.gpsObservations = '';
        this.renderAssignments();
      } catch (err) {
        console.error(err);
        alert(`Error al enviar coordenadas: ${err.message || err}`);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar para Aprobación';
      }
    });

    this.loadLeaflet().then(() => {
      this.initMap('gps-confirm-preview-map', gps.lat, gps.lng);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAP LEAFLET DYNAMIC ASYNC RESOURCE LOADER
  // ═══════════════════════════════════════════════════════════════════════════

  async loadLeaflet() {
    if (window.L) return window.L;

    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => resolve(window.L);
      script.onerror = (err) => reject(err);
      document.body.appendChild(script);
    });
  }

  initMap(containerId, lat, lng) {
    if (!window.L) return;
    try {
      if (this.maps && this.maps[containerId]) {
        this.maps[containerId].remove();
      } else {
        this.maps = this.maps || {};
      }

      const map = window.L.map(containerId).setView([lat, lng], 15);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(map);

      window.L.marker([lat, lng]).addTo(map);
      this.maps[containerId] = map;
      
      setTimeout(() => map.invalidateSize(), 200);
    } catch (e) {
      console.warn('[Leaflet] Map init failed:', e.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FINISH CODES AND LIFECYCLES
  // ═══════════════════════════════════════════════════════════════════════════

  async openTechnicalDataModal(clientId) {
    try {
      const { db } = await import('../../../config/firebase.config.js');
      const { ref, get } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js');

      if (!db) return;

      const snap = await get(ref(db, `${this.companyId}/clients/${clientId}`));
      if (!snap.exists()) {
        alert('No se pudo encontrar la información técnica.');
        return;
      }

      const client = snap.val();
      const tech = client.technical_info || {};

      let modalOverlay = document.getElementById('view-technical-modal-container');
      if (modalOverlay) modalOverlay.remove();

      const detailsHTML = `
        <div style="color:var(--color-text-primary); display:flex; flex-direction:column; gap:12px; font-size:0.85rem;">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <div>
              <span class="text-secondary" style="display:block; font-size:0.75rem;">Marca / Modelo:</span>
              <strong>${tech.brandModel || '—'}</strong>
            </div>
            <div>
              <span class="text-secondary" style="display:block; font-size:0.75rem;">Número de Serie:</span>
              <strong>${tech.serialNumber || '—'}</strong>
            </div>
          </div>
          <div style="border-top:1px solid rgba(255,255,255,0.05); padding-top:8px;">
            <span class="text-secondary" style="display:block; font-size:0.75rem;">Descripción del Producto Instalado:</span>
            <strong>${tech.productDescription || '—'}</strong>
          </div>
        </div>
      `;

      const technicalModal = new Modal({
        title: `📋 Ficha Técnica: ${client.displayName}`,
        bodyHTML: detailsHTML,
        footerHTML: `<button class="btn btn-secondary btn-sm" id="btn-close-tech-modal">Cerrar Ficha</button>`,
        size: 'md'
      });

      const el = technicalModal.mount();
      el.setAttribute('id', 'view-technical-modal-container');
      document.body.appendChild(el);

      el.querySelector('#btn-close-tech-modal')?.addEventListener('click', () => technicalModal.close());
    } catch (e) {
      console.error(e);
    }
  }

  openRequestCredsModal(clientId, assignmentId) {
    const assignment = this.state.assignments.find(a => a.id === assignmentId);
    if (!assignment) return;

    let modalOverlay = document.getElementById('request-creds-modal-container');
    if (modalOverlay) modalOverlay.remove();

    const formHTML = `
      <form id="request-creds-form" style="display:flex; flex-direction:column; gap: var(--space-3); color: var(--color-text-primary);">
        <div class="form-group">
          <label class="form-label" style="font-weight:700; margin-bottom:8px; display:block;">Selecciona los Datos Requeridos <span class="form-label-required"></span></label>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            <label style="display:flex; align-items:center; gap:6px; font-size:0.75rem; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:6px 8px; border-radius:4px; cursor:pointer;">
              <input type="checkbox" name="req-field" value="dvrUser" />
              <span>👤 Usuario DVR</span>
            </label>
            <label style="display:flex; align-items:center; gap:6px; font-size:0.75rem; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:6px 8px; border-radius:4px; cursor:pointer;">
              <input type="checkbox" name="req-field" value="dvrPassword" />
              <span>🔑 Clave DVR</span>
            </label>
            <label style="display:flex; align-items:center; gap:6px; font-size:0.75rem; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:6px 8px; border-radius:4px; cursor:pointer;">
              <input type="checkbox" name="req-field" value="nvrUser" />
              <span>👤 Usuario NVR/XVR</span>
            </label>
            <label style="display:flex; align-items:center; gap:6px; font-size:0.75rem; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:6px 8px; border-radius:4px; cursor:pointer;">
              <input type="checkbox" name="req-field" value="nvrPassword" />
              <span>🔑 Clave NVR/XVR</span>
            </label>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="req-motive">Motivo o Justificación del Acceso <span class="form-label-required"></span></label>
          <textarea id="req-motive" class="input" style="height:70px; padding:10px;" placeholder="Motive..." required></textarea>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="req-cancel-btn">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="req-submit-btn">Enviar Solicitud</button>
    `;

    const requestModal = new Modal({
      title: '🔑 Solicitar Acceso a Credenciales',
      bodyHTML: formHTML,
      footerHTML: footerHTML,
      size: 'md'
    });

    const el = requestModal.mount();
    el.setAttribute('id', 'request-creds-modal-container');
    document.body.appendChild(el);

    el.querySelector('#req-cancel-btn')?.addEventListener('click', () => requestModal.close());
    el.querySelector('#req-submit-btn')?.addEventListener('click', async () => {
      const form = el.querySelector('#request-creds-form');
      if (!form || !form.reportValidity()) return;

      const checkedBoxes = form.querySelectorAll('input[name="req-field"]:checked');
      if (checkedBoxes.length === 0) {
        alert('Debes seleccionar al menos una credencial.');
        return;
      }

      const requestedFields = Array.from(checkedBoxes).map(chk => chk.value);
      const motive = el.querySelector('#req-motive').value.trim();

      const submitBtn = el.querySelector('#req-submit-btn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';

      try {
        const { db } = await import('../../../config/firebase.config.js');
        const { ref, push, set } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js');

        if (db) {
          const reqRef = push(ref(db, `${this.companyId}/auth_requests`));
          const reqId = reqRef.key;

          const requestData = {
            id: reqId,
            employeeId: this.uid,
            employeeName: this.currentUser.displayName || 'Técnico',
            clientId: clientId,
            clientName: assignment.clientName,
            assignmentId: assignmentId,
            requestedFields: requestedFields,
            motive: motive,
            status: 'Pendiente',
            requestedAt: Date.now(),
            approvedAt: 0,
            expiresAt: 0,
            comment: '',
            authorizedBy: ''
          };

          await set(reqRef, requestData);

          const notifRef = push(ref(db, `${this.companyId}/notifications`));
          await set(notifRef, {
            id: notifRef.key,
            toUid: 'OWNER',
            title: '🔑 Solicitud de Acceso Especial',
            message: `El empleado ${this.currentUser.displayName} solicita credenciales para el cliente ${assignment.clientName}`,
            timestamp: Date.now(),
            read: false
          });

          await FirestoreService.logAudit({
            action: 'EMPLOYEE_REQUEST_CREDENTIALS',
            companyId: this.companyId,
            description: `El empleado ${this.currentUser.displayName} solicitó acceso granular a las credenciales del cliente ${assignment.clientName}. Motivo: ${motive}.`
          });
        }

        NotificationService.success('Solicitud enviada con éxito.');
        requestModal.close();
        this.loadMyAssignments();
      } catch (err) {
        console.error(err);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar Solicitud';
      }
    });
  }

  bindActionEvents(element) {
    element.addEventListener('click', async (e) => {
      const copyBtn = e.target.closest('.btn-copy-cred');
      if (copyBtn) {
        navigator.clipboard.writeText(copyBtn.getAttribute('data-val'));
        NotificationService.success('Copiado.');
        return;
      }

      const closeAccessBtn = e.target.closest('.btn-close-access');
      if (closeAccessBtn) {
        const reqId = closeAccessBtn.getAttribute('data-id');
        if (confirm('¿Deseas revocar el acceso?')) {
          await this.expireRequest(reqId);
        }
        return;
      }

      const techBtn = e.target.closest('.btn-view-technical');
      if (techBtn) {
        this.openTechnicalDataModal(techBtn.getAttribute('data-client-id'));
        return;
      }

      const reqCredsBtn = e.target.closest('.btn-request-creds');
      if (reqCredsBtn) {
        this.openRequestCredsModal(reqCredsBtn.getAttribute('data-client-id'), reqCredsBtn.getAttribute('data-asg-id'));
        return;
      }

      const startBtn = e.target.closest('.btn-start-job');
      if (startBtn) {
        const id = startBtn.getAttribute('data-id');
        const assignment = this.state.assignments.find(a => a.id === id);
        if (confirm(`¿Iniciar trabajo para "${assignment.clientName}"?`)) {
          await this.updateStatus(id, 'En proceso');
          await FirestoreService.logAudit({
            action: 'EMPLOYEE_START_JOB',
            companyId: this.companyId,
            description: `El empleado ${this.currentUser.displayName} inició el trabajo para el cliente ${assignment.clientName}.`
          });
        }
        return;
      }

      const finishBtn = e.target.closest('.btn-finish-job');
      if (finishBtn) {
        this.openFinishJobModal(finishBtn.getAttribute('data-id'));
        return;
      }
    });
  }

  unmount() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    if (this.dbUnsubscribe) {
      this.dbUnsubscribe();
    }
    if (this.authRequestsUnsubscribe) {
      this.authRequestsUnsubscribe();
    }
    if (this.pendingClientsUnsubscribe) {
      this.pendingClientsUnsubscribe();
    }
    if (this.pendingLocationsUnsubscribe) {
      this.pendingLocationsUnsubscribe();
    }
    this.layout.unmount();
    super.unmount();
  }
}
