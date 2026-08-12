/**
 * @file service-requests.view.js
 * @description Bandeja de solicitudes de trabajo personalizado (carpintería, cámaras, etc.)
 * Optimizado para Android: cards táctiles, modal de detalle, búsqueda, pull-to-refresh.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { GlobalStore } from '../../../core/state.js';
import { NotificationService } from '../../../services/notification.service.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { I18nService } from '../../../services/i18n.service.js';

const STATUS_META = {
  PENDIENTE:   { label: 'Pendiente',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  icon: '⏳' },
  EN_PROCESO:  { label: 'En Proceso', color: '#6366f1', bg: 'rgba(99,102,241,0.12)',  icon: '⚙️' },
  COMPLETADO:  { label: 'Completado', color: '#10b981', bg: 'rgba(16,185,129,0.12)',  icon: '✅' },
  CANCELADO:   { label: 'Cancelado',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   icon: '❌' }
};

const SERVICE_ICONS = {
  carpinteria: '🪵', camaras: '📷', electricidad: '⚡', plomeria: '🔧',
  pintura: '🎨', limpieza: '🧹', otros: '🛠️'
};

export class ServiceRequestsView extends Component {
  constructor(params = {}) {
    super(params);

    const company = GlobalStore.getState().currentCompany;
    this.companyId = company?.id || GlobalStore.getState().currentUser?.companyId || '';

    this.requests   = [];
    this.filter     = 'TODOS';
    this.search     = '';
    this.serviceType = '';
    this._pullStart = null;

    this.layout = new PageLayout({
      title: `📥 ${I18nService.t('service_requests_title', 'Solicitudes de Servicio')}`,
      subtitle: I18nService.t('service_requests_subtitle', 'Bandeja de solicitudes de clientes y seguimiento de órdenes'),
      actionHTML: `
        <button class="btn btn-primary btn-sm" id="btn-sr-refresh" style="display:flex;align-items:center;gap:6px;">
          🔄 Actualizar
        </button>
      `,
      contentHTML: `<div id="sr-page-root"></div>`
    });
  }

  // ─── STYLES ────────────────────────────────────────────────────────────────
  _styles() {
    return `
      <style id="sr-styles">
        /* ── Stat cards ── */
        .sr-stat-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
        .sr-stat-card { background:var(--color-bg-secondary); border:1px solid var(--color-border);
          border-radius:var(--radius-lg); padding:14px 10px; display:flex; align-items:center; gap:10px; }
        .sr-stat-icon { font-size:1.6rem; }
        .sr-stat-val  { font-size:1.5rem; font-weight:700; line-height:1; }
        .sr-stat-lbl  { font-size:0.7rem; color:var(--color-text-secondary); margin-top:2px; }

        /* ── Search + filters ── */
        .sr-search-bar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .sr-search-input { flex:1; min-width:160px; padding:10px 14px; border:1px solid var(--color-border);
          border-radius:var(--radius-md); background:var(--color-bg-secondary);
          color:var(--color-text-primary); font-size:0.9rem; outline:none; }
        .sr-search-input:focus { border-color:var(--color-accent); box-shadow:0 0 0 3px rgba(99,102,241,0.15); }

        /* ── Filter chips ── */
        .sr-chips { display:flex; gap:6px; overflow-x:auto; -webkit-overflow-scrolling:touch;
          scrollbar-width:none; padding-bottom:4px; }
        .sr-chips::-webkit-scrollbar { display:none; }
        .sr-chip { flex-shrink:0; padding:8px 14px; border-radius:20px; border:1px solid var(--color-border);
          background:transparent; color:var(--color-text-secondary); font-size:0.8rem;
          font-weight:600; cursor:pointer; transition:all 0.2s; white-space:nowrap;
          min-height:36px; display:flex; align-items:center; }
        .sr-chip.active { background:var(--color-accent); color:#fff; border-color:var(--color-accent); }
        .sr-chip:active { opacity:0.75; transform:scale(0.96); }

        /* ── Request cards ── */
        .sr-card { background:var(--color-bg-secondary); border:1px solid var(--color-border);
          border-radius:var(--radius-lg); padding:16px; cursor:pointer;
          transition:all 0.2s; -webkit-tap-highlight-color:transparent; }
        .sr-card:active { background:var(--color-bg-tertiary); transform:scale(0.99); }
        .sr-card-top { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
        .sr-card-name { font-weight:700; color:var(--color-text-primary); font-size:0.95rem; }
        .sr-card-desc { font-size:0.83rem; color:var(--color-text-secondary); margin:6px 0 0; line-height:1.5; }
        .sr-badge { font-size:0.7rem; padding:3px 10px; border-radius:20px; font-weight:700;
          white-space:nowrap; flex-shrink:0; }
        .sr-card-meta { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; align-items:center; }
        .sr-card-meta-chip { font-size:0.72rem; padding:3px 8px; border-radius:12px;
          background:var(--color-bg-tertiary); color:var(--color-text-secondary); }

        /* ── Card action buttons (mobile-friendly) ── */
        .sr-card-actions { display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; }
        .sr-action-btn { flex:1; min-width:90px; padding:10px 8px; border-radius:var(--radius-md);
          border:1px solid var(--color-border); background:var(--color-bg-tertiary);
          color:var(--color-text-primary); font-size:0.78rem; font-weight:600;
          cursor:pointer; text-align:center; transition:all 0.18s;
          min-height:44px; display:flex; align-items:center; justify-content:center; gap:4px; }
        .sr-action-btn:active { transform:scale(0.96); }
        .sr-action-btn.approve { background:rgba(16,185,129,0.12); color:#10b981; border-color:rgba(16,185,129,0.3); }
        .sr-action-btn.cancel  { background:rgba(239,68,68,0.12);  color:#ef4444; border-color:rgba(239,68,68,0.3); }
        .sr-action-btn.detail  { background:rgba(99,102,241,0.1);  color:var(--color-accent); border-color:rgba(99,102,241,0.3); }

        /* ── Detail modal ── */
        .sr-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.55);
          z-index:9000; display:flex; align-items:flex-end; justify-content:center;
          animation:srFadeIn 0.2s ease; }
        @keyframes srFadeIn { from{opacity:0} to{opacity:1} }
        .sr-modal-sheet { background:var(--color-bg-secondary); border-radius:20px 20px 0 0;
          width:100%; max-width:600px; max-height:88vh; overflow-y:auto;
          padding:0 0 env(safe-area-inset-bottom,16px);
          animation:srSlideUp 0.28s cubic-bezier(0.34,1.56,0.64,1); }
        @keyframes srSlideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        .sr-modal-handle { width:40px; height:4px; background:var(--color-border); border-radius:2px;
          margin:12px auto 0; }
        .sr-modal-header { padding:16px 20px; border-bottom:1px solid var(--color-border);
          display:flex; align-items:center; justify-content:space-between; }
        .sr-modal-body { padding:20px; display:flex; flex-direction:column; gap:14px; }
        .sr-detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .sr-detail-item { background:var(--color-bg-tertiary); border-radius:var(--radius-md);
          padding:10px 12px; }
        .sr-detail-label { font-size:0.68rem; color:var(--color-text-secondary); font-weight:600;
          text-transform:uppercase; letter-spacing:0.04em; margin-bottom:3px; }
        .sr-detail-value { font-size:0.88rem; font-weight:600; color:var(--color-text-primary); }

        /* ── Pull to refresh ── */
        .sr-ptr-indicator { text-align:center; font-size:0.8rem; color:var(--color-text-secondary);
          padding:8px; height:36px; display:flex; align-items:center; justify-content:center;
          overflow:hidden; transition:height 0.2s; }

        /* ── Empty state ── */
        .sr-empty { text-align:center; padding:48px 24px; background:var(--color-bg-secondary);
          border-radius:var(--radius-lg); border:1px dashed var(--color-border); }
        .sr-empty-icon { font-size:3.5rem; margin-bottom:12px; }

        /* ══ ANDROID / MOBILE OVERRIDES ══════════════════════════════════════ */
        @media (max-width: 640px) {
          .sr-stat-grid { grid-template-columns:repeat(2,1fr); }
          .sr-stat-card  { padding:12px 10px; }
          .sr-stat-val   { font-size:1.3rem; }
          .sr-detail-grid { grid-template-columns:1fr; }
          .sr-search-bar { flex-direction:column; }
          .sr-search-input { width:100%; min-width:0; }
          .sr-card { padding:14px; }
          .sr-modal-sheet { border-radius:18px 18px 0 0; }
        }
        @media (max-width: 380px) {
          .sr-stat-grid { grid-template-columns:repeat(2,1fr); gap:6px; }
          .sr-action-btn { font-size:0.73rem; padding:10px 4px; }
        }
      </style>
    `;
  }

  // ─── MAIN RENDER ───────────────────────────────────────────────────────────
  _buildHTML() {
    const filtered = this._filtered();

    const stats = Object.entries(STATUS_META).map(([key, m]) => {
      const cnt = this.requests.filter(r => r.status === key).length;
      return `
        <div class="sr-stat-card" style="border-left:3px solid ${m.color}">
          <span class="sr-stat-icon">${m.icon}</span>
          <div>
            <div class="sr-stat-val" style="color:${m.color}">${cnt}</div>
            <div class="sr-stat-lbl">${m.label}</div>
          </div>
        </div>`;
    }).join('');

    const serviceTypes = [...new Set(this.requests.map(r => r.serviceType).filter(Boolean))];
    const typeChips = serviceTypes.map(t =>
      `<button class="sr-chip sr-svc-chip ${this.serviceType === t ? 'active' : ''}" data-svc="${t}">
        ${SERVICE_ICONS[t] || '🛠️'} ${t}
      </button>`
    ).join('');

    const filterChips = ['TODOS', ...Object.keys(STATUS_META)].map(key => {
      const m = STATUS_META[key];
      const lbl = key === 'TODOS' ? 'Todos' : m.label;
      const ico = key === 'TODOS' ? '📋' : m.icon;
      return `<button class="sr-chip sr-filter-chip ${this.filter === key ? 'active' : ''}" data-filter="${key}">${ico} ${lbl}</button>`;
    }).join('');

    const cards = filtered.length > 0
      ? filtered.map(r => this._card(r)).join('')
      : `<div class="sr-empty">
          <div class="sr-empty-icon">📭</div>
          <h3 style="font-weight:700;margin:0 0 8px;color:var(--color-text-primary)">Sin solicitudes</h3>
          <p style="font-size:0.85rem;color:var(--color-text-secondary);margin:0 0 16px">
            ${this.search || this.filter !== 'TODOS' ? 'Ninguna solicitud coincide con los filtros.' : 'Las solicitudes aparecerán aquí cuando tus clientes las envíen.'}
          </p>
          <button class="btn btn-secondary btn-sm" id="btn-sr-clear-filters">Limpiar filtros</button>
        </div>`;

    return `
      ${this._styles()}
      <div id="sr-ptr-indicator" class="sr-ptr-indicator" style="height:0"></div>
      <div style="display:flex;flex-direction:column;gap:16px">

        <!-- Stats -->
        <div class="sr-stat-grid">${stats}</div>

        <!-- Search -->
        <div class="sr-search-bar">
          <input id="sr-search" class="sr-search-input" type="search"
            placeholder="🔍 Buscar por nombre o descripción..."
            value="${this.search.replace(/"/g, '&quot;')}">
          <select id="sr-svc-select" class="sr-search-input" style="flex:0 0 auto;min-width:140px;max-width:180px;">
            <option value="">🛠️ Tipo de servicio</option>
            ${serviceTypes.map(t => `<option value="${t}" ${this.serviceType===t?'selected':''}>${SERVICE_ICONS[t]||'🛠️'} ${t}</option>`).join('')}
          </select>
        </div>

        <!-- Status chips -->
        <div class="sr-chips">${filterChips}</div>

        <!-- Count -->
        <div style="font-size:0.8rem;color:var(--color-text-secondary)">
          ${filtered.length} solicitud${filtered.length !== 1 ? 'es' : ''} ${this.requests.length !== filtered.length ? `de ${this.requests.length}` : ''}
        </div>

        <!-- Cards -->
        <div id="sr-cards-list" style="display:flex;flex-direction:column;gap:12px">
          ${cards}
        </div>

      </div>`;
  }

  _card(r) {
    const m = STATUS_META[r.status] || STATUS_META.PENDIENTE;
    const date = r.createdAt ? new Date(r.createdAt).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' }) : '—';
    const svcIcon = SERVICE_ICONS[r.serviceType] || '🛠️';

    return `
      <div class="sr-card" data-id="${r.id}">
        <div class="sr-card-top">
          <div style="flex:1;min-width:0">
            <div class="sr-card-name">${r.clientName || 'Cliente sin nombre'}</div>
            <p class="sr-card-desc">${(r.description || 'Sin descripción').substring(0, 120)}${(r.description||'').length > 120 ? '…' : ''}</p>
          </div>
          <span class="sr-badge" style="background:${m.bg};color:${m.color}">${m.icon} ${m.label}</span>
        </div>
        <div class="sr-card-meta">
          ${r.serviceType ? `<span class="sr-card-meta-chip">${svcIcon} ${r.serviceType}</span>` : ''}
          <span class="sr-card-meta-chip">📅 ${date}</span>
          ${r.total ? `<span class="sr-card-meta-chip">💰 ${Number(r.total).toLocaleString('es-ES')}</span>` : ''}
        </div>
        <div class="sr-card-actions">
          <button class="sr-action-btn detail sr-view-btn" data-id="${r.id}">👁️ Ver detalle</button>
          ${r.status === 'PENDIENTE' ? `<button class="sr-action-btn approve sr-approve-btn" data-id="${r.id}">✅ Aprobar</button>` : ''}
          ${['PENDIENTE','EN_PROCESO'].includes(r.status) ? `<button class="sr-action-btn cancel sr-cancel-btn" data-id="${r.id}">❌ Cancelar</button>` : ''}
        </div>
      </div>`;
  }

  _detailModal(r) {
    const m = STATUS_META[r.status] || STATUS_META.PENDIENTE;
    const date = r.createdAt ? new Date(r.createdAt).toLocaleDateString('es-ES', {weekday:'long', day:'numeric', month:'long', year:'numeric'}) : '—';
    const svcIcon = SERVICE_ICONS[r.serviceType] || '🛠️';

    // Extra fields by service type
    let extraFields = '';
    if (r.serviceType === 'carpinteria') {
      extraFields = `
        <div class="sr-detail-item"><div class="sr-detail-label">Medidas</div><div class="sr-detail-value">${r.medidas || '—'}</div></div>
        <div class="sr-detail-item"><div class="sr-detail-label">Material</div><div class="sr-detail-value">${r.material || '—'}</div></div>
        <div class="sr-detail-item"><div class="sr-detail-label">Color / Acabado</div><div class="sr-detail-value">${r.color || '—'}</div></div>`;
    } else if (r.serviceType === 'camaras') {
      extraFields = `
        <div class="sr-detail-item"><div class="sr-detail-label">Teléfono</div><div class="sr-detail-value">${r.telefono || '—'}</div></div>
        <div class="sr-detail-item"><div class="sr-detail-label">Ubicación</div><div class="sr-detail-value">${r.ubicacion || '—'}</div></div>
        <div class="sr-detail-item"><div class="sr-detail-label">Número de cámaras</div><div class="sr-detail-value">${r.numeroCamaras || '—'}</div></div>`;
    }

    const nextStatuses = { PENDIENTE: ['EN_PROCESO','CANCELADO'], EN_PROCESO: ['COMPLETADO','CANCELADO'] };
    const actions = (nextStatuses[r.status] || []).map(s => {
      const sm = STATUS_META[s]; if (!sm) return '';
      return `<button class="sr-action-btn ${s === 'CANCELADO' ? 'cancel' : 'approve'} sr-change-status-btn"
        data-id="${r.id}" data-status="${s}" style="flex:1">${sm.icon} ${sm.label}</button>`;
    }).join('');

    return `
      <div class="sr-modal-overlay" id="sr-detail-modal">
        <div class="sr-modal-sheet" role="dialog" aria-modal="true">
          <div class="sr-modal-handle"></div>
          <div class="sr-modal-header">
            <div>
              <div style="font-weight:700;font-size:1rem;color:var(--color-text-primary)">${r.clientName || 'Solicitud'}</div>
              <span class="sr-badge" style="background:${m.bg};color:${m.color};margin-top:4px;display:inline-block">${m.icon} ${m.label}</span>
            </div>
            <button id="sr-modal-close" style="background:none;border:none;font-size:1.4rem;cursor:pointer;padding:8px;color:var(--color-text-secondary)">✕</button>
          </div>
          <div class="sr-modal-body">

            <!-- Description -->
            <div style="background:var(--color-bg-tertiary);border-radius:var(--radius-md);padding:12px 14px;">
              <div class="sr-detail-label" style="margin-bottom:6px">Descripción</div>
              <p style="font-size:0.88rem;color:var(--color-text-primary);margin:0;line-height:1.6">${r.description || 'Sin descripción'}</p>
            </div>

            <!-- Core fields -->
            <div class="sr-detail-grid">
              <div class="sr-detail-item"><div class="sr-detail-label">Tipo de Servicio</div><div class="sr-detail-value">${svcIcon} ${r.serviceType || '—'}</div></div>
              <div class="sr-detail-item"><div class="sr-detail-label">Fecha</div><div class="sr-detail-value">${date}</div></div>
              ${r.total ? `<div class="sr-detail-item"><div class="sr-detail-label">Total estimado</div><div class="sr-detail-value" style="color:var(--color-accent)">💰 ${Number(r.total).toLocaleString('es-ES')}</div></div>` : ''}
              ${r.phone ? `<div class="sr-detail-item"><div class="sr-detail-label">Teléfono</div><div class="sr-detail-value">📞 ${r.phone}</div></div>` : ''}
              ${extraFields}
            </div>

            <!-- Notes -->
            ${r.notes ? `<div class="sr-detail-item" style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25)"><div class="sr-detail-label">Notas internas</div><div class="sr-detail-value" style="font-weight:400;font-size:0.85rem">${r.notes}</div></div>` : ''}

            <!-- Actions -->
            ${actions ? `<div class="sr-card-actions">${actions}</div>` : ''}

          </div>
        </div>
      </div>`;
  }

  // ─── FILTERING ─────────────────────────────────────────────────────────────
  _filtered() {
    return this.requests.filter(r => {
      const matchStatus  = this.filter === 'TODOS' || r.status === this.filter;
      const matchSearch  = !this.search ||
        (r.clientName || '').toLowerCase().includes(this.search.toLowerCase()) ||
        (r.description || '').toLowerCase().includes(this.search.toLowerCase());
      const matchService = !this.serviceType || r.serviceType === this.serviceType;
      return matchStatus && matchSearch && matchService;
    });
  }

  // ─── DOM HELPERS ───────────────────────────────────────────────────────────
  _refreshList(root) {
    const list = root.querySelector('#sr-cards-list');
    if (!list) return;
    const filtered = this._filtered();
    list.innerHTML = filtered.length > 0
      ? filtered.map(r => this._card(r)).join('')
      : `<div class="sr-empty">
          <div class="sr-empty-icon">📭</div>
          <h3 style="font-weight:700;margin:0 0 8px;color:var(--color-text-primary)">Sin solicitudes</h3>
          <p style="font-size:0.85rem;color:var(--color-text-secondary);margin:0 0 16px">
            ${this.search || this.filter !== 'TODOS' ? 'Ninguna solicitud coincide con los filtros.' : 'Las solicitudes de tus clientes aparecerán aquí.'}
          </p>
          <button class="btn btn-secondary btn-sm" id="btn-sr-clear-filters">Limpiar filtros</button>
        </div>`;
    this._bindCardActions(root);

    // count
    const cnt = root.querySelector('#sr-count');
    if (cnt) cnt.textContent = `${filtered.length} solicitud${filtered.length !== 1 ? 'es' : ''} ${this.requests.length !== filtered.length ? `de ${this.requests.length}` : ''}`;
  }

  _openModal(r, root) {
    const existing = document.getElementById('sr-detail-modal');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', this._detailModal(r));

    const overlay = document.getElementById('sr-detail-modal');

    overlay.querySelector('#sr-modal-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelectorAll('.sr-change-status-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const { id, status } = btn.dataset;
        await this._changeStatus(id, status);
        overlay.remove();
        this._refreshList(root);
      });
    });
  }

  async _changeStatus(id, newStatus) {
    try {
      await FirestoreService.update('service_requests', id, { status: newStatus, updatedAt: Date.now() });
      const req = this.requests.find(r => r.id === id);
      if (req) req.status = newStatus;
      NotificationService.success(`Solicitud ${STATUS_META[newStatus]?.label || newStatus}`);
    } catch (e) {
      NotificationService.error('No se pudo actualizar: ' + e.message);
    }
  }

  _bindCardActions(root) {
    root.querySelectorAll('.sr-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = this.requests.find(x => x.id === btn.dataset.id);
        if (r) this._openModal(r, root);
      });
    });
    root.querySelectorAll('.sr-approve-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this._changeStatus(btn.dataset.id, 'EN_PROCESO');
        this._refreshList(root);
      });
    });
    root.querySelectorAll('.sr-cancel-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this._changeStatus(btn.dataset.id, 'CANCELADO');
        this._refreshList(root);
      });
    });
    const clearBtn = root.querySelector('#btn-sr-clear-filters');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      this.filter = 'TODOS'; this.search = ''; this.serviceType = '';
      root.querySelector('#sr-search').value = '';
      root.querySelector('#sr-svc-select').value = '';
      root.querySelectorAll('.sr-filter-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === 'TODOS'));
      this._refreshList(root);
    });
  }

  _bindPullToRefresh(root) {
    const indicator = root.querySelector('#sr-ptr-indicator');
    root.addEventListener('touchstart', e => { this._pullStart = e.touches[0].clientY; }, { passive: true });
    root.addEventListener('touchmove', e => {
      if (!this._pullStart) return;
      const diff = e.touches[0].clientY - this._pullStart;
      if (diff > 0 && root.scrollTop === 0 && indicator) {
        indicator.style.height = Math.min(diff * 0.4, 36) + 'px';
        indicator.textContent = diff > 80 ? '⬆️ Suelta para actualizar' : '⬇️ Jala para actualizar';
      }
    }, { passive: true });
    root.addEventListener('touchend', async () => {
      if (indicator && parseInt(indicator.style.height) > 20) {
        indicator.textContent = '🔄 Actualizando...';
        await this.loadRequests();
        this._refreshList(root);
      }
      if (indicator) indicator.style.height = '0';
      this._pullStart = null;
    }, { passive: true });
  }

  // ─── DATA ──────────────────────────────────────────────────────────────────
  async loadRequests() {
    try {
      this.requests = await FirestoreService.query('service_requests', [], { field: 'createdAt', direction: 'desc' });
    } catch (e) {
      console.warn('[ServiceRequestsView] Could not load requests:', e.message);
      this.requests = [];
    }
  }

  // ─── MOUNT ─────────────────────────────────────────────────────────────────
  async mount() {
    await this.loadRequests();
    const layout = this.layout.mount();
    const root   = layout.querySelector('#sr-page-root');
    if (!root) return layout;

    root.innerHTML = this._buildHTML();

    // Filter chips
    root.querySelectorAll('.sr-filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        this.filter = btn.dataset.filter;
        root.querySelectorAll('.sr-filter-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === this.filter));
        this._refreshList(root);
      });
    });

    // Service type select
    root.querySelector('#sr-svc-select')?.addEventListener('change', e => {
      this.serviceType = e.target.value;
      this._refreshList(root);
    });

    // Search
    let searchTimer;
    root.querySelector('#sr-search')?.addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { this.search = e.target.value; this._refreshList(root); }, 280);
    });

    // Refresh button
    layout.querySelector('#btn-sr-refresh')?.addEventListener('click', async () => {
      NotificationService.info('Actualizando solicitudes...');
      await this.loadRequests();
      root.innerHTML = this._buildHTML();
      this._bindCardActions(root);
    });

    this._bindCardActions(root);
    this._bindPullToRefresh(root);

    return layout;
  }
}
