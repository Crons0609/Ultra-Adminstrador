/**
 * @file rentals.view.js
 * @description Gestión de alquileres reales y recordatorios de devolución para Rent a Car.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { DataTable } from '../../../components/ui/table.js';
import { Modal } from '../../../components/ui/modal.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { NotificationService } from '../../../services/notification.service.js';
import { TimeService } from '../../../services/time.service.js';

export class RentalsView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || '';

    this.state = {
      rentals: [],
      vehicles: [],
      filterTab: 'todos',
      searchQuery: ''
    };

    // Initialize DataTable
    this.table = new DataTable({
      columns: [
        {
          key: 'brand',
          label: 'Vehículo',
          render: (val, row) => `
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.1rem;">🚗</span>
              <div style="display: flex; flex-direction: column;">
                <span class="font-semibold text-primary">${row.brand || ''} ${row.model || ''}</span>
                <span class="text-xs text-secondary" style="font-size: 0.7rem;">Placa: ${row.plate || 'N/A'}</span>
              </div>
            </div>
          `
        },
        { key: 'clientName', label: 'Cliente' },
        {
          key: 'rentStart',
          label: 'Fechas',
          render: (val, row) => `
            <div style="font-size: 0.8rem; display: flex; flex-direction: column;">
              <span>📅 Inicio: ${row.rentStart}</span>
              <span>📅 Fin: ${row.rentEnd}</span>
            </div>
          `
        },
        {
          key: 'total',
          label: 'Monto Total',
          render: (val) => `<strong style="color: var(--color-success);">$${Number(val || 0).toFixed(2)}</strong>`
        },
        {
          key: 'status',
          label: 'Estado',
          render: (val, row) => {
            let label = 'Completado';
            let badgeClass = 'stock-ok';
            
            if (val === 'ACTIVO') {
              const todayStr = new Date().toISOString().slice(0, 10);
              if (row.rentEnd < todayStr) {
                label = 'Vencido ⚠️';
                badgeClass = 'stock-out';
              } else if (row.rentEnd === todayStr) {
                label = 'Vence Hoy ⏰';
                badgeClass = 'stock-low';
              } else {
                label = 'Activo';
                badgeClass = 'stock-ok';
              }
            }
            return `<span class="stock-badge ${badgeClass}">${label}</span>`;
          }
        },
        {
          key: 'id',
          label: 'Acciones',
          render: (val, row) => {
            if (row.status === 'ACTIVO') {
              return `<button class="btn btn-success btn-sm py-1 px-2 btn-return-rental" data-id="${val}" data-vehid="${row.vehicleId}" style="font-size: 0.7rem;">🔑 Devolución</button>`;
            }
            return `<span class="text-xs text-secondary">Procesado</span>`;
          }
        }
      ],
      data: []
    });

    this.layout = new PageLayout({
      title: 'Gestión de Alquileres',
      subtitle: 'Contratos activos, devoluciones e historial en tiempo real.',
      actionHTML: `
        <button class="btn btn-primary btn-sm" id="btn-add-rental">
          + Nuevo Alquiler
        </button>
      `,
      contentHTML: `
        <!-- Stats -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--space-3);" class="mb-4">
          <div style="background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4); display: flex; align-items: center; gap: var(--space-3);">
            <span style="font-size: 1.5rem;">🚘</span>
            <div>
              <div style="font-size: 1.4rem; font-weight: 700; color: #6366f1;" id="stat-active">0</div>
              <div style="font-size: 0.75rem; color: var(--color-text-secondary);">Alquileres Activos</div>
            </div>
          </div>
          <div style="background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4); display: flex; align-items: center; gap: var(--space-3);">
            <span style="font-size: 1.5rem;">⏰</span>
            <div>
              <div style="font-size: 1.4rem; font-weight: 700; color: #f59e0b;" id="stat-due-today">0</div>
              <div style="font-size: 0.75rem; color: var(--color-text-secondary);">Vencen Hoy</div>
            </div>
          </div>
          <div style="background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4); display: flex; align-items: center; gap: var(--space-3);">
            <span style="font-size: 1.5rem;">⚠️</span>
            <div>
              <div style="font-size: 1.4rem; font-weight: 700; color: #ef4444;" id="stat-overdue">0</div>
              <div style="font-size: 0.75rem; color: var(--color-text-secondary);">Vencidos</div>
            </div>
          </div>
          <div style="background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4); display: flex; align-items: center; gap: var(--space-3);">
            <span style="font-size: 1.5rem;">✅</span>
            <div>
              <div style="font-size: 1.4rem; font-weight: 700; color: #10b981;" id="stat-completed">0</div>
              <div style="font-size: 0.75rem; color: var(--color-text-secondary);">Completados</div>
            </div>
          </div>
        </div>

        <!-- Filter and Search Toolbar -->
        <div class="card p-4 mb-4">
          <div class="inv-toolbar">
            <div class="inv-search">
              <span class="inv-search-icon">🔍</span>
              <input type="text" id="inp-search-rental" class="input input-md" placeholder="Buscar por cliente o vehículo..." />
            </div>

            <!-- Tab Filters -->
            <div style="display: flex; gap: var(--space-2);" id="rental-tabs">
              <button class="btn btn-sm btn-primary tab-btn" data-tab="todos">Todos</button>
              <button class="btn btn-sm btn-secondary tab-btn" data-tab="activos">Activos</button>
              <button class="btn btn-sm btn-secondary tab-btn" data-tab="vencidos">Vencidos</button>
              <button class="btn btn-sm btn-secondary tab-btn" data-tab="completados">Completados</button>
            </div>
          </div>
        </div>

        <!-- Data Table Container -->
        <div class="card p-5">
          <div id="rentals-table-wrapper"></div>
        </div>
      `
    });

    this.listeners = [];
    this.modalInstance = null;
  }

  mount() {
    const element = this.layout.mount();

    // Inject table
    const tableWrapper = element.querySelector('#rentals-table-wrapper');
    if (tableWrapper) {
      tableWrapper.appendChild(this.table.mount());
    }

    this.afterMount(element);
    this.subscribeData(element);

    return element;
  }

  afterMount(element) {
    const root = element || this.layout.element;
    if (!root) return;

    // Search input
    const inpSearch = root.querySelector('#inp-search-rental');
    if (inpSearch) {
      inpSearch.addEventListener('input', (e) => {
        this.state.searchQuery = e.target.value.toLowerCase();
        this.applyFilters();
      });
    }

    // Tabs filter
    const tabsContainer = root.querySelector('#rental-tabs');
    if (tabsContainer) {
      tabsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (btn) {
          tabsContainer.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.remove('btn-primary');
            b.classList.add('btn-secondary');
          });
          btn.classList.add('btn-primary');
          btn.classList.remove('btn-secondary');
          this.state.filterTab = btn.getAttribute('data-tab');
          this.applyFilters();
        }
      });
    }

    // Add rental button click
    const addBtn = root.querySelector('#btn-add-rental');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openAddRentalModal());
    }

    // Return vehicle button click delegation
    const tableWrapper = root.querySelector('#rentals-table-wrapper');
    if (tableWrapper) {
      tableWrapper.addEventListener('click', async (e) => {
        const returnBtn = e.target.closest('.btn-return-rental');
        if (returnBtn) {
          const rentalId = returnBtn.getAttribute('data-id');
          const vehicleId = returnBtn.getAttribute('data-vehid');
          if (confirm('¿Confirmar la devolución de este vehículo y cerrar el contrato?')) {
            try {
              // 1. Mark rental as completed
              await FirestoreService.update('rentals', rentalId, { status: 'COMPLETED', completedAt: Date.now() });
              // 2. Set vehicle status back to DISPONIBLE
              await FirestoreService.update('vehiculos', vehicleId, { status: 'DISPONIBLE' });
              
              NotificationService.success('Vehículo devuelto. Alquiler completado.');
            } catch (err) {
              console.error('[RentalsView] Error during return:', err);
              NotificationService.error('Error al procesar la devolución.');
            }
          }
        }
      });
    }
  }

  subscribeData(element) {
    try {
      const rentalsL = FirestoreService.listenToTenant('rentals', (rentals) => {
        this.state.rentals = rentals || [];
        this.recalculateStats(element);
        this.applyFilters();
      });
      this.listeners.push(rentalsL);

      const vehL = FirestoreService.listenToTenant('vehiculos', (vehicles) => {
        this.state.vehicles = vehicles || [];
        this.applyFilters();
      });
      this.listeners.push(vehL);
    } catch (e) {
      console.warn('[RentalsView] Listening error:', e.message);
    }
  }

  recalculateStats(element) {
    const root = element || this.layout.element;
    if (!root) return;

    const rentals = this.state.rentals;
    const todayStr = new Date().toISOString().slice(0, 10);

    const activeCount = rentals.filter(r => r.status === 'ACTIVO').length;
    const completedCount = rentals.filter(r => r.status === 'COMPLETED').length;
    const dueTodayCount = rentals.filter(r => r.status === 'ACTIVO' && r.rentEnd === todayStr).length;
    const overdueCount = rentals.filter(r => r.status === 'ACTIVO' && r.rentEnd < todayStr).length;

    const activeEl = root.querySelector('#stat-active');
    if (activeEl) activeEl.textContent = activeCount;

    const dueEl = root.querySelector('#stat-due-today');
    if (dueEl) dueEl.textContent = dueTodayCount;

    const overdueEl = root.querySelector('#stat-overdue');
    if (overdueEl) overdueEl.textContent = overdueCount;

    const completedEl = root.querySelector('#stat-completed');
    if (completedEl) completedEl.textContent = completedCount;
  }

  applyFilters() {
    const { searchQuery, filterTab, rentals } = this.state;
    const todayStr = new Date().toISOString().slice(0, 10);

    let filtered = rentals.filter(r => {
      const matchesSearch = !searchQuery || 
        (r.clientName || '').toLowerCase().includes(searchQuery) ||
        (r.brand || '').toLowerCase().includes(searchQuery) ||
        (r.model || '').toLowerCase().includes(searchQuery) ||
        (r.plate || '').toLowerCase().includes(searchQuery);

      let matchesTab = true;
      if (filterTab === 'activos') {
        matchesTab = r.status === 'ACTIVO';
      } else if (filterTab === 'vencidos') {
        matchesTab = r.status === 'ACTIVO' && r.rentEnd < todayStr;
      } else if (filterTab === 'completados') {
        matchesTab = r.status === 'COMPLETED';
      }

      return matchesSearch && matchesTab;
    });

    // Sort active and overdue first
    filtered.sort((a, b) => {
      if (a.status === 'ACTIVO' && b.status !== 'ACTIVO') return -1;
      if (a.status !== 'ACTIVO' && b.status === 'ACTIVO') return 1;
      return b.createdAt - a.createdAt;
    });

    const tableWrapper = this.layout.$('#rentals-table-wrapper');
    if (tableWrapper) {
      tableWrapper.innerHTML = '';
      this.table.props.data = filtered;
      tableWrapper.appendChild(this.table.mount());
    }
  }

  openAddRentalModal() {
    // Filter vehicles that are currently available
    const availableVehicles = this.state.vehicles.filter(v => v.status === 'DISPONIBLE' || !v.status);

    if (availableVehicles.length === 0) {
      alert('No hay vehículos disponibles en la flota para realizar un alquiler.');
      return;
    }

    const formHTML = `
      <form id="add-rental-form" class="d-flex flex-column gap-3" style="color: var(--color-text-primary);">
        <div class="form-group">
          <label class="form-label" for="rent-vehicle">Seleccionar Vehículo disponible *</label>
          <select id="rent-vehicle" class="input input-md" style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0 var(--space-3); color: var(--color-text-primary);" required>
            <option value="">-- Seleccionar --</option>
            ${availableVehicles.map(v => `<option value="${v.id}" data-brand="${v.brand}" data-model="${v.model}" data-plate="${v.plate}">${v.brand} ${v.model} (${v.plate})</option>`).join('')}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="rent-client-name">Nombre del Cliente *</label>
          <input type="text" id="rent-client-name" class="input input-md" placeholder="Ej. Carlos Mendoza" required />
        </div>

        <div class="form-group">
          <label class="form-label" for="rent-phone">Teléfono de contacto</label>
          <input type="tel" id="rent-phone" class="input input-md" placeholder="Ej. +52 55 1234 5678" />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
          <div class="form-group">
            <label class="form-label" for="rent-start">Fecha de Entrega *</label>
            <input type="date" id="rent-start" class="input input-md" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="rent-end">Fecha de Devolución *</label>
            <input type="date" id="rent-end" class="input input-md" required />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="rent-price-day">Tarifa Diaria ($ MXN) *</label>
          <input type="number" id="rent-price-day" class="input input-md" placeholder="0.00" min="1" step="0.01" required />
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn btn-secondary btn-sm" id="modal-cancel-btn">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="modal-submit-btn">Registrar Alquiler</button>
    `;

    this.modalInstance = new Modal({
      title: 'Registrar Contrato de Alquiler',
      bodyHTML: formHTML,
      footerHTML: footerHTML,
      size: 'md'
    });

    document.body.appendChild(this.modalInstance.mount());

    // Setup dates
    const startInput = this.modalInstance.$('#rent-start');
    const endInput = this.modalInstance.$('#rent-end');
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    if (startInput) startInput.value = today;
    if (endInput) endInput.value = tomorrow;

    const cancelBtn = this.modalInstance.$('#modal-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.modalInstance.close());
    }

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.submitRental());
    }
  }

  async submitRental() {
    const form = this.modalInstance.$('#add-rental-form');
    if (!form || !form.reportValidity()) return;

    const submitBtn = this.modalInstance.$('#modal-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';
    }

    const vehicleSelect = this.modalInstance.$('#rent-vehicle');
    const selectedOption = vehicleSelect.options[vehicleSelect.selectedIndex];
    
    const vehicleId = vehicleSelect.value;
    const brand = selectedOption.getAttribute('data-brand');
    const model = selectedOption.getAttribute('data-model');
    const plate = selectedOption.getAttribute('data-plate');

    const clientName = this.modalInstance.$('#rent-client-name').value.trim();
    const phone = this.modalInstance.$('#rent-phone').value.trim();
    const rentStart = this.modalInstance.$('#rent-start').value;
    const rentEnd = this.modalInstance.$('#rent-end').value;
    const pricePerDay = Number(this.modalInstance.$('#rent-price-day').value);

    // Calculate days duration
    const sDate = new Date(rentStart);
    const eDate = new Date(rentEnd);
    const diffTime = Math.max(0, eDate - sDate);
    const diffDays = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)));
    const total = diffDays * pricePerDay;

    try {
      // 1. Create rental record
      const rentalPayload = {
        vehicleId,
        brand,
        model,
        plate,
        clientName,
        phone,
        rentStart,
        rentEnd,
        pricePerDay,
        total,
        status: 'ACTIVO',
        createdAt: Date.now()
      };
      await FirestoreService.create('rentals', rentalPayload);

      // 2. Set vehicle status to ALQUILADO
      await FirestoreService.update('vehiculos', vehicleId, { status: 'ALQUILADO' });

      // 3. Register transaction in sales (ventas) for unified metrics
      const salePayload = {
        items: [{
          productId: vehicleId,
          name: `Alquiler ${brand} ${model} (${plate}) - ${diffDays} días`,
          price: pricePerDay,
          qty: diffDays,
          total
        }],
        subtotal: total * 0.85,
        tax: total * 0.15,
        total,
        paymentMethod: 'EFECTIVO',
        sellerName: 'Administración Rent a Car',
        date: Date.now(),
        createdAt: Date.now()
      };
      await FirestoreService.create('ventas', salePayload);

      NotificationService.success('Contrato de alquiler registrado y venta contabilizada.');
      this.modalInstance.close();
    } catch (err) {
      console.error('[RentalsView] Error creating rental:', err);
      alert(`Error al registrar el alquiler: ${err.message}`);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Registrar Alquiler';
      }
    }
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.table.unmount();
    this.layout.unmount();
    super.unmount();
  }
}
