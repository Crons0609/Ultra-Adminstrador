/**
 * @file transfers.view.js
 * @description Módulo de Traslados de Inventario para Ultra Administrador.
 * Permite la gestión progresiva y auditada de movimientos de productos entre
 * Sucursales ↔ Bodegas ↔ Locales con control de existencias, estados y recepciones.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { WarehouseService } from '../../../services/warehouse.service.js';
import { BranchService } from '../../../services/branch.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { TimeService } from '../../../services/time.service.js';

export class TransfersView extends Component {
  constructor(props = {}) {
    super(props);
    const state = GlobalStore.getState();
    this.currentCompany = state.currentCompany || {};
    this.currentUser = state.currentUser || {};

    this.state = {
      transfers: [],
      branches: [],
      warehouses: [],
      filterStatus: '',
      filterOrigin: '',
      filterDestination: '',
      searchTerm: '',
      unsubTransfers: null,
      unsubWarehouses: null
    };

    this.layout = new PageLayout({
      title: '📦 Traslados de Inventario',
      subtitle: `${this.currentCompany.name || 'Mi Negocio'} — Control de envíos, traspasos y existencias entre sucursales y bodegas.`,
      actionHTML: `
        <button class="btn btn-primary btn-sm" id="btn-new-transfer" style="display:flex;align-items:center;gap:6px;font-weight:700;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo Traslado
        </button>
      `,
      contentHTML: `<div id="transfers-view-root"></div>`
    });
  }

  mount() {
    const el = this.layout.mount();
    this.afterMount();
    return el;
  }

  afterMount() {
    this.subscribeData();
    this.bindEvents();
  }

  subscribeData() {
    // 1. Listen to Transfers
    this.state.unsubTransfers = WarehouseService.listenTransfers((transfers) => {
      this.state.transfers = transfers || [];
      this.renderUI();
    });

    // 2. Listen to Warehouses
    this.state.unsubWarehouses = WarehouseService.listenWarehouses((warehouses) => {
      this.state.warehouses = warehouses || [];
    });

    // 3. Branches from GlobalStore
    const { branches } = GlobalStore.getState();
    this.state.branches = branches || [];

    this._unsubStore = GlobalStore.subscribe('branches', (b) => {
      this.state.branches = b || [];
      this.renderUI();
    });
  }

  bindEvents() {
    const root = this.layout.element;

    root.querySelector('#btn-new-transfer')?.addEventListener('click', () => {
      this.openNewTransferWizard();
    });
  }

  // ─── RENDER UI ─────────────────────────────────────────────────────────────
  renderUI() {
    const container = this.layout.element.querySelector('#transfers-view-root');
    if (!container) return;

    const { selectedBranchId } = GlobalStore.getState();
    let list = this.state.transfers;

    // Filter by branch context if set
    if (selectedBranchId && selectedBranchId !== 'all') {
      list = list.filter(t => 
        t.sourceBranchId === selectedBranchId || 
        t.targetBranchId === selectedBranchId ||
        t.sourceId === selectedBranchId ||
        t.targetId === selectedBranchId
      );
    }

    // Apply UI filters
    const { filterStatus, filterOrigin, filterDestination, searchTerm } = this.state;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter(t => 
        (t.transferNumber || '').toLowerCase().includes(term) ||
        (t.sourceName || '').toLowerCase().includes(term) ||
        (t.targetName || '').toLowerCase().includes(term) ||
        (t.responsibleName || '').toLowerCase().includes(term) ||
        (t.reason || '').toLowerCase().includes(term)
      );
    }

    if (filterStatus) {
      list = list.filter(t => t.status === filterStatus);
    }

    // KPIs
    const totalCount = list.length;
    const inTransitCount = list.filter(t => t.status === 'EN_TRANSITO').length;
    const pendingCount = list.filter(t => t.status === 'PENDIENTE').length;
    const receivedCount = list.filter(t => t.status === 'RECIBIDO').length;

    container.innerHTML = `
      <style>
        .tr-root { display:flex; flex-direction:column; gap:20px; color:var(--color-text-primary); }
        .tr-kpi-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px; }
        .tr-kpi-card { background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:var(--radius-lg); padding:16px; display:flex; flex-direction:column; gap:4px; }
        .tr-kpi-val { font-size:1.6rem; font-weight:800; line-height:1.1; }

        .tr-filter-bar { background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:var(--radius-lg); padding:14px; display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between; }

        .tr-card { background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:var(--radius-lg); padding:18px; display:flex; flex-direction:column; gap:14px; transition:all 0.2s; position:relative; }
        .tr-card:hover { border-color:rgba(99, 102, 241, 0.4); transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,0.3); }

        .tr-status-badge { font-size:0.72rem; font-weight:700; padding:4px 10px; border-radius:20px; text-transform:uppercase; letter-spacing:0.04em; display:inline-flex; align-items:center; gap:6px; }
        .tr-status-PENDIENTE { background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid rgba(245,158,11,0.3); }
        .tr-status-EN_TRANSITO { background:rgba(99,102,241,0.15); color:#818cf8; border:1px solid rgba(99,102,241,0.3); }
        .tr-status-RECIBIDO { background:rgba(16,185,129,0.15); color:#34d399; border:1px solid rgba(16,185,129,0.3); }
        .tr-status-RECHAZADO, .tr-status-CANCELADO { background:rgba(239,68,68,0.15); color:#f87171; border:1px solid rgba(239,68,68,0.3); }

        .tr-route-box { display:flex; align-items:center; gap:12px; background:rgba(15,23,42,0.6); padding:12px 14px; border-radius:var(--radius-md); border:1px solid rgba(255,255,255,0.06); }
        .tr-route-arrow { color:var(--color-accent); font-size:1.2rem; font-weight:bold; }
      </style>

      <div class="tr-root">
        <!-- 1. KPIS -->
        <div class="tr-kpi-grid">
          <div class="tr-kpi-card" style="border-left:4px solid var(--color-accent)">
            <span style="font-size:0.75rem;color:var(--color-text-secondary);font-weight:600;">Total Traslados</span>
            <div class="tr-kpi-val" style="color:var(--color-accent);">${totalCount}</div>
            <span style="font-size:0.7rem;color:var(--color-text-tertiary);">Registros en sistema</span>
          </div>
          <div class="tr-kpi-card" style="border-left:4px solid #818cf8">
            <span style="font-size:0.75rem;color:var(--color-text-secondary);font-weight:600;">En Tránsito</span>
            <div class="tr-kpi-val" style="color:#818cf8;">${inTransitCount}</div>
            <span style="font-size:0.7rem;color:var(--color-text-tertiary);">En camino a destino</span>
          </div>
          <div class="tr-kpi-card" style="border-left:4px solid #f59e0b">
            <span style="font-size:0.75rem;color:var(--color-text-secondary);font-weight:600;">Pendientes Aprobación</span>
            <div class="tr-kpi-val" style="color:#f59e0b;">${pendingCount}</div>
            <span style="font-size:0.7rem;color:var(--color-text-tertiary);">Requieren revisión</span>
          </div>
          <div class="tr-kpi-card" style="border-left:4px solid #34d399">
            <span style="font-size:0.75rem;color:var(--color-text-secondary);font-weight:600;">Recibidos</span>
            <div class="tr-kpi-val" style="color:#34d399;">${receivedCount}</div>
            <span style="font-size:0.7rem;color:var(--color-text-tertiary);">Completados con éxito</span>
          </div>
        </div>

        <!-- 2. BARRA DE FILTROS -->
        <div class="tr-filter-bar">
          <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:240px;">
            <input type="text" id="tr-search-input" class="input input-sm" placeholder="🔍 Buscar por N° traslado, ubicación o responsable..." value="${searchTerm}" style="width:100%;" />
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <select id="tr-status-select" class="input input-sm">
              <option value="">Todos los estados</option>
              <option value="PENDIENTE"${filterStatus === 'PENDIENTE' ? ' selected' : ''}>Pendientes</option>
              <option value="EN_TRANSITO"${filterStatus === 'EN_TRANSITO' ? ' selected' : ''}>En Tránsito</option>
              <option value="RECIBIDO"${filterStatus === 'RECIBIDO' ? ' selected' : ''}>Recibidos</option>
              <option value="CANCELADO"${filterStatus === 'CANCELADO' ? ' selected' : ''}>Cancelados</option>
            </select>
          </div>
        </div>

        <!-- 3. LISTADO DE TRASLADOS -->
        ${list.length === 0 ? `
          <div style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:48px;text-align:center;color:var(--color-text-secondary);">
            <div style="font-size:2.8rem;margin-bottom:12px;">📦</div>
            <h4 style="font-weight:700;color:#fff;font-size:1.1rem;">No hay traslados registrados</h4>
            <p style="font-size:0.82rem;margin-top:4px;">Haz clic en <strong>"+ Nuevo Traslado"</strong> para iniciar un traspaso de existencias entre sucursales o bodegas.</p>
          </div>
        ` : `
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(320px, 1fr));gap:16px;">
            ${list.map(t => this.renderTransferCard(t)).join('')}
          </div>
        `}
      </div>
    `;

    // Bind card event listeners
    const searchInput = container.querySelector('#tr-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.state.searchTerm = e.target.value;
        this.renderUI();
      });
    }

    const statusSelect = container.querySelector('#tr-status-select');
    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        this.state.filterStatus = e.target.value;
        this.renderUI();
      });
    }

    container.querySelectorAll('.tr-btn-detail').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const transfer = this.state.transfers.find(t => t.id === id);
        if (transfer) this.openDetailModal(transfer);
      });
    });

    container.querySelectorAll('.tr-btn-approve').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        const transfer = this.state.transfers.find(t => t.id === id);
        if (transfer) {
          try {
            await WarehouseService.approveTransfer(id, transfer);
            NotificationService.success(`Traslado ${transfer.transferNumber} aprobado y puesto en tránsito.`);
          } catch (err) {
            NotificationService.error(err.message);
          }
        }
      });
    });

    container.querySelectorAll('.tr-btn-receive').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const transfer = this.state.transfers.find(t => t.id === id);
        if (transfer) this.openReceiveModal(transfer);
      });
    });
  }

  renderTransferCard(t) {
    const isOwner = this.currentUser.role === 'OWNER' || this.currentUser.role === 'MANAGER';
    const isPending = t.status === 'PENDIENTE';
    const isInTransit = t.status === 'EN_TRANSITO';
    const itemCount = t.items ? t.items.reduce((s, i) => s + Number(i.quantity || 0), 0) : 0;
    const dateStr = TimeService.formatDate(t.createdAt || Date.now());

    return `
      <div class="tr-card">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-family:var(--font-mono);font-weight:700;color:var(--color-accent);font-size:0.9rem;">
            ${t.transferNumber || 'TR-000000'}
          </span>
          <span class="tr-status-badge tr-status-${t.status || 'PENDIENTE'}">
            ${t.status === 'PENDIENTE' ? 'Pendiente' : t.status === 'EN_TRANSITO' ? 'En Tránsito' : t.status === 'RECIBIDO' ? 'Recibido' : t.status}
          </span>
        </div>

        <!-- Route Box -->
        <div class="tr-route-box">
          <div style="flex:1;">
            <span style="font-size:0.68rem;color:var(--color-text-tertiary);text-transform:uppercase;font-weight:700;display:block;">Origen</span>
            <strong style="font-size:0.82rem;color:#fff;">${t.sourceName || 'Origen'}</strong>
            <span style="font-size:0.7rem;color:var(--color-text-secondary);display:block;">${t.sourceType === 'bodega' ? 'Bodega' : 'Local'}</span>
          </div>

          <div class="tr-route-arrow">➔</div>

          <div style="flex:1;text-align:right;">
            <span style="font-size:0.68rem;color:var(--color-text-tertiary);text-transform:uppercase;font-weight:700;display:block;">Destino</span>
            <strong style="font-size:0.82rem;color:#fff;">${t.targetName || 'Destino'}</strong>
            <span style="font-size:0.7rem;color:var(--color-text-secondary);display:block;">${t.targetType === 'bodega' ? 'Bodega' : 'Local'}</span>
          </div>
        </div>

        <!-- Operational Info -->
        <div style="display:flex;justify-content:space-between;font-size:0.78rem;color:var(--color-text-secondary);border-top:1px solid rgba(255,255,255,0.06);padding-top:10px;">
          <span><strong>${itemCount}</strong> artículo(s)</span>
          <span>Encargado: ${t.responsibleName || 'Sistema'}</span>
          <span>${dateStr}</span>
        </div>

        <!-- Action Buttons -->
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
          <button class="btn btn-secondary btn-xs flex-1 tr-btn-detail" data-id="${t.id}">
            Ver Detalle
          </button>

          ${isPending && isOwner ? `
            <button class="btn btn-primary btn-xs flex-1 tr-btn-approve" data-id="${t.id}">
              Aprobar
            </button>
          ` : ''}

          ${isInTransit ? `
            <button class="btn btn-success btn-xs flex-1 tr-btn-receive" data-id="${t.id}" style="background:#10b981;color:#fff;border:none;">
              Recibir
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }


  // ─── PROGRESSIVE STEP-BY-STEP WIZARD MODAL ────────────────────────────────
  openNewTransferWizard() {
    let currentStep = 1;
    let wizardData = {
      sourceType: 'sucursal', // 'sucursal' | 'bodega'
      sourceId: '',
      sourceName: '',
      targetType: 'sucursal',
      targetId: '',
      targetName: '',
      items: [],
      reason: 'Reposición',
      notes: ''
    };

    let availableStockList = [];

    const branches = this.state.branches || [];
    const warehouses = this.state.warehouses || [];

    const renderStep = (modal) => {
      const bodyContainer = modal.$('#wizard-step-body');
      const stepIndicator = modal.$('#wizard-step-indicator');
      if (!bodyContainer) return;

      if (stepIndicator) {
        stepIndicator.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--color-border);">
            <div style="display:flex;gap:6px;">
              ${[1,2,3,4,5].map(step => `
                <div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;
                  background:${step === currentStep ? 'var(--color-accent)' : step < currentStep ? '#10b981' : 'rgba(255,255,255,0.08)'};
                  color:${step <= currentStep ? '#fff' : 'var(--color-text-secondary)'};">
                  ${step < currentStep ? '✓' : step}
                </div>
              `).join('')}
            </div>
            <span style="font-size:0.8rem;font-weight:700;color:var(--color-accent);">
              Paso ${currentStep} de 5: ${['Origen', 'Productos', 'Destino', 'Motivo', 'Revisión'][currentStep - 1]}
            </span>
          </div>
        `;
      }

      // ── STEP 1: ORIGEN ─────────────────────────────────────────────────────
      if (currentStep === 1) {
        const branchOptions = branches.map(b => `<option value="${b.id}">${b.name} (${b.city || 'General'})</option>`).join('');
        const warehouseOptions = warehouses.map(w => `<option value="${w.id}">${w.name} — ${w.branchName || 'Sucursal'}</option>`).join('');

        bodyContainer.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:16px;text-align:left;">
            <label style="font-weight:700;font-size:0.9rem;color:#fff;">¿Desde dónde se realizará el traslado?</label>
            
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <label style="background:rgba(255,255,255,0.04);border:2px solid ${wizardData.sourceType === 'sucursal' ? 'var(--color-accent)' : 'var(--color-border)'};border-radius:var(--radius-lg);padding:14px;cursor:pointer;display:flex;align-items:center;gap:10px;">
                <input type="radio" name="w-source-type" value="sucursal" ${wizardData.sourceType === 'sucursal' ? 'checked' : ''} />
                <div>
                  <strong style="display:block;font-size:0.85rem;color:#fff;">🏢 Local / Sucursal</strong>
                  <span style="font-size:0.72rem;color:var(--color-text-secondary);">Traspaso desde tienda física</span>
                </div>
              </label>

              ${warehouses.length > 0 ? `
                <label style="background:rgba(255,255,255,0.04);border:2px solid ${wizardData.sourceType === 'bodega' ? 'var(--color-accent)' : 'var(--color-border)'};border-radius:var(--radius-lg);padding:14px;cursor:pointer;display:flex;align-items:center;gap:10px;">
                  <input type="radio" name="w-source-type" value="bodega" ${wizardData.sourceType === 'bodega' ? 'checked' : ''} />
                  <div>
                    <strong style="display:block;font-size:0.85rem;color:#fff;">📦 Bodega</strong>
                    <span style="font-size:0.72rem;color:var(--color-text-secondary);">Traspaso desde centro de acopio</span>
                  </div>
                </label>
              ` : ''}
            </div>

            <div id="w-source-location-container" style="margin-top:8px;">
              ${wizardData.sourceType === 'sucursal' ? `
                <div class="form-group">
                  <label class="form-label">Seleccionar Sucursal de Origen *</label>
                  <select id="w-select-source-id" class="input input-md">
                    ${branchOptions || '<option value="">No hay sucursales registradas</option>'}
                  </select>
                </div>
              ` : `
                <div class="form-group">
                  <label class="form-label">Seleccionar Bodega de Origen *</label>
                  <select id="w-select-source-id" class="input input-md">
                    ${warehouseOptions || '<option value="">No hay bodegas registradas</option>'}
                  </select>
                </div>
              `}
            </div>
          </div>
        `;

        bodyContainer.querySelectorAll('input[name="w-source-type"]').forEach(radio => {
          radio.addEventListener('change', (e) => {
            wizardData.sourceType = e.target.value;
            renderStep(modal);
          });
        });
      }

      // ── STEP 2: PRODUCTOS ──────────────────────────────────────────────────
      else if (currentStep === 2) {
        bodyContainer.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:14px;text-align:left;">
            <div style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.25);border-radius:var(--radius-md);padding:10px 14px;font-size:0.8rem;color:#a5b4fc;">
              📍 Origen seleccionado: <strong>${wizardData.sourceName}</strong> (${wizardData.sourceType === 'bodega' ? 'Bodega' : 'Sucursal'})
            </div>

            <div style="display:flex;gap:10px;align-items:center;">
              <input type="text" id="w-prod-search" class="input input-sm" placeholder="🔍 Buscar por nombre, SKU, código de barras..." style="flex:1;" />
            </div>

            <!-- Available Stock Table -->
            <div id="w-prod-results-container" style="max-height:220px;overflow-y:auto;background:rgba(15,23,42,0.6);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:8px;">
              <div style="text-align:center;padding:16px;color:var(--color-text-secondary);font-size:0.8rem;">Cargando existencias del origen...</div>
            </div>

            <!-- Added Items List -->
            <div style="border-top:1px solid var(--color-border);padding-top:12px;margin-top:6px;">
              <strong style="font-size:0.85rem;color:#fff;display:block;margin-bottom:8px;">🛒 Productos a trasladar (${wizardData.items.length}):</strong>
              ${wizardData.items.length === 0 ? `
                <div style="font-size:0.78rem;color:var(--color-text-secondary);text-align:center;padding:12px;border:1px dashed var(--color-border);border-radius:var(--radius-md);">
                  Aún no has agregado ningún producto al traslado.
                </div>
              ` : `
                <div style="display:flex;flex-direction:column;gap:6px;max-height:140px;overflow-y:auto;">
                  ${wizardData.items.map((item, idx) => `
                    <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.04);padding:8px 12px;border-radius:var(--radius-sm);font-size:0.8rem;">
                      <div>
                        <strong style="color:#fff;">${item.name}</strong>
                        <span style="font-size:0.72rem;color:var(--color-text-tertiary);display:block;">SKU: ${item.sku || 'N/A'}</span>
                      </div>
                      <div style="display:flex;align-items:center;gap:12px;">
                        <span style="font-weight:700;color:var(--color-accent);">${item.quantity} ${item.unit}</span>
                        <button type="button" class="w-btn-remove-item" data-idx="${idx}" style="background:none;border:none;color:#ef4444;cursor:pointer;font-weight:700;font-size:0.9rem;">✕</button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>
          </div>
        `;

        // Fetch available stock
        WarehouseService.getAvailableStockForOrigin(wizardData.sourceType, wizardData.sourceId).then(stockList => {
          availableStockList = stockList;
          renderProductSearchList(modal, availableStockList, wizardData);
        });

        bodyContainer.querySelector('#w-prod-search')?.addEventListener('input', (e) => {
          const q = e.target.value.toLowerCase().trim();
          const filtered = availableStockList.filter(p => 
            p.name.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            p.barcode.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q)
          );
          renderProductSearchList(modal, filtered, wizardData);
        });
      }

      // ── STEP 3: DESTINO ────────────────────────────────────────────────────
      else if (currentStep === 3) {
        const branchOptions = branches.filter(b => !(wizardData.sourceType === 'sucursal' && b.id === wizardData.sourceId))
          .map(b => `<option value="${b.id}">${b.name} (${b.city || 'General'})</option>`).join('');
        
        const warehouseOptions = warehouses.filter(w => !(wizardData.sourceType === 'bodega' && w.id === wizardData.sourceId))
          .map(w => `<option value="${w.id}">${w.name} — ${w.branchName || 'Sucursal'}</option>`).join('');

        bodyContainer.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:16px;text-align:left;">
            <label style="font-weight:700;font-size:0.9rem;color:#fff;">¿A dónde se realizará el traslado?</label>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <label style="background:rgba(255,255,255,0.04);border:2px solid ${wizardData.targetType === 'sucursal' ? 'var(--color-accent)' : 'var(--color-border)'};border-radius:var(--radius-lg);padding:14px;cursor:pointer;display:flex;align-items:center;gap:10px;">
                <input type="radio" name="w-target-type" value="sucursal" ${wizardData.targetType === 'sucursal' ? 'checked' : ''} />
                <div>
                  <strong style="display:block;font-size:0.85rem;color:#fff;">🏢 Local / Sucursal</strong>
                  <span style="font-size:0.72rem;color:var(--color-text-secondary);">Destino a tienda física</span>
                </div>
              </label>

              ${warehouses.length > 0 ? `
                <label style="background:rgba(255,255,255,0.04);border:2px solid ${wizardData.targetType === 'bodega' ? 'var(--color-accent)' : 'var(--color-border)'};border-radius:var(--radius-lg);padding:14px;cursor:pointer;display:flex;align-items:center;gap:10px;">
                  <input type="radio" name="w-target-type" value="bodega" ${wizardData.targetType === 'bodega' ? 'checked' : ''} />
                  <div>
                    <strong style="display:block;font-size:0.85rem;color:#fff;">📦 Bodega</strong>
                    <span style="font-size:0.72rem;color:var(--color-text-secondary);">Destino a almacén o acopio</span>
                  </div>
                </label>
              ` : ''}
            </div>

            <div id="w-target-location-container" style="margin-top:8px;">
              ${wizardData.targetType === 'sucursal' ? `
                <div class="form-group">
                  <label class="form-label">Seleccionar Sucursal de Destino *</label>
                  <select id="w-select-target-id" class="input input-md">
                    ${branchOptions || '<option value="">No hay otras sucursales válidas</option>'}
                  </select>
                </div>
              ` : `
                <div class="form-group">
                  <label class="form-label">Seleccionar Bodega de Destino *</label>
                  <select id="w-select-target-id" class="input input-md">
                    ${warehouseOptions || '<option value="">No hay otras bodegas válidas</option>'}
                  </select>
                </div>
              `}
            </div>
          </div>
        `;

        bodyContainer.querySelectorAll('input[name="w-target-type"]').forEach(radio => {
          radio.addEventListener('change', (e) => {
            wizardData.targetType = e.target.value;
            renderStep(modal);
          });
        });
      }

      // ── STEP 4: MOTIVO ─────────────────────────────────────────────────────
      else if (currentStep === 4) {
        bodyContainer.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:14px;text-align:left;">
            <div class="form-group">
              <label class="form-label">Motivo del Traslado *</label>
              <select id="w-select-reason" class="input input-md">
                <option value="Reposición"${wizardData.reason === 'Reposición' ? ' selected' : ''}>Reposición de inventario</option>
                <option value="Abastecimiento"${wizardData.reason === 'Abastecimiento' ? ' selected' : ''}>Abastecimiento de sucursal</option>
                <option value="Redistribución"${wizardData.reason === 'Redistribución' ? ' selected' : ''}>Redistribución por demanda</option>
                <option value="Exceso de inventario"${wizardData.reason === 'Exceso de inventario' ? ' selected' : ''}>Exceso de existencias en origen</option>
                <option value="Solicitud de sucursal"${wizardData.reason === 'Solicitud de sucursal' ? ' selected' : ''}>Solicitud directa de local</option>
                <option value="Devolución"${wizardData.reason === 'Devolución' ? ' selected' : ''}>Devolución de mercadería</option>
                <option value="Otro"${wizardData.reason === 'Otro' ? ' selected' : ''}>Otro motivo</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Observaciones e Instrucciones</label>
              <textarea id="w-notes-input" class="input input-md" rows="3" placeholder="Ingresa notas o instrucciones de transporte...">${wizardData.notes || ''}</textarea>
            </div>

            <div style="background:rgba(255,255,255,0.04);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:12px;font-size:0.8rem;color:var(--color-text-secondary);">
              👤 <strong>Responsable del registro:</strong> ${this.currentUser.displayName || this.currentUser.email} (${this.currentUser.role})
            </div>
          </div>
        `;
      }

      // ── STEP 5: REVISIÓN ───────────────────────────────────────────────────
      else if (currentStep === 5) {
        bodyContainer.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:16px;text-align:left;">
            <div style="font-weight:700;font-size:0.95rem;color:#fff;text-align:center;">📋 Resumen Final del Traslado</div>

            <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center;background:rgba(15,23,42,0.6);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:14px;">
              <div>
                <span style="font-size:0.68rem;color:var(--color-text-tertiary);text-transform:uppercase;font-weight:700;display:block;">Origen</span>
                <strong style="font-size:0.85rem;color:#fff;">${wizardData.sourceName}</strong>
                <span style="font-size:0.72rem;color:var(--color-text-secondary);display:block;">${wizardData.sourceType === 'bodega' ? '📦 Bodega' : '🏢 Local'}</span>
              </div>

              <div style="font-size:1.4rem;color:var(--color-accent);font-weight:bold;">➔</div>

              <div style="text-align:right;">
                <span style="font-size:0.68rem;color:var(--color-text-tertiary);text-transform:uppercase;font-weight:700;display:block;">Destino</span>
                <strong style="font-size:0.85rem;color:#fff;">${wizardData.targetName}</strong>
                <span style="font-size:0.72rem;color:var(--color-text-secondary);display:block;">${wizardData.targetType === 'bodega' ? '📦 Bodega' : '🏢 Local'}</span>
              </div>
            </div>

            <!-- Items Table Summary -->
            <div style="background:rgba(255,255,255,0.03);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:10px;">
              <strong style="font-size:0.82rem;color:#fff;display:block;margin-bottom:8px;">📦 Productos incluidos (${wizardData.items.length}):</strong>
              <div style="display:flex;flex-direction:column;gap:6px;max-height:160px;overflow-y:auto;">
                ${wizardData.items.map(i => `
                  <div style="display:flex;justify-content:space-between;font-size:0.78rem;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                    <span style="color:#fff;">• ${i.name}</span>
                    <strong style="color:var(--color-accent);">${i.quantity} ${i.unit}</strong>
                  </div>
                `).join('')}
              </div>
            </div>

            <div style="font-size:0.8rem;color:var(--color-text-secondary);display:grid;grid-template-columns:1fr 1fr;gap:10px;background:rgba(255,255,255,0.02);padding:10px;border-radius:var(--radius-md);">
              <div><strong>Motivo:</strong> ${wizardData.reason}</div>
              <div><strong>Responsable:</strong> ${this.currentUser.displayName || this.currentUser.email}</div>
            </div>
          </div>
        `;
      }

      // Update modal footer buttons
      const footerBtnNext = modal.$('#btn-wizard-next');
      const footerBtnPrev = modal.$('#btn-wizard-prev');

      if (footerBtnPrev) {
        footerBtnPrev.style.display = currentStep > 1 ? 'inline-flex' : 'none';
      }

      if (footerBtnNext) {
        footerBtnNext.textContent = currentStep === 5 ? '🚀 Confirmar Traslado' : 'Siguiente →';
      }
    };

    const renderProductSearchList = (modal, list, wizardData) => {
      const container = modal.$('#w-prod-results-container');
      if (!container) return;

      if (list.length === 0) {
        container.innerHTML = `<div style="text-align:center;padding:16px;color:var(--color-text-secondary);font-size:0.8rem;">No hay productos con existencias en este origen.</div>`;
        return;
      }

      container.innerHTML = list.map(p => {
        const inCart = wizardData.items.find(i => i.productId === p.productId);
        return `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.05);gap:10px;">
            <div style="flex:1;">
              <strong style="font-size:0.82rem;color:#fff;display:block;">${p.name}</strong>
              <span style="font-size:0.72rem;color:var(--color-text-tertiary);">Stock disp: <strong style="color:#10b981;">${p.availableStock} ${p.unit}</strong> | SKU: ${p.sku || 'N/A'}</span>
            </div>

            <div style="display:flex;align-items:center;gap:6px;">
              <input type="number" class="input input-xs w-prod-qty-input" data-id="${p.productId}" min="1" max="${p.availableStock}" value="${inCart ? inCart.quantity : 1}" style="width:64px;text-align:center;" />
              <button type="button" class="btn btn-primary btn-xs w-btn-add-prod" data-id="${p.productId}">
                ${inCart ? '✓ Actualizar' : '+ Agregar'}
              </button>
            </div>
          </div>
        `;
      }).join('');

      // Bind add events
      container.querySelectorAll('.w-btn-add-prod').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const prodId = e.currentTarget.dataset.id;
          const prod = availableStockList.find(p => p.productId === prodId);
          const qtyInput = container.querySelector(`.w-prod-qty-input[data-id="${prodId}"]`);
          const qty = Number(qtyInput?.value || 1);

          if (!prod) return;

          if (qty <= 0 || qty > prod.availableStock) {
            NotificationService.error(`La cantidad debe estar entre 1 y el stock disponible (${prod.availableStock}).`);
            return;
          }

          const existingIdx = wizardData.items.findIndex(i => i.productId === prodId);
          if (existingIdx >= 0) {
            wizardData.items[existingIdx].quantity = qty;
          } else {
            wizardData.items.push({
              productId: prod.productId,
              name: prod.name,
              sku: prod.sku,
              barcode: prod.barcode,
              unit: prod.unit,
              quantity: qty
            });
          }

          NotificationService.success(`"${prod.name}" (${qty} ${prod.unit}) añadido al traslado.`);
          renderStep(modal);
        });
      });

      // Bind remove events
      modal.$('#wizard-step-body').querySelectorAll('.w-btn-remove-item')?.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = Number(e.currentTarget.dataset.idx);
          wizardData.items.splice(idx, 1);
          renderStep(modal);
        });
      });
    };

    const modal = new Modal({
      title: '📦 Nuevo Traslado de Inventario',
      bodyHTML: `
        <div id="wizard-step-indicator"></div>
        <div id="wizard-step-body"></div>
      `,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-wizard-prev" style="display:none;">← Anterior</button>
        <button class="btn btn-primary btn-sm" id="btn-wizard-next">Siguiente →</button>
      `
    });

    document.body.appendChild(modal.mount());
    renderStep(modal);

    modal.$('#btn-wizard-prev')?.addEventListener('click', () => {
      if (currentStep > 1) {
        currentStep--;
        renderStep(modal);
      }
    });

    modal.$('#btn-wizard-next')?.addEventListener('click', async () => {
      // Validate Step 1
      if (currentStep === 1) {
        const sel = modal.$('#w-select-source-id');
        if (!sel || !sel.value) {
          NotificationService.error('Selecciona una ubicación de origen válida.');
          return;
        }
        wizardData.sourceId = sel.value;
        const opt = sel.options[sel.selectedIndex];
        wizardData.sourceName = opt ? opt.text : 'Origen';
      }

      // Validate Step 2
      else if (currentStep === 2) {
        if (wizardData.items.length === 0) {
          NotificationService.error('Debes agregar al menos 1 producto al traslado.');
          return;
        }
      }

      // Validate Step 3
      else if (currentStep === 3) {
        const sel = modal.$('#w-select-target-id');
        if (!sel || !sel.value) {
          NotificationService.error('Selecciona una ubicación de destino válida.');
          return;
        }
        if (wizardData.sourceType === wizardData.targetType && sel.value === wizardData.sourceId) {
          NotificationService.error('El destino no puede ser igual al origen seleccionado.');
          return;
        }
        wizardData.targetId = sel.value;
        const opt = sel.options[sel.selectedIndex];
        wizardData.targetName = opt ? opt.text : 'Destino';
      }

      // Validate Step 4
      else if (currentStep === 4) {
        wizardData.reason = modal.$('#w-select-reason')?.value || 'Reposición';
        wizardData.notes = modal.$('#w-notes-input')?.value || '';
      }

      // Step 5: Final Submission
      else if (currentStep === 5) {
        try {
          const res = await WarehouseService.createTransfer(wizardData);
          NotificationService.success(`Traslado ${res.transferNumber} registrado con éxito.`);
          modal.close();
        } catch (err) {
          NotificationService.error(`Error al registrar traslado: ${err.message}`);
        }
        return;
      }

      currentStep++;
      renderStep(modal);
    });
  }

  // ─── DETAIL & TIMELINE MODAL ──────────────────────────────────────────────
  openDetailModal(transfer) {
    const timeline = transfer.timeline || [];
    const dateStr = TimeService.formatDate(transfer.createdAt || Date.now());

    const bodyHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;text-align:left;">
        <!-- Header status banner -->
        <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(15,23,42,0.6);padding:12px 16px;border-radius:var(--radius-lg);border:1px solid var(--color-border);">
          <div>
            <span style="font-size:0.75rem;color:var(--color-text-tertiary);">N° Traslado</span>
            <h4 style="font-family:var(--font-mono);font-weight:800;color:var(--color-accent);font-size:1.1rem;margin:0;">${transfer.transferNumber}</h4>
          </div>
          <div style="text-align:right;">
            <span class="tr-status-badge tr-status-${transfer.status}">${transfer.status}</span>
            <span style="font-size:0.72rem;color:var(--color-text-secondary);display:block;margin-top:4px;">${dateStr}</span>
          </div>
        </div>

        <!-- Route Info -->
        <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;background:rgba(255,255,255,0.03);padding:12px;border-radius:var(--radius-md);">
          <div>
            <span style="font-size:0.68rem;color:var(--color-text-tertiary);text-transform:uppercase;font-weight:700;display:block;">Origen</span>
            <strong style="color:#fff;font-size:0.85rem;">${transfer.sourceName}</strong>
          </div>
          <div style="color:var(--color-accent);font-weight:bold;">➔</div>
          <div style="text-align:right;">
            <span style="font-size:0.68rem;color:var(--color-text-tertiary);text-transform:uppercase;font-weight:700;display:block;">Destino</span>
            <strong style="color:#fff;font-size:0.85rem;">${transfer.targetName}</strong>
          </div>
        </div>

        <!-- Items Table -->
        <div>
          <strong style="font-size:0.85rem;color:#fff;display:block;margin-bottom:8px;">📦 Productos Incluidos:</strong>
          <table style="width:100%;font-size:0.8rem;border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:1px solid var(--color-border);color:var(--color-text-secondary);text-align:left;">
                <th style="padding:6px;">Producto</th>
                <th style="padding:6px;text-align:center;">Enviado</th>
                ${transfer.status === 'RECIBIDO' ? '<th style="padding:6px;text-align:center;">Recibido</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${(transfer.items || []).map(i => `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                  <td style="padding:6px;color:#fff;">${i.name}</td>
                  <td style="padding:6px;text-align:center;font-weight:700;color:var(--color-accent);">${i.quantity} ${i.unit}</td>
                  ${transfer.status === 'RECIBIDO' ? `<td style="padding:6px;text-align:center;font-weight:700;color:#34d399;">${i.receivedQuantity !== undefined ? i.receivedQuantity : i.quantity} ${i.unit}</td>` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- Timeline Audit -->
        <div style="border-top:1px solid var(--color-border);padding-top:12px;margin-top:6px;">
          <strong style="font-size:0.85rem;color:#fff;display:block;margin-bottom:10px;">⏱️ Auditoría & Timeline:</strong>
          <div style="display:flex;flex-direction:column;gap:8px;padding-left:10px;border-left:2px solid var(--color-accent);">
            ${timeline.map(e => `
              <div style="position:relative;font-size:0.78rem;">
                <strong style="color:#fff;">${e.status}</strong> &bull; <span style="color:var(--color-text-secondary);">${e.user}</span>
                <div style="font-size:0.72rem;color:var(--color-text-tertiary);">${e.note || ''} — ${TimeService.formatDate(e.timestamp)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    const modal = new Modal({
      title: `📦 Detalle del Traslado ${transfer.transferNumber}`,
      bodyHTML,
      footerHTML: `<button class="btn btn-secondary btn-sm" id="btn-close-detail-modal">Cerrar</button>`
    });

    document.body.appendChild(modal.mount());
    modal.$('#btn-close-detail-modal')?.addEventListener('click', () => modal.close());
  }

  // ─── RECEIVE MODAL ────────────────────────────────────────────────────────
  openReceiveModal(transfer) {
    const items = transfer.items || [];
    let receivedState = items.map(i => ({ ...i, receivedQuantity: i.quantity, damagedQuantity: 0 }));

    const bodyHTML = `
      <div style="display:flex;flex-direction:column;gap:14px;text-align:left;">
        <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:var(--radius-md);padding:10px 14px;font-size:0.82rem;color:#34d399;">
          📥 Confirmación de Recepción en <strong>${transfer.targetName}</strong>
        </div>

        <p style="font-size:0.8rem;color:var(--color-text-secondary);">
          Verifica las cantidades recibidas físicamente. Si existe alguna diferencia o mercancía dañada, ajusta las cantidades antes de confirmar.
        </p>

        <div style="max-height:220px;overflow-y:auto;background:rgba(15,23,42,0.6);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:8px;">
          ${receivedState.map((i, idx) => `
            <div style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:space-between;gap:10px;">
              <div>
                <strong style="font-size:0.82rem;color:#fff;display:block;">${i.name}</strong>
                <span style="font-size:0.72rem;color:var(--color-text-tertiary);">Enviado: ${i.quantity} ${i.unit}</span>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <label style="font-size:0.72rem;color:var(--color-text-secondary);">Recibido:</label>
                <input type="number" class="input input-xs r-qty-rec" data-idx="${idx}" min="0" max="${i.quantity}" value="${i.receivedQuantity}" style="width:60px;text-align:center;" />
              </div>
            </div>
          `).join('')}
        </div>

        <div class="form-group">
          <label class="form-label">Observaciones de Recepción</label>
          <input type="text" id="r-notes" class="input input-sm" placeholder="Opcional: notas sobre la entrega o estado del paquete..." />
        </div>
      </div>
    `;

    const modal = new Modal({
      title: `📥 Recibir Traslado ${transfer.transferNumber}`,
      bodyHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-cancel-receive">Cancelar</button>
        <button class="btn btn-success btn-sm" id="btn-confirm-receive" style="background:#10b981;color:#fff;border:none;">Confirmar Recepción</button>
      `
    });

    document.body.appendChild(modal.mount());

    modal.$('#btn-cancel-receive')?.addEventListener('click', () => modal.close());
    modal.$('#btn-confirm-receive')?.addEventListener('click', async () => {
      // Read values
      modal.element.querySelectorAll('.r-qty-rec').forEach(inp => {
        const idx = Number(inp.dataset.idx);
        receivedState[idx].receivedQuantity = Number(inp.value || 0);
      });

      const hasDiscrepancy = receivedState.some(i => i.receivedQuantity < i.quantity);
      const notes = modal.$('#r-notes')?.value || '';

      try {
        await WarehouseService.receiveTransfer(transfer.id, transfer, {
          receivedItems: receivedState,
          isPartial: hasDiscrepancy,
          discrepancyReason: hasDiscrepancy ? 'Diferencia en recepción' : '',
          discrepancyNotes: notes
        });

        NotificationService.success(`Traslado ${transfer.transferNumber} recibido e inventario actualizado.`);
        modal.close();
      } catch (err) {
        NotificationService.error(err.message);
      }
    });
  }

  unmount() {
    if (typeof this.state.unsubTransfers === 'function') {
      this.state.unsubTransfers();
    } else if (typeof this.state.unsubTransfers === 'string') {
      FirestoreService.unsubscribe(this.state.unsubTransfers);
    }

    if (typeof this.state.unsubWarehouses === 'function') {
      this.state.unsubWarehouses();
    } else if (typeof this.state.unsubWarehouses === 'string') {
      FirestoreService.unsubscribe(this.state.unsubWarehouses);
    }

    if (typeof this._unsubStore === 'function') {
      this._unsubStore();
    }

    this.layout.unmount();
    super.unmount();
  }
}
