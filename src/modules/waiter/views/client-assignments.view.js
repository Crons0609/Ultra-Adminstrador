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
      activeTab: 'active', // 'active' | 'history' | 'register-client'
      assignments: [],
      authRequests: [],
      pendingClients: [], // Requests sent by this employee
      filters: {
        searchQuery: '',
        status: 'ALL',
        priority: 'ALL',
        dateAssigned: '',
        dateScheduled: ''
      },
      // Temp object for new client form before confirmation
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
      confirmingNewClient: false
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
        </div>

        <div id="waiter-filter-bar" style="margin-bottom: 20px;"></div>
        <div id="jobs-container" class="job-grid animate-fade-in"></div>
      `
    });

    this.dbUnsubscribe = null;
    this.authRequestsUnsubscribe = null;
    this.pendingClientsUnsubscribe = null;
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
    
    // Start active countdown clock ticker
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
        
        // Reset filters when switching tabs
        this.state.filters = {
          searchQuery: '',
          status: 'ALL',
          priority: 'ALL',
          dateAssigned: '',
          dateScheduled: ''
        };
        this.state.confirmingNewClient = false;
        
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

      const snapshot = await get(ref(db, `${this.companyId}/assignments`));
      if (snapshot.exists()) {
        const data = snapshot.val();
        this.state.assignments = Object.keys(data)
          .map(k => ({ id: k, ...data[k] }))
          .filter(a => a.employeeId === this.uid)
          .sort((a, b) => b.assignedAt - a.assignedAt);
      }

      const reqSnapshot = await get(ref(db, `${this.companyId}/auth_requests`));
      if (reqSnapshot.exists()) {
        const data = reqSnapshot.val();
        this.state.authRequests = Object.keys(data)
          .map(k => ({ id: k, ...data[k] }))
          .filter(r => r.employeeId === this.uid);
      }

      // Load pending client requests
      const pcSnapshot = await get(ref(db, `${this.companyId}/pending_clients`));
      if (pcSnapshot.exists()) {
        const data = pcSnapshot.val();
        this.state.pendingClients = Object.keys(data)
          .map(k => ({ id: k, ...data[k] }))
          .filter(r => r.employeeId === this.uid)
          .sort((a, b) => b.createdAt - a.createdAt);
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

        // Assignments listener
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

        // Authorizations listener
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

        // Pending Clients listener
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
      });
    });
  }

  renderFilters() {
    const f = this.state.filters;
    const isHistory = this.state.activeTab === 'history';
    const isRegister = this.state.activeTab === 'register-client';

    if (isRegister) {
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

  getFilteredAssignments() {
    const f = this.state.filters;
    const isHistory = this.state.activeTab === 'history';

    return this.state.assignments.filter(asg => {
      const matchTab = isHistory 
        ? (asg.status === 'Finalizado' || asg.status === 'Cancelado')
        : (asg.status === 'Pendiente' || asg.status === 'En proceso');

      if (!matchTab) return false;

      const query = f.searchQuery.toLowerCase().trim();
      const matchText = !query || 
        asg.clientName.toLowerCase().includes(query) ||
        (asg.description && asg.description.toLowerCase().includes(query)) ||
        (asg.clientPhone && asg.clientPhone.toLowerCase().includes(query));

      const matchStatus = f.status === 'ALL' || asg.status === f.status;
      const matchPriority = f.priority === 'ALL' || asg.priority === f.priority;

      const assignedDateStr = new Date(asg.assignedAt).toISOString().split('T')[0];
      const matchAssignedDate = !f.dateAssigned || assignedDateStr === f.dateAssigned;

      const matchScheduledDate = !f.dateScheduled || asg.scheduledDate === f.dateScheduled;

      return matchText && matchStatus && matchPriority && matchAssignedDate && matchScheduledDate;
    });
  }

  renderAssignments() {
    if (!this.container) return;

    if (this.state.activeTab === 'register-client') {
      this.renderRegisterClientTab();
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
              nvrPassword: 'Clave NVR',
              ipCameraUser: 'Usuario Cam IP',
              ipCameraPassword: 'Clave Cam IP',
              appUser: 'Usuario App',
              appPassword: 'Clave App',
              encryptionCode: 'Código Cifrado',
              otherCredentials: 'Otras Credenciales'
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
        } else if (activeRequest.status === 'Rechazado') {
          authModuleHTML = `
            <div style="background: rgba(239,68,68,0.05); border:1px solid rgba(239,68,68,0.15); padding:8px 12px; border-radius:6px; font-size:0.78rem; margin-top:6px;">
              <div style="color:var(--color-error); font-weight:700; display:flex; justify-content:space-between;">
                <span>❌ Solicitud Rechazada</span>
                <button class="btn btn-secondary btn-xs btn-request-creds" data-client-id="${asg.clientId}" data-asg-id="${asg.id}" style="font-size:0.65rem; padding: 2px 6px;">Reintentar</button>
              </div>
              ${activeRequest.comment ? `<div class="text-secondary" style="font-size:0.7rem; margin-top:4px;">Motivo: ${activeRequest.comment}</div>` : ''}
            </div>
          `;
        } else {
          authModuleHTML = `
            <div style="background: rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:8px 12px; border-radius:6px; font-size:0.78rem; display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
              <span class="text-secondary">🔑 Acceso Expirado (Temporal)</span>
              <button class="btn btn-secondary btn-xs btn-request-creds" data-client-id="${asg.clientId}" data-asg-id="${asg.id}">Solicitar</button>
            </div>
          `;
        }
      }

      let actionHTML = '';
      if (asg.status === 'Pendiente') {
        actionHTML = `<button class="btn btn-info btn-sm w-100 btn-start-job" data-id="${asg.id}">🚀 Iniciar Trabajo</button>`;
      } else if (asg.status === 'En proceso') {
        actionHTML = `<button class="btn btn-success btn-sm w-100 btn-finish-job" data-id="${asg.id}">✅ Finalizar Trabajo</button>`;
      } else if (asg.status === 'Finalizado') {
        actionHTML = `
          <div style="font-size:0.75rem; color:var(--color-success); text-align:center; font-weight:700; background:rgba(34,197,94,0.05); padding:6px; border-radius:6px; border:1px solid rgba(34,197,94,0.15);">
            🎉 Completado el ${TimeService.formatDate(asg.completedAt, true)}
          </div>
        `;
      } else {
        actionHTML = `
          <div style="font-size:0.75rem; color:var(--color-error); text-align:center; font-weight:700; background:rgba(239,68,68,0.05); padding:6px; border-radius:6px; border:1px solid rgba(239,68,68,0.15);">
            ✕ Tarea Cancelada
          </div>
        `;
      }

      const phoneClean = asg.clientPhone ? asg.clientPhone.replace(/[^\d+]/g, '') : '';
      const whatsappMsg = encodeURIComponent(`Hola ${asg.clientName}, te saluda soporte técnico de ${this.currentUser.displayName}. Estoy asignado a tu servicio: ${asg.description.substring(0, 50)}...`);
      
      const contactBarHTML = asg.status !== 'Finalizado' && asg.status !== 'Cancelado' ? `
        <div class="contact-bar">
          <a class="contact-btn" href="tel:${phoneClean}" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--color-text-primary);">📞 Llamar</a>
          <a class="contact-btn" href="https://wa.me/${phoneClean.replace('+', '')}?text=${whatsappMsg}" target="_blank" rel="noopener" style="background: #25d366; color: #fff;">💬 WhatsApp</a>
          ${asg.clientEmail ? `<a class="contact-btn" href="mailto:${asg.clientEmail}" style="background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.2); color: var(--color-accent);">✉️ Correo</a>` : ''}
        </div>
      ` : '';

      const mapsLink = asg.clientMapsUrl 
        ? `<a href="${asg.clientMapsUrl}" target="_blank" rel="noopener" class="text-info" style="text-decoration:none; font-size:0.75rem;">🗺️ Google Maps</a>`
        : '';

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
            ${asg.clientReference ? `
              <div class="job-meta-item">
                <span class="job-meta-icon">🧭</span>
                <span><strong>Referencia:</strong> ${asg.clientReference}</span>
              </div>
            ` : ''}
            <div class="job-meta-item">
              <span class="job-meta-icon">⏰</span>
              <span>${scheduledStr}</span>
            </div>
            ${asg.internalObservations ? `
              <div class="job-meta-item" style="color:var(--color-warning);">
                <span class="job-meta-icon">⚠️</span>
                <span><strong>Notas de Admin:</strong> ${asg.internalObservations}</span>
              </div>
            ` : ''}
            ${executionHTML}
            ${asg.comments ? `
              <div class="job-meta-item" style="color:var(--color-success); border-top:1px solid rgba(255,255,255,0.05); padding-top:6px; margin-top:4px;">
                <span class="job-meta-icon">💬</span>
                <span><strong>Comentario de cierre:</strong> ${asg.comments}</span>
              </div>
            ` : ''}
            ${asg.photoUrl ? `
              <div class="job-meta-item">
                <span class="job-meta-icon">🖼️</span>
                <span><a href="${asg.photoUrl}" target="_blank" style="color:var(--color-accent); text-decoration:none;">📄 Ver archivo / foto adjunta</a></span>
              </div>
            ` : ''}
          </div>

          ${contactBarHTML}
          ${authModuleHTML}

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px; border-top:1px solid rgba(255,255,255,0.03); padding-top:8px;">
            <div style="display:flex; gap:6px;">
              <button class="btn btn-secondary btn-xs btn-view-technical" data-client-id="${asg.clientId}">📋 Ficha Técnica</button>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:0.75rem; color:${prioColor}; font-weight:700;">Prioridad: ${asg.priority}</span>
              ${mapsLink}
            </div>
          </div>

          <div style="margin-top:auto; padding-top:6px; border-top:1px solid rgba(255,255,255,0.05);">
            ${actionHTML}
          </div>
        </div>
      `;
    }).join('');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW CLIENT REGISTRATION FLOW (EMPLOYEE)
  // ═══════════════════════════════════════════════════════════════════════════

  renderRegisterClientTab() {
    if (this.state.confirmingNewClient) {
      this.renderConfirmationScreen();
      return;
    }

    const formVal = this.state.newClientForm;

    // Tracking/history of previous requests submitted
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
        <!-- Registration Form Card -->
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
              <input type="text" id="reg-address" class="input input-md" placeholder="Ej. Calle Principal 102" value="${formVal.address}" required />
            </div>

            <div class="form-group">
              <label class="form-label" for="reg-ref">Referencia de Ubicación <span class="form-label-required"></span></label>
              <input type="text" id="reg-ref" class="input input-md" placeholder="Ej. Frente a iglesia católica" value="${formVal.reference}" required />
            </div>

            <!-- GPS Capture Box -->
            <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:12px; border-radius:8px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <strong style="font-size:0.8rem; color:var(--color-text-primary);">📍 Ubicación GPS del Dispositivo</strong>
                <button type="button" class="btn btn-secondary btn-xs" id="btn-get-gps">🌍 Obtener ubicación actual</button>
              </div>
              
              <div id="gps-coords-display" style="font-size:0.75rem; color:var(--color-text-secondary);">
                ${formVal.gps 
                  ? `Latitud: <strong>${formVal.gps.lat}</strong>, Longitud: <strong>${formVal.gps.lng}</strong> (Capturado: ${TimeService.formatDate(formVal.gps.capturedAt, true)})`
                  : '⚠️ No se ha capturado la ubicación GPS del cliente en campo.'}
              </div>

              <div id="waiter-preview-map" style="height: 180px; border-radius: 6px; border:1px solid var(--color-border); margin-top:10px; display:${formVal.gps ? 'block' : 'none'}; z-index:5;"></div>
            </div>

            <div class="form-section-title">🛠️ Información de Servicio</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div class="form-group">
                <label class="form-label" for="reg-service">Tipo de Servicio Solicitado <span class="form-label-required"></span></label>
                <input type="text" id="reg-service" class="input input-md" placeholder="Ej. Instalación de CCTV" value="${formVal.serviceType}" required />
              </div>
              <div class="form-group">
                <label class="form-label" for="reg-priority">Prioridad Inicial <span class="form-label-required"></span></label>
                <select id="reg-priority" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-primary);" required>
                  <option value="Baja" ${formVal.priority === 'Baja' ? 'selected' : ''}>Baja</option>
                  <option value="Media" ${formVal.priority === 'Media' ? 'selected' : ''}>Media</option>
                  <option value="Alta" ${formVal.priority === 'Alta' ? 'selected' : ''}>Alta</option>
                  <option value="Urgente" ${formVal.priority === 'Urgente' ? 'selected' : ''}>Urgente</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="reg-desc">Descripción del Trabajo <span class="form-label-required"></span></label>
              <textarea id="reg-desc" class="input" style="height:60px; padding:10px;" placeholder="Describe detalladamente el problema o servicio..." required>${formVal.problemDescription}</textarea>
            </div>

            <div class="form-group">
              <label class="form-label" for="reg-equip">Equipos Instalados / Modelos (Opcional)</label>
              <input type="text" id="reg-equip" class="input input-md" placeholder="Ej. DVR Hikvision 4 Canales" value="${formVal.installedEquipment}" />
            </div>

            <div class="form-group">
              <label class="form-label" for="reg-obs">Observaciones Generales</label>
              <textarea id="reg-obs" class="input" style="height:50px; padding:10px;" placeholder="Notas adicionales del cliente...">${formVal.observations}</textarea>
            </div>

            <div style="display:flex; justify-content:flex-end; margin-top:10px;">
              <button type="submit" class="btn btn-primary">Siguiente: Previsualizar Resumen</button>
            </div>
          </form>
        </div>

        <!-- Tracking/Logs Side Card -->
        <div class="card p-5 animate-fade-in">
          <h3 class="text-xs font-bold uppercase tracking-wider mb-4" style="color:var(--color-accent);">Historial de Solicitudes</h3>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; text-align:left;">
              <thead>
                <tr style="border-bottom:1px solid var(--color-border); color:var(--color-text-secondary); font-size:0.7rem; font-weight:700;">
                  <th style="padding:6px 4px;">Cliente</th>
                  <th style="padding:6px 4px;">Fecha</th>
                  <th style="padding:6px 4px;">Servicio</th>
                  <th style="padding:6px 4px;">Estado</th>
                  <th style="padding:6px 4px;">Comentario</th>
                </tr>
              </thead>
              <tbody>
                ${trackingRows || '<tr><td colspan="5" style="text-align:center; padding:15px; color:var(--color-text-secondary); font-size:0.7rem;">No has enviado solicitudes aún.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Bind Geolocation button
    this.container.querySelector('#btn-get-gps')?.addEventListener('click', () => {
      this.triggerGPSCapture();
    });

    // Handle Form Submit (Goes to Confirmation Review screen)
    const form = this.container.querySelector('#emp-new-client-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();

      // Read values and store in state
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
        observations: form.querySelector('#reg-obs').value.trim(),
        serviceType: form.querySelector('#reg-service').value.trim(),
        problemDescription: form.querySelector('#reg-desc').value.trim(),
        installedEquipment: form.querySelector('#reg-equip').value.trim(),
        priority: form.querySelector('#reg-priority').value,
        gps: this.state.newClientForm.gps
      };

      this.state.confirmingNewClient = true;
      this.renderAssignments();
    });

    // Re-init map if GPS is already captured and stored in state
    if (formVal.gps) {
      this.loadLeaflet().then(() => {
        this.initMap('waiter-preview-map', formVal.gps.lat, formVal.gps.lng);
      });
    }
  }

  triggerGPSCapture() {
    const coordsDisplay = this.container.querySelector('#gps-coords-display');
    if (!navigator.geolocation) {
      alert('La geolocalización no está soportada por tu navegador.');
      return;
    }

    coordsDisplay.innerHTML = '⚡ Obteniendo coordenadas de satélite...';

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const timestamp = Date.now();

        this.state.newClientForm.gps = {
          lat,
          lng,
          capturedAt: timestamp
        };

        coordsDisplay.innerHTML = `Latitud: <strong>${lat}</strong>, Longitud: <strong>${lng}</strong> (Capturado: ${TimeService.formatDate(timestamp, true)})`;
        
        const mapContainer = this.container.querySelector('#waiter-preview-map');
        mapContainer.style.display = 'block';

        this.loadLeaflet().then(() => {
          this.initMap('waiter-preview-map', lat, lng);
        });
      },
      (error) => {
        console.error(error);
        alert(`No se pudo obtener la ubicación: ${error.message}`);
        coordsDisplay.innerHTML = '⚠️ Error al obtener coordenadas.';
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  renderConfirmationScreen() {
    const val = this.state.newClientForm;

    this.container.innerHTML = `
      <div class="card p-6 animate-fade-in" style="max-width:700px; margin:0 auto; grid-column:1 / -1;">
        <h3 class="text-md font-bold mb-4" style="color:var(--color-accent); border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:6px;">📋 Confirmar Datos del Cliente Antes de Enviar</h3>
        
        <div style="display:flex; flex-direction:column; gap:12px; font-size:0.85rem; color:var(--color-text-primary); margin-bottom:20px;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div>
              <span class="text-secondary" style="font-size:0.75rem; display:block;">Nombre del Cliente:</span>
              <strong>${val.displayName}</strong>
            </div>
            <div>
              <span class="text-secondary" style="font-size:0.75rem; display:block;">Empresa / Negocio:</span>
              <strong>${val.companyName || '—'}</strong>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div>
              <span class="text-secondary" style="font-size:0.75rem; display:block;">Teléfono Principal:</span>
              <strong>${val.phone}</strong>
            </div>
            <div>
              <span class="text-secondary" style="font-size:0.75rem; display:block;">Teléfono Secundario:</span>
              <strong>${val.phoneSecondary || '—'}</strong>
            </div>
          </div>

          <div>
            <span class="text-secondary" style="font-size:0.75rem; display:block;">Correo Electrónico:</span>
            <strong>${val.email}</strong>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; border-top:1px solid rgba(255,255,255,0.05); padding-top:8px;">
            <div>
              <span class="text-secondary" style="font-size:0.75rem; display:block;">Ciudad:</span>
              <strong>${val.city}</strong>
            </div>
            <div>
              <span class="text-secondary" style="font-size:0.75rem; display:block;">Departamento:</span>
              <strong>${val.department}</strong>
            </div>
          </div>

          <div>
            <span class="text-secondary" style="font-size:0.75rem; display:block;">Dirección de Domicilio:</span>
            <strong>${val.address}</strong>
          </div>

          <div>
            <span class="text-secondary" style="font-size:0.75rem; display:block;">Punto de Referencia:</span>
            <strong>${val.reference}</strong>
          </div>

          <div style="border-top:1px solid rgba(255,255,255,0.05); padding-top:8px; display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div>
              <span class="text-secondary" style="font-size:0.75rem; display:block;">Tipo de Servicio:</span>
              <strong>${val.serviceType}</strong>
            </div>
            <div>
              <span class="text-secondary" style="font-size:0.75rem; display:block;">Prioridad Inicial:</span>
              <strong>${val.priority}</strong>
            </div>
          </div>

          <div>
            <span class="text-secondary" style="font-size:0.75rem; display:block;">Descripción del Problema:</span>
            <div style="background:rgba(255,255,255,0.02); padding:8px; border-radius:4px; border:1px solid rgba(255,255,255,0.05);">${val.problemDescription}</div>
          </div>

          ${val.installedEquipment ? `
            <div>
              <span class="text-secondary" style="font-size:0.75rem; display:block;">Equipos Instalados:</span>
              <strong>${val.installedEquipment}</strong>
            </div>
          ` : ''}

          <!-- GPS map preview inside confirmation -->
          <div style="border-top:1px solid rgba(255,255,255,0.05); padding-top:8px;">
            <span class="text-secondary" style="font-size:0.75rem; display:block; margin-bottom:4px;">Ubicación GPS a Enviar:</span>
            ${val.gps 
              ? `Latitud: <strong>${val.gps.lat}</strong>, Longitud: <strong>${val.gps.lng}</strong>`
              : '<span class="text-error">⚠️ Sin datos GPS capturados.</span>'}
            <div id="employee-confirm-map" style="height: 180px; border-radius: 6px; border:1px solid var(--color-border); margin-top:8px; z-index:5; display:${val.gps ? 'block' : 'none'};"></div>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.05); padding-top:10px;">
          <button class="btn btn-secondary btn-sm" id="btn-confirm-back">✏️ Modificar Datos</button>
          <button class="btn btn-primary btn-sm" id="btn-confirm-send">🚀 Confirmar y Enviar al Dueño</button>
        </div>
      </div>
    `;

    // Bind back button
    this.container.querySelector('#btn-confirm-back')?.addEventListener('click', () => {
      this.state.confirmingNewClient = false;
      this.renderAssignments();
    });

    // Bind send button
    this.container.querySelector('#btn-confirm-send')?.addEventListener('click', async () => {
      const sendBtn = this.container.querySelector('#btn-confirm-send');
      sendBtn.disabled = true;
      sendBtn.textContent = 'Enviando petición...';

      try {
        const { db } = await import('../../../config/firebase.config.js');
        const { ref, push, set } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js');

        if (db) {
          const newRef = push(ref(db, `${this.companyId}/pending_clients`));
          const requestId = newRef.key;

          const requestData = {
            id: requestId,
            employeeId: this.uid,
            employeeName: this.currentUser.displayName || 'Técnico',
            createdAt: Date.now(),
            status: 'Pendiente',
            comment: '',
            // Personal
            displayName: val.displayName,
            companyName: val.companyName,
            phone: val.phone,
            phoneSecondary: val.phoneSecondary,
            email: val.email,
            address: val.address,
            city: val.city,
            department: val.department,
            reference: val.reference,
            observations: val.observations,
            // Service
            serviceType: val.serviceType,
            problemDescription: val.problemDescription,
            installedEquipment: val.installedEquipment,
            priority: val.priority,
            gps: val.gps || null
          };

          await set(newRef, requestData);

          // Push toast notify to DB for OWNER
          const notifRef = push(ref(db, `${this.companyId}/notifications`));
          await set(notifRef, {
            id: notifRef.key,
            toUid: 'OWNER',
            title: '👥 Nuevo Cliente Pendiente',
            message: `El empleado ${this.currentUser.displayName} pre-registró al cliente "${val.displayName}" en campo.`,
            timestamp: Date.now(),
            read: false
          });

          // Log Audit Trace
          await FirestoreService.logAudit({
            action: 'EMPLOYEE_REQUEST_CLIENT',
            companyId: this.companyId,
            description: `El empleado ${this.currentUser.displayName} (${this.currentUser.email}) solicitó pre-registrar el cliente "${val.displayName}" con GPS [${val.gps ? `${val.gps.lat}, ${val.gps.lng}` : 'Sin GPS'}].`
          });
        }

        NotificationService.success('Petición de registro enviada correctamente.');
        
        // Reset state newClientForm
        this.state.newClientForm = {
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
        };
        this.state.confirmingNewClient = false;
        this.renderAssignments();
      } catch (err) {
        console.error(err);
        alert(`Error al enviar datos: ${err.message || err}`);
        sendBtn.disabled = false;
        sendBtn.textContent = 'Confirmar y Enviar al Dueño';
      }
    });

    // Re-init map
    if (val.gps) {
      this.loadLeaflet().then(() => {
        this.initMap('employee-confirm-map', val.gps.lat, val.gps.lng);
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAP LEAFLET RESOURCE LOADER
  // ═══════════════════════════════════════════════════════════════════════════

  async loadLeaflet() {
    if (window.L) return window.L;

    return new Promise((resolve, reject) => {
      // Load CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      // Load JS
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
  // LIFE SOURCING STAGERS
  // ═══════════════════════════════════════════════════════════════════════════

  async updateStatus(id, newStatus, comments = '', photoUrl = '') {
    try {
      const { db } = await import('../../../config/firebase.config.js');
      const { ref, update, push, set } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js');

      if (db) {
        const timestamp = Date.now();
        const updates = {
          status: newStatus,
          completedAt: newStatus === 'Finalizado' ? timestamp : 0
        };

        if (comments) updates.comments = comments;
        if (photoUrl) updates.photoUrl = photoUrl;

        await update(ref(db, `${this.companyId}/assignments/${id}`), updates);

        const assignment = this.state.assignments.find(a => a.id === id);
        if (assignment) {
          const notifRef = push(ref(db, `${this.companyId}/notifications`));
          await set(notifRef, {
            id: notifRef.key,
            toUid: 'OWNER',
            title: '💼 Estado de Trabajo Actualizado',
            message: `El empleado ${this.currentUser.displayName} actualizó el estado de la tarea de ${assignment.clientName} a "${newStatus}"`,
            timestamp: timestamp,
            read: false
          });
        }
      }

      NotificationService.success(`Tarea actualizada a "${newStatus}" con éxito.`);
      this.loadMyAssignments();
    } catch (err) {
      console.error(err);
      NotificationService.error('Error al actualizar el estado de la tarea.');
    }
  }

  openFinishJobModal(id) {
    let modalOverlay = document.getElementById('finish-job-modal-container');
    if (modalOverlay) modalOverlay.remove();

    const formHTML = `
      <form id="finish-job-form" style="display:flex; flex-direction:column; gap: var(--space-3); color: var(--color-text-primary);">
        <div class="form-group">
          <label class="form-label" for="finish-comments">Comentarios o Notas de Cierre <span class="form-label-required"></span></label>
          <textarea id="finish-comments" class="input" style="height:100px; padding:10px;" placeholder="Describe detalladamente las reparaciones o el estado final del servicio..." required></textarea>
        </div>

        <div class="form-group">
          <label class="form-label" for="finish-photo">Fotografía de Evidencia / Archivo Adjunto (Opcional)</label>
          <input type="file" id="finish-photo" class="input input-md" accept="image/*,application/pdf" style="padding-top:6px;" />
          <span class="text-xs text-secondary">Sube una fotografía de evidencia o reporte en PDF.</span>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="finish-cancel-btn">Cancelar</button>
      <button class="btn btn-success btn-sm" id="finish-submit-btn">Completar Servicio</button>
    `;

    const finishModal = new Modal({
      title: '✅ Completar y Entregar Tarea',
      bodyHTML: formHTML,
      footerHTML: footerHTML,
      size: 'md'
    });

    const el = finishModal.mount();
    el.setAttribute('id', 'finish-job-modal-container');
    document.body.appendChild(el);

    el.querySelector('#finish-cancel-btn')?.addEventListener('click', () => finishModal.close());
    el.querySelector('#finish-submit-btn')?.addEventListener('click', async () => {
      const form = el.querySelector('#finish-job-form');
      if (!form || !form.reportValidity()) return;

      const submitBtn = el.querySelector('#finish-submit-btn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando informe...';

      const comments = el.querySelector('#finish-comments').value.trim();
      const fileInput = el.querySelector('#finish-photo');
      const file = fileInput?.files ? fileInput.files[0] : null;

      let photoUrl = '';
      try {
        if (file) {
          submitBtn.textContent = 'Subiendo archivo...';
          photoUrl = await StorageService.uploadFile(file, 'jobs');
        }

        await this.updateStatus(id, 'Finalizado', comments, photoUrl);

        const assignment = this.state.assignments.find(a => a.id === id);
        if (assignment) {
          const req = this.state.authRequests.find(r => r.clientId === assignment.clientId && r.assignmentId === assignment.id && r.status === 'Aprobado');
          if (req) {
            await this.expireRequest(req.id);
          }

          try {
            await FirestoreService.logAudit({
              action: 'EMPLOYEE_FINISH_JOB',
              companyId: this.companyId,
              description: `El empleado ${this.currentUser.displayName} (${this.currentUser.email}) completó el trabajo para el cliente ${assignment.clientName}. Comentario: ${comments}`
            });
          } catch (auditErr) {
            console.warn('[AuditLogs] Falló el registro de auditoría:', auditErr.message);
          }
        }

        finishModal.close();
      } catch (err) {
        console.error(err);
        alert(`Error al guardar informe: ${err.message || err}`);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Completar Servicio';
      }
    });
  }

  async expireRequest(requestId) {
    try {
      const { db } = await import('../../../config/firebase.config.js');
      const { ref, update } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js');

      if (db) {
        await update(ref(db, `${this.companyId}/auth_requests/${requestId}`), {
          status: 'Expirado',
          approvedData: null
        });

        const req = this.state.authRequests.find(r => r.id === requestId);
        if (req) {
          await FirestoreService.logAudit({
            action: 'CREDENTIALS_EXPIRED',
            companyId: this.companyId,
            description: `Acceso temporal de credenciales expirado para el técnico ${req.employeeName} (Cliente: ${req.clientName}). Datos de forma segura.`
          });
        }
      }

      NotificationService.success('Acceso revocado y datos eliminados.');
      this.loadMyAssignments();
    } catch (e) {
      console.error(e);
    }
  }

  startCountdownTicker() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = setInterval(async () => {
      let needsRefresh = false;
      const now = Date.now();

      for (const req of this.state.authRequests) {
        if (req.status === 'Aprobado' && req.expiresAt) {
          const remainSecs = Math.max(0, Math.floor((req.expiresAt - now) / 1000));
          const el = document.getElementById(`countdown-${req.id}`);
          
          if (el) {
            if (remainSecs > 0) {
              const min = Math.floor(remainSecs / 60);
              const sec = remainSecs % 60;
              el.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
            } else {
              needsRefresh = true;
              await this.expireRequest(req.id);
            }
          }
        }
      }

      if (needsRefresh) {
        this.renderAssignments();
      }
    }, 1000);
  }

  formatExecutionTime(assignedAt, completedAt) {
    if (!assignedAt || !completedAt) return '—';
    const diffMs = completedAt - assignedAt;
    if (diffMs <= 0) return 'Menos de 1 min';
    
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    const parts = [];
    if (diffDays > 0) {
      parts.push(`${diffDays} día${diffDays > 1 ? 's' : ''}`);
    }
    const remainHours = diffHours % 24;
    if (remainHours > 0) {
      parts.push(`${remainHours} hora${remainHours > 1 ? 's' : ''}`);
    }
    const remainMins = diffMins % 60;
    if (remainMins > 0 || parts.length === 0) {
      parts.push(`${remainMins} min`);
    }
    
    return parts.join(', ');
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
    this.layout.unmount();
    super.unmount();
  }
}
