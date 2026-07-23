import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { GlobalStore } from '../../../core/state.js';
import { NotificationService } from '../../../services/notification.service.js';
import { TimeService } from '../../../services/time.service.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { Modal } from '../../../components/ui/modal.js';
import { getBusinessCategory } from '../../../config/business-types.config.js';
import { EncryptionService } from '../../../utils/encryption.js';

export class ClientAssignmentsView extends Component {
  constructor(params = {}) {
    super(params);

    const { currentUser, currentCompany } = GlobalStore.getState();
    this.currentUser = currentUser || {};
    this.currentCompany = currentCompany || {};
    this.companyId = this.currentUser.companyId || '';
    this.branchId = this.currentUser.branchId || 'main';

    this.state = {
      activeTab: 'assign', // 'assign' | 'register' | 'history' | 'authorizations' | 'pending-clients'
      employees: [],
      clients: [],
      assignments: [],
      authRequests: [],
      pendingClients: [], // Requests sent by employees waiting for approval
      activePendingClientId: null, // Selected request to review
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
      title: 'Asignación de Clientes y Autorizaciones',
      subtitle: 'Distribuye tareas de servicio, registra fichas técnicas y autoriza credenciales de forma segura.',
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
            white-space: nowrap;
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
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .accordion-content {
            transition: max-height 0.3s ease-out;
            overflow: hidden;
          }
          .split-container {
            display: grid;
            grid-template-columns: 1fr;
            gap: var(--space-5);
          }
          @media (min-width: 992px) {
            .split-container { grid-template-columns: 1fr 2fr; }
          }
          .pending-list-item {
            padding: 12px;
            border-radius: var(--radius-md);
            border: 1px solid var(--color-border);
            background: var(--color-bg-secondary);
            cursor: pointer;
            transition: all var(--transition-fast);
            margin-bottom: 8px;
          }
          .pending-list-item:hover {
            border-color: var(--color-accent);
            background: rgba(255,255,255,0.02);
          }
          .pending-list-item.active {
            border-color: var(--color-accent);
            background: rgba(139,92,246,0.05);
          }
        </style>
        <div id="assign-dashboard-container"></div>
      `
    });

    this.dbUnsubscribe = null;
    this.authRequestsUnsubscribe = null;
    this.pendingClientsUnsubscribe = null;
    this.sweeperInterval = null;
    this.maps = {};
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

    await this.loadData();
    this.subscribeToRealtimeData();

    this.startExpirationSweeper();

    return element;
  }

  renderRubroWarning() {
    this.container.innerHTML = `
      <div class="card p-8 text-center" style="max-width: 600px; margin: var(--space-10) auto; border: 1px solid rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.02);">
        <div style="font-size: 3.5rem; margin-bottom: var(--space-4);">⚠️</div>
        <h3 class="text-xl font-bold mb-2" style="color: var(--color-error);">Funcionalidad Exclusiva de Servicios</h3>
        <p class="text-secondary mb-4">
          La sección de <strong>Asignación de Clientes y Autorizaciones</strong> está diseñada únicamente para negocios del rubro <strong>Servicios Varios</strong>.
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
        <button class="assign-tab-btn ${this.state.activeTab === 'authorizations' ? 'active' : ''}" data-tab="authorizations">🔑 Autorizaciones</button>
        <button class="assign-tab-btn ${this.state.activeTab === 'pending-clients' ? 'active' : ''}" data-tab="pending-clients">📂 Clientes Pendientes</button>
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
    } else if (this.state.activeTab === 'authorizations') {
      tabContent.innerHTML = this.getAuthorizationsHTML();
      this.bindAuthorizationsEvents(tabContent);
    } else if (this.state.activeTab === 'pending-clients') {
      tabContent.innerHTML = this.getPendingClientsHTML();
      this.bindPendingClientsEvents(tabContent);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLIENT REGISTRATIONS SUBMITTED BY EMPLOYEES (OWNER APPROVAL PANEL)
  // ═══════════════════════════════════════════════════════════════════════════

  getPendingClientsHTML() {
    const pendingRequests = this.state.pendingClients.filter(c => c.status === 'Pendiente');
    
    // Left column list
    const listItemsHTML = pendingRequests.map(req => {
      const activeClass = this.state.activePendingClientId === req.id ? 'active' : '';
      return `
        <div class="pending-list-item ${activeClass}" data-req-id="${req.id}">
          <div style="font-weight:700; color:var(--color-text-primary); font-size:0.85rem;">${req.displayName}</div>
          <div style="font-size:0.7rem; color:var(--color-accent); margin-top:2px;">Registró: ${req.employeeName}</div>
          <div style="font-size:0.65rem; color:var(--color-text-secondary); margin-top:2px;">Fecha: ${TimeService.formatDate(req.createdAt, true)}</div>
        </div>
      `;
    }).join('');

    // Right column details workspace
    let detailsHTML = '';
    const activeReq = pendingRequests.find(r => r.id === this.state.activePendingClientId);

    if (activeReq) {
      detailsHTML = `
        <div class="card p-6 animate-fade-in" style="display:flex; flex-direction:column; gap:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:10px; margin-bottom:8px;">
            <div>
              <h4 class="font-bold text-md" style="color:var(--color-text-primary);">Revisar Cliente: ${activeReq.displayName}</h4>
              <span style="font-size:0.75rem; color:var(--color-text-secondary);">Enviado por <strong>${activeReq.employeeName}</strong> el ${TimeService.formatDate(activeReq.createdAt, true)}</span>
            </div>
            <span class="badge" style="background:rgba(234,179,8,0.1); color:var(--color-warning); font-size:0.7rem;">Pendiente</span>
          </div>

          <form id="review-client-form" style="display:flex; flex-direction:column; gap:10px;">
            <div class="form-section-title">👤 Datos de Contacto y Personales</div>
            
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div class="form-group">
                <label class="form-label" for="rev-name">Nombre Completo</label>
                <input type="text" id="rev-name" class="input input-md" value="${activeReq.displayName}" required />
              </div>
              <div class="form-group">
                <label class="form-label" for="rev-company">Empresa / Negocio</label>
                <input type="text" id="rev-company" class="input input-md" value="${activeReq.companyName || ''}" />
              </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div class="form-group">
                <label class="form-label" for="rev-phone">Teléfono Principal</label>
                <input type="text" id="rev-phone" class="input input-md" value="${activeReq.phone}" required />
              </div>
              <div class="form-group">
                <label class="form-label" for="rev-phone-sec">Teléfono Secundario</label>
                <input type="text" id="rev-phone-sec" class="input input-md" value="${activeReq.phoneSecondary || ''}" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="rev-email">Correo Electrónico</label>
              <input type="email" id="rev-email" class="input input-md" value="${activeReq.email || ''}" required />
            </div>

            <div class="form-section-title">📍 Ubicación Física</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div class="form-group">
                <label class="form-label" for="rev-city">Ciudad / Municipio</label>
                <input type="text" id="rev-city" class="input input-md" value="${activeReq.city}" required />
              </div>
              <div class="form-group">
                <label class="form-label" for="rev-dept">Departamento / Provincia</label>
                <input type="text" id="rev-dept" class="input input-md" value="${activeReq.department || ''}" required />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="rev-address">Dirección de Domicilio</label>
              <input type="text" id="rev-address" class="input input-md" value="${activeReq.address}" required />
            </div>

            <div class="form-group">
              <label class="form-label" for="rev-ref">Referencia de Ubicación</label>
              <input type="text" id="rev-ref" class="input input-md" value="${activeReq.reference}" required />
            </div>

            <!-- GPS Coordinates Map Panel -->
            <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:10px; border-radius:6px; margin-top:4px;">
              <strong style="font-size:0.78rem; display:block; margin-bottom:4px; color:var(--color-text-primary);">🗺️ Coordenadas GPS del Registro</strong>
              ${activeReq.gps 
                ? `<span style="font-size:0.72rem; color:var(--color-text-secondary);">Latitud: <strong>${activeReq.gps.lat}</strong>, Longitud: <strong>${activeReq.gps.lng}</strong> (Capturado: ${TimeService.formatDate(activeReq.gps.capturedAt, true)})</span>
                   <div id="owner-review-map" style="height: 180px; border-radius: 6px; border:1px solid var(--color-border); margin-top:8px; z-index:5;"></div>`
                : '<span class="text-error" style="font-size:0.75rem;">⚠️ No se capturaron coordenadas GPS para este cliente.</span>'}
            </div>

            <div class="form-section-title">🛠️ Especificaciones de Servicio</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div class="form-group">
                <label class="form-label" for="rev-service">Tipo de Servicio</label>
                <input type="text" id="rev-service" class="input input-md" value="${activeReq.serviceType}" required />
              </div>
              <div class="form-group">
                <label class="form-label" for="rev-priority">Prioridad Inicial</label>
                <select id="rev-priority" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-primary);">
                  <option value="Baja" ${activeReq.priority === 'Baja' ? 'selected' : ''}>Baja</option>
                  <option value="Media" ${activeReq.priority === 'Media' ? 'selected' : ''}>Media</option>
                  <option value="Alta" ${activeReq.priority === 'Alta' ? 'selected' : ''}>Alta</option>
                  <option value="Urgente" ${activeReq.priority === 'Urgente' ? 'selected' : ''}>Urgente</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="rev-desc">Descripción del Trabajo</label>
              <textarea id="rev-desc" class="input" style="height:55px; padding:10px;" required>${activeReq.problemDescription}</textarea>
            </div>

            <div class="form-group">
              <label class="form-label" for="rev-equip">Equipos Instalados (Ficha Técnica Inicial)</label>
              <input type="text" id="rev-equip" class="input input-md" value="${activeReq.installedEquipment || ''}" />
            </div>

            <div class="form-group">
              <label class="form-label" for="rev-obs">Observaciones Generales</label>
              <textarea id="rev-obs" class="input" style="height:50px; padding:10px;">${activeReq.observations || ''}</textarea>
            </div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.05); padding-top:12px; margin-top:8px;">
              <button type="button" class="btn btn-danger btn-sm" id="btn-reject-client">❌ Rechazar Registro</button>
              <button type="button" class="btn btn-primary btn-sm" id="btn-approve-client">✅ Aprobar y Crear Cliente</button>
            </div>
          </form>
        </div>
      `;
    } else {
      detailsHTML = `
        <div class="card p-10 text-center text-secondary animate-fade-in">
          <div style="font-size:3rem; margin-bottom:10px;">📂</div>
          <h4 class="font-bold">Ningún Cliente Seleccionado</h4>
          <p class="text-xs mt-1">Selecciona una solicitud de la lista de la izquierda para revisar su ficha técnica e inicio de servicio.</p>
        </div>
      `;
    }

    return `
      <div class="split-container">
        <!-- Left Side: List -->
        <div class="card p-5" style="max-height: 600px; overflow-y:auto;">
          <h3 class="text-xs font-bold uppercase tracking-wider mb-4" style="color:var(--color-accent);">Solicitudes de Ingreso</h3>
          <div id="pending-clients-list-wrapper">
            ${listItemsHTML || '<div class="text-center py-10 text-secondary" style="font-size:0.85rem;">🔕 No hay nuevos clientes pendientes de aprobación.</div>'}
          </div>
        </div>

        <!-- Right Side: Editor / Review Workspace -->
        <div id="pending-client-review-workspace">
          ${detailsHTML}
        </div>
      </div>
    `;
  }

  bindPendingClientsEvents(contentEl) {
    // List item selection trigger
    contentEl.querySelectorAll('.pending-list-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-req-id');
        this.state.activePendingClientId = id;
        this.renderActiveTabContent();
      });
    });

    const activeReq = this.state.pendingClients.find(r => r.id === this.state.activePendingClientId);
    if (!activeReq) return;

    // Approvals button
    contentEl.querySelector('#btn-approve-client')?.addEventListener('click', async () => {
      const form = contentEl.querySelector('#review-client-form');
      if (!form || !form.reportValidity()) return;

      const approveBtn = contentEl.querySelector('#btn-approve-client');
      approveBtn.disabled = true;
      approveBtn.textContent = 'Procesando aprobación...';

      try {
        const { db } = await import('../../../config/firebase.config.js');
        const { ref, push, set, update, remove } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js');

        if (db) {
          // Read form values (incorporating any owner edits!)
          const displayName = form.querySelector('#rev-name').value.trim();
          const companyName = form.querySelector('#rev-company').value.trim();
          const phone = form.querySelector('#rev-phone').value.trim();
          const phoneSecondary = form.querySelector('#rev-phone-sec').value.trim();
          const email = form.querySelector('#rev-email').value.trim();
          const city = form.querySelector('#rev-city').value.trim();
          const department = form.querySelector('#rev-dept').value.trim();
          const address = form.querySelector('#rev-address').value.trim();
          const reference = form.querySelector('#rev-ref').value.trim();
          const serviceType = form.querySelector('#rev-service').value.trim();
          const priority = form.querySelector('#rev-priority').value;
          const problemDescription = form.querySelector('#rev-desc').value.trim();
          const installedEquipment = form.querySelector('#rev-equip').value.trim();
          const observations = form.querySelector('#rev-obs').value.trim();

          const clientRef = push(ref(db, `${this.companyId}/clients`));
          const clientId = clientRef.key;

          // Generate dynamic Google Maps links in base of lat/lng captured in field
          let mapsUrl = '';
          if (activeReq.gps) {
            mapsUrl = `https://www.google.com/maps?q=${activeReq.gps.lat},${activeReq.gps.lng}`;
          }

          const newClientData = {
            id: clientId,
            displayName,
            companyName,
            phone,
            phoneSecondary,
            email,
            address,
            city,
            department,
            reference,
            mapsUrl,
            serviceType,
            problemDescription,
            notes: observations,
            createdAt: Date.now(),
            technical_info: {
              productDescription: installedEquipment || '—',
              observations: `Registrado en campo por técnico ${activeReq.employeeName}.`
            }
          };

          // A. Save client profiles to master database clients
          await set(clientRef, newClientData);

          // B. Update status in request node
          await update(ref(db, `${this.companyId}/pending_clients/${activeReq.id}`), {
            status: 'Aprobada'
          });

          // C. Notify Technician
          const notifRef = push(ref(db, `${this.companyId}/notifications`));
          await set(notifRef, {
            id: notifRef.key,
            toUid: activeReq.employeeId,
            title: '🎉 Cliente Aprobado',
            message: `El dueño aprobó el ingreso del cliente "${displayName}" solicitado en campo.`,
            timestamp: Date.now(),
            read: false
          });

          // D. Log audit trace
          await FirestoreService.logAudit({
            action: 'OWNER_APPROVE_CLIENT',
            companyId: this.companyId,
            description: `El propietario ${this.currentUser.displayName} aprobó y registró al cliente "${displayName}" (ID: ${clientId}) pre-registrado en campo por el técnico ${activeReq.employeeName}.`
          });
        }

        NotificationService.success(`Cliente "${activeReq.displayName}" aprobado correctamente.`);
        this.state.activePendingClientId = null;
        this.loadData();
      } catch (err) {
        console.error(err);
        alert(`Error al aprobar cliente: ${err.message || err}`);
        approveBtn.disabled = false;
        approveBtn.textContent = 'Aprobar y Crear Cliente';
      }
    });

    // Rejections button
    contentEl.querySelector('#btn-reject-client')?.addEventListener('click', async () => {
      const comment = prompt('Escribe el motivo del rechazo o corrección solicitada:') || '';
      
      const rejectBtn = contentEl.querySelector('#btn-reject-client');
      rejectBtn.disabled = true;
      rejectBtn.textContent = 'Procesando...';

      try {
        const { db } = await import('../../../config/firebase.config.js');
        const { ref, update, push, set } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js');

        if (db) {
          await update(ref(db, `${this.companyId}/pending_clients/${activeReq.id}`), {
            status: 'Rechazada',
            comment: comment
          });

          // Notify Technician
          const notifRef = push(ref(db, `${this.companyId}/notifications`));
          await set(notifRef, {
            id: notifRef.key,
            toUid: activeReq.employeeId,
            title: '❌ Cliente Rechazado / Corrección',
            message: `Se ha rechazado la pre-solicitud del cliente "${activeReq.displayName}". Motivo: ${comment || 'Sin especificar'}`,
            timestamp: Date.now(),
            read: false
          });

          // Log Audit Trace
          await FirestoreService.logAudit({
            action: 'OWNER_REJECT_CLIENT',
            companyId: this.companyId,
            description: `El propietario ${this.currentUser.displayName} rechazó la solicitud de registro del cliente "${activeReq.displayName}" enviada por ${activeReq.employeeName}. Comentario: ${comment}`
          });
        }

        NotificationService.success('Solicitud rechazada con éxito.');
        this.state.activePendingClientId = null;
        this.loadData();
      } catch (err) {
        console.error(err);
        alert(`Error al rechazar: ${err.message || err}`);
        rejectBtn.disabled = false;
        rejectBtn.textContent = 'Rechazar Registro';
      }
    });

    // Re-init map
    if (activeReq.gps) {
      this.loadLeaflet().then(() => {
        this.initMap('owner-review-map', activeReq.gps.lat, activeReq.gps.lng);
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAP LEAFLET DYNAMIC MODULE
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
  // GENERAL TEMPLATE STUFFS
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
            <input type="text" id="cli-service" class="input input-md" placeholder="Ej. Reparación de A/C" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="cli-description">Descripción del Problema o Tarea <span class="form-label-required"></span></label>
            <textarea id="cli-description" class="input" style="height: 60px; padding: 10px;" placeholder="Detalla el problema..." required></textarea>
          </div>
          <div class="form-group">
            <label class="form-label" for="cli-notes">Observaciones Generales</label>
            <textarea id="cli-notes" class="input" style="height: 60px; padding: 10px;" placeholder="Detalles..."></textarea>
          </div>

          <div class="form-section-title" data-target="technical-acc">📋 Nivel 1: Ficha Técnica (Compartido Automáticamente) <span>▼</span></div>
          <div id="technical-acc" class="accordion-content" style="max-height: 0px; display: flex; flex-direction: column; gap: var(--space-3);">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
              <div class="form-group">
                <label class="form-label" for="cli-serial">Número de Serie de Equipos</label>
                <input type="text" id="cli-serial" class="input input-md" placeholder="Ej. SN-789456123" />
              </div>
              <div class="form-group">
                <label class="form-label" for="cli-model">Marca y Modelo</label>
                <input type="text" id="cli-model" class="input input-md" placeholder="Ej. Hikvision" />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label" for="cli-prod-desc">Descripción del Producto Instalado</label>
              <input type="text" id="cli-prod-desc" class="input input-md" placeholder="Ej. Kit DVR" />
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-3);">
              <div class="form-group">
                <label class="form-label" for="cli-install-date">Fecha de Instalación</label>
                <input type="date" id="cli-install-date" class="input input-md" />
              </div>
              <div class="form-group">
                <label class="form-label" for="cli-warranty-exp">Expiración de Garantía</label>
                <input type="date" id="cli-warranty-exp" class="input input-md" />
              </div>
              <div class="form-group">
                <label class="form-label" for="cli-warranty-status">Estado de Garantía</label>
                <select id="cli-warranty-status" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-primary);">
                  <option value="Vigente">🟢 Vigente</option>
                  <option value="Vencida">🔴 Vencida</option>
                  <option value="Sin garantía" selected>⚪ Sin garantía</option>
                </select>
              </div>
            </div>
          </div>

          <div class="form-section-title" data-target="credentials-acc">🔑 Nivel 2: Datos y Credenciales de Acceso (Requiere Aprobación) <span>▼</span></div>
          <div id="credentials-acc" class="accordion-content" style="max-height: 0px; display: flex; flex-direction: column; gap: var(--space-3);">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
              <div class="form-group">
                <label class="form-label" for="cli-dvr-user">Usuario DVR</label>
                <input type="text" id="cli-dvr-user" class="input input-md" />
              </div>
              <div class="form-group">
                <label class="form-label" for="cli-dvr-pass">Contraseña DVR</label>
                <input type="password" id="cli-dvr-pass" class="input input-md" />
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
              <div class="form-group">
                <label class="form-label" for="cli-nvr-user">Usuario NVR/XVR</label>
                <input type="text" id="cli-nvr-user" class="input input-md" />
              </div>
              <div class="form-group">
                <label class="form-label" for="cli-nvr-pass">Contraseña NVR/XVR</label>
                <input type="password" id="cli-nvr-pass" class="input input-md" />
              </div>
            </div>
          </div>

          <div class="d-flex justify-content-end gap-2 mt-2">
            <button type="submit" class="btn btn-primary" id="btn-submit-client">Registrar Cliente</button>
          </div>
        </form>
      </div>
    `;
  }

  bindRegisterClientFormEvents(contentEl) {
    contentEl.querySelectorAll('.form-section-title[data-target]').forEach(title => {
      title.addEventListener('click', () => {
        const targetId = title.getAttribute('data-target');
        const content = contentEl.querySelector(`#${targetId}`);
        const span = title.querySelector('span');

        if (content.style.maxHeight === '0px' || !content.style.maxHeight) {
          content.style.maxHeight = '1000px';
          content.style.padding = '10px 0';
          span.textContent = '▲';
        } else {
          content.style.maxHeight = '0px';
          content.style.padding = '0';
          span.textContent = '▼';
        }
      });
    });

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

      const technical_info = {
        serialNumber: form.querySelector('#cli-serial').value.trim(),
        brandModel: form.querySelector('#cli-model').value.trim(),
        productDescription: form.querySelector('#cli-prod-desc').value.trim(),
        installationDate: form.querySelector('#cli-install-date').value,
        warrantyExpiration: form.querySelector('#cli-warranty-exp').value,
        warrantyStatus: form.querySelector('#cli-warranty-status').value
      };

      const credentials = {
        dvrUser: EncryptionService.encrypt(form.querySelector('#cli-dvr-user').value.trim()),
        dvrPassword: EncryptionService.encrypt(form.querySelector('#cli-dvr-pass').value.trim()),
        nvrUser: EncryptionService.encrypt(form.querySelector('#cli-nvr-user').value.trim()),
        nvrPassword: EncryptionService.encrypt(form.querySelector('#cli-nvr-pass').value.trim())
      };

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
            technical_info: technical_info,
            credentials: credentials,
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
        
        <div style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap:10px; margin-bottom: 20px;">
          <input type="text" id="hist-search" class="input input-md" placeholder="Buscar..." value="${this.state.filters.searchQuery}" />
          <select id="hist-status" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-primary);">
            <option value="ALL">Todos los Estados</option>
            <option value="Pendiente">Pendientes</option>
            <option value="En proceso">En Proceso</option>
            <option value="Finalizado">Finalizados</option>
            <option value="Cancelado">Cancelados</option>
          </select>
          <select id="hist-priority" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-primary);">
            <option value="ALL">Todas las Prioridades</option>
            <option value="Baja">Baja</option>
            <option value="Media">Media</option>
            <option value="Alta">Alta</option>
            <option value="Urgente">Urgente</option>
          </select>
          <div style="display:flex; gap:4px;">
            <input type="date" id="hist-from" class="input input-md" style="font-size:0.75rem;" value="${this.state.filters.dateFrom}" />
            <input type="date" id="hist-to" class="input input-md" style="font-size:0.75rem;" value="${this.state.filters.dateTo}" />
          </div>
        </div>

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
              ${listItems || '<tr><td colspan="9" style="text-align:center; padding: 30px; color:var(--color-text-secondary);">No se encontraron asignaciones.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
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

  getAuthorizationsHTML() {
    const pendingList = this.state.authRequests.filter(r => r.status === 'Pendiente');
    const historyList = this.state.authRequests.filter(r => r.status !== 'Pendiente');

    const labelMap = {
      dvrUser: '👤 Usuario DVR',
      dvrPassword: '🔑 Contraseña DVR',
      nvrUser: '👤 Usuario NVR/XVR',
      nvrPassword: '🔑 Contraseña NVR/XVR'
    };

    const pendingCards = pendingList.map(req => {
      const fieldsCheckboxHTML = req.requestedFields.map(f => `
        <label style="display:flex; align-items:center; gap:6px; font-size:0.75rem; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:4px 8px; border-radius:4px; cursor:pointer;">
          <input type="checkbox" class="auth-field-chk" value="${f}" checked />
          <span>${labelMap[f] || f}</span>
        </label>
      `).join('');

      return `
        <div class="card p-5 animate-fade-in" style="border:1px solid rgba(139,92,246,0.15); margin-bottom:12px;" data-req-id="${req.id}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
            <div>
              <strong style="font-size:0.95rem; color:var(--color-text-primary);">${req.employeeName}</strong>
              <div style="font-size:0.72rem; color:var(--color-text-secondary); margin-top:2px;">
                Solicita acceso para: <strong>${req.clientName}</strong>
              </div>
            </div>
            <span class="badge" style="font-size:0.7rem; background:rgba(234,179,8,0.1); color:var(--color-warning);">Pendiente</span>
          </div>

          <div style="font-size:0.8rem; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:6px; padding:8px 12px; margin-bottom:10px;">
            <strong>Justificación o Motivo:</strong><br/>
            <span style="color:var(--color-text-secondary);">${req.motive || 'Sin justificación'}</span>
          </div>

          <div style="margin-bottom:12px;">
            <strong style="font-size:0.78rem; display:block; margin-bottom:6px;">Selección de Campos a Autorizar:</strong>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              ${fieldsCheckboxHTML}
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.05); padding-top:10px;">
            <div style="display:flex; align-items:center; gap:6px;">
              <span style="font-size:0.78rem; color:var(--color-text-secondary);">Duración:</span>
              <select class="auth-duration-select input input-xs" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-primary); padding: 2px 6px;">
                <option value="10">10 minutos</option>
                <option value="15" selected>15 minutos</option>
                <option value="30">30 minutos</option>
              </select>
            </div>
            <div style="display:flex; gap:6px;">
              <button class="btn btn-danger btn-xs btn-reject-request" data-id="${req.id}">Rechazar</button>
              <button class="btn btn-primary btn-xs btn-approve-request" data-id="${req.id}">Autorizar</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const historyItems = historyList.map(req => {
      const statusColor = {
        Aprobado: 'var(--color-success)',
        Rechazado: 'var(--color-error)',
        Expirado: 'var(--color-text-secondary)'
      }[req.status] || 'var(--color-text-primary)';

      const resolvedStr = req.approvedAt ? TimeService.formatDate(req.approvedAt, true) : '—';
      const expireStr = req.expiresAt ? TimeService.formatDate(req.expiresAt, true) : '—';
      const approvedLabels = (req.approvedFields || []).map(f => labelMap[f] || f).join(', ');

      return `
        <tr style="border-bottom:1px solid var(--color-border); font-size:0.78rem;">
          <td style="padding:10px 8px;"><strong>${req.employeeName}</strong></td>
          <td style="padding:10px 8px;">${req.clientName}</td>
          <td style="padding:10px 8px; color:var(--color-text-secondary); max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${req.motive}">
            ${req.motive || '—'}
          </td>
          <td style="padding:10px 8px;"><strong style="color:${statusColor};">${req.status}</strong></td>
          <td style="padding:10px 8px; color:var(--color-text-secondary); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${approvedLabels}">
            ${approvedLabels || 'Ninguno'}
          </td>
          <td style="padding:10px 8px; color:var(--color-text-secondary);">${TimeService.formatDate(req.requestedAt, true)}</td>
          <td style="padding:10px 8px; color:var(--color-text-secondary);">${resolvedStr}</td>
          <td style="padding:10px 8px; color:var(--color-text-secondary);">${expireStr}</td>
        </tr>
      `;
    }).join('');

    return `
      <div style="display:grid; grid-template-columns:1fr; gap:20px;">
        <div class="card p-5">
          <h3 class="text-md font-bold mb-4">🔑 Solicitudes de Credenciales Pendientes</h3>
          <div id="pending-requests-wrapper">
            ${pendingCards || '<div class="text-center py-6 text-secondary" style="font-size:0.85rem;">🔕 No hay solicitudes de credenciales pendientes.</div>'}
          </div>
        </div>

        <div class="card p-5">
          <h3 class="text-md font-bold mb-4">📚 Historial de Solicitudes y Autorizaciones</h3>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; text-align:left;">
              <thead>
                <tr style="border-bottom:2px solid var(--color-border); color:var(--color-text-secondary); font-size:0.75rem; font-weight:700;">
                  <th style="padding:8px;">Empleado</th>
                  <th style="padding:8px;">Cliente</th>
                  <th style="padding:8px;">Motivo</th>
                  <th style="padding:8px;">Estado</th>
                  <th style="padding:8px;">Datos Aprobados</th>
                  <th style="padding:8px;">Solicitado</th>
                  <th style="padding:8px;">Resuelto</th>
                  <th style="padding:8px;">Expiración</th>
                </tr>
              </thead>
              <tbody>
                ${historyItems || '<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--color-text-secondary);">No hay registros de autorizaciones previas.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  bindAuthorizationsEvents(contentEl) {
    contentEl.addEventListener('click', async (e) => {
      const approveBtn = e.target.closest('.btn-approve-request');
      if (approveBtn) {
        const id = approveBtn.getAttribute('data-id');
        this.processApproval(id, true, contentEl);
        return;
      }

      const rejectBtn = e.target.closest('.btn-reject-request');
      if (rejectBtn) {
        const id = rejectBtn.getAttribute('data-id');
        this.processApproval(id, false, contentEl);
        return;
      }
    });
  }

  async processApproval(requestId, isApprove, contentEl) {
    const req = this.state.authRequests.find(r => r.id === requestId);
    if (!req) return;

    const requestCard = contentEl.querySelector(`[data-req-id="${requestId}"]`);
    if (!requestCard) return;

    try {
      const { db } = await import('../../../config/firebase.config.js');
      const { ref, update, get, push, set } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js');

      if (!db) return;

      if (!isApprove) {
        const comment = prompt('Motivo de rechazo (opcional):') || '';
        await update(ref(db, `${this.companyId}/auth_requests/${requestId}`), {
          status: 'Rechazado',
          approvedAt: Date.now(),
          comment: comment,
          authorizedBy: this.currentUser.displayName
        });

        const notifRef = push(ref(db, `${this.companyId}/notifications`));
        await set(notifRef, {
          id: notifRef.key,
          toUid: req.employeeId,
          title: '❌ Solicitud de Credenciales Rechazada',
          message: `El propietario rechazó tu solicitud de credenciales para ${req.clientName}. Motivo: ${comment || 'Sin justificación'}`,
          timestamp: Date.now(),
          read: false
        });

        await FirestoreService.logAudit({
          action: 'OWNER_REJECT_CREDENTIALS',
          companyId: this.companyId,
          description: `El propietario ${this.currentUser.displayName} rechazó la solicitud de credenciales de ${req.employeeName} para el cliente ${req.clientName}.`
        });

        NotificationService.success('Solicitud rechazada.');
        this.loadData();
        return;
      }

      const approvedCheckboxes = requestCard.querySelectorAll('.auth-field-chk:checked');
      const approvedFields = Array.from(approvedCheckboxes).map(chk => chk.value);

      if (approvedFields.length === 0) {
        alert('Debes seleccionar al menos un campo.');
        return;
      }

      const durationMin = parseInt(requestCard.querySelector('.auth-duration-select').value) || 15;

      const clientSnap = await get(ref(db, `${this.companyId}/clients/${req.clientId}`));
      if (!clientSnap.exists()) {
        alert('El cliente no existe.');
        return;
      }

      const client = clientSnap.val();
      const rawCreds = client.credentials || {};
      const approvedData = {};

      approvedFields.forEach(field => {
        if (rawCreds[field]) {
          approvedData[field] = EncryptionService.decrypt(rawCreds[field]);
        } else {
          approvedData[field] = '—';
        }
      });

      const timestamp = Date.now();
      const expiresAt = timestamp + durationMin * 60 * 1000;

      await update(ref(db, `${this.companyId}/auth_requests/${requestId}`), {
        status: 'Aprobado',
        approvedAt: timestamp,
        expiresAt: expiresAt,
        expirationDurationMin: durationMin,
        approvedFields: approvedFields,
        approvedData: approvedData,
        authorizedBy: this.currentUser.displayName
      });

      const notifRef = push(ref(db, `${this.companyId}/notifications`));
      await set(notifRef, {
        id: notifRef.key,
        toUid: req.employeeId,
        title: '🔑 Solicitud de Credenciales Aprobada',
        message: `Se te ha concedido acceso temporal (${durationMin} min) a las credenciales de ${req.clientName}`,
        timestamp: Date.now(),
        read: false
      });

      await FirestoreService.logAudit({
        action: 'OWNER_APPROVE_CREDENTIALS',
        companyId: this.companyId,
        description: `El propietario ${this.currentUser.displayName} aprobó la solicitud de credenciales de ${req.employeeName} para el cliente ${req.clientName}. Campos: ${approvedFields.join(', ')}. Expiración: ${durationMin} min.`
      });

      NotificationService.success(`Solicitud autorizada por ${durationMin} minutos.`);
      this.loadData();
    } catch (e) {
      console.error(e);
      alert(`Error al procesar la aprobación: ${e.message || e}`);
    }
  }

  startExpirationSweeper() {
    if (this.sweeperInterval) clearInterval(this.sweeperInterval);

    this.sweeperInterval = setInterval(async () => {
      const expiredList = this.state.authRequests.filter(r => r.status === 'Aprobado' && r.expiresAt && r.expiresAt < Date.now());
      if (expiredList.length === 0) return;

      try {
        const { db } = await import('../../../config/firebase.config.js');
        const { ref, update } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js');

        if (db) {
          for (const req of expiredList) {
            await update(ref(db, `${this.companyId}/auth_requests/${req.id}`), {
              status: 'Expirado',
              approvedData: null
            });

            await FirestoreService.logAudit({
              action: 'CREDENTIALS_EXPIRED',
              companyId: this.companyId,
              description: `Acceso temporal de credenciales expirado para el técnico ${req.employeeName} (Cliente: ${req.clientName}). Datos eliminados.`
            });
          }
        }
      } catch (err) {
        console.warn('[Sweeper] Error sweeps:', err.message);
      }
    }, 10000);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOAD DATA & SUBSCRIBERS
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

      const reqSnapshot = await get(ref(db, `${this.companyId}/auth_requests`));
      if (reqSnapshot.exists()) {
        const data = reqSnapshot.val();
        this.state.authRequests = Object.keys(data)
          .map(k => ({ id: k, ...data[k] }))
          .sort((a, b) => b.requestedAt - a.requestedAt);
      }

      // Load pending clients
      const pcSnapshot = await get(ref(db, `${this.companyId}/pending_clients`));
      if (pcSnapshot.exists()) {
        const data = pcSnapshot.val();
        this.state.pendingClients = Object.keys(data)
          .map(k => ({ id: k, ...data[k] }))
          .sort((a, b) => b.createdAt - a.createdAt);
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

        this.authRequestsUnsubscribe = onValue(ref(db, `${this.companyId}/auth_requests`), (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.val();
            this.state.authRequests = Object.keys(data)
              .map(k => ({ id: k, ...data[k] }))
              .sort((a, b) => b.requestedAt - a.requestedAt);
          } else {
            this.state.authRequests = [];
          }
          if (this.state.activeTab === 'authorizations') {
            this.renderActiveTabContent();
          }
        });

        // Realtime listener for pending clients
        this.pendingClientsUnsubscribe = onValue(ref(db, `${this.companyId}/pending_clients`), (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.val();
            this.state.pendingClients = Object.keys(data)
              .map(k => ({ id: k, ...data[k] }))
              .sort((a, b) => b.createdAt - a.createdAt);
          } else {
            this.state.pendingClients = [];
          }
          if (this.state.activeTab === 'pending-clients') {
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
    if (this.sweeperInterval) {
      clearInterval(this.sweeperInterval);
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
