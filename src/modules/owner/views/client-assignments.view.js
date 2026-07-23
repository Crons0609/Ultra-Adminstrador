import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { GlobalStore } from '../../../core/state.js';
import { NotificationService } from '../../../services/notification.service.js';
import { TimeService } from '../../../services/time.service.js';
import { Modal } from '../../../components/ui/modal.js';
import { getBusinessCategory } from '../../../config/business-types.config.js';

export class ClientAssignmentsView extends Component {
  constructor(params = {}) {
    super(params);

    const { currentUser, currentCompany } = GlobalStore.getState();
    this.currentUser = currentUser || {};
    this.currentCompany = currentCompany || {};
    this.companyId = this.currentUser.companyId || '';
    this.branchId = this.currentUser.branchId || 'main';

    this.state = {
      activeTab: 'assign', // 'assign' | 'register' | 'history'
      employees: [],
      clients: [],
      assignments: [],
      filters: {
        searchQuery: '',
        status: 'ALL',
        priority: 'ALL',
        dateFrom: '',
        dateTo: ''
      }
    };

    const category = getBusinessCategory(this.currentCompany.businessType || '');
    this.isServiceRubro = (category === 'SERVICIOS_PERSONALIZADOS' || category === 'OTROS' || category === 'PERSONALIZADA');

    this.layout = new PageLayout({
      title: 'Asignación de Clientes a Empleados',
      subtitle: 'Distribuye tareas de servicio y mantén un seguimiento del estado de cada orden.',
      actionHTML: `
        <span class="badge" style="font-size: 0.75rem; padding: 4px 10px; border: 1px solid var(--color-border); display: flex; align-items: center; gap: 4px; background: rgba(139, 92, 246, 0.1); color: var(--color-accent);">
          🏢 Rubro: ${this.currentCompany.businessType || 'Servicios Varios'}
        </span>
      `,
      contentHTML: `
        <style>
          .assign-tabs {
            display: flex;
            gap: var(--space-2);
            border-bottom: 1px solid var(--color-border);
            margin-bottom: var(--space-6);
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
          }
          .assign-tab-btn:hover {
            color: var(--color-text-primary);
          }
          .assign-tab-btn.active {
            color: var(--color-accent);
            border-bottom-color: var(--color-accent);
          }
          .form-section-title {
            font-size: 0.95rem;
            font-weight: 700;
            color: var(--color-accent);
            margin: var(--space-4) 0 var(--space-3);
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            padding-bottom: var(--space-1);
          }
        </style>
        <div id="assign-dashboard-container"></div>
      `
    });

    this.dbUnsubscribe = null;
  }

  async mount() {
    const element = this.layout.mount();
    this.container = element.querySelector('#assign-dashboard-container');

    if (!this.isServiceRubro) {
      this.renderRubroWarning();
      return element;
    }

    this.renderTabs();
    this.renderActiveTabContent();
    this.setupTabListeners(element);

    // Initial load from Realtime Database
    await this.loadData();
    this.subscribeToRealtimeData();

    return element;
  }

  renderRubroWarning() {
    this.container.innerHTML = `
      <div class="card p-8 text-center" style="max-width: 600px; margin: var(--space-10) auto; border: 1px solid rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.02);">
        <div style="font-size: 3.5rem; margin-bottom: var(--space-4);">⚠️</div>
        <h3 class="text-xl font-bold mb-2" style="color: var(--color-error);">Funcionalidad Exclusiva de Servicios</h3>
        <p class="text-secondary mb-4">
          La sección de <strong>Asignación de Clientes</strong> está diseñada únicamente para negocios del rubro <strong>Servicios Varios</strong>, Mantenimiento, Talleres, Alquileres o Belleza.
        </p>
        <p class="text-xs text-secondary">
          Tu negocio está registrado actualmente bajo el rubro de: <span class="badge" style="background: var(--color-bg-tertiary); color: var(--color-text-primary);">${this.currentCompany.businessType || 'General'}</span>.
        </p>
      </div>
    `;
  }

