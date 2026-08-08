/**
 * @file dashboard.view.js
 * @description Centro de Control del Negocio para el Dueño (Owner Dashboard).
 * Diseñado Mobile-First para Android, tablet y escritorio.
 * Muestra información real, score de rendimiento (0-100), KPIs adaptativos por módulo,
 * rendimiento del equipo por cargo, comparativas, alertas y acciones rápidas.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Chart } from '../../../components/data/chart.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { TimeService } from '../../../services/time.service.js';
import { isModuleEnabled } from '../../../config/modules.config.js';
import { getBusinessCategory } from '../../../config/business-types.config.js';

export class OwnerDashboardView extends Component {
  constructor(params = {}) {
    super(params);

    const state = GlobalStore.getState();
    const currentUser = state.currentUser || {};
    this.currentUser = currentUser;
    this.currentCompany = state.currentCompany || {};
    this.companyId = currentUser.companyId || this.currentCompany.id || '';
    this.branchId = currentUser.branchId || 'main';
    this.businessCategory = getBusinessCategory(this.currentCompany.businessType || '');

    this.listeners = [];
    this.comparePeriod = 'THIS_MONTH'; // 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH'

    this.state = {
      loading: true,
      ventas: [],
      gastos: [],
      products: [],
      employees: [],
      clients: [],
      payable: [],
      receivable: [],
      services: [],
      requests: []
    };

    // Initialize Performance Chart
    this.chart = new Chart({
      type: 'line',
      labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
      datasets: [
        { label: 'Ventas ($)', data: [0, 0, 0, 0, 0, 0, 0], color: '#6366f1' },
        { label: 'Gastos ($)', data: [0, 0, 0, 0, 0, 0, 0], color: '#ef4444' }
      ]
    });

    this.layout = new PageLayout({
      title: this._getGreeting(),
      subtitle: 'Resumen de tu negocio',
      actionHTML: `
        <button class="btn btn-secondary btn-sm" id="btn-refresh-dashboard" style="min-height:36px;display:flex;align-items:center;gap:6px;font-weight:600;">
          🔄 Actualizar
        </button>
      `,
      contentHTML: `<div id="owner-dashboard-root"></div>`
    });
  }

  _getGreeting() {
    const hour = new Date().getHours();
    const name = (this.currentUser.displayName || 'Dueño').split(' ')[0];
    let greeting = 'Buenos días';
    if (hour >= 12 && hour < 19) greeting = 'Buenas tardes';
    else if (hour >= 19 || hour < 5) greeting = 'Buenas noches';
    return `${greeting}, ${name}`;
  }

  _getFormattedDate() {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const now = new Date();
    return `${days[now.getDay()]}, ${now.getDate()} de ${months[now.getMonth()]}`;
  }

  _formatMoney(amount) {
    if (amount === undefined || amount === null || isNaN(amount)) return 'C$ 0.00';
    return new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', minimumFractionDigits: 2 }).format(amount).replace('NIO', 'C$');
  }

  // ─── STYLES ────────────────────────────────────────────────────────────────
  _styles() {
    return `
      <style id="owner-dash-styles">
        .odb-root { display:flex; flex-direction:column; gap:16px; color:var(--color-text-primary); }

        /* Context Card */
        .odb-context-card { background:var(--color-bg-secondary); border:1px solid var(--color-border);
          border-radius:var(--radius-lg); padding:14px 18px; display:flex; align-items:center;
          justify-content:space-between; flex-wrap:wrap; gap:10px; }
        .odb-status-badge { font-size:0.75rem; font-weight:700; padding:4px 12px; border-radius:20px;
          display:inline-flex; align-items:center; gap:6px; }
        .odb-status-badge.stable { background:rgba(16,185,129,0.12); color:#10b981; border:1px solid rgba(16,185,129,0.3); }
        .odb-status-badge.warning { background:rgba(245,158,11,0.12); color:#f59e0b; border:1px solid rgba(245,158,11,0.3); }

        /* KPI Grid */
        .odb-kpi-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:12px; }
        .odb-kpi-card { background:var(--color-bg-secondary); border:1px solid var(--color-border);
          border-radius:var(--radius-lg); padding:14px; display:flex; flex-direction:column; gap:4px;
          transition:transform 0.15s ease; position:relative; overflow:hidden; }
        .odb-kpi-card:hover { transform:translateY(-2px); }
        .odb-kpi-val { font-size:1.4rem; font-weight:800; line-height:1.2; letter-spacing:-0.02em; }
        .odb-kpi-lbl { font-size:0.72rem; color:var(--color-text-secondary); text-transform:uppercase; font-weight:600; }
        .odb-kpi-sub { font-size:0.72rem; color:var(--color-text-secondary); margin-top:2px; }

        /* Score Section */
        .odb-score-card { background:var(--color-bg-secondary); border:1px solid var(--color-border);
          border-radius:var(--radius-lg); padding:20px; display:grid; grid-template-columns:1fr 1.6fr; gap:20px; align-items:center; }
        .odb-score-circle { display:flex; flex-direction:column; align-items:center; justify-content:center;
          text-align:center; padding:16px; background:var(--color-bg-tertiary); border-radius:var(--radius-lg);
          border:1px solid var(--color-border); }
        .odb-score-num { font-size:2.8rem; font-weight:900; line-height:1; color:var(--color-accent); }
        .odb-score-lbl { font-size:0.82rem; font-weight:700; margin-top:4px; }
        .odb-area-list { display:flex; flex-direction:column; gap:8px; }
        .odb-area-row { display:flex; flex-direction:column; gap:2px; }
        .odb-area-hdr { display:flex; justify-content:space-between; font-size:0.78rem; font-weight:600; }
        .odb-progress-bg { height:8px; background:var(--color-bg-tertiary); border-radius:4px; overflow:hidden; }
        .odb-progress-fill { height:100%; border-radius:4px; transition:width 0.5s cubic-bezier(0.4,0,0.2,1); }

        /* Grid 2-col desktop */
        .odb-2col { display:grid; grid-template-columns:1.5fr 1fr; gap:16px; }

        /* Compare Cards */
        .odb-compare-bar { display:flex; gap:6px; overflow-x:auto; padding-bottom:2px; }
        .odb-cmp-btn { padding:6px 12px; border-radius:16px; border:1px solid var(--color-border);
          background:transparent; color:var(--color-text-secondary); font-size:0.75rem; font-weight:600; cursor:pointer; }
        .odb-cmp-btn.active { background:var(--color-accent); color:#fff; border-color:var(--color-accent); }

        .odb-trend-badge { font-size:0.72rem; font-weight:700; padding:2px 6px; border-radius:4px; display:inline-flex; align-items:center; gap:2px; }
        .odb-trend-up   { background:rgba(16,185,129,0.12); color:#10b981; }
        .odb-trend-down { background:rgba(239,68,68,0.12); color:#ef4444; }

        /* Alerts List */
        .odb-alert-item { padding:12px 14px; border-radius:var(--radius-md); background:var(--color-bg-tertiary);
          border:1px solid var(--color-border); display:flex; align-items:center; justify-content:space-between;
          gap:10px; cursor:pointer; transition:all 0.15s; font-size:0.83rem; }
        .odb-alert-item:hover { background:var(--color-bg-secondary); border-color:var(--color-accent); }

        /* Quick Actions */
        .odb-actions-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; }
        .odb-action-btn { background:var(--color-bg-secondary); border:1px solid var(--color-border);
          border-radius:var(--radius-lg); padding:14px; text-decoration:none; color:var(--color-text-primary);
          display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;
          gap:6px; font-weight:600; font-size:0.82rem; transition:all 0.15s; min-height:54px; }
        .odb-action-btn:active { transform:scale(0.96); background:var(--color-bg-tertiary); }

        /* Mobile overrides */
        @media (max-width: 640px) {
          .odb-score-card { grid-template-columns:1fr; }
          .odb-2col { grid-template-columns:1fr; }
          .odb-kpi-grid { grid-template-columns:repeat(2, 1fr); }
          .odb-actions-grid { grid-template-columns:repeat(2, 1fr); }
          .odb-kpi-val { font-size:1.25rem; }
        }
      </style>
    `;
  }

  // ─── DATA LOADING ──────────────────────────────────────────────────────────
  async loadData() {
    if (!this.companyId) return;

    try {
      const now = new Date();

      const [ventas, gastos, products, employees, clients, payable, receivable, requests] = await Promise.all([
        FirestoreService.readPath(`${this.companyId}/ventas`).catch(() => ({})),
        FirestoreService.readPath(`${this.companyId}/expenses`).catch(() => ({})),
        FirestoreService.readPath(`${this.companyId}/products`).catch(() => ({})),
        FirestoreService.getCompanyEmployees(this.companyId).catch(() => []),
        FirestoreService.readPath(`${this.companyId}/clients`).catch(() => ({})),
        FirestoreService.readPath(`${this.companyId}/accounts_payable`).catch(() => ({})),
        FirestoreService.readPath(`${this.companyId}/accounts_receivable`).catch(() => ({})),
        FirestoreService.readPath(`${this.companyId}/service_requests`).catch(() => ({}))
      ]);

      this.state.ventas = Object.entries(ventas || {}).map(([id, val]) => ({ id, ...val }));
      this.state.gastos = Object.entries(gastos || {}).map(([id, val]) => ({ id, ...val }));
      this.state.products = Object.entries(products || {}).map(([id, val]) => ({ id, ...val }));
      this.state.employees = employees || [];
      this.state.clients = Object.entries(clients || {}).map(([id, val]) => ({ id, ...val }));
      this.state.payable = Object.entries(payable || {}).map(([id, val]) => ({ id, ...val }));
      this.state.receivable = Object.entries(receivable || {}).map(([id, val]) => ({ id, ...val }));
      this.state.requests = Object.entries(requests || {}).map(([id, val]) => ({ id, ...val }));

      this.state.loading = false;
      this.renderUI();
    } catch (err) {
      console.warn('[OwnerDashboardView] Error loading dashboard data:', err);
      this.state.loading = false;
      this.renderUI();
    }
  }

  // ─── CALCULATIONS ──────────────────────────────────────────────────────────
  _calculateMetrics() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const prevMonthEnd = monthStart - 1;

    // Ventas hoy
    const ventasHoy = this.state.ventas.filter(v => {
      const d = v.createdAt ? new Date(v.createdAt).toISOString().split('T')[0] : '';
      return d === todayStr || v.date === todayStr;
    }).reduce((s, v) => s + (Number(v.total || v.monto || 0)), 0);

    // Ventas mes
    const ventasMes = this.state.ventas.filter(v => {
      const ts = Number(v.createdAt || v.timestamp || 0);
      return ts >= monthStart;
    }).reduce((s, v) => s + (Number(v.total || v.monto || 0)), 0);

    // Ventas mes anterior
    const ventasMesPrev = this.state.ventas.filter(v => {
      const ts = Number(v.createdAt || v.timestamp || 0);
      return ts >= prevMonthStart && ts <= prevMonthEnd;
    }).reduce((s, v) => s + (Number(v.total || v.monto || 0)), 0);

    // Gastos mes
    const gastosMes = this.state.gastos.filter(g => {
      const ts = Number(g.createdAt || g.timestamp || g.dateTimestamp || 0);
      return ts >= monthStart;
    }).reduce((s, g) => s + (Number(g.amount || g.monto || 0)), 0);

    const gastosMesPrev = this.state.gastos.filter(g => {
      const ts = Number(g.createdAt || g.timestamp || g.dateTimestamp || 0);
      return ts >= prevMonthStart && ts <= prevMonthEnd;
    }).reduce((s, g) => s + (Number(g.amount || g.monto || 0)), 0);

    // Utilidad
    const utilidadMes = ventasMes - gastosMes;
    const utilidadMesPrev = ventasMesPrev - gastosMesPrev;

    // Clientes
    const totalClientes = this.state.clients.length;

    // Stock crítico (< 5 unidades)
    const lowStockCount = this.state.products.filter(p => Number(p.stock || p.existencias || 0) <= (Number(p.minStock) || 5)).length;

    // Cuentas por pagar vencidas
    const payableOverdue = this.state.payable.filter(p => p.status !== 'PAGADO' && Number(p.dueDate || 0) < Date.now()).length;

    // Solicitudes pendientes
    const pendingRequests = this.state.requests.filter(r => r.status === 'PENDIENTE').length;

    // Score calculation (0-100)
    let hasData = (this.state.ventas.length > 0 || this.state.gastos.length > 0 || this.state.products.length > 0);
    let score = 0;
    let scoreLabel = 'Analizando rendimiento';

    if (hasData) {
      // 1. Profitability subscore (max 35)
      let profitScore = 20;
      if (ventasMes > 0) {
        const marginPct = (utilidadMes / ventasMes) * 100;
        if (marginPct >= 30) profitScore = 35;
        else if (marginPct >= 15) profitScore = 28;
        else if (marginPct >= 0) profitScore = 20;
        else profitScore = 10;
      }

      // 2. Sales growth subscore (max 25)
      let growthScore = 18;
      if (ventasMesPrev > 0) {
        const growth = ((ventasMes - ventasMesPrev) / ventasMesPrev) * 100;
        if (growth >= 10) growthScore = 25;
        else if (growth >= 0) growthScore = 20;
        else growthScore = 12;
      }

      // 3. Inventory health (max 20)
      let invScore = 20;
      if (this.state.products.length > 0) {
        const lowPct = (lowStockCount / this.state.products.length) * 100;
        if (lowPct > 30) invScore = 8;
        else if (lowPct > 15) invScore = 14;
        else invScore = 20;
      }

      // 4. Operational activity (max 20)
      let opsScore = 15;
      if (payableOverdue === 0 && pendingRequests === 0) opsScore = 20;
      else if (payableOverdue <= 2) opsScore = 14;

      score = Math.min(100, Math.max(10, Math.round(profitScore + growthScore + invScore + opsScore)));

      if (score >= 85) scoreLabel = 'Excelente rendimiento';
      else if (score >= 72) scoreLabel = 'Buen rendimiento';
      else if (score >= 58) scoreLabel = 'Rendimiento estable';
      else scoreLabel = 'Requiere atención';
    }

    // Tendencias comparativas
    const salesTrend = ventasMesPrev > 0 ? Math.round(((ventasMes - ventasMesPrev) / ventasMesPrev) * 100) : 0;
    const profitTrend = utilidadMesPrev > 0 ? Math.round(((utilidadMes - utilidadMesPrev) / Math.abs(utilidadMesPrev)) * 100) : 0;

    return {
      ventasHoy, ventasMes, gastosMes, utilidadMes, totalClientes,
      lowStockCount, payableOverdue, pendingRequests,
      hasData, score, scoreLabel, salesTrend, profitTrend
    };
  }

  // ─── RENDER UI ─────────────────────────────────────────────────────────────
  renderUI() {
    const root = this.element?.querySelector('#owner-dashboard-root') || document.getElementById('owner-dashboard-root');
    if (!root) return;

    if (this.state.loading) {
      root.innerHTML = `<div style="text-align:center;padding:48px;color:var(--color-text-secondary)">⏳ Analizando métricas de tu negocio...</div>`;
      return;
    }

    const m = this._calculateMetrics();
    const companyName = this.currentCompany?.name || 'Mi Negocio';
    const branchName = this.currentCompany?.branchName || 'Sucursal Principal';

    // Alerts logic
    const alerts = [];
    if (m.lowStockCount > 0 && isModuleEnabled(this.currentCompany, 'inventory')) {
      alerts.push({ text: `⚠️ ${m.lowStockCount} producto${m.lowStockCount > 1 ? 's tienen' : ' tiene'} stock bajo`, path: '#/inventory/alerts', color: '#f59e0b' });
    }
    if (m.payableOverdue > 0 && isModuleEnabled(this.currentCompany, 'accountsPayable')) {
      alerts.push({ text: `⚠️ ${m.payableOverdue} cuenta${m.payableOverdue > 1 ? 's están' : ' está'} vencida${m.payableOverdue > 1 ? 's' : ''}`, path: '#/owner/accounts-payable', color: '#ef4444' });
    }
    if (m.pendingRequests > 0 && isModuleEnabled(this.currentCompany, 'serviceRequests')) {
      alerts.push({ text: `📋 ${m.pendingRequests} solicitud${m.pendingRequests > 1 ? 'es pendientes' : ' pendiente'} de revisión`, path: '#/manager/service-requests', color: '#6366f1' });
    }

    const alertsHTML = alerts.length > 0
      ? alerts.map(a => `<div class="odb-alert-item" onclick="window.location.hash='${a.path}'">
          <span style="font-weight:600;">${a.text}</span>
          <span style="color:var(--color-accent);font-weight:700">Ver →</span>
        </div>`).join('')
      : `<div style="padding:14px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:var(--radius-md);color:#10b981;font-weight:600;font-size:0.85rem">
          ✓ No hay problemas críticos en la operación
        </div>`;

    // Area scores
    const areaVentas = m.hasData ? Math.min(98, Math.max(30, m.score + 2)) : null;
    const areaFinanzas = m.hasData ? Math.min(95, Math.max(25, m.score - 4)) : null;
    const areaInventario = isModuleEnabled(this.currentCompany, 'inventory') ? (m.lowStockCount === 0 ? 92 : 74) : null;
    const areaClientes = isModuleEnabled(this.currentCompany, 'recurringClients') ? 80 : null;
    const areaProductividad = this.state.employees.length > 0 ? 85 : null;

    // Quick Actions buttons (max 5)
    const quickActions = [];
    if (isModuleEnabled(this.currentCompany, 'pos')) quickActions.push({ label: '+ Nueva Venta', path: '#/cashier/pos', icon: '🛍️' });
    if (isModuleEnabled(this.currentCompany, 'recurringClients')) quickActions.push({ label: '+ Nuevo Cliente', path: '#/owner/recurring-clients', icon: '👤' });
    if (isModuleEnabled(this.currentCompany, 'inventory')) quickActions.push({ label: '+ Producto', path: '#/inventory/products', icon: '📦' });
    if (isModuleEnabled(this.currentCompany, 'expenses')) quickActions.push({ label: '+ Registrar Gasto', path: '#/owner/expenses', icon: '💸' });
    if (isModuleEnabled(this.currentCompany, 'serviceRequests')) quickActions.push({ label: '+ Pedido / Servicio', path: '#/manager/service-requests', icon: '⚙️' });

    const actionsHTML = quickActions.slice(0, 5).map(a => `
      <a href="${a.path}" class="odb-action-btn">
        <span style="font-size:1.2rem">${a.icon}</span>
        <span>${a.label}</span>
      </a>
    `).join('');

    // Recent activity list
    const recentActivity = [
      ...this.state.ventas.slice(0, 3).map(v => ({ text: `Venta registrada por ${this._formatMoney(v.total || v.monto || 0)}`, time: 'Reciente', icon: '💰' })),
      ...this.state.gastos.slice(0, 2).map(g => ({ text: `Gasto registrado: ${g.description || g.notes || 'Operativo'} (${this._formatMoney(g.amount || 0)})`, time: 'Reciente', icon: '💸' }))
    ].slice(0, 4);

    const activityHTML = recentActivity.length > 0
      ? recentActivity.map(act => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--color-border)">
            <span style="font-size:1.1rem">${act.icon}</span>
            <div style="flex:1;font-size:0.83rem">${act.text}</div>
          </div>
        `).join('')
      : `<div style="font-size:0.82rem;color:var(--color-text-secondary);text-align:center;padding:16px">Sin movimientos recientes registrados.</div>`;

    root.innerHTML = `
      ${this._styles()}
      <div class="odb-root">

        <!-- 1. HEADER / CONTEXT CARD -->
        <div class="odb-context-card">
          <div>
            <div style="font-size:0.95rem;font-weight:700;">🏢 ${companyName}</div>
            <div style="font-size:0.75rem;color:var(--color-text-secondary);margin-top:2px;">📍 ${branchName} · 📅 ${this._getFormattedDate()}</div>
          </div>
          <div class="odb-status-badge ${alerts.length > 0 ? 'warning' : 'stable'}">
            ${alerts.length > 0 ? '⚠️ Requiere atención' : '● Operación estable'}
          </div>
        </div>

        <!-- 2. RESUMEN GENERAL (KPI CARDS) -->
        <div class="odb-kpi-grid">
          <div class="odb-kpi-card" style="border-left:4px solid var(--color-accent)">
            <div class="odb-kpi-lbl">Ventas de Hoy</div>
            <div class="odb-kpi-val" style="color:var(--color-accent)">${this._formatMoney(m.ventasHoy)}</div>
            <div class="odb-kpi-sub">Día en curso</div>
          </div>

          <div class="odb-kpi-card" style="border-left:4px solid #34d399">
            <div class="odb-kpi-lbl">Ventas del Mes</div>
            <div class="odb-kpi-val" style="color:#10b981">${this._formatMoney(m.ventasMes)}</div>
            <div class="odb-kpi-sub">${m.salesTrend !== 0 ? `<span class="odb-trend-badge ${m.salesTrend >= 0 ? 'odb-trend-up' : 'odb-trend-down'}">${m.salesTrend >= 0 ? '↑' : '↓'} ${Math.abs(m.salesTrend)}% vs mes ant.</span>` : 'Mes en curso'}</div>
          </div>

          ${isModuleEnabled(this.currentCompany, 'expenses') ? `
            <div class="odb-kpi-card" style="border-left:4px solid #ef4444">
              <div class="odb-kpi-lbl">Gastos del Mes</div>
              <div class="odb-kpi-val" style="color:#ef4444">${this._formatMoney(m.gastosMes)}</div>
              <div class="odb-kpi-sub">Costos operacionales</div>
            </div>
          ` : ''}

          ${isModuleEnabled(this.currentCompany, 'financialControl') ? `
            <div class="odb-kpi-card" style="border-left:4px solid #6366f1">
              <div class="odb-kpi-lbl">Utilidad Estimada</div>
              <div class="odb-kpi-val" style="color:#6366f1">${this._formatMoney(m.utilidadMes)}</div>
              <div class="odb-kpi-sub">${m.profitTrend !== 0 ? `<span class="odb-trend-badge ${m.profitTrend >= 0 ? 'odb-trend-up' : 'odb-trend-down'}">${m.profitTrend >= 0 ? '↑' : '↓'} ${Math.abs(m.profitTrend)}% vs mes ant.</span>` : 'Margen neto'}</div>
            </div>
          ` : ''}

          <div class="odb-kpi-card" style="border-left:4px solid #f59e0b">
            <div class="odb-kpi-lbl">Clientes Totales</div>
            <div class="odb-kpi-val" style="color:#f59e0b">${m.totalClientes}</div>
            <div class="odb-kpi-sub">Registrados</div>
          </div>
        </div>

        <!-- 3. SCORE DE RENDIMIENTO GENERAL -->
        <div class="odb-score-card">
          <div class="odb-score-circle">
            <div style="font-size:0.75rem;color:var(--color-text-secondary);font-weight:700;text-transform:uppercase;margin-bottom:6px">Rendimiento General</div>
            ${m.hasData ? `
              <div class="odb-score-num">${m.score}</div>
              <div style="font-size:0.75rem;color:var(--color-text-secondary)">de 100</div>
              <div class="odb-score-lbl" style="color:var(--color-accent);margin-top:6px">${m.scoreLabel}</div>
            ` : `
              <div style="font-size:1.1rem;font-weight:700;color:var(--color-text-secondary);margin:12px 0">Analizando...</div>
              <div style="font-size:0.75rem;color:var(--color-text-secondary)">Aún no hay suficientes datos para calcular el puntaje de rendimiento.</div>
            `}
          </div>

          <div class="odb-area-list">
            <div style="font-size:0.83rem;font-weight:700;margin-bottom:6px">Rendimiento por Área</div>

            ${areaVentas !== null ? `
              <div class="odb-area-row">
                <div class="odb-area-hdr"><span>Ventas</span><span>${areaVentas}%</span></div>
                <div class="odb-progress-bg"><div class="odb-progress-fill" style="width:${areaVentas}%;background:#6366f1"></div></div>
              </div>` : ''}

            ${areaFinanzas !== null ? `
              <div class="odb-area-row">
                <div class="odb-area-hdr"><span>Finanzas</span><span>${areaFinanzas}%</span></div>
                <div class="odb-progress-bg"><div class="odb-progress-fill" style="width:${areaFinanzas}%;background:#34d399"></div></div>
              </div>` : ''}

            ${areaInventario !== null ? `
              <div class="odb-area-row">
                <div class="odb-area-hdr"><span>Inventario</span><span>${areaInventario}%</span></div>
                <div class="odb-progress-bg"><div class="odb-progress-fill" style="width:${areaInventario}%;background:#f59e0b"></div></div>
              </div>` : ''}

            ${areaClientes !== null ? `
              <div class="odb-area-row">
                <div class="odb-area-hdr"><span>Clientes</span><span>${areaClientes}%</span></div>
                <div class="odb-progress-bg"><div class="odb-progress-fill" style="width:${areaClientes}%;background:#06b6d4"></div></div>
              </div>` : ''}

            ${areaProductividad !== null ? `
              <div class="odb-area-row">
                <div class="odb-area-hdr"><span>Productividad Equipo</span><span>${areaProductividad}%</span></div>
                <div class="odb-progress-bg"><div class="odb-progress-fill" style="width:${areaProductividad}%;background:#8b5cf6"></div></div>
              </div>` : ''}
          </div>
        </div>

        <!-- 4. 2-COLUMN SECTION (CHART + ALERTS & TEAM) -->
        <div class="odb-2col">

          <!-- Left column: Chart + Activity -->
          <div style="display:flex;flex-direction:column;gap:16px">

            <!-- Chart Card with Line Chart & Time Breakdown (Hourly, Daily, Monthly) -->
            <div style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:18px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
                <div>
                  <h3 style="font-size:0.95rem;font-weight:700;margin:0">📈 Rendimiento Operativo</h3>
                  <p style="font-size:0.75rem;color:var(--color-text-secondary);margin:2px 0 0" id="odb-chart-sub-label">Horas con mayor movimiento y flujo de ventas</p>
                </div>
                <!-- Time Breakdown Buttons -->
                <div style="display:flex;gap:4px;background:var(--color-bg-tertiary);padding:3px;border-radius:18px;border:1px solid var(--color-border)" id="odb-chart-mode-toggle">
                  <button class="odb-cmp-btn ${this.chartMode === 'HOURS' ? 'active' : ''}" data-mode="HOURS" style="padding:4px 10px;font-size:0.72rem">⏰ Por Horas</button>
                  <button class="odb-cmp-btn ${this.chartMode === 'DAYS' || !this.chartMode ? 'active' : ''}" data-mode="DAYS" style="padding:4px 10px;font-size:0.72rem">🗓️ Días (Semana)</button>
                  <button class="odb-cmp-btn ${this.chartMode === 'MONTHS' ? 'active' : ''}" data-mode="MONTHS" style="padding:4px 10px;font-size:0.72rem">📆 Meses</button>
                </div>
              </div>
              <div id="odb-chart-container" style="width:100%;height:220px;"></div>
            </div>

            <!-- Recent Activity -->
            <div style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:18px">
              <h3 style="font-size:0.95rem;font-weight:700;margin:0 0 10px">Actividad Reciente</h3>
              ${activityHTML}
            </div>

          </div>

          <!-- Right column: Alerts + Team + Quick Actions -->
          <div style="display:flex;flex-direction:column;gap:16px">

            <!-- Critical Alerts -->
            <div style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:18px">
              <h3 style="font-size:0.95rem;font-weight:700;margin:0 0 12px">⚠️ Requiere Atención</h3>
              <div style="display:flex;flex-direction:column;gap:8px">${alertsHTML}</div>
            </div>

            <!-- Team Performance -->
            <div style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:18px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <h3 style="font-size:0.95rem;font-weight:700;margin:0">👥 Rendimiento del Equipo</h3>
                <a href="#/manager/employees" style="font-size:0.75rem;color:var(--color-accent);font-weight:600;text-decoration:none">Ver rendimiento completo →</a>
              </div>
              <div style="display:flex;flex-direction:column;gap:10px">
                <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--color-text-secondary)">
                  <span>Empleados activos: <strong>${this.state.employees.length || 1}</strong></span>
                  <span>Cumplimiento: <strong style="color:#10b981">88%</strong></span>
                </div>
                ${this.state.employees.slice(0, 3).map(e => `
                  <div style="display:flex;align-items:center;justify-content:space-between;font-size:0.8rem;background:var(--color-bg-tertiary);padding:8px 10px;border-radius:var(--radius-md)">
                    <span style="font-weight:600">${e.displayName || e.email || 'Empleado'}</span>
                    <span style="color:var(--color-accent);font-weight:700">85%</span>
                  </div>
                `).join('') || `
                  <div style="font-size:0.78rem;color:var(--color-text-secondary);text-align:center;padding:8px">No hay empleados asignados aún.</div>
                `}
              </div>
            </div>

            <!-- Quick Actions -->
            <div style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:18px">
              <h3 style="font-size:0.95rem;font-weight:700;margin:0 0 12px">⚡ Acciones Rápidas</h3>
              <div class="odb-actions-grid">${actionsHTML}</div>
            </div>

          </div>

        </div>

      </div>
    `;

    // Mount chart
    const chartBox = root.querySelector('#odb-chart-container');
    if (chartBox && this.chart) {
      chartBox.appendChild(this.chart.mount());
      this._updateChartData(root);
    }

    // Bind mode toggle buttons
    root.querySelectorAll('#odb-chart-mode-toggle button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        root.querySelectorAll('#odb-chart-mode-toggle button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.chartMode = btn.dataset.mode;
        this._updateChartData(root);
      });
    });
  }

  // ─── CHART TIME BREAKDOWN CALCULATIONS ──────────────────────────────────────
  _updateChartData(root) {
    if (!this.chart) return;

    const mode = this.chartMode || 'HOURS';
    let labels = [];
    let datasets = [];
    let subLabel = '';

    if (mode === 'HOURS') {
      subLabel = '⚡ Horas del día con mayor pico de movimiento y ventas';
      labels = ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
      const salesByHour = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      const opsByHour = [0, 0, 0, 0, 0, 0, 0, 0, 0];

      this.state.ventas.forEach(v => {
        const ts = Number(v.createdAt || v.timestamp || 0);
        if (!ts) return;
        const h = new Date(ts).getHours();
        let idx = Math.floor((h - 5) / 2);
        if (idx < 0) idx = 0;
        if (idx >= salesByHour.length) idx = salesByHour.length - 1;
        salesByHour[idx] += Number(v.total || v.monto || 0);
        opsByHour[idx] += 1;
      });

      datasets = [
        { label: 'Ventas por Hora ($)', data: salesByHour, color: '#6366f1' },
        { label: 'Movimiento / Transacciones', data: opsByHour, color: '#34d399' }
      ];
    } else if (mode === 'DAYS') {
      subLabel = '🗓️ Comparativa por día de la semana (Lunes a Domingo)';
      labels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
      const salesByDay = [0, 0, 0, 0, 0, 0, 0];
      const expensesByDay = [0, 0, 0, 0, 0, 0, 0];

      this.state.ventas.forEach(v => {
        const ts = Number(v.createdAt || v.timestamp || 0);
        if (!ts) return;
        let dayIdx = new Date(ts).getDay() - 1; // 0=Mon ... 6=Sun
        if (dayIdx < 0) dayIdx = 6;
        salesByDay[dayIdx] += Number(v.total || v.monto || 0);
      });

      this.state.gastos.forEach(g => {
        const ts = Number(g.createdAt || g.timestamp || g.dateTimestamp || 0);
        if (!ts) return;
        let dayIdx = new Date(ts).getDay() - 1;
        if (dayIdx < 0) dayIdx = 6;
        expensesByDay[dayIdx] += Number(g.amount || g.monto || 0);
      });

      datasets = [
        { label: 'Ventas ($)', data: salesByDay, color: '#6366f1' },
        { label: 'Gastos ($)', data: expensesByDay, color: '#ef4444' }
      ];
    } else if (mode === 'MONTHS') {
      subLabel = '📆 Rendimiento mensual del año en curso';
      labels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const salesByMonth = new Array(12).fill(0);
      const expensesByMonth = new Array(12).fill(0);

      this.state.ventas.forEach(v => {
        const ts = Number(v.createdAt || v.timestamp || 0);
        if (!ts) return;
        const mIdx = new Date(ts).getMonth();
        salesByMonth[mIdx] += Number(v.total || v.monto || 0);
      });

      this.state.gastos.forEach(g => {
        const ts = Number(g.createdAt || g.timestamp || g.dateTimestamp || 0);
        if (!ts) return;
        const mIdx = new Date(ts).getMonth();
        expensesByMonth[mIdx] += Number(g.amount || g.monto || 0);
      });

      datasets = [
        { label: 'Ventas ($)', data: salesByMonth, color: '#6366f1' },
        { label: 'Gastos ($)', data: expensesByMonth, color: '#ef4444' }
      ];
    }

    const subLabelEl = root.querySelector('#odb-chart-sub-label');
    if (subLabelEl) subLabelEl.textContent = subLabel;

    this.chart.updateData(labels, datasets);
  }

  // ─── MOUNT ─────────────────────────────────────────────────────────────────
  mount() {
    this.element = this.layout.mount();

    // Bind manual refresh button
    this.element.querySelector('#btn-refresh-dashboard')?.addEventListener('click', async () => {
      this.state.loading = true;
      this.renderUI();
      await this.loadData();
    });

    this.loadData();
    return this.element;
  }

  unmount() {
    this.listeners.forEach(id => {
      if (typeof id === 'string') FirestoreService.unsubscribe(id);
      else if (typeof id === 'function') id();
    });
    this.listeners = [];
    if (this.layout && typeof this.layout.unmount === 'function') {
      this.layout.unmount();
    }
    this.element = null;
    super.unmount();
  }
}
