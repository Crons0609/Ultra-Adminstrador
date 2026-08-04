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
      pendingSubTab: 'new-clients', // 'new-clients' | 'gps-updates'
      employees: [],
      clients: [],
      assignments: [],
      authRequests: [],
      pendingClients: [], // Requests sent by employees waiting for approval
      pendingLocations: [], // GPS location requests sent by employees
      activePendingClientId: null, // Selected request to review (New Client)
      activePendingLocationId: null, // Selected request to review (GPS Update)
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
          
          .pending-subtabs {
            display: flex;
            gap: 6px;
            margin-bottom: 15px;
          }
          .pending-subtab-btn {
            background: transparent;
            border: 1px solid var(--color-border);
            color: var(--color-text-secondary);
            font-size: 0.78rem;
            padding: 4px 10px;
            border-radius: 20px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.2s;
          }
          .pending-subtab-btn.active {
            background: var(--color-accent);
            color: #fff;
            border-color: var(--color-accent);
          }
        </style>
        <div id="assign-dashboard-container"></div>
      `
    });

    this.dbUnsubscribe = null;
    this.authRequestsUnsubscribe = null;
    this.pendingClientsUnsubscribe = null;
    this.pendingLocationsUnsubscribe = null;
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
      tabContent.innerHTML = this.getPendingClientsContainerHTML();
      this.bindPendingClientsEvents(tabContent);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REVIEWS CONTAINER & GPS UPDATES APPROVAL WORKSPACE
  // ═══════════════════════════════════════════════════════════════════════════

  getPendingClientsContainerHTML() {
    const isNewClients = this.state.pendingSubTab === 'new-clients';
    const nuevosCount = this.state.pendingClients.filter(c => c.status === 'Pendiente').length;
    const gpsCount = this.state.pendingLocations.filter(l => l.status === 'Pendiente').length;

    const subTabsHTML = `
      <div class="pending-subtabs">
        <button class="pending-subtab-btn ${isNewClients ? 'active' : ''}" data-subtab="new-clients">👤 Nuevos Clientes (${nuevosCount})</button>
        <button class="pending-subtab-btn ${!isNewClients ? 'active' : ''}" data-subtab="gps-updates">📍 Ubicaciones GPS (${gpsCount})</button>
      </div>
    `;

    if (isNewClients) {
      return subTabsHTML + this.getNewClientsWorkspaceHTML();
    } else {
      return subTabsHTML + this.getGpsUpdatesWorkspaceHTML();
    }
  }

  getNewClientsWorkspaceHTML() {
    const pendingRequests = this.state.pendingClients.filter(c => c.status === 'Pendiente');
    
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

            <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:10px; border-radius:6px; margin-top:4px;">
              <strong style="font-size:0.78rem; display:block; margin-bottom:4px; color:var(--color-text-primary);">🗺️ Coordenadas GPS del Registro</strong>
              ${activeReq.gps 
                ? `<span style="font-size:0.72rem; color:var(--color-text-secondary);">Latitud: <strong>${activeReq.gps.lat}</strong>, Longitud: <strong>${activeReq.gps.lng}</strong></span>
                   <div id="owner-review-map" style="height: 180px; border-radius: 6px; border:1px solid var(--color-border); margin-top:8px; z-index:5;"></div>`
                : '<span class="text-error" style="font-size:0.75rem;">⚠️ No se capturaron coordenadas GPS.</span>'}
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
        <div class="card p-10 text-center text-secondary">
          <div style="font-size:3rem; margin-bottom:10px;">👤</div>
          <h4 class="font-bold">Ningún Nuevo Cliente Seleccionado</h4>
          <p class="text-xs mt-1">Selecciona una pre-inscripción de la lista izquierda.</p>
        </div>
      `;
    }

    return `
      <div class="split-container">
        <!-- List -->
        <div class="card p-5" style="max-height: 600px; overflow-y:auto;">
          <h3 class="text-xs font-bold uppercase tracking-wider mb-4" style="color:var(--color-accent);">Nuevos Ingresos</h3>
          <div id="pending-clients-list-wrapper">
            ${listItemsHTML || '<div class="text-center py-10 text-secondary" style="font-size:0.85rem;">🔕 No hay nuevos clientes pendientes de aprobación.</div>'}
          </div>
        </div>

        <!-- Detail workspace -->
        <div id="pending-client-review-workspace">
          ${detailsHTML}
        </div>
      </div>
    `;
  }

  getGpsUpdatesWorkspaceHTML() {
    const pendingLocs = this.state.pendingLocations.filter(l => l.status === 'Pendiente');

    const listItemsHTML = pendingLocs.map(req => {
      const activeClass = this.state.activePendingLocationId === req.id ? 'active' : '';
      return `
        <div class="pending-list-item ${activeClass}" data-loc-id="${req.id}">
          <div style="font-weight:700; color:var(--color-text-primary); font-size:0.85rem;">${req.clientName}</div>
          <div style="font-size:0.7rem; color:var(--color-accent); margin-top:2px;">Técnico: ${req.employeeName}</div>
          <div style="font-size:0.65rem; color:var(--color-text-secondary); margin-top:2px;">Capturado: ${TimeService.formatDate(req.capturedAt, true)}</div>
        </div>
      `;
    }).join('');

    let detailsHTML = '';
    const activeLoc = pendingLocs.find(l => l.id === this.state.activePendingLocationId);

    if (activeLoc) {
      // Find client in catalog to show location history and current oficiales coords
      const client = this.state.clients.find(c => c.id === activeLoc.clientId) || {};
      const officialGpsStr = client.gps 
        ? `${client.gps.lat.toFixed(6)}, ${client.gps.lng.toFixed(6)} (Actual)`
        : 'Sin ubicación registrada actualmente';

      // Load client's location history if available
      const historyKeys = client.location_history ? Object.keys(client.location_history) : [];
      const historyRowsHTML = historyKeys.map(key => {
        const item = client.location_history[key];
        return `
          <tr style="border-bottom:1px solid rgba(255,255,255,0.03); font-size:0.72rem;">
            <td style="padding:6px 4px; color:var(--color-text-secondary);">${TimeService.formatDate(item.capturedAt, true)}</td>
            <td style="padding:6px 4px; color:var(--color-text-primary); font-weight:600;">${item.employeeName}</td>
            <td style="padding:6px 4px; font-family:monospace;">${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}</td>
            <td style="padding:6px 4px; color:var(--color-text-secondary); font-size:0.65rem;">${item.observations || '—'}</td>
          </tr>
        `;
      }).join('');

      detailsHTML = `
        <div class="card p-6 animate-fade-in" style="display:flex; flex-direction:column; gap:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:10px;">
            <div>
              <h4 class="font-bold text-md" style="color:var(--color-text-primary);">📍 Actualizar Ubicación: ${activeLoc.clientName}</h4>
              <span style="font-size:0.75rem; color:var(--color-text-secondary);">Enviado por el técnico <strong>${activeLoc.employeeName}</strong></span>
            </div>
            <span class="badge" style="background:rgba(234,179,8,0.1); color:var(--color-warning); font-size:0.7rem;">Pendiente</span>
          </div>

          <div style="font-size:0.8rem; display:flex; flex-direction:column; gap:6px; color:var(--color-text-primary);">
            <div>🗺️ Dirección Física Registrada: <strong>${client.address || '—'}</strong></div>
            <div>📍 Ubicación Oficial Actual: <strong style="color:var(--color-accent);">${officialGpsStr}</strong></div>
            <div>🛰️ Ubicación Propuesta por Técnico: <strong style="color:var(--color-success); font-family:monospace;">${activeLoc.lat.toFixed(6)}, ${activeLoc.lng.toFixed(6)}</strong> (Precisión: ${activeLoc.accuracy}m)</div>
            ${activeLoc.observations ? `
              <div style="background:rgba(255,255,255,0.02); padding:8px; border-radius:4px; border:1px solid rgba(255,255,255,0.05); margin-top:4px;">
                <strong>Observaciones de Campo:</strong> ${activeLoc.observations}
              </div>
            ` : ''}
          </div>

          <!-- Leaflet review map -->
          <div style="border:1px solid var(--color-border); border-radius:6px; margin: 6px 0;">
            <div id="owner-review-gps-map" style="height:200px; z-index:5;"></div>
          </div>

          <!-- Location History Table -->
          <div style="background:rgba(255,255,255,0.01); border:1px solid rgba(255,255,255,0.03); border-radius:8px; padding:10px;">
            <strong style="font-size:0.75rem; color:var(--color-accent); display:block; margin-bottom:6px;">📚 Historial de Coordenadas de este Cliente:</strong>
            <div style="overflow-x:auto; max-height:150px;">
              <table style="width:100%; border-collapse:collapse; text-align:left;">
                <thead>
                  <tr style="border-bottom:1px solid rgba(255,255,255,0.05); color:var(--color-text-secondary); font-size:0.65rem; font-weight:700;">
                    <th style="padding:4px;">Fecha</th>
                    <th style="padding:4px;">Registró</th>
                    <th style="padding:4px;">Coordenadas</th>
                    <th style="padding:4px;">Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  ${historyRowsHTML || '<tr><td colspan="4" style="text-align:center; padding:10px; color:var(--color-text-secondary); font-size:0.65rem;">No hay historial de ubicaciones anteriores para este cliente.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.05); padding-top:12px; margin-top:4px;">
            <button class="btn btn-danger btn-sm" id="btn-reject-gps-update">❌ Rechazar Cambios</button>
            <button class="btn btn-primary btn-sm" id="btn-approve-gps-update">✅ Aprobar y Actualizar Ubicación</button>
          </div>
        </div>
      `;
    } else {
      detailsHTML = `
        <div class="card p-10 text-center text-secondary">
          <div style="font-size:3rem; margin-bottom:10px;">📍</div>
          <h4 class="font-bold">Ninguna Petición de Ubicación Seleccionada</h4>
          <p class="text-xs mt-1">Selecciona una actualización de GPS en la lista izquierda para previsualizar el punto exacto en el mapa.</p>
        </div>
      `;
    }

    return `
      <div class="split-container">
        <!-- List -->
        <div class="card p-5" style="max-height: 600px; overflow-y:auto;">
          <h3 class="text-xs font-bold uppercase tracking-wider mb-4" style="color:var(--color-accent);">Solicitudes de GPS</h3>
          <div id="pending-locations-list-wrapper">
            ${listItemsHTML || '<div class="text-center py-10 text-secondary" style="font-size:0.85rem;">🔕 No hay solicitudes de GPS pendientes.</div>'}
          </div>
        </div>

        <!-- Workspace Detail -->
        <div id="pending-location-review-workspace">
          ${detailsHTML}
        </div>
      </div>
    `;
  }

  bindPendingClientsEvents(contentEl) {
    // Sub-tab toggling
    contentEl.querySelectorAll('.pending-subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.state.pendingSubTab = btn.getAttribute('data-subtab');
        this.state.activePendingClientId = null;
        this.state.activePendingLocationId = null;
        this.renderActiveTabContent();
      });
    });

    const isNewClients = this.state.pendingSubTab === 'new-clients';

    if (isNewClients) {
      // 👤 NEW CLIENTS EVENT BINDINGS
      contentEl.querySelectorAll('.pending-list-item').forEach(item => {
        item.addEventListener('click', () => {
          this.state.activePendingClientId = item.getAttribute('data-req-id');
          this.renderActiveTabContent();
        });
      });

      const activeReq = this.state.pendingClients.find(r => r.id === this.state.activePendingClientId);
      if (!activeReq) return;

      // Approval Button
      contentEl.querySelector('#btn-approve-client')?.addEventListener('click', async () => {
        const form = contentEl.querySelector('#review-client-form');
        if (!form || !form.reportValidity()) return;

        const approveBtn = contentEl.querySelector('#btn-approve-client');
        approveBtn.disabled = true;

        try {
          const { db } = await import('../../../config/firebase.config.js');
          const { ref, push, set, update } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js');

          if (db) {
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

            // Set main GPS details too if available
            if (activeReq.gps) {
              newClientData.gps = {
                lat: activeReq.gps.lat,
                lng: activeReq.gps.lng,
                accuracy: activeReq.gps.accuracy || 0,
                updatedAt: Date.now(),
                updatedBy: activeReq.employeeName
              };
            }

            await set(clientRef, newClientData);

            await update(ref(db, `${this.companyId}/pending_clients/${activeReq.id}`), {
              status: 'Aprobada'
            });

            // Notify Technician
            const notifRef = push(ref(db, `${this.companyId}/notifications`));
            await set(notifRef, {
              id: notifRef.key,
              toUid: activeReq.employeeId,
              title: '🎉 Cliente Aprobado',
              message: `El dueño aprobó el ingreso del cliente "${displayName}" solicitado en campo.`,
              timestamp: Date.now(),
              read: false
            });

            await FirestoreService.logAudit({
              action: 'OWNER_APPROVE_CLIENT',
              companyId: this.companyId,
              description: `El propietario ${this.currentUser.displayName} aprobó y registró al cliente "${displayName}" (ID: ${clientId}) solicitado por ${activeReq.employeeName}.`
            });
          }

          NotificationService.success(`Cliente "${activeReq.displayName}" aprobado.`);
          this.state.activePendingClientId = null;
          this.loadData();
        } catch (err) {
          console.error(err);
          approveBtn.disabled = false;
        }
      });

      // Rejection Button
      contentEl.querySelector('#btn-reject-client')?.addEventListener('click', async () => {
        const comment = prompt('Escribe el motivo del rechazo:') || '';
        const rejectBtn = contentEl.querySelector('#btn-reject-client');
        rejectBtn.disabled = true;

        try {
          const { db } = await import('../../../config/firebase.config.js');
          const { ref, update, push, set } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js');

          if (db) {
            await update(ref(db, `${this.companyId}/pending_clients/${activeReq.id}`), {
              status: 'Rechazada',
              comment: comment
            });

            const notifRef = push(ref(db, `${this.companyId}/notifications`));
            await set(notifRef, {
              id: notifRef.key,
              toUid: activeReq.employeeId,
              title: '❌ Cliente Rechazado / Corrección',
              message: `Se ha rechazado la pre-solicitud del cliente "${activeReq.displayName}". Motivo: ${comment || 'Sin especificar'}`,
              timestamp: Date.now(),
              read: false
            });

            await FirestoreService.logAudit({
              action: 'OWNER_REJECT_CLIENT',
              companyId: this.companyId,
              description: `El propietario ${this.currentUser.displayName} rechazó la solicitud de registro del cliente "${activeReq.displayName}" enviada por ${activeReq.employeeName}.`
            });
          }

          NotificationService.success('Solicitud rechazada.');
          this.state.activePendingClientId = null;
          this.loadData();
        } catch (err) {
          console.error(err);
          rejectBtn.disabled = false;
        }
      });

      if (activeReq.gps) {
        this.loadLeaflet().then(() => this.initMap('owner-review-map', activeReq.gps.lat, activeReq.gps.lng));
      }

    } else {
      // 📍 GPS UPDATES EVENT BINDINGS
      contentEl.querySelectorAll('.pending-list-item').forEach(item => {
        item.addEventListener('click', () => {
          this.state.activePendingLocationId = item.getAttribute('data-loc-id');
          this.renderActiveTabContent();
        });
      });

      const activeLoc = this.state.pendingLocations.find(l => l.id === this.state.activePendingLocationId);
      if (!activeLoc) return;

      // Approval GPS Update
      contentEl.querySelector('#btn-approve-gps-update')?.addEventListener('click', async () => {
        const approveBtn = contentEl.querySelector('#btn-approve-gps-update');
        approveBtn.disabled = true;

        try {
          const { db } = await import('../../../config/firebase.config.js');
          const { ref, update, push, set } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js');

          if (db) {
            const gpsData = {
              lat: activeLoc.lat,
              lng: activeLoc.lng,
              accuracy: activeLoc.accuracy || 0,
              updatedAt: Date.now(),
              updatedBy: activeLoc.employeeName
            };

            const mapsUrl = `https://www.google.com/maps?q=${activeLoc.lat},${activeLoc.lng}`;

            // A. Update client profile official coords and maps URL
            await update(ref(db, `${this.companyId}/clients/${activeLoc.clientId}`), {
              gps: gpsData,
              mapsUrl: mapsUrl
            });

            // B. Push to location history node
            const historyRef = push(ref(db, `${this.companyId}/clients/${activeLoc.clientId}/location_history`));
            await set(historyRef, {
              id: historyRef.key,
              lat: activeLoc.lat,
              lng: activeLoc.lng,
              accuracy: activeLoc.accuracy || 0,
              capturedAt: activeLoc.capturedAt,
              employeeId: activeLoc.employeeId,
              employeeName: activeLoc.employeeName,
              observations: activeLoc.observations || ''
            });

            // C. Update request state
            await update(ref(db, `${this.companyId}/pending_locations/${activeLoc.id}`), {
              status: 'Aprobado'
            });

            // D. Notify Technician
            const notifRef = push(ref(db, `${this.companyId}/notifications`));
            await set(notifRef, {
              id: notifRef.key,
              toUid: activeLoc.employeeId,
              title: '🎉 Ubicación GPS Aprobada',
              message: `El dueño aprobó la ubicación física registrada para el cliente "${activeLoc.clientName}"`,
              timestamp: Date.now(),
              read: false
            });

            // E. Audit Log
            await FirestoreService.logAudit({
              action: 'OWNER_APPROVE_LOCATION_UPDATE',
              companyId: this.companyId,
              description: `El propietario ${this.currentUser.displayName} aprobó la actualización de coordenadas para el cliente "${activeLoc.clientName}" [${activeLoc.lat}, ${activeLoc.lng}] propuesta por el técnico ${activeLoc.employeeName}.`
            });
          }

          NotificationService.success('Ubicación del cliente actualizada con éxito.');
          this.state.activePendingLocationId = null;
          this.loadData();
        } catch (err) {
          console.error(err);
          approveBtn.disabled = false;
        }
      });

      // Reject GPS Update
      contentEl.querySelector('#btn-reject-gps-update')?.addEventListener('click', async () => {
        const comment = prompt('Escribe el motivo del rechazo:') || '';
        const rejectBtn = contentEl.querySelector('#btn-reject-gps-update');
        rejectBtn.disabled = true;

        try {
          const { db } = await import('../../../config/firebase.config.js');
          const { ref, update, push, set } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js');

          if (db) {
            await update(ref(db, `${this.companyId}/pending_locations/${activeLoc.id}`), {
              status: 'Rechazado',
              comment: comment
            });

            // Notify Technician
            const notifRef = push(ref(db, `${this.companyId}/notifications`));
            await set(notifRef, {
              id: notifRef.key,
              toUid: activeLoc.employeeId,
              title: '❌ Ubicación GPS Rechazada',
              message: `Se ha rechazado la actualización GPS para el cliente "${activeLoc.clientName}". Motivo: ${comment || 'Sin especificar'}`,
              timestamp: Date.now(),
              read: false
            });

            // Audit Log
            await FirestoreService.logAudit({
              action: 'OWNER_REJECT_LOCATION_UPDATE',
              companyId: this.companyId,
              description: `El propietario ${this.currentUser.displayName} rechazó la ubicación GPS para "${activeLoc.clientName}" enviada por ${activeLoc.employeeName}.`
            });
          }

          NotificationService.success('Actualización GPS rechazada.');
          this.state.activePendingLocationId = null;
          this.loadData();
        } catch (err) {
          console.error(err);
          rejectBtn.disabled = false;
        }
      });

      // Init map preview
      this.loadLeaflet().then(() => this.initMap('owner-review-gps-map', activeLoc.lat, activeLoc.lng));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAP LEAFLET MODULE
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
  // OTHER CORE VIEWS
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

          <div class="form-section-title" data-target="technical-acc">📋 Nivel 1: Ficha Técnica <span>▼</span></div>
          <div id="technical-acc" class="accordion-content" style="max-height: 0px; display: flex; flex-direction: column; gap: var(--space-3);">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
              <div class="form-group">
                <label class="form-label" for="cli-serial">Número de Serie de Equipos</label>
                <input type="text" id="cli-serial" class="input input-md" />
              </div>
              <div class="form-group">
                <label class="form-label" for="cli-model">Marca y Modelo</label>
                <input type="text" id="cli-model" class="input input-md" />
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

      const technical_info = {
        serialNumber: form.querySelector('#cli-serial').value.trim(),
        brandModel: form.querySelector('#cli-model').value.trim(),
        warrantyStatus: 'Sin garantía'
      };

      const submitBtn = form.querySelector('#btn-submit-client');
      submitBtn.disabled = true;

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
            technical_info: technical_info,
            createdAt: Date.now()
          };

          await set(clientRef, clientData);
        }

        NotificationService.success(`Cliente "${name}" registrado.`);
        form.reset();
        this.state.activeTab = 'assign';
        this.renderTabs();
        this.renderActiveTabContent();
      } catch (err) {
        console.error(err);
        submitBtn.disabled = false;
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

      const scheduledStr = asg.scheduledDate ? `${TimeService.formatDate(asg.scheduledDate)} ${asg.scheduledTime}` : 'Sin programar';
      const finishStr = asg.completedAt ? TimeService.formatDate(asg.completedAt, true) : '—';

      return `
        <tr style="border-bottom: 1px solid var(--color-border); font-size: 0.8rem;">
          <td style="padding: 12px 8px;"><strong>${asg.clientName}</strong></td>
          <td style="padding: 12px 8px;">${asg.employeeName}</td>
          <td style="padding: 12px 8px;">${asg.description}</td>
          <td style="padding: 12px 8px;"><span class="badge">${asg.status}</span></td>
          <td style="padding: 12px 8px;"><span style="color:${prioColor}; font-weight:bold;">● ${asg.priority}</span></td>
          <td style="padding: 12px 8px;">${TimeService.formatDate(asg.assignedAt)}</td>
          <td style="padding: 12px 8px;">${scheduledStr}</td>
          <td style="padding: 12px 8px;">${finishStr}</td>
          <td style="padding: 12px 8px;">
            <button class="btn btn-secondary btn-xs btn-edit-asg" data-id="${asg.id}">✏️</button>
            <button class="btn btn-danger btn-xs btn-cancel-asg" data-id="${asg.id}">✕</button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="card p-5 animate-fade-in">
        <h3 class="text-md font-bold mb-4">⏳ Historial de Asignaciones de Servicios</h3>
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; text-align:left;">
            <thead>
              <tr style="border-bottom:2px solid var(--color-border); color:var(--color-text-secondary); font-size:0.75rem;">
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
              ${listItems || '<tr><td colspan="9" style="text-align:center; padding: 20px;">No se encontraron asignaciones.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  bindHistoryEvents(contentEl) {
    contentEl.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.btn-edit-asg');
      if (editBtn) {
        this.openEditAssignmentModal(editBtn.getAttribute('data-id'));
        return;
      }

      const cancelBtn = e.target.closest('.btn-cancel-asg');
      if (cancelBtn) {
        const id = cancelBtn.getAttribute('data-id');
        if (confirm('¿Deseas marcar esta asignación como Cancelada?')) {
          this.updateAssignmentStatus(id, 'Cancelado');
        }
      }
    });
  }

  unmount() {
    if (this.sweeperInterval) clearInterval(this.sweeperInterval);
    if (this.dbUnsubscribe) this.dbUnsubscribe();
    if (this.authRequestsUnsubscribe) this.authRequestsUnsubscribe();
    if (this.pendingClientsUnsubscribe) this.pendingClientsUnsubscribe();
    if (this.pendingLocationsUnsubscribe) this.pendingLocationsUnsubscribe();
    this.layout.unmount();
    super.unmount();
  }
}
