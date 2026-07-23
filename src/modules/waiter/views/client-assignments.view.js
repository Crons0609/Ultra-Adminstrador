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
      activeTab: 'active', // 'active' | 'history'
      assignments: [],
      filters: {
        searchQuery: '',
        status: 'ALL',
        priority: 'ALL',
        dateAssigned: '',
        dateScheduled: ''
      }
    };

    this.layout = new PageLayout({
      title: 'Clientes Asignados',
      subtitle: 'Gestiona tus órdenes de trabajo diarias, reporta avances y consulta tu historial.',
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
        </style>

        <div class="assign-tabs">
          <button class="assign-tab-btn ${this.state.activeTab === 'active' ? 'active' : ''}" data-tab="active">⚡ Trabajos Activos</button>
          <button class="assign-tab-btn ${this.state.activeTab === 'history' ? 'active' : ''}" data-tab="history">📚 Historial de Trabajos</button>
        </div>

        <div id="waiter-filter-bar" style="margin-bottom: 20px;"></div>
        <div id="jobs-container" class="job-grid animate-fade-in"></div>
      `
    });

    this.dbUnsubscribe = null;
  }

  async mount() {
    const element = this.layout.mount();
    this.container = element.querySelector('#jobs-container');
    this.filterBar = element.querySelector('#waiter-filter-bar');

    this.setupTabListeners(element);
    this.bindActionEvents(element);

    await this.loadMyAssignments();
    this.subscribeToAssignments();

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
          this.renderAssignments();
        });
      });
    });
  }

  renderFilters() {
    const f = this.state.filters;
    const isHistory = this.state.activeTab === 'history';

    // Status filter dropdown options
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

    // Bind listeners
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
      // Tab filter
      const matchTab = isHistory 
        ? (asg.status === 'Finalizado' || asg.status === 'Cancelado')
        : (asg.status === 'Pendiente' || asg.status === 'En proceso');

      if (!matchTab) return false;

      // Text search
      const query = f.searchQuery.toLowerCase().trim();
      const matchText = !query || 
        asg.clientName.toLowerCase().includes(query) ||
        (asg.description && asg.description.toLowerCase().includes(query)) ||
        (asg.clientPhone && asg.clientPhone.toLowerCase().includes(query));

      // Status dropdown
      const matchStatus = f.status === 'ALL' || asg.status === f.status;

      // Priority dropdown
      const matchPriority = f.priority === 'ALL' || asg.priority === f.priority;

      // Date assigned
      const assignedDateStr = new Date(asg.assignedAt).toISOString().split('T')[0];
      const matchAssignedDate = !f.dateAssigned || assignedDateStr === f.dateAssigned;

      // Date scheduled
      const matchScheduledDate = !f.dateScheduled || asg.scheduledDate === f.dateScheduled;

      return matchText && matchStatus && matchPriority && matchAssignedDate && matchScheduledDate;
    });
  }

  renderAssignments() {
    if (!this.container) return;

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

      // Execution time display (for history)
      const executionHTML = asg.completedAt && asg.status === 'Finalizado'
        ? `
          <div class="job-meta-item" style="color:var(--color-success); font-weight:700;">
            <span class="job-meta-icon">⏳</span>
            <span><strong>Duración:</strong> ${this.formatExecutionTime(asg.assignedAt, asg.completedAt)}</span>
          </div>
        `
        : '';

      // Action triggers
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
            ✕ Cancelado
          </div>
        `;
      }

      // Quick Contact Actions
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

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
            <span style="font-size:0.75rem; color:${prioColor}; font-weight:700;">Prioridad: ${asg.priority}</span>
            ${mapsLink}
          </div>

          <div style="margin-top:auto; padding-top:6px; border-top:1px solid rgba(255,255,255,0.05);">
            ${actionHTML}
          </div>
        </div>
      `;
    }).join('');
  }

  bindActionEvents(element) {
    element.addEventListener('click', async (e) => {
      const startBtn = e.target.closest('.btn-start-job');
      if (startBtn) {
        const id = startBtn.getAttribute('data-id');
        const assignment = this.state.assignments.find(a => a.id === id);
        if (!assignment) return;

        if (confirm(`¿Deseas marcar el trabajo para "${assignment.clientName}" como En Proceso?`)) {
          await this.updateStatus(id, 'En proceso');
          
          // Log Audit Trace
          try {
            await FirestoreService.logAudit({
              action: 'EMPLOYEE_START_JOB',
              companyId: this.companyId,
              description: `El empleado ${this.currentUser.displayName} (${this.currentUser.email}) inició el trabajo para el cliente ${assignment.clientName} (ID: ${assignment.clientId}).`
            });
          } catch (auditErr) {
            console.warn('[AuditLogs] Falló el registro de auditoría:', auditErr.message);
          }
        }
        return;
      }

      const finishBtn = e.target.closest('.btn-finish-job');
      if (finishBtn) {
        const id = finishBtn.getAttribute('data-id');
        this.openFinishJobModal(id);
        return;
      }
    });
  }

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

        // Notify Owner
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

        // Log Audit Trace
        const assignment = this.state.assignments.find(a => a.id === id);
        if (assignment) {
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
    if (this.dbUnsubscribe) {
      this.dbUnsubscribe();
    }
    this.layout.unmount();
    super.unmount();
  }
}
