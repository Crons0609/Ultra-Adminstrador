/**
 * @file dashboard.view.js
 * @description Production-ready Manager/Owner Dashboard.
 * Displays live KPIs: sales, orders, tables, top products, weekly trend.
 * Falls back to rich demo data when Firebase nodes are empty.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Chart } from '../../../components/data/chart.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { TimeService } from '../../../services/time.service.js';
import { getBusinessCategory } from '../../../config/business-types.config.js';

export class ManagerDashboardView extends Component {
  constructor(params = {}) {
    super(params);

    const state = GlobalStore.getState();
    const currentUser = state.currentUser || {};
    this.companyId = currentUser.companyId || '';
    this.branchId = currentUser.branchId || 'main';
    this.currentUser = currentUser;
    this.currentCompany = state.currentCompany || {};
    this.businessCategory = getBusinessCategory(this.currentCompany.businessType || '');

    this.listeners = [];
    this.isDemo = true;

    // Rich demo data — customized per category
    this.demo = this._buildDemoData(this.businessCategory);

    const companyDisplayName = this.currentCompany?.name
      || currentUser?.companyId
      || 'Mi Negocio';

    // Subscription notice
    let subscriptionNotice = '';
    if (this.currentCompany?.subscriptionExpiresAt) {
      const expDate = new Date(this.currentCompany.subscriptionExpiresAt);
      const today = new Date();
      today.setHours(0,0,0,0);
      const diffTime = expDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      const formattedDate = this.currentCompany.subscriptionExpiresAt.split('-').reverse().join('/');
      if (diffDays <= 7 && diffDays >= 0) {
        subscriptionNotice = ` <span style="background-color: var(--color-warning-light); color: var(--color-warning); font-size: 0.75rem; margin-left: var(--space-2); border-radius: var(--radius-sm); padding: 2px 8px; font-weight: 600;">⚠️ Vence en ${diffDays} días (${formattedDate})</span>`;
      } else if (diffDays > 7) {
        subscriptionNotice = ` <span style="background-color: var(--color-success-light); color: var(--color-success); font-size: 0.75rem; margin-left: var(--space-2); border-radius: var(--radius-sm); padding: 2px 8px; font-weight: 600;">✅ Suscripción activa hasta ${formattedDate}</span>`;
      }
    }

    const salesFormatted = this._currency(this.demo.salesToday);
    const changePercent = (((this.demo.salesToday - this.demo.salesYesterday) / this.demo.salesYesterday) * 100).toFixed(1);

    this.layout = new PageLayout({
      title: `Bienvenido, ${currentUser.displayName?.split(' ')[0] || 'Usuario'}`,
      subtitle: `Resumen del rendimiento de ${companyDisplayName} en tiempo real.${subscriptionNotice}`,
      actionHTML: `
        <span class="header-status-chip" id="db-mode-chip">
          <span class="status-dot status-dot-warning" id="db-status-dot"></span>
          <span id="db-status-text">Datos de Demostración</span>
        </span>
      `,
      contentHTML: `
        <!-- KPI Cards -->
        <div class="grid-stats animate-fade-in">
          ${this._buildKpiBlock()}
        </div>

        <!-- Chart + Top Items -->
        <div class="grid-responsive">
          <div class="col-8">
            <div class="card p-5">
              <div class="d-flex justify-content-between align-items-center mb-5">
                <div>
                  <h3 class="text-lg font-semibold">${this._getCategoryMeta().chartTitle}</h3>
                  <p class="text-xs text-secondary mt-1">Ingresos diarios de la semana en curso</p>
                </div>
                <span class="text-xs text-secondary" id="chart-last-update">—</span>
              </div>
              <div id="dashboard-sales-chart" style="width:100%;height:260px;"></div>
            </div>
          </div>

          <div class="col-4">
            <div class="card p-5" style="height: 100%;">
              <h3 class="text-lg font-semibold mb-4">${this._getCategoryMeta().topLabel}</h3>
              <div class="d-flex flex-column gap-3" id="stat-top-products">
                ${this.demo.topProducts.map((p, i) => this._productRow(p.name, p.count, i)).join('')}
              </div>
              <div class="mt-5" style="border-top: 1px solid var(--color-border); padding-top: var(--space-4);">
                <p class="text-xs text-secondary">
                  Datos actualizados en tiempo real desde Firebase.
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Activity Feed -->
        <div class="card p-5 mt-6">
          <div class="d-flex justify-content-between align-items-center mb-4">
            <h3 class="text-lg font-semibold">Actividad Reciente</h3>
            <span class="text-xs text-secondary">Últimas 5 operaciones</span>
          </div>
          <div id="activity-feed" class="d-flex flex-column gap-2">
            <div class="activity-item">
              <div class="activity-dot activity-dot-success"></div>
              <div class="activity-content">
                <span class="activity-text">Sistema iniciado en modo demostración</span>
                <span class="activity-time">Ahora</span>
              </div>
            </div>
            <div class="activity-item">
              <div class="activity-dot activity-dot-accent"></div>
              <div class="activity-content">
                <span class="activity-text">Conectado a Firebase Realtime Database</span>
                <span class="activity-time">Hace un momento</span>
              </div>
            </div>
          </div>
        </div>
      `
    });

    this.chart = new Chart({
      type: 'line',
      labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
      datasets: [{ label: 'Ventas ($)', data: this.demo.weeklyData, color: '#7c75ff' }]
    });
  }

  _currency(v) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v);
  }

  /**
   * Returns category-specific metadata: chart title, top-list label, and KPI labels.
   */
  _getCategoryMeta() {
    const meta = {
      BAR_DISCOTECA:           { chartTitle: 'Ingresos por Taquilla y Consumo', topLabel: 'Top Bebidas',           kpi1: 'Ventas de Hoy',        kpi2: 'Cola en Barra (BDS)',     kpi3: 'Aforo en Vivo',         kpi3icon: '🕺', k3unit: ' pers' },
      GASTRONOMIA:             { chartTitle: 'Flujo de Ventas Semanal',         topLabel: 'Top Platos',            kpi1: 'Ventas de Hoy',        kpi2: 'Pedidos Activos',         kpi3: 'Ocupación Mesas',       kpi3icon: '😫', k3unit: '%'     },
      SUPERMERCADO_TIENDA:     { chartTitle: 'Ventas Semanales de Tienda',      topLabel: 'Productos Más Vendidos', kpi1: 'Ventas del Día',       kpi2: 'Productos Vendidos',      kpi3: 'Artículos Agotados',    kpi3icon: '⚠️', k3unit: ' items' },
      BARBERIA:                { chartTitle: 'Ingresos Semanales',              topLabel: 'Servicios más pedidos', kpi1: 'Ingresos de Hoy',      kpi2: 'Citas de Hoy',            kpi3: 'Clientes Atendidos',    kpi3icon: '✂️',  k3unit: ''      },
      VENTAS:                  { chartTitle: 'Ventas Semanales',                topLabel: 'Productos Más Vendidos', kpi1: 'Ventas de Hoy',       kpi2: 'Productos Vendidos',      kpi3: 'Stock Crítico',         kpi3icon: '📦', k3unit: ' items' },
      RENT_A_CAR:              { chartTitle: 'Ingresos por Alquileres',         topLabel: 'Vehículos más alquilados', kpi1: 'Ingresos Hoy',     kpi2: 'Alquileres Activos',     kpi3: 'Vehículos Libres',      kpi3icon: '🚗', k3unit: ' veh.' },
      SERVICIOS_PERSONALIZADOS:{ chartTitle: 'Ingresos por Servicios',         topLabel: 'Servicios Más Solicitados', kpi1: 'Ingresos Hoy',    kpi2: 'Solicitudes Activas',   kpi3: 'Completados Hoy',        kpi3icon: '✅', k3unit: ''      },
    };
    return meta[this.businessCategory] || meta.GASTRONOMIA;
  }

  /**
   * Builds demo data tailored to the business category.
   */
  _buildDemoData(category) {
    const demos = {
      BAR_DISCOTECA: {
        salesToday: 24500, salesYesterday: 21000, activeOrders: 35,
        preparingOrders: 25, readyOrders: 10, occupancy: 82,
        totalTables: 300, occupiedTables: 246,
        weeklyData: [15000, 18000, 16000, 22000, 28000, 39000, 31000],
        topProducts: [
          { name: 'Gin Tonic Premium', count: 95 }, { name: 'Mojito Cubano', count: 84 },
          { name: 'Cerveza Artesanal', count: 76 }, { name: 'Shot de Tequila', count: 68 },
          { name: 'Papas Lounge', count: 42 },
        ]
      },
      GASTRONOMIA: {
        salesToday: 18450, salesYesterday: 16400, activeOrders: 24,
        preparingOrders: 18, readyOrders: 6, occupancy: 78,
        totalTables: 18, occupiedTables: 14,
        weeklyData: [12000, 15000, 14000, 18500, 22000, 29000, 24000],
        topProducts: [
          { name: 'Hamburguesa Especial', count: 48 }, { name: 'Pizza Pepperoni', count: 36 },
          { name: 'Tacos de Pastor', count: 32 }, { name: 'Cerveza Nacional', count: 28 },
          { name: 'Limonada Natural', count: 21 },
        ]
      },
      BARBERIA: {
        salesToday: 4200, salesYesterday: 3800, activeOrders: 8,
        preparingOrders: 3, readyOrders: 5, occupancy: 67,
        totalTables: 6, occupiedTables: 4,
        weeklyData: [2800, 3500, 3200, 4100, 4800, 6200, 4200],
        topProducts: [
          { name: 'Corte + Barba', count: 32 }, { name: 'Corte Clásico', count: 28 },
          { name: 'Degradado', count: 21 }, { name: 'Barba completa', count: 18 },
          { name: 'Cejas', count: 12 },
        ]
      },
      SUPERMERCADO_TIENDA: {
        salesToday: 9800, salesYesterday: 8700, activeOrders: 42,
        preparingOrders: 0, readyOrders: 0, occupancy: 0,
        totalTables: 0, occupiedTables: 8, // occupiedTables = agotados
        weeklyData: [5800, 7200, 6500, 8900, 9200, 11500, 9800],
        topProducts: [
          { name: 'Refresco 600ml', count: 210 }, { name: 'Leche 1L', count: 188 },
          { name: 'Pan Molde 680g', count: 154 }, { name: 'Arroz 1kg', count: 132 },
          { name: 'Papel Higiénico x4', count: 98 },
        ]
      },
      VENTAS: {
        salesToday: 12800, salesYesterday: 11500, activeOrders: 15,
        preparingOrders: 10, readyOrders: 5, occupancy: 45,
        totalTables: 200, occupiedTables: 90,
        weeklyData: [8500, 11000, 9500, 13000, 14500, 18000, 12800],
        topProducts: [
          { name: 'Refresco 2L', count: 120 }, { name: 'Leche Entera', count: 98 },
          { name: 'Pan de Caja', count: 87 }, { name: 'Papel Higiénico', count: 76 },
          { name: 'Aceite Vegetal', count: 64 },
        ]
      },
      RENT_A_CAR: {
        salesToday: 9500, salesYesterday: 8200, activeOrders: 5,
        preparingOrders: 2, readyOrders: 3, occupancy: 62,
        totalTables: 12, occupiedTables: 8,
        weeklyData: [6000, 7500, 7000, 8800, 10000, 12500, 9500],
        topProducts: [
          { name: 'Sedan Compacto', count: 18 }, { name: 'SUV Familiar', count: 14 },
          { name: 'Pickup', count: 10 }, { name: 'Van de Pasajeros', count: 7 },
          { name: 'Moto', count: 5 },
        ]
      },
      SERVICIOS_PERSONALIZADOS: {
        salesToday: 7800, salesYesterday: 6500, activeOrders: 6,
        preparingOrders: 4, readyOrders: 2, occupancy: 55,
        totalTables: 0, occupiedTables: 0,
        weeklyData: [4500, 6000, 5500, 7200, 8000, 10000, 7800],
        topProducts: [
          { name: 'Instalación cámara', count: 12 }, { name: 'Mantenimiento red', count: 9 },
          { name: 'Configuración NVR', count: 8 }, { name: 'Cableado estructurado', count: 6 },
          { name: 'Soporte remoto', count: 5 },
        ]
      },
    };
    return demos[category] || demos.GASTRONOMIA;
  }

  /**
   * Builds the 3 KPI cards using category-specific labels.
   */
  _buildKpiBlock() {
    const m = this._getCategoryMeta();
    const salesFormatted = this._currency(this.demo.salesToday);
    const changePercent = (((this.demo.salesToday - this.demo.salesYesterday) / this.demo.salesYesterday) * 100).toFixed(1);

    const kpi3Val = this.businessCategory === 'GASTRONOMIA'
      ? `${this.demo.occupancy}%`
      : `${this.demo.occupiedTables}${m.k3unit}`;
    const showBar = this.businessCategory === 'GASTRONOMIA';

    return `
      <div class="kpi-card hover-lift">
        <div class="kpi-card-header">
          <span class="kpi-label">${m.kpi1}</span>
          <div class="kpi-icon kpi-icon-success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <line x1="12" y1="1" x2="12" y2="23"/>
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
        </div>
        <h3 class="kpi-value" id="stat-sales-today">${salesFormatted}</h3>
        <span class="kpi-change kpi-change-up" id="stat-sales-change">↑ +${changePercent}% vs. ayer</span>
      </div>

      <div class="kpi-card hover-lift">
        <div class="kpi-card-header">
          <span class="kpi-label">${m.kpi2}</span>
          <div class="kpi-icon kpi-icon-accent">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </div>
        </div>
        <h3 class="kpi-value" id="stat-orders-active">${this.demo.activeOrders}</h3>
        <span class="kpi-change" id="stat-orders-sub" style="color: var(--color-text-secondary);">${this.demo.preparingOrders} en proceso · ${this.demo.readyOrders} listos</span>
      </div>

      <div class="kpi-card hover-lift">
        <div class="kpi-card-header">
          <span class="kpi-label">${m.kpi3}</span>
          <div class="kpi-icon kpi-icon-warning">
            <span style="font-size:1.2rem;">${m.kpi3icon}</span>
          </div>
        </div>
        <h3 class="kpi-value" id="stat-tables-occ">${kpi3Val}</h3>
        ${showBar ? `
          <div class="kpi-progress-bar">
            <div class="kpi-progress-fill" id="stat-occ-bar" style="width: ${this.demo.occupancy}%;"></div>
          </div>
          <span class="kpi-change" id="stat-tables-sub" style="color: var(--color-text-secondary);">${this.demo.occupiedTables} de ${this.demo.totalTables} mesas</span>
        ` : `<span class="kpi-change" id="stat-tables-sub" style="color: var(--color-text-secondary);">Datos en vivo desde Firebase</span>`}
      </div>
    `;
  }

  _productRow(name, count, index) {
    const colors = ['#7c75ff', '#34d399', '#fbbf24', '#f87171', '#60a5fa'];
    const color = colors[index % colors.length];
    const maxCount = this.demo.topProducts[0].count;
    const pct = Math.round((count / maxCount) * 100);
    return `
      <div class="product-row">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="text-sm font-medium">${name}</span>
          <span class="text-sm font-bold" style="color: ${color};">${count}</span>
        </div>
        <div class="product-bar-track">
          <div class="product-bar-fill" style="width:${pct}%; background-color: ${color};"></div>
        </div>
      </div>
    `;
  }

  mount() {
    const element = this.layout.mount();

    const chartContainer = element.querySelector('#dashboard-sales-chart');
    if (chartContainer) {
      chartContainer.appendChild(this.chart.mount());
    }

    this.subscribeToRealtimeData(element);
    return element;
  }

  subscribeToRealtimeData(element) {
    try {
      const ordersListener = FirestoreService.listenToTenant('orders', (orders) => {
        this.processOrders(orders, element);
      });
      this.listeners.push(ordersListener);

      const tablesListener = FirestoreService.listenToTenant('tables', (tables) => {
        this.processTables(tables, element);
      });
      this.listeners.push(tablesListener);
    } catch (e) {
      console.warn('[Dashboard] RTDB error:', e.message);
    }
  }

  processOrders(orders, element) {
    if (!orders || orders.length === 0) {
      this._setBadge(element, false);
      return;
    }
    this.isDemo = false;
    this._setBadge(element, true);

    const todayStr = TimeService.todayKey();
    let salesToday = 0;
    let preparingCount = 0;
    let readyCount = 0;
    const dayTotals = [0, 0, 0, 0, 0, 0, 0];
    const productFreq = {};

    orders.forEach(order => {
      const d = new Date(order.createdAt || order.updatedAt || Date.now());
      if (TimeService.todayKey(d) === todayStr && order.status === 'COMPLETED') salesToday += Number(order.total || 0);
      if (order.status === 'PREPARING' || order.status === 'PENDING') preparingCount++;
      else if (order.status === 'READY') readyCount++;
      if (order.status === 'COMPLETED') {
        let idx = d.getDay() - 1;
        if (idx < 0) idx = 6;
        dayTotals[idx] += Number(order.total || 0);
      }
      if (Array.isArray(order.items)) {
        order.items.forEach(item => {
          const name = item.name || 'Producto';
          productFreq[name] = (productFreq[name] || 0) + Number(item.qty || 1);
        });
      }
    });

    const q = s => element.querySelector(s);
    if (q('#stat-sales-today')) q('#stat-sales-today').textContent = this._currency(salesToday);
    if (q('#stat-sales-change')) {
      q('#stat-sales-change').textContent = 'Datos en tiempo real';
      q('#stat-sales-change').className = 'kpi-change';
      q('#stat-sales-change').style.color = 'var(--color-text-secondary)';
    }
    if (q('#stat-orders-active')) q('#stat-orders-active').textContent = preparingCount + readyCount;
    if (q('#stat-orders-sub')) q('#stat-orders-sub').textContent = `${preparingCount} preparando · ${readyCount} listos`;

    const topProducts = Object.entries(productFreq)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const topEl = q('#stat-top-products');
    if (topEl && topProducts.length > 0) {
      this.demo.topProducts = topProducts;
      topEl.innerHTML = topProducts.map((p, i) => this._productRow(p.name, p.count, i)).join('');
    }

    this.chart.updateData(
      ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
      [{ label: 'Ventas ($)', data: dayTotals, color: '#7c75ff' }]
    );

    const updateEl = q('#chart-last-update');
    if (updateEl) updateEl.textContent = `Actualizado: ${TimeService.formatTime(new Date(), false)} NI`;
  }

  processTables(tables, element) {
    if (!tables || tables.length === 0) return;
    const total = tables.length;
    const occupied = tables.filter(t => t.status === 'OCCUPIED' || t.status === 'BUSY').length;
    const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;
    const q = s => element.querySelector(s);
    if (q('#stat-tables-occ')) q('#stat-tables-occ').textContent = `${pct}%`;
    if (q('#stat-occ-bar')) q('#stat-occ-bar').style.width = `${pct}%`;
    if (q('#stat-tables-sub')) q('#stat-tables-sub').textContent = `${occupied} de ${total} mesas`;
  }

  _setBadge(element, isLive) {
    const chip = element.querySelector('#db-mode-chip');
    const dot = element.querySelector('#db-status-dot');
    const text = element.querySelector('#db-status-text');
    if (!chip) return;
    if (isLive) {
      if (dot) { dot.classList.remove('status-dot-warning'); dot.classList.add('status-dot-success'); }
      if (text) text.textContent = 'En Tiempo Real';
    } else {
      if (dot) { dot.classList.remove('status-dot-success'); dot.classList.add('status-dot-warning'); }
      if (text) text.textContent = 'Datos de Demostración';
    }
  }

  unmount() {
    this.listeners.forEach(id => FirestoreService.unsubscribe(id));
    this.listeners = [];
    this.chart.unmount();
    this.layout.unmount();
    super.unmount();
  }
}