  renderTabs() {
    this.container.innerHTML = `
      <div class="assign-tabs">
        <button class="assign-tab-btn ${this.state.activeTab === 'assign' ? 'active' : ''}" data-tab="assign">📝 Nueva Asignación</button>
        <button class="assign-tab-btn ${this.state.activeTab === 'register' ? 'active' : ''}" data-tab="register">👥 Registrar Cliente</button>
        <button class="assign-tab-btn ${this.state.activeTab === 'history' ? 'active' : ''}" data-tab="history">⏳ Historial de Asignaciones</button>
      </div>
      <div id="assign-tab-content"></div>
    `;
  }

  setupTabListeners(element) {
    element.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('.assign-tab-btn');
      if (tabBtn) {
        const tab = tabBtn.getAttribute('data-tab');
        element.querySelectorAll('.assign-tab-btn').forEach(btn => btn.classList.remove('active'));
        tabBtn.classList.add('active');
        this.state.activeTab = tab;
        this.renderActiveTabContent();
      }
    });
  }

  renderActiveTabContent() {
    const tabContent = this.container.querySelector('#assign-tab-content');
    if (!tabContent) return;

    if (this.state.activeTab === 'assign') {
      tabContent.innerHTML = this.getAssignFormHTML();
      this.bindAssignFormEvents(tabContent);
    } else if (this.state.activeTab === 'register') {
      tabContent.innerHTML = this.getRegisterClientFormHTML();
      this.bindRegisterClientFormEvents(tabContent);
    } else if (this.state.activeTab === 'history') {
      tabContent.innerHTML = this.getHistoryHTML();
      this.bindHistoryEvents(tabContent);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HTML BUILDERS & EVENT BINDINGS
  // ═══════════════════════════════════════════════════════════════════════════

  getAssignFormHTML() {
    const employeeOpts = this.state.employees.map(e => {
      const display = e.customRole ? `${e.displayName} (${e.customRole})` : `${e.displayName} (${e.role})`;
      return `<option value="${e.uid}">${display}</option>`;
    }).join('');

    const clientOpts = this.state.clients.map(c => {
      return `<option value="${c.id}">${c.displayName} — Tel: ${c.phone} (${c.serviceType || 'Servicio Vario'})</option>`;
    }).join('');

    return `
      <div class="card p-6 animate-fade-in" style="max-width: 700px; margin: 0 auto;">
        <h3 class="text-lg font-bold mb-4">📝 Asignar Cliente a Empleado</h3>
        <form id="client-assign-form" style="display:flex; flex-direction:column; gap: var(--space-4);">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
            <div class="form-group">
              <label class="form-label" for="asg-employee">Seleccionar Empleado <span class="form-label-required"></span></label>
              <select id="asg-employee" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-primary);" required>
                <option value="" disabled selected>Selecciona un empleado...</option>
                ${employeeOpts}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="asg-client">Seleccionar Cliente <span class="form-label-required"></span></label>
              <select id="asg-client" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-primary);" required>
                <option value="" disabled selected>Selecciona un cliente...</option>
                ${clientOpts}
              </select>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-3);">
            <div class="form-group">
              <label class="form-label" for="asg-date-scheduled">Fecha Programada (Opcional)</label>
              <input type="date" id="asg-date-scheduled" class="input input-md" />
            </div>
            <div class="form-group">
              <label class="form-label" for="asg-time-scheduled">Hora Programada (Opcional)</label>
              <input type="time" id="asg-time-scheduled" class="input input-md" />
            </div>
            <div class="form-group">
              <label class="form-label" for="asg-priority">Prioridad <span class="form-label-required"></span></label>
              <select id="asg-priority" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-primary);" required>
                <option value="Baja">🟢 Baja</option>
                <option value="Media" selected>🟡 Media</option>
                <option value="Alta">🟠 Alta</option>
                <option value="Urgente">🔴 Urgente</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="asg-description">Descripción del Trabajo / Tarea <span class="form-label-required"></span></label>
            <textarea id="asg-description" class="input" style="height: 100px; padding: 10px;" placeholder="Detalla el servicio requerido..." required></textarea>
          </div>

          <div class="form-group">
            <label class="form-label" for="asg-observations">Observaciones Internas</label>
            <textarea id="asg-observations" class="input" style="height: 70px; padding: 10px;" placeholder="Notas visibles solo para la administración..."></textarea>
          </div>

          <div class="d-flex justify-content-end gap-2 mt-2">
            <button type="submit" class="btn btn-primary" id="btn-submit-assignment">Crear Asignación</button>
          </div>
        </form>
      </div>
    `;
  }

  bindAssignFormEvents(contentEl) {
    const form = contentEl.querySelector('#client-assign-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const employeeId = form.querySelector('#asg-employee').value;
      const clientId = form.querySelector('#asg-client').value;
      const scheduledDate = form.querySelector('#asg-date-scheduled').value || '';
      const scheduledTime = form.querySelector('#asg-time-scheduled').value || '';
      const priority = form.querySelector('#asg-priority').value;
      const description = form.querySelector('#asg-description').value.trim();
      const internalObservations = form.querySelector('#asg-observations').value.trim();

      const employee = this.state.employees.find(emp => emp.uid === employeeId);
      const client = this.state.clients.find(cli => cli.id === clientId);

      if (!employee || !client) {
        NotificationService.error('Información incompleta para la asignación.');
        return;
      }

      const submitBtn = form.querySelector('#btn-submit-assignment');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';

      try {
        const { db } = await import('../../../config/firebase.config.js');
        const { ref, push, set } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js');

        if (db) {
          const assignmentRef = push(ref(db, `${this.companyId}/assignments`));
          const assignmentId = assignmentRef.key;

          const assignmentData = {
            id: assignmentId,
            clientId: clientId,
            clientName: client.displayName,
            clientPhone: client.phone,
            clientAddress: client.address || '—',
            clientReference: client.reference || '',
            clientMapsUrl: client.mapsUrl || '',
            employeeId: employeeId,
            employeeName: employee.displayName,
            assignedAt: Date.now(),
            scheduledDate: scheduledDate,
            scheduledTime: scheduledTime,
            priority: priority,
            status: 'Pendiente',
            description: description,
            internalObservations: internalObservations,
            comments: '',
            photoUrl: '',
            completedAt: 0
          };

          await set(assignmentRef, assignmentData);

          // Push push notification to DB for employee
          const notifRef = push(ref(db, `${this.companyId}/notifications`));
          await set(notifRef, {
            id: notifRef.key,
            toUid: employeeId,
            title: '🛠️ Nueva Tarea Asignada',
            message: `El cliente ${client.displayName} te ha sido asignado para: ${description.substring(0, 50)}...`,
            timestamp: Date.now(),
            read: false
          });
        }

        NotificationService.success('Asignación creada y guardada con éxito.');
        form.reset();
        this.state.activeTab = 'history';
        this.renderTabs();
        this.renderActiveTabContent();
      } catch (err) {
        console.error(err);
        NotificationService.error('Error al guardar la asignación.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Crear Asignación';
      }
    });
  }

  getRegisterClientFormHTML() {
    return `
      <div class="card p-6 animate-fade-in" style="max-width: 800px; margin: 0 auto;">
        <h3 class="text-lg font-bold mb-4">👥 Registrar Nuevo Cliente</h3>
        <form id="new-client-form" style="display:flex; flex-direction:column; gap: var(--space-4);">
          
          <div class="form-section-title">👤 Información de Contacto</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
            <div class="form-group">
              <label class="form-label" for="cli-name">Nombre Completo <span class="form-label-required"></span></label>
              <input type="text" id="cli-name" class="input input-md" placeholder="Ej. Carlos Martínez" required />
            </div>
            <div class="form-group">
              <label class="form-label" for="cli-phone">Teléfono <span class="form-label-required"></span></label>
              <input type="text" id="cli-phone" class="input input-md" placeholder="Ej. +505 8888-8888" required />
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
            <div class="form-group">
              <label class="form-label" for="cli-email">Correo Electrónico (Opcional)</label>
              <input type="email" id="cli-email" class="input input-md" placeholder="cliente@correo.com" />
            </div>
            <div class="form-group">
              <label class="form-label" for="cli-company">Empresa / Negocio (Opcional)</label>
              <input type="text" id="cli-company" class="input input-md" placeholder="Ej. Inversiones S.A." />
            </div>
          </div>

          <div class="form-section-title">📍 Dirección y Ubicación</div>
          <div style="display: grid; grid-template-columns: 1fr 2fr; gap: var(--space-3);">
            <div class="form-group">
              <label class="form-label" for="cli-city">Ciudad / Municipio <span class="form-label-required"></span></label>
              <input type="text" id="cli-city" class="input input-md" placeholder="Ej. Managua" required />
            </div>
            <div class="form-group">
              <label class="form-label" for="cli-address">Dirección de Domicilio <span class="form-label-required"></span></label>
              <input type="text" id="cli-address" class="input input-md" placeholder="Ej. Km 10 Carretera Masaya" required />
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
            <div class="form-group">
              <label class="form-label" for="cli-reference">Punto de Referencia <span class="form-label-required"></span></label>
              <input type="text" id="cli-reference" class="input input-md" placeholder="Ej. Frente a Gasolinera Puma" required />
            </div>
            <div class="form-group">
              <label class="form-label" for="cli-maps">Enlace Google Maps (Opcional)</label>
              <input type="url" id="cli-maps" class="input input-md" placeholder="https://maps.google.com/?q=..." />
            </div>
          </div>

          <div class="form-section-title">🛠️ Detalle del Servicio Inicial</div>
          <div class="form-group">
            <label class="form-label" for="cli-service">Tipo de Servicio Solicitado <span class="form-label-required"></span></label>
            <input type="text" id="cli-service" class="input input-md" placeholder="Ej. Reparación de A/C, Mantenimiento Preventivo" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="cli-description">Descripción del Problema o Tarea <span class="form-label-required"></span></label>
            <textarea id="cli-description" class="input" style="height: 80px; padding: 10px;" placeholder="Detalla el problema planteado por el cliente..." required></textarea>
          </div>
          <div class="form-group">
            <label class="form-label" for="cli-notes">Observaciones Generales</label>
            <textarea id="cli-notes" class="input" style="height: 60px; padding: 10px;" placeholder="Detalles de facturación, condiciones, etc."></textarea>
          </div>

          <div class="d-flex justify-content-end gap-2 mt-2">
            <button type="submit" class="btn btn-primary" id="btn-submit-client">Registrar Cliente</button>
          </div>
        </form>
      </div>
    `;
  }

  bindRegisterClientFormEvents(contentEl) {
    const form = contentEl.querySelector('#new-client-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = form.querySelector('#cli-name').value.trim();
      const phone = form.querySelector('#cli-phone').value.trim();
      const email = form.querySelector('#cli-email').value.trim();
      const companyName = form.querySelector('#cli-company').value.trim();
      const city = form.querySelector('#cli-city').value.trim();
      const address = form.querySelector('#cli-address').value.trim();
      const reference = form.querySelector('#cli-reference').value.trim();
      const mapsUrl = form.querySelector('#cli-maps').value.trim();
      const serviceType = form.querySelector('#cli-service').value.trim();
      const problemDescription = form.querySelector('#cli-description').value.trim();
      const notes = form.querySelector('#cli-notes').value.trim();

      const submitBtn = form.querySelector('#btn-submit-client');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Registrando...';

      try {
        const { db } = await import('../../../config/firebase.config.js');
        const { ref, push, set } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js');

        if (db) {
          const clientRef = push(ref(db, `${this.companyId}/clients`));
          const clientId = clientRef.key;

          const clientData = {
            id: clientId,
            displayName: name,
            phone: phone,
            email: email,
            address: address,
            city: city,
            reference: reference,
            mapsUrl: mapsUrl,
            companyName: companyName,
            serviceType: serviceType,
            problemDescription: problemDescription,
            notes: notes,
            createdAt: Date.now()
          };

          await set(clientRef, clientData);
        }

        NotificationService.success(`Cliente "${name}" registrado correctamente.`);
        form.reset();
        this.state.activeTab = 'assign';
        this.renderTabs();
        this.renderActiveTabContent();
      } catch (err) {
        console.error(err);
        NotificationService.error('Error al guardar el perfil del cliente.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Registrar Cliente';
      }
    });
  }

  getHistoryHTML() {
    const listItems = this.getFilteredAssignments().map(asg => {
      const prioColor = {
        Baja: 'var(--color-success)',
        Media: 'var(--color-warning)',
        Alta: '#ea580c',
        Urgente: 'var(--color-error)'
      }[asg.priority] || 'var(--color-text-secondary)';

      const statusColor = {
        Pendiente: 'rgba(234, 179, 8, 0.1)',
        'En proceso': 'rgba(59, 130, 246, 0.1)',
        Finalizado: 'rgba(34, 197, 94, 0.1)',
        Cancelado: 'rgba(239, 68, 68, 0.1)'
      }[asg.status] || 'rgba(255, 255, 255, 0.05)';

      const statusTextColor = {
        Pendiente: 'var(--color-warning)',
        'En proceso': 'var(--color-info)',
        Finalizado: 'var(--color-success)',
        Cancelado: 'var(--color-error)'
      }[asg.status] || 'var(--color-text-primary)';

      const scheduledStr = asg.scheduledDate ? `${TimeService.formatDate(asg.scheduledDate)} ${asg.scheduledTime}` : 'Sin programar';
      const finishStr = asg.completedAt ? TimeService.formatDate(asg.completedAt, true) : '—';

      return `
        <tr style="border-bottom: 1px solid var(--color-border); font-size: 0.8rem;">
          <td style="padding: 12px 8px;">
            <strong style="color:var(--color-text-primary);">${asg.clientName}</strong>
            <div style="font-size:0.7rem; color:var(--color-text-secondary);">${asg.clientPhone}</div>
          </td>
          <td style="padding: 12px 8px; color:var(--color-text-primary);">${asg.employeeName}</td>
          <td style="padding: 12px 8px; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${asg.description}">
            ${asg.description}
          </td>
          <td style="padding: 12px 8px;">
            <span class="badge" style="background:${statusColor}; color:${statusTextColor}; font-size:0.7rem; padding: 2px 6px;">
              ${asg.status}
            </span>
          </td>
          <td style="padding: 12px 8px;">
            <span style="color:${prioColor}; font-weight:bold;">● ${asg.priority}</span>
          </td>
          <td style="padding: 12px 8px; color:var(--color-text-secondary);">${TimeService.formatDate(asg.assignedAt)}</td>
          <td style="padding: 12px 8px; color:var(--color-text-secondary);">${scheduledStr}</td>
          <td style="padding: 12px 8px; color:var(--color-text-secondary);">${finishStr}</td>
          <td style="padding: 12px 8px;">
            <div style="display:flex; gap:4px;">
              <button class="btn btn-secondary btn-xs btn-edit-asg" data-id="${asg.id}">✏️</button>
              <button class="btn btn-danger btn-xs btn-cancel-asg" data-id="${asg.id}">✕</button>
              <button class="btn btn-danger btn-xs btn-delete-asg" data-id="${asg.id}">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="card p-5 animate-fade-in">
        <h3 class="text-md font-bold mb-4">⏳ Historial de Asignaciones de Servicios</h3>
        
        <!-- Filtros reactivos -->
        <div style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap:10px; margin-bottom: 20px;">
          <input type="text" id="hist-search" class="input input-md" placeholder="Buscar cliente o empleado..." value="${this.state.filters.searchQuery}" />
          <select id="hist-status" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-primary);">
            <option value="ALL" ${this.state.filters.status === 'ALL' ? 'selected' : ''}>Todos los Estados</option>
            <option value="Pendiente" ${this.state.filters.status === 'Pendiente' ? 'selected' : ''}>Pendientes</option>
            <option value="En proceso" ${this.state.filters.status === 'En proceso' ? 'selected' : ''}>En Proceso</option>
            <option value="Finalizado" ${this.state.filters.status === 'Finalizado' ? 'selected' : ''}>Finalizados</option>
            <option value="Cancelado" ${this.state.filters.status === 'Cancelado' ? 'selected' : ''}>Cancelados</option>
          </select>
          <select id="hist-priority" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-primary);">
            <option value="ALL" ${this.state.filters.priority === 'ALL' ? 'selected' : ''}>Todas las Prioridades</option>
            <option value="Baja" ${this.state.filters.priority === 'Baja' ? 'selected' : ''}>Baja</option>
            <option value="Media" ${this.state.filters.priority === 'Media' ? 'selected' : ''}>Media</option>
            <option value="Alta" ${this.state.filters.priority === 'Alta' ? 'selected' : ''}>Alta</option>
            <option value="Urgente" ${this.state.filters.priority === 'Urgente' ? 'selected' : ''}>Urgente</option>
          </select>
          <div style="display:flex; gap:4px;">
            <input type="date" id="hist-from" class="input input-md" style="font-size:0.75rem;" value="${this.state.filters.dateFrom}" title="Fecha Desde" />
            <input type="date" id="hist-to" class="input input-md" style="font-size:0.75rem;" value="${this.state.filters.dateTo}" title="Fecha Hasta" />
          </div>
        </div>

        <!-- Tabla -->
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; text-align:left;">
            <thead>
              <tr style="border-bottom:2px solid var(--color-border); color:var(--color-text-secondary); font-size:0.75rem; font-weight:700;">
                <th style="padding:8px;">Cliente</th>
                <th style="padding:8px;">Empleado</th>
                <th style="padding:8px;">Descripción</th>
                <th style="padding:8px;">Estado</th>
                <th style="padding:8px;">Prioridad</th>
                <th style="padding:8px;">Asignado</th>
                <th style="padding:8px;">Programado</th>
                <th style="padding:8px;">Completado</th>
                <th style="padding:8px;">Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${listItems || '<tr><td colspan="9" style="text-align:center; padding: 30px; color:var(--color-text-secondary);">No se encontraron asignaciones que coincidan con los filtros.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  getFilteredAssignments() {
    const f = this.state.filters;
    return this.state.assignments.filter(asg => {
      const searchLower = f.searchQuery.toLowerCase();
      const matchSearch = !f.searchQuery || 
        asg.clientName.toLowerCase().includes(searchLower) ||
        asg.employeeName.toLowerCase().includes(searchLower) ||
        (asg.description && asg.description.toLowerCase().includes(searchLower));

      const matchStatus = f.status === 'ALL' || asg.status === f.status;
      const matchPriority = f.priority === 'ALL' || asg.priority === f.priority;

      const assignedDateStr = new Date(asg.assignedAt).toISOString().split('T')[0];
      const matchFrom = !f.dateFrom || assignedDateStr >= f.dateFrom;
      const matchTo = !f.dateTo || assignedDateStr <= f.dateTo;

      return matchSearch && matchStatus && matchPriority && matchFrom && matchTo;
    });
  }

  bindHistoryEvents(contentEl) {
    const bindFilter = (id, stateKey) => {
      contentEl.querySelector(`#${id}`)?.addEventListener('input', (e) => {
        this.state.filters[stateKey] = e.target.value;
        this.renderActiveTabContent();
      });
    };

    bindFilter('hist-search', 'searchQuery');
    bindFilter('hist-status', 'status');
    bindFilter('hist-priority', 'priority');
    bindFilter('hist-from', 'dateFrom');
    bindFilter('hist-to', 'dateTo');

    contentEl.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.btn-edit-asg');
      if (editBtn) {
        const id = editBtn.getAttribute('data-id');
        this.openEditAssignmentModal(id);
        return;
      }

      const cancelBtn = e.target.closest('.btn-cancel-asg');
      if (cancelBtn) {
        const id = cancelBtn.getAttribute('data-id');
        if (confirm('¿Deseas marcar esta asignación como Cancelada?')) {
          this.updateAssignmentStatus(id, 'Cancelado');
        }
        return;
      }

      const deleteBtn = e.target.closest('.btn-delete-asg');
      if (deleteBtn) {
        const id = deleteBtn.getAttribute('data-id');
        if (confirm('¿Estás seguro de que deseas eliminar permanentemente esta asignación?')) {
          this.deleteAssignment(id);
        }
        return;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FIREBASE REALTIME DATABASE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  async loadData() {
    try {
      const { db } = await import('../../../config/firebase.config.js');
      const { ref, get } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js');

      if (!db || !this.companyId) return;

      const empSnapshot = await get(ref(db, `${this.companyId}/employees`));
      if (empSnapshot.exists()) {
        const data = empSnapshot.val();
        this.state.employees = Object.keys(data)
          .map(k => ({ uid: k, ...data[k] }))
          .filter(e => e.role !== 'SUPER_ADMIN' && e.role !== 'OWNER' && e.active !== false);
      }

      const cliSnapshot = await get(ref(db, `${this.companyId}/clients`));
      if (cliSnapshot.exists()) {
        const data = cliSnapshot.val();
        this.state.clients = Object.keys(data).map(k => ({ id: k, ...data[k] }));
      }

      const asgSnapshot = await get(ref(db, `${this.companyId}/assignments`));
      if (asgSnapshot.exists()) {
        const data = asgSnapshot.val();
        this.state.assignments = Object.keys(data)
          .map(k => ({ id: k, ...data[k] }))
          .sort((a, b) => b.assignedAt - a.assignedAt);
      }

      this.renderActiveTabContent();
    } catch (e) {
      console.error(e);
    }
  }

  subscribeToRealtimeData() {
    import('../../../config/firebase.config.js').then(({ db }) => {
      import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js').then(({ ref, onValue }) => {
        if (!db || !this.companyId) return;

        this.dbUnsubscribe = onValue(ref(db, `${this.companyId}/assignments`), (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.val();
            this.state.assignments = Object.keys(data)
              .map(k => ({ id: k, ...data[k] }))
              .sort((a, b) => b.assignedAt - a.assignedAt);
          } else {
            this.state.assignments = [];
          }
          if (this.state.activeTab === 'history') {
            this.renderActiveTabContent();
          }
        });
      });
    });
  }

  async updateAssignmentStatus(id, newStatus) {
    try {
      const { db } = await import('../../../config/firebase.config.js');
      const { ref, update, push, set } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js');

      if (db) {
        await update(ref(db, `${this.companyId}/assignments/${id}`), {
          status: newStatus,
          completedAt: newStatus === 'Finalizado' ? Date.now() : 0
        });

        const assignment = this.state.assignments.find(a => a.id === id);
        if (assignment) {
          const notifRef = push(ref(db, `${this.companyId}/notifications`));
          await set(notifRef, {
            id: notifRef.key,
            toUid: 'OWNER',
            title: '💼 Estado de Trabajo Actualizado',
            message: `El empleado ${assignment.employeeName} actualizó el estado de la tarea para ${assignment.clientName} a "${newStatus}"`,
            timestamp: Date.now(),
            read: false
          });
        }
      }

      NotificationService.success(`Asignación marcada como ${newStatus}.`);
      this.loadData();
    } catch (e) {
      console.error(e);
      NotificationService.error('Error al actualizar estado.');
    }
  }

  async deleteAssignment(id) {
    try {
      const { db } = await import('../../../config/firebase.config.js');
      const { ref, remove } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js');

      if (db) {
        await remove(ref(db, `${this.companyId}/assignments/${id}`));
      }

      NotificationService.success('Asignación eliminada permanentemente.');
      this.loadData();
    } catch (e) {
      console.error(e);
      NotificationService.error('Error al eliminar la asignación.');
    }
  }

  openEditAssignmentModal(id) {
    const asg = this.state.assignments.find(a => a.id === id);
    if (!asg) return;

    let modalOverlay = document.getElementById('edit-assignment-modal-container');
    if (modalOverlay) modalOverlay.remove();

    const employeeOpts = this.state.employees.map(e => {
      const selected = e.uid === asg.employeeId ? 'selected' : '';
      return `<option value="${e.uid}" ${selected}>${e.displayName}</option>`;
    }).join('');

    const formHTML = `
      <form id="edit-asg-form" style="display:flex; flex-direction:column; gap: var(--space-3); color: var(--color-text-primary);">
        <div class="form-group">
          <label class="form-label">Cliente</label>
          <input type="text" class="input input-md" value="${asg.clientName}" disabled style="opacity: 0.6;" />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="edit-asg-employee">Reasignar Empleado</label>
            <select id="edit-asg-employee" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              ${employeeOpts}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="edit-asg-priority">Prioridad</label>
            <select id="edit-asg-priority" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
              <option value="Baja" ${asg.priority === 'Baja' ? 'selected' : ''}>🟢 Baja</option>
              <option value="Media" ${asg.priority === 'Media' ? 'selected' : ''}>🟡 Media</option>
              <option value="Alta" ${asg.priority === 'Alta' ? 'selected' : ''}>🟠 Alta</option>
              <option value="Urgente" ${asg.priority === 'Urgente' ? 'selected' : ''}>🔴 Urgente</option>
            </select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="edit-asg-date">Fecha Programada</label>
            <input type="date" id="edit-asg-date" class="input input-md" value="${asg.scheduledDate || ''}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="edit-asg-time">Hora Programada</label>
            <input type="time" id="edit-asg-time" class="input input-md" value="${asg.scheduledTime || ''}" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="edit-asg-status">Estado del Servicio</label>
          <select id="edit-asg-status" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);">
            <option value="Pendiente" ${asg.status === 'Pendiente' ? 'selected' : ''}>🟡 Pendiente</option>
            <option value="En proceso" ${asg.status === 'En proceso' ? 'selected' : ''}>🔵 En proceso</option>
            <option value="Finalizado" ${asg.status === 'Finalizado' ? 'selected' : ''}>🟢 Finalizado</option>
            <option value="Cancelado" ${asg.status === 'Cancelado' ? 'selected' : ''}>🔴 Cancelado</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="edit-asg-description">Descripción de la Tarea</label>
          <textarea id="edit-asg-description" class="input" style="height:70px; padding:10px;" required>${asg.description}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label" for="edit-asg-notes">Observaciones Internas</label>
          <textarea id="edit-asg-notes" class="input" style="height:60px; padding:10px;">${asg.internalObservations || ''}</textarea>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="edit-asg-cancel-btn">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="edit-asg-submit-btn">Guardar Cambios</button>
    `;

    const editModal = new Modal({
      title: '✏️ Editar y Reasignar Tarea',
      bodyHTML: formHTML,
      footerHTML: footerHTML,
      size: 'md'
    });

    const el = editModal.mount();
    el.setAttribute('id', 'edit-assignment-modal-container');
    document.body.appendChild(el);

    el.querySelector('#edit-asg-cancel-btn')?.addEventListener('click', () => editModal.close());
    el.querySelector('#edit-asg-submit-btn')?.addEventListener('click', async () => {
      const form = el.querySelector('#edit-asg-form');
      if (!form || !form.reportValidity()) return;

      const employeeId = el.querySelector('#edit-asg-employee').value;
      const priority = el.querySelector('#edit-asg-priority').value;
      const scheduledDate = el.querySelector('#edit-asg-date').value;
      const scheduledTime = el.querySelector('#edit-asg-time').value;
      const status = el.querySelector('#edit-asg-status').value;
      const description = el.querySelector('#edit-asg-description').value.trim();
      const internalObservations = el.querySelector('#edit-asg-notes').value.trim();

      const employee = this.state.employees.find(emp => emp.uid === employeeId);
      if (!employee) return;

      const submitBtn = el.querySelector('#edit-asg-submit-btn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';

      try {
        const { db } = await import('../../../config/firebase.config.js');
        const { ref, update, push, set } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js');

        if (db) {
          const updates = {
            employeeId: employeeId,
            employeeName: employee.displayName,
            priority: priority,
            scheduledDate: scheduledDate,
            scheduledTime: scheduledTime,
            status: status,
            description: description,
            internalObservations: internalObservations,
            completedAt: status === 'Finalizado' ? Date.now() : 0
          };

          await update(ref(db, `${this.companyId}/assignments/${id}`), updates);

          if (employeeId !== asg.employeeId) {
            const notifRef = push(ref(db, `${this.companyId}/notifications`));
            await set(notifRef, {
              id: notifRef.key,
              toUid: employeeId,
              title: '🛠️ Tarea Reasignada',
              message: `Se te ha reasignado el servicio para ${asg.clientName}: ${description.substring(0, 50)}...`,
              timestamp: Date.now(),
              read: false
            });
          }
        }

        NotificationService.success('Tarea actualizada con éxito.');
        editModal.close();
        this.loadData();
      } catch (err) {
        console.error(err);
        alert(`Error al guardar cambios: ${err.message || err}`);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar Cambios';
      }
    });
  }

  unmount() {
    if (this.dbUnsubscribe) {
      this.dbUnsubscribe();
    }
    this.layout.unmount();
    super.unmount();
  }
}
