/**
 * @file dashboard.view.js
 * @description Manager Dashboard view. Connected to Firebase Realtime Database
 * for real-time tracking of sales, active orders, table occupancy, weekly trend,
 * and top products, with beautiful visual fallbacks when database nodes are empty.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Chart } from '../../../components/data/chart.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';

export class ManagerDashboardView extends Component {
  constructor(params = {}) {
    super(params);

    const currentUser = GlobalStore.getState().currentUser || {};
    this.companyId = currentUser.companyId || 'company-test';
    this.branchId = currentUser.branchId || 'main';

    // Track active listener IDs for cleanup
    this.listeners = [];

    // Default mock data to show if database is empty (ensures excellent premium aesthetics)
    this.mockStats = {
      salesToday: '$18,450.00',
      salesSub: '↑ +12.5% respecto a ayer',
      activeOrders: '24',
      activeOrdersSub: '18 en preparación, 6 listos',
      occupancy: '78%',
      occupancySub: '14 de 18 mesas ocupadas',
      chartLabels: ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'],
      chartData: [12000, 15000, 14000, 18500, 22000, 29000, 24000],
      topProducts: [
        { name: '🍔 Hamburguesa Especial', count: 48 },
        { name: '🍕 Pizza Pepperoni', count: 36 },
        { name: '🌮 Tacos de Pastor', count: 32 },
        { name: '🍺 Cerveza Nacional', count: 28 }
      ]
    };

    // Instantiate PageLayout passing the dashboard structure with unique IDs
    this.layout = new PageLayout({
      title: 'Dashboard de Gestión',
      subtitle: 'Vista general del rendimiento del restaurante en tiempo real.',
      actionHTML: `
        <span class="badge badge-accent" id="db-mode-badge" style="font-size: 0.75rem; padding: 4px 10px; display: flex; align-items: center; gap: 4px; border: 1px solid var(--color-border);">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: #34d399; display: inline-block; animation: pulse 1.5s infinite;"></span>
          Modo Demo (Mock)
        </span>
        <style>
          @keyframes pulse {
            0% { transform: scale(0.95); opacity: 0.5; }
            50% { transform: scale(1.15); opacity: 1; }
            100% { transform: scale(0.95); opacity: 0.5; }
          }
        </style>
      `,
      contentHTML: `
        <!-- Quick stats responsive grid -->
        <div class="grid-stats">
          <div class="card p-4 hover-lift">
            <div class="d-flex justify-content-between align-items-start">
              <span class="text-sm text-secondary">Ventas de Hoy</span>
              <span style="font-size: 1.25rem;">💰</span>
            </div>
            <h3 class="text-2xl font-bold mt-1 text-primary" id="stat-sales-today">${this.mockStats.salesToday}</h3>
            <span class="text-xs text-success font-semibold" id="stat-sales-change">${this.mockStats.salesSub}</span>
          </div>

          <div class="card p-4 hover-lift">
            <div class="d-flex justify-content-between align-items-start">
              <span class="text-sm text-secondary">Pedidos Activos</span>
              <span style="font-size: 1.25rem;">📝</span>
            </div>
            <h3 class="text-2xl font-bold mt-1 text-primary" id="stat-orders-active">${this.mockStats.activeOrders}</h3>
            <span class="text-xs text-secondary" id="stat-orders-subtext">${this.mockStats.activeOrdersSub}</span>
          </div>

          <div class="card p-4 hover-lift">
            <div class="d-flex justify-content-between align-items-start">
              <span class="text-sm text-secondary">Ocupación de Mesas</span>
              <span style="font-size: 1.25rem;">🍽️</span>
            </div>
            <h3 class="text-2xl font-bold mt-1 text-primary" id="stat-tables-occupancy">${this.mockStats.occupancy}</h3>
            <span class="text-xs text-secondary" id="stat-tables-subtext">${this.mockStats.occupancySub}</span>
          </div>
        </div>

        <!-- Sales Analytics Chart and info grid -->
        <div class="grid-responsive mt-6">
          <div class="col-8 card p-5">
            <div class="d-flex justify-content-between align-items-center mb-4">
              <h3 class="text-lg font-semibold">Tendencia de Ventas (Semanal)</h3>
              <span class="text-xs text-secondary" id="chart-update-time">Actualizado en tiempo real</span>
            </div>
            <!-- Container where we will mount the native Canvas Chart -->
            <div id="dashboard-sales-chart" style="width: 100%; height: 280px;"></div>
          </div>

          <div class="col-4 card p-5 justify-content-between">
            <h3 class="text-lg font-semibold mb-4">Productos más vendidos</h3>
            <div class="d-flex flex-column gap-3" id="stat-top-products">
              ${this.mockStats.topProducts.map(p => `
                <div class="d-flex justify-content-between align-items-center">
                  <span class="text-sm">${p.name}</span>
                  <span class="font-semibold">${p.count} ord.</span>
                </div>
              `).join('')}
            </div>
            <div style="border-top: 1px solid var(--color-border); margin-top: var(--space-4); padding-top: var(--space-4);">
              <p class="text-xs text-secondary">
                Los datos reflejan la actividad comercial registrada directamente en Firebase Realtime Database.
              </p>
            </div>
          </div>
        </div>
      `
    });

    // Create the native Canvas Chart instance
    this.chart = new Chart({
      type: 'line',
      labels: this.mockStats.chartLabels,
      datasets: [
        { label: 'Ventas ($)', data: this.mockStats.chartData, color: '#7c75ff' }
      ]
    });
  }

  mount() {
    const element = this.layout.mount();

    // Injected native canvas chart in the dashboard view
    const chartContainer = element.querySelector('#dashboard-sales-chart');
    if (chartContainer) {
      chartContainer.appendChild(this.chart.mount());
    }

    // Subscribe to Firebase RTDB in real time
    this.subscribeToRealtimeData(element);

    return element;
  }

  /**
   * Listen to Firebase Realtime Database and dynamically update values.
   * Falls back to high-fidelity mock data if no records exist.
   * @param {HTMLElement} element
   */
  subscribeToRealtimeData(element) {
    try {
      // 1. Listen to orders
      const ordersListener = FirestoreService.listenToTenant('orders', (orders) => {
        this.processOrders(orders, element);
      });
      this.listeners.push(ordersListener);

      // 2. Listen to tables
      const tablesListener = FirestoreService.listenToTenant('tables', (tables) => {
        this.processTables(tables, element);
      });
      this.listeners.push(tablesListener);

    } catch (e) {
      console.warn('[Dashboard] Fallo al establecer listeners en tiempo real:', e.message);
    }
  }

  /**
   * Processes order records and updates DOM metrics and Chart data.
   */
  processOrders(orders, element) {
    if (!orders || orders.length === 0) {
      this.updateModeBadge(element, true);
      return;
    }

    // Real database entries found
    this.updateModeBadge(element, false);

    const now = new Date();
    const todayStr = now.toDateString();

    let salesToday = 0;
    let preparingCount = 0;
    let readyCount = 0;

    // Track weekly sales by day (Lun to Dom)
    const dayTotals = [0, 0, 0, 0, 0, 0, 0]; // Index maps to: Mon=0, Tue=1 ... Sun=6

    // Track product frequencies
    const productFrequency = {};

    orders.forEach(order => {
      const orderDate = new Date(order.createdAt || order.updatedAt || Date.now());
      
      // Calculate sales today (Completed status only)
      if (orderDate.toDateString() === todayStr && order.status === 'COMPLETED') {
        salesToday += Number(order.total || 0);
      }

      // Calculate active orders
      if (order.status === 'PREPARING' || order.status === 'PENDING') {
        preparingCount++;
      } else if (order.status === 'READY') {
        readyCount++;
      }

      // Aggregate sales for weekly trend
      if (order.status === 'COMPLETED') {
        let dayIdx = orderDate.getDay() - 1; // getDay() yields Sun=0, Mon=1...
        if (dayIdx < 0) dayIdx = 6; // Set Sun to 6
        dayTotals[dayIdx] += Number(order.total || 0);
      }

      // Process product frequency
      if (Array.isArray(order.items)) {
        order.items.forEach(item => {
          const name = item.name || 'Producto';
          productFrequency[name] = (productFrequency[name] || 0) + Number(item.qty || 1);
        });
      }
    });

    // Update DOM Sales Today
    const salesEl = element.querySelector('#stat-sales-today');
    if (salesEl) {
      salesEl.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(salesToday);
    }
    const salesChangeEl = element.querySelector('#stat-sales-change');
    if (salesChangeEl) {
      salesChangeEl.textContent = 'Sincronizado en tiempo real';
      salesChangeEl.className = 'text-xs text-secondary';
    }

    // Update DOM Active Orders
    const activeEl = element.querySelector('#stat-orders-active');
    if (activeEl) {
      activeEl.textContent = preparingCount + readyCount;
    }
    const activeSubEl = element.querySelector('#stat-orders-subtext');
    if (activeSubEl) {
      activeSubEl.textContent = `${preparingCount} en preparación, ${readyCount} listos`;
    }

    // Update Top Products List
    const topProducts = Object.entries(productFrequency)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    const topProductsEl = element.querySelector('#stat-top-products');
    if (topProductsEl) {
      if (topProducts.length > 0) {
        topProductsEl.innerHTML = topProducts.map(p => `
          <div class="d-flex justify-content-between align-items-center">
            <span class="text-sm">${p.name}</span>
            <span class="font-semibold">${p.count} ord.</span>
          </div>
        `).join('');
      } else {
        topProductsEl.innerHTML = `<p class="text-xs text-secondary text-center">Sin productos vendidos todavía</p>`;
      }
    }

    // Update Chart Trend
    this.chart.updateData(
      ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'],
      [{ label: 'Ventas ($)', data: dayTotals, color: '#7c75ff' }]
    );
  }

  /**
   * Processes tables records and updates occupancy statistics.
   */
  processTables(tables, element) {
    if (!tables || tables.length === 0) {
      return;
    }

    const total = tables.length;
    const occupied = tables.filter(t => t.status === 'OCCUPIED' || t.status === 'BUSY').length;
    const percentage = total > 0 ? Math.round((occupied / total) * 100) : 0;

    const occupancyEl = element.querySelector('#stat-tables-occupancy');
    if (occupancyEl) {
      occupancyEl.textContent = `${percentage}%`;
    }

    const occupancySubEl = element.querySelector('#stat-tables-subtext');
    if (occupancySubEl) {
      occupancySubEl.textContent = `${occupied} de ${total} mesas ocupadas`;
    }
  }

  /**
   * Helper to toggle the mode badge in Header
   */
  updateModeBadge(element, isDemo) {
    const badge = element.querySelector('#db-mode-badge');
    if (badge) {
      if (isDemo) {
        badge.innerHTML = `
          <span style="width: 6px; height: 6px; border-radius: 50%; background: #eab308; display: inline-block; animation: pulse 1.5s infinite;"></span>
          Modo Demo (Mock)
        `;
        badge.style.color = 'var(--color-warning, #eab308)';
      } else {
        badge.innerHTML = `
          <span style="width: 6px; height: 6px; border-radius: 50%; background: #34d399; display: inline-block;"></span>
          En Tiempo Real (RTDB)
        `;
        badge.style.color = 'var(--color-success, #34d399)';
      }
    }
  }

  unmount() {
    // Unsubscribe all dashboard listeners
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];

    this.chart.unmount();
    this.layout.unmount();
    super.unmount();
  }
}