/**
 * @file warehouse.view.js
 * @description Módulo independiente de Bodega, Existencias y Traslados de Inventario para Ultra Administrador.
 * Permite registrar bodegas por sucursal, administrar existencias, entradas, salidas y realizar
 * exportaciones/traslados de mercadería entre Locales ↔ Bodegas ↔ Sucursales.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { WarehouseService } from '../../../services/warehouse.service.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';

export class WarehouseView extends Component {
  constructor(props = {}) {
    super(props);
    const state = GlobalStore.getState();
    this.currentCompany = state.currentCompany || {};

    this.state = {
      activeTab: 'warehouses', // 'warehouses' | 'stock' | 'transfers' | 'history'
      warehouses: [],
      stock: [],
      transfers: [],
      products: [],
      branches: state.branches || [],
      selectedWarehouseId: '',
      searchTerm: ''
    };

    this.layout = new PageLayout({
      title: '📦 Gestión de Bodegas y Traslados',
      subtitle: `${this.currentCompany.name || 'Mi Empresa'} — Control de almacenes, stock y transferencias de inventario.`,
      actionHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-new-transfer">🚚 Nuevo Traslado</button>
        <button class="btn btn-primary btn-sm" id="btn-new-warehouse">+ Registrar Bodega</button>
      `,
      contentHTML: `
        <!-- KPIs -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="card p-4 flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xl text-indigo-400">📦</div>
            <div>
              <div class="text-2xl font-extrabold text-white" id="wh-kpi-count">0</div>
              <div class="text-xs text-secondary">Bodegas Registradas</div>
            </div>
          </div>
          <div class="card p-4 flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl text-emerald-400">📊</div>
            <div>
              <div class="text-2xl font-extrabold text-emerald-400" id="wh-kpi-total-items">0</div>
              <div class="text-xs text-secondary">Total Existencias</div>
            </div>
          </div>
          <div class="card p-4 flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-xl text-cyan-400">🚚</div>
            <div>
              <div class="text-2xl font-extrabold text-cyan-400" id="wh-kpi-pending-transfers">0</div>
              <div class="text-xs text-secondary">Traslados Pendientes</div>
            </div>
          </div>
          <div class="card p-4 flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xl text-amber-400">⚠️</div>
            <div>
              <div class="text-2xl font-extrabold text-amber-400" id="wh-kpi-low-stock">0</div>
              <div class="text-xs text-secondary">Productos Stock Bajo</div>
            </div>
          </div>
        </div>

        <!-- Module Tabs Navigation -->
        <div class="flex gap-2 border-b border-gray-800 mb-6 pb-2">
          <button class="btn btn-sm wh-tab-btn btn-primary" data-tab="warehouses">🏢 Bodegas y Almacenes</button>
          <button class="btn btn-sm wh-tab-btn btn-secondary" data-tab="stock">📋 Existencias en Bodega</button>
          <button class="btn btn-sm wh-tab-btn btn-secondary" data-tab="transfers">🚚 Traslados e Intercambios</button>
        </div>

        <!-- Active View Container -->
        <div id="warehouse-tab-container">
          <p class="text-center py-10 text-secondary">Cargando datos de bodega...</p>
        </div>
      `
    });

    this.unsubscribers = [];
  }

  mount() {
    const element = this.layout.mount();
    this.bindEvents(element);
    this.subscribeData(element);
    return element;
  }

  subscribeData(element) {
    try {
      const u1 = WarehouseService.listenWarehouses((warehouses) => {
        this.state.warehouses = warehouses || [];
        this.updateKPIs(element);
        this.renderView(element);
      });
      this.unsubscribers.push(u1);

      const u2 = WarehouseService.listenWarehouseStock((stock) => {
        this.state.stock = stock || [];
        this.updateKPIs(element);
        this.renderView(element);
      });
      this.unsubscribers.push(u2);

      const u3 = WarehouseService.listenTransfers((transfers) => {
        this.state.transfers = transfers || [];
        this.updateKPIs(element);
        this.renderView(element);
      });
      this.unsubscribers.push(u3);

      const u4 = FirestoreService.listenToTenant('productos', (products) => {
        this.state.products = products || [];
      });
      this.unsubscribers.push(u4);

      const u5 = GlobalStore.subscribe('branches', (branches) => {
        this.state.branches = branches || [];
      });
      this.unsubscribers.push(u5);
    } catch (e) {
      console.error('[WarehouseView] Subscription error:', e);
    }
  }

  bindEvents(element) {
    element.querySelector('#btn-new-warehouse')?.addEventListener('click', () => this.openWarehouseModal());
    element.querySelector('#btn-new-transfer')?.addEventListener('click', () => this.openTransferModal());

    // Tab buttons
    element.querySelectorAll('.wh-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.tab;
        this.state.activeTab = tab;
        element.querySelectorAll('.wh-tab-btn').forEach(b => {
          b.classList.remove('btn-primary');
          b.classList.add('btn-secondary');
        });
        e.currentTarget.classList.remove('btn-secondary');
        e.currentTarget.classList.add('btn-primary');
        this.renderView(element);
      });
    });

    // Delegation on dynamic container
    element.querySelector('#warehouse-tab-container')?.addEventListener('click', (e) => {
      // Stock movement button
      const moveBtn = e.target.closest('.btn-stock-movement');
      if (moveBtn) {
        const whId = moveBtn.dataset.whid;
        const type = moveBtn.dataset.type; // 'ENTRADA' | 'SALIDA'
        this.openMovementModal(whId, type);
        return;
      }

      // Transfer completion button
      const completeTransferBtn = e.target.closest('.btn-complete-transfer');
      if (completeTransferBtn) {
        const id = completeTransferBtn.dataset.id;
        const transferObj = this.state.transfers.find(t => t.id === id);
        if (transferObj && confirm(`¿Confirmar la recepción y completar el traslado "${transferObj.transferNumber}"?`)) {
          WarehouseService.updateTransferStatus(id, transferObj, 'COMPLETADO');
          NotificationService.success('Traslado completado. Existencias actualizadas.');
        }
      }
    });
  }

  updateKPIs(element) {
    const q = sel => element.querySelector(sel);
    const { warehouses, stock, transfers } = this.state;
    const { selectedBranchId } = GlobalStore.getState();

    let filteredStock = stock;
    let filteredTransfers = transfers;

    if (selectedBranchId && selectedBranchId !== 'all') {
      const whIds = warehouses.filter(w => w.branchId === selectedBranchId).map(w => w.id);
      filteredStock = stock.filter(s => whIds.includes(s.warehouseId));
      filteredTransfers = transfers.filter(t => t.sourceId === selectedBranchId || t.targetId === selectedBranchId);
    }

    const totalQty = filteredStock.reduce((acc, s) => acc + Number(s.quantity || 0), 0);
    const pendingCount = filteredTransfers.filter(t => t.status === 'PENDIENTE' || t.status === 'EN_TRANSITO').length;
    const lowStockCount = filteredStock.filter(s => Number(s.quantity || 0) <= Number(s.minStock || 5)).length;

    if (q('#wh-kpi-count')) q('#wh-kpi-count').textContent = warehouses.length;
    if (q('#wh-kpi-total-items')) q('#wh-kpi-total-items').textContent = totalQty;
    if (q('#wh-kpi-pending-transfers')) q('#wh-kpi-pending-transfers').textContent = pendingCount;
    if (q('#wh-kpi-low-stock')) q('#wh-kpi-low-stock').textContent = lowStockCount;
  }

  renderView(element) {
    const container = element.querySelector('#warehouse-tab-container');
    if (!container) return;

    if (this.state.activeTab === 'stock') {
      this.renderStockTab(container);
    } else if (this.state.activeTab === 'transfers') {
      this.renderTransfersTab(container);
    } else {
      this.renderWarehousesTab(container);
    }
  }

  renderWarehousesTab(container) {
    const { warehouses } = this.state;

    if (warehouses.length === 0) {
      container.innerHTML = `
        <div class="card p-10 text-center text-secondary">
          <div style="font-size:3rem; margin-bottom:12px;">📦</div>
          <h4 class="font-bold text-white text-lg">No hay bodegas registradas</h4>
          <p class="text-xs mt-1">Crea la primera bodega de almacenamiento con el botón "+ Registrar Bodega".</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-fade-in">
        ${warehouses.map(w => `
          <div class="card card-interactive p-5 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded border border-indigo-500/20">${w.code || 'BOD'}</span>
                <span class="badge ${w.status === 'ACTIVA' ? 'badge-success' : 'badge-danger'}">${w.status || 'ACTIVA'}</span>
              </div>
              <h4 class="text-lg font-bold text-white mb-1">📦 ${w.name}</h4>
              <p class="text-xs text-secondary mb-3">📍 ${w.branchName || 'Sucursal'} &bull; ${w.location || 'Sin ubicación'}</p>

              <div class="text-xs text-secondary space-y-1 py-3 border-t border-b border-gray-800/80 my-3">
                <div class="flex justify-between"><span>Responsable:</span><strong class="text-slate-300">${w.responsibleName || 'Sin asignar'}</strong></div>
                <div class="flex justify-between"><span>Capacidad:</span><strong class="text-slate-300">${w.capacity ? `${w.capacity} uds` : 'Ilimitada'}</strong></div>
              </div>
            </div>
            <div class="flex items-center gap-2 mt-2 pt-2">
              <button class="btn btn-secondary btn-xs flex-1 btn-stock-movement" data-whid="${w.id}" data-type="ENTRADA">+ Entrada</button>
              <button class="btn btn-secondary btn-xs flex-1 btn-stock-movement" data-whid="${w.id}" data-type="SALIDA">- Salida</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderStockTab(container) {
    const { stock, warehouses } = this.state;

    if (stock.length === 0) {
      container.innerHTML = `
        <div class="card p-10 text-center text-secondary">
          <div style="margin-bottom:12px;display:flex;justify-content:center;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48" style="color:var(--color-text-tertiary);"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
          </div>
          <h4 class="font-bold text-white text-lg">Sin existencias registradas en bodega</h4>
          <p class="text-xs mt-1">Registra entradas de inventario o realiza traslados a tus bodegas.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="table-container card p-4 animate-fade-in">
        <table class="table w-full">
          <thead>
            <tr>
              <th>PRODUCTO</th>
              <th>BODEGA</th>
              <th>SKU</th>
              <th>DISPONIBLE</th>
              <th>ESTADO STOCK</th>
              <th>LOTE / VENCIMIENTO</th>
            </tr>
          </thead>
          <tbody>
            ${stock.map(s => {
              const wh = warehouses.find(w => w.id === s.warehouseId);
              const isLow = Number(s.quantity || 0) <= Number(s.minStock || 5);
              return `
                <tr>
                  <td><strong class="text-white">${s.productName || 'Producto'}</strong></td>
                  <td class="text-xs text-secondary">${wh?.name || 'Bodega'}</td>
                  <td class="font-mono text-xs text-slate-400">${s.sku || '—'}</td>
                  <td><strong class="text-base ${isLow ? 'text-amber-400' : 'text-emerald-400'}">${s.quantity || 0}</strong></td>
                  <td><span class="badge ${isLow ? 'badge-warning' : 'badge-success'}">${isLow ? 'Stock Bajo' : 'Normal'}</span></td>
                  <td class="text-xs text-secondary">${s.batchNumber ? `Lote: ${s.batchNumber}` : ''} ${s.expirationDate ? `(${s.expirationDate})` : '—'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderTransfersTab(container) {
    const { transfers } = this.state;

    if (transfers.length === 0) {
      container.innerHTML = `
        <div class="card p-10 text-center text-secondary">
          <div style="margin-bottom:12px;display:flex;justify-content:center;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48" style="color:var(--color-text-tertiary);"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
          </div>
          <h4 class="font-bold text-white text-lg">No hay traslados registrados</h4>
          <p class="text-xs mt-1">Exporta o transfiere productos entre locales y bodegas con el botón de Nuevo Traslado.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="space-y-4 animate-fade-in">
        ${transfers.map(t => {
          const isPending = t.status === 'PENDIENTE' || t.status === 'EN_TRANSITO';
          const isCompleted = t.status === 'COMPLETADO';
          return `
            <div class="card p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div class="flex items-center gap-2 mb-2">
                  <span class="font-mono font-bold text-indigo-400 text-xs bg-indigo-500/10 px-2 py-1 rounded border border-indigo-500/20">${t.transferNumber}</span>
                  <span class="badge ${isCompleted ? 'badge-success' : (isPending ? 'badge-warning' : 'badge-danger')}">${t.status}</span>
                  <span class="text-xs text-secondary ml-2">${new Date(t.createdAt).toLocaleDateString('es-ES')}</span>
                </div>
                <div class="text-sm font-bold text-white flex items-center gap-2">
                  <span>${t.sourceName}</span>
                  <span class="text-indigo-400">➔</span>
                  <span>${t.targetName}</span>
                </div>

                <div class="text-xs text-secondary mt-2">
                  <strong>Items:</strong> ${(t.items || []).map(i => `${i.productName} (${i.quantity} uds)`).join(', ')}
                </div>
                ${t.notes ? `<div class="text-xs text-slate-400 mt-1 italic">"${t.notes}"</div>` : ''}
              </div>
              <div class="flex items-center gap-2">
                ${isPending ? `<button class="btn btn-success btn-xs btn-complete-transfer" data-id="${t.id}">✅ Confirmar Recepción</button>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  openWarehouseModal() {
    const branches = GlobalStore.getState().branches || [];

    const bodyHTML = `
      <div class="space-y-4 text-left">
        <div class="form-group">
          <label class="form-label" for="wh-form-name">Nombre de Bodega *</label>
          <input type="text" id="wh-form-name" class="input input-md" placeholder="Ej. Bodega Principal" required />
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="form-group">
            <label class="form-label" for="wh-form-code">Código Interno</label>
            <input type="text" id="wh-form-code" class="input input-md" placeholder="Ej. BOD-01" />
          </div>
          <div class="form-group">
            <label class="form-label" for="wh-form-branch">Sucursal Asignada</label>
            <select id="wh-form-branch" class="input input-md">
              ${branches.map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="form-group">
            <label class="form-label" for="wh-form-responsible">Responsable de Bodega</label>
            <input type="text" id="wh-form-responsible" class="input input-md" placeholder="Ej. Carlos Martínez" />
          </div>
          <div class="form-group">
            <label class="form-label" for="wh-form-capacity">Capacidad (unidades)</label>
            <input type="number" id="wh-form-capacity" class="input input-md" placeholder="1000" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="wh-form-location">Ubicación / Dirección</label>
          <input type="text" id="wh-form-location" class="input input-md" placeholder="Ej. Sector B, Módulo 4" />
        </div>
      </div>
    `;

    const modal = new Modal({
      title: '📦 Registrar Nueva Bodega',
      bodyHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-wh-cancel">Cancelar</button>
        <button class="btn btn-primary btn-sm" id="btn-wh-save">Crear Bodega</button>
      `
    });

    document.body.appendChild(modal.mount());

    modal.$('#btn-wh-cancel')?.addEventListener('click', () => modal.close());
    modal.$('#btn-wh-save')?.addEventListener('click', async () => {
      const name = modal.$('#wh-form-name')?.value?.trim();
      const branchId = modal.$('#wh-form-branch')?.value;
      const branchObj = branches.find(b => b.id === branchId);

      if (!name) {
        NotificationService.error('Por favor ingresa el nombre de la bodega.');
        return;
      }

      try {
        await WarehouseService.createWarehouse({
          name,
          code: modal.$('#wh-form-code')?.value || 'BOD-01',
          branchId,
          branchName: branchObj?.name || 'Sucursal',
          responsibleName: modal.$('#wh-form-responsible')?.value || '',
          capacity: modal.$('#wh-form-capacity')?.value || 0,
          location: modal.$('#wh-form-location')?.value || ''
        });
        NotificationService.success(`Bodega "${name}" registrada correctamente.`);
        modal.close();
      } catch (e) {
        console.error('[WarehouseView] Error saving warehouse:', e);
        NotificationService.error('Error al guardar la bodega.');
      }
    });
  }

  openMovementModal(warehouseId, type) {
    const { products } = this.state;

    const bodyHTML = `
      <div class="space-y-4 text-left">
        <div class="form-group">
          <label class="form-label" for="mov-form-product">Seleccionar Producto *</label>
          <select id="mov-form-product" class="input input-md">
            ${products.map(p => `<option value="${p.id}">${p.name} (Stock Actual: ${p.stock || p.existencias || 0})</option>`).join('')}
          </select>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="form-group">
            <label class="form-label" for="mov-form-qty">Cantidad *</label>
            <input type="number" id="mov-form-qty" class="input input-md" min="1" value="10" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="mov-form-cost">Costo Unitario (opcional)</label>
            <input type="number" id="mov-form-cost" class="input input-md" placeholder="0.00" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="mov-form-reason">Motivo del Movimiento</label>
          <input type="text" id="mov-form-reason" class="input input-md" placeholder="${type === 'ENTRADA' ? 'Ej. Recepción de Proveedor' : 'Ej. Despacho a Tienda'}" />
        </div>
      </div>
    `;

    const modal = new Modal({
      title: `${type === 'ENTRADA' ? '📥 Registrar Entrada' : '📤 Registrar Salida'} de Bodega`,
      bodyHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-mov-cancel">Cancelar</button>
        <button class="btn btn-primary btn-sm" id="btn-mov-save">Registrar ${type}</button>
      `
    });

    document.body.appendChild(modal.mount());

    modal.$('#btn-mov-cancel')?.addEventListener('click', () => modal.close());
    modal.$('#btn-mov-save')?.addEventListener('click', async () => {
      const prodId = modal.$('#mov-form-product')?.value;
      const qty = Number(modal.$('#mov-form-qty')?.value || 0);
      const prodObj = products.find(p => p.id === prodId);

      if (!prodObj || qty <= 0) {
        NotificationService.error('Selecciona un producto y cantidad válida.');
        return;
      }

      try {
        await WarehouseService.registerStockMovement({
          warehouseId,
          productId: prodId,
          productName: prodObj.name,
          sku: prodObj.sku || '',
          type,
          quantity: qty,
          cost: modal.$('#mov-form-cost')?.value || 0,
          reason: modal.$('#mov-form-reason')?.value || ''
        });
        NotificationService.success(`Movimiento de ${type} registrado.`);
        modal.close();
      } catch (e) {
        console.error('[WarehouseView] Error movement:', e);
        NotificationService.error('Error al registrar el movimiento.');
      }
    });
  }

  openTransferModal() {
    const { products, warehouses } = this.state;
    const branches = GlobalStore.getState().branches || [];

    const bodyHTML = `
      <div class="space-y-4 text-left">
        <!-- ORIGEN -->
        <div class="text-xs font-bold uppercase tracking-wider text-indigo-400 pb-1 border-b border-gray-800">
          1. Origen del Traslado
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="form-group">
            <label class="form-label" for="tr-source-type">Tipo Origen</label>
            <select id="tr-source-type" class="input input-md">
              <option value="sucursal">🏢 Sucursal / Local</option>
              <option value="bodega">📦 Bodega</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="tr-source-id">Lugar de Origen</label>
            <select id="tr-source-id" class="input input-md">
              ${branches.map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- DESTINO -->
        <div class="text-xs font-bold uppercase tracking-wider text-indigo-400 pt-2 pb-1 border-b border-gray-800">
          2. Destino del Traslado
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="form-group">
            <label class="form-label" for="tr-target-type">Tipo Destino</label>
            <select id="tr-target-type" class="input input-md">
              <option value="bodega">📦 Bodega</option>
              <option value="sucursal">🏢 Sucursal / Local</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="tr-target-id">Lugar de Destino</label>
            <select id="tr-target-id" class="input input-md">
              ${warehouses.map(w => `<option value="${w.id}">${w.name} (${w.branchName})</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- PRODUCTOS -->
        <div class="text-xs font-bold uppercase tracking-wider text-indigo-400 pt-2 pb-1 border-b border-gray-800">
          3. Producto a Trasladar
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="form-group md:col-span-2">
            <label class="form-label" for="tr-prod-id">Producto</label>
            <select id="tr-prod-id" class="input input-md">
              ${products.map(p => `<option value="${p.id}">${p.name} (Stock Total: ${p.stock || p.existencias || 0})</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="tr-prod-qty">Cantidad</label>
            <input type="number" id="tr-prod-qty" class="input input-md" min="1" value="10" required />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="tr-notes">Notas / Referencia del Envío</label>
          <textarea id="tr-notes" class="input input-md" rows="2" placeholder="Nº de guía, conductor, notas..."></textarea>
        </div>
      </div>
    `;

    const modal = new Modal({
      title: '🚚 Nuevo Traslado de Inventario',
      bodyHTML,
      footerHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-tr-cancel">Cancelar</button>
        <button class="btn btn-primary btn-sm" id="btn-tr-save">Registrar Traslado</button>
      `
    });

    document.body.appendChild(modal.mount());

    // Switch origin/destination dropdown options dynamically
    const updateTargetOptions = () => {
      const sourceType = modal.$('#tr-source-type')?.value;
      const targetType = modal.$('#tr-target-type')?.value;
      const sourceSel = modal.$('#tr-source-id');
      const targetSel = modal.$('#tr-target-id');

      if (sourceSel) {
        const sourceList = sourceType === 'sucursal' ? branches : warehouses;
        sourceSel.innerHTML = sourceList.map(item => `<option value="${item.id}">${item.name}</option>`).join('');
      }

      if (targetSel) {
        const targetList = targetType === 'sucursal' ? branches : warehouses;
        targetSel.innerHTML = targetList.map(item => `<option value="${item.id}">${item.name}</option>`).join('');
      }
    };

    modal.$('#tr-source-type')?.addEventListener('change', updateTargetOptions);
    modal.$('#tr-target-type')?.addEventListener('change', updateTargetOptions);

    modal.$('#btn-tr-cancel')?.addEventListener('click', () => modal.close());
    modal.$('#btn-tr-save')?.addEventListener('click', async () => {
      const sourceType = modal.$('#tr-source-type')?.value;
      const sourceId = modal.$('#tr-source-id')?.value;
      const targetType = modal.$('#tr-target-type')?.value;
      const targetId = modal.$('#tr-target-id')?.value;
      const prodId = modal.$('#tr-prod-id')?.value;
      const qty = Number(modal.$('#tr-prod-qty')?.value || 0);

      const prodObj = products.find(p => p.id === prodId);
      const sourceList = sourceType === 'sucursal' ? branches : warehouses;
      const targetList = targetType === 'sucursal' ? branches : warehouses;

      const sourceObj = sourceList.find(s => s.id === sourceId);
      const targetObj = targetList.find(t => t.id === targetId);

      if (!sourceId || !targetId || !prodId || qty <= 0) {
        NotificationService.error('Por favor completa todos los campos del traslado.');
        return;
      }

      if (sourceId === targetId) {
        NotificationService.error('El origen y el destino no pueden ser la misma ubicación.');
        return;
      }

      try {
        await WarehouseService.createTransfer({
          sourceType,
          sourceId,
          sourceName: sourceObj?.name || 'Origen',
          targetType,
          targetId,
          targetName: targetObj?.name || 'Destino',
          items: [{ productId: prodId, productName: prodObj?.name || 'Producto', quantity: qty }],
          notes: modal.$('#tr-notes')?.value || '',
          status: 'EN_TRANSITO'
        });

        NotificationService.success('Traslado registrado e iniciado en tránsito.');
        modal.close();
      } catch (e) {
        console.error('[WarehouseView] Transfer creation failed:', e);
        NotificationService.error('Error al registrar el traslado.');
      }
    });
  }

  unmount() {
    this.unsubscribers.forEach(unsub => {
      if (typeof unsub === 'function') unsub();
    });
    this.unsubscribers = [];
    this.layout.unmount();
    super.unmount();
  }
}
