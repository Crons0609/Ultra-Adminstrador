/**
 * @file dashboard.view.js
 * @description Production-ready, fully database-backed Multi-Tenant Dashboard.
 * Dynamically adapts to the business type category, syncing with Realtime Database collections.
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
    this.state = {
      ventas: [],
      orders: [],
      tables: [],
      citas: [],
      products: [],
      vehicles: [],
      rentals: [],
      requests: []
    };

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

    // Chart configuration
    this.chart = new Chart({
      type: 'line',
      labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
      datasets: [{ label: 'Ventas ($)', data: [0, 0, 0, 0, 0, 0, 0], color: '#7c75ff' }]
    });

    const meta = this._getCategoryMeta();

    this.layout = new PageLayout({
      title: `Bienvenido, ${currentUser.displayName?.split(' ')[0] || 'Usuario'}`,
      subtitle: `Resumen del rendimiento de ${companyDisplayName} en tiempo real.${subscriptionNotice}`,
      actionHTML: `
        <span class="header-status-chip" id="db-mode-chip">
          <span class="status-dot status-dot-success" id="db-status-dot"></span>
          <span id="db-status-text">Tiempo Real</span>
        </span>
      `,
      contentHTML: `
        <!-- KPI Cards -->
        <div class="grid-stats animate-fade-in" id="dashboard-kpi-row">
          ${this._buildKpiBlockLoading()}
        </div>

        <!-- Category Specific Details Container (mesa, mesero, devoluciones, etc.) -->
        <div id="category-specific-section" class="animate-fade-in mb-6"></div>

        <!-- Chart + Top Items -->
        <div class="grid-responsive">
          <div class="col-8">
            <div class="card p-5">
              <div class="d-flex justify-content-between align-items-center mb-5">
                <div>
                  <h3 class="text-lg font-semibold" id="chart-main-title">${meta.chartTitle}</h3>
                  <p class="text-xs text-secondary mt-1" id="chart-sub-title">Tendencia de actividad de la semana en curso</p>
                </div>
                <span class="text-xs text-secondary" id="chart-last-update">—</span>
              </div>
              <div id="dashboard-sales-chart" style="width:100%;height:260px;"></div>
            </div>
          </div>

          <div class="col-4">
            <div class="card p-5" style="height: 100%;">
              <h3 class="text-lg font-semibold mb-4" id="top-list-title">${meta.topLabel}</h3>
              <div class="d-flex flex-column gap-3" id="stat-top-products">
                <p class="text-xs text-secondary py-6 text-center">Cargando clasificación...</p>
              </div>
              <div class="mt-5" style="border-top: 1px solid var(--color-border); padding-top: var(--space-4);">
                <p class="text-xs text-secondary">
                  Datos en vivo sincronizados con la base de datos de producción.
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Activity Feed -->
        <div class="card p-5 mt-6">
          <div class="d-flex justify-content-between align-items-center mb-4">
            <h3 class="text-lg font-semibold">Operaciones Recientes</h3>
            <span class="text-xs text-secondary">Últimos movimientos del negocio</span>
          </div>
          <div id="activity-feed" class="d-flex flex-column gap-2">
            <p class="text-xs text-secondary py-4 text-center">Escuchando base de datos...</p>
          </div>
        </div>
      `
    });
  }

  _currency(v) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v);
  }

  _getCategoryMeta() {
    const meta = {
      BAR_DISCOTECA:           { chartTitle: 'Ingresos por Taquilla y Consumo', topLabel: 'Top Bebidas',           kpi1: 'Ventas de Hoy',        kpi2: 'Pedidos Activos',         kpi3: 'Aforo en Vivo',         kpi3icon: '🕺', k3unit: ' pers' },
      GASTRONOMIA:             { chartTitle: 'Flujo de Ventas Semanal',         topLabel: 'Top Platos',            kpi1: 'Ventas de Hoy',        kpi2: 'Pedidos Activos',         kpi3: 'Ocupación Mesas',       kpi3icon: '🍽️', k3unit: '%'     },
      SUPERMERCADO_TIENDA:     { chartTitle: 'Ventas Semanales de Tienda',      topLabel: 'Productos Más Vendidos', kpi1: 'Ventas del Día',       kpi2: 'Artículos en Inventario', kpi3: 'Stock Crítico/Agotado', kpi3icon: '⚠️', k3unit: ' items' },
      BARBERIA:                { chartTitle: 'Rendimiento de Citas',            topLabel: 'Servicios Más Pedidos',  kpi1: 'Ingresos por Citas',   kpi2: 'Citas Hoy',               kpi3: 'Clientes Atendidos',    kpi3icon: '✂️',  k3unit: ''      },
      VENTAS:                  { chartTitle: 'Ventas Semanales',                topLabel: 'Productos Más Vendidos', kpi1: 'Ventas de Hoy',       kpi2: 'Artículos en Inventario', kpi3: 'Stock Crítico/Agotado', kpi3icon: '📦', k3unit: ' items' },
      RENT_A_CAR:              { chartTitle: 'Ventas por Alquileres',           topLabel: 'Vehículos Más Rentados', kpi1: 'Ingresos Alquiler',    kpi2: 'Alquileres Activos',      kpi3: 'Devoluciones Pendientes', kpi3icon: '🔑', k3unit: ' vh'   },
      SERVICIOS_PERSONALIZADOS:{ chartTitle: 'Ingresos Estimados',              topLabel: 'Servicios Solicitados',  kpi1: 'Ingreso Estimado',     kpi2: 'Solicitudes Nuevas',      kpi3: 'Trabajos en Proceso',   kpi3icon: '⚙️', k3unit: ' act.' }
    };
    return meta[this.businessCategory] || meta.GASTRONOMIA;
  }

  _buildKpiBlockLoading() {
    return `
      <div class="kpi-card text-center py-6">Cargando KPI 1...</div>
      <div class="kpi-card text-center py-6">Cargando KPI 2...</div>
      <div class="kpi-card text-center py-6">Cargando KPI 3...</div>
    `;
  }

  _buildKpiCard(label, value, subtext, iconHTML, borderStyle = '') {
    return `
      <div class="kpi-card hover-lift" style="${borderStyle}">
        <div class="kpi-card-header">
          <span class="kpi-label">${label}</span>
          <div class="kpi-icon">
            ${iconHTML}
          </div>
        </div>
        <h3 class="kpi-value">${value}</h3>
        <span class="kpi-change" style="color: var(--color-text-secondary);">${subtext}</span>
      </div>
    `;
  }

  _productRow(name, count, index, maxCount = 1) {
    const colors = ['#7c75ff', '#34d399', '#fbbf24', '#f87171', '#60a5fa'];
    const color = colors[index % colors.length];
    const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
    return `
      <div class="product-row" style="margin-bottom: var(--space-3);">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="text-sm font-medium">${name}</span>
          <span class="text-sm font-bold" style="color: ${color};">${count}</span>
        </div>
        <div class="product-bar-track" style="height: 6px; background: var(--color-bg-tertiary); border-radius: 3px; overflow: hidden;">
          <div class="product-bar-fill" style="width:${pct}%; background-color: ${color}; height: 100%; border-radius: 3px; transition: width 0.3s ease;"></div>
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
    this.subscribeArqueoNotifications(element);
    return element;
  }

  subscribeArqueoNotifications(element) {
    try {
      const listener = FirestoreService.listenToTenant('arqueos_caja', (arqueos) => {
        const pending = (arqueos || []).filter(a => a.estado === 'PENDIENTE_REVISION');
        this.renderArqueoBanner(element, pending);
      });
      this.listeners.push(listener);
    } catch(e) {
      console.warn('[Dashboard] Could not subscribe to arqueos_caja:', e.message);
    }
  }

  renderArqueoBanner(element, pendingArqueos) {
    // Remove existing banner if any
    const existing = element.querySelector('#arqueo-alert-banner');
    if (existing) existing.remove();
    if (!pendingArqueos || pendingArqueos.length === 0) return;

    const latest = pendingArqueos[pendingArqueos.length - 1];
    const diff   = Number(latest.diferencia || 0);
    const fmt    = v => `$${Math.abs(v).toFixed(2)}`;
    const diffLabel = Math.abs(diff) < 0.01
      ? '✅ Sin diferencia (cuadre perfecto)'
      : diff < 0
        ? `🔴 Faltante: ${fmt(diff)}`
        : `🟡 Sobrante: ${fmt(diff)}`;

    const diffColor = Math.abs(diff) < 0.01 ? '#34d399' : diff < 0 ? '#f87171' : '#fbbf24';
    const fechaStr  = new Date(latest.fecha || Date.now()).toLocaleDateString('es-MX', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

    const banner = document.createElement('div');
    banner.id = 'arqueo-alert-banner';
    banner.style.cssText = `
      background: linear-gradient(135deg, rgba(52,211,153,0.08), rgba(124,117,255,0.06));
      border: 1px solid #34d39944;
      border-radius: var(--radius-lg);
      padding: var(--space-4) var(--space-5);
      margin-bottom: var(--space-5);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      flex-wrap: wrap;
    `;
    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:var(--space-3);">
        <div style="font-size:2rem;">📊</div>
        <div>
          <div style="font-weight:700;font-size:0.95rem;color:var(--color-text-primary);">Arqueo de Caja Pendiente de Revisión</div>
          <div style="font-size:0.82rem;color:var(--color-text-secondary);margin-top:2px;">
            Cajero: <strong>${latest.cajero || 'N/A'}</strong> · ${fechaStr} · 
            <span style="color:${diffColor};font-weight:700;">${diffLabel}</span>
          </div>
          <div style="font-size:0.78rem;color:var(--color-text-tertiary);margin-top:2px;">
            Efectivo sistema: $${Number(latest.efectivoSistema||0).toFixed(2)} · 
            Tarjeta: $${Number(latest.tarjetaSistema||0).toFixed(2)} · 
            Total: $${Number(latest.totalSistema||0).toFixed(2)} · 
            Retiros: $${Number(latest.totalRetiros||0).toFixed(2)}
          </div>
          ${latest.observaciones ? `<div style="font-size:0.78rem;color:var(--color-text-secondary);margin-top:4px;font-style:italic;">"${latest.observaciones}"</div>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:var(--space-2);flex-shrink:0;">
        <button id="btn-arqueo-reject" class="btn btn-sm" style="background:rgba(248,113,113,0.1);color:#f87171;border:1px solid rgba(248,113,113,0.3);font-size:0.78rem;">
          ✕ Rechazar
        </button>
        <button id="btn-arqueo-approve" class="btn btn-sm" style="background:#34d39922;color:#34d399;border:1px solid #34d39944;font-weight:700;font-size:0.78rem;">
          ✅ Aprobar Arqueo
        </button>
      </div>
    `;

    // Insert at top of page content
    const content = element.querySelector('.page-layout-content') || element.querySelector('.card') || element.firstElementChild;
    if (content && content.parentNode) {
      content.parentNode.insertBefore(banner, content);
    } else {
      element.prepend(banner);
    }

    banner.querySelector('#btn-arqueo-approve')?.addEventListener('click', async () => {
      await FirestoreService.update('arqueos_caja', latest.id, { estado: 'APROBADO', aprobadoEn: Date.now() });
      FirestoreService.create('notificaciones', { tipo: 'ARQUEO_APROBADO', mensaje: `El arqueo del ${fechaStr} fue aprobado.`, leida: false });
      banner.remove();
    });

    banner.querySelector('#btn-arqueo-reject')?.addEventListener('click', async () => {
      const nota = prompt('Motivo del rechazo (opcional):') || '';
      await FirestoreService.update('arqueos_caja', latest.id, { estado: 'RECHAZADO', nota, rechazadoEn: Date.now() });
      FirestoreService.create('notificaciones', { tipo: 'ARQUEO_RECHAZADO', mensaje: `El arqueo del ${fechaStr} fue rechazado. Nota: ${nota}`, leida: false });
      banner.remove();
    });
  }


  subscribeToRealtimeData(element) {
    try {
      const cat = this.businessCategory;
      
      if (cat === 'BAR_DISCOTECA' || cat === 'GASTRONOMIA') {
        const vl = FirestoreService.listenToTenant('ventas', (sales) => {
          this.state.ventas = sales || [];
          this.updateGastronomiaStats(element);
        });
        this.listeners.push(vl);

        const ol = FirestoreService.listenToTenant('orders', (orders) => {
          this.state.orders = orders || [];
          this.updateGastronomiaStats(element);
        });
        this.listeners.push(ol);

        const tl = FirestoreService.listenToTenant('tables', (tables) => {
          this.state.tables = tables || [];
          this.updateGastronomiaStats(element);
        });
        this.listeners.push(tl);
      } 
      else if (cat === 'BARBERIA') {
        const cl = FirestoreService.listenToTenant('citas', (citas) => {
          this.state.citas = citas || [];
          this.updateBarberiaStats(element);
        });
        this.listeners.push(cl);

        const pl = FirestoreService.listenToTenant('productos', (products) => {
          this.state.products = products || [];
          this.updateBarberiaStats(element);
        });
        this.listeners.push(pl);
      } 
      else if (cat === 'SUPERMERCADO_TIENDA' || cat === 'VENTAS') {
        const vl = FirestoreService.listenToTenant('ventas', (sales) => {
          this.state.ventas = sales || [];
          this.updateComercioStats(element);
        });
        this.listeners.push(vl);

        const pl = FirestoreService.listenToTenant('productos', (products) => {
          this.state.products = products || [];
          this.updateComercioStats(element);
        });
        this.listeners.push(pl);
      } 
      else if (cat === 'RENT_A_CAR') {
        const vhl = FirestoreService.listenToTenant('vehiculos', (vehicles) => {
          this.state.vehicles = vehicles || [];
          this.updateRentACarStats(element);
        });
        this.listeners.push(vhl);

        const rl = FirestoreService.listenToTenant('rentals', (rentals) => {
          this.state.rentals = rentals || [];
          this.updateRentACarStats(element);
        });
        this.listeners.push(rl);
      } 
      else if (cat === 'SERVICIOS_PERSONALIZADOS') {
        const srl = FirestoreService.listenToTenant('service_requests', (requests) => {
          this.state.requests = requests || [];
          this.updateServiciosStats(element);
        });
        this.listeners.push(srl);
      } 
      else {
        // Fallback generic commerce
        const vl = FirestoreService.listenToTenant('ventas', (sales) => {
          this.state.ventas = sales || [];
          this.updateComercioStats(element);
        });
        this.listeners.push(vl);
      }
    } catch (e) {
      console.warn('[Dashboard] Subscription error:', e.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY UPDATERS
  // ═══════════════════════════════════════════════════════════════════════════

  updateGastronomiaStats(element) {
    const q = s => element.querySelector(s);
    const ventas = this.state.ventas;
    const orders = this.state.orders;
    const tables = this.state.tables;
    const meta = this._getCategoryMeta();

    const todayStr = new Date().toISOString().slice(0, 10);
    const todaySales = ventas.filter(v => new Date(v.date || v.createdAt).toISOString().slice(0, 10) === todayStr);
    const salesTotal = todaySales.reduce((s, v) => s + Number(v.total || 0), 0);

    const activeCount = orders.filter(o => o.status === 'PREPARING' || o.status === 'PENDING' || o.status === 'EN_COCINA' || o.status === 'ESPERANDO_PAGO').length;
    const activePrep = orders.filter(o => o.status === 'PREPARING' || o.status === 'EN_COCINA').length;
    const activeReady = orders.filter(o => o.status === 'READY').length;

    const totalTables = tables.length;
    const occupiedTables = tables.filter(t => t.status === 'OCCUPIED' || t.status === 'BUSY' || t.status === 'BILL').length;
    const occupancy = totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0;

    // Build KPIs HTML
    const kpiRow = q('#dashboard-kpi-row');
    if (kpiRow) {
      const card1 = this._buildKpiCard(meta.kpi1, this._currency(salesTotal), `${todaySales.length} transacciones hoy`, `💰`, 'border-top: 3px solid var(--color-success);');
      const card2 = this._buildKpiCard(meta.kpi2, activeCount, `${activePrep} en preparación · ${activeReady} listos`, `🍽️`, 'border-top: 3px solid var(--color-accent);');
      const card3 = this._buildKpiCard(meta.kpi3, `${occupancy}%`, `${occupiedTables} de ${totalTables} mesas ocupadas`, `🪑`, 'border-top: 3px solid var(--color-warning);');
      kpiRow.innerHTML = card1 + card2 + card3;
    }

    // Build specific sections: breakdown by mesa, mesero and paymentMethod (caja)
    const specSec = q('#category-specific-section');
    if (specSec) {
      // Ingresos por Mesa
      const tableMap = {};
      // Ingresos por Mesero
      const waiterMap = {};
      // Ingresos por Caja (Metodos de Pago)
      const payMap = { 'EFECTIVO': 0, 'TARJETA': 0, 'TRANSFERENCIA': 0, 'OTROS': 0 };

      ventas.forEach(v => {
        const tName = v.tableName || 'Venta Directa';
        tableMap[tName] = (tableMap[tName] || 0) + Number(v.total || 0);

        const sName = v.sellerName || 'Caja Central';
        waiterMap[sName] = (waiterMap[sName] || 0) + Number(v.total || 0);

        const pm = (v.paymentMethod || 'EFECTIVO').toUpperCase();
        if (payMap[pm] !== undefined) payMap[pm] += Number(v.total || 0);
        else payMap['OTROS'] += Number(v.total || 0);
      });

      // Calculate preparation/delivery times
      let avgPrep = '—';
      let avgDeliv = '—';
      const completedWithTimes = orders.filter(o => o.status === 'COMPLETED' || o.status === 'READY');
      
      const prepTimes = completedWithTimes.filter(o => o.readyAt && o.createdAt);
      if (prepTimes.length > 0) {
        const totalPrep = prepTimes.reduce((s, o) => s + (o.readyAt - o.createdAt), 0);
        avgPrep = `${Math.round(totalPrep / prepTimes.length / 60000)} min`;
      } else {
        // Fallback if readyAt was not explicitly set but status changed, calculate using updatedAt
        const prepFallback = completedWithTimes.filter(o => o.updatedAt && o.createdAt);
        if (prepFallback.length > 0) {
          const totalPrep = prepFallback.reduce((s, o) => s + (o.updatedAt - o.createdAt), 0);
          avgPrep = `${Math.round(totalPrep / prepFallback.length / 60000)} min`;
        }
      }

      const delivTimes = orders.filter(o => o.status === 'COMPLETED' && o.completedAt && o.readyAt);
      if (delivTimes.length > 0) {
        const totalDeliv = delivTimes.reduce((s, o) => s + (o.completedAt - o.readyAt), 0);
        avgDeliv = `${Math.round(totalDeliv / delivTimes.length / 60000)} min`;
      }

      const topTables = Object.entries(tableMap).sort((a,b) => b[1] - a[1]).slice(0, 3);
      const topWaiters = Object.entries(waiterMap).sort((a,b) => b[1] - a[1]).slice(0, 3);

      specSec.innerHTML = `
        <div class="grid-responsive" style="margin-top: var(--space-4);">
          <div class="col-8">
            <div class="card p-5">
              <h3 class="text-sm font-semibold mb-4 text-primary">📊 Distribución de Ingresos (Mesa, Mesero y Caja)</h3>
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-4);">
                <div>
                  <h4 style="font-size: 0.78rem; font-weight:700; color:var(--color-text-secondary); margin-bottom: var(--space-2);">🪑 Por Mesa</h4>
                  ${topTables.length > 0 ? topTables.map(([name, val]) => `
                    <div class="d-flex justify-content-between align-items-center py-1 text-xs" style="border-bottom: 1px solid var(--color-border);">
                      <span>${name}</span>
                      <strong>${this._currency(val)}</strong>
                    </div>
                  `).join('') : '<p class="text-xs text-secondary">Sin mesas cobradas.</p>'}
                </div>
                <div>
                  <h4 style="font-size: 0.78rem; font-weight:700; color:var(--color-text-secondary); margin-bottom: var(--space-2);">🧑‍🍳 Por Mesero</h4>
                  ${topWaiters.length > 0 ? topWaiters.map(([name, val]) => `
                    <div class="d-flex justify-content-between align-items-center py-1 text-xs" style="border-bottom: 1px solid var(--color-border);">
                      <span>${name}</span>
                      <strong>${this._currency(val)}</strong>
                    </div>
                  `).join('') : '<p class="text-xs text-secondary">Sin registros.</p>'}
                </div>
                <div>
                  <h4 style="font-size: 0.78rem; font-weight:700; color:var(--color-text-secondary); margin-bottom: var(--space-2);">💰 Método de Pago / Caja</h4>
                  <div class="d-flex justify-content-between align-items-center py-1 text-xs" style="border-bottom: 1px solid var(--color-border);">
                    <span>Efectivo</span>
                    <strong>${this._currency(payMap.EFECTIVO)}</strong>
                  </div>
                  <div class="d-flex justify-content-between align-items-center py-1 text-xs" style="border-bottom: 1px solid var(--color-border);">
                    <span>Tarjeta</span>
                    <strong>${this._currency(payMap.TARJETA)}</strong>
                  </div>
                  <div class="d-flex justify-content-between align-items-center py-1 text-xs" style="border-bottom: 1px solid var(--color-border);">
                    <span>Transferencia</span>
                    <strong>${this._currency(payMap.TRANSFERENCIA)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="col-4">
            <div class="card p-5" style="display: flex; flex-direction: column; justify-content: center; height: 100%;">
              <h3 class="text-sm font-semibold mb-3 text-primary">⏱️ Desempeño Operativo</h3>
              <div class="d-flex align-items-center gap-3 py-2" style="border-bottom: 1px dashed var(--color-border);">
                <span style="font-size: 1.5rem;">🍳</span>
                <div>
                  <div class="font-bold text-accent" style="font-size: 1.2rem;">${avgPrep}</div>
                  <div class="text-xs text-secondary">Promedio de Preparación</div>
                </div>
              </div>
              <div class="d-flex align-items-center gap-3 py-2">
                <span style="font-size: 1.5rem;">🏃</span>
                <div>
                  <div class="font-bold text-success" style="font-size: 1.2rem;">${avgDeliv}</div>
                  <div class="text-xs text-secondary">Promedio de Entrega</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    this.updateSalesChartAndProducts(ventas, element);
    this.updateActivityFeed(element, 'Gastronomía');
  }

  updateBarberiaStats(element) {
    const q = s => element.querySelector(s);
    const citas = this.state.citas;
    const products = this.state.products;
    const meta = this._getCategoryMeta();

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayCitas = citas.filter(c => c.date === todayStr);

    const completed = citas.filter(c => c.status === 'COMPLETADA');
    const cancelled = citas.filter(c => c.status === 'CANCELADA');
    const pending = citas.filter(c => c.status === 'PENDING' || c.status === 'PENDIENTE');

    // Calculate revenue based on completed appointments
    let serviceRevenue = 0;
    completed.forEach(c => {
      // Attempt to find product matching the service name to get real price
      const serviceProd = products.find(p => p.name?.toLowerCase() === c.service?.toLowerCase());
      if (serviceProd) {
        serviceRevenue += Number(serviceProd.price || 0);
      } else {
        // Fallback default prices by service type
        const fallbacks = {
          'Corte de Cabello': 150,
          'Barba': 100,
          'Corte + Barba': 220,
          'Tinte': 350,
          'Arreglo de Cejas': 80,
          'Tratamiento Capilar': 250
        };
        serviceRevenue += Number(fallbacks[c.service] || 150);
      }
    });

    // Client loyalty frequency
    const clientFreq = {};
    citas.forEach(c => {
      if (c.clientName) {
        clientFreq[c.clientName] = (clientFreq[c.clientName] || 0) + 1;
      }
    });
    const frequentClients = Object.entries(clientFreq)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const kpiRow = q('#dashboard-kpi-row');
    if (kpiRow) {
      const card1 = this._buildKpiCard(meta.kpi1, this._currency(serviceRevenue), `De ${completed.length} citas completadas`, `✂️`, 'border-top: 3px solid var(--color-success);');
      const card2 = this._buildKpiCard(meta.kpi2, todayCitas.length, `${todayCitas.filter(c => c.status === 'PENDIENTE' || c.status === 'PENDING').length} pendientes hoy`, `📅`, 'border-top: 3px solid var(--color-accent);');
      const card3 = this._buildKpiCard(meta.kpi3, completed.length, `${cancelled.length} canceladas · ${pending.length} pendientes`, `✅`, 'border-top: 3px solid var(--color-warning);');
      kpiRow.innerHTML = card1 + card2 + card3;
    }

    // Render client loyalty in the special section
    const specSec = q('#category-specific-section');
    if (specSec) {
      specSec.innerHTML = `
        <div class="card p-5" style="margin-top: var(--space-4);">
          <h3 class="text-sm font-semibold mb-3 text-primary">👑 Clientes Frecuentes</h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-3);">
            ${frequentClients.length > 0 ? frequentClients.map((c, i) => `
              <div class="d-flex align-items-center gap-2 p-2 bg-secondary" style="border-radius: var(--radius-md); border: 1px solid var(--color-border);">
                <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--color-accent-light); color: var(--color-accent); display:flex; align-items:center; justify-content:center; font-weight:700;">${i+1}</div>
                <div>
                  <div class="text-xs font-semibold text-primary">${c.name}</div>
                  <div class="text-xs text-secondary" style="font-size: 0.65rem;">${c.count} citas programadas</div>
                </div>
              </div>
            `).join('') : '<p class="text-xs text-secondary py-3 text-center w-full">Registra citas para ver la lealtad del cliente.</p>'}
          </div>
        </div>
      `;
    }

    // Top Services
    const serviceFreq = {};
    citas.forEach(c => {
      if (c.service) serviceFreq[c.service] = (serviceFreq[c.service] || 0) + 1;
    });
    const topServices = Object.entries(serviceFreq)
      .map(([name, count]) => ({ name, count }))
      .sort((a,b) => b.count - a.count)
      .slice(0, 5);

    const topList = q('#stat-top-products');
    if (topList) {
      if (topServices.length > 0) {
        const maxVal = topServices[0].count;
        topList.innerHTML = topServices.map((s, idx) => this._productRow(s.name, s.count, idx, maxVal)).join('');
      } else {
        topList.innerHTML = '<p class="text-xs text-secondary text-center py-6">Sin citas programadas.</p>';
      }
    }

    // Map weekly chart to appointments
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const weeklyData = [0, 0, 0, 0, 0, 0, 0];
    citas.forEach(c => {
      const dIdx = new Date(c.createdAt || c.date).getDay();
      let idx = dIdx - 1;
      if (idx < 0) idx = 6;
      weeklyData[idx] += 1;
    });

    this.chart.updateData(
      ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
      [{ label: 'Citas Reservadas', data: weeklyData, color: '#34d399' }]
    );
    q('#chart-main-title').textContent = 'Reservaciones de la Semana';
    q('#chart-sub-title').textContent = 'Cantidad de citas creadas por día';

    this.updateActivityFeed(element, 'Citas');
  }

  updateComercioStats(element) {
    const q = s => element.querySelector(s);
    const ventas = this.state.ventas;
    const products = this.state.products;
    const meta = this._getCategoryMeta();

    const todayStr = new Date().toISOString().slice(0, 10);
    const todaySales = ventas.filter(v => new Date(v.date || v.createdAt).toISOString().slice(0, 10) === todayStr);
    const salesTotal = todaySales.reduce((s, v) => s + Number(v.total || 0), 0);

    const totalStock = products.reduce((s, p) => s + Number(p.stock || 0), 0);
    const lowStockList = products.filter(p => Number(p.stock || 0) <= 5);
    const outOfStock = products.filter(p => Number(p.stock || 0) === 0);

    const kpiRow = q('#dashboard-kpi-row');
    if (kpiRow) {
      const card1 = this._buildKpiCard(meta.kpi1, this._currency(salesTotal), `${todaySales.length} ventas realizadas hoy`, `💰`, 'border-top: 3px solid var(--color-success);');
      const card2 = this._buildKpiCard(meta.kpi2, totalStock, `${products.length} productos diferentes`, `📦`, 'border-top: 3px solid var(--color-accent);');
      const card3 = this._buildKpiCard(meta.kpi3, lowStockList.length, `${outOfStock.length} sin existencia total`, `⚠️`, 'border-top: 3px solid var(--color-danger);');
      kpiRow.innerHTML = card1 + card2 + card3;
    }

    // Render critical stock list in specific section
    const specSec = q('#category-specific-section');
    if (specSec) {
      specSec.innerHTML = `
        <div class="card p-5" style="margin-top: var(--space-4);">
          <h3 class="text-sm font-semibold mb-3 text-danger">⚠️ Alerta de Inventario Crítico (Bajo Stock)</h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-3);">
            ${lowStockList.length > 0 ? lowStockList.slice(0, 4).map(p => `
              <div class="d-flex align-items-center justify-content-between p-2 bg-secondary" style="border-radius: var(--radius-md); border: 1px solid var(--color-border);">
                <div>
                  <div class="text-xs font-semibold text-primary">${p.name}</div>
                  <div class="text-xs text-secondary" style="font-size: 0.65rem;">Cód: ${p.barcode || 'N/A'}</div>
                </div>
                <span class="stock-badge ${p.stock === 0 ? 'stock-out' : 'stock-low'}" style="font-size: 0.7rem;">Stock: ${p.stock || 0}</span>
              </div>
            `).join('') : '<p class="text-xs text-secondary py-3 text-center w-full">✅ Todo el inventario se encuentra en niveles óptimos.</p>'}
          </div>
        </div>
      `;
    }

    this.updateSalesChartAndProducts(ventas, element);
    this.updateActivityFeed(element, 'Tienda');
  }

  updateRentACarStats(element) {
    const q = s => element.querySelector(s);
    const vehicles = this.state.vehicles;
    const rentals = this.state.rentals;
    const meta = this._getCategoryMeta();

    const todayStr = new Date().toISOString().slice(0, 10);
    const activeRentals = rentals.filter(r => r.status === 'ACTIVO');

    // Totals
    const rentedCount = vehicles.filter(v => v.status === 'ALQUILADO').length;
    const availableCount = vehicles.filter(v => v.status === 'DISPONIBLE' || !v.status).length;
    const maintenanceCount = vehicles.filter(v => v.status === 'MANTENIMIENTO').length;

    // Overdue returns
    const overdueRentals = activeRentals.filter(r => r.rentEnd < todayStr);

    // Lease Income
    const rentalIncome = rentals.reduce((s, r) => s + Number(r.total || 0), 0);

    const kpiRow = q('#dashboard-kpi-row');
    if (kpiRow) {
      const card1 = this._buildKpiCard(meta.kpi1, this._currency(rentalIncome), `${rentals.length} contratos históricos`, `🪙`, 'border-top: 3px solid var(--color-success);');
      const card2 = this._buildKpiCard(meta.kpi2, activeRentals.length, `${availableCount} autos libres · ${maintenanceCount} en taller`, `🚗`, 'border-top: 3px solid var(--color-accent);');
      const card3 = this._buildKpiCard(meta.kpi3, overdueRentals.length, `Retraso en entrega física`, `⚠️`, overdueRentals.length > 0 ? 'border-top: 3px solid var(--color-danger);' : 'border-top: 3px solid var(--color-warning);');
      kpiRow.innerHTML = card1 + card2 + card3;
    }

    // Render overdue list
    const specSec = q('#category-specific-section');
    if (specSec) {
      specSec.innerHTML = `
        <div class="card p-5" style="margin-top: var(--space-4);">
          <h3 class="text-sm font-semibold mb-3 text-primary">⏰ Alquileres Vencidos o por Entregar</h3>
          <div style="display: flex; flex-direction: column; gap: var(--space-2);">
            ${overdueRentals.length > 0 ? overdueRentals.map(r => `
              <div class="d-flex justify-content-between align-items-center p-2 text-xs" style="background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md);">
                <div>
                  <strong>${r.clientName}</strong> <span class="text-secondary">alquiló</span> <strong>${r.brand} ${r.model} (${r.plate})</strong>
                </div>
                <div class="d-flex align-items-center gap-2">
                  <span style="color: var(--color-danger); font-weight:700;">Debió devolverse: ${r.rentEnd}</span>
                  <span class="stock-badge stock-out">Vencido</span>
                </div>
              </div>
            `).join('') : '<p class="text-xs text-secondary py-3 text-center">✅ No hay alertas de devolución atrasadas.</p>'}
          </div>
        </div>
      `;
    }

    // Top Vehicles rented
    const vehicleFreq = {};
    rentals.forEach(r => {
      const vKey = `${r.brand} ${r.model}`;
      vehicleFreq[vKey] = (vehicleFreq[vKey] || 0) + 1;
    });
    const topVehicles = Object.entries(vehicleFreq)
      .map(([name, count]) => ({ name, count }))
      .sort((a,b) => b.count - a.count)
      .slice(0, 5);

    const topList = q('#stat-top-products');
    if (topList) {
      if (topVehicles.length > 0) {
        const maxVal = topVehicles[0].count;
        topList.innerHTML = topVehicles.map((v, idx) => this._productRow(v.name, v.count, idx, maxVal)).join('');
      } else {
        topList.innerHTML = '<p class="text-xs text-secondary text-center py-6">Sin registros de renta.</p>';
      }
    }

    // Weekly chart from rentals total
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const weeklyData = [0, 0, 0, 0, 0, 0, 0];
    rentals.forEach(r => {
      const dIdx = new Date(r.createdAt || Date.now()).getDay();
      let idx = dIdx - 1;
      if (idx < 0) idx = 6;
      weeklyData[idx] += Number(r.total || 0);
    });

    this.chart.updateData(
      ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
      [{ label: 'Alquileres ($)', data: weeklyData, color: '#6366f1' }]
    );
    q('#chart-main-title').textContent = 'Ingresos por Alquiler Semanal';
    q('#chart-sub-title').textContent = 'Ingreso bruto acumulado por día de renta';

    this.updateActivityFeed(element, 'Rent a Car');
  }

  updateServiciosStats(element) {
    const q = s => element.querySelector(s);
    const requests = this.state.requests;
    const meta = this._getCategoryMeta();

    const pending = requests.filter(r => r.status === 'PENDIENTE');
    const inProcess = requests.filter(r => r.status === 'EN_PROCESO');
    const completed = requests.filter(r => r.status === 'COMPLETADO');
    const quoted = requests.filter(r => r.status === 'COTIZADO' || r.quoteAmount > 0);

    const estimatedRevenue = requests
      .filter(r => r.status !== 'CANCELADO')
      .reduce((s, r) => s + Number(r.quoteAmount || 0), 0);

    const kpiRow = q('#dashboard-kpi-row');
    if (kpiRow) {
      const card1 = this._buildKpiCard(meta.kpi1, this._currency(estimatedRevenue), `De ${quoted.length} solicitudes cotizadas`, `🪙`, 'border-top: 3px solid var(--color-success);');
      const card2 = this._buildKpiCard(meta.kpi2, pending.length, `Nuevas solicitudes por cotizar`, `📥`, 'border-top: 3px solid var(--color-accent);');
      const card3 = this._buildKpiCard(meta.kpi3, inProcess.length, `${completed.length} trabajos completados`, `⚙️`, 'border-top: 3px solid var(--color-warning);');
      kpiRow.innerHTML = card1 + card2 + card3;
    }

    // Render active service requests in specific section
    const specSec = q('#category-specific-section');
    if (specSec) {
      specSec.innerHTML = `
        <div class="card p-5" style="margin-top: var(--space-4);">
          <h3 class="text-sm font-semibold mb-3 text-primary">⚙️ Trabajos Activos en Proceso</h3>
          <div style="display: flex; flex-direction: column; gap: var(--space-2);">
            ${inProcess.length > 0 ? inProcess.map(r => `
              <div class="d-flex justify-content-between align-items-center p-2 text-xs" style="background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md);">
                <div>
                  <strong>${r.clientName || 'Cliente'}</strong>: ${r.description || 'Sin descripción'}
                </div>
                <span class="stock-badge stock-low" style="font-size: 0.7rem;">En Proceso</span>
              </div>
            `).join('') : '<p class="text-xs text-secondary py-3 text-center">No hay trabajos activos en proceso en este momento.</p>'}
          </div>
        </div>
      `;
    }

    // Top services requested
    const serviceFreq = {};
    requests.forEach(r => {
      const sKey = r.serviceType || 'Servicio General';
      serviceFreq[sKey] = (serviceFreq[sKey] || 0) + 1;
    });
    const topServices = Object.entries(serviceFreq)
      .map(([name, count]) => ({ name, count }))
      .sort((a,b) => b.count - a.count)
      .slice(0, 5);

    const topList = q('#stat-top-products');
    if (topList) {
      if (topServices.length > 0) {
        const maxVal = topServices[0].count;
        topList.innerHTML = topServices.map((v, idx) => this._productRow(v.name, v.count, idx, maxVal)).join('');
      } else {
        topList.innerHTML = '<p class="text-xs text-secondary text-center py-6">Sin solicitudes recibidas.</p>';
      }
    }

    // Weekly request counts
    const weeklyData = [0, 0, 0, 0, 0, 0, 0];
    requests.forEach(r => {
      const dIdx = new Date(r.createdAt || Date.now()).getDay();
      let idx = dIdx - 1;
      if (idx < 0) idx = 6;
      weeklyData[idx] += 1;
    });

    this.chart.updateData(
      ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
      [{ label: 'Solicitudes', data: weeklyData, color: '#a855f7' }]
    );
    q('#chart-main-title').textContent = 'Solicitudes de Servicio Recibidas';
    q('#chart-sub-title').textContent = 'Cantidad de cotizaciones solicitadas por día';

    this.updateActivityFeed(element, 'Servicios');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUXILIARY PLOTTERS
  // ═══════════════════════════════════════════════════════════════════════════

  updateSalesChartAndProducts(ventas, element) {
    const q = s => element.querySelector(s);
    
    // Group weekly revenues
    const dayTotals = [0, 0, 0, 0, 0, 0, 0];
    ventas.forEach(v => {
      const d = new Date(v.date || v.createdAt);
      let idx = d.getDay() - 1;
      if (idx < 0) idx = 6;
      dayTotals[idx] += Number(v.total || 0);
    });

    this.chart.updateData(
      ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
      [{ label: 'Ventas ($)', data: dayTotals, color: '#7c75ff' }]
    );

    const updateEl = q('#chart-last-update');
    if (updateEl) updateEl.textContent = `Actualizado: ${TimeService.formatTime(new Date(), false)}`;

    // Top products Sold
    const productFreq = {};
    ventas.forEach(v => {
      if (Array.isArray(v.items)) {
        v.items.forEach(item => {
          const name = item.name || 'Producto';
          productFreq[name] = (productFreq[name] || 0) + Number(item.qty || 1);
        });
      }
    });

    const topProducts = Object.entries(productFreq)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const topEl = q('#stat-top-products');
    if (topEl) {
      if (topProducts.length > 0) {
        const maxVal = topProducts[0].count;
        topEl.innerHTML = topProducts.map((p, idx) => this._productRow(p.name, p.count, idx, maxVal)).join('');
      } else {
        topEl.innerHTML = '<p class="text-xs text-secondary text-center py-6">Sin ventas registradas.</p>';
      }
    }
  }

  updateActivityFeed(element, typeName) {
    const feed = element.querySelector('#activity-feed');
    if (!feed) return;

    let items = [];
    const now = new Date();

    if (typeName === 'Gastronomía') {
      const recentSales = this.state.ventas.slice(-3);
      recentSales.forEach(s => {
        items.push({
          text: `Venta cobrada por ${this._currency(s.total)} — Mesa: ${s.tableName || 'Directa'}`,
          time: new Date(s.date || s.createdAt),
          dot: 'success'
        });
      });
      const recentOrders = this.state.orders.slice(-2);
      recentOrders.forEach(o => {
        items.push({
          text: `Pedido #${o.id.slice(-4).toUpperCase()} en estado ${o.status}`,
          time: new Date(o.createdAt || Date.now()),
          dot: o.status === 'READY' ? 'accent' : 'warning'
        });
      });
    } 
    else if (typeName === 'Citas') {
      const recent = this.state.citas.slice(-5);
      recent.forEach(c => {
        items.push({
          text: `Cita asignada a ${c.clientName || 'Cliente'} — Servicio: ${c.service} (${c.status})`,
          time: new Date(c.createdAt || Date.now()),
          dot: c.status === 'COMPLETADA' ? 'success' : 'accent'
        });
      });
    } 
    else if (typeName === 'Tienda') {
      const recentSales = this.state.ventas.slice(-5);
      recentSales.forEach(s => {
        items.push({
          text: `Venta concretada por ${this._currency(s.total)} (${s.items?.length || 1} arts.)`,
          time: new Date(s.date || s.createdAt),
          dot: 'success'
        });
      });
    } 
    else if (typeName === 'Rent a Car') {
      const recent = this.state.rentals.slice(-3);
      recent.forEach(r => {
        items.push({
          text: `Alquiler registrado para ${r.clientName} — Auto: ${r.brand} ${r.model} (${r.status})`,
          time: new Date(r.createdAt || Date.now()),
          dot: r.status === 'COMPLETED' ? 'success' : 'accent'
        });
      });
    } 
    else if (typeName === 'Servicios') {
      const recent = this.state.requests.slice(-5);
      recent.forEach(r => {
        items.push({
          text: `Solicitud de ${r.clientName || 'Cliente'} en estado ${r.status}`,
          time: new Date(r.createdAt || Date.now()),
          dot: r.status === 'COMPLETADO' ? 'success' : 'warning'
        });
      });
    }

    if (items.length > 0) {
      // Sort descending by date
      items.sort((a,b) => b.time - a.time);
      feed.innerHTML = items.slice(0, 5).map(item => {
        const timeDiff = Math.max(0, now - item.time);
        let timeStr = 'Hace un momento';
        if (timeDiff >= 3600000) timeStr = `Hace ${Math.round(timeDiff/3600000)}h`;
        else if (timeDiff >= 60000) timeStr = `Hace ${Math.round(timeDiff/60000)} min`;
        return `
          <div class="activity-item" style="display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) 0;">
            <div class="activity-dot activity-dot-${item.dot}" style="width: 8px; height: 8px; border-radius: 50%; background: ${item.dot === 'success' ? 'var(--color-success)' : item.dot === 'accent' ? 'var(--color-accent)' : 'var(--color-warning)'};"></div>
            <div class="activity-content" style="flex:1; display:flex; justify-content:space-between; align-items:center;">
              <span class="activity-text text-sm" style="color: var(--color-text-primary);">${item.text}</span>
              <span class="activity-time text-xs text-secondary" style="font-size: 0.72rem;">${timeStr}</span>
            </div>
          </div>
        `;
      }).join('');
    } else {
      feed.innerHTML = `<p class="text-xs text-secondary py-3 text-center">Sin actividad registrada en la base de datos.</p>`;
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
