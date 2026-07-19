/**
 * @file service-requests.view.js
 * @description Bandeja de solicitudes de trabajo personalizado (carpintería, cámaras, etc.)
 * con formularios adaptados por rubro (custom fields por tipo de servicio).
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { GlobalStore } from '../../../core/state.js';
import { NotificationService } from '../../../services/notification.service.js';
import { FirestoreService } from '../../../services/firestore.service.js';

export class ServiceRequestsView extends Component {
  constructor(params = {}) {
    super(params);
    this.layout = new PageLayout({ title: 'Solicitudes de Servicio' });
    this.requests = [];
    this.filter = 'PENDIENTE';
  }

  render() {
    const company = GlobalStore.getState().currentCompany;
    const companyName = company?.name || 'Negocio';

    const statusColors = { PENDIENTE: '#f59e0b', EN_PROCESO: '#6366f1', COMPLETADO: '#10b981', CANCELADO: '#ef4444' };
    const statusLabels = { PENDIENTE: 'Pendiente', EN_PROCESO: 'En Proceso', COMPLETADO: 'Completado', CANCELADO: 'Cancelado' };

    const filteredRequests = this.requests.filter(r => this.filter === 'TODOS' || r.status === this.filter);

    const requestCards = filteredRequests.length > 0
      ? filteredRequests.map(r => this._requestCard(r, statusColors, statusLabels)).join('')
      : this._emptyState();

    return `
      <div class="d-flex flex-column gap-4">
        <!-- Header -->
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3);">
          <div>
            <h1 style="font-size: 1.5rem; font-weight: 700; color: var(--color-text-primary); margin: 0;">📥 Solicitudes de Trabajo</h1>
            <p style="font-size: 0.875rem; color: var(--color-text-secondary); margin: 4px 0 0 0;">${companyName} — Bandeja de solicitudes de clientes</p>
          </div>
          <div style="display: flex; gap: var(--space-2);">
            <span style="font-size: 0.8rem; color: var(--color-text-secondary); align-self: center;">${this.requests.length} solicitudes totales</span>
          </div>
        </div>

        <!-- Stats -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: var(--space-3);">
          ${this._statCard('Pendientes', this.requests.filter(r => r.status === 'PENDIENTE').length, '⏳', '#f59e0b')}
          ${this._statCard('En Proceso', this.requests.filter(r => r.status === 'EN_PROCESO').length, '⚙️', '#6366f1')}
          ${this._statCard('Completadas', this.requests.filter(r => r.status === 'COMPLETADO').length, '✅', '#10b981')}
          ${this._statCard('Canceladas', this.requests.filter(r => r.status === 'CANCELADO').length, '❌', '#ef4444')}
        </div>

        <!-- Filter Tabs -->
        <div style="display: flex; gap: var(--space-2); flex-wrap: wrap;">
          ${['TODOS', 'PENDIENTE', 'EN_PROCESO', 'COMPLETADO', 'CANCELADO'].map(s => `
            <button class="btn btn-sm ${this.filter === s ? 'btn-primary' : 'btn-secondary'} filter-tab-btn" data-filter="${s}" style="font-size: 0.78rem;">
              ${s === 'TODOS' ? 'Todos' : statusLabels[s] || s}
            </button>
          `).join('')}
        </div>

        <!-- Requests List -->
        <div id="requests-list" class="d-flex flex-column gap-3">
          ${requestCards}
        </div>
      </div>
    `;
  }

  _statCard(label, value, icon, color) {
    return `
      <div style="background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4); display: flex; align-items: center; gap: var(--space-3);">
        <span style="font-size: 1.4rem;">${icon}</span>
        <div>
          <div style="font-size: 1.4rem; font-weight: 700; color: ${color};">${value}</div>
          <div style="font-size: 0.72rem; color: var(--color-text-secondary);">${label}</div>
        </div>
      </div>
    `;
  }

  _requestCard(r, statusColors, statusLabels) {
    const date = r.createdAt ? new Date(r.createdAt).toLocaleDateString('es-ES') : 'N/A';
    const color = statusColors[r.status] || '#8b8c94';
    const label = statusLabels[r.status] || r.status;

    // Render custom detail fields by service type
    let extraDetails = '';
    if (r.serviceType === 'carpinteria') {
      extraDetails = `
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-2); margin-top: var(--space-2);">
          <div><span style="font-size: 0.7rem; color: var(--color-text-secondary);">Medidas</span><br><strong>${r.medidas || '—'}</strong></div>
          <div><span style="font-size: 0.7rem; color: var(--color-text-secondary);">Material</span><br><strong>${r.material || '—'}</strong></div>
          <div><span style="font-size: 0.7rem; color: var(--color-text-secondary);">Color</span><br><strong>${r.color || '—'}</strong></div>
        </div>
      `;
    } else if (r.serviceType === 'camaras') {
      extraDetails = `
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-2); margin-top: var(--space-2);">
          <div><span style="font-size: 0.7rem; color: var(--color-text-secondary);">Teléfono</span><br><strong>${r.telefono || '—'}</strong></div>
          <div><span style="font-size: 0.7rem; color: var(--color-text-secondary);">Ubicación</span><br><strong>${r.ubicacion || '—'}</strong></div>
          <div><span style="font-size: 0.7rem; color: var(--color-text-secondary);"># Cámaras</span><br><strong>${r.numeroCamaras || '—'}</strong></div>
        </div>
      `;
    }

    return `
      <div style="background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4);" data-id="${r.id}">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3);">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-1);">
              <span style="font-weight: 700; color: var(--color-text-primary);">${r.clientName || 'Cliente sin nombre'}</span>
              <span style="font-size: 0.7rem; padding: 2px 8px; border-radius: var(--radius-full); background: ${color}22; color: ${color}; font-weight: 600;">${label}</span>
              ${r.serviceType ? `<span style="font-size: 0.7rem; padding: 2px 8px; border-radius: var(--radius-full); background: var(--color-bg-tertiary); color: var(--color-text-secondary);">${r.serviceType}</span>` : ''}
            </div>
            <p style="font-size: 0.85rem; color: var(--color-text-secondary); margin: 0;">${r.description || 'Sin descripción'}</p>
            ${extraDetails}
          </div>
          <div style="text-align: right; flex-shrink: 0;">
            <div style="font-size: 0.72rem; color: var(--color-text-secondary);">${date}</div>
            <div style="display: flex; gap: var(--space-1); margin-top: var(--space-2); justify-content: flex-end;">
              <button class="btn btn-sm btn-secondary req-approve-btn" data-id="${r.id}" style="font-size: 0.72rem; padding: 2px 8px;">✅ Aprobar</button>
              <button class="btn btn-sm btn-secondary req-cancel-btn" data-id="${r.id}" style="font-size: 0.72rem; padding: 2px 8px; color: #ef4444;">❌</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _emptyState() {
    return `
      <div style="text-align: center; padding: var(--space-8) var(--space-4); color: var(--color-text-secondary); background: var(--color-bg-secondary); border-radius: var(--radius-lg); border: 1px dashed var(--color-border);">
        <div style="font-size: 3rem; margin-bottom: var(--space-3);">📭</div>
        <h3 style="font-weight: 600; margin-bottom: var(--space-2); color: var(--color-text-primary);">Sin solicitudes</h3>
        <p style="font-size: 0.875rem;">Las solicitudes de tus clientes aparecerán aquí cuando sean enviadas desde la página pública.</p>
      </div>
    `;
  }

  async loadRequests() {
    try {
      // Uses tenant context from GlobalStore.currentUser.companyId
      this.requests = await FirestoreService.query('service_requests', [], { field: 'createdAt', direction: 'desc' });
    } catch (e) {
      console.warn('[ServiceRequestsView] Could not load requests:', e.message);
      this.requests = [];
    }
  }

  async mount() {
    await this.loadRequests();
    const layout = this.layout.mount();
    const content = layout.querySelector('#page-content');
    if (content) {
      content.insertAdjacentHTML('beforeend', this.render());

      // Bind filter tabs
      content.querySelectorAll('.filter-tab-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          this.filter = e.currentTarget.dataset.filter;
          content.querySelector('#requests-list').outerHTML = `<div id="requests-list" class="d-flex flex-column gap-3">${this.requests.filter(r => this.filter === 'TODOS' || r.status === this.filter).map(r => this._requestCard(r, { PENDIENTE: '#f59e0b', EN_PROCESO: '#6366f1', COMPLETADO: '#10b981', CANCELADO: '#ef4444' }, { PENDIENTE: 'Pendiente', EN_PROCESO: 'En Proceso', COMPLETADO: 'Completado', CANCELADO: 'Cancelado' })).join('') || this._emptyState()}</div>`;
        });
      });
    }
    return layout;
  }
}
